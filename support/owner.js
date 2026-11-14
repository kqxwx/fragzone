const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function timedFetch(url,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{return await fetch(url,{...options,signal:controller.signal});}
 catch(error){if(error?.name==="AbortError")throw new Error("Сервер не ответил за 20 секунд. Попробуй ещё раз; если повторится, сообщи поддержке.");throw error;}
 finally{clearTimeout(timer);}
}
function responseError(data,fallback){return new Error((data.error||fallback)+(data.errorId?" (код ошибки: "+data.errorId+")":""));}
async function api(path,options={}){
 const send=()=>timedFetch("/api"+path,{credentials:"same-origin",headers:{"content-type":"application/json"},...options});
 let r=await send(),d=await r.json().catch(()=>({}));
 if(r.status===428&&d.error==="STEP_UP_REQUIRED"){
  const code=window.prompt("Для опасного действия подтверди личность: введи текущий код Google Authenticator.");
  if(!code)throw new Error("Действие отменено");
  const sr=await timedFetch("/api/auth/2fa/step-up",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({code})}),sd=await sr.json().catch(()=>({}));
  if(!sr.ok)throw responseError(sd,"Не удалось подтвердить 2FA");
  r=await send();d=await r.json().catch(()=>({}));
 }
 if(!r.ok)throw responseError(d,"Ошибка запроса");return d;
}
function say(s,bad=false){const e=$("#message");e.textContent=s;e.className="owner-alert"+(bad?" error":"");e.hidden=false;}
async function ownerMfa(enrollmentRequired,onDone,hostSelector){
 const form=$("#loginForm"),host=hostSelector?$(hostSelector):form.parentElement;if(!hostSelector)form.hidden=true;const wrap=document.createElement("section");wrap.className="owner-card owner-login";host.appendChild(wrap);let setup=null;
 try{if(enrollmentRequired)setup=await api("/auth/2fa/setup");}catch(e){say(e.message,true);wrap.remove();form.hidden=false;return;}
 const intro=enrollmentRequired?'<h2>Подключение Google Authenticator</h2><p>В приложении нажми «+» → «Ввести ключ настройки», выбери Time-based и введи ключ:</p><pre style="white-space:pre-wrap;user-select:all">'+esc(setup.secret)+'</pre><p>Не передавай этот секрет никому.</p>':'<h2>Подтверждение владельца</h2><p>Введи текущий 6-значный код Google Authenticator.</p>';
 wrap.innerHTML=intro+'<form id="ownerMfaForm"><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required><button class="fz-btn" type="submit">Подтвердить</button></form><p id="ownerMfaError" class="owner-muted"></p>';
 $("#ownerMfaForm").onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector("button");b.disabled=true;try{const result=await api("/auth/2fa/verify",{method:"POST",body:JSON.stringify({code:new FormData(e.currentTarget).get("code")})});if(result.backupCodes?.length){wrap.innerHTML='<h2>Сохрани резервные коды</h2><p>Каждый код одноразовый. Храни их отдельно от телефона.</p><pre style="white-space:pre-wrap;user-select:all">'+result.backupCodes.join("\n")+'</pre><button id="ownerMfaSaved" class="fz-btn" type="button">Я сохранил коды</button>';$("#ownerMfaSaved").onclick=onDone;}else await onDone();}catch(err){$("#ownerMfaError").textContent=err.message;b.disabled=false;}};
}
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
 $("#staffList").innerHTML=filtered.map(u=>'<div class="owner-row"><div><b>'+esc(u.username)+'</b><small>'+esc(u.email)+'</small><small>Текущий уровень: '+esc(u.role==="owner"?"OWNER":(levels[u.level]||u.level))+'</small><small>2FA: '+(u.mfa_enabled?"включена":"не настроена")+'</small></div><select data-level="'+esc(u.id)+'">'+[0,1,2,3,4,5].map(n=>'<option value="'+n+'" '+(Number(u.level)===n?"selected":"")+'>'+n+' — '+levels[n]+'</option>').join("")+'</select><button class="fz-btn" data-save-level="'+esc(u.id)+'" '+(u.role==="owner"?"disabled":"")+'>Сохранить уровень</button></div>').join("")||'<p class="owner-muted">Пользователи не найдены.</p>';
 for(const b of document.querySelectorAll("[data-save-level]")){
  const revoke=document.createElement("button");revoke.type="button";revoke.className="fz-btn owner-danger";revoke.textContent="Завершить сессии";revoke.dataset.revokeSessions=b.dataset.saveLevel;revoke.disabled=b.disabled;b.insertAdjacentElement("afterend",revoke);
 }
 for(const b of document.querySelectorAll("[data-save-level]")){
  const reset=document.createElement("button");reset.type="button";reset.className="fz-btn fz-btn-ghost";reset.textContent="Сбросить 2FA";reset.dataset.resetMfa=b.dataset.saveLevel;reset.disabled=b.disabled;b.insertAdjacentElement("afterend",reset);
 }
 for(const b of document.querySelectorAll("[data-reset-mfa]"))b.onclick=async()=>{if(!confirm("Сбросить 2FA сотрудника? Его активные сессии завершатся, при следующем входе он подключит Google Authenticator заново."))return;b.disabled=true;try{await api("/admin/2fa/reset",{method:"POST",body:JSON.stringify({userId:b.dataset.resetMfa})});say("2FA сотрудника сброшена. При следующем входе он подключит приложение заново.");await load();}catch(e){say(e.message,true);b.disabled=false;}};

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
$("#loginForm").onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type="submit"]'),f=new FormData(form);if(button.disabled)return;button.disabled=true;button.textContent="Выполняем вход…";say("Проверяем данные входа…");try{const result=await api("/admin/login",{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});if(result.twoFactorRequired)await ownerMfa(result.enrollmentRequired,load);else await load();}catch(err){say(err.message,true);}finally{if(!form.hidden){button.disabled=false;button.textContent="Войти";}}};
$("#logout").onclick=async()=>{await api("/auth/logout",{method:"POST",body:"{}"});location.reload();};
$("#resetOwnerMfa").onclick=async()=>{const b=$("#resetOwnerMfa");b.disabled=true;try{await api("/auth/2fa/re-enroll",{method:"POST",body:"{}"});await ownerMfa(true,load,"#ownerMfaArea");}catch(e){say(e.message,true);}finally{b.disabled=false;}};
$("#refresh").onclick=()=>load().catch(e=>say(e.message,true));
$("#staffSearch").oninput=renderStaff;
$("#punishForm").onsubmit=async e=>{e.preventDefault();const type=$("#punishType").value,expires=$("#punishExpiry").value;try{await api("/admin/punishments",{method:"POST",body:JSON.stringify({userId:$("#punishUser").value,type,reason:$("#punishReason").value,expiresAt:expires?new Date(expires).toISOString():null})});say("Наказание выдано");e.currentTarget.reset();await load();}catch(err){say(err.message,true);}};
$("#saveMaintenance").onclick=()=>saveSetting("maintenance_mode",$("#maintenance").value);
$("#saveRegistration").onclick=()=>saveSetting("registration_enabled",$("#registration").value);
$("#saveAnnouncement").onclick=async()=>{await saveSetting("announcement",$("#announcement").value);await saveSetting("announcement_enabled",$("#announcementEnabled").value);};
load().catch(e=>say(e.message,true));
