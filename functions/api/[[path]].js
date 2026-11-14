import { pbkdf2 } from "node:crypto";

const COOKIE = "fz_session";
const SESSION_DAYS = 14;
const PBKDF2_ITERATIONS = 100000;
const MAX_BODY = 20000;
const guestTicketRate = new Map();

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
 return env.DB.prepare(`SELECT u.id,u.email,u.username,u.role,COALESCE(ar.level,CASE WHEN u.role='admin' THEN 4 ELSE 0 END) AS level FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN admin_roles ar ON ar.user_id=u.id WHERE s.token_hash=? AND s.expires_at > datetime('now')`).bind(await sha256(token)).first();
}
async function createSession(userId,env){
 const token=randomHex(32),expires=new Date(Date.now()+SESSION_DAYS*86400000).toISOString().slice(0,19).replace("T"," ");
 await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256(token),userId,expires).run();return token;
}
function isOwner(user,env){return !!user&&clean(env.ADMIN_EMAIL,254).toLowerCase()===String(user.email||'').toLowerCase();}
function isAdmin(user,env){return !!user&&(Number(user.level||0)>=1||user.role==="admin"||isOwner(user,env));}
function staffLevel(user,env){return isOwner(user,env)?6:Number(user?.level||(user?.role==="admin"?4:0));}
function staffRole(level){return ({0:"user",1:"helper",2:"moderator",3:"senior_moderator",4:"administrator",5:"head_admin",6:"owner"})[level]||"user";}
function can(user,env,minimum){return staffLevel(user,env)>=minimum;}
function viewUser(user,env){const owner=isOwner(user,env),level=staffLevel(user,env);return{id:user.id,email:user.email,username:user.username,role:owner?'owner':(level?staffRole(level):'user'),level,isOwner:owner};}

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
  const guestName=clean(body.name,60),guestEmail=clean(body.email,254).toLowerCase();
  if(clean(body.website,200))return fail("Не удалось отправить обращение",400);
  if(subject.length<4||message.length<10)return fail("Тема — минимум 4 символа, описание — минимум 10");
  if(!user&&(!guestName||!validEmail(guestEmail)))return fail("Для отправки без аккаунта укажите имя и корректный email");
  if(!user){
   const ip=request.headers.get("CF-Connecting-IP");
   if(ip){
    const rateKey=await sha256(ip),now=Date.now(),recent=(guestTicketRate.get(rateKey)||[]).filter(time=>now-time<10*60*1000);
    if(recent.length>=3)return fail("Слишком много обращений. Попробуйте ещё раз через несколько минут.",429);
    recent.push(now);guestTicketRate.set(rateKey,recent);
    if(guestTicketRate.size>1000)for(const [key,times] of guestTicketRate)if(!times.length||now-times[times.length-1]>10*60*1000)guestTicketRate.delete(key);
   }
  }
  const id=crypto.randomUUID(),guestKey=user?null:randomHex(32),author=user?user.username:guestName;
  await env.DB.prepare("INSERT INTO tickets(id,user_id,guest_name,guest_email,access_hash,subject,status,priority,created_at,updated_at) VALUES(?,?,?,?,?,?,'open','normal',datetime('now'),datetime('now'))").bind(id,user?.id||null,user?null:guestName,user?null:guestEmail,guestKey?await sha256(guestKey):null,subject).run();
  await env.DB.prepare("INSERT INTO comments(id,ticket_id,user_id,author_name,body,created_at) VALUES(?,?,?,?,?,datetime('now'))").bind(crypto.randomUUID(),id,user?.id||null,author,message).run();
  const ticketUrl="/support/ticket.html?id="+encodeURIComponent(id)+(guestKey?"&key="+encodeURIComponent(guestKey):"");
  return json({ticket:{id,subject,status:"open",url:ticketUrl}},201);
 }
 if(path==="tickets"&&method==="GET"){
  const user=await currentUser(request,env);if(!user)return fail("Войдите, чтобы просматривать свои обращения",401);
  const result=await env.DB.prepare("SELECT id,subject,status,priority,created_at,updated_at FROM tickets WHERE user_id=? ORDER BY updated_at DESC LIMIT 100").bind(user.id).all();return json({tickets:result.results});
 }
 const ticketMatch=path.match(/^tickets\/([0-9a-f-]{36})$/i);
 if(ticketMatch&&method==="GET"){
  const id=ticketMatch[1],user=await currentUser(request,env),key=url.searchParams.get("key")||"",ticket=await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(id).first();
  if(!ticket)return fail("Обращение не найдено",404);
  const allowed=isAdmin(user,env)||(user&&ticket.user_id===user.id)||(key&&ticket.access_hash&&await sha256(key)===ticket.access_hash);
  if(!allowed)return fail("Нет доступа к обращению",403);
  const comments=await env.DB.prepare("SELECT id,author_name,body,created_at FROM comments WHERE ticket_id=? ORDER BY created_at").bind(id).all();
  return json({ticket:{id:ticket.id,user_id:ticket.user_id,guest_name:ticket.guest_name,guest_email:ticket.guest_email,subject:ticket.subject,status:ticket.status,priority:ticket.priority,created_at:ticket.created_at},comments:comments.results});
 }
 if(ticketMatch&&method==="PATCH"){
  const body=await readBody(request),user=await currentUser(request,env),id=ticketMatch[1],ticket=await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(id).first();
  if(!ticket)return fail("Обращение не найдено",404);
  const key=clean(body.key,128),guestAllowed=!!(key&&ticket.access_hash&&await sha256(key)===ticket.access_hash),admin=isAdmin(user,env),owner=!!(user&&ticket.user_id===user.id);
  if(!admin&&!owner&&!guestAllowed)return fail("Нет доступа к обращению",403);
  const status=clean(body.status,20);
  if(status!=="closed"&&!(admin&&["open","in_progress","answered"].includes(status)))return fail("Можно только закрыть своё обращение. Повторное открытие доступно администратору.",403);
  await env.DB.prepare("UPDATE tickets SET status=?,updated_at=datetime('now') WHERE id=?").bind(status,id).run();
  return json({ok:true,status});
 }
 const commentMatch=path.match(/^tickets\/([0-9a-f-]{36})\/comments$/i);
 if(commentMatch&&method==="POST"){
  const body=await readBody(request),user=await currentUser(request,env),id=commentMatch[1],ticket=await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(id).first();
  if(!ticket)return fail("Обращение не найдено",404);
  const key=clean(body.key,128),guestAllowed=!!(key&&ticket.access_hash&&await sha256(key)===ticket.access_hash);
  if(!isAdmin(user,env)&&!(user&&ticket.user_id===user.id)&&!guestAllowed)return fail("Нет доступа к обращению",403);
  if(ticket.status==="closed"&&!isAdmin(user,env))return fail("Обращение закрыто. Если проблема повторилась, создайте новое.",409);
  const message=clean(body.body,5000);if(message.length<2)return fail("Комментарий слишком короткий");
  const author=user?user.username:(ticket.guest_name||"Автор обращения");
  await env.DB.prepare("INSERT INTO comments(id,ticket_id,user_id,author_name,body,created_at) VALUES(?,?,?,?,?,datetime('now'))").bind(crypto.randomUUID(),id,user?.id||null,author,message).run();
  await env.DB.prepare("UPDATE tickets SET updated_at=datetime('now'),status=CASE WHEN status='answered' THEN 'open' ELSE status END WHERE id=?").bind(id).run();return json({ok:true},201);
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
  const user=await currentUser(request,env);if(!isAdmin(user,env))return fail("Требуется вход администратора",403);
  const status=url.searchParams.get("status")||"all";if(!["all","open","in_progress","answered","closed"].includes(status))return fail("Недопустимый фильтр статуса");
  const sql="SELECT t.*,u.email AS user_email,u.username AS user_name,(SELECT COUNT(*) FROM comments c WHERE c.ticket_id=t.id) AS comment_count FROM tickets t LEFT JOIN users u ON u.id=t.user_id "+(status==="all"?"":"WHERE t.status=? ")+"ORDER BY t.updated_at DESC LIMIT 300";
  const result=status==="all"?await env.DB.prepare(sql).all():await env.DB.prepare(sql).bind(status).all();
  return json({tickets:result.results,total:result.results.length});
 }
 const adminTicket=path.match(/^admin\/tickets\/([0-9a-f-]{36})$/i);
 if(adminTicket&&method==="PATCH"){
  const user=await currentUser(request,env);if(!isAdmin(user,env))return fail("Требуется вход администратора",403);
  const body=await readBody(request),status=["open","in_progress","answered","closed"].includes(body.status)?body.status:null,priority=["low","normal","high","urgent"].includes(body.priority)?body.priority:null;
  if(!status&&!priority)return fail("Нет допустимых изменений");
  const result=await env.DB.prepare("UPDATE tickets SET status=COALESCE(?,status),priority=COALESCE(?,priority),updated_at=datetime('now') WHERE id=?").bind(status,priority,adminTicket[1]).run();if(!result.meta?.changes)return fail("Обращение не найдено",404);return json({ok:true});
 }

 if(path==="admin/dashboard"&&method==="GET"){
  const actor=await currentUser(request,env);if(!isAdmin(actor,env))return fail("Требуется доступ администрации",403);
  const [users,tickets,open,warns,bans,staff]=await Promise.all([
   env.DB.prepare("SELECT COUNT(*) AS n FROM users").first(),
   env.DB.prepare("SELECT COUNT(*) AS n FROM tickets").first(),
   env.DB.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status IN ('open','in_progress')").first(),
   env.DB.prepare("SELECT COUNT(*) AS n FROM punishments WHERE type='warn' AND active=1").first(),
   env.DB.prepare("SELECT COUNT(*) AS n FROM punishments WHERE type='ban' AND active=1").first(),
   env.DB.prepare("SELECT COUNT(*) AS n FROM admin_roles WHERE level>0").first()
  ]);
  return json({stats:{users:users?.n||0,tickets:tickets?.n||0,openTickets:open?.n||0,warns:warns?.n||0,bans:bans?.n||0,staff:staff?.n||0},me:viewUser(actor,env)});
 }
 if(path==="admin/staff"&&method==="GET"){
  const actor=await currentUser(request,env);if(!isOwner(actor,env))return fail("Только владелец может управлять уровнями",403);
  const rows=await env.DB.prepare("SELECT u.id,u.email,u.username,u.created_at,COALESCE(ar.level,CASE WHEN u.role='admin' THEN 4 ELSE 0 END) AS level FROM users u LEFT JOIN admin_roles ar ON ar.user_id=u.id ORDER BY level DESC,u.created_at DESC LIMIT 500").all();
  return json({staff:rows.results.map(x=>({...x,role:staffRole(String(x.email).toLowerCase()===clean(env.ADMIN_EMAIL,254).toLowerCase()?6:x.level)}))});
 }
 const staffMatch=path.match(/^admin\/staff\/([0-9a-f-]{36})$/i);
 if(staffMatch&&method==="PATCH"){
  const actor=await currentUser(request,env);if(!isOwner(actor,env))return fail("Только владелец может выдавать уровни",403);
  const body=await readBody(request),level=Number(body.level);
  if(!Number.isInteger(level)||level<0||level>5)return fail("Уровень должен быть от 0 до 5");
  const target=await env.DB.prepare("SELECT id,email FROM users WHERE id=?").bind(staffMatch[1]).first();
  if(!target)return fail("Пользователь не найден",404);
  if(String(target.email).toLowerCase()===clean(env.ADMIN_EMAIL,254).toLowerCase())return fail("Нельзя изменить владельца",403);
  await env.DB.prepare("INSERT INTO admin_roles(user_id,level,updated_by,updated_at) VALUES(?,?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET level=excluded.level,updated_by=excluded.updated_by,updated_at=datetime('now')").bind(target.id,level,actor.id).run();
  await env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,datetime('now'))").bind(crypto.randomUUID(),actor.id,"staff.level",target.id,JSON.stringify({level})).run();
  return json({ok:true,level,role:staffRole(level)});
 }
 if(path==="admin/punishments"&&method==="GET"){
  const actor=await currentUser(request,env);if(!can(actor,env,3))return fail("Нужен уровень 3 или выше",403);
  const rows=await env.DB.prepare("SELECT p.*,u.username AS target_username,u.email AS target_email,a.username AS actor_username FROM punishments p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN users a ON a.id=p.actor_id ORDER BY p.created_at DESC LIMIT 300").all();
  return json({punishments:rows.results});
 }
 if(path==="admin/punishments"&&method==="POST"){
  const actor=await currentUser(request,env);if(!isAdmin(actor,env))return fail("Требуется доступ администрации",403);
  const body=await readBody(request),type=clean(body.type,12),userId=clean(body.userId,64),reason=clean(body.reason,500);
  if(!["warn","ban","mute"].includes(type)||!userId||reason.length<3)return fail("Укажите тип наказания, пользователя и причину");
  const required=type==="warn"?5:type==="ban"?4:2;
  if(!can(actor,env,required))return fail("Недостаточно прав для этого наказания",403);
  const target=await env.DB.prepare("SELECT id,email FROM users WHERE id=?").bind(userId).first();
  if(!target)return fail("Пользователь не найден",404);
  if(isOwner({email:target.email},env))return fail("Нельзя наказать владельца",403);
  const expires=body.expiresAt?clean(body.expiresAt,30):null;
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO punishments(id,user_id,actor_id,type,reason,expires_at,active,created_at) VALUES(?,?,?,?,?,?,1,datetime('now'))").bind(id,userId,actor.id,type,reason,expires).run();
  await env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,datetime('now'))").bind(crypto.randomUUID(),actor.id,"punishment."+type,userId,JSON.stringify({reason,expiresAt:expires})).run();
  return json({ok:true,id},201);
 }
 const punishmentMatch=path.match(/^admin\/punishments\/([0-9a-f-]{36})$/i);
 if(punishmentMatch&&method==="PATCH"){
  const actor=await currentUser(request,env);if(!can(actor,env,5))return fail("Нужен уровень 5 или владелец",403);
  const body=await readBody(request),active=body.active===true?1:body.active===false?0:null;
  if(active===null)return fail("Укажите active: true или false");
  await env.DB.prepare("UPDATE punishments SET active=? WHERE id=?").bind(active,punishmentMatch[1]).run();
  await env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,datetime('now'))").bind(crypto.randomUUID(),actor.id,"punishment.update",punishmentMatch[1],JSON.stringify({active:!!active})).run();
  return json({ok:true});
 }
 if(path==="admin/audit"&&method==="GET"){
  const actor=await currentUser(request,env);if(!can(actor,env,3))return fail("Нужен уровень 3 или выше",403);
  const rows=await env.DB.prepare("SELECT l.*,u.username AS actor_username FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.created_at DESC LIMIT 500").all();
  return json({logs:rows.results});
 }
 if(path==="admin/settings"&&method==="GET"){
  const actor=await currentUser(request,env);if(!isOwner(actor,env))return fail("Только владелец",403);
  const rows=await env.DB.prepare("SELECT key,value,updated_at FROM site_settings ORDER BY key").all();return json({settings:rows.results});
 }
 if(path==="admin/settings"&&method==="PATCH"){
  const actor=await currentUser(request,env);if(!isOwner(actor,env))return fail("Только владелец",403);
  const body=await readBody(request),key=clean(body.key,64),value=clean(body.value,2000);
  if(!["maintenance_mode","registration_enabled","announcement","announcement_enabled"].includes(key))return fail("Недопустимая настройка");
  await env.DB.prepare("INSERT INTO site_settings(key,value,updated_by,updated_at) VALUES(?,?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=datetime('now')").bind(key,value,actor.id).run();
  await env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,datetime('now'))").bind(crypto.randomUUID(),actor.id,"settings.update",key,JSON.stringify({value})).run();
  return json({ok:true});
 }
 if(path==="admin/ticket-notes"&&method==="GET"){
  const actor=await currentUser(request,env);if(!can(actor,env,3))return fail("Нужен уровень 3 или выше",403);
  const ticketId=clean(url.searchParams.get("ticketId"),64);if(!ticketId)return fail("Укажите ticketId");
  const rows=await env.DB.prepare("SELECT n.*,u.username AS author FROM ticket_internal_notes n LEFT JOIN users u ON u.id=n.author_id WHERE n.ticket_id=? ORDER BY n.created_at").bind(ticketId).all();return json({notes:rows.results});
 }
 if(path==="admin/ticket-notes"&&method==="POST"){
  const actor=await currentUser(request,env);if(!can(actor,env,3))return fail("Нужен уровень 3 или выше",403);
  const body=await readBody(request),ticketId=clean(body.ticketId,64),note=clean(body.note,2000);
  if(!ticketId||note.length<2)return fail("Заметка слишком короткая");
  await env.DB.prepare("INSERT INTO ticket_internal_notes(id,ticket_id,author_id,note,created_at) VALUES(?,?,?,?,datetime('now'))").bind(crypto.randomUUID(),ticketId,actor.id,note).run();return json({ok:true},201);
 }
 if(path==="admin/logout-all"&&method==="POST"){
  const actor=await currentUser(request,env);if(!isOwner(actor,env))return fail("Только владелец",403);
  const body=await readBody(request),userId=clean(body.userId,64);if(!userId)return fail("Укажите пользователя");
  await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(userId).run();
  await env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,datetime('now'))").bind(crypto.randomUUID(),actor.id,"sessions.revoke",userId,"{}").run();return json({ok:true});
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
