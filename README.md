# lmdb-cluster
A clustered version of lmdb that supports a REST API with sockets planned.

LMDB functionality for put, get, remove, and range queries with versions is supported. LMDB start-up options for encryption, compression, etc. are also supported.

This is ALPHA software. Full unit tests not yet in place. API may change. Not functionally complete.

See also:

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

# REST API

General REST API approach is to use the HTTP verbs to indicate the database function to be called:

- DELETE - removeXXX
- GET - getXXX
- PATCH - no underlying LMDB operation, but the capability is provided by `lmdb-patch`. (not yet implemented)
- PUT - putXXX
- POST - transaction and other activities that are not simple database operations. (not yet implemented)

The last portion of a URL path is typically a `URLEncoded` string that is the key for the database operation, although when the key is missing, a range get or query is presumed.

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
  environmentOptions = {},
  environments = {},
  dynamicEnvironmentOptions,
  dynamicDatabaseOptions=dynamicEnvironmentOptions
}
```

You can change the `dbroute` if you wish to use a different API endpoint. For example, `/dbs/:environment/:name` would be a valid value. You must include `:environment` and `:name` in the route.

`environmentOptions` are the same options that would be passed to the LMDB [open](https://github.com/kriszyp/lmdb-js#db-options) when creating a top level "environment" database. They are used as default values for each environment.

`environments` is an object that has the surface:

```json
{
  <environmentName>: {
    options: {},
    inheritOptions: false,
    databases: {
      <databaseName>: {
        options: null
      }
    }
  }
}
```

`options` are, once again, the same as those for LMDB. If `inheritOptions` is true, the options for the environment are used as defaults for the database.

If `dynamicEnvironmentOptions` is present and an attempt is made to open an environment not configured in the `environments` argument, then the options are used to create an environment database of the name requested. Otherwise, an error is thrown. Be careful with this, as it can be a DOS security risk.

`dynamicDatabaseOptions` are used in the same way as `dynamicEnvironmentOptions` for child databases. The `dynamicEnvironmentOptions` are automatically used if neither the parent environment is configured to have it's options inherited or `dynamicDatabaseOptions` is present.  Be careful with this, as it can be a DOS security risk.

## DELETE /data/:environment/:name/:key?ifVersion=:ifversion

Deletes a value from the database `:name` with `:key`. Optionally, only deletes if the version of the value is `:ifversion`.

Returns `true` or `false` depending on whether the value was deleted, i.e. if the value did not exist or the version did not match `false` is returned.

## GET /data/:environment/:name/:key?ifVersion=:ifversion

Gets a value from the database `:name` with `:key`. Optionally, only gets if the version of the value is `:ifversion`.

Returns the value or `null` if the value does not exist or the version does not match.

## GET /data/:environment/:name/?start=:start&end=:end&limit=:limit&offset=:offset&reverse=:reverse&versions=:versions

Gets a range of values from the database `:name`. ***Note***: Trailing slash is REQUIRED.

All query string arguments are optional. However, failing  to provide a `:start` or `:end` will result in a full database scan.

The range is from `:start` to `:end`. The `:start` and `:end` are JSON.stringified `URLEncoded` strings. The `:start` and `end` follow the same form as LMDB [range options](https://github.com/kriszyp/lmdb-js#rangeoptions).

The `:limit` is the maximum number of values to return.

The `offset` is the number of values to skip before returning values. It is used in conjunction with `:limit` to implement paging.

The `:reverse` is a boolean that indicates whether the range should be returned in reverse order. 

The `:versions` is a boolean that indicates whether the version of each value should be returned.

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

## PATCH /data/:environment/:name/:key?version=:version&ifVersion=:ifversion

Not yet implemented

## PUT /data/:environment/:name/:key?version=:version&ifVersion=:ifversion

Puts a value (the contents of the request body) into the database `:name` at the `:key`, optionally with the `version` provided. If `ifVersion` is provided, only puts if the version of the old value is `:ifversion`.


# FAQS

1. Why doesn't the library use ESM modules?

The Socket.io library and some of the other libraries used by this library are more "friendly" to Common JS and it is easy to pull ESM modules into Common JS modules. It is not as easy to pull Common JS modules into ESM modules. So, for now, this library is Common JS only.

2, What is the primary underlying tech?

[Socket.io](https://socket.io/), [Fastify](https://www.fastify.io/), and of course [LMDB](https://github.com/kriszyp/lmdb-js) from [Symas](https://symas.com/).

# Roadmap

v2.0.0 - Socket API

# Release History (Reverse Chronological Order)

2023-04-14 v0.0.5 Enhanced documentation.

2023-04-14 v0.0.4 Enhanced documentation. Implemented loading options from disk.

2023-04-13 v0.0.3 Refined arguments to `serve`. Enhanced documentation.

2023-04-12 v0.0.2 Added support for HTTPS.

2023-04-11 v0.0.1 Initial public release
