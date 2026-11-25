import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const window={};
runInNewContext(readFileSync(new URL('../../dist/drivetrain.js',import.meta.url),'utf8'),{window});
const body=window.DriveBody;

function start(kmh) {
  const car={model:'supercar',x:0,z:0,yaw:0,spec:{power:8.4,top:48}};
  body.reset(car);
  car.speed=kmh/3.6;
  car.vz=-car.speed;
  return car;
}

function drive(car,steer,seconds,hz,steeringProfile=3) {
  const input={steer,steeringProfile,grade:0,gas:false,power:car.spec.power,top:car.spec.top};
  for(let remaining=seconds;remaining>1e-9;) {
    const frame=Math.min(1/hz,remaining);
    const steps=Math.ceil(frame*90);
    for(let i=0;i<steps;i++)body.step(car,input,frame/steps);
    remaining-=frame;
  }
}

// Flat-road snapshots from the three published models, at 10 ms per step.
const historical=[15.987719669,3.539481200,1.163400469];
let lastDistance=Infinity;
for(let notch=100;notch<=300;notch++){
  const profile=notch/100,car=start(200);
  drive(car,1,.2,100,profile);drive(car,0,.8,100,profile);
  assert.ok(car.x<lastDistance,'This longer turn changes progressively between versions');
  if(Number.isInteger(profile))assert.ok(Math.abs(car.x-historical[profile-1])<1e-6,'Published steering response');
  lastDistance=car.x;
}
const gentle=start(200),unset=start(200);
for(let i=0;i<100;i++){
  const input={steer:i<20?1:0,top:48};
  body.step(unset,input,.01);body.step(gentle,{...input,steeringProfile:4},.01);
}
assert.equal(unset.x,gentle.x,'An absent preference uses gentle steering');
for(const hz of [30,60,144]){
  for(const speed of [-10,20,60,100,200]){
    for(const dir of [-1,1]){
      const flexible=start(speed),soft=start(speed);
      drive(flexible,dir,.14,hz,'adaptive');drive(soft,dir,.14,hz,4);
      assert.equal(flexible.x,soft.x,'A short adaptive correction follows the gentle trajectory');
      drive(flexible,0,.1,hz,'adaptive');
      drive(flexible,dir,.14,hz,'adaptive');
      assert.equal(flexible.directBlend,0,'Separate lane corrections do not accumulate');
      drive(flexible,dir,.14,hz,'adaptive');
      assert.ok(flexible.directBlend>.45&&flexible.directBlend<.55,'The wheel blends partway through the hold');
      drive(flexible,dir,.13,hz,'adaptive');
      const direct={...flexible};
      drive(flexible,dir,.1,hz,'adaptive');drive(direct,dir,.1,hz,1);
      assert.ok(Math.abs(flexible.yaw-direct.yaw)<1e-9,'A sustained hold uses the original direct steering angle');
      drive(flexible,-dir,.16,hz,'adaptive');
      assert.ok(flexible.steer*dir<0&&flexible.directBlend<.05,'Reversing starts a new hold');
      drive(flexible,-dir,.3,hz,'adaptive');
      drive(flexible,0,.05,hz,'adaptive');
      assert.ok(flexible.directBlend>0&&flexible.directBlend<1,'Release eases out of a direct turn');
      drive(flexible,0,.11,hz,'adaptive');
      assert.equal(flexible.directBlend,0,'Released steering returns to gentle');
      body.reset(flexible);
      assert.equal(flexible.steerHold,0);
    }
  }
}
for(const hz of [30,60,100,144]){
  for(const speed of [-10,20,40,60,100,200]){
    const right=start(speed),left=start(speed),previous=start(speed);
    for(const [car,dir,profile] of [[right,1,4],[left,-1,4],[previous,1,3]]){
      drive(car,dir,.1,hz,profile);drive(car,0,.9,hz,profile);
    }
    assert.ok(Math.abs(right.x+left.x)<1e-8,'Gentle steering is symmetric');
    assert.ok(right.x>0&&right.x<previous.x*.75,'A tap makes a smaller correction');
    const held=start(speed);
    drive(held,1,.65,hz,4);
    assert.ok(held.steer>.98,'A held button still reaches full travel');
    drive(held,-1,.1,hz,4);
    assert.ok(held.steer<0,'Opposite input promptly crosses centre');
  }
}

for(const hz of [30,60,100,144]) {
  for(const speed of [-10,0,10,20,40,60,100,150,200]) {
    const right=start(speed),left=start(speed);
    drive(right,1,.1,hz);
    drive(left,-1,.1,hz);
    const tap=right.steer;
    if(Math.abs(speed)<=20)assert.ok(Math.abs(tap-(1-Math.exp(-.8)))<1e-8,'Parking response');
    drive(right,0,.9,hz);
    drive(left,0,.9,hz);
    assert.ok(Math.abs(right.x+left.x)<1e-8,'Left/right symmetry');
    assert.ok(Math.abs(right.steer)<.001,'Released steering returns to centre');
    if(speed>=40)assert.ok(right.x>.1&&right.x<.8,`Lane correction at ${speed} km/h, ${hz} Hz: ${right.x} m`);

    const turn=start(speed);
    drive(turn,1,.6,hz);
    assert.ok(turn.steer>.96,'Sustained turn reaches the available wheel angle');
    drive(turn,-1,.1,hz);
    assert.ok(turn.steer<0,'Countersteering crosses centre within 100 ms');
    body.reset(turn);
    drive(turn,0,.02,hz);
    assert.equal(turn.steer,0,'Restart clears held steering');

    if(speed>=40) {
      const correction=start(speed);
      drive(correction,1,.25,hz);
      drive(correction,-1,.25,hz);
      drive(correction,0,.25,hz);
      assert.ok(Math.abs(correction.yaw)<Math.PI/120,'Equal opposite inputs bring heading back within 1.5 degrees');
    }
  }
}

