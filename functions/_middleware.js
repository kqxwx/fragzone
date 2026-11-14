const COOKIE="fz_session";
async function sha256(value){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function cookie(request){const part=(request.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));return part?part.slice(COOKIE.length+1):"";}
function maintenancePage(message){const safe=String(message||"Сайт временно недоступен. Попробуйте зайти позже.").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");return new Response(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FRAGZONE — Технические работы</title><body style="margin:0;background:#080b10;color:#eef3fa;font:16px system-ui;display:grid;min-height:100vh;place-items:center;text-align:center"><main style="max-width:560px;padding:32px"><p style="letter-spacing:.2em;color:#91a0b5">FRAGZONE</p><h1>Технические работы</h1><p style="color:#aab8ca">${safe}</p></main></body></html>`,{status:503,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","retry-after":"300"}});}
export async function onRequest({request,env,next}){
 if(!env.DB)return next();
 try{
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
