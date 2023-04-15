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

const options = {
    serverOptions,
    appOptions: {logger: true},
    databaseOptions: {
        defaultEnvironment: {
            functions: {},
            options: {}
        },
        environments: {
            test: {
                inheritDefaults: true,
                options: {useVersions: true},
                functions:{},
                databases: {
                    test: {
                        inheritEnvironment: true
                    }
                }
            }
        }
    }
}
module.exports = options;