const host={window:{addEventListener(){}},document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},
  matchMedia:()=>({addEventListener(){}}),performance};
const makeInput=runInNewContext(readFileSync(new URL('../../dist/drive-input.js',import.meta.url),'utf8')+
  '\ncreateDriveInput',host);
for(const hz of [30,60,100,144]) {
  for(const speed of [100,150,200]) {
    let previous=0;
    for(const ms of [50,100,150,200,250]) {
      const car=start(speed);
      drive(car,1,ms/1000,hz);
      drive(car,0,1-ms/1000,hz);
      const increment=car.x-previous;
      assert.ok(increment>.18&&increment<.40,`Progressive 50 ms increment at ${speed} km/h: ${increment} m`);
      previous=car.x;
    }
    const turn=start(speed);
    drive(turn,1,.65,hz);
    assert.ok(turn.yaw>.08&&turn.yaw<.25,'A held turn is effective and bounded at highway speed');
  }
  for(const phase of [1,5,13,22]) {
    const input=makeInput({timedSteering:true});
    input.add('d',phase);
    input.add('arrowright',phase+5);
    input.delete('d',phase+20);
    input.delete('arrowright',phase+100);
    input.add('a',phase+112);
    input.delete('a',phase+117);
    let duration=0;
    for(let frame=1;frame<=hz;frame++) {
      const steps=Math.ceil(90/hz),dt=1/hz/steps;
      for(let i=0;i<steps;i++){
        const end=1000*(frame/hz-(steps-i-1)*dt);
        duration+=input.steering(end,dt,3)*dt*1000;
      }
    }
    assert.ok(Math.abs(duration-95)<1e-6,'100 ms right, then a 5 ms left tap between frames');
    input.add('d',1200);input.clear();
    assert.equal(input.steering(1250,.01),0,'Clearing input discards pending turns');
  }
}
for(const profile of [1,1.5,2,2.5,3,3.5,4,'adaptive',undefined]){
  const input=makeInput({timedSteering:true});
  input.add('d',5);input.delete('d',15);
  const timedShare=profile==='adaptive'?1:Math.max(0,Math.min(1,(profile??4)-2));
  assert.ok(Math.abs(input.steering(20,.020,profile)-.5*timedShare)<1e-10,'A between-frame tap is counted once');
}
// Reproduce capped frames using the same clock and substeps as both game loops.
function frameSteering(input,start,end,profile){
  const dt=Math.min(.1,(end-start)/1000),steps=Math.ceil(dt*90),step=dt/steps;
  input.prepareSteeringFrame(end,end-start,dt);
  let right=0,left=0;
  for(let i=0;i<steps;i++){
    const value=input.steering(end-(steps-i-1)*step*1000,step,profile);
    assert.ok(Math.abs(value)<=1.000001);
    right+=Math.max(0,value)*step*1000;left+=Math.max(0,-value)*step*1000;
  }
  return [right,left].map(Math.round);
}
for(const profile of [1,2,2.5,3,4,'adaptive']){
  const input=makeInput({timedSteering:true});
  input.add('a',20);input.delete('a',120);
  input.add('d',255);input.delete('d',265);
  assert.deepEqual(frameSteering(input,0,250,profile),[0,100],'A 100 ms tap survives a 250 ms stall');
  assert.deepEqual(frameSteering(input,250,270,4),[10,0],'Future input keeps its timestamp');
  assert.deepEqual(frameSteering(input,270,290,profile),[0,0],'Released input is consumed once');
  input.add('d',300);input.delete('d',400);input.add('a',400);input.delete('a',500);
  const reversal=frameSteering(input,290,540,profile);
  // Opposite directions can cancel within their one shared physics substep.
  assert.ok(reversal[0]>=44&&reversal[0]<=50&&reversal[0]===reversal[1]);
  input.clear();input.add('d',550);input.delete('d',650);input.clear();
  assert.deepEqual(frameSteering(input,540,790,profile),[0,0],'Clearing cancels buffered taps');
  input.add('d',800);
  frameSteering(input,790,810,profile);
  input.delete('d',990);
  assert.deepEqual(frameSteering(input,810,1060,profile),[100,0],'A held turn is counted up to the simulation cap');
  assert.deepEqual(frameSteering(input,1060,1080,profile),[0,0],'The release survives compression');
}
console.log('PASS adaptive, gentle and legacy steering across ordinary and stalled frames');
