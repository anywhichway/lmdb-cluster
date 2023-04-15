const fs = require("fs");
const path = require("path");
const serve = require("../index.js");
const {open} = require("lmdb");

async function main() {
    const test = open("test",{create:true}),
        db = test.openDB("test",{create:true,useVersions:true});
    db.clearSync();
    await db.close();
    await serve("./options.js");
}
main();