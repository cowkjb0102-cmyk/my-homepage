// 휴대폰 화면에서 ☰ 버튼으로 메뉴 열고 닫기
(function(){
  var h=document.querySelector(".site-header"); if(!h) return;
  var b=h.querySelector(".sh-burger");
  function set(open){h.classList.toggle("open",open);b.setAttribute("aria-expanded",open?"true":"false");b.setAttribute("aria-label",open?"메뉴 닫기":"메뉴 열기")}
  b.addEventListener("click",function(){set(!h.classList.contains("open"))});
  document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false)});
  document.addEventListener("click",function(e){if(!h.contains(e.target))set(false)});
})();
