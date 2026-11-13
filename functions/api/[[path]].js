import { pbkdf2 } from "node:crypto";

const COOKIE = "fz_session";
const SESSION_DAYS = 14;
const PBKDF2_ITERATIONS = 100000;
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
async function verifyPassword(password,encoded){
 if(typeof encoded!=="string")return "invalid";
 const parts=encoded.split("$");
 if(parts.length!==4||parts[0]!=="pbkdf2"||parts[1]!==String(PBKDF2_ITERATIONS)||!/^[0-9a-f]{32}$/i.test(parts[2])||!/^[0-9a-f]{64}$/i.test(parts[3]))return "legacy";
 const actual=await derivePassword(password,parts[2]);
 const expected=parts[3].toLowerCase();
 let difference=0;
 for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
 return difference===0;
}
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
function isOwner(user,env){return !!user&&clean(env.ADMIN_EMAIL,254).toLowerCase()===String(user.email||'').toLowerCase();}
function viewUser(user,env){const owner=isOwner(user,env);return{id:user.id,email:user.email,username:user.username,role:owner?'owner':user.role,isOwner:owner};}

async function handle(request,env){
 if(!env.DB)return fail("База D1 не подключена. В Cloudflare Pages → Settings → Bindings добавьте D1 database binding с именем DB.",503);
 const url=new URL(request.url),path=url.pathname.replace(/^\/api\/?/,"").replace(/\/+$/,""),method=request.method.toUpperCase();
 if(method==="OPTIONS")return new Response(null,{status:204});
 const origin=request.headers.get("Origin");if(origin&&origin!==url.origin)return fail("Недопустимый источник запроса",403);
 if(path==="auth/me"&&method==="GET"){const user=await currentUser(request,env);return json({user:user?viewUser(user,env):null});}
 if(path==="auth/register"&&method==="POST"){
  const body=await readBody(request),email=clean(body.email,254).toLowerCase(),username=clean(body.username,32),password=typeof body.password==="string"?body.password:"";
  if(!validEmail(email))return fail("Укажите корректный email");
  if(username.length<2)return fail("Имя должно содержать минимум 2 символа");
  if(password.length<10||password.length>128)return fail("Пароль должен содержать от 10 до 128 символов");
  if(email===clean(env.ADMIN_EMAIL,254).toLowerCase())return fail("Этот email зарезервирован для владельца",409);
  if(await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first())return fail("Аккаунт с таким email уже существует",409);
  const salt=randomHex(16),hash="pbkdf2$"+PBKDF2_ITERATIONS+"$"+salt+"$"+await derivePassword(password,salt),id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users(id,email,username,password_hash,role) VALUES(?,?,?,?,'user')").bind(id,email,username,hash).run();
  const token=await createSession(id,env);return json({user:{id,email,username,role:"user"}},201,{"set-cookie":setCookie(token)});
 }
 if(path==="auth/login"&&method==="POST"){
  const body=await readBody(request),email=clean(body.email,254).toLowerCase(),password=typeof body.password==="string"?body.password:"";
  const user=await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  if(!user)return fail("Неверный email или пароль",401);
  const passwordCheck=await verifyPassword(password,user.password_hash);
  if(passwordCheck==="legacy")return fail("Для этого аккаунта требуется восстановление пароля: сохранённый хеш использует старый формат, несовместимый с бесплатным тарифом Cloudflare.",409);
  if(passwordCheck!==true)return fail("Неверный email или пароль",401);
  const token=await createSession(user.id,env);return json({user:viewUser(user,env)},200,{"set-cookie":setCookie(token)});
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
  const configuredAdminEmail=clean(env.ADMIN_EMAIL,254).toLowerCase();
  const configuredAdminHash=typeof env.ADMIN_PASSWORD_HASH==="string"?env.ADMIN_PASSWORD_HASH.trim():"";
  if(!configuredAdminEmail||!configuredAdminHash)return fail("Администратор не настроен в Cloudflare",503);
  if(email!==configuredAdminEmail)return fail("Неверные данные администратора",401);
  const adminPasswordCheck=await verifyPassword(password,configuredAdminHash);
  if(adminPasswordCheck==="legacy")return fail("Хеш ADMIN_PASSWORD_HASH нужно обновить до формата pbkdf2$100000$salt$hash для бесплатного тарифа.",503);
  if(adminPasswordCheck!==true)return fail("Неверные данные администратора",401);
  let admin=await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  if(!admin){const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO users(id,email,username,password_hash,role) VALUES(?,?, 'Администратор',?,'admin')").bind(id,email,configuredAdminHash).run();admin={id,email,username:"Администратор",role:"admin"};}
  else{await env.DB.prepare("UPDATE users SET role='admin' WHERE id=?").bind(admin.id).run();admin.role="admin";}
  const token=await createSession(admin.id,env);return json({user:viewUser(admin,env)},200,{"set-cookie":setCookie(token)});
 }
 if(path==="admin/users"&&method==="GET"){
  const user=await currentUser(request,env);if(!isOwner(user,env))return fail("Только владелец может управлять администраторами",403);
  const result=await env.DB.prepare("SELECT id,email,username,role,created_at FROM users ORDER BY created_at DESC LIMIT 500").all();
  const ownerEmail=clean(env.ADMIN_EMAIL,254).toLowerCase();
  return json({users:result.results.map(item=>({...item,role:String(item.email).toLowerCase()===ownerEmail?"owner":item.role}))});
 }
 if(path==="admin/users"&&method==="POST"){
  const actor=await currentUser(request,env);if(!isOwner(actor,env))return fail("Только владелец может управлять администраторами",403);
  const body=await readBody(request),email=clean(body.email,254).toLowerCase(),role=body.role;
  if(!validEmail(email))return fail("Укажите корректный email");
  if(!["user","admin"].includes(role))return fail("Допустимые роли: user или admin");
  if(email===clean(env.ADMIN_EMAIL,254).toLowerCase())return fail("Нельзя изменить роль владельца",403);
  const target=await env.DB.prepare("SELECT id,email,username FROM users WHERE email=?").bind(email).first();
  if(!target)return fail("Пользователь с таким email не найден. Сначала он должен зарегистрироваться.",404);
  await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(role,target.id).run();
  return json({ok:true,user:{id:target.id,email:target.email,username:target.username,role}});
 }
 const adminUser=path.match(new RegExp("^admin/users/([0-9a-f-]{36})$","i"));
 if(adminUser&&method==="PATCH"){
  const actor=await currentUser(request,env);if(!isOwner(actor,env))return fail("Только владелец может управлять администраторами",403);
  const body=await readBody(request),role=body.role;
  if(!["user","admin"].includes(role))return fail("Допустимые роли: user или admin");
  const target=await env.DB.prepare("SELECT id,email FROM users WHERE id=?").bind(adminUser[1]).first();
  if(!target)return fail("Пользователь не найден",404);
  if(String(target.email).toLowerCase()===clean(env.ADMIN_EMAIL,254).toLowerCase())return fail("Нельзя изменить роль владельца",403);
  await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(role,target.id).run();
  return json({ok:true,user:{id:target.id,email:target.email,role}});
 }
 if(path==="admin/tickets"&&method==="GET"){
  const user=await currentUser(request,env);if(user?.role!=="admin")return fail("Требуется вход администратора",403);
  const status=url.searchParams.get("status")||"all";if(!["all","open","in_progress","answered","closed"].includes(status))return fail("Недопустимый фильтр статуса");
  const sql="SELECT t.*,u.email AS user_email,u.username AS user_name,(SELECT COUNT(*) FROM comments c WHERE c.ticket_id=t.id) AS comment_count FROM tickets t LEFT JOIN users u ON u.id=t.user_id "+(status==="all"?"":"WHERE t.status=? ")+"ORDER BY t.updated_at DESC LIMIT 300";
  const result=status==="all"?await env.DB.prepare(sql).all():await env.DB.prepare(sql).bind(status).all();
  return json({tickets:result.results,total:result.results.length});
 }
 const adminTicket=path.match(/^admin\/tickets\/([0-9a-f-]{36})$/i);
 if(adminTicket&&method==="PATCH"){
  const user=await currentUser(request,env);if(user?.role!=="admin")return fail("Требуется вход администратора",403);
  const body=await readBody(request),status=["open","in_progress","answered","closed"].includes(body.status)?body.status:null,priority=["low","normal","high","urgent"].includes(body.priority)?body.priority:null;
  if(!status&&!priority)return fail("Нет допустимых изменений");
  const result=await env.DB.prepare("UPDATE tickets SET status=COALESCE(?,status),priority=COALESCE(?,priority),updated_at=datetime('now') WHERE id=?").bind(status,priority,adminTicket[1]).run();if(!result.meta?.changes)return fail("Обращение не найдено",404);return json({ok:true});
 }
 return fail("Маршрут не найден",404);
}
export async function onRequest({request,env}){
 try{return await handle(request,env);}
 catch(error){
  const errorId=crypto.randomUUID();
  const message=String(error?.message||"Unknown error");
  // Log only diagnostic metadata; never log request bodies, passwords, cookies, or secrets.
  console.error("FRAGZONE_API_ERROR", {errorId,name:error?.name||"Error",message});
  if(/no such table/i.test(message))return json({error:"Таблицы поддержки не созданы. Выполните schema.sql в подключённой базе D1.",errorId},503);
  return json({error:"Внутренняя ошибка сервера. Передайте поддержке код ошибки.",errorId},500);
 }
}
