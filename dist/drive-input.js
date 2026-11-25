'use strict';
function updateDriveViewButton(button, inside) {
  button.dataset.nextView = inside ? 'chase' : 'cockpit';
  button.textContent = inside ? 'Sau xe' : 'Trong xe';
  button.title = inside ? 'Chuyển sang góc nhìn sau xe' : 'Chuyển sang góc nhìn trong xe';
  button.setAttribute('aria-label', button.title);
}

// Keyboard and individual contacts own their input independently on hybrid devices.
function createDriveInput({timedSteering=false}={}) {
  const keyboard = new Set(), contacts = new Map(), active = new Set();
  const edges=[];
  const has=key=>keyboard.has(key)||active.has(key);
  const wheel=timedSteering?document.querySelector('[data-touch-wheel]'):null;
  let wheelPointer=null, wheelAxis=null, originX=0, dragRange=0;
  let applied=0, latest=0, compressedFrame=false;
  function recordSteering(time) {
    if (!timedSteering) return;
    const direction=Number(has('d')||has('arrowright'))-Number(has('a')||has('arrowleft'));
    if (direction===latest) return;
    if (direction && wheelPointer===null && wheelAxis!==null) resetWheel();
    latest=direction;
    edges.push({time:Math.max(time??performance.now(),edges.at(-1)?.time??0),direction});
  }
  function prepareSteeringFrame(end,elapsed,dt) {
    const budget=dt*1000, start=end-budget;
    const wallStart=Math.min(end-elapsed,edges[0]?.time??end);
    compressedFrame=budget>0&&start-wallStart>.001;
    if (!compressedFrame||!edges.length||edges[0].time>end) return;
    if (!applied&&edges[0].time>=start) return;
    // Fit the queued presses into the physics time available after a stall.
    // Shorten gaps first. If the turns alone exceed the budget, keep their proportions.
    let cursor=wallStart,direction=applied,heldMs=0;
    for (const edge of edges) {
      if (edge.time>end) break;
      if (direction) heldMs+=edge.time-cursor;
      cursor=edge.time;direction=edge.direction;
    }
    if (direction) heldMs+=end-cursor;
    const idleMs=end-wallStart-heldMs;
    const heldScale=heldMs>budget?budget/heldMs:1;
    const idleScale=idleMs>0?Math.max(0,budget-heldMs)/idleMs:0;
    cursor=wallStart;direction=applied;
    let mapped=start;
    for (const edge of edges) {
      if (edge.time>end) break;
      mapped+=(edge.time-cursor)*(direction?heldScale:idleScale);
      cursor=edge.time;direction=edge.direction;
      edge.time=Math.min(end,mapped);
    }
  }
  // Integrate only the part of each physics step for which a button was down.
  // A complete tap between two rendered frames still reaches the wheels.
  function steering(end,dt,profile=4) {
    if (profile==='adaptive') profile=4;
    if (profile<=2&&!compressedFrame) {
      edges.length=0;applied=latest;
      return latest;
    }
    if (end===undefined||dt<=0) return latest;
    const start=end-dt*1000;
    let cursor=start,area=0;
    while (edges.length&&edges[0].time<=end) {
      const edge=edges.shift(),time=Math.max(start,edge.time);
      area+=(time-cursor)*applied;
      cursor=time;applied=edge.direction;
    }
    const timed=cursor===start?applied:(area+(end-cursor)*applied)/(dt*1000);
    return compressedFrame||profile>=3?timed:latest+(timed-latest)*(profile-2);
  }
  function setContact(id, button, time) {
    const previous = contacts.get(id);
    if (previous === button) return;
    if (button) contacts.set(id, button);
    else contacts.delete(id);
    const pressed = new Set(contacts.values());
    if (previous && !pressed.has(previous)) previous.classList.remove('active');
    if (button) button.classList.add('active');
    active.clear();
    for (const control of pressed) {
      for (const key of control.dataset.key.split(' ')) active.add(key);
    }
    recordSteering(time);
  }
  function setWheel(percent) {
    wheelAxis=percent/100;
    wheel.value=String(percent);
    wheel.parentElement.style.setProperty('--wheel-angle',percent*1.15+'deg');
  }
  function resetWheel() {
    if (!wheel) return;
    const id=wheelPointer;
    wheelPointer=null;
    if (id!==null && wheel.hasPointerCapture(id)) wheel.releasePointerCapture(id);
    wheel.parentElement.classList.remove('turning');
    setWheel(0);
    wheelAxis=null;
  }
  if (wheel) {
    wheel.addEventListener('pointerdown',event=>{
      if (event.button!==0) return;
      event.preventDefault();
      if (wheelPointer!==null) return;
      wheelPointer=event.pointerId;
      originX=event.clientX;
      dragRange=Math.min(46,wheel.getBoundingClientRect().width*.42);
      wheel.setPointerCapture(wheelPointer);
      wheel.parentElement.classList.add('turning');
      setWheel(0);
    });
    wheel.addEventListener('pointermove',event=>{
      if (event.pointerId!==wheelPointer) return;
      const dx=event.clientX-originX;
      const room=dx<0?originX:window.innerWidth-originX;
      const range=Math.max(1,Math.min(dragRange,room));
      setWheel(Math.round(100*Math.max(-1,Math.min(1,dx/range))));
    });
    function releaseWheel() {
      resetWheel();
      // Continue with the wheel's smooth return until digital steering takes over.
      if (!latest) wheelAxis=0;
    }
    for (const type of ['pointerup','pointercancel','lostpointercapture']) {
      wheel.addEventListener(type,event=>{if (event.pointerId===wheelPointer) releaseWheel();});
    }
    // Native range changes also support assistive input without a drag gesture.
    wheel.addEventListener('input',()=>setWheel(wheel.valueAsNumber));
    wheel.addEventListener('blur',()=>{if (wheelPointer===null && wheelAxis!==null) releaseWheel();});
    wheel.addEventListener('contextmenu',event=>event.preventDefault());
    new MutationObserver(clear).observe(document.body,{attributes:true,attributeFilter:['data-touch-control','data-steering','data-button-size']});
  }
  function clear() {
    resetWheel();
    keyboard.clear();
    for (const id of contacts.keys()) setContact(id);
    edges.length=0;applied=latest=0;compressedFrame=false;
  }
  for (const button of document.querySelectorAll('[data-key]')) {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      setContact(event.pointerId, button,event.timeStamp);
    });
    if (button.hasAttribute('data-slide-pedal')) {
      button.addEventListener('pointermove', event => {
        if (!contacts.has(event.pointerId)) return;
        // Capture keeps the release reliable. Hit-test the thumb as it crosses pedals.
        const pedal = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-slide-pedal]');
        if (pedal) setContact(event.pointerId, pedal,event.timeStamp);
      });
    }
    if (timedSteering&&(button.dataset.key==='a'||button.dataset.key==='d')) {
      button.addEventListener('pointermove', event => {
        if (event.pointerType==='mouse'||!contacts.has(event.pointerId)) return;
        const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('button[data-key="a"],button[data-key="d"]');
        if (!target||target.parentElement!==button.parentElement||target===contacts.get(event.pointerId)) return;
        const rect=target.getBoundingClientRect(),inset=Math.min(8,rect.width*.15);
        if (event.clientX>=rect.left+inset&&event.clientX<=rect.right-inset) setContact(event.pointerId,target,event.timeStamp);
      });
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, event => setContact(event.pointerId,null,event.timeStamp));
    }
    button.addEventListener('contextmenu', event => event.preventDefault());
  }
  window.addEventListener('blur', clear);
  window.addEventListener('pagehide', clear);
  matchMedia('(orientation: landscape)').addEventListener('change', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  return {has,steering,prepareSteeringFrame,clear,get wheelAxis(){return wheelAxis;},
    add(key,time){keyboard.add(key);recordSteering(time);},
    delete(key,time){keyboard.delete(key);recordSteering(time);}
  };
}
