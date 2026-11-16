/* FRAGZONE Music Center: continuous radio + searchable track previews. */
(() => {
  "use strict";
  if (document.querySelector(".fz-music-dock")) return;

  const stations = [
    {id:"groovesalad",name:"Groove Salad",mood:"Спокойный чилл и downtempo",url:"https://ice5.somafm.com/groovesalad-128-mp3",tag:"CHILL"},
    {id:"dronezone",name:"Drone Zone",mood:"Мягкий ambient без спешки",url:"https://ice5.somafm.com/dronezone-128-mp3",tag:"AMBIENT"},
    {id:"deepspace",name:"Deep Space One",mood:"Космическая фоновая музыка",url:"https://ice5.somafm.com/deepspaceone-128-mp3",tag:"SPACE"},
    {id:"lush",name:"Lush",mood:"Спокойная музыка с вокалом",url:"https://ice5.somafm.com/lush-128-mp3",tag:"VOCALS"},
    {id:"fluid",name:"Fluid",mood:"Мягкий electronic и beats",url:"https://ice5.somafm.com/fluid-128-aac",tag:"BEATS"}
  ];
  const storeKey="fragzone_music_center_v1";
  const dock=document.createElement("section");
  dock.className="fz-music-dock fz-music-center";
  dock.innerHTML=[
    '<div class="fz-music-mark" aria-hidden="true">♫</div>',
    '<div class="fz-music-meta"><b data-current>FRAGZONE MUSIC</b><small data-status>Спокойная музыка · выбери станцию</small></div>',
    '<button type="button" data-play aria-label="Воспроизвести">▶</button>',
    '<button type="button" data-open aria-expanded="false">Музыка</button>',
    '<audio data-audio preload="none"></audio>',
    '<div class="fz-music-panel" data-panel hidden>',
      '<div class="fz-music-panel-head"><div><b>Музыка FRAGZONE</b><small>Радио без остановки и поиск треков</small></div><button type="button" data-close aria-label="Закрыть">×</button></div>',
      '<div class="fz-music-tabs"><button type="button" class="active" data-tab="radio">Радио</button><button type="button" data-tab="search">Найти музыку</button></div>',
      '<section data-view="radio"><div class="fz-music-stations" data-stations></div><p class="fz-music-note">Радиостанции играют непрерывно. Нажми на станцию, чтобы начать.</p></section>',
      '<section data-view="search" hidden><form data-search-form><input data-search type="search" maxlength="100" placeholder="Название песни или исполнитель…" aria-label="Поиск музыки"><button type="submit">Найти</button></form><div class="fz-music-results" data-results><div class="fz-music-empty">Введи название песни или исполнителя.</div></div><p class="fz-music-note">В поиске доступны короткие ознакомительные фрагменты. Полная версия открывается у музыкального сервиса.</p></section>',
      '<div class="fz-music-bottom"><label>Громкость <input data-volume type="range" min="0" max="1" step=".01" value=".65"></label><span data-error role="status"></span></div>',
      '<div class="fz-music-attribution">Радио: <a href="https://somafm.com/" target="_blank" rel="noopener">SomaFM</a> · Поиск и превью: <a href="https://www.apple.com/apple-music/" target="_blank" rel="noopener">Apple Music</a></div>',
    '</div>'
  ].join("");
  document.body.append(dock);

  const $=selector=>dock.querySelector(selector);
  const audio=$("[data-audio]"), current=$("[data-current]"), status=$("[data-status]");
  const playButton=$("[data-play]"), panel=$("[data-panel]"), openButton=$("[data-open]");
  const stationsNode=$("[data-stations]"), resultsNode=$("[data-results]"), errorNode=$("[data-error]");
  let activeSource="",activeKind="",activeStation="",lastQuery="";
  let searchAbort=null;

  function save(){
    try{localStorage.setItem(storeKey,JSON.stringify({station:activeStation,volume:audio.volume}));}catch{}
  }
  function setStatus(text,error=false){status.textContent=text;errorNode.textContent=error?text:"";}
  function setPlaying(playing){playButton.textContent=playing?"Ⅱ":"▶";playButton.setAttribute("aria-label",playing?"Пауза":"Воспроизвести");}
  function startSource(url,title,subtitle,kind,stationId=""){
    if(activeSource!==url){audio.pause();audio.src=url;activeSource=url;}
    activeKind=kind;activeStation=stationId;current.textContent=title;setStatus(subtitle);save();
    const p=audio.play();
    if(p&&p.then)p.then(()=>{setPlaying(true);errorNode.textContent="";}).catch(()=>{setPlaying(false);setStatus("Нажми ▶ ещё раз, чтобы начать воспроизведение",true);});
  }
  function renderStations(){
    stationsNode.replaceChildren();
    stations.forEach(station=>{
      const card=document.createElement("button");
      card.type="button";card.className="fz-station-card"+(station.id===activeStation?" selected":"");
      const badge=document.createElement("span");badge.className="fz-station-tag";badge.textContent=station.tag;
      const title=document.createElement("b");title.textContent=station.name;
      const desc=document.createElement("small");desc.textContent=station.mood;
      const action=document.createElement("i");action.textContent=station.id===activeStation&& !audio.paused?"ИГРАЕТ":"Слушать";
      card.append(badge,title,desc,action);
      card.addEventListener("click",()=>{
        startSource(station.url,station.name,station.mood,"radio",station.id);
        renderStations();
      });
      stationsNode.append(card);
    });
  }
  function switchTab(name){
    dock.querySelectorAll("[data-tab]").forEach(button=>button.classList.toggle("active",button.dataset.tab===name));
    dock.querySelectorAll("[data-view]").forEach(view=>view.hidden=view.dataset.view!==name);
  }
  function formatTime(seconds){
    if(!Number.isFinite(seconds))return "";
    const m=Math.floor(seconds/60),s=Math.floor(seconds%60);
    return m+":"+String(s).padStart(2,"0");
  }
  function renderResults(items){
    resultsNode.replaceChildren();
    if(!items.length){const empty=document.createElement("div");empty.className="fz-music-empty";empty.textContent="Ничего не найдено. Попробуй другое название.";resultsNode.append(empty);return;}
    items.forEach(track=>{
      const card=document.createElement("article");card.className="fz-track-result";
      const art=document.createElement("img");art.alt="";art.loading="lazy";art.src=track.artworkUrl100||""; 
      const info=document.createElement("div");info.className="fz-track-info";
      const name=document.createElement("b");name.textContent=track.trackName||"Без названия";
      const artist=document.createElement("small");artist.textContent=(track.artistName||"Неизвестный исполнитель")+" · "+formatTime((track.trackTimeMillis||0)/1000);
      const actions=document.createElement("div");actions.className="fz-track-actions";
      const listen=document.createElement("button");listen.type="button";listen.textContent="▶ Фрагмент";
      listen.addEventListener("click",()=>startSource(track.previewUrl,track.trackName||"Трек",track.artistName||"Превью · 30 секунд","preview"));
      const full=document.createElement("a");full.href=track.trackViewUrl;full.target="_blank";full.rel="noopener";full.textContent="Открыть ↗";
      info.append(name,artist);actions.append(listen,full);card.append(art,info,actions);resultsNode.append(card);
    });
  }
  async function searchMusic(query){
    const term=query.trim();
    if(!term)return;
    lastQuery=term;
    if(searchAbort)searchAbort.abort();
    searchAbort=new AbortController();
    resultsNode.textContent="Ищем музыку…";
    try{
      const url="https://itunes.apple.com/search?"+new URLSearchParams({term,media:"music",entity:"song",limit:"24",country:"US"});
      const response=await fetch(url,{signal:searchAbort.signal,mode:"cors"});
      if(!response.ok)throw new Error("Музыкальный поиск временно недоступен.");
      const data=await response.json();
      if(lastQuery!==term)return;
      renderResults((data.results||[]).filter(track=>track.previewUrl&&track.trackViewUrl));
      if(!data.results?.length)throw new Error("По этому запросу ничего не найдено.");
    }catch(error){
      if(error.name==="AbortError")return;
      resultsNode.textContent=error.message||"Не удалось выполнить поиск. Попробуй ещё раз.";
    }
  }
  playButton.addEventListener("click",()=>{
    if(!activeSource){switchTab("radio");const first=stations[0];startSource(first.url,first.name,first.mood,"radio",first.id);renderStations();return;}
    if(audio.paused){audio.play().then(()=>setPlaying(true)).catch(()=>setStatus("Не удалось начать воспроизведение",true));}
    else audio.pause();
  });
  audio.addEventListener("play",()=>setPlaying(true));
  audio.addEventListener("pause",()=>setPlaying(false));
  audio.addEventListener("error",()=>{setPlaying(false);setStatus("Поток недоступен. Выбери другую станцию.",true);});
  audio.addEventListener("ended",()=>{setPlaying(false);if(activeKind==="preview")setStatus("Фрагмент закончился · выбери другой трек");});
  openButton.addEventListener("click",()=>{
    const show=panel.hidden;panel.hidden=!show;openButton.textContent=show?"Свернуть":"Музыка";openButton.setAttribute("aria-expanded",String(show));
  });
  $("[data-close]").addEventListener("click",()=>{panel.hidden=true;openButton.textContent="Музыка";openButton.setAttribute("aria-expanded","false");});
  dock.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>switchTab(button.dataset.tab)));
  $("[data-search-form]").addEventListener("submit",event=>{event.preventDefault();searchMusic($("[data-search]").value);});
  $("[data-volume]").addEventListener("input",event=>{audio.volume=Number(event.target.value);save();});
  renderStations();
  try{
    const saved=JSON.parse(localStorage.getItem(storeKey)||"{}");
    audio.volume=Number.isFinite(saved.volume)?Math.max(0,Math.min(1,saved.volume)):.65;
    $("[data-volume]").value=String(audio.volume);
    const station=stations.find(item=>item.id===saved.station);
    if(station){activeStation=station.id;activeSource=station.url;audio.src=station.url;current.textContent=station.name;setStatus(station.mood+" · нажми ▶ для продолжения");renderStations();}
  }catch{audio.volume=.65;}
  const heartbeat=()=>fetch("/api/presence",{method:"POST",credentials:"same-origin",cache:"no-store"}).catch(()=>{});
  heartbeat();window.setInterval(heartbeat,60000);
})();