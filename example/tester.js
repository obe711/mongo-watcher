/**
 * Updates a document in the watched collection
*/
const { MongoClient } = require("mongodb");

// Config
const url = "mongodb://localhost:27017";
const db = "stresstest";
const collection = "dev";

// Update
const firstName = "Ben";


MongoClient.connect(url, async function (err, client) {
  // Watched collection
  const col = client.db(db).collection(collection);
  // Find and update document
  col.findOneAndUpdate({}, { $set: { firstName, lastName: "Klopfenstein", email: "obe711@gmail.com" } }, (err, res) => {
    if (err) console.error(err);
    console.log(res, "updated");
    client.close();
  })
});