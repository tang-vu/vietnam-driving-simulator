'use strict';
// The chassis moves in world metres. Navigation may measure its pose, but never supplies a steering angle.
window.DriveBody={
 recordDent(body,hit,speed,heading){
   if(speed<=4)return;
   body.dent={side:-hit.nx*Math.cos(heading)-hit.nz*Math.sin(heading),
     front:-hit.nx*Math.sin(heading)+hit.nz*Math.cos(heading),strength:Math.min(1,speed/22)};
 },
 // kg, dimensionless normal restitution. Vehicle masses include a nominal occupant.
 mass(body){
   if(body?.spec?.mass)return body.spec.mass;
   return body?.bike||body?.kind==='scooter'?205:({rally:1260,gt:1570,supercar:1480,van:1900,taxi:1420,rival:1460,person:75}[body?.model||body?.kind]||1450);
 },
 strikeTraffic(actor,hit,event,yaw,attackerX,attackerZ,targetX,targetZ){
   if(event.closing<.8)return;
   const bike=actor.bike||actor.kind==='scooter',s=Math.sin(yaw),c=Math.cos(yaw);
   const side=-hit.nx*c-hit.nz*s,front=-hit.nx*s+hit.nz*c;
   const dx=attackerX-targetX,dz=attackerZ-targetZ,lever=dx*s-dz*c,lateral=dx*c+dz*s;
   const a=actor.recoil??={x:0,z:0,y:0,vy:0,angle:0,vx:0,vz:0,spin:0,pitch:0,roll:0,age:0};
   const delta=event.impulse/event.targetMass;
   // A struck two-wheeler can pivot up over the bumper. Budget lift from the
   // available normal energy, leaving the rest for slip, rotation and damage.
   if(bike&&event.energy>event.targetMass*9.81*.38){
     if(!a.fallen){
       a.vx=event.otherVX;a.vz=event.otherVZ;
       a.fallen=true;a.sideSign=Math.sign(side)||Math.sign(lateral)||1;
       a.rollSpeed=0;a.pitchSpeed=0;
     }
     const liftEnergy=Math.max(0,event.energy-4500)*(.052+.055*Math.abs(front));
     const lift=Math.min(9,Math.sqrt(2*liftEnergy/event.targetMass),delta*.47);
     a.vy+=lift;
     const horizontal=Math.sqrt(Math.max(0,delta*delta-lift*lift));
     a.vx-=hit.nx*horizontal;a.vz-=hit.nz*horizontal;
     a.rollSpeed+=a.sideSign*Math.min(8,.9+delta*.17);
     a.pitchSpeed+=front*Math.min(5,delta*.15);
   }else{a.vx-=hit.nx*delta;a.vz-=hit.nz*delta;}
   a.spin+=Math.max(-5,Math.min(5,(lever*side-lateral*front)*delta*.17));
   a.age=0;a.side=side;a.front=front;a.force=event.strength;a.braking=.45+a.force*1.5;
   this.recordDent(actor,{nx:-hit.nx,nz:-hit.nz},delta,yaw);
 },
 advanceRecoil(actor,dt){
   const a=actor.recoil;if(!a)return 0;
   a.braking=Math.max(0,a.braking-dt);a.age+=dt;
   if(a.fallen){
     let landing=0;a.scrape=false;
     if(a.y>0||a.vy>0){
       a.y+=a.vy*dt-.5*9.81*dt*dt;a.vy-=9.81*dt;
       a.roll+=a.rollSpeed*dt;a.pitch+=a.pitchSpeed*dt;
       if(a.y<=0){
         landing=.5*this.mass(actor)*a.vy*a.vy;
         const tangent=Math.hypot(a.vx,a.vz);
         const friction=tangent?Math.max(0,1-.48*Math.abs(a.vy)/tangent):0;
         a.vx*=friction;a.vz*=friction;
         a.y=0;a.vy=Math.abs(a.vy)>2.5?-a.vy*.23:0;
         a.rollSpeed*=-.25;a.pitchSpeed*=-.22;
       }
     }
     if(!a.y&&!a.vy){
       const v=Math.hypot(a.vx,a.vz),ratio=v?Math.max(0,1-6.8*dt/v):0;
       a.vx*=ratio;a.vz*=ratio;a.spin*=Math.exp(-dt*3);
       if(v>3){
         a.scrapeDistance=(a.scrapeDistance||0)+v*dt;
         if(a.scrapeDistance>=1.4){a.scrape=true;a.scrapeDistance%=1.4;}
       }
       const rest=a.sideSign*1.36,wrap=r=>Math.atan2(Math.sin(r),Math.cos(r));
       a.roll+=wrap(rest-a.roll)*(1-Math.exp(-dt*8));a.pitch+=wrap(-a.pitch)*(1-Math.exp(-dt*8));
     }
     a.x+=a.vx*dt;a.z+=a.vz*dt;a.angle+=a.spin*dt;
     return landing;
   }
   for(const [p,v] of [['x','vx'],['z','vz'],['angle','spin']]){
     a[v]+=(a.braking?0:-a[p]*3.2)*dt;a[v]*=Math.exp(-dt*(a.braking?3.8:3.2));a[p]+=a[v]*dt;
   }
   const wave=Math.sin(a.age*12)*Math.exp(-a.age*3.3)*a.force;
   a.roll=a.side*wave*((actor.bike||actor.kind==='scooter') ? .65 : .21);a.pitch=a.front*wave*.14;
   if(a.age>7)delete actor.recoil;
   return 0;
 },
 reset(c){
   delete c.dent;delete c.axlePose;c.jointPitch=0;c.jointHeave=0;c.jointSteer=0;
   c.steerHold=0;c.directBlend=0;
   c.vx=0;c.vz=0;c.speed=0;c.steer=0;c.steerTravel=0;c.spin=0;c.slip=0;c.pitch=0;c.roll=0;c.boost=false;c.brake=false;c.offroad=false;c.reverseDelay=0;
 },
 settle(c,dt){
   const drag=Math.exp(-dt*8);
   c.vx*=drag;c.vz*=drag;c.spin*=drag;
   c.x+=c.vx*dt;c.z+=c.vz*dt;c.yaw+=c.spin*dt;
   c.speed=c.vx*Math.sin(c.yaw)-c.vz*Math.cos(c.yaw);
 },
 passingBikes(m,ox,oz,listener,bikes){
   const x=ox+m[12],z=oz+m[14],right=Math.hypot(m[0],m[2])||1,front=Math.hypot(m[8],m[10])||1;
   const sources=[];
   for(const b of bikes){
     const dx=b.x-x,dz=b.z-z,d=Math.hypot(dx,dz);
     if(d>90)continue;
     const vx=Math.sin(b.yaw)*b.speed,vz=-Math.cos(b.yaw)*b.speed;
     sources.push({id:b.id,speed:b.speed,right:(dx*m[0]+dz*m[2])/right,forward:-(dx*m[8]+dz*m[10])/front,
       closing:((listener.vx-vx)*dx+(listener.vz-vz)*dz)/Math.max(.1,d)});
   }
   return sources;
 },
 roadGrip(surface,wet=0){
   const soaked={asphalt:.71,roadConcrete:.77,roadSlabs:.70,pavers:.61,earth:.64,roadWood:.53,roadMetal:.47}[surface]??.71;
   return 1-(1-soaked)*Math.min(1,Math.max(0,wet));
 },
 axleJoints(c,dt,lines,onImpact){
   const previous=c.axlePose,pose={x:c.x,z:c.z,yaw:c.yaw};c.axlePose=pose;
   c.jointPitch=(c.jointPitch||0)*Math.exp(-dt*12);c.jointHeave=(c.jointHeave||0)*Math.exp(-dt*15);
   c.jointSteer=(c.jointSteer||0)*Math.exp(-dt*19);
   if(!previous||!lines?.length||Math.hypot(c.x-previous.x,c.z-previous.z)>2+Math.abs(c.speed)*dt)return;
   const base=c.spec?.wheelbase??2.68,rear=c.spec?.rearAxle??base/2;
   for(const line of lines){
     for(const back of [false,true]){
       const offset=back?-rear:base-rear;
       const ax=previous.x+Math.sin(previous.yaw)*offset-line.x,az=previous.z-Math.cos(previous.yaw)*offset-line.z;
       const bx=c.x+Math.sin(c.yaw)*offset-line.x,bz=c.z-Math.cos(c.yaw)*offset-line.z;
       const d0=ax*line.fx+az*line.fz,d1=bx*line.fx+bz*line.fz;
       if((d0<0)===(d1<0))continue;
       const t=d0/(d0-d1),across=-(ax+(bx-ax)*t)*line.fz+(az+(bz-az)*t)*line.fx;
       if(Math.abs(across)>line.width)continue;
       const hit=Math.min(1,Math.abs(c.speed)/15);
       c.jointPitch+=(back?-1:1)*hit*.018;c.jointHeave+=hit*.021;
       if(!back)c.jointSteer+=hit*.035*Math.sin(c.yaw-Math.atan2(line.fx,-line.fz));
       onImpact?.(Math.abs(c.speed),back);
     }
   }
 },
 forwardSpeed(c,input,dt,forward,traction=1){
   const limit=input.top+(input.boost?9:0);
   let drive=input.gas?input.power:0;
   if(input.boost&&forward>=-.3)drive+=13;
   c.reverseDelay=input.reverse&&forward<=.35?c.reverseDelay+dt:0;
   // Keep the brake engaged through the direction change on a downhill start.
   c.brake=input.brake||input.reverse&&(forward>.35||!input.gas&&c.reverseDelay<=.28&&forward>=0);
   c.boost=input.boost&&!c.brake&&forward>=-.3;
   if(input.reverse&&c.reverseDelay>.28&&!input.gas&&forward>-5)drive=-4.4;
   if(forward>=limit&&drive>0)drive=0;
   const drag=(c.offroad?1.65:.48)+(c.offroad?.013:.0031)*forward*forward+(c.brake?(c.spec?.braking??17)*traction:0);
   const grade=input.grade||0,gravity=9.81*grade/Math.hypot(1,grade);
   const rolling=forward+(drive-gravity)*dt;
   const next=rolling-Math.sign(rolling)*Math.min(Math.abs(rolling),drag*dt);
   return c.spec?.speedGovernor?Math.min(next,input.top):next;
 },
 wheelAngle(c,input,dt,forward,next,wheelbase,traction=1){
   const steeringLock=(c.spec?.steerLock??.52)/(1+Math.abs(next)*.056);
   if(input.wheelAxis!=null){
     // A thumb position requests a wheel angle, independent of digital hold time.
     c.steerHold=0;c.directBlend=0;
     c.steer+=(input.wheelAxis-c.steer)*(1-Math.exp(-dt*20));
     c.steerTravel=c.steer;
     return c.steer*steeringLock;
   }
   const adaptive=input.steeringProfile==='adaptive';
   const profile=adaptive?4:(input.steeringProfile??4);
   let classic=Math.max(0,2-profile);
   if(adaptive){
     // Accumulate time in one direction. A partial digital step counts only its held fraction.
     const previousHold=c.steerHold||0;
     c.steerHold=(previousHold*input.steer>0?previousHold:0)+input.steer*dt;
     const target=Math.min(1,Math.max(0,(Math.abs(c.steerHold)-.15)/.25));
     // Ease back out over 150 ms on release or reversal, even from full lock.
     c.directBlend=Math.max(target,(c.directBlend||0)-dt/.15);
     classic=c.directBlend*c.directBlend*(3-2*c.directBlend);
   }else{
     c.steerHold=0;c.directBlend=0;
   }
   if(profile===1){
     c.steer+=(input.steer-c.steer)*(1-Math.exp(-dt*8));
     c.steerTravel=c.steer;
     return c.steer*steeringLock;
   }
   const revised=adaptive?1-classic:Math.min(1,Math.max(0,profile-2));
   const middle=adaptive?0:1-classic-revised;
   const travel=c.steerTravel??c.steer;
   const speedKmh=Math.abs(forward)*3.6;
   const middleCurve=3*Math.max(0,Math.min(1,(speedKmh-20)/120));
   // Ease short taps near centre while a sustained press still reaches full travel.
   const gentle=Math.max(0,profile-3);
   const revisedCurve=.3*Math.max(0,Math.min(1,(speedKmh-20)/80))+
     gentle*(.45+.30*Math.min(1,speedKmh/80));
   // Reversing unwinds the previous turn faster, until the wheel crosses centre.
   let decay=dt*8;
   if(travel*input.steer<0){
     const unwind=4*(middle*middleCurve+revised*revisedCurve);
     const toCentre=Math.log1p(Math.abs(travel/input.steer))/(8+unwind);
     decay+=unwind*Math.min(dt,toCentre);
   }
   c.steerTravel=travel+(input.steer-travel)*(1-Math.exp(-decay));
   const sign=Math.sign(c.steerTravel),amount=Math.abs(c.steerTravel);
   const uncapped=classic*c.steerTravel+(middle?middle*sign*amount**(1+middleCurve):0);
   c.steer=uncapped;
   if(!revised)return uncapped*steeringLock;
   // Blend wheel angles after applying each version's own steering limit.
   const capped=revised*sign*amount**(1+revisedCurve);
   c.steer+=capped;
   const lateralLimit=Math.min(c.offroad?7:12,c.spec?.braking??12)*traction;
   const gripLock=Math.atan2(lateralLimit*wheelbase,next*next);
   return uncapped*steeringLock+capped*Math.min(steeringLock,gripLock);
 },
 step(c,input,dt){
   if(!(dt>0))return;
   const sx=Math.sin(c.yaw),cz=Math.cos(c.yaw),forward=c.vx*sx-c.vz*cz,side=c.vx*cz+c.vz*sx;
   const traction=this.roadGrip(input.surface,input.wetness);
   const grip=(c.offroad?4.2:c.model==='rally'?9:7.2)*traction;
   const next=this.forwardSpeed(c,input,dt,forward,traction);
   const wheelbase=c.spec?.wheelbase??2.68;
   const wheel=this.wheelAngle(c,input,dt,forward,next,wheelbase,traction);
   const yawRate=Math.max(-1.8,Math.min(1.8,next*Math.tan(wheel)/wheelbase));
   const settle=1-Math.exp(-dt*5);
   c.pitch+=(Math.max(-.065,Math.min(.045,(next-forward)/dt*.003))-c.pitch)*settle;
   const targetRoll=c.model==='motorcycle'?-Math.max(-.58,Math.min(.58,Math.atan(yawRate*next/9.81))):Math.max(-.072,Math.min(.072,yawRate*next*.004));
   c.roll+=(targetRoll-c.roll)*settle;
   c.spin*=Math.exp(-dt*3.6);c.yaw+=(yawRate+c.spin)*dt;
   const sin=Math.sin(c.yaw),cos=Math.cos(c.yaw);
   // Tyres gain grip progressively. Hard braking in a turn lets the tail step out.
   // On the rigid truck the rear axle follows the curve. The cab sweeps out
   // relative to it, giving the vehicle centre a lateral velocity in a turn.
   const axleOffset=c.spec?.rearAxle??0,axleSide=yawRate*axleOffset;
   const lateral=axleSide+(side-Math.sin(yawRate*dt)*forward-axleSide)*Math.exp(-dt*grip*(c.brake?.65:1));
   c.vx=sin*next+cos*lateral;c.vz=-cos*next+sin*lateral;c.speed=next;
   c.x+=c.vx*dt;c.z+=c.vz*dt;
   // Scrub follows sideways tyre motion. Braking already reduces grip above.
   c.slip=Math.min(1,Math.abs(lateral-axleSide)*.19);
 },
 // Separating-axis contact between two oriented car footprints.
 contact(c,other,halfWidth=.91,halfLength=1.98){
   const dx=c.x-other.x,dz=c.z-other.z;
   const side=[Math.cos(c.yaw),Math.sin(c.yaw)],front=[side[1],-side[0]];
   const bodyWidth=c.spec?.width?c.spec.width/2:.91,bodyLength=c.spec?.width?c.spec.length/2:1.98;
   const reach=bodyWidth+bodyLength+halfWidth+halfLength;
   if(Math.abs(dx)>reach||Math.abs(dz)>reach)return null;
   const os=[Math.cos(other.yaw),Math.sin(other.yaw)],of=[os[1],-os[0]];
   const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];let hit;
   for(const a of [side,front,os,of]){
     const center=dx*a[0]+dz*a[1],depth=bodyWidth*Math.abs(dot(side,a))+bodyLength*Math.abs(dot(front,a))+halfWidth*Math.abs(dot(os,a))+halfLength*Math.abs(dot(of,a))-Math.abs(center);
     if(depth<=0)return null;
     if(!hit||depth<hit.depth){const s=center<0?-1:1;hit={nx:a[0]*s,nz:a[1]*s,depth};}
   }
   hit.axle=Math.max(-bodyLength,Math.min(bodyLength,-dx*front[0]-dz*front[1]));
   return hit;
 },
 resolve(c,hit,otherVX=0,otherVZ=0,target=null){
   const {nx,nz,depth}=hit,closing=Math.max(0,-((c.vx-otherVX)*nx+(c.vz-otherVZ)*nz));
   const right=nx*Math.cos(c.yaw)+nz*Math.sin(c.yaw),ahead=nx*Math.sin(c.yaw)-nz*Math.cos(c.yaw);
   c.x+=nx*(depth+.015);c.z+=nz*(depth+.015);
   const mass=this.mass(c),targetMass=target?this.mass(target):Infinity;
   const reduced=1/(1/mass+1/targetMass),e=target ? .16 : ({tree:.12,pole:.21,water:0,building:.09}[hit.kind]??.14);
   const impulse=(1+e)*reduced*closing,delta=impulse/mass;
   const energy=.5*reduced*closing*closing,dissipated=energy*(1-e*e);
   c.vx+=nx*delta;c.vz+=nz*delta;
   const lever=hit.axle??0;
   c.spin+=Math.max(-1.4,Math.min(1.4,right*lever*delta*.075));
   c.pitch=Math.max(-.1,Math.min(.09,c.pitch+ahead*delta*.004));
   c.roll=Math.max(-.11,Math.min(.11,c.roll-right*delta*.004));
   c.speed=c.vx*Math.sin(c.yaw)-c.vz*Math.cos(c.yaw);
   const absorbed=dissipated*(target?targetMass/(targetMass+mass):hit.kind==='water'?.28:.87);
   return {closing,energy,dissipated,impulse,targetMass,otherVX,otherVZ,delta,
     strength:1-Math.exp(-Math.sqrt(dissipated)/190),damage:Math.min(100,Math.round(100*absorbed/260000))};
 }
};
