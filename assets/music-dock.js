/* FRAGZONE original ambient synth player. Audio starts only after a user click. */
(() => {
  "use strict";
  if (document.querySelector(".fz-music-dock")) return;
  const tracks = [
    {name:"Neon Skyline",style:"Cyber ambient",root:110,notes:[0,3,7,10]},
    {name:"Midnight Respawn",style:"Dark synthwave",root:98,notes:[0,5,7,12]},
    {name:"Crystal Portal",style:"Space ambient",root:130.81,notes:[0,4,7,11]}
  ];
  let index=0,context=null,master=null,playing=false,step=0,timer=0,voices=[];
  const dock=document.createElement("section");
  dock.className="fz-music-dock";
  dock.innerHTML='<div class="fz-music-mark">♫</div><div class="fz-music-meta"><b data-track>Neon Skyline</b><small data-style>Cyber ambient · FRAGZONE RADIO</small></div><button type="button" data-prev aria-label="Предыдущий трек">◀</button><button type="button" data-play aria-label="Воспроизвести">▶</button><button type="button" data-next aria-label="Следующий трек">▶</button><label class="fz-music-volume" title="Громкость"><input type="range" min="0" max="1" step=".01" value=".22" style="width:100%;accent-color:#c000ff"></label>';
  document.body.append(dock);
  const trackName=dock.querySelector("[data-track]"),trackStyle=dock.querySelector("[data-style]"),playButton=dock.querySelector("[data-play]");
  function update(){trackName.textContent=tracks[index].name;trackStyle.textContent=tracks[index].style+" · FRAGZONE RADIO";playButton.textContent=playing?"Ⅱ":"▶";}
  function stopVoices(){voices.forEach(v=>{try{v.stop()}catch(_){}});voices=[];}
  function tone(freq,when,duration,gainValue,type="sine"){
    const osc=context.createOscillator(),gain=context.createGain(),filter=context.createBiquadFilter();
    osc.type=type;osc.frequency.setValueAtTime(freq,when);
    filter.type="lowpass";filter.frequency.setValueAtTime(1100,when);
    gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(gainValue,when+.08);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    osc.connect(filter);filter.connect(gain);gain.connect(master);osc.start(when);osc.stop(when+duration+.03);voices.push(osc);
  }
  function chord(){
    if(!playing||!context)return;
    const t=context.currentTime,track=tracks[index],base=track.root*Math.pow(2,Math.floor(step/4)%2);
    const note=track.notes[step%track.notes.length];
    tone(base*Math.pow(2,note/12),t,2.8,.12,"triangle");
    if(step%2===0){tone(base*.5,t,3.6,.07,"sine");tone(base*Math.pow(2,(note+7)/12),t+.03,2.3,.045,"sine");}
    if(step%4===0)tone(base*Math.pow(2,(note+19)/12),t+.1,1.7,.025,"sine");
    step++;timer=window.setTimeout(chord,1800);
  }
  async function start(){
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx){trackStyle.textContent="Браузер не поддерживает аудио";return;}
    if(!context){context=new AudioCtx();master=context.createGain();master.gain.value=.22;master.connect(context.destination);}
    await context.resume();playing=true;step=0;update();chord();
  }
  function pause(){playing=false;window.clearTimeout(timer);stopVoices();if(context)context.suspend();update();}
  function change(delta){index=(index+delta+tracks.length)%tracks.length;step=0;if(playing){window.clearTimeout(timer);stopVoices();chord();}update();}
  playButton.addEventListener("click",()=>playing?pause():start().catch(()=>{trackStyle.textContent="Не удалось запустить аудио";}));
  dock.querySelector("[data-prev]").addEventListener("click",()=>change(-1));
  dock.querySelector("[data-next]").addEventListener("click",()=>change(1));
  dock.querySelector('input[type="range"]').addEventListener("input",event=>{if(master)master.gain.value=Number(event.target.value);});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&playing)pause();});
  update();
})();
