const serve = require("../index.js");
const {open} = require("lmdb");

async function main() {
    const test = open("test",{create:true}),
        db = test.openDB("test",{create:true,useVersions:true});
    db.clearSync();
    await db.close();
    await serve({environments:{test:{useVersions:true,databases:{test:null}}}});
}
main();