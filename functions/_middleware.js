const COOKIE="fz_session";
async function sha256(value){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function cookie(request){const part=(request.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));return part?part.slice(COOKIE.length+1):"";}
function maintenancePage(message){const safe=String(message||"Сайт временно недоступен. Попробуйте зайти позже.").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");return new Response(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FRAGZONE — Технические работы</title><body style="margin:0;background:#080b10;color:#eef3fa;font:16px system-ui;display:grid;min-height:100vh;place-items:center;text-align:center"><main style="max-width:560px;padding:32px"><p style="letter-spacing:.2em;color:#91a0b5">FRAGZONE</p><h1>Технические работы</h1><p style="color:#aab8ca">${safe}</p></main></body></html>`,{status:503,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","retry-after":"300"}});}
export async function onRequest({request,env,next}){
 if(!env.DB)return next();
 try{
  // Enforce active account bans across every page and API route, not only API handlers.
  const sessionToken=cookie(request);
  if(sessionToken){
   const sessionHash=await sha256(sessionToken);
   const banned=await env.DB.prepare("SELECT u.email,p.reason,p.expires_at FROM sessions s JOIN users u ON u.id=s.user_id JOIN punishments p ON p.user_id=u.id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND p.type='ban' AND p.scope='full' AND p.active=1 AND (p.expires_at IS NULL OR p.expires_at>datetime('now')) ORDER BY p.created_at DESC LIMIT 1").bind(sessionHash).first();
   const ownerEmail=String(env.ADMIN_EMAIL||"").trim().toLowerCase();
   const isOwner=!!banned&&String(banned.email||"").trim().toLowerCase()===ownerEmail;
   const path=new URL(request.url).pathname;
   const isLogout=path==="/api/auth/logout"&&request.method==="POST";
   if(banned&&!isOwner&&!isLogout){
    if(path==="/api"||path.startsWith("/api/"))return Response.json({error:"Полный бан аккаунта. Доступ к API запрещён."},{status:403,headers:{"cache-control":"no-store"}});
    return new Response("<!doctype html><html lang=\"ru\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>FRAGZONE — Аккаунт заблокирован</title><body style=\"margin:0;background:#080b10;color:#eef3fa;font:16px system-ui;display:grid;min-height:100vh;place-items:center;text-align:center\"><main style=\"max-width:560px;padding:32px\"><p style=\"letter-spacing:.2em;color:#91a0b5\">FRAGZONE</p><h1>Аккаунт заблокирован</h1><p style=\"color:#aab8ca\">Доступ к сайту и его функциям ограничен администрацией.</p><p style=\"color:#aab8ca\">Причина: "+String(banned.reason||"Не указана").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+"</p><p style=\"color:#aab8ca\">Срок: "+(banned.expires_at?new Date(String(banned.expires_at).replace(" ","T")+"Z").toLocaleString("ru-RU",{timeZone:"Europe/Moscow"}):"Навсегда")+"</p></main></body></html>",{status:403,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
   }
  }
  const setting=await env.DB.prepare("SELECT key,value FROM site_settings WHERE key IN ('maintenance_mode','maintenance_message')").all();
  const values=Object.fromEntries((setting.results||[]).map(x=>[x.key,x.value]));
  if(values.maintenance_mode!=="true")return next();
  const path=new URL(request.url).pathname;
  const safePaths=["/support/owner.html","/support/owner.js","/support/support.css","/support/support.js"];
  const safeApi=["/api/admin/login","/api/auth/login","/api/auth/me","/api/auth/logout"];
  if(safePaths.includes(path)||safeApi.includes(path))return next();
  const token=cookie(request);
  if(token){
   const hash=await sha256(token);
   const owner=await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND lower(u.email)=lower(?)").bind(hash,String(env.ADMIN_EMAIL||"").trim()).first();
   if(owner)return next();
  }
  return maintenancePage(values.maintenance_message);
 }catch(error){
  // Never let an unavailable or unmigrated settings table take down every Pages request.
  return next();
 }
}
