const follow = require('../api')
var opts = {}; // Same options paramters as before
var feed = new follow.Feed(opts);

// You can also set values directly.
feed.url = "mongodb://localhost:27017";
feed.db = "stresstest";
feed.col = "dev";
feed.heartbeat = 30 * 1000
feed.inactivity_ms = 86400 * 1000;



feed.on('change', function (change) {
  if (Array.isArray(change) && change.length > 0) {
    console.log('Doc(s) ' + [...change].map(doc => doc._id) + ' has changed');
    console.log(change)
  }
})

feed.on('error', function (er) {
  console.error('Since Follow always retries on errors, this must be serious');
  throw er;
})

feed.follow();