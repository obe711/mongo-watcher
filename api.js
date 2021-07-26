/**
 * The MIT License (MIT)
* 
* Copyright (c) 2021 Obediah Benjamin Klopfenstein
* Mongo Follow API - Node JS
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

const feed = require('./lib/feed');
const stream = require('./lib/stream')

function follow_feed(opts, cb) {
  var ch_feed = new feed.Feed(opts);
  ch_feed.on('error', function (er) { return cb && cb.call(ch_feed, er) });
  ch_feed.on('change', function (ch) { return cb && cb.call(ch_feed, null, ch) });

  // Give the caller a chance to hook into any events.
  process.nextTick(function () {
    ch_feed.follow();
  })

  return ch_feed;
}

module.exports = follow_feed;
module.exports.Feed = feed.Feed;
module.exports.Changes = stream.Changes
