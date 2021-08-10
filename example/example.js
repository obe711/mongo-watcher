const follow = require('../api')
const opts = {}; // Same options paramters as before
const feed = new follow.Feed(opts);

// You can also set values directly.
feed.url = "mongodb://localhost:27017";
feed.db = "watchedDB";
feed.col = "watchedCOL";
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