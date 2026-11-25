'use strict';
// Player cars. Dimensions are in metres and speeds in m/s.
const worldGarage={
  motorcycle:{
    worldOnly:true,license:'A',asset:'streetscape/street-motorcycle.glb',length:2.04,width:.83,height:1.64,paint:0x24686b,
    power:6.1,top:35,braking:8.6,wheelbase:1.43,steerLock:.48,mass:254,wheelRadius:.32
  },
  'box-truck':{
    worldOnly:true,license:'C',length:7.60,width:2.46,height:3.45,paint:0xc46938,
    power:2.8,top:27,braking:6.5,wheelbase:4.26,rearAxle:1.76,steerLock:.58,mass:9200,wheelRadius:.48
  },
  supercar:{asset:'streetscape/race-car.glb',length:4.6,paint:0xc63322,power:8.4,top:48},
  gt:{asset:'streetscape/electric-gt.glb',length:4.67,paint:0x305955,power:7.8,top:43,wheelbase:2.85,electric:true},
  'muscle-car':{asset:'streetscape/muscle-car.glb',length:4.90,paint:0x841619,power:7.1,top:45,wheelbase:2.75,mass:1680},
  // Livery is in the body texture; white paint keeps it untinted.
  'mustang-gt3':{worldOnly:true,asset:'streetscape/mustang-gt3.glb',length:5.06,width:2.05,height:1.41,paint:0xffffff,power:8.2,top:47,wheelbase:2.78,mass:1300},
  rally:{asset:'streetscape/rally-car.glb',length:4.25,paint:0x246397,power:7.7,top:40},
  'family-sedan':{
    worldOnly:true,asset:'streetscape/sedan.json.gz',length:4.58,width:1.80,height:1.45,paint:0x7194a7,
    power:4.8,top:36,braking:11.5,wheelbase:2.67,steerLock:.57,mass:1410,seatLift:.14
  },
  'city-sedan':{
    worldOnly:true,asset:'streetscape/city-sedan.glb',length:4.43,width:1.73,height:1.48,paint:0xc55b49,
    power:4.6,top:35,braking:11.9,wheelbase:2.55,steerLock:.60,mass:1130,seatLift:.12
  },
  'classic-sedan':{
    worldOnly:true,asset:'streetscape/classic-sedan.glb',length:4.50,width:1.73,height:1.45,paint:0x719486,
    power:4.4,top:35,braking:11.3,wheelbase:2.60,steerLock:.55,mass:1220,seatLift:.11
  },
  suv:{
    worldOnly:true,asset:'streetscape/family-suv.glb',length:4.98,width:1.93,height:1.78,paint:0x416d62,
    power:4.3,top:34,braking:10.2,wheelbase:2.96,steerLock:.50,mass:2020,seatLift:.44
  },
  'family-minivan':{
    worldOnly:true,asset:'streetscape/family-minivan.glb',length:5.10,width:1.99,height:1.74,paint:0xc5c8ca,
    power:4.4,top:35,braking:10.6,wheelbase:3.00,steerLock:.53,mass:1950,seatLift:.39
  },
  'compact-mpv':{
    worldOnly:true,asset:'streetscape/compact-mpv.glb',length:4.65,width:1.77,height:1.72,paint:0xc3cbd2,
    power:4.2,top:34,braking:10.9,wheelbase:2.72,steerLock:.56,mass:1300,seatLift:.32
  },
  'touring-mpv':{
    worldOnly:true,asset:'streetscape/touring-mpv.glb',length:4.75,width:1.87,height:1.78,paint:0x94765e,
    power:4.5,top:36,braking:10.6,wheelbase:2.82,steerLock:.52,mass:1640,seatLift:.37
  }
};

function tripVehicleChoice(vehicle){
  let previousVehicle=null;
  try{
    previousVehicle=localStorage.getItem('taylai.world.lastDriven');
    localStorage.setItem('taylai.world.lastDriven',vehicle);
  }catch{}
  return {vehicle,previousVehicle};
}
