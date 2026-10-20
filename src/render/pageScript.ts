export const PAGE_SCRIPT = `
(function(){
  var steps=[],tabs=[],prev=null,next=null,lensButtons=[];
  var current=0;

  function lensAllows(el){
    var lens=document.body.getAttribute('data-lens')||'all';
    if(lens==='all') return true;
    var list=el.getAttribute('data-lens');
    return !list || (' '+list+' ').indexOf(' '+lens+' ')>=0;
  }
  function visibleSteps(){ var out=[]; steps.forEach(function(s,i){ if(lensAllows(s)) out.push(i); }); return out; }

  function show(n,push){
    var vis=visibleSteps();
    if(vis.length===0) return;
    if(vis.indexOf(n)<0){ n=vis.filter(function(i){return i<=n;}).pop(); if(n===undefined) n=vis[0]; }
    current=n;
    steps.forEach(function(s,i){ if(i===n){s.removeAttribute('hidden');}else{s.setAttribute('hidden','');} });
    tabs.forEach(function(t,i){ if(i===n){t.setAttribute('aria-current','step');}else{t.removeAttribute('aria-current');} });
    if(prev) prev.disabled=vis.indexOf(n)===0;
    if(next) next.disabled=vis.indexOf(n)===vis.length-1;
    if(push!==false){ try{ history.replaceState(null,'','#step-'+(n+1)); }catch(e){} }
    var h=steps[n].querySelector('h2'); if(h){ h.setAttribute('tabindex','-1'); h.focus({preventScroll:true}); }
    window.scrollTo({top:0});
    updateEmptyNotes();
  }
  function step(delta){
    var vis=visibleSteps(); var at=vis.indexOf(current); var to=vis[at+delta]; if(to!==undefined) show(to);
  }

  // A lensable container whose every tagged child is hidden shows its empty note instead.
  function updateEmptyNotes(){
    [].slice.call(document.querySelectorAll('.lensable')).forEach(function(box){
      var kids=[].slice.call(box.children).filter(function(k){return k.hasAttribute('data-lens');});
      var any=kids.some(lensAllows);
      var note=box.nextElementSibling;
      if(note&&note.classList.contains('lens-empty')){ if(kids.length&&!any){note.removeAttribute('hidden');}else{note.setAttribute('hidden','');} }
    });
  }

  function setLens(lens,remember){
    document.body.setAttribute('data-lens',lens);
    lensButtons.forEach(function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-lens-pick')===lens?'true':'false'); });
    if(remember!==false){ try{ localStorage.setItem('prlense.lens',lens); }catch(e){} }
    show(current,false);
  }

  function fromHash(){ var m=/^#step-(\\d+)$/.exec(location.hash); return m?parseInt(m[1],10)-1:0; }

  // Registered once. These sit on document and window, which outlive a re-render, so
  // rebinding them on every load would stack duplicates.
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[data-goto-step]'); if(!a) return;
    var n=parseInt(a.getAttribute('data-goto-step'),10)-1; var id=(a.getAttribute('href')||'').slice(1);
    if(isNaN(n)) return; e.preventDefault(); show(n);
    var el=document.getElementById(id); if(el){ el.scrollIntoView({block:'start'}); el.classList.add('pulse'); setTimeout(function(){el.classList.remove('pulse');},1400); }
  });
  document.addEventListener('keydown',function(e){
    var tag=(e.target&&e.target.tagName||'').toLowerCase();
    if(tag==='input'||tag==='textarea'||e.metaKey||e.ctrlKey||e.altKey) return;
    if(e.key==='ArrowRight'){step(1);}
    else if(e.key==='ArrowLeft'){step(-1);}
    else if(e.key==='Home'){show(visibleSteps()[0]);}
    else if(e.key==='End'){var v=visibleSteps();show(v[v.length-1]);}
    else if(/^[1-9]$/.test(e.key)){ var k=parseInt(e.key,10)-1; if(k<steps.length) show(k); }
  });
  window.addEventListener('hashchange',function(){show(fromHash(),false);});

  // Everything below binds to elements a loaded report replaces, so it runs again after one.
  function init(){
    steps=[].slice.call(document.querySelectorAll('section.step'));
    tabs=[].slice.call(document.querySelectorAll('nav.stepper button'));
    prev=document.getElementById('prev');
    next=document.getElementById('next');
    lensButtons=[].slice.call(document.querySelectorAll('[data-lens-pick]'));
    current=0;

    tabs.forEach(function(t,i){ t.addEventListener('click',function(){show(i);}); });
    if(prev) prev.addEventListener('click',function(){step(-1);});
    if(next) next.addEventListener('click',function(){step(1);});
    lensButtons.forEach(function(b){ b.addEventListener('click',function(){ setLens(b.getAttribute('data-lens-pick')); }); });

    var saved=null; try{ saved=localStorage.getItem('prlense.lens'); }catch(e){}
    if(saved&&lensButtons.some(function(b){return b.getAttribute('data-lens-pick')===saved;})){ setLens(saved,false); }
    else { show(fromHash(),false); }
  }

  window.prlenseInit=init;
  init();
})();
`
