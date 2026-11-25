import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {checkLearnerQuiz} from './learner-quiz.mjs';
import {checkExperience} from './experience.mjs';

const client = fileURLToPath(new URL('../../dist/client/', import.meta.url));
const types = {'.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.webp':'image/webp', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2'};
async function serveRelease() {
  const {default:worker} = await import('../../dist/server/index.js');
  const env = {ASSETS:{async fetch(request) {
    const file = path.resolve(client, '.' + new URL(request.url).pathname);
    if (!file.startsWith(path.resolve(client) + path.sep)) return new Response(null,{status:404});
    try {
      return new Response(await readFile(file),{headers:{'Content-Type':types[path.extname(file)] || 'application/octet-stream'}});
    } catch { return new Response(null,{status:404}); }
  }}};
  const server = createServer(async (req,res) => {
    try {
      const response = await worker.fetch(new Request(new URL(req.url, 'http://localhost'), {headers:req.headers}),env);
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { res.writeHead(500);res.end(String(error)); }
  });
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  return server;
}

const server = process.env.SMOKE_URL ? null : await serveRelease();
const base = process.env.SMOKE_URL || 'http://127.0.0.1:' + server.address().port;
async function check(disabled, run) {
  const browser = await chromium.launch({args:disabled?['--disable-webgl']:['--enable-unsafe-swiftshader']});
  try {
    const context = await browser.newContext({viewport:{width:640,height:480}});
    await context.addInitScript(origin=>{
      if (window===window.top && location.origin===origin) {
        localStorage.setItem('taylai.cockpit.v1',JSON.stringify({graphics:'low'}));
      }
    },new URL(base).origin);
    context.setDefaultTimeout(60000);
    const errors = [];
    context.on('weberror', event=>errors.push(event.error().message));
    await context.route('**/*', route=>{
      const url=new URL(route.request().url());
      if (url.pathname==='/api/leaderboard/start') return route.fulfill({status:201,json:{runId:'00000000-0000-4000-8000-000000000000'}});
      if (url.origin!==new URL(base).origin && ['http:','https:'].includes(url.protocol)) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    try { await run(page); }
    catch (error) {
      console.error(page.url(),errors,await page.locator('#loadStatus').allTextContents());
      throw error;
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function checkPhoneRotation(page, driving) {
  const client = await page.context().newCDPSession(page);
  const original = page.viewportSize();
  const saved = await page.evaluate(() => ({...document.body.dataset}));
  try {
    await client.send('Emulation.setTouchEmulationEnabled', {enabled:true, maxTouchPoints:2});
    const sizes = [[320,568], [568,320], [390,844], [844,390]];
    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      await page.waitForFunction(([w,h]) => window.innerWidth === w && window.innerHeight === h, [width,height]);
      for (const hand of driving ? ['left','right'] : ['left']) {
        const collisions = await page.evaluate(async ({driving,hand}) => {
          if (driving) Object.assign(document.body.dataset, {steering:hand,buttonSize:'large',mapSize:'large'});
          const selectors = driving
            ? ['#viewTools button','.tools button','.navigationDock','.routeInfo','.telemetry','#touch button']
            : ['header nav','.departureRibbon','.openingCopy','.atlasTicket'];
          // The portrait departure panel scrolls above the navigation bar.
          // Measure each control after clipping by its scroll container and viewport.
          const controls = [...document.querySelectorAll(selectors.join(','))];
          const entries = await new Promise(resolve => {
            const observer = new IntersectionObserver(entries => { observer.disconnect(); resolve(entries); });
            controls.forEach(el => observer.observe(el));
            if (!controls.length) resolve([]);
          });
          const boxes = entries.filter(e => e.intersectionRect.width && e.intersectionRect.height)
            .map(({target,intersectionRect}) => [target.id || target.className || target.dataset.key || target.tagName, intersectionRect]);
          return boxes.flatMap(([id,r],i) => boxes.slice(i+1).filter(([,s]) =>
            r.left < s.right && s.left < r.right && r.top < s.bottom && s.top < r.bottom
          ).map(([other]) => [id,other]));
        }, {driving,hand});
        assert.deepEqual(collisions, [], `Controls overlap at ${width}×${height} (${hand}): ${JSON.stringify(collisions)}`);
      }
    }
  } finally {
    await page.evaluate(saved => {
      for (const key of ['steering','buttonSize','mapSize']) document.body.dataset[key] = saved[key];
    }, saved);
    await page.setViewportSize(original);
    await client.send('Emulation.setTouchEmulationEnabled', {enabled:false});
    await client.detach();
  }
}

async function checkTouchPedals(page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const view = page.locator('#camera');
  for (const [label, nextInside] of [['Trong xe',true], ['Sau xe',false]]) {
    assert.equal(await view.innerText(),label);
    assert.ok(await view.evaluate(button=>parseFloat(getComputedStyle(button).fontSize)>=12));
    await view.click();
    assert.equal(await page.evaluate(()=>inside),nextInside);
  }
  const brake = page.getByRole('button',{name:'Phanh và lùi'});
  assert.equal((await brake.innerText()).replace(/\s+/g,' '),'Phanh Lùi');
  const point = async (selector,id) => {
    const box = await page.locator('#touch ' + selector).boundingBox();
    assert.ok(box, selector);
    return {id,x:box.x+box.width/2,y:box.y+box.height/2};
  };
  const steer = await point('[data-key=a]',1);
  const right = await point('[data-key=d]',1);
  const gas = await point('[data-key=w]',2);
  const nitro = await point('[data-key~=shift]',2);
  const touch = (type,...touchPoints) => client.send('Input.dispatchTouchEvent',{type,touchPoints});
  const expectInputs = (...keys) => page.waitForFunction(
    expected=>['a','d','w','s','shift'].every(key=>held(key)===expected.includes(key)),keys,{timeout:10000});
  // Slide straight up and back with one thumb while the other thumb steers.
  const aboveGas = {...nitro,x:gas.x};
  // Hold the service brake while checking the thumb transitions. Otherwise the
  // time spent delivering touch events can steer the car off the lakeside road.
  await page.keyboard.down('Space');
  await touch('touchStart',steer,gas);
  await expectInputs('a','w');
  const rightBox=await page.locator('#touch [data-key=d]').boundingBox();
  await touch('touchMove',{...right,x:rightBox.x+1},gas);
  await expectInputs('a','w');
  await touch('touchMove',right,gas);
  await expectInputs('d','w');
  await touch('touchMove',steer,gas);
  await expectInputs('a','w');
  await touch('touchMove',steer,aboveGas);
  await expectInputs('a','w','shift');
  await touch('touchMove',steer,gas);
  await expectInputs('a','w');
  await touch('touchEnd');
  await expectInputs();
  await page.keyboard.up('Space');
  await touch('touchStart',nitro);
  await expectInputs('w','shift');
  await page.waitForFunction(()=>document.getElementById('nitro').value<99 && Number(document.getElementById('speed').textContent)>0);
  await touch('touchCancel');
  await expectInputs();
  await touch('touchStart',await point('[data-key=s]',2));
  await expectInputs('s');
  await page.waitForFunction(()=> (document.body.classList.contains('journey') ? car : cupBody).speed < -.4);
  await touch('touchEnd');
  await expectInputs();
  await client.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await client.detach();
}

async function checkDistrictStreaming(page) {
  const result = await page.evaluate(async () => {
    await structureRequest?.ready;
    const current = districtView;
    const args = view => [view.edges, view.x, view.z, view.waterways, view.graph];
    gfx.setRoads(...args(current));
    pendingDistrict = null;
    const cursor = {...player};
    roads.advance(cursor, 160, exits => exits[0]);
    const p = roads.sample(cursor);
    const next = [roads.nearby(p.x, p.z, 560), p.x, p.z, water?.nearby(p.x, p.z) || [], roads];
    const sample = () => [0, 8, 40].map(offset => {
      const x = p.x + offset, z = p.z - offset;
      return [gfx.ground(x, z), gfx.grade(x, z, p.yaw), gfx.waterAt(x, z)?.level, gfx.contact(x, z)?.id];
    });
    const before = sample(), oldDistance = gfx.districtDistance(p.x, p.z);
    gfx.queueRoads(...next);
    const partial = gfx.advanceRoads(0);
    gfx.cancelRoads();
    const canceled = sample(), canceledDistance = gfx.districtDistance(p.x, p.z);
    gfx.queueRoads(...next);
    let frames = 0;
    while (!gfx.advanceRoads(5)) {
      await new Promise(requestAnimationFrame);
      frames++;
    }
    const streamed = sample(), distance = gfx.districtDistance(p.x, p.z);
    gfx.setRoads(...next);
    const immediate = sample();
    gfx.setRoads(...args(current));
    return {partial, before, canceled, oldDistance, canceledDistance, streamed, immediate, frames, distance};
  });
  assert.equal(result.partial, false);
  assert.ok(result.oldDistance > 0);
  assert.equal(result.canceledDistance, result.oldDistance);
  assert.deepEqual(result.before, result.canceled);
  assert.ok(result.frames > 0);
  assert.equal(result.distance, 0);
  assert.deepEqual(result.streamed, result.immediate);
}

try {
  await check(false, async page=>{
    const go = p=>page.goto(new URL(p,base).href,{waitUntil:'domcontentloaded'});
    await go('/?intro=turtle');
    await page.getByRole('button',{name:'Lái tự do',exact:true}).waitFor();
    await checkPhoneRotation(page,false);
    assert.equal(await page.evaluate(()=>typeof THREE),'undefined','Departure grid loaded the renderer early');
    assert.equal(await page.evaluate(async()=>{
      const fonts=await document.fonts.load('italic 700 48px "Barlow Condensed"');
      return fonts.length>0 && fonts.every(font=>font.status==='loaded');
    }),true,'Opening typography missing from the bundled stylesheet');
    assert.equal(await page.evaluate(()=>Boolean(VietnamTourism.complete || window.driveBank)),false);
    const lookup=await page.evaluate(async()=>{
      const atlas=VietnamTourism,alias='osm-way-1107308686',key=atlas.aliases[alias];
      const model=VietnamLandmarks.entries.find(s=>s.id==='lang-chu-tich-ho-chi-minh');
      const cold=!model.views&&!atlas.byId.has(key);
      await Promise.all([atlas.loadById(alias),atlas.loadById(key)]);
      const downloads=performance.getEntriesByType('resource').filter(e=>e.name.includes('/journey-data/'));
      return {cold,canonical:catalogStop(alias)?.id,complete:Boolean(atlas.complete),
        lookups:downloads.filter(e=>e.name.includes('/ids-')).length};
    });
    assert.deepEqual(lookup,{cold:true,canonical:'osm-way-1158936961',complete:false,lookups:1});
    const openingGarage=page.getByLabel('Chọn xe',{exact:true});
    await openingGarage.selectOption('compact-mpv');
    assert.equal(await page.locator('#garage').inputValue(),'compact-mpv');
    await page.getByRole('button',{name:'Tập lái · Tối đa 40 km/h',exact:true}).click();
    await page.locator('body[data-phase="drive"]').waitFor();
    await page.locator('#learnerLimit').waitFor();
    const training=await page.evaluate(()=>{
      const input={power:car.spec.power,top:car.spec.top,gas:true,grade:-.25};
      const body={spec:car.spec,reverseDelay:0};
      let speed=0;
      for(let i=0;i<900;i++)speed=DriveBody.forwardSpeed(body,input,1/60,speed);
      return {model:car.model,speed:speed*3.6};
    });
    assert.deepEqual(training,{model:'family-sedan',speed:40});
    const nitroPedal=page.locator('#touch [data-key~="shift"]');
    assert.equal(await nitroPedal.isVisible(),false);
    await checkLearnerQuiz(page);
    await page.locator('#pause').click();
    const position=await page.evaluate(()=>[car.x,car.z,distance]);
    await page.getByRole('button',{name:'Chuyển sang lái tự do'}).click();
    await page.locator('#learnerLimit').waitFor({state:'hidden'});
    assert.equal(await page.locator('#practiceQuestion').getAttribute('hidden'),null);
    assert.equal(await nitroPedal.isVisible(),true);
    assert.deepEqual(await page.evaluate(()=>[car.x,car.z,distance]),position);
    assert.equal(await page.evaluate(()=>car.model),'compact-mpv');
    await page.evaluate(()=>localStorage.setItem('taylai.world.learner','1'));
    await go('/?intro=turtle');
    assert.equal(await page.evaluate(()=>car.model),'compact-mpv');
    assert.equal(await page.locator('body[data-learner]').count(),0);
    console.log('PASS learner speed limit, pause switch and saved garage choice');
    await page.locator('#openSetup').click();
    await page.locator('#garage').selectOption('touring-mpv');
    await page.locator('#closeSetup').click();
    assert.equal(await openingGarage.inputValue(),'touring-mpv');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#openingGarage').value==='touring-mpv');
    assert.equal(await page.locator('#garagePreview').getAttribute('src'),'streetscape/previews/touring-mpv.webp');
    await page.getByRole('button',{name:'Lái tự do',exact:true}).click();
    await page.locator('body[data-phase="drive"]').waitFor();
    assert.equal(await page.evaluate(()=>car.model),'touring-mpv');
    assert.match(await page.locator('#callout').textContent(),/Giữ W/);
    await page.keyboard.down('ArrowUp');
    try {
      await page.waitForFunction(()=>car.speed>0 && !$('callout').textContent && toastTime===0);
    } finally { await page.keyboard.up('ArrowUp'); }
    await checkPhoneRotation(page,true);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#tourView').click();
    const [photo]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Chụp ảnh cảnh'}).click()]);
    assert.match(photo.suggestedFilename(),/^ViVu3D-.+\.png$/);
    const png=await readFile(await photo.path());
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.ok(png.length>10000,'Expected scenery in the downloaded PNG');
    await page.locator('#secretOpen').click();
    for(let i=0;i<20 && !await page.locator('#secretCapture').isEnabled();i++){
      const hint=await page.locator('#secretDirection').innerText();
      if(hint.includes('Đổi ánh sáng'))await page.locator('#secretDusk').click();
      else if(hint.includes('lấy nét')){
        await page.locator('#secretFocus').focus();await page.keyboard.press('Home');
      }else await page.locator(hint.includes('trái')?'#secretLeft':'#secretRight').click();
    }
    await page.locator('#secretCapture').click();
    const title=await page.locator('#secretTitle').innerText();
    await page.evaluate(()=>document.fonts.ready.then(()=>true));
    const typography=await page.context().newCDPSession(page);
    try {
      await typography.send('DOM.enable');
      await typography.send('CSS.enable');
      const {root}=await typography.send('DOM.getDocument');
      const {nodeId}=await typography.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#secretTitle'});
      const {fonts}=await typography.send('CSS.getPlatformFontsForNode',{nodeId});
      assert.deepEqual(fonts.map(font=>font.postScriptName),['SourceSerif4-Bold'],'Stamp title uses a fallback font');
    } finally {await typography.detach();}
    await page.locator('#secretResult [data-postcard]').click();
    const print = page.locator('#postcardPrint');
    await print.waitFor({state:'visible'});
    assert.ok((await print.getAttribute('alt')).includes(title));
    const firstNote = await print.getAttribute('alt');
    await page.locator('#postcardNote').click();
    await page.waitForFunction(old=>!document.getElementById('postcardPrint').hidden &&
      document.getElementById('postcardPrint').alt!==old,firstNote);
    const [card] = await Promise.all([page.waitForEvent('download'), page.locator('#postcardSave').click()]);
    const jpeg = await readFile(await card.path());
    assert.equal(jpeg.readUInt16BE(0),0xffd8);
    assert.ok(jpeg.length>10000);
    await page.locator('#closePostcard').click();
    assert.equal(await page.locator('#secretResult').isVisible(),true);
    await page.locator('#secretResult [data-stamp-book]').click();
    assert.equal(await page.locator('#stampList strong').innerText(),title);
    await page.keyboard.press('Escape');
    await page.locator('#secretDone').click();
    assert.equal(await page.locator('#secretOpen').innerText(),'Xem lại dấu ẩn');
    await page.locator('#backToCar').click();
    console.log('PASS landmark discovery, journal and return to driving');
    await checkDistrictStreaming(page);
    console.log('PASS streamed district swap, cancellation, road height and contacts');
    await checkTouchPedals(page);
    await page.setViewportSize({width:640,height:480});
    console.log('PASS Xuyên Việt touch throttle, steering and nitro');
    await page.locator('#pause').click();
    await page.locator('#rest[open] #resume').click();
    assert.equal(await page.locator('#rest').isVisible(),false);
    await page.locator('#pause').click();
    assert.equal(await page.locator('#rest').isVisible(),true);
    console.log('PASS Xuyên Việt starts, pauses and resumes');
    await page.locator('#relocate').click();
    await page.waitForFunction(()=>VietnamTourism.complete&&destinations.length>11000);
    await page.locator('#findPlace').fill('Chợ Vinh');
    await page.locator('#places button').filter({hasText:'Chợ Vinh'}).first().waitFor();
    const hasModel = await page.evaluate(async()=>{
      const stop=VietnamLandmarks.entries.find(s=>s.id==='cho-vinh');
      await VietnamTourism.loadRegion(stop.lon,stop.lat);
      return typeof stop.build==='function';
    });
    assert.ok(hasModel);
    const invalidPacks=await page.evaluate(async()=>{
      const packs=await Promise.all(VietnamTourism.modelGroups.map(async({file,sites})=>{
        const {default:loaded}=await import('./'+file);
        return loaded.length===sites.length&&loaded.every((s,i)=>
          s.id===sites[i].id&&s.lon===sites[i].lon&&s.lat===sites[i].lat&&typeof s.build==='function')?null:file;
      }));
      return packs.filter(Boolean);
    });
    assert.deepEqual(invalidPacks,[],'Regional model registrations must match their Atlas entries');
    const hallView=await page.evaluate(()=>catalogStop('osm-way-903827683')?.viewOf);
    assert.deepEqual(hallView,['chua-thanh-luong',1],'The mapped hall must retain its own camera even when the pagoda uses the same map link');
    assert.equal(await page.evaluate(()=>visitsByStop.get('chua-thanh-luong')?.id),'chua-thanh-luong-hai-ho');
    console.log('PASS nationwide Atlas search and regional model loading');
    const sameCosts=await page.evaluate(async()=>{
      const path='/route-network/costs-15.gz';
      const [original,packed]=await Promise.all([path,path+'?format=packed'].map(async url=>{
        const response=await fetch(url);
        if(!response.ok)throw Error('Failed to load '+url);
        return RoadTileCodec.content(response);
      }));
      const a=new Int32Array(original.buffer),b=RoadTileCodec.routeCosts(packed);
      return a.length>0&&a.length===b.length&&a.every((value,i)=>value===b[i]);
    });
    assert.ok(sameCosts,'Public route matrix and packed routing costs must match');
    console.log('PASS legacy and packed route costs');
    await page.locator('#tourFilter').selectOption('all');
    await page.locator('#findPlace').fill('Chùa Tây Phương');
    await page.waitForFunction(()=>document.querySelector('#places button')?.textContent.includes('Chùa Tây Phương – Thạch Xá'));
    await page.locator('#findPlace').fill('');
    await page.locator('#tourFilter').selectOption('heritage');
    const routes=page.locator('#places button');
    assert.equal(await routes.count(),Math.min(24,await page.evaluate(()=>regionalVisits.length)));
    await page.locator('#findPlace').fill('Cầu tàu 914');
    const conDao=routes.filter({hasText:'Côn Đảo'});
    await conDao.waitFor();assert.equal(await conDao.count(),1);
    assert.match(await conDao.innerText(),/4 điểm dừng/);
    await conDao.click();
    assert.equal(await page.locator('#travel').innerText(),'Mở tuyến tham quan');
    await page.locator('#travel').click();
    await page.locator('#tourCamera').waitFor({state:'visible'});
    await page.locator('#complexStop').selectOption('stop/cau-tau-914');
    await page.waitForFunction(()=>document.querySelector('#tourTitle').textContent==='Cầu tàu 914');
    console.log('PASS Atlas heritage routes, stop search and touring from a parked car');
    await page.goto(base+'/?landmark=thac-do-quyen-bach-ma&view=tour',{waitUntil:'domcontentloaded'});
    await page.locator('#tourCamera').waitFor({state:'visible'});
    assert.equal(await page.locator('#tourTitle').innerText(),'Thác Đỗ Quyên');
    console.log('PASS Bạch Mã waterfall builds on its terrain');
    await go('/?landmark=osm-node-4858968321&view=tour');
    await page.locator('#tourCamera').waitFor({state:'visible'});
    const bay=await page.evaluate(()=>{
      const {monument}=car.sightView,site=monument.data;
      const summit=roads.point(site.lookout.lon,site.lookout.lat),marker=roads.point(site.lon,site.lat);
      return {atLookout:Math.hypot(monument.x-summit.x,monument.z-summit.z),
        fromMarker:Math.hypot(monument.x-marker.x,monument.z-marker.z),photos:NatureFieldCaptures[site.id].length};
    });
    assert.ok(bay.atLookout<1&&bay.fromMarker>2000&&bay.photos>=4,'Lan Hạ tour must open on Cát Dứa and keep its offshore Atlas pin');
    console.log('PASS Lan Hạ island lookout and photographic views');

    await go('/?landmark=phu-yen-mui-cay-vung-chao&view=tour');
    await page.locator('#tourCamera').waitFor({state:'visible'});
    const cape=await page.evaluate(()=>{
      const {monument,data}=car.sightView,port=roads.point(109.2902731,13.4461723);
      return {model:monument.data.id,angle:data.viewAngle,expectedAngle:monument.data.views?.[3]?.viewAngle,
        parkingError:Math.hypot(port.x-car.x,port.z-car.z)};
    });
    assert.equal(cape.model,'vinh-xuan-dai');
    assert.equal(cape.angle,cape.expectedAngle);
    assert.ok(cape.parkingError<8,'Direct access to the distant cove must park at its own harbour');
    console.log('PASS Vũng Chào harbour arrival and camera on the shared bay model');

    await page.setViewportSize({width:320,height:568});
    await go('/?landmark=osm-node-2089305122&view=tour');
    const panel=page.locator('#tourCamera'),notes=page.locator('#tourInfo summary');
    await panel.waitFor({state:'visible'});
    assert.equal(await page.locator('#tourTitle').innerText(),'Động Hương Tích');
    assert.ok((await panel.boundingBox()).height<284,'Keep at least half the small portrait screen for the cave');
    await notes.focus();await notes.press('Enter');
    assert.match(await page.locator('#tourDescription').innerText(),/chợ Đục Khê/);
    assert.equal(await page.locator('#tourInfo').evaluate(e=>e.open),true);
    await page.setViewportSize({width:640,height:480});
    console.log('PASS Hương Tích cave and expandable sightseeing notes on a small phone');

    await go('/cup');
    await page.locator('#launch').click();
    await page.locator('body[data-phase="drive"]').waitFor();
    await page.setViewportSize({width:844,height:390});
    await page.evaluate(()=>{document.body.dataset.steering='right';});
    await checkTouchPedals(page);
    await page.setViewportSize({width:640,height:480});
    console.log('PASS Cúp Bánh Mì mirrored touch throttle, steering and nitro');
    console.log('PASS Cúp Bánh Mì reaches the track');

    await go('/theory-exam');
    await page.locator('#begin').click();
    await page.locator('#choices button').first().click();
    await page.locator('#progress').filter({hasText:/^1\/30/}).waitFor();
    await page.locator('#submit').click();
    await page.locator('#send').click();
    await page.locator('#result').waitFor();
    assert.match(await page.locator('#result').innerText(),/\d+\/30/);
    const images = await page.evaluate(()=>window.driveBank.filter(q=>q.image).map(q=>q.imageAlt));
    assert.equal(images.length,318);
    assert.ok(images.every(description=>typeof description==='string'&&description.length>15));
    console.log('PASS theory exam answers, grades and includes 318 image descriptions');
  });
  await check(false,page=>checkExperience(page,base));
  await check(true, async page=>{
    for (const route of ['/cup','/yard','/road-exam','/streets','/?intro=turtle']) {
      await page.goto(new URL(route,base).href,{waitUntil:'domcontentloaded'});
      if (route.startsWith('/?')) await page.getByRole('button',{name:'Lái tự do',exact:true}).click();
      const theory = page.locator('#graphicsUnavailable[open]').getByRole('link',{name:'Ôn lý thuyết'});
      await theory.waitFor();
      await theory.click();
      await page.waitForURL('**/theory-exam');
      if(await page.locator('#begin').isVisible())await page.locator('#begin').click();
      await page.locator('#choices button').first().waitFor();
    }
    console.log('PASS all five 3D modes reach an interactive exam without WebGL');
  });
} finally {
  if(server)await new Promise(resolve=>server.close(resolve));
}
