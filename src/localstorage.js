'use strict';

import Backbone   from 'backbone';

/**
 * An ES6 module to replace `Backbone.sync` with browser `localStorage`-based persistence. Models are given GUIDS
 * and saved into a JSON object. Please see
 * [./dist](https://github.com/typhonjs/typhonjs-core-backbone-localstorage/tree/master/dist) for ES5 bundles for AMD,
 * CJS, UMD and global consumption.
 *
 * ## Usage
 *
 * The recommended way to consume `typhonjs-core-backbone-localstorage` is via JSPM / SystemJS via an ES6 project.
 *
 * Please see this JSPM / SystemJS / ES6 demo:
 * [backbone-es6-localstorage-todos](https://github.com/typhonjs-demos/backbone-es6-localstorage-todos)
 *
 * In addition there is a desktop version using [Electron](http://electron.atom.io/) here:
 * [electron-backbone-es6-localstorage-todos](https://github.com/typhonjs-demos/electron-backbone-es6-localstorage-todos)
 *
 * ------
 *
 * Global usage - Include the global ES6 bundle for Backbone.localStorage after having included Backbone.js:
 *
 * ```html
 * <script type="text/javascript" src="backbone.js"></script>
 * <script type="text/javascript" src="typhonjs-core-backbone-localstorage.js"></script>
 * ```
 *
 * Create your collections like so:
 *
 * ```javascript
 * window.SomeCollection = Backbone.Collection.extend({
 *
 *    localStorage: new Backbone.LocalStorage("SomeCollection"), // Unique name within your app.
 *
 *    // ... everything else is normal.
 *
 * });
 * ```
 *
 * If needed, you can use the default `Backbone.sync` (instead of local storage) by passing the `origSync` option flag
 * to any Backbone function that takes optional parameters, for example:
 *
 * ```javascript
 * var myModel = new SomeModel();
 * myModel.fetch({ origSync: true });
 * myModel.save({ new: "value" }, { origSync: true });
 * ```
 *
 * Please see this global ES5 demo:
 * [backbone-es6-localstorage-todos-global-es5](https://github.com/typhonjs-demos/backbone-es6-localstorage-todos-global-es5)
 *
 * ### RequireJS
 *
 * Include [RequireJS](http://requirejs.org):
 *
 * ```html
 * <script type="text/javascript" src="lib/require.js"></script>
 * ```
 *
 * RequireJS config:
 * ```javascript
 * require.config({
 *    paths: {
 *        jquery: "lib/jquery",
 *        underscore: "lib/underscore",
 *        backbone: "lib/backbone",
 *        localstorage: "lib/typhonjs-core-backbone-localstorage"
 *    }
 * });
 * ```
 *
 * Define your collection as a module:
 * ```javascript
 * define("SomeCollection", ["localstorage"], function() {
 *    var SomeCollection = Backbone.Collection.extend({
 *         localStorage: new Backbone.LocalStorage("SomeCollection") // Unique name within your app.
 *    });
 *
 *    return SomeCollection;
 * });
 * ```
 *
 * Require your collection:
 * ```javascript
 * require(["SomeCollection"], function(SomeCollection) {
 *  // ready to use SomeCollection
 * });
 * ```
 *
 * Please see this RequireJS ES5 demo:
 * [backbone-es6-localstorage-todos-requirejs-es5](https://github.com/typhonjs-demos/backbone-es6-localstorage-todos-requirejs-es5)
 *
 * This code was forked and updated to ES6 from:
 * [Backbone.localStorage](https://github.com/jeromegn/Backbone.localStorage)
 *
 * Original author: [Jerome Gravel-Niquet](https://github.com/jeromegn) (many thanks!)
 */
