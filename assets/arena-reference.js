
/* ARENA layout: retain the existing live data/auth handlers and reorganize only the presentation. */
(() => {
  "use strict";
  const sidebar = document.querySelector(".sidebar");
  const sideSection = sidebar && sidebar.querySelector(".sidebar-section");
  const sideCta = document.createElement("section");
  sideCta.className = "arena-side-cta";
  sideCta.innerHTML = '<strong>Добавь свой сервер!</strong><p>Расскажи о своём проекте игровому сообществу</p><a href="/support/">Добавить сервер →</a>';
  if (sidebar) {
    const gameNav = document.createElement("section");
    gameNav.className = "arena-game-nav";
    gameNav.innerHTML = '<div class="side-title">ИГРЫ</div><div class="arena-game-list" id="arenaGameList"></div>';
    if (sideSection) sideSection.after(gameNav);
    else sidebar.append(gameNav);
    sidebar.append(sideCta);
  }

  const renderGameRail = () => {
    const list = document.getElementById("arenaGameList");
    if (!list || typeof games === "undefined" || !Array.isArray(games)) return;
    list.innerHTML = games.slice(0, 8).map(game => {
      const image = game.image || (game.app ? 'https://cdn.akamai.steamstatic.com/steam/apps/' + game.app + '/library_600x900.jpg' : '');
      return '<button type="button" class="arena-game-link ' + (game.id === currentGame ? 'active' : '') + '" data-arena-game="' + game.id + '">' +
        (image ? '<img loading="lazy" src="' + image + '" alt="">' : '') +
        '<span>' + game.name.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span></button>';
    }).join("");
  };
  renderGameRail();
  document.getElementById("arenaGameList")?.addEventListener("click", event => {
    const button = event.target.closest("[data-arena-game]");
    if (!button) return;
    if (typeof window.selectGame === "function") window.selectGame(button.dataset.arenaGame);
    renderGameRail();
  });

  const topRight = document.querySelector(".top-right");
  const search = document.querySelector(".toolbar .search");
  if (topRight && search) topRight.prepend(search);
  if (topRight) {
    const profile = document.createElement("a");
    profile.className = "site-url arena-profile-link";
    profile.href = "/account/";
    profile.textContent = "👤 Войти / Профиль";
    topRight.append(profile);
    const live = document.createElement("span");
    live.className = "arena-live-pill";
    live.textContent = "Мониторинг LIVE";
    topRight.prepend(live);
  }

  const heroTitle = document.querySelector(".hero h1");
  if (heroTitle) {
    heroTitle.textContent = "FRAGZONE";
    const slogan = document.createElement("div");
    slogan.className = "arena-slogan";
    slogan.textContent = "ИГРАЙ БЕЗ ГРАНИЦ";
    heroTitle.after(slogan);
  }

  const popular = document.getElementById("popularGames");
  const catalog = document.getElementById("catalog");
  const account = document.getElementById("accountPanel");
  if (popular && catalog && !document.querySelector(".arena-catalog-layout")) {
    const layout = document.createElement("div");
    layout.className = "arena-catalog-layout";
    const main = document.createElement("div");
    main.className = "arena-catalog-main";
    const rail = document.createElement("aside");
    rail.className = "arena-right-rail";
    rail.innerHTML = '<section class="arena-rail-card"><h3>СТАБИЛЬНАЯ РАБОТА</h3><div class="arena-rail-status"><i></i>Сайт работает</div><p>Мониторинг серверов обновляется автоматически</p></section>' +
      '<section class="arena-rail-card"><h3>НОВОСТИ</h3><div class="arena-news-item"><b>FRAGZONE LIVE</b>Каталог серверов и онлайн-статистика</div><div class="arena-news-item"><b>НОВЫЕ ИГРЫ</b>Следи за обновлениями каталога</div><div class="arena-news-item"><b>СООБЩЕСТВО</b>Добавляй любимые серверы</div></section>';
    catalog.after(layout);
    layout.append(main, rail);
    main.append(catalog);
    if (account) rail.prepend(account);
  }
  const sync = () => {
    renderGameRail();
    document.querySelectorAll(".arena-game-link").forEach(button => button.classList.toggle("active", button.dataset.arenaGame === currentGame));
  };
  document.getElementById("popularGames")?.addEventListener("click", () => setTimeout(sync, 0));
  document.querySelector(".view-tabs")?.addEventListener("click", () => setTimeout(sync, 0));
  document.querySelector(".lang")?.addEventListener("change", () => setTimeout(sync, 0));
  sync();

  /* Account menu, notifications, and live presence. */
  const accountSlot = document.createElement("div");
  accountSlot.className = "fz-account-slot";
  const accountButton = document.createElement("button");
  accountButton.className = "fz-account-button";
  accountButton.type = "button";
  accountButton.innerHTML = '<span class="fz-avatar">F</span><span class="fz-account-label"><b>Войти</b><small>Гость</small></span><span class="fz-chevron">⌄</span>';
  const accountMenu = document.createElement("div");
  accountMenu.className = "fz-account-menu";
  accountMenu.hidden = true;
  accountMenu.innerHTML = '<a href="/account/">◉ Профиль</a><a href="/community/">♧ Сообщества</a><a href="/news/">▤ Новости</a><a href="/support/">✉ Поддержка</a><a href="/support/admin.html" data-staff-link hidden>⬡ Админ-панель</a><a href="/support/owner.html" data-owner-link hidden>♛ Owner-панель</a><a href="/account/#settings">⚙ Настройки</a>';
  accountSlot.append(accountButton, accountMenu);
  const noticeSlot = document.createElement("div");
  noticeSlot.className = "fz-notice-slot";
  const noticeButton = document.createElement("button");
  noticeButton.type = "button";
  noticeButton.className = "fz-notice-button";
  noticeButton.setAttribute("aria-label","Уведомления");
  noticeButton.innerHTML = '♢<i>0</i>';
  const noticeMenu = document.createElement("div");
  noticeMenu.className = "fz-notice-menu";
  noticeMenu.hidden = true;
  noticeMenu.innerHTML = '<div class="fz-notice-head"><b>Уведомления</b><button type="button" data-read-all>Прочитать все</button></div><div class="fz-notice-list">Войдите, чтобы видеть уведомления</div>';
  noticeSlot.append(noticeButton,noticeMenu);
  if(topRight){
    const lang=topRight.querySelector(".lang");
    if(lang){lang.querySelector('option[value="ru"]')?.replaceChildren(document.createTextNode("🇷🇺 RU"));lang.querySelector('option[value="en"]')?.replaceChildren(document.createTextNode("🇬🇧 EN"));lang.querySelector('option[value="pl"]')?.replaceChildren(document.createTextNode("🇵🇱 PL"));}
    topRight.querySelectorAll('a.site-url[href="/support/"],a.site-url[href="https://fragzone.pages.dev/"]').forEach(a=>a.hidden=true);
    topRight.append(noticeSlot,accountSlot);
  }
  const closeMenus=event=>{if(!accountSlot.contains(event.target))accountMenu.hidden=true;if(!noticeSlot.contains(event.target))noticeMenu.hidden=true;};
  document.addEventListener("click",closeMenus);
  accountButton.addEventListener("click",event=>{event.stopPropagation();accountMenu.hidden=!accountMenu.hidden;noticeMenu.hidden=true;});
  noticeButton.addEventListener("click",async event=>{event.stopPropagation();noticeMenu.hidden=!noticeMenu.hidden;accountMenu.hidden=true;});
  const escapeText=value=>String(value??"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
  let loggedUser=null;
  async function refreshAccount(){
    try{
      const response=await fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"});
      const data=await response.json();loggedUser=data.user;
      if(!loggedUser){accountButton.innerHTML='<span class="fz-avatar">F</span><span class="fz-account-label"><b>Войти</b><small>Гость</small></span><span class="fz-chevron">⌄</span>';noticeButton.innerHTML='♢<i>0</i>';return;}
      const role=loggedUser.isOwner?"ВЛАДЕЛЕЦ":({head_admin:"ГЛАВНЫЙ АДМИН",administrator:"АДМИНИСТРАТОР",senior_moderator:"СТАРШИЙ МОДЕРАТОР",moderator:"МОДЕРАТОР",helper:"ХЕЛПЕР"}[loggedUser.role]||"ИГРОК");
      const avatar=loggedUser.avatarUrl?'<img src="'+escapeText(loggedUser.avatarUrl)+'" alt="">':escapeText((loggedUser.username||"F").slice(0,1).toUpperCase());
      accountButton.innerHTML='<span class="fz-avatar">'+avatar+'</span><span class="fz-account-label"><b>'+escapeText(loggedUser.username)+'</b><small>'+role+'</small></span><span class="fz-chevron">⌄</span>';
      accountMenu.querySelector("[data-staff-link]").hidden=!(Number(loggedUser.level||0)>=1||loggedUser.isOwner);
      accountMenu.querySelector("[data-owner-link]").hidden=!loggedUser.isOwner;
      await refreshNotifications();
      await fetch("/api/presence",{method:"POST",credentials:"same-origin"}).catch(()=>{});
    }catch(_){}
  }
  async function refreshNotifications(){
    if(!loggedUser)return;
    try{
      const response=await fetch("/api/notifications",{credentials:"same-origin",cache:"no-store"});if(!response.ok)return;
      const data=await response.json(),items=data.notifications||[];
      noticeButton.innerHTML='♢<i>'+Number(data.unread||0)+'</i>';
      noticeMenu.querySelector(".fz-notice-list").innerHTML=items.length?items.map(item=>'<a class="fz-notice-item '+(!item.is_read?'unread':'')+'" href="'+escapeText(item.href)+'" data-notice-id="'+escapeText(item.id)+'"><b>'+escapeText(item.title)+'</b><span>'+escapeText(item.body)+'</span><small>'+escapeText(item.created_at)+'</small></a>').join(""):'<p class="fz-empty">Пока уведомлений нет</p>';
    }catch(_){}
  }
  noticeMenu.addEventListener("click",async event=>{
    if(event.target.closest("[data-read-all]")){await fetch("/api/notifications/read-all",{method:"POST",credentials:"same-origin"});await refreshNotifications();return;}
    const item=event.target.closest("[data-notice-id]");if(item&&!item.href.endsWith("#"))fetch("/api/notifications/"+encodeURIComponent(item.dataset.noticeId),{method:"PATCH",credentials:"same-origin"});
  });
  refreshAccount();
  setInterval(refreshAccount,60000);
  fetch("/api/presence").then(r=>r.json()).then(data=>{const pill=document.querySelector(".arena-live-pill");if(pill)pill.textContent="● Онлайн: "+Number(data.online||0).toLocaleString("ru-RU");}).catch(()=>{});
  setInterval(()=>fetch("/api/presence").then(r=>r.json()).then(data=>{const pill=document.querySelector(".arena-live-pill");if(pill)pill.textContent="● Онлайн: "+Number(data.online||0).toLocaleString("ru-RU");}).catch(()=>{}),60000);

})();
