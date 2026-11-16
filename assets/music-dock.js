/* FRAGZONE Music Center: search real tracks and play licensed previews in-page. */
(() => {
  "use strict";
  if (document.querySelector(".fz-music-dock")) return;
  const storeKey="fragzone_music_center_v2";
  const dock=document.createElement("section");
  dock.className="fz-music-dock fz-music-center";
  dock.innerHTML=[
    '<div class="fz-music-mark" aria-hidden="true">♫</div>',
    '<div class="fz-music-meta"><b data-current>FRAGZONE MUSIC</b><small data-status>Найди спокойную музыку и включи превью</small></div>',
    '<button type="button" data-play aria-label="Воспроизвести" disabled>▶</button>',
    '<button type="button" data-open aria-expanded="false">Музыка</button>',
    '<audio data-audio preload="none"></audio>',
    '<div class="fz-music-panel" data-panel hidden>',
      '<div class="fz-music-panel-head"><div><b>Музыка FRAGZONE</b><small>Поиск треков · спокойные подборки · плеер</small></div><button type="button" data-close aria-label="Закрыть">×</button></div>',
      '<div class="fz-music-presets" aria-label="Подборки музыки">',
        '<button type="button" data-query="ambient instrumental">Ambient</button>',
        '<button type="button" data-query="lofi chill beats">Lo-fi</button>',
        '<button type="button" data-query="relaxing piano">Пианино</button>',
        '<button type="button" data-query="calm jazz">Спокойный джаз</button>',
        '<button type="button" data-query="chill electronic">Chill</button>',
      '</div>',
      '<form data-search-form><input data-search type="search" maxlength="100" placeholder="Название песни или исполнитель…" aria-label="Поиск музыки"><button type="submit">Найти</button></form>',
      '<div class="fz-music-results" data-results><div class="fz-music-empty">Выбери подборку или найди любимую песню.</div></div>',
      '<p class="fz-music-note">Треки можно слушать прямо здесь в виде ознакомительных фрагментов. Полная версия и весь альбом доступны по ссылке у трека.</p>',
      '<div class="fz-music-bottom"><label>Громкость <input data-volume type="range" min="0" max="1" step=".01" value=".7"></label><span data-error role="status"></span></div>',
      '<div class="fz-music-attribution">Поиск и аудиопревью предоставляются <a href="https://www.apple.com/apple-music/" target="_blank" rel="noopener">Apple Music / iTunes</a>.</div>',
    '</div>'
  ].join("");
  document.body.append(dock);

  const $=selector=>dock.querySelector(selector);
  const audio=$("[data-audio]"),current=$("[data-current]"),status=$("[data-status]");
  const playButton=$("[data-play]"),panel=$("[data-panel]"),openButton=$("[data-open]");
  const resultsNode=$("[data-results]"),errorNode=$("[data-error]");
  let activeSource="",lastQuery="",searchAbort=null,hasLoadedPresets=false;

  function save(){try{localStorage.setItem(storeKey,JSON.stringify({volume:audio.volume}));}catch{}}
  function setStatus(value,error=false){status.textContent=value;errorNode.textContent=error?value:"";}
  function setPlaying(value){playButton.textContent=value?"Ⅱ":"▶";playButton.disabled=!activeSource;playButton.setAttribute("aria-label",value?"Пауза":"Воспроизвести");}
  function playTrack(track){
    if(!track.previewUrl)return;
    if(activeSource!==track.previewUrl){audio.pause();audio.src=track.previewUrl;activeSource=track.previewUrl;}
    current.textContent=track.trackName||"Трек";
    setStatus((track.artistName||"Исполнитель")+" · фрагмент");
    const play=audio.play();
    if(play&&play.then)play.then(()=>{setPlaying(true);errorNode.textContent="";}).catch(()=>{setPlaying(false);setStatus("Нажми ▶ ещё раз, чтобы начать воспроизведение",true);});
    save();
  }
  function formatTime(ms){if(!ms)return "";const n=Math.round(ms/1000);return Math.floor(n/60)+":"+String(n%60).padStart(2,"0");}
  function renderResults(items){
    resultsNode.replaceChildren();
    if(!items.length){const empty=document.createElement("div");empty.className="fz-music-empty";empty.textContent="Ничего не найдено. Попробуй другое название.";resultsNode.append(empty);return;}
    items.forEach(track=>{
      const card=document.createElement("article");card.className="fz-track-result";
      const art=document.createElement("img");art.alt="";art.loading="lazy";art.src=track.artworkUrl100||"";
      const info=document.createElement("div");info.className="fz-track-info";
      const name=document.createElement("b");name.textContent=track.trackName||"Без названия";
      const artist=document.createElement("small");artist.textContent=(track.artistName||"Неизвестный исполнитель")+" · "+formatTime(track.trackTimeMillis);
      const actions=document.createElement("div");actions.className="fz-track-actions";
      const listen=document.createElement("button");listen.type="button";listen.textContent="▶ Слушать";
      listen.addEventListener("click",()=>playTrack(track));
      const full=document.createElement("a");full.href=track.trackViewUrl;full.target="_blank";full.rel="noopener";full.textContent="Полная версия ↗";
      info.append(name,artist);actions.append(listen,full);card.append(art,info,actions);resultsNode.append(card);
    });
  }
  async function searchMusic(query){
    const term=String(query||"").trim();if(!term)return;
    lastQuery=term;
    if(searchAbort)searchAbort.abort();
    searchAbort=new AbortController();
    resultsNode.textContent="Ищем музыку…";
    try{
      const endpoint="https://itunes.apple.com/search?"+new URLSearchParams({term,media:"music",entity:"song",limit:"24"});
      const response=await fetch(endpoint,{signal:searchAbort.signal,mode:"cors"});
      if(!response.ok)throw new Error("Поиск музыки временно недоступен.");
      const data=await response.json();
      if(lastQuery!==term)return;
      const tracks=(data.results||[]).filter(item=>item.previewUrl&&item.trackViewUrl);
      renderResults(tracks);
      if(!tracks.length){const empty=document.createElement("div");empty.className="fz-music-empty";empty.textContent="По этому запросу нет доступных превью. Попробуй другой запрос.";resultsNode.append(empty);}
    }catch(error){
      if(error.name==="AbortError")return;
      resultsNode.textContent=error.message||"Не удалось выполнить поиск. Попробуй ещё раз.";
    }
  }
  playButton.addEventListener("click",()=>{
    if(!activeSource)return;
    if(audio.paused)audio.play().then(()=>setPlaying(true)).catch(()=>setStatus("Не удалось начать воспроизведение",true));
    else audio.pause();
  });
  audio.addEventListener("play",()=>setPlaying(true));
  audio.addEventListener("pause",()=>setPlaying(false));
  audio.addEventListener("error",()=>{setPlaying(false);setStatus("Превью не загрузилось. Выбери другой трек.",true);});
  audio.addEventListener("ended",()=>{setPlaying(false);setStatus("Фрагмент закончился · выбери следующий трек");});
  openButton.addEventListener("click",()=>{
    const show=panel.hidden;panel.hidden=!show;openButton.textContent=show?"Свернуть":"Музыка";openButton.setAttribute("aria-expanded",String(show));
    if(show&&!hasLoadedPresets){hasLoadedPresets=true;searchMusic("ambient instrumental");}
  });
  $("[data-close]").addEventListener("click",()=>{panel.hidden=true;openButton.textContent="Музыка";openButton.setAttribute("aria-expanded","false");});
  $("[data-search-form]").addEventListener("submit",event=>{event.preventDefault();searchMusic($("[data-search]").value);});
  dock.querySelectorAll("[data-query]").forEach(button=>button.addEventListener("click",()=>{
    $("[data-search]").value=button.dataset.query;searchMusic(button.dataset.query);
    dock.querySelectorAll("[data-query]").forEach(item=>item.classList.toggle("active",item===button));
  }));
  $("[data-volume]").addEventListener("input",event=>{audio.volume=Number(event.target.value);save();});
  try{const saved=JSON.parse(localStorage.getItem(storeKey)||"{}");audio.volume=Number.isFinite(saved.volume)?Math.max(0,Math.min(1,saved.volume)):.7;$("[data-volume]").value=String(audio.volume);}catch{audio.volume=.7;}
  const heartbeat=()=>fetch("/api/presence",{method:"POST",credentials:"same-origin",cache:"no-store"}).catch(()=>{});
  heartbeat();window.setInterval(heartbeat,60000);
})();