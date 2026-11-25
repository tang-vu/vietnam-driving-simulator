// Run with "working" or the Git revision containing the drivetrain to compare.
// The second argument is a JSON result path. An optional third revision pins
// the rest of the browser's HTML, CSS and JS for comparisons on a dirty tree.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';

const [revision,output,fixtureRevision]=process.argv.slice(2);
assert(revision && output,'Provide working or a Git revision, then an output JSON path');
const dist=fileURLToPath(new URL('../../dist/',import.meta.url));
const baseline=revision==='working'?null:execFileSync('git',['show',revision+':dist/drivetrain.js'],{cwd:dist});
const pinnedFiles=new Map();
const origin='http://127.0.0.1:8871',results=[];
const browser=await chromium.launch({executablePath:chromium.executablePath(),args:['--enable-gpu']});
try{
  for(const cup of [false,true]){
    const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,locale:'vi-VN'});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-23T05:00:00Z'));
    await page.addInitScript(()=>{
      localStorage.setItem('taylai.cockpit.v1',JSON.stringify({graphics:'low',touchControl:'buttons'}));
      localStorage.setItem('taylai.world.traffic','quiet');
    });
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname.startsWith('/api/'))return route.fulfill({json:{runId:'00000000-0000-4000-8000-000000000000',entries:[]}});
      if(baseline&&url.pathname==='/drivetrain.js')return route.fulfill({contentType:'text/javascript',body:baseline});
      const file=path.resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      assert(file.startsWith(dist));
      const extension=path.extname(file),contentType={'.html':'text/html','.css':'text/css','.js':'text/javascript'}[extension];
      if(fixtureRevision&&contentType&&url.pathname!=='/drivetrain.js'){
        const relative=path.relative(dist,file).split(path.sep).join('/');
        if(!pinnedFiles.has(file))pinnedFiles.set(file,execFileSync('git',['show',fixtureRevision+':dist/'+relative],{cwd:dist,maxBuffer:16*1024*1024}));
        return route.fulfill({body:pinnedFiles.get(file),contentType});
      }
      try{await route.fulfill({path:file});}catch{await route.fulfill({status:404});}
    });
    await page.goto(origin+(cup?'/cup.html?route=river':'/?intro=turtle'),{waitUntil:'domcontentloaded'});
    if(cup){
      await page.locator('#launch').click();
      await page.waitForFunction(()=>state.mode==='drive');
    }else{
      await page.waitForFunction(()=>typeof mode!=='undefined'&&mode==='grid');
      await page.evaluate(async()=>{
        await startAt(['CT.04',106.19080,20.854725],{edge:375982,dir:1,distance:0});
        if(mode!=='grid'||player.edge.id!==375982)throw Error('Missing CT.04 departure');
        garageVehicle='supercar';
        await begin();
      });
    }
    await page.evaluate(cup=>{
      // RAF can keep drawing. Advance the unmodified physics callback at a
      // fixed rate after the real keyboard/touch event has reached the game.
      if(cup){
        window.advanceSteering=raceUpdate;raceUpdate=()=>{};
        rivals.length=0;roadTraffic.length=0;racers=[state];
      }
      else{window.advanceSteering=tick;tick=()=>{};window.steeringStart={...player};}
      window.measuredCar=cup?cupBody:car;
      const resolve=DriveBody.resolve;
      DriveBody.resolve=function(body,...args){
        if(body===measuredCar)window.contacts++;
        return resolve.call(this,body,...args);
      };
    },cup);
    const client=await page.context().newCDPSession(page);
    for(const input of ['keyboard','touch']){
      async function press(right,down){
        if(input==='keyboard')return page.keyboard[down?'down':'up'](right?'ArrowRight':'ArrowLeft');
        let points=[];
        if(down){
          const box=await page.locator('#touch [data-key='+ (right?'d':'a') +']').boundingBox();
          assert(box,'Missing steering button');
          points=[{id:1,x:box.x+box.width/2,y:box.y+box.height/2}];
        }
        return client.send('Input.dispatchTouchEvent',{type:down?'touchStart':'touchEnd',touchPoints:points});
      }
      const taps=(cup?[20,100]:[0,20,60,100,150,200]).map(speed=>({speed,name:'tap',right:10,left:0,coast:90}));
      const maneuvers=[{speed:12,name:'hold',right:65,left:0,coast:0},
        {speed:60,name:'counter',right:25,left:25,coast:25}];
      const highway=cup?[]:[100,200].flatMap(speed=>[
        ...[5,15,20,25].map(right=>({speed,name:'tap',right,left:0,coast:100-right})),
        {speed,name:'hold',right:65,left:0,coast:0}
      ]);
      const trafficTaps=cup||input==='touch'?[]:['quiet','busy'].flatMap(traffic=>
        taps.filter(t=>t.speed>0).map(t=>({...t,traffic})));
      for(const test of [...taps,...maneuvers,...highway,...trafficTaps]){
        await page.evaluate(({speed,traffic,cup})=>{
          window.contacts=0;
          window.peakLateralG=0;
          if(cup){state.d=90;state.offset=-2.8;parkCup();vitality=100;grace=0;}
          else{
            player={...steeringStart};parkOnRoad();
            Object.assign(car,roads.sample(player,-4.45),{parked:false,opening:false,openingPose:0});
            npcs=[];spawnTick=0;cooldown=0;hp=100;
            if(traffic){
              $('trafficLevel').value=traffic;
              // Drive the game's normal spawner with a repeatable sequence.
              let seed=375982;
              window.trafficRandom=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
              const random=Math.random;
              Math.random=trafficRandom;
              try{
                nextNpc=1;nearby=roads.nearby(car.x,car.z,560);
                seedTraffic();
                for(let i=0;i<12;i++)fillTraffic();
              }finally{Math.random=random;}
              window.spawnedCars=npcs.map(n=>({id:n.id,x:n.x,z:n.z}));
            }
          }
          const b=measuredCar;
          b.speed=speed/3.6;b.vx=b.speed*Math.sin(b.yaw);b.vz=-b.speed*Math.cos(b.yaw);
          if(cup)syncCup();
          window.referencePose={x:b.x,z:b.z,yaw:b.yaw};
        },{speed:test.speed,traffic:test.traffic,cup});
        async function step(count,right,left){
          return page.evaluate(({count,right,left,cup,traffic})=>{
            if(held('d','arrowright')!==right||held('a','arrowleft')!==left)throw Error('Input mismatch');
            const random=Math.random;
            if(traffic)Math.random=trafficRandom;
            const b=measuredCar;
            try{
              for(let i=0;i<count;i++){
                const vx=b.vx,vz=b.vz;
                advanceSteering(.01);
                // Project the velocity change onto the normal to the path.
                const midX=(vx+b.vx)/2,midZ=(vz+b.vz)/2,speed=Math.hypot(midX,midZ);
                if(speed>.05){
                  const normalAcceleration=(midX*(b.vz-vz)-midZ*(b.vx-vx))/(speed*.01);
                  window.peakLateralG=Math.max(peakLateralG,Math.abs(normalAcceleration)/9.80665);
                }
              }
            }finally{Math.random=random;}
            if((cup?state.mode:mode)!=='drive')throw Error('Drive interrupted');
            const a=referencePose;
            return {steer:b.steer,heading:(b.yaw-a.yaw)*180/Math.PI,peakLateralG,
              lateral:(b.x-a.x)*Math.cos(a.yaw)+(b.z-a.z)*Math.sin(a.yaw),health:cup?vitality:hp,contacts};
          },{count,right,left,cup,traffic:test.traffic});
        }
        await press(true,true);
        const atRight=await step(test.right,true,false);
        await press(true,false);
        let atLeft;
        if(test.left){
          await press(false,true);
          atLeft=await step(test.left,false,true);
          await press(false,false);
        }
        const end=await step(test.coast,false,false);
        assert(atRight.steer>0,'Right input did not turn the wheels');
        if(atLeft)assert(atLeft.steer<0,'Countersteer did not cross center');
        if(test.speed)assert(end.lateral>0,'Expected displacement to the right');
        else assert.equal(end.lateral,0);
        assert.equal(end.contacts,0,'Unexpected contact');
        assert.equal(end.health,100);
        const result={mode:cup?'cup':'journey',input,...test,atRight,atLeft,end};
        if(test.traffic){
          result.trafficCars=await page.evaluate(()=>{
            const moved=npcs.filter(n=>spawnedCars.some(s=>s.id===n.id&&Math.hypot(n.x-s.x,n.z-s.z)>1));
            const distances=spawnedCars.map(s=>Math.hypot(s.x-referencePose.x,s.z-referencePose.z));
            return {start:spawnedCars.length,within100m:distances.filter(d=>d<=100).length,
              closestAtStart:Math.min(...distances),movedOver1m:moved.length,end:npcs.length,phase:mode};
          });
          const cars=result.trafficCars;
          assert(cars.start>0,'Expected traffic at departure');
          assert.equal(cars.end,cars.start);
          assert.equal(cars.movedOver1m,cars.start,'Expected every traffic car to move');
          if(test.traffic==='busy'){
            const quiet=results.find(r=>r.traffic==='quiet'&&r.speed===test.speed).trafficCars;
            assert(cars.start>quiet.start&&cars.within100m>quiet.within100m,'Expected denser traffic');
          }
        }
        if(input==='touch'){
          const keyboard=results.find(r=>r.input==='keyboard'&&r.mode===result.mode&&r.name===test.name&&
            r.speed===test.speed&&r.right===test.right&&!r.traffic);
          for(const phase of ['atRight','atLeft','end']){
            for(const key of ['lateral','heading','steer','peakLateralG']){
              if(result[phase])assert(Math.abs(result[phase][key]-keyboard[phase][key])<1e-6,'Keyboard and touch diverged');
            }
          }
        }
        results.push(result);
      }
    }
    assert.deepEqual(errors,[]);
    await page.close();
    console.log('PASS',cup?'Cup':'CT.04','keyboard/touch steering');
  }
  await writeFile(output,JSON.stringify(results,null,2)+'\n');
}finally{await browser.close();}
