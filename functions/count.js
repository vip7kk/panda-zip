export async function onRequest(context) {


return new Response(

JSON.stringify({

envKeys:Object.keys(context.env),

hasKV:!!context.env.TINIFY_KV,

hasKey1:!!context.env.TINIFY_KEY1,

hasKey2:!!context.env.TINIFY_KEY2

}),

{

headers:{

"Content-Type":"application/json"

}

}

);


}