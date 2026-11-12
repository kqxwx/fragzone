import { pbkdf2 } from "node:crypto";

const COOKIE = "fz_session";
const SESSION_DAYS = 14;
const PBKDF2_ITERATIONS = 210000;
const MAX_BODY = 20000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
}
function fail(error,status=400){return json({error},status);}
function randomHex(bytes=32){const value=new Uint8Array(bytes);crypto.getRandomValues(value);return [...value].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function sha256(value){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function derivePassword(password,saltHex){
 const salt=Uint8Array.from(saltHex.match(/.{2}/g),x=>parseInt(x,16));
 const passwordBytes=new TextEncoder().encode(password);
 const bits=await new Promise((resolve,reject)=>{
  pbkdf2(passwordBytes,salt,PBKDF2_ITERATIONS,32,"sha256",(error,derivedKey)=>{
   if(error)reject(error);
   else resolve(derivedKey);
  });
 });
 return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function verifyPassword(password,encoded){if(!encoded||!encoded.includes(":"))return false;const [salt,expected]=encoded.split(":");return(await derivePassword(password,salt))===expected;}
function setCookie(token,age=SESSION_DAYS*86400){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;}
function getCookie(request){const part=(request.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));return part?part.slice(COOKIE.length+1):null;}
function clean(value,max){return typeof value==="string"?value.trim().replace(/\u0000/g,"").slice(0,max):"";}
function validEmail(value){return value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
async function readBody(request){if(Number(request.headers.get("content-length")||0)>MAX_BODY)throw new Error("Слишком большой запрос");return request.json();}
async function currentUser(request,env){
 const token=getCookie(request);if(!token)return null;
 return env.DB.prepare(`SELECT u.id,u.email,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')`).bind(await sha256(token)).first();
}
async function createSession(userId,env){
 const token=randomHex(32),expires=new Date(Date.now()+SESSION_DAYS*86400000).toISOString().slice(0,19).replace("T"," ");
 await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256(token),userId,expires).run();return token;
}
function viewUser(user){return{id:user.id,email:user.email,username:user.username,role:user.role};}

async function handle(request,env){
 if(!env.DB)return fail("База D1 не подключена. В Cloudflare Pages → Settings → Bindings добавьте D1 database binding с именем DB.",503);
 const url=new URL(request.url),path=url.pathname.replace(/^\/api\/?/,"").replace(/\/+$/,""),method=request.method.toUpperCase();
 if(method==="OPTIONS")return new Response(null,{status:204});
 const origin=request.headers.get("Origin");if(origin&&origin!==url.origin)return fail("Недопустимый источник запроса",403);
 if(path==="auth/me"&&method==="GET"){const user=await currentUser(request,env);return json({user:user?viewUser(user):null});}
 if(path==="auth/register"&&method==="POST"){
  const body=await readBody(request),email=clean(body.email,254).toLowerCase(),username=clean(body.username,32),password=typeof body.password==="string"?body.password:"";
  if(!validEmail(email))return fail("Укажите корректный email");
  if(username.length<2)return fail("Имя должно содержать минимум 2 символа");
  if(password.length<10||password.length>128)return fail("Пароль должен содержать от 10 до 128 символов");
  if(email===(env.ADMIN_EMAIL||"").toLowerCase())return fail("Этот email зарезервирован для администратора",409);
  if(await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first())return fail("Аккаунт с таким email уже существует",409);
  const salt=randomHex(16),hash=salt+":"+await derivePassword(password,salt),id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users(id,email,username,password_hash,role) VALUES(?,?,?,?,'user')").bind(id,email,username,hash).run();
  const token=await createSession(id,env);return json({user:{id,email,username,role:"user"}},201,{"set-cookie":setCookie(token)});
 }
 if(path==="auth/login"&&method==="POST"){
  const body=await readBody(request),email=clean(body.email,254).toLowerCase(),password=typeof body.password==="string"?body.password:"";
  const user=await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  if(!user||!(await verifyPassword(password,user.password_hash)))return fail("Неверный email или пароль",401);
  const token=await createSession(user.id,env);return json({user:viewUser(user)},200,{"set-cookie":setCookie(token)});
 }
 if(path==="auth/logout"&&method==="POST"){const token=getCookie(request);if(token)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();return json({ok:true},200,{"set-cookie":setCookie("",0)});}
 if(path==="tickets"&&method==="POST"){
  const body=await readBody(request),user=await currentUser(request,env),subject=clean(body.subject,120),message=clean(body.message,5000);
  if(!user)return fail("Войдите или создайте аккаунт, чтобы отправить обращение",401);
  if(subject.length<4||message.length<10)return fail("Тема — минимум 4 символа, описание — минимум 10");
  const id=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO tickets(id,user_id,guest_name,guest_email,access_hash,subject,status,priority,created_at,updated_at) VALUES(?,?,NULL,NULL,NULL,?,'open','normal',datetime('now'),datetime('now'))`).bind(id,user.id,subject).run();
  await env.DB.prepare("INSERT INTO comments(id,ticket_id,user_id,author_name,body,created_at) VALUES(?,?,?,?,?,datetime('now'))").bind(crypto.randomUUID(),id,user.id,user.username,message).run();
  return json({ticket:{id,subject,status:"open"}},201);
 }
 if(path==="tickets"&&method==="GET"){
  const user=await currentUser(request,env);if(!user)return fail("Войдите, чтобы просматривать свои обращения",401);
  const result=await env.DB.prepare("SELECT id,subject,status,priority,created_at,updated_at FROM tickets WHERE user_id=? ORDER BY updated_at DESC LIMIT 100").bind(user.id).all();return json({tickets:result.results});
 }
 const ticketMatch=path.match(/^tickets\/([0-9a-f-]{36})$/i);
 if(ticketMatch&&method==="GET"){
  const id=ticketMatch[1],user=await currentUser(request,env),key=url.searchParams.get("key")||"",ticket=await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(id).first();
  if(!ticket)return fail("Обращение не найдено",404);
  const allowed=user?.role==="admin"||(user&&ticket.user_id===user.id)||(key&&ticket.access_hash&&await sha256(key)===ticket.access_hash);
  if(!allowed)return fail("Нет доступа к обращению",403);
  const comments=await env.DB.prepare("SELECT id,author_name,body,created_at FROM comments WHERE ticket_id=? ORDER BY created_at").bind(id).all();
  return json({ticket:{id:ticket.id,user_id:ticket.user_id,subject:ticket.subject,status:ticket.status,priority:ticket.priority,created_at:ticket.created_at},comments:comments.results});
 }
 const commentMatch=path.match(/^tickets\/([0-9a-f-]{36})\/comments$/i);
 if(commentMatch&&method==="POST"){
  const user=await currentUser(request,env);if(!user)return fail("Войдите в аккаунт, чтобы комментировать",401);
  const id=commentMatch[1],ticket=await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(id).first();
  if(!ticket)return fail("Обращение не найдено",404);
  if(user.role!=="admin"&&ticket.user_id!==user.id)return fail("Нет доступа к обращению",403);
  const body=await readBody(request),message=clean(body.body,5000);if(message.length<2)return fail("Комментарий слишком короткий");
  await env.DB.prepare("INSERT INTO comments(id,ticket_id,user_id,author_name,body,created_at) VALUES(?,?,?,?,?,datetime('now'))").bind(crypto.randomUUID(),id,user.id,user.username,message).run();
  await env.DB.prepare("UPDATE tickets SET updated_at=datetime('now') WHERE id=?").bind(id).run();return json({ok:true},201);
 }
 if(path==="admin/login"&&method==="POST"){
  const body=await readBody(request),email=clean(body.email,254).toLowerCase(),password=typeof body.password==="string"?body.password:"";
  if(!env.ADMIN_EMAIL||!env.ADMIN_PASSWORD_HASH)return fail("Администратор не настроен в Cloudflare",503);
  if(email!==env.ADMIN_EMAIL.toLowerCase()||!(await verifyPassword(password,env.ADMIN_PASSWORD_HASH)))return fail("Неверные данные администратора",401);
  let admin=await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  if(!admin){const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO users(id,email,username,password_hash,role) VALUES(?,?, 'Администратор',?,'admin')").bind(id,email,env.ADMIN_PASSWORD_HASH).run();admin={id,email,username:"Администратор",role:"admin"};}
  else{await env.DB.prepare("UPDATE users SET role='admin' WHERE id=?").bind(admin.id).run();admin.role="admin";}
  const token=await createSession(admin.id,env);return json({user:viewUser(admin)},200,{"set-cookie":setCookie(token)});
 }
 if(path==="admin/tickets"&&method==="GET"){
  const user=await currentUser(request,env);if(user?.role!=="admin")return fail("Требуется вход администратора",403);
  const status=url.searchParams.get("status")||"all",result=status==="all"?await env.DB.prepare("SELECT * FROM tickets ORDER BY updated_at DESC LIMIT 300").all():await env.DB.prepare("SELECT * FROM tickets WHERE status=? ORDER BY updated_at DESC LIMIT 300").bind(status).all();
  return json({tickets:result.results});
 }
 const adminTicket=path.match(/^admin\/tickets\/([0-9a-f-]{36})$/i);
 if(adminTicket&&method==="PATCH"){
  const user=await currentUser(request,env);if(user?.role!=="admin")return fail("Требуется вход администратора",403);
  const body=await readBody(request),status=["open","in_progress","answered","closed"].includes(body.status)?body.status:null,priority=["low","normal","high","urgent"].includes(body.priority)?body.priority:null;
  if(!status&&!priority)return fail("Нет допустимых изменений");
  await env.DB.prepare("UPDATE tickets SET status=COALESCE(?,status),priority=COALESCE(?,priority),updated_at=datetime('now') WHERE id=?").bind(status,priority,adminTicket[1]).run();return json({ok:true});
 }
 return fail("Маршрут не найден",404);
}
export async function onRequest({request,env}){
 try{
  const url=new URL(request.url);
  if(url.pathname==="/api/crypto-diagnostic"&&request.method==="GET"){
   const password=new TextEncoder().encode("fragzone-runtime-check");
   const salt=new TextEncoder().encode("diagnostic-salt");
   const runs=3;
   const started=performance.now();
   let key;
   for(let i=0;i<runs;i++){
    key=await new Promise((resolve,reject)=>pbkdf2(password,salt,100000,32,"sha256",(error,derived)=>error?reject(error):resolve(derived)));
   }
   const elapsedMs=Number((performance.now()-started).toFixed(3));
   return json({diagnostic:"native-pbkdf2-100k",ok:true,bytes:key.byteLength,runs,totalElapsedMs:elapsedMs,averageElapsedMs:Number((elapsedMs/runs).toFixed(3))},200,{"cache-control":"no-store"});
  }
  return await handle(request,env);
  }catch(error){
  const errorId=crypto.randomUUID();
  const message=String(error?.message||"Unknown error");
  // Log only diagnostic metadata; never log request bodies, passwords, cookies, or secrets.
  console.error("FRAGZONE_API_ERROR", {errorId,name:error?.name||"Error",message});
  if(/no such table/i.test(message))return json({error:"Таблицы поддержки не созданы. Выполните schema.sql в подключённой базе D1.",errorId},503);
  return json({error:"Внутренняя ошибка сервера. Передайте поддержке код ошибки.",errorId},500);
 }
}
