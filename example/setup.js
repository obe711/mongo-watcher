/**
 * Create watched db & collection
*/
const { MongoClient } = require("mongodb");

// Config
const url = "mongodb://localhost:27017";
const db = "watchedDB";
const collection = "watchedCOL";


const client = new MongoClient(url);

(async () => {
  try {

    await client.connect();

    const database = client.db(db);

    const col = database.collection(collection);

    const found = col.find({});

    if ((await found.count()) !== 0) {
      console.log("Documents found! - Delete docs");

      col.deleteMany({});
    }

    const docs = [

      { firstName: "Ben", lastName: "Klopfenstein", email: "obe711@gmail.com" },

      { firstName: "Billy", lastName: "Gates", email: "bill@aol.com" },

      { firstName: "Stevey", lastName: "Jobs", email: "steve@juno.com" },

    ];


    const options = { ordered: true };

    const result = await col.insertMany(docs, options);

    console.log(`${result.insertedCount} example documents were inserted`);

  } catch (ex) {

    console.error('Ooops', ex);

  } finally {

    await client.close();

  }
})();

