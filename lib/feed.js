/**
 * The MIT License (MIT)
* 
* Copyright (c) 2021 Obediah Benjamin Klopfenstein
* Mongo Follower - Node JS
* 
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
* 
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
* 
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/

const { MongoClient } = require('mongodb');
const { Readable } = require('stream')
const lib = require('../lib')
const util = require('util')
const events = require('events')
const Changes = require('./stream').Changes

// Use the library timeout functions, primarily so the test suite can catch errors.
const setTimeout = lib.setTimeout, clearTimeout = lib.clearTimeout

const DEFAULT_HEARTBEAT = 30000;
const HEARTBEAT_TIMEOUT_COEFFICIENT = 1.25; // E.g. heartbeat 1000ms would trigger a timeout after 1250ms of no heartbeat.
const DEFAULT_MAX_RETRY_SECONDS = 60 * 60;
const INITIAL_RETRY_DELAY = 1000;
const RESPONSE_GRACE_TIME = 5000;

const FEED_PARAMETERS = ['limit', 'feed', 'heartbeat', 'include_docs', 'view', 'style', 'conflicts', 'attachments'];

const EventEmitter = events.EventEmitter2 || events.EventEmitter;


util.inherits(Feed, EventEmitter);
function Feed(opts) {
  const self = this;
  EventEmitter.call(self);

  opts = opts || {}

  self.feed = 'continuous';
  self.heartbeat = opts.heartbeat || DEFAULT_HEARTBEAT;
  self.max_retry_seconds = opts.max_retry_seconds || DEFAULT_MAX_RETRY_SECONDS;
  self.inactivity_ms = null;
  self.initial_retry_delay = opts.initial_retry_delay || INITIAL_RETRY_DELAY;
  self.response_grace_time = opts.response_grace_time || RESPONSE_GRACE_TIME;

  self.headers = {};
  self.request = opts.request || {} // Extra options for potentially future versions of request. The caller can supply them.
  self.is_paused = false
  self.caught_up = false
  self.retry_delay = self.initial_retry_delay;

  self.query_params = {}; // Extra `req.query` values for filter functions

  if (typeof opts === 'string')
    opts = { 'db': opts };

  Object.keys(opts).forEach(function (key) {
    if (typeof self[key] !== 'function')
      self[key] = opts[key];
  })

  self.pending = {
    request: null, activity_at: null
  };
} // Feed


Feed.prototype.follow = function follow_feed() {
  const self = this;

  self.url = self.url || self.uri
  delete self.uri

  self.db_name = self.db || self.db_name
  delete self.db

  self.col_name = self.col || self.col_name
  delete self.col

  if (!self.url)
    throw new Error('Database URL required');

  if (!self.db_name)
    throw new Error('Database name required');

  if (!self.col_name)
    throw new Error('Collection name required');

  if (self.feed !== 'continuous' && self.feed !== 'longpoll')
    throw new Error('The only valid feed options are "continuous" and "longpoll"');

  if (typeof self.heartbeat !== 'number')
    throw new Error('Required "heartbeat" value');

  self.log = lib.log4js.getLogger('mongo');
  self.log.setLevel(process.env.follow_log_level || "info");

  self.emit('start');
  return self.confirm();
}

Feed.prototype.confirm = async function confirm_feed() {
  const self = this;

  const confirm_timeout = self.heartbeat * 3; // Give it time to look up the name, connect, etc.
  const timeout_id = setTimeout(function () {
    return self.die(new Error('Timeout confirming ' + self.db));
  }, confirm_timeout);

  self.client = await MongoClient.connect(self.url);

  self.col = await self.client.db(self.db_name).collection(self.col_name);

  const updated = await self.checkIfUpdated();

  if (updated) {
    self.col.find({}).sort({ updatedAt: 1 }).toArray((err, docs) => {
      if (err) new Error('Mongo connection error')
      return db_response(null, self.docs)
    })
  }

  function db_response(er, docs) {
    clearTimeout(timeout_id);
    if (er)
      return self.die(er);

    self.emit('confirm', docs);

    return self.query();
  }
}

Feed.prototype.checkIfUpdated = async function check_change() {
  const self = this;
  const stats = await self.col.stats();
  const { 'insert calls': insert, 'create calls': create, 'remove calls': remove } = stats.wiredTiger.cursor;
  if (self.colState?.insert !== insert || self.colState?.create !== create || self.colState?.remove !== remove) {
    self.colState = { insert, create, remove };
    return true
  }
  return false
}

Feed.prototype.query = async function query_feed() {
  const self = this;

  const now = new Date;
  const feed_ts = lib.JDUP(now);
  const feed_id = process.env.follow_debug ? feed_ts.match(/\.(\d\d\d)Z$/)[1] : feed_ts;

  const updated = await self.checkIfUpdated();

  if (updated) {
    return self.col.find({}).sort({ updatedAt: 1 }).toArray((err, docs) => {
      if (err) new Error('Mongo connection error')
      return on_feed_response(null, docs)
    })
  } else return on_feed_response(null, [])

  async function on_feed_response(er, docs) {
    const responseStream = await Readable.from(lib.JS(docs));
    if (er) {
      self.log.debug('Request error ' + feed_id + ': ' + er.stack);
      return self.retry();
    }

    self.retry_delay = self.initial_retry_delay;

    self.emit('response', docs);

    const changes_stream = new Changes
    changes_stream.log = lib.log4js.getLogger('stream ' + self.url)
    changes_stream.log.setLevel(self.log.level.levelStr)
    changes_stream.feed = self.feed
    responseStream.pipe(changes_stream)

    changes_stream.created_at = now
    changes_stream.id = function () { return feed_id }
    return self.prep(changes_stream)
  }
}

Feed.prototype.prep = function prep_request(changes_stream) {
  const self = this;

  const now = new Date;
  self.pending.request = changes_stream;
  self.pending.activity_at = now;
  self.pending.wait_timer = null;

  // Just re-run the pause or resume to do the needful on changes_stream (self.pending.request).
  if (self.is_paused)
    self.pause()
  else
    self.resume()

  // The inactivity timer is for time between *changes*, or time between the
  // initial connection and the first change. Therefore it goes here.
  self.change_at = now;
  if (self.inactivity_ms) {
    clearTimeout(self.inactivity_timer);
    self.inactivity_timer = setTimeout(function () { self.on_inactivity() }, self.inactivity_ms);
  }

  changes_stream.on('heartbeat', handler_for('heartbeat'))
  changes_stream.on('error', handler_for('error'))
  changes_stream.on('data', handler_for('data'))
  changes_stream.on('end', handler_for('end'))

  return self.wait();

  function handler_for(ev) {
    const name = 'on_couch_' + ev;
    const inner_handler = self[name];


    return handle_confirmed_req_event;
    function handle_confirmed_req_event() {
      if (self.pending.request === changes_stream)
        return inner_handler.apply(self, arguments);

      if (!changes_stream.created_at)
        return self.die(new Error("Received data from unknown request")); // Pretty sure this is impossible.

      const s_to_now = (new Date() - changes_stream.created_at) / 1000;
      const s_to_req = '[no req]';
      if (self.pending.request)
        s_to_req = (self.pending.request.created_at - changes_stream.created_at) / 1000;

      const msg = ': ' + changes_stream.id() + ' to_req=' + s_to_req + 's, to_now=' + s_to_now + 's';

      if (ev == 'end' || ev == 'data' || ev == 'heartbeat') {
        self.log.debug('Old "' + ev + '": ' + changes_stream.id())
        return changes_stream
      }
      self.log.warn('Old "' + ev + '"' + msg);
    }
  }
}

Feed.prototype.wait = function wait_for_event() {
  const self = this;

  self.emit('wait');

  if (self.pending.wait_timer)
    return self.die(new Error('wait() called but there is already a wait_timer: ' + self.pending.wait_timer));

  const timeout_ms = self.heartbeat * HEARTBEAT_TIMEOUT_COEFFICIENT;
  const req_id = self.pending.request && self.pending.request.id()
  let msg = 'Req ' + req_id + ' timeout=' + timeout_ms;
  if (self.inactivity_ms)
    msg += ', inactivity=' + self.inactivity_ms;
  msg += ': ' + self.db_safe;

  self.log.debug(msg);
  self.pending.wait_timer = setTimeout(function () { self.on_timeout() }, timeout_ms);
}

Feed.prototype.got_activity = function () {
  const self = this

  if (self.dead)
    return

  //
  // We may not have a wait_timer so just clear it and null it out if it does
  // exist
  //
  clearTimeout(self.pending.wait_timer)
  self.pending.wait_timer = null
  self.pending.activity_at = new Date
}


Feed.prototype.pause = function () {
  const self = this;
  const was_paused = self.is_paused;

  // Emit pause after pausing the stream, to allow listeners to react.
  self.is_paused = true
  if (self.pending && self.pending.request && self.pending.request.pause)
    self.pending.request.pause()
  else
    self.log.warn('No pending request to pause')

  if (!was_paused)
    self.emit('pause')
}

Feed.prototype.resume = function () {
  const self = this;
  const was_paused = self.is_paused;

  // Emit resume before resuming the data feed, to allow listeners to prepare.
  self.is_paused = false
  if (was_paused)
    self.emit('resume')

  if (self.pending && self.pending.request && self.pending.request.resume)
    self.pending.request.resume()
  else
    self.log.warn('No pending request to resume')
}


Feed.prototype.on_couch_heartbeat = function on_couch_heartbeat() {
  const self = this

  self.got_activity()
  if (self.dead)
    return self.log.debug('Skip heartbeat processing for dead feed')

  self.emit('heartbeat')

  if (self.dead)
    return self.log.debug('No wait: heartbeat listener stopped this feed')
  self.wait()
}

Feed.prototype.on_couch_data = function on_couch_data(change) {
  const self = this;
  self.log.debug('Data from ' + self.pending.request.id());

  self.got_activity()
  if (self.dead)
    return self.log.debug('Skip data processing for dead feed')

  // The changes stream guarantees that this data is valid JSON.
  change = JSON.parse(change)

  self.on_change(change)

  // on_change() might work its way all the way to a "change" event, and the listener
  // might call .stop(), which means among other things that no more events are desired.
  // The die() code sets a self.dead flag to indicate this.
  if (self.dead)
    return self.log.debug('No wait: change listener stopped this feed')
  self.wait()
}

Feed.prototype.on_timeout = function on_timeout() {
  const self = this;
  if (self.dead)
    return self.log.debug('No timeout: change listener stopped this feed');

  self.log.debug('Timeout')

  const now = new Date;
  const elapsed_ms = now - self.pending.activity_at;

  self.emit('timeout', { elapsed_ms: elapsed_ms, heartbeat: self.heartbeat, id: self.pending.request.id() });

  self.retry()
}

Feed.prototype.retry = function retry() {
  const self = this;

  clearTimeout(self.pending.wait_timer);
  self.pending.wait_timer = null;

  self.retry_timer = setTimeout(function () { self.query() }, self.retry_delay);

  const max_retry_ms = self.max_retry_seconds * 1000;
  self.retry_delay *= 2;
  if (self.retry_delay > max_retry_ms)
    self.retry_delay = max_retry_ms;
}

Feed.prototype.on_couch_end = function on_couch_end() {
  const self = this;

  self.log.debug('Changes feed ended ' + self.pending.request.id());
  self.pending.request = null;
  return self.retry();
}

Feed.prototype.on_couch_error = function on_couch_error(er) {
  const self = this;

  self.log.debug('Changes query eror: ' + lib.JS(er.stack));
  return self.retry();
}

Feed.prototype.stop = function (val) {
  const self = this
  self.log.debug('Stop')

  // Die with no errors.
  self.die()
  self.emit('stop', val);
}

Feed.prototype.die = function (er) {
  const self = this;

  if (er)
    self.log.fatal('Fatal error: ' + er.stack);

  // Warn code executing later that death has occured.
  self.dead = true

  clearTimeout(self.retry_timer)
  clearTimeout(self.inactivity_timer)
  clearTimeout(self.pending.wait_timer)

  self.inactivity_timer = null
  self.pending.wait_timer = null

  const req = self.pending.request;
  self.pending.request = null;


  if (er)
    self.emit('error', er);
}

Feed.prototype.on_change = function on_change(change) {
  const self = this;

  if (typeof self.filter !== 'function')
    return self.on_good_change(change);

  const req = lib.JDUP({ 'query': self.pending.request.changes_query });
  let filter_args;


  if (!change.doc)
    return self.die(new Error('Internal filter needs .doc in change ' + change.seq));

  // Don't let the filter mutate the real data.
  const doc = lib.JDUP(change.doc);
  filter_args = [doc, req];

  const result = false;
  try {
    result = self.filter.apply(null, filter_args);
  } catch (er) {
    self.log.debug('Filter error', er);
  }

  result = (result && true) || false;
  if (result) {
    self.log.debug('Builtin filter PASS for change: ' + change);
    return self.on_good_change(change);
  } else {
    self.log.debug('Builtin filter FAIL for change: ' + change);

    // Even with a filtered change, a "catchup" event might still be appropriate.
    self.check_for_catchup(change.seq)
  }
}

Feed.prototype.on_good_change = function on_good_change(change) {
  const self = this;

  if (self.inactivity_ms && !self.inactivity_timer)
    return self.die(new Error('Cannot find inactivity timer during change'));

  clearTimeout(self.inactivity_timer);
  self.inactivity_timer = null;
  if (self.inactivity_ms)
    self.inactivity_timer = setTimeout(function () { self.on_inactivity() }, self.inactivity_ms);

  self.change_at = new Date;

  self.emit('change', change);

  self.check_for_catchup(change.seq)
}

Feed.prototype.check_for_catchup = function check_for_catchup(seq) {
  const self = this

  if (self.is_db_updates)
    return
  if (self.caught_up)
    return
  if (seq < self.original_db_seq)
    return

  self.caught_up = true
  self.emit('catchup', seq)
}

Feed.prototype.on_inactivity = function on_inactivity() {
  const self = this;
  const now = new Date;
  const elapsed_ms = now - self.change_at;
  const elapsed_s = elapsed_ms / 1000;
  // Since this is actually not fatal, lets just totally reset and start a new
  // request, JUST in case something was bad.
  //
  self.log.debug('Req ' + self.pending.request.id() + ' made no changes for ' + elapsed_s + 's');
  return self.restart();
}

Feed.prototype.restart = function restart() {
  const self = this

  self.emit('restart')

  // Kill ourselves and then start up once again
  self.stop()
  self.dead = false
  self.start()
}

module.exports = {
  "Feed": Feed
};