class BackboneLocalStorage
{
   /**
    * Our Store is represented by a single JS object in `localStorage`. Create it with a meaningful name, like the name
    * you would give a table.
    *
    * @param {string}   name - A unique name to use as a base ID for local storage.
    * @param {object}   serializer - JSON like object with `stringify` and `parse` methods; default: JSON.
    */
   constructor(name, serializer = JSON)
   {
      if (!localStorage) { throw new Error('Backbone.LocalStorage: Environment does not support `localStorage`.'); }

      if (typeof name !== 'string') { throw new TypeError('Backbone.LocalStorage: `name` is not a string.'); }

      if (typeof serializer !== 'object' || typeof serializer.stringify !== 'function' ||
       typeof serializer.parse !== 'function')
      {
         throw new TypeError('Backbone.LocalStorage: `serializer` does not conform to the JSON API.');
      }

      /**
       * A unique name to use as a base ID for local storage.
       * @type {string}
       */
      this.name = name;

      /**
       * An object that is compatible with `JSON`.
       * @type {Object}
       */
      this.serializer = serializer;

      const store = this.localStorage().getItem(this.name);

      /**
       * A array of IDs being tracked.
       * @type {Array}
       */
      this.records = (store && store.split(',')) || [];
   }

   /**
    * Clear `localStorage` for specific collection. Invoke `fetch` with option `{ reset: true }` afterward.
    */
   clear()
   {
      const localStorage = this.localStorage();
      const itemRegex = new RegExp(`^${this.name}-`);

      // Remove id-tracking item (e.g., 'foo').
      localStorage.removeItem(this.name);

      // Match all data items (e.g., 'foo-ID') and remove.
      for (const key in localStorage)
      {
         if (itemRegex.test(key)) { localStorage.removeItem(key); }
      }

      this.records.length = 0;
   }

   /**
    * Add a model, giving it a (hopefully)-unique GUID, if it doesn't already have an id of it's own.
    *
    * @param {object}   model - An object hash / model to create.
    * @returns {*}
    */
   create(model)
   {
      if (!model.id && model.id !== 0)
      {
         model.id = s_GUID();
         model.set(model.idAttribute, model.id);
      }

      this.localStorage().setItem(this._itemName(model.id), this.serializer.stringify(model));
      this.records.push(model.id.toString());
      this.save();

      return this.find(model);
   }

   /**
    * Delete a model from `this.data`, returning it.
    *
    * @param {object}   model - An object hash with `id` / model to destroy.
    * @returns {*}
    */
   destroy(model)
   {
      this.localStorage().removeItem(this._itemName(model.id));
      const modelId = model.id.toString();

      for (let i = 0; i < this.records.length; i++)
      {
         if (this.records[i] === modelId) { this.records.splice(i, 1); }
      }

      this.save();
      return model;
   }

   /**
    * Retrieve a model from `this.data` by id.
    *
    * @param {object}   model - An object hash with `id` / model to find.
    * @returns {number}
    */
   find(model)
   {
      const data = this.localStorage().getItem(this._itemName(model.id));
      return data && this.serializer.parse(data);
   }

   /**
    * Return the array of all models currently in storage.
    *
    * @returns {Array}
    */
   findAll()
   {
      const result = [];

      for (let data, i = 0, id; i < this.records.length; i++)
      {
         id = this.records[i];
         data = this.localStorage().getItem(this._itemName(id));
         data = data && this.serializer.parse(data);
         if (data !== null && typeof data !== 'undefined') { result.push(data); }
      }

      return result;
   }

   /**
    * Creates a unique ID concatenating the `table` name with the given `id`.
    *
    * @param {string}   id - Model ID.
    * @returns {*}
    * @private
    */
   _itemName(id)
   {
      return `${this.name}-${id}`;
   }

   /**
    * Returns the Browser `localStorage`.
    *
    * @returns {Storage}
    */
   localStorage()
   {
      return localStorage;
   }

   /**
    * Save the current state of the `Store` to `localStorage`.
    */
   save()
   {
      this.localStorage().setItem(this.name, this.records.join(','));
   }

   /**
    * Size of localStorage.
    *
    * @returns {number}
    * @private
    */
   _storageSize()
   {
      return this.localStorage().length;
   }

   /**
    * Provides the local storage sync method.
    *
    * @param {string}   method   - A string that defines the synchronization action to perform.
    * @param {object}   model    - The model or collection instance to synchronize.
    * @param {object}   options  - Optional parameters
    * @returns {Promise}
    */
   sync(method, model, options)
   {
      return s_LOCAL_SYNC(method, model, options);
   }

