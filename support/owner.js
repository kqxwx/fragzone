const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path,options={}){const r=await fetch("/api"+path,{credentials:"same-origin",headers:{"content-type":"application/json"},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Ошибка запроса");return d;}
function say(s,bad=false){const e=$("#message");e.textContent=s;e.className="owner-alert"+(bad?" error":"");e.hidden=false;}
let users=[],punishments=[];
const levels={0:"Пользователь",1:"Helper",2:"Moderator",3:"Senior Moderator",4:"Administrator",5:"Head Administrator",6:"OWNER"};
async function load(){
 const me=await api("/auth/me");
 if(!me.user||!me.user.isOwner){$("#login").hidden=false;$("#panel").hidden=true;return;}
 $("#login").hidden=true;$("#panel").hidden=false;
 const [dash,staff,ps,logs,settings]=await Promise.all([api("/admin/dashboard"),api("/admin/staff"),api("/admin/punishments"),api("/admin/audit"),api("/admin/settings")]);
 $("#statUsers").textContent=dash.stats.users;$("#statTickets").textContent=dash.stats.tickets;$("#statOpen").textContent=dash.stats.openTickets;$("#statStaff").textContent=dash.stats.staff;$("#statWarns").textContent=dash.stats.warns;$("#statBans").textContent=dash.stats.bans;
 users=staff.staff||[];punishments=ps.punishments||[];renderStaff();renderPunishments();renderAudit(logs.logs||[]);renderSettings(settings.settings||[]);
}
function renderStaff(){
 const q=$("#staffSearch").value.toLowerCase();
 const filtered=users.filter(u=>(u.username+" "+u.email).toLowerCase().includes(q));
 $("#staffList").innerHTML=filtered.map(u=>'<div class="owner-row"><div><b>'+esc(u.username)+'</b><small>'+esc(u.email)+'</small><small>Текущий уровень: '+esc(u.role==="owner"?"OWNER":(levels[u.level]||u.level))+'</small></div><select data-level="'+esc(u.id)+'">'+[0,1,2,3,4,5].map(n=>'<option value="'+n+'" '+(Number(u.level)===n?"selected":"")+'>'+n+' — '+levels[n]+'</option>').join("")+'</select><button class="fz-btn" data-save-level="'+esc(u.id)+'" '+(u.role==="owner"?"disabled":"")+'>Сохранить уровень</button></div>').join("")||'<p class="owner-muted">Пользователи не найдены.</p>';
 for(const b of document.querySelectorAll("[data-save-level]")){
  const revoke=document.createElement("button");revoke.type="button";revoke.className="fz-btn owner-danger";revoke.textContent="Завершить сессии";revoke.dataset.revokeSessions=b.dataset.saveLevel;revoke.disabled=b.disabled;b.insertAdjacentElement("afterend",revoke);
 }
 for(const b of document.querySelectorAll("[data-revoke-sessions]"))b.onclick=async()=>{if(!confirm("Завершить все активные сессии этого пользователя?"))return;b.disabled=true;try{await api("/admin/logout-all",{method:"POST",body:JSON.stringify({userId:b.dataset.revokeSessions})});say("Все сессии пользователя завершены");}catch(e){say(e.message,true);}finally{b.disabled=false;}};
 for(const b of document.querySelectorAll("[data-save-level]"))b.onclick=async()=>{const id=b.dataset.saveLevel,select=document.querySelector('[data-level="'+CSS.escape(id)+'"]');b.disabled=true;try{await api("/admin/staff/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({level:Number(select.value)})});say("Уровень сотрудника обновлён");await load();}catch(e){say(e.message,true);b.disabled=false;}};
 $("#punishUser").innerHTML='<option value="">Выбери пользователя</option>'+users.filter(u=>u.role!=="owner").map(u=>'<option value="'+esc(u.id)+'">'+esc(u.username)+' — '+esc(u.email)+'</option>').join("");
}
function renderPunishments(){
 $("#punishmentList").innerHTML='<table class="owner-table"><thead><tr><th>Пользователь</th><th>Тип</th><th>Причина</th><th>Выдал</th><th>Статус</th><th></th></tr></thead><tbody>'+punishments.map(p=>'<tr><td>'+esc(p.target_username||p.target_email||p.user_id)+'</td><td>'+esc(p.type.toUpperCase())+'</td><td>'+esc(p.reason)+'</td><td>'+esc(p.actor_username||"—")+'</td><td>'+(p.active?"Активно":"Снято")+'</td><td>'+(p.active?'<button class="fz-btn fz-btn-ghost" data-revoke="'+esc(p.id)+'">Снять</button>':"—")+'</td></tr>').join("")+'</tbody></table>';
 for(const b of document.querySelectorAll("[data-revoke]"))b.onclick=async()=>{b.disabled=true;try{await api("/admin/punishments/"+encodeURIComponent(b.dataset.revoke),{method:"PATCH",body:JSON.stringify({active:false})});say("Наказание снято");await load();}catch(e){say(e.message,true);b.disabled=false;}};
}
function renderAudit(logs){$("#auditList").innerHTML='<table class="owner-table"><thead><tr><th>Дата</th><th>Сотрудник</th><th>Действие</th><th>Объект</th><th>Детали</th></tr></thead><tbody>'+logs.map(l=>'<tr><td>'+esc(l.created_at)+'</td><td>'+esc(l.actor_username||"Удалённый аккаунт")+'</td><td>'+esc(l.action)+'</td><td>'+esc(l.target_id||"—")+'</td><td>'+esc(l.details)+'</td></tr>').join("")+'</tbody></table>';}
function renderSettings(rows){const v=Object.fromEntries(rows.map(x=>[x.key,x.value]));$("#maintenance").value=v.maintenance_mode||"false";$("#registration").value=v.registration_enabled||"true";$("#announcement").value=v.announcement||"";$("#announcementEnabled").value=v.announcement_enabled||"false";}
async function saveSetting(key,value){await api("/admin/settings",{method:"PATCH",body:JSON.stringify({key,value})});say("Настройка сохранена");}
$("#loginForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/admin/login",{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});await load();}catch(err){say(err.message,true);}};
$("#logout").onclick=async()=>{await api("/auth/logout",{method:"POST",body:"{}"});location.reload();};
$("#refresh").onclick=()=>load().catch(e=>say(e.message,true));
$("#staffSearch").oninput=renderStaff;
$("#punishForm").onsubmit=async e=>{e.preventDefault();const type=$("#punishType").value,expires=$("#punishExpiry").value;try{await api("/admin/punishments",{method:"POST",body:JSON.stringify({userId:$("#punishUser").value,type,reason:$("#punishReason").value,expiresAt:expires?new Date(expires).toISOString():null})});say("Наказание выдано");e.currentTarget.reset();await load();}catch(err){say(err.message,true);}};
$("#saveMaintenance").onclick=()=>saveSetting("maintenance_mode",$("#maintenance").value);
$("#saveRegistration").onclick=()=>saveSetting("registration_enabled",$("#registration").value);
$("#saveAnnouncement").onclick=async()=>{await saveSetting("announcement",$("#announcement").value);await saveSetting("announcement_enabled",$("#announcementEnabled").value);};
load().catch(e=>say(e.message,true));
