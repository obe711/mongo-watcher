/**
 * Updates a document in the watched collection
*/
const { MongoClient } = require("mongodb");

// Config
const url = "mongodb://localhost:27017";
const db = "watchedDB";
const collection = "watchedCOL";

// Update - Change this before running test script
const firstName = "Ben";


const client = new MongoClient(url);

(async () => {
  try {
    await client.connect();

    const database = client.db(db);

    const col = database.collection(collection);

    const result = await col.findOneAndUpdate({}, { $set: { firstName, lastName: "Klopfenstein", email: "obe711@gmail.com" } })

    console.log(result, "updated");

  } catch (ex) {

    console.error('Ooops', ex);

  } finally {

    await client.close();

  }
})();