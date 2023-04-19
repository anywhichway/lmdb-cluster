const cluster = require("cluster");
const http = require("http");
const https = require("https");
const process = require("process");
const path = require("path");
const fastify = require('fastify');
const { Server } = require("socket.io");
const numCPUs = require("os").cpus().length;
const { setupMaster, setupWorker } = require("@socket.io/sticky");
const { createAdapter, setupPrimary } = require("@socket.io/cluster-adapter");
const {open} = require("lmdb");

const coerce = (value,type,...types) => {
    const t = typeof(value);
    if(type==t || value===undefined) return value;
    if(t==="string") {
        if(type==="symbol") return Symbol(value);
        try { // coerce to primary type if value is a string
            const result = JSON.parse(value,deserializeSpecial),
                rtype = typeof(result);
            if(rtype===type || types.includes(rtype)) return result;
        } catch(e) { // allow alternate types
            if(types.includes(t)) return value;
            return;
        }
    }
    if(type==="symbol" && t==="number") return Symbol(value);
    if(type==="string") { // coerce to string if string requested and value is not a string
        if(t==="object" && value) return JSON.stringify(value);
        return value.toString ? value.toString() : value + "";
    }
    if(type==="boolean") { // coerce to boolean if boolean requested and value is not a boolean
        return !!value; // string "true" and "false" handles by parse above
    }
    // otherwise coerces to undefined (number is handled by parse above)
}

const deserializeSpecial = (key,value) => {
    if(key && value==="@undefined") return;
    if(value==="@Infinity") return Infinity;
    if(value==="@-Infinity") return -Infinity;
    if(value==="@NaN") return NaN;
    const type = typeof(value);
    if(type==="string") {
        const number = value.match(/^@BigInt\((.*)\)$/);
        if(number) return new BigInt(number[1]);
        const date = value.match(/^@Date\((.*)\)$/);
        if(date) return new Date(parseInt(date[1]));
        const regexp = value.match(/^@RegExp\((.*)\)$/);
        if(regexp) return new RegExp(regexp[1]);
        const symbol = value.match(/^@Symbol\((.*)\)$/);
        if(symbol) return Symbol.for(symbol[1]);
        return value;
    }
    if(value && type==="object") {
        Object.entries(value).forEach(([key,data]) => {
            value[key] = deserializeSpecial(key,data);
        });
    }
    return value;
}

const deserialize = (value) => {
    const type = typeof(value);
    if(type==="string") {
        try {
            value = deserializeSpecial(null,value);
            if(typeof(value)==="string") value = JSON.parse(value);
            if(value && typeof(value)==="object") value = deserializeSpecial(null,value);
        } catch(e) {

        }
    } else if(value && type==="object") {
        value = deserializeSpecial(null,value);
    }
    return value;
}


const serializeSpecial = (keepUndefined) => (key,value) => {
    if(keepUndefined && key && value===undefined) return "@undefined";
    if(value===Infinity) return "@Infinity";
    if(value===-Infinity) return "@-Infinity";
    const type = typeof(value);
    if(type==="symbol") return value.toString();
    if(type==="number" && isNaN(value)) return "@NaN";
    if(type==="bignint") return "@BigInt("+value.toString()+")";
    if(value && type==="object") {
        if(value instanceof Date) return "@Date("+value.getTime()+")";
        if(value instanceof RegExp) return "@RegExp("+value.toString()+")";
        if(value instanceof Symbol) return "@Symbol("+value.toString()+")";
        Object.entries(value).forEach(([key,data]) => {
            value[key] = serializeSpecial(keepUndefined)(key,data);
        });
    }
    return value;
}

const stringifyPrimitive = (value) => {
    const type = typeof(value);
    if([Infinity,-Infinity,null].includes(value) || type==="symbol" || (type==="number" && isNaN(value)) || type==="bigint") return JSON.stringify(serializeSpecial()(null,value));
    return ["boolean", "number", "string"].includes(type) || value===null ? JSON.stringify(value) : value;
}

const serializer = (value) => {
    if(typeof(value)==="string") return JSON.stringify(value);
    return JSON.stringify(value,serializeSpecial(true));
}

