
const { MongoClient } = require("mongodb");
const url = "mongodb://localhost:27017";
const db = "stresstest";
const collection = "dev";

// Replace the following with your MongoDB deployment's connection
// string.
//const url = "mongodb://localhost:27017/watchExample";



MongoClient.connect(url, async function (err, client) {
  // Create a collection we want to drop later
  const col = client.db(db).collection(collection);
  // Show that duplicate records got droppe
  col.findOneAndUpdate({}, { $set: { firstName: "fddf", lastName: "neal", email: "fsdddd" } }, (err, res) => {
    if (err) console.error(err);
    console.log(res, "updated");
    client.close();
  })
});