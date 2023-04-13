const options = {
    serverOptions: {
        host: "localhost",
    },
    appOptions: {logger: true},
    databaseOptions: {
        environments: {
            test: {
                inheritOptions: true,
                options: {useVersions: true},
                databases: {
                    test: null
                }
            }
        }
    }
}
module.exports = options;
