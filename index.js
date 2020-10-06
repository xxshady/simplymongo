import mongodb from 'mongodb';

const MongoClient = mongodb.MongoClient;
const ObjectID = mongodb.ObjectID;

let instance;
let onReadyCallbacks = [];

/**
 * @module simplymongo
 */

/**
 * Single use event that registers a callback for onReady.
 * Load all other functions, imports, etc. after this is ready.
 *
 * @param  {Function} callback
 */
export function onReady(callback) {
    if (typeof callback !== 'function') {
        throw new Error(`Function for callback onReady is not a function.`);
    }

    const index = onReadyCallbacks.findIndex((func) => func === callback);
    if (index !== -1) {
        throw new Error(`Function already exists in callback.`);
    }

    onReadyCallbacks.push(callback);
}

/**
 * Return an instance of the Database after Database is ready.
 *
 * @return {Database} Singleton of your Database Connection
 */
export function getDatabase() {
    if (!instance) {
        throw new Error('Create a Database instance first.');
    }

    return instance;
}

export class Database {
    /**
     * Create a Database Connection
     * @param  {string} url mongodb://localhost:27017
     * @param  {string} databasename Name of the database to store collections.
     * @param  {Array<string>} collections Collections to create.
     * @param  {string | null} username=null
     * @param  {string | null} password=null
     */
    constructor(url, databasename, collections = [], username = null, password = null) {
        if (instance) {
            return instance;
        }

        this.establishingConnection = true;

        /** @type {mongodb.MongoClient} */
        this.client = null;
        this.collections = collections;
        this.databaseName = databasename;

        if (username && password) {
            console.log(`[MongoDB] Establishing connection with username and password.`);
            this.client = new MongoClient(url, {
                useUnifiedTopology: true,
                useNewUrlParser: true,
                auth: {
                    user: username,
                    password: password,
                },
            });
        } else {
            console.log(`[MongoDB] Establishing connection without using a username or password.`);
            this.client = new MongoClient(url, {
                useUnifiedTopology: true,
                useNewUrlParser: true,
            });
        }

        this.establishConnection();
    }

    async establishConnection() {
        await this.client.connect().catch((err) => {
            if (err) {
                console.log(err);
                console.error(`[MongoDB] Failed to establish connection to database. Did you specify the correct url?`);
                process.exit(1);
            }
        });

        this.db = this.client.db(this.databaseName);
        this.generateCollections();
        instance = this;

        for (let i = 0; i < onReadyCallbacks.length; i++) {
            onReadyCallbacks[i]();
        }
    }

    /**
     * Used to generate collections.
     */
    async generateCollections() {
        if (this.collections.length <= 0) {
            console.log(`[MongoDB] No collections were specified for creation.`);
            return;
        }

        for (let i = 0; i < this.collections.length; i++) {
            const collectionName = this.collections[i];
            await this.db.createCollection(collectionName).then(() => {
                console.log(`[MongoDB] Created new collection '${collectionName}'`);
            }).catch((e) => {
                console.log(`[MongoDB] Collection '${collectionName}' exists. (${e.code}: ${e.codeName})`);
            });
        }

        console.log(`[MongoDB] Connection Complete! Utilizing ${this.collections.length} collections.`);
    }

    /**
     * @param {string} fieldName Field we want to select.
     * @param {any} fieldValue Field value we want to find.
     * @param {string} collection Name of the collection.
     * @returns {Promise<T | null>} A single document.
     * @template T
     */
    async fetchData(fieldName, fieldValue, collection) {
        if (fieldName === '_id') {
            fieldValue = new ObjectID(fieldValue);
        }

        const result = await this.db.collection(collection).findOne({ [fieldName]: fieldValue });
        return result;
    }

    /**
     * Fetch all with a specific field and a specific value.
     * @param {string} fieldName Field we want to modify.
     * @param {any} fieldValue Field value we want to find.
     * @param {string} collection Name of the collection.
     * @returns {Promise<Array<T>>} An array of documents.
     * @template T
     */
    async fetchAllByField(fieldName, fieldValue, collection) {
        if (fieldName === '_id') {
            fieldValue = new ObjectID(fieldValue);
        }

        const results = await this.db
            .collection(collection)
            .find({ [fieldName]: fieldValue })
            .toArray();

        if (results.length <= 0) {
            return [];
        }

        return results;
    }

    /**
     * Insert a document and return the ID.
     * @param {T} document
     * @param {string} collection
     * @param {boolean} returnDocument
     * @returns {Promise<T | null>} Document
     * @template T
     */
    async insertData(document, collection, returnDocument = false) {
        const newDocument = await this.db.collection(collection).insertOne(document);
        const id = newDocument.insertedId;

        if (!returnDocument) {
            return null;
        }

        return await this.db.collection(collection).findOne({ _id: ObjectID(id) });
    }

    /**
     * Update an ID in the database partially.
     * @param {string} id
     * @param {T} partialObjectData
     * @param {string} collection
     * @returns {boolean}
     * @template T
     */
    async updatePartialData(id, partialObjectData, collection) {
        try {
            await this.db
                .collection(collection)
                .findOneAndUpdate({ _id: ObjectID(id) }, { $set: { ...partialObjectData } });

            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    /**
     * Delete data by id.
     * @param {string} id
     * @param {string} collection
     * @returns {boolean}
     */
    async deleteById(id, collection) {
        try {
            await this.db.collection(collection).findOneAndDelete({ _id: ObjectID(id) });
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Fetch all data in a collection.
     * @param {string} collection
     * @returns {Promise<Array<T>>}
     * @template T
     */
    async fetchAllData(collection) {
        return await this.db.collection(collection).find().toArray();
    }

    /**
     * Select specific fields from the collection; and return all data.
     * @param {string} collection
     * @param {Array<string>} fieldNames
     * @returns {Array<T>}
     * @template T
     */
    async selectData(collection, fieldNames) {
        const selectData = {
            _id: 1,
        };

        fieldNames.forEach((name) => {
            selectData[name] = 1;
        });

        return await this.db
            .collection(collection)
            .find({})
            .project({ ...selectData })
            .toArray();
    }

    /**
     * Update partial data based on other parameters.
     * @param {string} fieldName The field name.
     * @param {string} fieldValue The field value to update based on fieldName.
     * @param {T} partialObjectData An object of data to update.
     * @param {string} collection
     * @template T
     */
    async updateDataByFieldMatch(fieldName, fieldValue, partialObjectData, collection) {
        if (fieldName === '_id') {
            fieldValue = ObjectID(fieldValue);
        }

        await this.db
            .collection(collection)
            .findOneAndUpdate({ [fieldName]: fieldValue }, { $set: { ...partialObjectData } });
    }

    /**
     *
     * @param {string} oldValue
     * @param {string} fieldName
     * @param {any} fieldValue
     * @param {string} collection
     */
    async replaceField(oldValue, fieldName, fieldValue, collection) {
        await this.db
            .collection(collection)
            .updateMany({ [fieldName]: oldValue }, { $set: { [fieldName]: fieldValue } });
    }
}
