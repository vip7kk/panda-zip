export async function onRequest(context){

const request=context.request;

const env=context.env;



if(request.method==="OPTIONS"){

return new Response(

null,

{

headers:{

"Access-Control-Allow-Origin":"*",

"Access-Control-Allow-Methods":

"POST,OPTIONS",

"Access-Control-Allow-Headers":

"*"

}

}

);

}



if(request.method!=="POST"){

return new Response(

"Method Not Allowed",

{

status:405

}

);

}



try{



const form=

await request.formData();



const fileEntries=

form.getAll("files");



let urls=[];

try{

urls=

JSON.parse(

form.get("urls")||"[]"

);

}catch(e){

urls=[];

}

if(!Array.isArray(urls)){

urls=[];

}



// 组装图片源：本地文件 + 在线链接（服务端抓取）

const sources=[];

for(const f of fileEntries){

if(

f &&

typeof f.arrayBuffer==="function"

){

sources.push({

name:f.name||"image.png",

buffer:await f.arrayBuffer()

});

}

}

for(const u of urls){

const trimmed=

typeof u==="string"?u.trim():"";

if(!trimmed) continue;

try{

const resp=

await fetch(

trimmed,

{redirect:"follow"}

);

if(!resp.ok) continue;

const buf=

await resp.arrayBuffer();

sources.push({

name:urlToName(trimmed),

buffer:buf

});

}catch(e){

}

}



if(sources.length===0){

throw new Error(

"没有选择图片"

);

}



if(sources.length>50){

throw new Error(

"最多50张图片"

);

}



const keys=[

env.TINIFY_KEY1,

env.TINIFY_KEY2

].filter(Boolean);



if(keys.length===0){

throw new Error(

"没有配置 Tinify Key"

);

}



let before=0;

let after=0;

let zipFiles={};

const usedNames={};



for(const src of sources){

before += src.buffer.byteLength;



const result=

await tinifyCompress(

src,

keys

);



if(result){

after += result.data.length;

let finalName=result.name;

if(usedNames[finalName]){

const dot=

finalName.lastIndexOf(".");

const base=

dot>-1?

finalName.slice(0,dot):

finalName;

const ext=

dot>-1?

finalName.slice(dot):

"";

let n=1;

while(usedNames[base+"_"+n+ext]) n++;

finalName=base+"_"+n+ext;

}

usedNames[finalName]=true;

zipFiles[finalName]=result.data;

}

}



if(

Object.keys(zipFiles).length===0

){

throw new Error(

"所有图片压缩失败"

);

}



await addQuota(

env,

sources.length

);



const zip=

createZip(zipFiles);



return new Response(

zip,

{

headers:{

"Access-Control-Allow-Origin":"*",

"Content-Type":

"application/zip",

"Content-Disposition":

"attachment; filename=compressed.zip",

"X-Before-Size":

String(before),

"X-After-Size":

String(after)

}

}

);



}catch(e){



return new Response(

"处理失败: "+e.message,

{

status:500,

headers:{

"Access-Control-Allow-Origin":"*"

}

}

);

}



}



// ==========================

// Tinify

// ==========================



async function tinifyCompress(source,keys){



for(const key of keys){



try{



const upload=

await fetch(

"https://api.tinify.com/shrink",

{

method:"POST",

headers:{

Authorization:

"Basic "+

btoa(

"api:"+key

)

},

body:

source.buffer

}

);









if(!upload.ok)

continue;







const json=

await upload.json();







if(

!json.output

||

!json.output.url

)

continue;







const result=

await fetch(

json.output.url

);







return {

name:source.name,

data:

new Uint8Array(

await result.arrayBuffer()

)

};



}catch(e){



}



}



return null;



}

// ==========================

// 从链接推导文件名

// ==========================



function urlToName(url){

try{

const u=new URL(url);

let name=

u.pathname

.split("/")

.pop()||"image";

const q=name.indexOf("?");

if(q>-1) name=name.slice(0,q);

if(!/\.[a-z0-9]+$/i.test(name)){

name+=".png";

}

return name;

}catch(e){

return "image.png";

}

}

// ==========================

// KV次数增加

// ==========================



async function addQuota(env,num){



const month=

new Date()

.toISOString()

.slice(0,7);



let data=

await env.TINIFY_KV.get(

"tinify_stats",

"json"

);



if(

!data

||

data.month!==month

){

data={

month:month,

used:0

};

}



data.used += num;



await env.TINIFY_KV.put(

"tinify_stats",

JSON.stringify(data)

);



}



// ==========================

// ZIP

// ==========================



function createZip(files){



let local=[];

let central=[];

let offset=0;



for(const name in files){



const data=files[name];



const nameBytes=

new TextEncoder()

.encode(name);



const crc=

crc32(data);



const header=

new Uint8Array(30);



const view=

new DataView(

header.buffer

);



view.setUint32(

0,

0x04034b50,

true

);



view.setUint16(

4,

20,

true

);



view.setUint32(

14,

crc,

true

);



view.setUint32(

18,

data.length,

true

);



view.setUint32(

22,

data.length,

true

);



view.setUint16(

26,

nameBytes.length,

true

);







local.push(

header,

nameBytes,

data

);



const center=

new Uint8Array(46);



const c=

new DataView(

center.buffer

);



c.setUint32(

0,

0x02014b50,

true

);



c.setUint16(

4,

20,

true

);



c.setUint16(

6,

20,

true

);



c.setUint32(

16,

crc,

true

);



c.setUint32(

20,

data.length,

true

);



c.setUint32(

24,

data.length,

true

);



c.setUint16(

28,

nameBytes.length,

true

);



c.setUint32(

42,

offset,

true

);







central.push(

center,

nameBytes

);



offset +=

header.length+

nameBytes.length+

data.length;



}



const centralSize=

central.reduce(

(a,b)=>a+b.length,

0

);



const end=

new Uint8Array(22);



const e=

new DataView(

end.buffer

);



e.setUint32(

0,

0x06054b50,

true

);



e.setUint16(

8,

Object.keys(files).length,

true

);



e.setUint16(

10,

Object.keys(files).length,

true

);



e.setUint32(

12,

centralSize,

true

);



e.setUint32(

16,

offset,

true

);







return concat([

...local,

...central,

end

]);



}



function concat(arr){

let length=0;



arr.forEach(

a=>length+=a.length

);



const result=

new Uint8Array(length);



let pos=0;



arr.forEach(a=>{

result.set(

a,

pos

);

pos+=a.length;

});



return result;



}



// ==========================

// CRC32

// ==========================



function crc32(data){

let table=[];



for(let i=0;i<256;i++){

let c=i;



for(let j=0;j<8;j++){

c=

(c&1)

?

0xedb88320 ^ (c>>>1)

:

c>>>1;

}

table[i]=c;

}



let crc=

0xffffffff;



for(const byte of data){

crc=

table[

(crc^byte)&0xff

]

^

(crc>>>8);

}



return (

crc^0xffffffff

)>>>0;

}
