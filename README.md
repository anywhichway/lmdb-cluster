# lmdb-cluster
A clustered version of lmdb that supports an HTTP API with sockets planned.

LMDB functionality for put, get, remove, and range queries with versions is supported. 

Also supported are:

1. basic patch operations for partial object updates via [lmdb-patch](https://github.com/anywhichway/lmdb-patch),
2. selective patch operations through extended paths,
3. copy operations using the HTTP verb `COPY`
4. move operations using the HTTP verb `MOVE`
5. a query mechanism that supports functional, declarative and RegExp filters via [lmdb-query](https://github.com/anywhichway/lmdb-query).
6. a search mechanism based on indexes via [lmdb-index](https://github.com/anywhichway/lmdb-index).

LMDB start-up options for encryption, compression, etc. are also supported.

This is ALPHA software. Full unit tests not yet in place. API may change. Not functionally complete.

See also:

[LMDB Index](https://github.com/anywhichway/lmdb-index) - Higher level object operations for LMDB values, e.g. indexing and indexed based queries.

[LMDB Query](https://github.com/anywhichway/lmdb-query) - A higher level query mechanism for LMDB supporting functional, declarative and RegExp filters without the overhead of an entire database wrapper.

[LMDB IndexedDB](https://github.com/anywhichway/lmdb-indexeddb) - An IndexedDB wrapper for LMDB that supports the full IndexedDB API.

# Installation

```
npm install lmdb-cluster
```

# Usage

See file `server.js` in test directory and unit test cases in `index.test.js` for examples until documentation complete.

Also see the [LMDB documentation](https://github.com/kriszyp/lmdb-js).

## Starting Server

```javascript
const serve = require("lmdb-cluster").serve;

// Start a server with an environment called "test" that uses versioing for all databases.
// Include a database called "test" that uses default lmdb options for the database.
serve({environments:{test:{useVersions:true,databases:{test:null}}}}).then((server) => {
    console.log("Server started");
});
```

# HTTP API

General API approach is to use the HTTP verbs to indicate the database function to be called:

- COPY - no underlying LMDB operation, but the capability is provided by `lmdb-copy`.
- DELETE - removeXXX
- GET - getXXX, plus querying based on URL query string parameters when a key is not provided
- MOVE - no underlying LMDB operation, but the capability is provided by `lmdb-move`.
- PATCH - no underlying LMDB operation, but the capability is provided by `lmdb-patch`.
- PUT - putXXX
- POST - transaction and other activities that are not simple database operations. (not yet implemented)

The last portion of a URL path is typically a `URLEncoded` string that is the key for the database operation, although when the key is missing, a range get, query, search or indexed object action is presumed.

A query string is used to pass arguments to the database operation, with the exception of data to be put into the database, which is passed in the body of a request.

We start with `serve` because nothing else will work without it! After that, we will look at the API in alphabetical order.

## serve(options:object|string):Promise

Starts a server. Returns a promise that resolves when the server is ready.

If options is an object, it has the surface:

```json
{
  serverOptions = {},
  clusterOptions = {},
  appOptions = {},
  databaseOptions = {}
}
```

If the `options` argument to `serve` is a string, it is the path to a JavaScript file that exports the options in the above form. The path is resolved relative to the current working directory, i.e. the directory from which the file containing the call to `serve` is saved. See the 'test' directory for an example.

`serverOptions` are the same options that would be passed to NodeJS [server.listen](https://nodejs.org/api/http.html#http_server_listen).

`clusterOptions` are the same options that would be used for NodeJS [clustering](https://nodejs.org/api/cluster.html), this includes `maxCPUs` and `on` event handlers, e.g. 

```javascript
{
  maxCPUs: 2,
  on: {
    online(worker) {
      console.log(`Worker ${worker.process.pid} is online`);
    }
  }
}
```

The `this` context of event functions will be bound to the cluster. If you do not provide an `on.exit` handler, one will be provided for you to restart the worker.

```javascript
exit(worker, code, signal) {
      console.log(`Worker ${worker.process.pid} died with code: ${code}, and signal: ${signal}`);
      console.log('Starting a new worker');
      cluster.fork();
    }
```

`appOptions` are the same options that would be passed to the Fastify [factory function](https://www.fastify.io/docs/latest/Reference/Server/#factory).

`databaseOptions` has the surface and defaults below:

```json
{
  dbroute="/data/:environment/:name",
  defaultEnvironment = {}, // was environmentOptions = {},
  dynamicEnvironment, // wasdynamicEnvironmentOptions,
  dynamicDatabase={} // was dynamicDatabaseOptions=dynamicEnvironmentOptions,
  environments = {},
}
```
You can change the `dbroute` if you wish to use a different API endpoint. For example, `/dbs/:environment/:name` would be a valid value. You must include `:environment` and `:name` in the route.

`defaultEnvironment`, `dynamicEnvironment` and `dynamicDatabase` are all optional and have the surface `{options:object,functions:object}`. The options are the same that would be passed to the LMDB [open](https://github.com/kriszyp/lmdb-js#db-options) or [openDB](https://github.com/kriszyp/lmdb-js#dbopendbdatabase-stringnamestring). If `defaultEnvironment` is present, then it is used as the default environment for all databases. If `dynamicEnvironment` is present, then it is used as the default for any environment not configured in the `environments` argument. It can also have `inheritDefaults` as a boolean property. If `dynamicDatabase` is present, then it is used for any database not configured in the `environments` argument. It can also have `inheritEnvironment` as a boolean property.

`environments` is an object that has the surface:

```json
{
  <environmentName>: {
    options: {},
    functions: {},
    inheritDefaults: false, // merges defaultEnvironment.option and defaultEnvironment.functions with environment options and functions
    databases: {
      <databaseName>: {
        inheritEnvironment: false, // merges environment.options and environment.functions with database options and functions
        options: null,
        functions: null,
      }
    }
  }
}
```

If `dynamicEnvironment` is present and an attempt is made to open an environment not configured in the `environments` argument, then the `dynamicEnvironment.options` are used to create an environment database of the name requested. Otherwise, an error is thrown. Be careful with this, as it can be a DOS security risk.

`dynamicDatabaseOptions` are used in the same way as `dynamicEnvironmentOptions` for child databases. The `dynamicEnvironmentOptions` are automatically used if neither the parent environment is configured to have it's options inherited or `dynamicDatabaseOptions` is present.  Be careful with this, as it can be a DOS security risk.

The return values below are JSON encoded in the body of the response.

## COPY /data/:environment/:name/:key?key=:newKey,&version=:version&ifVersion=:ifversion - returns boolean

Copies the value at `:key` to `:newKey`. The `newKey` will be in the same `:environment` and database. If `:version` is provided, it will be used for the copy. Copying will only occur when the version of the original matches `:ifversion`, when `:ifversion` is provided. Returns `true` if successful, otherwise `false`.

## DELETE /data/:environment/:name/:key?ifVersion=:ifversion - returns boolean

Deletes a value from the database `:name` with `:key`. Optionally, only deletes if the version of the value is `:ifversion`.

Returns `true` or `false` depending on whether the value was deleted, i.e. if the value did not exist or the version did not match `false` is returned.

## GET /data/:environment/:name/:key?ifVersion=:ifversion&entry=:entry - returns any value

Gets a value from the database `:name` with `:key`. If `:entry` is `true`, then the value is returned as an object with the properties `value` and `version`.

Returns the value or `null` if the value does not exist or the version does not match `:ifVersion` when provided.

## GET /data/:environment/:name/:key/*?ifVersion=:ifversion - returns any value

Gets a value from the database `:name` with `:key` and subpath `*`. Optionally, only gets if the version of the root value is `:ifversion`.

Returns the value or `null` if the root or leaf value does not exist or the version does not match.

## GET /data/:environment/:name/?start=:start&end=:end&indexMatch=:indexMatch&keyMatch=:keyMatch&valueMatch=:valueMatch&select=:select&limit=:limit&offset=:offset&reverse=:reverse&versions=:versions - returns result object

Gets a range of values from the database `:name`. ***Note***: Trailing slash is REQUIRED.

All query string arguments are optional. However, failing  to provide one of `:start`, `:indexMatch` or `keyMatch` will result in a full database scan.

Only one of `:start`, `:indexMatch` or `keyMatch` can be provided. And, `:end` is only used with `:start`.

The `:start` and `:end` are JSON.stringified `URLEncoded` strings. The `:start` and `end` follow the same form as LMDB [range options](https://github.com/kriszyp/lmdb-js#rangeoptions).

Alternatively, `:keyMatch`, can be used to specify a range for `getRangeWhere` from [lmdb-query](https://github.com/anywhichway/lmdb-query). Like `:start` and `:end`, this is a JSON.stringified `URLEncoded` string.

Or, `:indexMatch` uses a JSON.stringified `URLEncoded` string with  [lmdb-index](https://github.com/anywhichway/lmdb-index) to search the database and returns a range of values.

The remaining parameters `limit=:limit&offset=:offset&reverse=:reverse&versions=:versions&version="version` are the same.

The `:limit` is the maximum number of values to return.

The `offset` is the number of values to skip before returning values. It is used in conjunction with `:limit` to implement paging.

The `:reverse` is a boolean that indicates whether the range should be returned in reverse order (not yet implemented)

The `:versions` is a boolean that indicates whether the version of each value should be returned.

And `:version` is used to return a value only if the version matches.

### Result Object

Returns a result object with the surface that is similar to the standard [iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols) result object:

```json
{
  done: <boolean> or absent,
  value: <array>
  offset: <number>
}
```

The items in the value array have the surface:

```json
{
  key: <key>,
  value: <value>,
  version: <version> // optionally
}
``` 

If `offset` is present, then the range is not complete. Request the exact same URL as before, but with the `offset` set to the value of the `offset` property of the result object. This will return the next page of results. When a JavaScript client library is written, the object will even have a `next()` method.

## MOVE /data/:environment/:name/:key?key=:newKey,&version=:version&ifVersion=:ifversion - returns boolean

Moves the value at `:key` to `:newKey`. The `newKey` will be in the same `:environment` and database. If `:version` is provided, it will be used for the moved version. Moving will only occur when the version of the original matches `:ifversion`, when `:ifversion` is provided. Returns `true` if successful, otherwise `false`. The actual move involves making a copy and deleting the original inside a transaction.

## PATCH /data/:environment/:name/:key?version=:version&ifVersion=:ifversion - returns boolean

Patches a value (the contents of the request body) into the database `:name` at the `:key`, using `Object.assign`, optionally with the `version` provided. If `ifVersion` is provided, only patches if the version of the old value is `:ifversion`.

If the existing value is a primitive type or the new value is a primitive type, the existing value is replaced with the patch. Otherwise, the patch is merged into the object. By serializing `undefined` to "@undefined" as the value for properties you wish to delete, `PATCH` can be used to delete properties (including nested ones).

## PATCH /data/:environment/:name/:key/*?version=:version&ifVersion=:ifversion - returns boolean

Patches a value (the contents of the request body) into the database `:name` at the `:key`, and subpath `*`, optionally with the `version` provided. If `ifVersion` is provided, only patches if the version of the old value is `:ifversion`.

This approach is useful when you wish to patch portions of a sub-object without needing a copy of the parent data. For example, if you have a document with a `user` object, you can patch the `user.address.zip` without needing a copy of the data outside of address or even the city and state in the address sub-object. This might not only more efficient, but also more secure.

If the existing value is a primitive type or the new value is a primitive type, the existing value is replaced with the patch. Otherwise, the patch is merged into the object. By serializing `undefined` to "@undefined" as the value for properties you wish to delete, `PATCH` can be used to delete properties (including nested ones).

## PUT /data/:environment/:name/?version=:version&ifVersion=:ifversion - returns id

Puts an object value (note no key is provided above), assigns an id if needed, indexes the object, and returns the id. The object is the contents of the request body. If `:version` is provided, it will be used for the version. Putting will only occur when the version of the original matches `:ifversion`, when `:ifversion` is provided.

Currently, all top level properties on all objects are indexed. Nested properties are not indexed. This may change in the future.

## PUT /data/:environment/:name/:key?version=:version&ifVersion=:ifversion - returns boolean

Puts a value (the contents of the request body) into the database `:name` at the `:key`, optionally with the `version` provided. If `ifVersion` is provided, only puts if the version of the old value is `:ifversion`. Note, if you put a value with a `:key` indexing is NOT conducted. If you wish to index the value, use `PUT /data/:environment/:name/?version=:version&ifVersion=:ifversion` instead.

# FAQS

1. Why doesn't the library use ESM modules?

The Socket.io library and some of the other libraries used by this library are more "friendly" to Common JS and it is easy to pull ESM modules into Common JS modules. It is not as easy to pull Common JS modules into ESM modules. So, for now, this library is Common JS only.

2, What is the primary underlying tech?

[Socket.io](https://socket.io/), [Fastify](https://www.fastify.io/), and of course [LMDB](https://github.com/kriszyp/lmdb-js) from [Symas](https://symas.com/).

# Roadmap

v2.0.0 - Socket API

# Release History (Reverse Chronological Order)

2023-04-23 v0.6.1 Updated lmdb-query and lmdb-index to better support index based queries.

2023-04-23 v0.6.0 Added support for index based queries.

2023-04-22 v0.5.0 Added support for `PUT` of objects without a key plus indexing.

2023-04-20 v0.4.0 Now using `lmdb-copy`, `lmdb-move`, and `lmdb-extend` for `COPY`, `MOVE` instead of local code. Added support for targeted nested get and patching.

2023-04-19 v0.3.0 Added support for `COPY` and `MOVE`.

2023-04-18 v0.2.0 Enhanced documentation. Added support for `keyMatch`, `valueMatch`, and `select` for `GET` methods through the use of `lmdb-query`.

2023-04-15 v0.1.0 Enhanced documentation. Added support for `PATCH`. BREAKING CHANGE, the signature of the `databaseOptions` argument to serve` has changed.

2023-04-14 v0.0.5 Enhanced documentation.

2023-04-14 v0.0.4 Enhanced documentation. Implemented loading options from disk.

2023-04-13 v0.0.3 Refined arguments to `serve`. Enhanced documentation.

2023-04-12 v0.0.2 Added support for HTTPS.

2023-04-11 v0.0.1 Initial public release