   /**
    * Update a model in localStorage and potentially add the model ID to `this.records` if not currently being tracked.
    *
    * @param {object}   model - The model instance to update.
    * @returns {number}
    */
   update(model)
   {
      this.localStorage().setItem(this._itemName(model.id), this.serializer.stringify(model));
      const modelId = model.id.toString();

      // Perform a !contains check.
      if (this.records.indexOf(modelId) < 0)
      {
         this.records.push(modelId);
         this.save();
      }

      return this.find(model);
   }
}

// Modify Backbone --------------------------------------------------------------------------------------------------

/**
 * Store the original sync function from Backbone.
 *
 * @type {function}
 */
Backbone.origSync = Backbone.sync;

/**
 * Returns the appropriate sync method given optional parameters requesting the default Backbone sync or if
 * the model / collection contains a valid localStorage instance the local sync method.
 *
 * @param {object}   model    - The model or collection instance to synchronize.
 * @param {object}   options  - Optional parameters
 * @returns {function}
 */
Backbone.getSyncMethod = (model, options) =>
{
   const forceOriginalSync = options && options.origSync;

   return !forceOriginalSync && (s_RESULT(model, 'localStorage') || s_RESULT(model.collection, 'localStorage')) ?
    s_LOCAL_SYNC : Backbone.origSync;
};

/**
 * Override 'Backbone.sync' to default to s_LOCAL_SYNC, the original 'Backbone.sync' is still available in
 * 'Backbone.origSync'.
 *
 * @param {string}   method   - A string that defines the synchronization action to perform.
 * @param {object}   model    - The model or collection instance to synchronize.
 * @param {object}   options  - Optional parameters
 * @returns {*}
 */
Backbone.sync = (method, model, options) =>
{
   return Backbone.getSyncMethod(model, options).apply(this, [method, model, options]);
};

/**
 * Store BackboneLocalStorage class in the instance of Backbone.
 *
 * @type {BackboneLocalStorage}
 */
Backbone.LocalStorage = BackboneLocalStorage;

/**
 * Exports the BackboneLocalStorage class.
 */
export default BackboneLocalStorage;

// Module private methods -------------------------------------------------------------------------------------------

/**
 * Generate a pseudo-GUID by concatenating random hexadecimal.
 *
 * @returns {*}
 */
const s_GUID = () =>
{
   return `${s_S4()}${s_S4()}-${s_S4()}-${s_S4()}-${s_S4()}-${s_S4()}${s_S4()}${s_S4()}`;
};

/**
 * Delegates to the model or collection `localStorage` property which should be an instance of `BackboneLocalStorage`.
 *
 * @param {string}   method - Sync method name.
 * @param {object}   model - Model to sync.
 * @param {object}   options - Optional parameters.
 * @returns {Promise}
 */
const s_LOCAL_SYNC = (method, model, options) =>
{
   const store = s_RESULT(model, 'localStorage') || s_RESULT(model.collection, 'localStorage');

   let errorMessage, promise, resp;

   try
   {
      switch (method)
      {
         case 'read':
            resp = model.id !== null && typeof model.id !== 'undefined' ? store.find(model) : store.findAll();
            break;
         case 'create':
            resp = store.create(model);
            break;
         case 'update':
            resp = store.update(model);
            break;
         case 'delete':
            resp = store.destroy(model);
            break;
      }
   }
   catch (err)
   {
      errorMessage = err.code === 22 && store._storageSize() === 0 ? 'Private browsing is unsupported' : err.message;
   }

   if (resp)
   {
      if (options && options.success) { options.success(resp); }

      promise = Promise.resolve(resp);
   }
   else
   {
      errorMessage = errorMessage ? errorMessage : 'Record Not Found';

      if (options && options.error) { options.error(errorMessage); }

      promise = Promise.reject(errorMessage);
   }

   // Add compatibility with $.ajax always execute callback for success and error.
   if (options && options.complete) { options.complete(resp); }

   return promise;
};

/**
 * Invokes the property as a function if it exists or returns the result.
 *
 * @param {object}   object - Object to inspect.
 * @param {string}   property - Property / function name to invoke or return.
 * @returns {*}
 */
const s_RESULT = (object, property) =>
{
   if (typeof object !== 'object') { return void 0; }
   const value = object[property];
   return (typeof value === 'function') ? object[property]() : value;
};

/**
 * Generate four random hex digits.
 *
 * @returns {string}
 */
const s_S4 = () =>
{
   return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
};