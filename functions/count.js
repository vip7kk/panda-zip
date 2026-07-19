export async function onRequest(context) {


const env=context.env;


try{


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





return new Response(

JSON.stringify({

used:data.used,

limit:1000,

remaining:

Math.max(

0,

1000-data.used

)

}),

{

headers:{

"Content-Type":

"application/json",

"Access-Control-Allow-Origin":

"*"

}

}

);



}catch(e){



return new Response(

JSON.stringify({

error:e.message

}),

{

status:500,

headers:{

"Content-Type":

"application/json",

"Access-Control-Allow-Origin":

"*"

}

}

);



}


}