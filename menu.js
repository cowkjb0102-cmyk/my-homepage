// 휴대폰 화면에서 ☰ 버튼으로 메뉴 열고 닫기
(function(){
  var h=document.querySelector(".site-header"); if(!h) return;
  var b=h.querySelector(".sh-burger");
  function set(open){h.classList.toggle("open",open);b.setAttribute("aria-expanded",open?"true":"false");b.setAttribute("aria-label",open?"메뉴 닫기":"메뉴 열기")}
  b.addEventListener("click",function(){set(!h.classList.contains("open"))});
  document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false)});
  document.addEventListener("click",function(e){if(!h.contains(e.target))set(false)});
})();

// 배경음악: 상단 '음악' 버튼으로 켜고 끄기 (처음엔 꺼져 있음)
// 켜 둔 상태와 듣던 위치를 기억해서, 다른 페이지로 가도 이어서 들을 수 있어요
// 음악 파일(music/canon.mp3)이 실제로 있을 때만 버튼과 출처 표시가 나타나요
(function(){
  var h=document.querySelector(".site-header .sh-in"); if(!h||!window.fetch) return;
  fetch("music/canon.mp3",{method:"HEAD",cache:"no-store"}).then(function(r){
    var t=r.headers.get("content-type")||"";
    if(r.ok&&t.indexOf("audio")===0)setup(h);
  }).catch(function(){});
})();
function setup(h){
  var credit=document.getElementById("bgm-credit"); if(credit)credit.hidden=false;
  var KEY_ON="bgm_on", KEY_POS="bgm_pos";
  function get(store,k){try{return window[store].getItem(k)}catch(e){return null}}
  function put(store,k,v){try{window[store].setItem(k,v)}catch(e){}}

  var audio=new Audio("music/canon.mp3"); audio.loop=true; audio.volume=0.5; audio.preload="none";
  var btn=document.createElement("button"); btn.type="button"; btn.className="sh-music";
  btn.innerHTML='<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="lbl"></span>';
  h.appendChild(btn);

  function show(on){
    btn.classList.toggle("on",on);
    btn.setAttribute("aria-pressed",on?"true":"false");
    btn.setAttribute("aria-label",on?"배경음악 끄기":"배경음악 켜기");
    btn.querySelector(".lbl").textContent=on?"음악 끄기":"음악 켜기";
  }
  function start(){
    var pos=parseFloat(get("sessionStorage",KEY_POS)); if(pos>0&&!audio.currentTime){try{audio.currentTime=pos}catch(e){}}
    var p=audio.play(); show(true);
    if(p&&p.catch)p.catch(function(){show(false);waitForTap()});
  }
  function stop(){audio.pause();show(false)}
  // 브라우저가 자동재생을 막으면, 화면을 처음 누를 때 이어서 재생
  function waitForTap(){
    function go(e){if(e.target.closest&&e.target.closest(".sh-music"))return;document.removeEventListener("pointerdown",go,true);if(get("localStorage",KEY_ON)==="1")start()}
    document.addEventListener("pointerdown",go,true);
  }
  btn.addEventListener("click",function(){
    if(audio.paused){put("localStorage",KEY_ON,"1");start()}else{put("localStorage",KEY_ON,"0");stop()}
  });
  window.addEventListener("pagehide",function(){if(!audio.paused)put("sessionStorage",KEY_POS,String(audio.currentTime))});
  show(false);
  if(get("localStorage",KEY_ON)==="1")start();
}
