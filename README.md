# lmdb-cluster
A clustered version of lmdb that supports a REST API.

LMDB functionality for put, get, remove, and range queries with versions is supported. LMDB start-up options for encryption, compression, etc. are also supported.

This is ALPHA software. Full unit tests not yet in place. API may change. Not functionally complete.

# Installation

```
npm install lmdb-cluster
```

# Usage

See file `server.js` in test directory and unit test cases in `index.test.js` for examples until documentation complete.

Also see the [LMDB documentation](https://github.com/kriszyp/lmdb-js).

## Starting Server

```javascript
const serve = require("../index.js");

// Start a server with an environment called "test" that uses versioing for all databases.
// Include a database called "test" that uses default lmdb options for the database.
serve({environments:{test:{useVersions:true,databases:{test:null}}}}).then((server) => {
    console.log("Server started");
});
```


# Roadmap

v2.0.0 - Socket API

# Release History (Reverse Chronological Order)

2023-04-11 v0.0.1 Initial public release
