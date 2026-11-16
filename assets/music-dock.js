/* FRAGZONE Yandex Music embed player. Playback is provided by Yandex's official iframe. */
(() => {
  "use strict";
  if (document.querySelector(".fz-music-dock")) return;
  const STORAGE_KEY="fragzone_yandex_music_embed";
  const dock=document.createElement("section");
  dock.className="fz-music-dock fz-yandex-dock";
  dock.innerHTML=[
    '<div class="fz-music-mark" aria-hidden="true">♫</div>',
    '<div class="fz-music-meta"><b>Яндекс Музыка</b><small data-status>Добавь ссылку на трек или плейлист</small></div>',
    '<button type="button" data-open aria-expanded="false">Открыть</button>',
    '<div class="fz-yandex-panel" data-panel hidden>',
      '<div class="fz-yandex-head"><b>Твоя музыка</b><button type="button" data-close aria-label="Закрыть">×</button></div>',
      '<form data-form class="fz-yandex-form">',
        '<label for="fzYandexUrl">Ссылка на трек или плейлист Яндекс Музыки</label>',
        '<input id="fzYandexUrl" type="text" inputmode="url" autocomplete="url" placeholder="https://music.yandex.ru/users/.../playlists/..." required>',
        '<button type="submit">Подключить</button>',
      '</form>',
      '<p class="fz-yandex-help">Открой трек или плейлист в Яндекс Музыке → «Поделиться» → скопируй ссылку. Можно вставить и весь HTML-код плеера — ссылка src извлечётся автоматически.</p>',
      '<div class="fz-yandex-frame" data-frame-wrap hidden></div>',
      '<div class="fz-yandex-empty" data-empty>После подключения здесь появится официальный плеер Яндекс Музыки.</div>',
      '<button type="button" data-change hidden>Изменить ссылку</button>',
    '</div>'
  ].join("");
  document.body.append(dock);
  const panel=dock.querySelector("[data-panel]");
  const openButton=dock.querySelector("[data-open]");
  const status=dock.querySelector("[data-status]");
  const form=dock.querySelector("[data-form]");
  const input=dock.querySelector("#fzYandexUrl");
  const frameWrap=dock.querySelector("[data-frame-wrap]");
  const empty=dock.querySelector("[data-empty]");
  const changeButton=dock.querySelector("[data-change]");
  function normalize(raw){
    let value=String(raw||"").trim();
    const embedded=value.match(/src\s*=\s*["']([^"']+)["']/i);
    if(embedded)value=embedded[1];
    let url;
    try{url=new URL(value);}catch{throw new Error("Вставь корректную ссылку Яндекс Музыки.");}
    if(url.protocol!=="https:"||!/(^|\.)music\.yandex\.(ru|com|by|kz|ua)$/i.test(url.hostname))throw new Error("Подходит только ссылка с сайта music.yandex.");
    let hash=url.hash.replace(/^#/,"");
    if(url.pathname==="/iframe/"&&hash){
      if(!/^(track|playlist|album|artist|podcast)\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/.test(hash))throw new Error("Не удалось распознать ссылку встроенного плеера.");
      return "https://music.yandex.ru/iframe/#"+hash;
    }
    const track=url.pathname.match(/\/album\/(\d+)\/track\/(\d+)/);
    if(track)return "https://music.yandex.ru/iframe/#track/"+track[2]+"/"+track[1];
    const playlist=url.pathname.match(/\/users\/([^/]+)\/playlists\/(\d+)/);
    if(playlist)return "https://music.yandex.ru/iframe/#playlist/"+encodeURIComponent(playlist[1])+"/"+playlist[2];
    const album=url.pathname.match(/\/album\/(\d+)(?:\/|$)/);
    if(album)return "https://music.yandex.ru/iframe/#album/"+album[1];
    const artist=url.pathname.match(/\/artist\/(\d+)(?:\/|$)/);
    if(artist)return "https://music.yandex.ru/iframe/#artist/"+artist[1];
    if(hash&&/^(track|playlist|album|artist|podcast)\//.test(hash))return "https://music.yandex.ru/iframe/#"+hash;
    throw new Error("Не распознана ссылка. Вставь ссылку на трек/плейлист или его HTML-код из меню «Поделиться».");
  }
  function showPlayer(src){
    frameWrap.replaceChildren();
    const frame=document.createElement("iframe");
    frame.src=src;frame.title="Официальный плеер Яндекс Музыки";frame.loading="lazy";
    frame.referrerPolicy="strict-origin-when-cross-origin";
    frame.allow="autoplay; encrypted-media; clipboard-write";frame.setAttribute("allowfullscreen","");
    frameWrap.append(frame);frameWrap.hidden=false;empty.hidden=true;changeButton.hidden=false;
    status.textContent="Плеер Яндекс Музыки подключён";
  }
  function connect(raw,save=true){
    const src=normalize(raw);showPlayer(src);
    if(save){try{localStorage.setItem(STORAGE_KEY,src);}catch{}}
    input.value=raw;form.hidden=true;dock.classList.add("has-yandex");status.classList.remove("is-error");
  }
  openButton.addEventListener("click",()=>{
    const show=panel.hidden;panel.hidden=!show;openButton.textContent=show?"Свернуть":"Открыть";
    openButton.setAttribute("aria-expanded",String(show));
  });
  dock.querySelector("[data-close]").addEventListener("click",()=>{
    panel.hidden=true;openButton.textContent="Открыть";openButton.setAttribute("aria-expanded","false");
  });
  form.addEventListener("submit",event=>{
    event.preventDefault();try{connect(input.value,true);}
    catch(error){status.textContent=error.message;status.classList.add("is-error");}
  });
  changeButton.addEventListener("click",()=>{form.hidden=false;input.focus();changeButton.hidden=true;status.textContent="Вставь новую ссылку";});
  try{const saved=localStorage.getItem(STORAGE_KEY);if(saved){input.value=saved;connect(saved,false);}}catch{}
  const heartbeat=()=>fetch("/api/presence",{method:"POST",credentials:"same-origin",cache:"no-store"}).catch(()=>{});
  heartbeat();window.setInterval(heartbeat,60000);
})();