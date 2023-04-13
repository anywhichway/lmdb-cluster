const fs = require("fs");
const path = require("path");
const serve = require("../index.js");
const {open} = require("lmdb");

const serverOptions = {
    host: "localhost",
};
/*serverOptions.https =  {
    key: fs.readFileSync(path.join(__dirname, 'cert.key')),
        cert: fs.readFileSync(path.join(__dirname, 'cert.crt')),
        ca: [
        fs.readFileSync(path.join(__dirname, '../../ca.crt'))
    ]
};*/

async function main() {
    const test = open("test",{create:true}),
        db = test.openDB("test",{create:true,useVersions:true});
    db.clearSync();
    await db.close();
    await serve("./options.js");
}
main();