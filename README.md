# Follow: MongoDB changes and db updates notifier for NodeJS - With out Replication

[![build
status](https://secure.travis-ci.org/obe711/mongo-watcher.png)](http://travis-ci.org/obe711/mongo-watcher)

Mongo Watcher comes from a tool for updating configuration files on multiple servers by simply updating a MongoDB database. By importing a simple module into each app, configuration files, API keys and env files can be automatically updated by changing values in a central configuration collection. The module will watch for changes and update configurations automatically. This is all accomplished without using Mongo's watch and streaming API that requires your instance to be a Replica Set.

## Example

This looks much like the [request][req] API.

```javascript
const follow = require("mongo-watcher");
follow("mongodb://localhost:27017", function (error, change) {
  if (!error) {
    console.log("GoogleApiKey " + change._id + " Updated");
  }
});
```

The _error_ parameter to the callback will basically always be `null`.

## Objective

The API must be very simple: notify me every time a change happens in the DB. Also, never fail.

If an error occurs, Watcher will internally retry without notifying your code.

Specifically, this should be possible:

1. Begin a changes feed. Get a couple of change callbacks
2. Shut down MongoDB
3. Go home. Have a nice weekend. Come back on Monday.
4. Start MongoDB
5. Make a couple more changes
6. Get a couple more change callbacks

## Failure Mode

If MongoDB permanently crashes, there is an option of failure modes:

- **Default:** Simply never call back with a change again
- **Optional:** Specify an _inactivity_ timeout. If no changes happen by the timeout, Watcher will signal an error.

For each change, Watcher will emit a `change` event containing:

- `_id`, `createdAt`, `updatedAt` as well as the changed document(s)
- `db_name`: Name of the database where the change occoured.
- `ok`: Event operation status (boolean).

### Simple API: follow(options, callback)

The first argument is an options object. The only required options are `url`, `db` and `col`.

```javascript
follow(
  { url: "mongodb://localhost:27017", include_docs: true },
  function (error, change) {
    if (!error) {
      console.log(
        "Change " +
          change._id +
          " has " +
          Object.keys(change.doc).length +
          " fields"
      );
    }
  }
);
```

<a name="options"></a>
This module uses the MongoDB NodeJs. See https://docs.mongodb.com/drivers/node/current.

- `url` | Fully-qualified URL or connection string of the MongoDB database. (Basic auth URLs are ok.)
- `heartbeat` | Milliseconds within which MongoDB must respond (default: **30000** or 30 seconds)
- `feed` | **Optional but only "continuous" is allowed**

Besides the MongoDB options, more are available:

- `inactivity_ms` | Maximum time to wait between **changes**. Omitting this means no maximum.
- `max_retry_seconds` | Maximum time to wait between retries (default: 360 seconds)
- `initial_retry_delay` | Time to wait before the first retry, in milliseconds (default 1000 milliseconds)
- `response_grace_time` | Extra time to wait before timing out, in milliseconds (default 5000 milliseconds)

## Object API

The main API is a thin wrapper around the EventEmitter API.

```javascript
const follow = require("mongo-watcher");

var opts = {}; // Same options paramters as before
var feed = new follow.Feed(opts);

// You can also set values directly.
feed.url = "mongodb://localhost:27017";
feed.db = "configurations";
feed.col = "aipkeys";
feed.heartbeat = 30 * 1000;
feed.inactivity_ms = 86400 * 1000;

feed.on("change", function (change) {
  console.log(
    "Doc " + change._id + " named " + change.title + " has been updated"
  );
});

feed.on("error", function (er) {
  console.error("Since Watcher always retries on errors, this must be serious");
  throw er;
});

feed.follow();
```

<a name="pause"></a>

## Pause and Resume

A Follow feed is a Node.js stream. If you get lots of changes and processing them takes a while, use `.pause()` and `.resume()` as needed. Pausing guarantees that no new events will fire. Resuming guarantees you'll pick up where you left off.

```javascript
follow("mongodb://localhost:27017", function (error, change) {
  const feed = this;

  if (change._id == 1) {
    console.log(
      "Uh oh. The first change takes 30 hours to process. Better pause."
    );
    feed.pause();
    setTimeout(function () {
      feed.resume();
    }, 30 * 60 * 60 * 1000);
  }

  // ... 30 hours with no events ...
  else console.log("No need to pause for normal change: " + change._id);
});
```

<a name="events"></a>

## Events

The feed object is an EventEmitter. There are a few ways to get a feed object:

- Use the object API above
- Use the return value of `follow()`
- In the callback to `follow()`, the _this_ variable is bound to the feed object.

Once you've got one, you can subscribe to these events:

- **start** | Before any i/o occurs
- **confirm_request** | `function(client)` | The database confirmation request is sent with the MongoClient Class;
- **confirm** | `function(db_obj)` | The database is confirmed; passed the client database object
- **change** | `function(change)` | A change occured; passed the change object from MongoDB
- **wait** | Follow is idle, waiting for the next data chunk from MongoDB
- **timeout** | `function(info)` | Follow did not receive a heartbeat from MongoDB in time. The passed object has `.elapsed_ms` set to the elapsed time
- **retry** | `function(info)` | A retry is scheduled (usually after a timeout or disconnection). The passed object has
  - `.after` the milliseconds to wait before the request occurs (on an exponential fallback schedule)
  - `.url` the database url
- **stop** | The feed is stopping, because of an error, or because you called `feed.stop()`
- **error** | `function(err)` | An error occurs

## Error conditions

Watcher is happy to retry over and over, for all eternity. It will only emit an error if it thinks your whole application might be in trouble.

- _DB confirmation_ failed: Follow confirms the DB with a preliminary query, which must reply properly.
- _DB is deleted_: Even if it retried, subsequent sequence numbers would be meaningless to your code.
- _Your inactivity timer_ expired: This is a last-ditch way to detect possible errors. What if MongoDB is sending heartbeats just fine, but nothing has changed for 24 hours? You know that for your app, 24 hours with no change is impossible. Maybe your filter has a bug? Maybe you queried the wrong DB? Whatever the reason, Watcher will emit an error.
- JSON parse error, which should be impossible from MongoDB
- Invalid change object format, which should be impossible from MongoDB
- Internal error, if the internal state seems wrong, e.g. cancelling a timeout that already expired, etc. Follow tries to fail early.

## Tests

Follow uses [node-tap][tap]. If you clone this Git repository, tap is included.

    $ ./node_modules/.bin/tap test/*.js test/issues/*.js
    ok test/mongo.js ...................................... 11/11
    ok test/follow.js ..................................... 69/69
    ok test/issues.js ..................................... 44/44
    ok test/stream.js ................................... 300/300
    ok test/issues/10.js .................................. 11/11
    total ............................................... 435/435

    ok

## License

MIT

[req]: https://github.com/mikeal/request
[tap]: https://github.com/isaacs/node-tap
