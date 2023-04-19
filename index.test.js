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
            if(data===undefined && !keepUndefined) return;
            value[key] = serializeSpecial(keepUndefined)(key,data);
        });
    }
    return value;
}



const host = "http://localhost:3000"; // https://localhost http://localhost:3000

test("put number", async () => {
    const response = await fetch(`${host}/data/test/test/hello?version=1`,{
        method:"PUT",
        body:1
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual(true);
})
test("get number", async () => {
    const response = await fetch(`${host}/data/test/test/hello`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual(1);
})
test("put Infinity", async () => {
    const response = await fetch(`${host}/data/test/test/hello?version=1`,{
        method:"PUT",
        body:serializeSpecial()(null,Infinity),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual(true);
})
test("get Infinity", async () => {
    const response = await fetch(`${host}/data/test/test/hello`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json(),
        result = deserializeSpecial(null,json);
    expect(result).toEqual(Infinity);
})
test("put -Infinity", async () => {
    const response = await fetch(`${host}/data/test/test/hello?version=1`,{
        method:"PUT",
        body:serializeSpecial()(null,-Infinity),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual(true);
})
test("get -Infinity", async () => {
    const response = await fetch(`${host}/data/test/test/hello`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json(),
        result = deserializeSpecial(null,json);
    expect(result).toEqual(-Infinity);
})
test("put NaN", async () => {
    const response = await fetch(`${host}/data/test/test/hello?version=1`,{
        method:"PUT",
        body:serializeSpecial()(null,NaN),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual(true);
})
test("get NaN", async () => {
    const response = await fetch(`${host}/data/test/test/hello`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json(),
        result = deserializeSpecial(null,json);
    expect(result).toEqual(NaN);
})
const now = new Date();
test("put Date", async () => {
    const response = await fetch(`${host}/data/test/test/hello?version=1`,{
        method:"PUT",
        body:serializeSpecial()(null,now),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual(true);
})
test("get Date", async () => {
    const response = await fetch(`${host}/data/test/test/hello`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json(),
        result = deserializeSpecial(null,json);
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toEqual(now.getTime());
})
test("put string", async () => {
    const response = await fetch(`${host}/data/test/test/hello?version=1`,{
        method:"PUT",
        body:"world",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual(true);
})
test("get string", async () => {
    const response = await fetch(`${host}/data/test/test/hello`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual("world");
})
test("get version", async () => {
    const response = await fetch(`${host}/data/test/test/hello?version=1`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual("world");
})
test("get entry", async () => {
    const response = await fetch(`${host}/data/test/test/hello?entry=true`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json.key).toEqual("hello");
    expect(json.value).toEqual("world");
    expect(json.version).toEqual(1);
})
test("get version fail", async () => {
    const response = await fetch(`${host}/data/test/test/hello?version=2`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual(null);
})
test("get entry and version fail", async () => {
    const response = await fetch(`${host}/data/test/test/hello?entry=true&version=2`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual(null);
})
test("copy",async () => {
    const url = `${host}/data/test/test/hello?version=2&ifVersion=1&key=hello2`;
    let response = await fetch(url,{
        method:"COPY"
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    let json = await response.json();
    expect(json).toEqual(true);
    response = await fetch(`${host}/data/test/test/hello2?version=2`,{
        method:"GET"
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    json = await response.json();
    expect(json).toEqual("world");
})
test("move",async () => {
    const url = `${host}/data/test/test/hello2?ifVersion=2&key=hello3`;
    let response = await fetch(url,{
        method:"MOVE"
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    let json = await response.json();
    expect(json).toEqual(true);
    response = await fetch(`${host}/data/test/test/hello3`,{
        method:"GET"
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    json = await response.json();
    expect(json).toEqual("world");
})
test("delete fail by version", async () => {
    const url = `${host}/data/test/test/hello?ifVersion=2`;
    const response = await fetch(url,{
        method:"DELETE"
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual(false);
});
test("delete", async () => {
    const url = `${host}/data/test/test/hello?ifVersion=1`;
    const response = await fetch(url,{
        method:"DELETE"
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const json = await response.json();
    expect(json).toEqual(true);
});
describe("get range", () => {
    beforeAll(async () => {
        for(let i=1;i<=10;i++){
            await fetch(`${host}/data/test/test/hello${i}?version=2`,{
                method:"PUT",
                body:"world"+i,
            });
        }
    });
    test("get all", async () => {
        const response = await fetch(`${host}/data/test/test/`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        const json = await response.json();
        expect(json.done).toEqual(true);
        expect(json.value?.constructor.name).toEqual("Array");
        expect(json.value?.length).toEqual(10);
    })
    test("get start", async () => {
        const start = JSON.stringify((["hello"])),
            response = await fetch(`${host}/data/test/test/?start=`+encodeURIComponent(start));
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        const json = await response.json();
        expect(json.done).toEqual(true);
        expect(json.value?.constructor.name).toEqual("Array");
        expect(json.value?.length).toEqual(10);
    })
    test("get 5 then 5", async () => {
        const url = `${host}/data/test/test/?limit=5`;
        let response = await fetch(url);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        let json = await response.json();
        expect(json.done).toBeFalsy();
        expect(json.value?.constructor.name).toEqual("Array");
        expect(json.value?.length).toEqual(5)
        expect(json.offset).toEqual(5);
        response = await fetch(url+"&offset="+json.offset);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        json = await response.json();
        expect(json.done).toBeTruthy();
        expect(json.value?.constructor.name).toEqual("Array");
        expect(json.value?.length).toEqual(5);
    })
    test("get version 2s", async () => {
        const url = `${host}/data/test/test/?version=2`;
        let response = await fetch(url);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        let json = await response.json();
        expect(json.done).toEqual(true);
        expect(json.value?.constructor.name).toEqual("Array");
        expect(json.value?.length).toEqual(10)
    })
    test("getRangeWhere",async () => {
        let response = await fetch(`${host}/data/test/test/hello`,{
            method:"PUT",
            body: JSON.stringify({message:"world"})
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        let json = await response.json();
        expect(json).toEqual(true);
        const url = `${host}/data/test/test/?keyMatch=["hello"]&valueMatch={"message":"world"}&versions=true`;
        response = await fetch(url);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        json = await response.json();
        expect(json.done).toEqual(true);
        expect(json.value?.constructor.name).toEqual("Array");
        expect(json.value?.length).toEqual(1);
        const value = json.value[0].value;
        expect(value.message).toEqual("world");
    })
    test("getRangeWhere fail",async () => {
        let response = await fetch(`${host}/data/test/test/hello`,{
            method:"PUT",
            body: JSON.stringify({message:"world"})
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        let json = await response.json();
        expect(json).toEqual(true);
        const url = `${host}/data/test/test/?keyMatch=["hello"]&valueMatch={"message":"moon"}&versions=true`;
        response = await fetch(url);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        json = await response.json();
        expect(json.done).toEqual(true);
        expect(json.value?.constructor.name).toEqual("Array");
        expect(json.value?.length).toEqual(0);
    })
});
test("patch",async ()=> {
    const url = `${host}/data/test/test/object`;
    let response = await fetch(url,{
        method:"PUT",
        body:JSON.stringify({name:"joe",address:{city:"Seattle",state:"WA",zip:"98101"}},serializeSpecial())
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    let json = await response.json();
    expect(json).toEqual(true);
    response = await fetch(url,{
        method:"PATCH",
        body:JSON.stringify({name:"joe",address:{city:"Tacoma",state:"WA",zip:undefined}},serializeSpecial(true))
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    json = await response.json();
    expect(json).toEqual(true);
    response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const text = await response.text();
    json = JSON.parse(text);
    expect(json.name).toEqual("joe");
    expect(json.address.city).toEqual("Tacoma");
    expect(json.address.state).toEqual("WA");
    expect(json.address.zip).toEqual(undefined);
    await fetch(url,{
        method:"DELETE"
    });
})