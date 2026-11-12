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

 $("#accountArea").innerHTML=me.user?'<span>Вы вошли как <b>'+esc(me.user.username)+'</b></span> <button id="logoutBtn" class="fz-btn fz-btn-ghost">Выйти</button>':'<a href="#accountPanel">Войти / создать аккаунт</a>';
 if($("#logoutBtn"))$("#logoutBtn").onclick=async()=>{try{await api("/auth/logout",{method:"POST",body:"{}"});location.reload();}catch(err){notice(err.message,true);}};
 if($("#accountPanel"))$("#accountPanel").hidden=!!me.user;
 const nameField=$("#guestNameField"),emailField=$("#guestEmailField");
 if(nameField)nameField.hidden=!!me.user;
 if(emailField)emailField.hidden=!!me.user;

 $("#guestTicketForm").onsubmit=async e=>{
  e.preventDefault();hideNotice();const f=new FormData(e.currentTarget);
  try{
   const d=await api("/tickets",{method:"POST",body:JSON.stringify({name:f.get("name"),email:f.get("email"),subject:f.get("subject"),message:f.get("message")})});
   $("#guestResult").innerHTML=d.guestAccessUrl?'Обращение создано. <a href="'+esc(d.guestAccessUrl)+'">Открыть обращение</a>. Сохраните секретную ссылку.':'Обращение создано. <a href="/support/my-tickets.html">Открыть мои обращения</a>.';
   $("#guestResult").hidden=false;e.currentTarget.reset();
  }catch(err){notice(err.message,true);}
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
  $("#ticketTitle").textContent=d.ticket.subject;$("#ticketMeta").textContent="Статус: "+d.ticket.status+" · Создано: "+d.ticket.created_at;
  $("#comments").innerHTML=d.comments.map(c=>'<article class="fz-comment"><b>'+esc(c.author_name)+'</b><time>'+esc(c.created_at)+'</time><p>'+esc(c.body)+'</p></article>').join("")||"<p>Пока нет сообщений.</p>";
  const me=await api("/auth/me");
  if(me.user&&(me.user.role==="admin"||d.ticket.user_id===me.user.id)){
   $("#commentFormWrap").hidden=false;$("#commentForm").onsubmit=async e=>{e.preventDefault();try{await api("/tickets/"+encodeURIComponent(id)+"/comments",{method:"POST",body:JSON.stringify({body:$("#commentBody").value})});location.reload();}catch(err){notice(err.message,true);}};
  }else $("#loginCommentHint").hidden=false;
 }catch(err){notice(err.message,true);}
}
async function myTickets(){const d=await api("/tickets");$("#ticketList").innerHTML=d.tickets.map(t=>'<a class="fz-ticket" href="/support/my-ticket.html?id='+encodeURIComponent(t.id)+'"><b>'+esc(t.subject)+'</b><span>'+esc(t.status)+' · '+esc(t.updated_at)+'</span></a>').join("")||"<p>Обращений пока нет.</p>";}
async function admin(){
 async function load(){
  const me=await api("/auth/me");if(me.user?.role!=="admin"){$("#adminLogin").hidden=false;$("#adminPanel").hidden=true;return;}
  $("#adminLogin").hidden=true;$("#adminPanel").hidden=false;const d=await api("/admin/tickets");
  $("#adminTickets").innerHTML=d.tickets.map(t=>'<article class="fz-admin-ticket"><div><b>'+esc(t.subject)+'</b><br><small>'+esc(t.guest_email||t.guest_name||t.user_id||"Пользователь")+' · '+esc(t.created_at)+'</small></div><select data-status="'+esc(t.id)+'"><option value="open">Открыт</option><option value="in_progress">В работе</option><option value="answered">Отвечен</option><option value="closed">Закрыт</option></select><select data-priority="'+esc(t.id)+'"><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option><option value="urgent">Срочный</option></select><a href="/support/ticket.html?id='+encodeURIComponent(t.id)+'">Открыть</a></article>').join("")||"<p>Пока нет обращений.</p>";
  for(const t of d.tickets){const s=document.querySelector('[data-status="'+CSS.escape(t.id)+'"]'),p=document.querySelector('[data-priority="'+CSS.escape(t.id)+'"]');s.value=t.status;p.value=t.priority;const save=async()=>{try{await api("/admin/tickets/"+encodeURIComponent(t.id),{method:"PATCH",body:JSON.stringify({status:s.value,priority:p.value})});notice("Изменения сохранены");}catch(e){notice(e.message,true);}};s.onchange=save;p.onchange=save;}
 }
 $("#adminLoginForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/admin/login",{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});await load();}catch(err){notice(err.message,true);}};
 await load();
}
document.addEventListener("DOMContentLoaded",()=>{const pages={home,auth,ticket,mytickets:myTickets,admin};const run=pages[document.body.dataset.page];if(run)run().catch(e=>notice(e.message,true));});
