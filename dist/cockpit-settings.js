'use strict';

// Apply the same player preferences before either arcade mode starts rendering.
(() => {
  const storageKey = 'taylai.cockpit.v1';
  const groups = [
    {key:'graphics', title:'Chất lượng đồ họa', options:[['auto','Tự động'], ['low','Thấp'], ['medium','Vừa'], ['high','Cao']], initial:'auto'},
    {key:'sideWindow', title:'Kính cửa bên', options:[['closed','Đóng kính'], ['open','Hạ kính']], initial:'closed'},
    {key:'mapSize', title:'Cỡ bản đồ nhỏ', options:[['small','Gọn'], ['standard','Chuẩn'], ['large','Rộng']], initial:'standard'},
    {key:'mapSide', title:'Vị trí bản đồ', device:'keyboard', options:[['left','Bên trái'], ['right','Bên phải']], initial:'left'},
    {key:'steering', title:'Tay đánh lái', device:'touch', options:[['left','Tay trái'], ['right','Tay phải']], initial:'left'},
    {key:'buttonSize', title:'Cỡ nút cảm ứng', device:'touch', options:[['standard','Chuẩn'], ['large','Lớn']], initial:'standard'}
  ];
  if (document.querySelector('[data-touch-wheel]')) {
    groups.push({key:'touchControl', title:'Điều khiển lái cảm ứng', device:'touch', options:[['stick','Cần lái'], ['wheel','Vô lăng'], ['buttons','Hai nút']], initial:'stick'});
  }
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  const saved = read(storageKey);
  const settings = {};
  const profiles = {
    adaptive: ['Linh hoạt', 'Chạm ngắn để căn làn như kiểu Êm. Giữ cùng hướng để chuyển dần sang Bản 1.'],
    1: ['Trực tiếp · Bản 1', 'Vào lái ngay khi bấm, dễ đổi hướng qua cua liên tiếp.'],
    2: ['Bản 2', 'Ở tốc độ cao, chạm ngắn để chỉnh hướng từng chút.'],
    3: ['Bản 3', 'Chạm nhẹ nhạy hơn bản 2, góc lái giảm theo độ bám.'],
    4: ['Êm', 'Chạm nhẹ để căn làn, giữ lâu hơn để ôm cua.']
  };
  const picker = document.getElementById('startSteering');
  let slider, adaptiveToggle, readout, modeKey, modeProfile, recommended = 4;
  let summaryValue, options, more;
  function validProfile(value) {
    if (value==='adaptive') return value;
    const n=typeof value==='number'||typeof value==='string'?Number(value):NaN;
    return Number.isFinite(n)&&n>=1&&n<=4?Math.round(n*100)/100:null;
  }
  let defaultProfile = validProfile(saved?.steeringProfile);
  function applySteering(profile = modeProfile ?? defaultProfile ?? recommended) {
    window.driveSteeringProfile=profile;
    const adaptive=profile==='adaptive';
    const lower=adaptive?'adaptive':Math.floor(profile),share=adaptive?0:Math.round((profile-lower)*100);
    const description=share?`${100-share}% bản ${lower} · ${share}% ${lower===3?'Êm':'bản '+(lower+1)}`:
      profiles[lower][0];
    if (slider) {
      adaptiveToggle.checked=adaptive;
      slider.disabled=adaptive;
      const detail=share?description:description+' · '+profiles[lower][1];
      if (!adaptive) {
        slider.value=profile;
        slider.setAttribute('aria-valuetext',detail);
      }
      readout.value=detail;
    }
    if (summaryValue) {
      summaryValue.textContent=description;
      for (const radio of options.querySelectorAll('input')) radio.checked=validProfile(radio.value)===profile;
      if (profile===2||profile===3) showAll(true);
    }
  }
  function saveSetting(key, value) {
    try { localStorage.setItem(storageKey, JSON.stringify({...read(storageKey), [key]:value})); } catch {}
  }
  function remember(profile) {
    if (modeKey) {
      modeProfile=profile;
      try { localStorage.setItem(modeKey,JSON.stringify(profile)); } catch {}
    } else {
      defaultProfile=profile;
      saveSetting('steeringProfile',profile);
    }
    applySteering(profile);
  }
  function showAll(expanded) {
    for (const label of options.querySelectorAll('[data-extra]')) label.hidden=!expanded;
    more.setAttribute('aria-expanded',String(expanded));
    more.textContent=expanded?'Thu gọn':'Xem tất cả kiểu lái';
  }
  function useMode(mode) {
    modeKey='taylai.steering.v1.'+mode;
    recommended=mode==='mountain'?1:4;
    modeProfile=validProfile(read(modeKey));
    picker.innerHTML='<summary>Cảm giác lái <strong></strong></summary><div class="startProfiles" id="startProfiles" role="radiogroup" aria-label="Kiểu lái"></div><button type="button" aria-controls="startProfiles"></button>';
    summaryValue=picker.querySelector('strong');
    options=picker.querySelector('.startProfiles');
    more=picker.querySelector('button');
    for (const value of [recommended, 'adaptive', recommended===1?4:1, 2, 3]) {
      const label=document.createElement('label');
      if (value===2||value===3) label.dataset.extra='';
      const radio=document.createElement('input');
      radio.type='radio';radio.name='startProfile';radio.value=value;
      const title=document.createElement('b'), hint=document.createElement('span');
      title.textContent=profiles[value][0];hint.textContent=profiles[value][1];
      label.append(radio,title,hint);options.append(label);
    }
    options.onchange=({target})=>remember(validProfile(target.value));
    more.onclick=()=>showAll(more.getAttribute('aria-expanded')!=='true');
    showAll(false);
    picker.open=modeProfile===null;
    picker.hidden=false;
    applySteering();
  }
  window.DriveSteering = {useMode, start() {
    if (modeKey) {remember(window.driveSteeringProfile);picker.open=false;}
  }};
  if (picker && document.body.classList.contains('journey')) useMode('journey');
  else applySteering();
  for (const group of groups) {
    const selected = group.options.some(([value]) => value === saved?.[group.key]) ? saved[group.key] : group.initial;
    settings[group.key] = document.body.dataset[group.key] = selected;
  }
  // The exam hall can change this preference while a lesson is open in its iframe.
  window.addEventListener('storage', event => {
    if (modeKey && (event.key===modeKey || event.key===null)) {
      modeProfile=validProfile(read(modeKey));
      applySteering();
    }
    if (event.key !== storageKey && event.key !== null) return;
    const next=read(storageKey);
    defaultProfile=validProfile(next?.steeringProfile);
    applySteering();
    for (const group of groups) {
      const value = group.options.some(([id]) => id === next?.[group.key]) ? next[group.key] : group.initial;
      settings[group.key] = document.body.dataset[group.key] = value;
      const radio = document.querySelector('#cockpitSettings input[name="' + group.key + '"][value="' + value + '"]');
      if (radio) radio.checked = true;
    }
  });
  const buttons = document.querySelectorAll('[data-cockpit-settings]');
  if (!buttons.length) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'cockpitSettings';
  dialog.setAttribute('aria-labelledby', 'cockpitTitle');
  dialog.innerHTML = '<form method="dialog"><h2 id="cockpitTitle">Cài đặt</h2><button class="settingsDone" value="close">Xong</button></form>';
  const form = dialog.firstElementChild;
  for (const group of groups) {
    const field = document.createElement('fieldset');
    if (group.device) field.dataset.device = group.device;
    const legend = document.createElement('legend');
    legend.textContent = group.title;
    field.append(legend);
    for (const [value, text] of group.options) {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = group.key;
      radio.value = value;
      radio.checked = value === settings[group.key];
      label.append(radio, text);
      field.append(label);
    }
    form.insertBefore(field, form.lastElementChild);
  }
  if (document.body.classList.contains('arcade') || document.getElementById('hall')) {
    const field=document.createElement('fieldset');
    field.className='steeringProfile';
    field.innerHTML='<legend id="steeringProfileTitle">Cảm giác lái bằng phím và hai nút</legend>'+
      '<label class="adaptiveSteering"><input id="adaptiveSteering" type="checkbox">Linh hoạt</label>'+
      '<output for="steeringProfile adaptiveSteering"></output>'+
      '<input id="steeringProfile" name="steeringProfile" type="range" min="1" max="4" value="4" step="0.01" aria-labelledby="steeringProfileTitle">'+
      '<div class="steeringStops"><button type="button" value="1">Bản 1</button><button type="button" value="2">Bản 2</button><button type="button" value="3">Bản 3</button><button type="button" value="4">Êm</button></div>';
    slider=field.querySelector('input[type=range]');
    adaptiveToggle=field.querySelector('input[type=checkbox]');
    readout=field.querySelector('output');
    if (!document.body.classList.contains('arcade')) field.querySelector('legend').textContent='Cảm giác lái mặc định cho chế độ chưa chọn';
    applySteering();
    adaptiveToggle.addEventListener('change',()=>remember(adaptiveToggle.checked?'adaptive':slider.valueAsNumber));
    slider.addEventListener('input',()=>applySteering(slider.valueAsNumber));
    slider.addEventListener('change',()=>remember(slider.valueAsNumber));
    field.querySelector('.steeringStops').addEventListener('click',({target})=>{
      if (target.type==='button') remember(Number(target.value));
    });
    form.insertBefore(field,form.querySelector('fieldset'));
  }
  form.addEventListener('change', ({target}) => {
    if (target.type !== 'radio') return;
    settings[target.name] = document.body.dataset[target.name] = target.value;
    saveSetting(target.name,target.value);
  });
  document.body.append(dialog);
  for (const button of buttons) {
    button.addEventListener('click', () => dialog.showModal());
  }
})();