const serve = async (arg={}) => {
    const lmdbQuery = await import("./node_modules/lmdb-query/index.js"),
        lmdbPatch = await import("./node_modules/lmdb-patch/index.js"),
        {getRangeWhere} = lmdbQuery,
        {patch} = lmdbPatch;
    console.log(path.normalize(path.join(process.cwd(),arg)));
    const {serverOptions={},clusterOptions={},appOptions={},databaseOptions={}} = typeof(arg)==="string" ? require(path.normalize(path.join(process.cwd(),arg))) : arg;
    const {maxCPUs} = clusterOptions,
        {dbroute="/data/:environment/:name",defaultEnvironment={},functions={},environments= {},dynamicEnvironment,dynamicDatabase={}} = databaseOptions,
        port = serverOptions?.port || (serverOptions?.https ? 443 : 3000);
    for(const [name,{databases= {},options={},inheritDefaults}={}] of Object.entries(environments)) {
        const envOptions = environments[name].options = {...(inheritDefaults ? defaultEnvironment.options||{} : {}),...options},
            envFunctions = environments[name].functions = {...(inheritDefaults ? defaultEnvironment.functions||{} : {}),...environments[name].functions||{}},
            envdb = open(name,envOptions);
        if(envdb) {
            for(const [name,config] of Object.entries(databases)) {
                config.options = {...(config.inheritEnvironment ? envOptions : {}),...config.options||{}};
                config.functions = {getRangeWhere,patch,...(config.inheritEnvironment ? envOptions : {}),...options.function||{}};
                const db = envdb.openDB(name, databases[name].options);
                await db.close()
            }
            await envdb.close();
        }
    }

    if (cluster.isPrimary) {
        console.log(`environment ${process.pid} is running`);


        const httpServer = http.createServer();

        // setup sticky sessions
        setupMaster(httpServer, {
            loadBalancingMethod: "least-connection",
        });

        // setup connections between the workers
        setupPrimary();

        // needed for packets containing buffers (you can ignore it if you only send plaintext objects)
        // Node.js > 16.0.0
        cluster.setupPrimary({
            serialization: "advanced",
        });

        httpServer.listen(port+1);

        for (let i = 0; i < Math.min(maxCPUs>=0 ? maxCPUs : numCPUs,numCPUs); i++) {
            const worker = cluster.fork();
           // worker.on("listening", () => {
           //     worker.send({workerOptions:{environments,dynamicEnvironment?.options,dynamicDatabase?.options}});
           // })
        }

        Object.entries(clusterOptions.on||{}).forEach(([key,value]) => {
            cluster.on(key,value.bind(cluster));
        })

        cluster.on("exit", (worker) => {
            console.log(`Worker ${worker.process.pid} died`);
            cluster.fork();
        });
    } else {


        //const workerOptions = {};
        //process.on("listening", () => {
            //process.on('message', (msg) => {
             //   if(msg.workerOptions) {
             //      Object.assign(workerOptions,msg.workerOptions);
            //       console.log(process.pid,JSON.stringify(workerOptions))
             //   }
           // });
        //})

        const app = fastify(Object.assign({},{http:serverOptions?.http,https:serverOptions?.https},appOptions));
        if(serverOptions) {
            delete serverOptions.http;
            delete serverOptions.https;
        }
        app.get('/',  (request) => 'LMDB Cluster Server')
            .route({
                method:"COPY",
                url:dbroute + '/:key',
                handler: async (request,reply) => {
                    const {environment, name, key} = request.params;
                    let env = environments[environment];
                    if (!env) {
                        if (!dynamicEnvironment) throw new Error("Environment not found")
                        env = environments[environment] = {
                            databases: {},
                            options: {...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.options || {} : {}), ...dynamicEnvironment?.options || {}},
                            functions: {...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.functions || {} : {}), ...dynamicEnvironment?.options || {}}

                        }
                    }
                    if (env.databases[name] === undefined) {
                        if (!dynamicDatabase) throw new Error("Database not found");
                        env.databases[name] = {
                            options: {...(dynamicDatabase.inheritEnvironment ? env.options : {}), ...dynamicDatabase?.options || {}},
                            functions: {...(dynamicDatabase.inheritEnvironment ? env.functions : {}), ...dynamicDatabase?.functions || {}}
                        };
                    }
                    const envdb = open(environment, env.options),
                        db = envdb.openDB({name, ...env.databases[name].options});
                    Object.entries(env.databases[name].functions).forEach(([fname, f]) => {
                        db[fname] = f;
                    });
                    let {version, ifVersion} = request.query;
                    version = coerce(version, "number");
                    ifVersion = coerce(ifVersion, "number");
                    const entry = db.getEntry(key, {versions: true});
                    let result = false;
                    if (entry.version == ifVersion) {
                        result = await db.put(request.query.key, entry.value, version);
                    }
                    await db.close();
                    reply.type("application/json");
                    return result + "";
                }
            })
            .delete(dbroute + '/:key', async (request,reply) => {
                const { environment,name,key } =  request.params;
                let env = environments[environment];
                if (!env) {
                    if (!dynamicEnvironment) throw new Error("Environment not found")
                    env = environments[environment] = {
                        databases: {},
                        options:{...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.options||{} : {}),...dynamicEnvironment?.options||{}},
                        functions:{...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.functions||{} : {}),...dynamicEnvironment?.options||{}}

                    }
                }
                if (env.databases[name] === undefined) {
                    if (!dynamicDatabase) throw new Error("Database not found");
                    env.databases[name] = {
                        options:{...(dynamicDatabase.inheritEnvironment ? env.options : {}),...dynamicDatabase?.options||{}},
                        functions:{...(dynamicDatabase.inheritEnvironment? env.functions : {}),...dynamicDatabase?.functions||{}}
                    };
                }
                const envdb = open(environment,env.options),
                    db = envdb.openDB({name,...env.databases[name].options});
                Object.entries({...env.databases[name].functions}).forEach(([fname,f]) => {
                    db[fname] = f;
                })
                let {ifVersion} = request.query
                ifVersion = coerce(ifVersion,"number");
                let result = false;
                if(ifVersion) {
                    result = db.removeSync(key,ifVersion);
                } else {
                    result = db.removeSync(key);
                }
                await db.close();
                reply.type("application/json");
                return result+"";
            })
            .get(dbroute + "/", async (request,reply) => {
                const { environment,name } =  request.params;
                let env = environments[environment];
                if (!env) {
                    if (!dynamicEnvironment) throw new Error("Environment not found")
                    env = environments[environment] = {
                        databases: {},
                        options:{...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.options||{} : {}),...dynamicEnvironment?.options||{}},
                        functions:{...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.functions||{} : {}),...dynamicEnvironment?.options||{}}

                    }
                }
                if (env.databases[name] === undefined) {
                    if (!dynamicDatabase) throw new Error("Database not found");
                    env.databases[name] = {
                        options:{...(dynamicDatabase.inheritEnvironment ? env.options : {}),...dynamicDatabase?.options||{}},
                        functions:{...(dynamicDatabase.inheritEnvironment? env.functions : {}),...dynamicDatabase?.functions||{}}
                    };
                }
                const envdb = open(environment,env.options),
                    db = envdb.openDB({name,...env.databases[name].options});
                Object.entries(env.databases[name].functions).forEach(([fname,f]) => {
                    db[fname] = f;
                })
                let {versions,version,start,end,limit,offset,keyMatch,valueMatch,select} = request.query;
                versions = coerce(versions,"boolean");
                version = coerce(version,"number");
                limit = coerce(limit,"number");
                offset = coerce(offset,"number");
                start = coerce(start,"object","string");
                end = coerce(end,"object","string");
                keyMatch = coerce(keyMatch,"object","string");
                valueMatch = coerce(valueMatch,"object","string");
                select = coerce(select,"object","string");
                const range = keyMatch ? db.getRangeWhere(keyMatch,valueMatch,select,{offset,versions:version ? true : versions===true}) : db.getRange({start,end,offset,versions:version ? true : versions===true});
                const result = {
                    done: false,
                    value: [],
                    offset: offset||0
                }
                limit>=0 || (limit=1000);
                while(!result.done && limit>0) {
                    const {done,value} = range.next();
                    if(value?.value && (!version || value?.version===version)) {
                        limit--;
                        result.value.push(value);
                    }
                    if(done) result.done = done;
                    if(!result.done) result.offset++;
                }
                if(!result.done) {
                    const {done,value} = range.next();
                    if(done && value===undefined) result.done = true;
                }
                if(result.done) delete result.offset;
                await db.close(); // keep envdb open since opening it is an expensive file open operation
                reply.type("application/json; charset=utf-8");
                reply.serializer(serializer);
                return result;
            })
            .get(dbroute + '/:key', async (request,reply) => {
                const {environment, name, key} = request.params;
                let env = environments[environment];
                if (!env) {
                    if (!dynamicEnvironment) throw new Error("Environment not found")
                    env = environments[environment] = {
                        databases: {},
                        options:{...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.options||{} : {}),...dynamicEnvironment?.options||{}},
                        functions:{...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.functions||{} : {}),...dynamicEnvironment?.options||{}}

                    }
                }
                if (env.databases[name] === undefined) {
                    if (!dynamicDatabase) throw new Error("Database not found");
                    env.databases[name] = {
                        options:{...(dynamicDatabase.inheritEnvironment ? env.options : {}),...dynamicDatabase?.options||{}},
                        functions:{...(dynamicDatabase.inheritEnvironment? env.functions : {}),...dynamicDatabase?.functions||{}}
                    };
                }
                const envdb = open(environment,env.options),
                    db = envdb.openDB({name,...env.databases[name].options});
                Object.entries(env.databases[name].functions).forEach(([fname,f]) => {
                    db[fname] = f;
                })
                let {version,entry} = request.query;
                version = coerce(version,"number");
                entry = coerce(entry,"boolean");
                const e = db.getEntry(key,{versions:true});
                await db.close();
                reply.type("application/json; charset=utf-8");
                reply.serializer(serializer);
                return e && (!version || e.version===version) ? (entry ? {key,...e} : e.value): null;
            })
            .patch(dbroute + '/:key', async (request,reply) => {
                const { environment,name, key } = request.params;
                let env = environments[environment];
                if (!env) {
                    if (!dynamicEnvironment) throw new Error("Environment not found")
                    env = environments[environment] = {
                        databases: {},
                        options:{...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.options||{} : {}),...dynamicEnvironment?.options||{}},
                        functions:{...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.functions||{} : {}),...dynamicEnvironment?.options||{}}

                    }
                }
                if (env.databases[name] === undefined) {
                    if (!dynamicDatabase) throw new Error("Database not found");
                    env.databases[name] = {
                        options:{...(dynamicDatabase.inheritEnvironment ? env.options : {}),...dynamicDatabase?.options||{}},
                        functions:{...(dynamicDatabase.inheritEnvironment? env.functions : {}),...dynamicDatabase?.functions||{}}
                    };
                }
                const envdb = open(environment,env.options),
                    db = envdb.openDB({name,...env.databases[name].options});
                Object.entries(env.databases[name].functions).forEach(([fname,f]) => {
                    db[fname] = f;
                });
                let {version,ifVersion} = request.query;
                version = coerce(version,"number");
                ifVersion = coerce(ifVersion,"number");
                const value = serializeSpecial()(null,deserialize(request.body));
                let result = false;
                if(version && ifVersion) {
                    result = await db.patch(key, value,version,ifVersion);
                } else if(version) {
                    result = await db.patch(key, value,version)
                } else if(ifVersion) {
                    result = await db.patch(key, value, ifVersion, ifVersion)
                } else {
                    result = await db.patch(key, value)
                }
                await db.close();
                reply.type("application/json");
                return result + "";
            })
            /*
            if (entry.version == ifVersion) {
                        await db.transaction(async () => {
                            result = await db.put(request.query.key, entry.value, version);
                            if(!result) {
                                return ABORT;
                            }
                            result = await db.remove(key);
                            if(!result) {
                                return ABORT;
                            }
                        })
                    }
             */
            .route({
                method:"MOVE",
                url:dbroute + '/:key',
                handler: async (request,reply) => {
                    const {environment, name, key} = request.params;
                    let env = environments[environment];
                    if (!env) {
                        if (!dynamicEnvironment) throw new Error("Environment not found")
                        env = environments[environment] = {
                            databases: {},
                            options: {...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.options || {} : {}), ...dynamicEnvironment?.options || {}},
                            functions: {...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.functions || {} : {}), ...dynamicEnvironment?.options || {}}

                        }
                    }
                    if (env.databases[name] === undefined) {
                        if (!dynamicDatabase) throw new Error("Database not found");
                        env.databases[name] = {
                            options: {...(dynamicDatabase.inheritEnvironment ? env.options : {}), ...dynamicDatabase?.options || {}},
                            functions: {...(dynamicDatabase.inheritEnvironment ? env.functions : {}), ...dynamicDatabase?.functions || {}}
                        };
                    }
                    const envdb = open(environment, env.options),
                        db = envdb.openDB({name, ...env.databases[name].options});
                    Object.entries(env.databases[name].functions).forEach(([fname, f]) => {
                        db[fname] = f;
                    });
                    let {version, ifVersion} = request.query;
                    version = coerce(version, "number");
                    ifVersion = coerce(ifVersion, "number");
                    const entry = db.getEntry(key, {versions: true});
                    let result = false;
                    if (entry.version == ifVersion) {
                        await db.transaction(async () => {
                            result = await db.put(request.query.key, entry.value, version);
                            if(!result) {
                                throw new Error(`Failed to create copy ${request.query.key} from ${key} when moving.`)
                            }
                            result = await db.remove(key,ifVersion);
                            if(!result) {
                                throw new Error(`Failed to delete ${key} when moving to ${request.query.key}.`)
                            }
                        })
                    }
                    await db.close();
                    reply.type("application/json");
                    return result + "";
                }
            })
            .put(dbroute + '/:key', async (request,reply) => {
                const { environment,name, key } = request.params;
                let env = environments[environment];
                if (!env) {
                    if (!dynamicEnvironment) throw new Error("Environment not found")
                    env = environments[environment] = {
                        databases: {},
                        options:{...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.options||{} : {}),...dynamicEnvironment?.options||{}},
                        functions:{...(dynamicEnvironment.inheritDefaults ? defaultEnvironment.functions||{} : {}),...dynamicEnvironment?.options||{}}

                    }
                }
                if (env.databases[name] === undefined) {
                    if (!dynamicDatabase) throw new Error("Database not found");
                    env.databases[name] = {
                        options:{...(dynamicDatabase.inheritEnvironment ? env.options : {}),...dynamicDatabase?.options||{}},
                        functions:{...(dynamicDatabase.inheritEnvironment? env.functions : {}),...dynamicDatabase?.functions||{}}
                    };
                }
                const envdb = open(environment,env.options),
                    db = envdb.openDB({name,...env.databases[name].options});
                Object.entries(env.databases[name].functions).forEach(([fname,f]) => {
                    db[fname] = f;
                });
                let {version,ifVersion} = request.query;
                version = coerce(version,"number");
                ifVersion = coerce(ifVersion,"number");
                const value = serializeSpecial()(null,deserialize(request.body));
                let result = false;
                if(version && ifVersion) {
                    result = await db.put(key, value,version,ifVersion);
                } else if(version) {
                   result = await db.put(key, value,version)
                } else if(ifVersion) {
                   result = await db.put(key, value, ifVersion, ifVersion)
                } else {
                    result = await db.put(key, value)
                }
                await db.close();
                reply.type("application/json");
                return result + "";
            });
        app.listen({...serverOptions, port},(err,address) => {
            if(err) {
                app.log.error(err);
                process.exit(1);
            }
        })
        const io = new Server(app.server);
        // use the cluster adapter
        io.adapter(createAdapter());

        // setup connection with the primary process
        setupWorker(io);

        io.on("connection", (socket) => {
            /* ... */
        });

    }
}

module.exports = serve;



