// 휴대폰 화면에서 ☰ 버튼으로 메뉴 열고 닫기
(function(){
  var h=document.querySelector(".site-header"); if(!h) return;
  var b=h.querySelector(".sh-burger");
  function set(open){h.classList.toggle("open",open);b.setAttribute("aria-expanded",open?"true":"false");b.setAttribute("aria-label",open?"메뉴 닫기":"메뉴 열기")}
  b.addEventListener("click",function(){set(!h.classList.contains("open"))});
  document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false)});
  document.addEventListener("click",function(e){if(!h.contains(e.target))set(false)});
})();

// 배경음악: 미디어 라이브러리에서 고른 노래(없으면 가장 최근에 올린 음악)를 틀어요
// - 홈페이지에 들어오면 자동으로 재생을 시도해요.
//   브라우저가 소리 자동재생을 막으면, 화면을 처음 누르거나 키를 누를 때 바로 시작해요.
// - 상단 '음악 끄기'를 누르면 그 뒤로는 자동재생하지 않아요(다시 켜면 다시 자동재생).
// - 듣던 위치를 기억해서 다른 페이지로 가도 이어서 들려요.
// - 페이지 안에서 다른 동영상/음악을 재생하면 배경음악은 잠시 멈춰요.
(function(){
  var h=document.querySelector(".site-header .sh-in"); if(!h||!window.fetch||!window.Audio) return;
  fetch("/api/media?bgm=1",{cache:"no-store"}).then(function(r){return r.json()}).then(function(d){
    if(d&&d.bgm&&d.bgm.url)setup(h,d.bgm);
  }).catch(function(){});
})();
function setup(h,bgm){
  var credit=document.getElementById("bgm-credit");
  if(credit){credit.textContent="배경음악: "+bgm.name;credit.hidden=false}
  var KEY_ON="bgm_on", KEY_POS="bgm_pos", KEY_ID="bgm_id";
  function get(store,k){try{return window[store].getItem(k)}catch(e){return null}}
  function put(store,k,v){try{window[store].setItem(k,v)}catch(e){}}
  // 곡이 바뀌었으면 듣던 위치는 처음부터
  if(get("sessionStorage",KEY_ID)!==bgm.id){put("sessionStorage",KEY_POS,"0");put("sessionStorage",KEY_ID,bgm.id)}

  var audio=new Audio(bgm.url); audio.loop=true; audio.volume=0.5; audio.preload="auto";
  var btn=document.createElement("button"); btn.type="button"; btn.className="sh-music"; btn.title=bgm.name;
  btn.innerHTML='<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="lbl"></span>';
  h.appendChild(btn);

  function show(on){
    btn.classList.toggle("on",on);
    btn.setAttribute("aria-pressed",on?"true":"false");
    btn.setAttribute("aria-label",(on?"배경음악 끄기: ":"배경음악 켜기: ")+bgm.name);
    btn.querySelector(".lbl").textContent=on?"음악 끄기":"음악 켜기";
  }
  var waiting=false;
  function start(){
    var pos=parseFloat(get("sessionStorage",KEY_POS)); if(pos>0&&!audio.currentTime){try{audio.currentTime=pos}catch(e){}}
    var p=audio.play(); show(true);
    if(p&&p.catch)p.catch(function(){show(false);waitForTap()});
  }
  function stop(){audio.pause();show(false)}
  // 브라우저가 자동재생을 막으면, 처음 누르는 순간 재생
  function waitForTap(){
    if(waiting)return; waiting=true;
    var evs=["pointerdown","keydown","touchend"];
    function go(e){
      if(e.target&&e.target.closest&&e.target.closest(".sh-music"))return;
      evs.forEach(function(t){document.removeEventListener(t,go,true)}); waiting=false;
      if(get("localStorage",KEY_ON)!=="0"&&audio.paused)start();
    }
    evs.forEach(function(t){document.addEventListener(t,go,true)});
  }
  btn.addEventListener("click",function(){
    if(audio.paused){put("localStorage",KEY_ON,"1");start()}else{put("localStorage",KEY_ON,"0");stop()}
  });
  // 페이지 안의 다른 동영상/음악이 재생되면 배경음악은 잠시 멈춤
  document.addEventListener("play",function(e){if(e.target!==audio&&!audio.paused)stop()},true);
  window.addEventListener("pagehide",function(){if(!audio.paused)put("sessionStorage",KEY_POS,String(audio.currentTime))});
  show(false);
  // 직접 끈 적이 없으면 자동으로 재생
  if(get("localStorage",KEY_ON)!=="0")start();
}

// 방문자 수: 상단 메뉴에 '오늘 N · 누적 N' 표시
// 같은 브라우저는 하루에 한 번만 셉니다. 저장소가 아직 연결 안 됐으면 아무것도 안 보여요.
(function(){
  var h=document.querySelector(".site-header .sh-in"); if(!h||!window.fetch) return;
  var d=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul"}).format(new Date());
  var seen=null; try{seen=localStorage.getItem("visit_day")}catch(e){}
  var first=seen!==d;
  fetch("/api/visits",{method:first?"POST":"GET",cache:"no-store"}).then(function(r){return r.json()}).then(function(v){
    if(!v||!v.enabled) return;
    if(first){try{localStorage.setItem("visit_day",d)}catch(e){}}
    var el=document.createElement("div"); el.className="sh-visits";
    el.setAttribute("aria-label","오늘 방문자 "+v.today+"명, 누적 방문자 "+v.total+"명");
    var f=function(n){return Number(n).toLocaleString("ko-KR")};
    el.innerHTML='<span><b>오늘</b> '+f(v.today)+'</span><i aria-hidden="true"></i><span><b>누적</b> '+f(v.total)+'</span>';
    h.appendChild(el);
  }).catch(function(){});
})();
