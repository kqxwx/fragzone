const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path,options={}) {
  const res=await fetch("/api"+path,{credentials:"same-origin",headers:{"content-type":"application/json",...(options.headers||{})},...options});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"Ошибка запроса");
  return data;
}
function notice(message,bad=false){const el=$("#notice");if(el){el.textContent=message;el.className="notice"+(bad?" error":"");el.hidden=false;}}
function hideNotice(){if($("#notice"))$("#notice").hidden=true;}

async function home(){
 let me={user:null};
 try { me=await api("/auth/me"); }
 catch(err) { notice(err.message,true); }

 $("#accountArea").innerHTML=me.user?'<span>Вы вошли как <b>'+esc(me.user.username)+'</b></span> <button id="logoutBtn" class="fz-btn fz-btn-ghost">Выйти</button>':'<a class="fz-btn fz-login-link" href="#accountPanel">Войти</a>';
 if($("#logoutBtn"))$("#logoutBtn").onclick=async()=>{try{await api("/auth/logout",{method:"POST",body:"{}"});location.reload();}catch(err){notice(err.message,true);}};
 if($("#accountPanel"))$("#accountPanel").hidden=!!me.user;
 const ticketButton=$("#guestTicketForm button[type=submit], #guestTicketForm button");
 if($("#ticketAuthHint"))$("#ticketAuthHint").hidden=false;
 if($("#guestFields"))$("#guestFields").hidden=!!me.user;
 for(const field of $("#guestFields")?.querySelectorAll("input")||[])field.required=!me.user;
 if(ticketButton)ticketButton.disabled=false;

 $("#guestTicketForm").onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type="submit"]');hideNotice();
  const f=new FormData(form),kind=String(f.get("kind")||"БАГ"),subject=("["+kind+"] "+String(f.get("subject")||"").trim()).slice(0,120);
  button.disabled=true;const originalText=button.textContent;button.textContent="Отправляем…";
  try{
   const d=await api("/tickets",{method:"POST",body:JSON.stringify({subject,message:f.get("message"),name:f.get("name"),email:f.get("email"),website:f.get("website")})});
   $("#guestResult").innerHTML='Обращение создано! '+(d.ticket.url?'<a href="'+esc(d.ticket.url)+'">Открыть и сохранить ссылку на тикет</a>':'<a href="/support/my-tickets.html">Посмотреть мои обращения</a>')+'. Ссылка для гостевого обращения содержит секретный ключ — не передавай её посторонним.';
   $("#guestResult").hidden=false;form.reset();
  }catch(err){notice(err.message,true);}
  finally{button.disabled=false;button.textContent=originalText;}
 };
 if(me.user){
  try {const d=await api("/tickets");$("#myTickets").innerHTML=d.tickets.map(t=>'<a class="fz-ticket" href="/support/my-ticket.html?id='+encodeURIComponent(t.id)+'"><b>'+esc(t.subject)+'</b><span>'+esc(t.status)+' · '+esc(t.updated_at)+'</span></a>').join("")||"<p>Обращений пока нет.</p>";$("#myTicketsWrap").hidden=false;}
  catch(err){notice(err.message,true);}
 }
 if($("#authForm"))auth();
}
function auth(){
 const mode=$("#authMode"),form=$("#authForm");
 function setMode(v){mode.value=v;$("#authTitle").textContent=v==="register"?"Создать аккаунт":"Вход";$("#usernameField").hidden=v!=="register";$("#authUsername").required=v==="register";$("#authSubmit").textContent=v==="register"?"Зарегистрироваться":"Войти";$("#authSwitch").textContent=v==="register"?"Уже есть аккаунт? Войти":"Нет аккаунта? Создайте его";}
 setMode("login");$("#authSwitch").onclick=()=>setMode(mode.value==="login"?"register":"login");
 form.onsubmit=async e=>{e.preventDefault();hideNotice();const f=new FormData(form);try{await api("/auth/"+mode.value,{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password"),username:f.get("username")})});location.href="/support/";}catch(err){notice(err.message,true);}};
}
async function ticket(){
 const p=new URLSearchParams(location.search),id=p.get("id"),key=p.get("key");if(!id)return notice("Не указан номер обращения",true);
 try{
  const d=await api("/tickets/"+encodeURIComponent(id)+(key?"?key="+encodeURIComponent(key):""));
  const statusNames={open:"Открыт",in_progress:"В работе",answered:"Есть ответ",closed:"Закрыт"};
  $("#ticketTitle").textContent=d.ticket.subject;
  $("#ticketMeta").textContent="Статус: "+(statusNames[d.ticket.status]||d.ticket.status)+" · Создано: "+d.ticket.created_at;
  $("#comments").innerHTML=d.comments.map(c=>'<article class="fz-comment"><b>'+esc(c.author_name)+'</b><time>'+esc(c.created_at)+'</time><p>'+esc(c.body)+'</p></article>').join("")||"<p>Пока нет сообщений.</p>";
  const me=await api("/auth/me"),isAdmin=!!(me.user&&(Number(me.user.level||0)>=1||me.user.isOwner)),isOwner=!!(me.user&&d.ticket.user_id===me.user.id),isGuest=!!key;
  const canManage=isAdmin||isOwner||isGuest;
  if(me.user&&Number(me.user.level||0)>=3){
   const notesWrap=$("#internalNotes"),notesList=$("#internalNoteList");
   if(notesWrap&&notesList){
    notesWrap.hidden=false;
    const loadNotes=async()=>{const nd=await api("/admin/ticket-notes?ticketId="+encodeURIComponent(id));notesList.innerHTML=(nd.notes||[]).map(n=>'<article class="fz-comment"><b>'+esc(n.author||"Сотрудник")+'</b><time>'+esc(n.created_at)+'</time><p>'+esc(n.note)+'</p></article>').join("")||"<p>Внутренних заметок пока нет.</p>";};
    await loadNotes();
    $("#internalNoteForm").onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector("button");button.disabled=true;try{await api("/admin/ticket-notes",{method:"POST",body:JSON.stringify({ticketId:id,note:$("#internalNoteText").value})});$("#internalNoteText").value="";await loadNotes();}catch(err){notice(err.message,true);}finally{button.disabled=false;}};
   }
  }
  const ticketActions=$("#ticketActions"),closeButton=$("#closeTicket"),reopenButton=$("#reopenTicket");
  // Personal-ticket page intentionally has no status-action toolbar.
  if(ticketActions&&closeButton&&canManage&&d.ticket.status!=="closed"){
   ticketActions.hidden=false;
   closeButton.onclick=async()=>{closeButton.disabled=true;try{await api("/tickets/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({status:"closed",key})});location.reload();}catch(e){notice(e.message,true);closeButton.disabled=false;}};
  }
  if(ticketActions&&closeButton&&reopenButton&&isAdmin&&d.ticket.status==="closed"){
   ticketActions.hidden=false;closeButton.hidden=true;reopenButton.hidden=false;
   reopenButton.onclick=async()=>{reopenButton.disabled=true;try{await api("/tickets/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({status:"open"})});location.reload();}catch(e){notice(e.message,true);reopenButton.disabled=false;}};
  }
  if(canManage&&d.ticket.status!=="closed"){
   $("#commentFormWrap").hidden=false;
   $("#commentForm").onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector("button");b.disabled=true;try{await api("/tickets/"+encodeURIComponent(id)+"/comments",{method:"POST",body:JSON.stringify({body:$("#commentBody").value,key})});location.reload();}catch(err){notice(err.message,true);b.disabled=false;}};
  }else if(!canManage)$("#loginCommentHint").hidden=false;
 }catch(err){notice(err.message,true);}
}
async function myTickets(){const d=await api("/tickets");$("#ticketList").innerHTML=d.tickets.map(t=>'<a class="fz-ticket" href="/support/my-ticket.html?id='+encodeURIComponent(t.id)+'"><b>'+esc(t.subject)+'</b><span>'+esc(t.status)+' · '+esc(t.updated_at)+'</span></a>').join("")||"<p>Обращений пока нет.</p>";}
async function admin(){
 const login=$("#adminLogin"),panel=$("#adminPanel");
 let tickets=[],users=[],me=null;
 const statusNames={open:"Открыт",in_progress:"В работе",answered:"Отвечен",closed:"Закрыт"};
 const priorityNames={low:"Низкий",normal:"Обычный",high:"Высокий",urgent:"Срочный"};
 const statusOptions='<option value="open">Открыт</option><option value="in_progress">В работе</option><option value="answered">Отвечен</option><option value="closed">Закрыт</option>';
 const priorityOptions='<option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option><option value="urgent">Срочный</option>';
 const renderTickets=()=>{
  const query=($("#ticketSearch")?.value||"").trim().toLowerCase(),status=$("#ticketStatus")?.value||"all";
  const filtered=tickets.filter(t=>(status==="all"||t.status===status)&&[t.subject,t.guest_email,t.guest_name,t.user_email,t.user_name,t.user_id,t.id].join(" ").toLowerCase().includes(query));
  $("#ticketCount").textContent=filtered.length+" из "+tickets.length;
  $("#adminTickets").innerHTML=filtered.map(t=>'<article class="fz-admin-ticket"><div class="fz-admin-ticket-main"><div class="fz-ticket-title">'+esc(t.subject)+'</div><div class="fz-ticket-meta">'+esc(t.guest_email||t.guest_name||t.user_email||t.user_name||"Пользователь")+' · '+esc(t.created_at||"")+'</div><div class="fz-ticket-id">ID: '+esc(t.id)+'</div></div><div class="fz-ticket-controls"><label>Статус<select data-status="'+esc(t.id)+'">'+statusOptions+'</select></label><label>Приоритет<select data-priority="'+esc(t.id)+'">'+priorityOptions+'</select></label><button class="fz-btn fz-btn-ghost" type="button" data-quick-status="'+esc(t.id)+'">'+(t.status==="closed"?"Открыть снова":"Закрыть")+'</button><a class="fz-btn fz-btn-ghost" href="/support/ticket.html?id='+encodeURIComponent(t.id)+'">Детали →</a></div></article>').join("")||'<div class="fz-empty">'+(tickets.length?"По заданным фильтрам ничего не найдено.":"В базе D1 API не вернул ни одного обращения. Если обращения точно существуют, проверьте привязку DB у Production и среду, в которой они создавались.")+'</div>';
  for(const t of filtered){
   const statusEl=document.querySelector('[data-status="'+CSS.escape(t.id)+'"]'),priorityEl=document.querySelector('[data-priority="'+CSS.escape(t.id)+'"]');
   statusEl.value=t.status;priorityEl.value=t.priority;
   const save=async()=>{statusEl.disabled=true;priorityEl.disabled=true;try{await api("/admin/tickets/"+encodeURIComponent(t.id),{method:"PATCH",body:JSON.stringify({status:statusEl.value,priority:priorityEl.value})});t.status=statusEl.value;t.priority=priorityEl.value;notice("Изменения сохранены");renderStats();}catch(e){notice(e.message,true);}finally{statusEl.disabled=false;priorityEl.disabled=false;}};
   statusEl.onchange=save;priorityEl.onchange=save;
   const quick=document.querySelector('[data-quick-status="'+CSS.escape(t.id)+'"]');
   quick.onclick=async()=>{quick.disabled=true;const next=t.status==="closed"?"open":"closed";try{await api("/admin/tickets/"+encodeURIComponent(t.id),{method:"PATCH",body:JSON.stringify({status:next})});t.status=next;notice(next==="closed"?"Тикет закрыт":"Тикет снова открыт");renderStats();renderTickets();}catch(e){notice(e.message,true);quick.disabled=false;}};

  }
 };
 const renderStats=()=>{
  $("#statAll").textContent=tickets.length;$("#statOpen").textContent=tickets.filter(t=>t.status==="open").length;
  $("#statProgress").textContent=tickets.filter(t=>t.status==="in_progress").length;$("#statClosed").textContent=tickets.filter(t=>t.status==="closed").length;
 };
 const loadTickets=async()=>{const d=await api("/admin/tickets");tickets=Array.isArray(d.tickets)?d.tickets:[];renderStats();renderTickets();};
 const loadUsers=async()=>{
  if(!me?.isOwner)return;
  const d=await api("/admin/users");users=Array.isArray(d.users)?d.users:[];
  $("#adminUsers").innerHTML=users.map(u=>'<article class="fz-user-row"><div><strong>'+esc(u.username||"Без имени")+'</strong><small>'+esc(u.email)+'</small><small>Создан: '+esc(u.created_at||"—")+'</small></div><div class="fz-user-role"><span class="'+(u.role==="owner"?"fz-owner-badge":u.role==="admin"?"fz-admin-badge":"fz-user-badge")+'">'+(u.role==="owner"?"Владелец":u.role==="admin"?"Администратор":"Пользователь")+'</span>'+(u.role==="owner"?"":'<select data-user-role="'+esc(u.id)+'"><option value="user">Пользователь</option><option value="admin">Администратор</option></select>')+'</div></article>').join("")||'<div class="fz-empty">Пользователей пока нет.</div>';
  for(const u of users){if(u.role==="owner")continue;const select=document.querySelector('[data-user-role="'+CSS.escape(u.id)+'"]');select.value=u.role;select.onchange=async()=>{select.disabled=true;try{await api("/admin/users/"+encodeURIComponent(u.id),{method:"PATCH",body:JSON.stringify({role:select.value})});u.role=select.value;notice("Роль пользователя обновлена");await loadUsers();}catch(e){notice(e.message,true);select.value=u.role;}finally{select.disabled=false;}};}
 };
 async function loadStaffTools(){
  const level=Number(me.user.level||0),owner=!!me.user.isOwner,wrap=$("#staffTools");
  if(!wrap||(!owner&&level<2)){if(wrap)wrap.hidden=true;return;}
  wrap.hidden=false;$("#staffLevelBadge").textContent=owner?"OWNER":"LEVEL "+level;
  $("#staffToolsHint").textContent=level>=5||owner?"Мут, бан, WARN, снятие наказаний и журнал.":level>=4?"Мут и бан; просмотр истории с уровня 3.":"Мут пользователей и работа с тикетами.";
  const data=await api("/admin/moderation/users"),targets=data.users||[];
  $("#staffTarget").innerHTML='<option value="">Выбери пользователя</option>'+targets.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.username)+' — '+esc(u.email)+'</option>').join("");
  const type=$("#staffPunishType");
  for(const opt of type.options){const req=opt.value==="mute"?2:opt.value==="ban"?4:5;opt.disabled=!owner&&level<req;}
  type.value=owner||level>=5?"warn":level>=4?"ban":"mute";
  $("#staffPunishForm").onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector("button");b.disabled=true;try{const expiry=$("#staffPunishExpiry").value;await api("/admin/punishments",{method:"POST",body:JSON.stringify({userId:$("#staffTarget").value,type:type.value,reason:$("#staffPunishReason").value,expiresAt:expiry?new Date(expiry).toISOString():null})});notice("Наказание выдано");e.currentTarget.reset();await loadStaffTools();}catch(err){notice(err.message,true);}finally{b.disabled=false;}};
  if(owner||level>=3){
   const [ps,logs]=await Promise.all([api("/admin/punishments"),api("/admin/audit")]);
   $("#staffPunishmentList").innerHTML='<h3>История наказаний</h3>'+((ps.punishments||[]).map(p=>'<article class="fz-admin-ticket"><div><b>'+esc(p.target_username||p.target_email||"Пользователь")+'</b><div class="fz-ticket-meta">'+esc(p.type.toUpperCase())+' · '+esc(p.reason)+' · '+(p.active?"Активно":"Снято")+'</div></div>'+(p.active&&(owner||level>=5)?'<button class="fz-btn fz-btn-ghost" data-revoke-punishment="'+esc(p.id)+'">Снять</button>':"")+'</article>').join("")||'<p class="fz-muted">Наказаний пока нет.</p>');
   for(const b of document.querySelectorAll("[data-revoke-punishment]"))b.onclick=async()=>{b.disabled=true;try{await api("/admin/punishments/"+encodeURIComponent(b.dataset.revokePunishment),{method:"PATCH",body:JSON.stringify({active:false})});notice("Наказание снято");await loadStaffTools();}catch(err){notice(err.message,true);b.disabled=false;}};
   $("#staffAuditList").innerHTML='<h3>Последние действия команды</h3>'+((logs.logs||[]).slice(0,30).map(l=>'<article class="fz-admin-ticket"><div><b>'+esc(l.action)+'</b><div class="fz-ticket-meta">'+esc(l.actor_username||"Сотрудник")+' · '+esc(l.created_at)+' · '+esc(l.target_id||"")+'</div></div></article>').join("")||'<p class="fz-muted">Записей пока нет.</p>');
  }
 }
 async function load(){
  me=await api("/auth/me");
  if(!me.user||Number(me.user.level||0)<1&&! ["admin","owner","helper","moderator","senior_moderator","administrator","head_admin"].includes(me.user.role)){login.hidden=false;panel.hidden=true;return;}
  login.hidden=true;panel.hidden=false;
  $("#adminWelcome").textContent=(me.user.isOwner?"Владелец FRAGZONE":"Уровень "+(me.user.level||4)+" · "+me.user.role)+" · "+me.user.username+" · "+me.user.email;
  $("#teamPanel").hidden=!me.user.isOwner;if($("#ownerPanelLink"))$("#ownerPanelLink").hidden=!me.user.isOwner;
  await loadTickets();
  if(me.user.isOwner)await loadUsers();
  await loadStaffTools();
 }
 $("#adminLoginForm").onsubmit=async e=>{e.preventDefault();const button=e.currentTarget.querySelector("button");button.disabled=true;const f=new FormData(e.currentTarget);try{await api("/admin/login",{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});await load();}catch(err){notice(err.message,true);}finally{button.disabled=false;}};
 $("#adminRoleForm").onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type="submit"]'),data=new FormData(form);
  button.disabled=true;hideNotice();
  try{
   await api("/admin/users",{method:"POST",body:JSON.stringify({email:data.get("email"),role:data.get("role")})});
   notice(data.get("role")==="admin"?"Пользователь назначен администратором":"Права администратора сняты");
   form.reset();await loadUsers();
  }catch(error){notice(error.message,true);}
  finally{button.disabled=false;}
 };
 $("#userSearch").addEventListener("input",()=>{
  const q=$("#userSearch").value.trim().toLowerCase();
  $("#adminUsers").querySelectorAll(".fz-user-row").forEach(row=>{row.hidden=!row.textContent.toLowerCase().includes(q);});
 });
 $("#ticketSearch").addEventListener("input",renderTickets);$("#ticketStatus").addEventListener("change",renderTickets);
 $("#adminRefresh").onclick=async()=>{const b=$("#adminRefresh");b.disabled=true;try{await load();notice("Данные обновлены");}catch(e){notice(e.message,true);}finally{b.disabled=false;}};
 await load();
}
document.addEventListener("DOMContentLoaded",()=>{const pages={home,auth,ticket,mytickets:myTickets,admin};const run=pages[document.body.dataset.page];if(run)run().catch(e=>notice(e.message,true));});
