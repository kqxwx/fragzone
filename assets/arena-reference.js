
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
    const live = document.createElement("span");
    live.className = "arena-live-pill";
    live.textContent = "Мониторинг LIVE";
    topRight.prepend(live);
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
})();
