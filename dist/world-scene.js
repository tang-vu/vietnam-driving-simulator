'use strict';
(() => {
  const widths={motorway:7.3,trunk:6.9,primary:6.1,secondary:5.2,tertiary:4.6,residential:3.4,unclassified:3.4,service:2.8};
  const namedPass=e=>e&&typeof e==='object'&&e.name?.startsWith('Đèo ')&&!e.oneway;
  window.worldRoadHalfWidth=edge=>{
    if(edge?.authoredHalfWidth)return edge.authoredHalfWidth;
    if(edge?.traffic?.width)return Math.max(1.1,Math.min(40,edge.traffic.width/2));
    if(edge?.traffic?.way===37933540)return 3.9; // Quốc Tử Giám, between the photographed curbs.
    if(edge?.traffic?.lanes)return edge.traffic.lanes*(edge.kind.startsWith('motorway')?1.8:1.6);
    const kind=typeof edge==='string'?edge:edge?.kind;
    const w=String(kind).endsWith('_link')?3.8:widths[kind]||4.2;
    return namedPass(edge)?Math.min(w,3.85):w;
  };

  // Use a geographic grid so revisiting the same place from another spawn keeps the same trees.
  function* forestPlots(graph,cx,cz,radius,visit){
    const pitch=12,metresLon=105000,metresLat=110900;
    const [lon,lat]=graph.geo(cx,cz);
    const east=lon*metresLon,south=-lat*metresLat,rx=radius*metresLon/graph.mx;
    for(let ix=Math.floor((east-rx)/pitch);ix<=Math.floor((east+rx)/pitch);ix++){
      yield;
      for(let iz=Math.floor((south-radius)/pitch);iz<=Math.floor((south+radius)/pitch);iz++){
        let seed=(Math.imul(ix,73856093)^Math.imul(iz,19349663))>>>0;
        const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
        const gx=(ix+rand())*pitch,gz=(iz+rand())*pitch;
        const p=graph.point(gx/metresLon,-gz/metresLat);
        if(Math.hypot(p.x-cx,p.z-cz)<=radius)visit(ix,iz,p.x,p.z,gx,gz,rand);
      }
    }
  }

  window.createWorldScene=function(canvas,onBreakfastCall){
    const T=window.THREE,scene=new T.Scene();
    const renderer=DrivingRenderer.get(canvas,{powerPreference:'high-performance'});
    if(!renderer)throw Error('Chưa mở được cảnh lái 3D.');
    // ANGLE can translate shaders again to produce debug logs on their first draw.
    renderer.debug.checkShaderErrors=false;
    const small=matchMedia('(pointer:coarse)').matches;
    renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
    scene.background=new T.Color(0xaec5d2);scene.fog=new T.FogExp2(0xc2d1d0,.00072);
    const markerPoint=new T.Vector3();
    const camera=new T.PerspectiveCamera(61,1,.14,28000);
    const breakfast=createBreakfastStall(T,scene);
    const skyLoader=new T.TextureLoader();
    function texture(file,tile=false){
      const t=skyLoader.load('streetscape/'+file);
      t.colorSpace=T.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      if(tile)t.wrapS=t.wrapT=T.RepeatWrapping;
      return t;
    }
    const environmentReady=skyLoader.loadAsync('streetscape/river-reflection.jpg').then(t=>{
      t.colorSpace=T.SRGBColorSpace;t.mapping=T.EquirectangularReflectionMapping;scene.environment=t;
    }).catch(()=>{});
    const sun=new T.DirectionalLight(0xffefcf,2.30);
    const atmosphere=createWorldAtmosphere(T,scene,sun,skyLoader);
    const localLight=createStreetVehicleLight(T,renderer,scene);
    const graphics=createDrivingGraphics(renderer,camera,sun);
    sun.castShadow=true;
    Object.assign(sun.shadow.camera,{left:-43,right:43,bottom:-43,top:43,near:1,far:175});
    sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.025;sun.shadow.bias=-.00025;scene.add(sun,sun.target);
    const basic=c=>new T.MeshLambertMaterial({color:c});
    const surfaces=createRoadSurfaces(T,renderer);
    const treeModels=createTreeModels(T);
    let treeBatches=[];
    function updateTreeDetail(x,z,profile){
      for(const batch of treeBatches){
        const {mesh,bounds,kind,variant}=batch;
        const dx=Math.max(0,bounds.min.x-x,x-bounds.max.x),dz=Math.max(0,bounds.min.z-z,z-bounds.max.z);
        const distance2=dx*dx+dz*dz;
        const near=profile.treeDetail+(batch.level===0?5:0),far=profile.treeCanopy+(batch.level===1?8:0);
        const level=distance2<near*near&&kind!=='tea'?0:distance2<far*far||kind==='palm'?1:2;
        if(level===batch.level)continue;
        batch.level=level;
        mesh.geometry=level===2?treeModels.distantGeometry(kind,variant):treeModels.geometry(kind,level===1,variant);
        mesh.material=level===2?treeModels.billboardMaterial():kind==='palm'?treeModels.palmMaterial:treeModels.material;
      }
    }
    const material={
      asphalt:surfaces.scanned('asphalt',0xaeb2b3,.41),
      earth:surfaces.scanned('verge',0xd7d1bc,.65),
      white:basic(0xe8e8d7),wall:surfaces.scanned('plaster',0xfff9e9,.6),roof:basic(0x748585),
      gable:streetRoofMaterial(T,0xf6e2c6,true),sheet:streetRoofMaterial(T,0xf0f2ee,false),
      pavement:basic(0xc2b8a3),steel:basic(0x687877),concrete:basic(0xb0afa3),glass:new T.MeshStandardMaterial({color:0x5c7979,roughness:.19,metalness:.53,envMapIntensity:.86}),
      awning:streetRoofMaterial(T,0xb6b9a9,false),tree:treeModels.material,pine:treeModels.material,palm:treeModels.palmMaterial
    };
    if(window.CoastalRouteScenery)material.beacon=CoastalRouteScenery.beaconMaterial(T);
    material.lantern=new T.MeshStandardMaterial({color:0xd0cbb9,roughness:.43,emissive:0xffc786,emissiveIntensity:0});
    const asphaltOrigin=new T.Vector2();
    material.glass.emissive.setHex(0xda9e60);material.glass.emissiveIntensity=0;
    const weather=createDrivingWeather(T,scene,sun,material.asphalt);
    const whitePaint=surfaces.roadPaint(0xe8e8d7,material.asphalt,weather.moisture.asphalt,asphaltOrigin);
    const yellowPaint=surfaces.roadPaint(0xf0ca63,material.asphalt,weather.moisture.asphalt,asphaltOrigin);
    const eaveMaterial=createEaveMaterial(T,weather.moisture.eaves);
    material.cut=new T.MeshStandardMaterial({normalScale:new T.Vector2(.62,.62),roughness:.96,side:T.DoubleSide,color:0xbcb5a6});
    material.fern=new T.MeshLambertMaterial({map:texture('surfaces/bank-fern.webp'),alphaTest:.38,side:T.DoubleSide,color:0xd6dfd1});
    const foliageEye=new T.Vector3();
    material.fern.onBeforeCompile=shader=>{
      shader.uniforms.foliageEye={value:foliageEye};
      shader.vertexShader='uniform vec3 foliageEye; varying float foliageFade;\n'+shader.vertexShader
        .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n objectNormal=vec3(0.,1.,0.);')
        .replace('#include <project_vertex>','#include <project_vertex>\n foliageFade=foliageEye.z*smoothstep(120.,185.,distance(instanceMatrix[3].xz,foliageEye.xy));');
      shader.fragmentShader='varying float foliageFade;\n'+shader.fragmentShader
        .replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n normal*=faceDirection;')
        .replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb*=2.25;')
        .replace('#include <alphatest_fragment>','#include <alphatest_fragment>\n if(foliageFade>0. && foliageFade>=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))))discard;');
    };
    material.rail=new T.MeshStandardMaterial({color:0xaab2af,metalness:.55,roughness:.49,side:T.DoubleSide});
    material.asphalt.side=material.earth.side=T.DoubleSide;
    material.roadConcrete=material.wall.clone();
    material.roadConcrete.name='Cast concrete road';
    material.roadConcrete.color.setHex(0xb1afa3);material.roadConcrete.normalScale.set(.13,.13);material.roadConcrete.side=T.DoubleSide;
    material.roadSlabs=new T.MeshStandardMaterial({name:'Concrete road panels',color:0xb4b2a8,roughness:.91,side:T.DoubleSide});
    material.roadWood=new T.MeshStandardMaterial({name:'Timber deck',color:0x8e6e50,roughness:.89,side:T.DoubleSide});
    material.roadMetal=new T.MeshStandardMaterial({name:'Steel deck',color:0x909997,metalness:.50,roughness:.65,side:T.DoubleSide});
    // UV runs along the road, then across it. Planks and expansion joints turn with the mapped road.
    for(const [mat,spacing,joint] of [[material.roadWood,.22,.009],[material.roadSlabs,4.5,.018]]){
      mat.userData.roadPanels=true;
      mat.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec2 deckUV;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n deckUV=uv;');
        shader.fragmentShader='varying vec2 deckUV;\n'+shader.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\n'+
          'float phase=deckUV.x/'+spacing.toFixed(2)+'; float aa=max(fwidth(phase),.0001);'+
          'float jointWidth='+joint.toFixed(3)+'/'+spacing.toFixed(2)+'; float gap=abs(fract(phase+.5)-.5);'+
          'float body=smoothstep(jointWidth-aa*.5,jointWidth+aa*.5,gap);'+
          'float board=fract(sin(mod(floor(phase),1024.)*37.7)*917.1);'+
          'diffuseColor.rgb*=mix(mix(.6,.96+.06*board,body),.99,smoothstep(.2,.8,aa));');
      };
      mat.customProgramCacheKey=()=>mat.name;
    }
    material.pavers=new T.MeshStandardMaterial({color:0xb5ada4,roughness:.91,side:T.DoubleSide});
    const grassClump=createVergeGrass(T);
    const sparseGrass=small?createVergeGrass(T,7):grassClump;
    material.vergeGrass=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
    let temple;
    const curbStone=new T.MeshStandardMaterial({color:0x979388,roughness:.94,side:T.DoubleSide});
    for(const finish of [material.pavers,curbStone]){
      const blocks=finish===material.pavers;
      finish.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,{pavingOrigin:{value:asphaltOrigin},pavingGrain:{value:material.wall.roughnessMap},pavingRain:weather.moisture.soil});
        shader.vertexShader='uniform vec2 pavingOrigin; varying vec2 paving;\n'+shader.vertexShader.replace('#include <begin_vertex>',
          `#include <begin_vertex>
           vec2 metres=position.xz+pavingOrigin;
           paving=abs(normal.y)>.5?metres:vec2(metres.x+metres.y,position.y);`);
        shader.fragmentShader='uniform sampler2D pavingGrain;uniform float pavingRain;varying vec2 paving;\n'+
          shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
            float grain=texture2D(pavingGrain,paving*.85).g;
            float damp=pavingRain*clamp(1.15-.65*grain,0.,1.);
            diffuseColor.rgb*=(.82+.28*grain)*(1.-.31*damp);
            ${blocks?`vec2 p=paving/vec2(.49,.25);p.x+=.5*mod(floor(p.y),2.);
              vec2 edge=min(fract(p),1.-fract(p)),aa=max(fwidth(paving/vec2(.49,.25)),vec2(.01));
              vec2 face=smoothstep(vec2(.01)-aa*.5,vec2(.044)+aa*.5,edge);
              float detail=1.-smoothstep(.35,1.6,max(aa.x,aa.y));
              float slab=fract(sin(dot(mod(floor(p),vec2(251.)),vec2(.733,1.932)))*391.46);
              diffuseColor.rgb*=mix(.94,mix(.54-.10*damp,.89+.19*slab,face.x*face.y),detail);`:''}`)
          .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=mix(roughnessFactor,.39+.16*grain,damp);');
      };
      finish.customProgramCacheKey=()=>blocks?'paving blocks':'curb stone';
    }
    surfaces.transform(material.wall,2,2);
    const shopTypes=['cafe','bakery','grocer','pho','garage','pharmacy'];
    const upstairs=new Set(['cafe','grocer','pharmacy']);
    const centralStreetscapes=window.CentralStreetscapes?.create(T,scene);
    const meadow=surfaces.scanned('meadow',0xafbd9d,.56);
    const upland=surfaces.scanned('grass',0x8ea68d,.67);
    const landscapeSource=createSightLandscapes(T);
    const groundSource=createSightGrounds(T,small);
    const environment=createVietnamEnvironment(),amenities=createVietnamAmenities(),structures=createVietnamStructures();
    const farmland=createMappedFarmland(T,small);
    const plantCropRows=createCropRows(T);
    material.farmSoil=new T.MeshStandardMaterial({vertexColors:true,roughness:.96,map:material.earth.map});
    material.farmSoil.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
        'float grain=texture2D(map,vMapUv).g; diffuseColor.rgb*=clamp(.62+grain*2.7,.65,1.38);');
    };
    const osmBuildings=createVietnamOsmBuildings();
    const coverMap=createWorldLandCover(T,environment);
    const streetLife=createWorldStreetLife(T,scene,small,environment,amenities,prepareActor);
    const signs=createWorldSigns(T,scene,small);
    const mappedLights=createMappedTrafficLights(T,scene,small);
    const landWidth=2048,landSegments=landWidth/vietnamReliefStep;
    let land=new T.Mesh(new T.PlaneGeometry(landWidth,landWidth,landSegments,landSegments),meadow);
    const landIndex=land.geometry.index;
    land.geometry.setAttribute('shoreSediment',new T.Float32BufferAttribute(new Float32Array(land.geometry.attributes.position.count),1));
    let shorePatch=null,formationMesh=null;
    const shoreEarth=texture('verge-earth.webp',true);
    const landOrigin=new T.Vector2();
    const tunnelCut=createTunnelCut(T),caveOpenings=createCaveOpenings(T);
    // Low-frequency variation is fixed in geographic space. Close-up grain stays sharp.
    for(const mat of [meadow,upland]){
      mat.onBeforeCompile=shader=>{
        shader.uniforms.landOrigin={value:landOrigin};shader.uniforms.shoreEarth={value:shoreEarth};
        shader.vertexShader='uniform vec2 landOrigin; varying vec2 groundMetres; attribute float shoreSediment; varying float bankWet;\n'+shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n groundMetres=vec2(position.x,-position.y)+landOrigin; bankWet=shoreSediment;');
        shader.fragmentShader='varying vec2 groundMetres; varying float bankWet; uniform sampler2D shoreEarth;\n'+shader.fragmentShader.replace('#include <map_fragment>',
          '#include <map_fragment>\n float patchiness=sin(dot(groundMetres,vec2(.035,.019)))+.55*cos(dot(groundMetres,vec2(-.015,.047))); diffuseColor.rgb*=vec3(.96,.98,.95)+patchiness*vec3(.08,.035,.05); vec3 silt=texture2D(shoreEarth,groundMetres*.58).rgb; float bank=clamp(bankWet+(silt.g-.17)*.7,0.,1.)*smoothstep(0.,.2,bankWet); diffuseColor.rgb=mix(diffuseColor.rgb,silt*mix(vec3(.84,.78,.66),vec3(.34,.31,.25),bankWet),bank);');
        farmland.shade(shader,weather.moisture.soil);
        coverMap.shade(shader);
        relief.nationalColour.shade(shader,'groundMetres','(.26+.53*smoothstep(35.,700.,length(vViewPosition)))*(1.-bankWet)');
        landscapeSource.shade(shader);landscapeSource.shadeWaterBoundary(shader,false);groundSource.shade(shader);
        relief.passSurface.shade(shader,'groundMetres','(.40+.46*smoothstep(35.,450.,length(vViewPosition)))*(1.-bankWet)');
        tunnelCut.shade(shader,'groundMetres');caveOpenings.shade(shader);
        // The satellite texels span several metres. Restore ground-scale contrast
        // after the regional tint, including at the edge of a streamed tile.
        shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`
          vec3 blades=texture2D(map,vMapUv).rgb;
          float fineGrass=clamp(dot(blades,vec3(.21,.72,.07))*4.0,.50,1.48);
          float broadGrass=smoothstep(.12,.35,texture2D(map,groundMetres*.033).g);
          float localDetail=(1.-smoothstep(65.,310.,length(vViewPosition)))*(1.-bankWet);
          diffuseColor.rgb*=mix(vec3(1.),mix(vec3(.76,.83,.69),vec3(1.12,1.08,.94),broadGrass)*fineGrass,localDetail*.80);
          diffuseColor.rgb*=1.-soilWater*(.055+.30*bankWet);
          #include <alphamap_fragment>`);
      };
    }
    land.rotation.x=-Math.PI/2;land.position.y=-.17;land.receiveShadow=true;scene.add(land);
    const waterSurface=createDrivingWater(T,true);
    const shadeWater=waterSurface.material.onBeforeCompile;
    waterSurface.material.onBeforeCompile=function(shader,renderer){
      shadeWater.call(this,shader,renderer);landscapeSource.shadeWaterBoundary(shader,true);
      tunnelCut.shade(shader,'waterMetres');caveOpenings.shade(shader);
    };
    surfaces.weatheredAsphalt(material.asphalt,weather.moisture,asphaltOrigin,waterSurface.reflection);
    const dryEarth=material.earth.color.clone();
    for(const finish of [...Object.values(material),meadow,upland,waterSurface.material])atmosphere.registerFinish(finish);
    const passGrades=createPassRoadGrades();
    const relief=createVietnamRelief(T,scene,graphics.profile.id==='low',landscapeSource,tunnelCut,landWidth,caveOpenings);
    const sightings=createSkySightings(T,scene,Math.random,relief.ground);
    const unitBox=new T.BoxGeometry(),unitPlane=new T.PlaneGeometry(),unitPole=new T.CylinderGeometry(.5,.5,1,8);
    const roofSection=new T.Shape();roofSection.moveTo(-.5,0);roofSection.lineTo(0,1);roofSection.lineTo(.5,0);roofSection.closePath();
    const gable=new T.ExtrudeGeometry(roofSection,{depth:1,bevelEnabled:false});gable.translate(0,0,-.5);
    const wireMaterial=new T.LineBasicMaterial({color:0x50554d,transparent:true,opacity:.64});
    const temp=new T.Object3D(),tone=new T.Color();
    let commonSignAtlas;
    const commonSigns=()=>commonSignAtlas??=createRoadsideSignAtlas(T,Object.entries(roadsideSignStyles).map(([kind,[name]])=>({kind,name})));
    const roadsideImpact=createRoadsideImpact(T,scene,relief.ground);
    let groundAt=relief.ground,bridges=null,tunnels=null,roadFormation=null;
    const driveGround=(x,z,edge)=>groundAt(x,z,edge);
    function drivingSurface(bridges,tunnels,pavementLift,roadway,shoreBed,cx,cz){
      return (x,z,edge)=>{
        const deck=tunnels?.at(x,z,edge)??bridges?.at(x,z,edge);
        if(deck!=null)return deck;
        const lift=pavementLift(x-cx,z-cz);
        return lift?roadway(x,z)+lift:(shoreBed(x,z)??roadway(x,z));
      };
    }
    function driveGrade(x,z,yaw,edge){
      const dx=2.2*Math.sin(yaw),dz=-2.2*Math.cos(yaw);
      // Sample the slope along the road's tangent so the edge of a raised deck
      // doesn't induce a near-vertical roll when a tyre gets near the rail.
      const structure=edge&&(sceneGraph?.tunnels.info(edge)?tunnels:bridges);
      const onStructure=structure?.at(x,z,edge)!=null;
      if(onStructure||edge&&roadFormation?.hasRoad(edge)){
        const c=sceneGraph.nearest(x,z,[edge]),p=sceneGraph.sample(c);
        const a=Math.max(0,c.s-2.2),b=Math.min(edge.length,c.s+2.2);
        const forward=Math.cos(yaw-p.yaw);
        if(onStructure)return (structure.height(edge,b)-structure.height(edge,a))/(b-a)*forward;
        if(c.error<=worldRoadHalfWidth(edge)**2){
          const lo=roadFormation.roadHeight(edge,a),hi=roadFormation.roadHeight(edge,b);
          if(lo!=null&&hi!=null){
            // Keep the surveyed tangent through junctions. Across the lane,
            // the tyres still follow the camber of the visible pavement.
            const side=Math.sin(yaw-p.yaw);
            const nx=2.2*Math.cos(p.yaw),nz=2.2*Math.sin(p.yaw);
            const bank=Math.abs(side)<.001?0:(driveGround(x+nx,z+nz)-driveGround(x-nx,z-nz))/4.4;
            return (hi-lo)/(b-a)*forward+bank*side;
          }
        }
      }
      return (driveGround(x+dx,z+dz)-driveGround(x-dx,z-dz))/4.4;
    }
    let roadGroup=null,runoff=null,sceneGraph=null,originX=0,originZ=0,shadowStamp=-1000,districtRadius=0;
    let streetBulbs=[];
    const streetLights=Array.from({length:3},()=>{
      const light=new T.PointLight(0xffc88a,0,32,2);
      scene.add(light);return light;
    });
    let nextLightCheck=0;
    const landmarkSource=window.VietnamLandmarks?.create(T,scene,atmosphere.lamps);
    const buildingSource=createTourDistrict(T,scene,material.wall,structures,osmBuildings,atmosphere.lamps);
    let district=buildingSource,grounds=groundSource,landmarks=landmarkSource;
    let spare=null,job=null;
    let nearestWaterBlock=()=>null;
    let obstacleCells=new Map(),waterAt=()=>null;
    const obstacleKey=(x,z)=>Math.floor(x/15)+','+Math.floor(z/15);
    function indexObstacle(obstacleCells,o){
      const reach=o.radius||Math.hypot(o.w,o.d);
      for(let i=Math.floor((o.x-reach-3)/15);i<=Math.floor((o.x+reach+3)/15);i++)
        for(let j=Math.floor((o.z-reach-3)/15);j<=Math.floor((o.z+reach+3)/15);j++){
          const key=i+','+j;
          if(!obstacleCells.has(key))obstacleCells.set(key,[]);
          obstacleCells.get(key).push(o);
        }
      return o;
    }
    function regionContact(obstacleCells,originX,originZ,sceneGraph,tunnels,landmarks,district,ground,x,z,r=.95,y=null,edge=null){
      const px=x-originX,pz=z-originZ;
      const inBore=edge&&sceneGraph.tunnels.info(edge)?.bore&&tunnels.at(x,z,edge,r+1)!=null;
      let hit=null;
      for(const o of obstacleCells.get(obstacleKey(px,pz))||[]){
        if(inBore&&o.baseY==null)continue;
        if(y!==null){
          const base=o.baseY??ground(x,z);
          if(y+1.35<base||y>base+(o.height??7)+.12)continue;
        }
        const dx=px-o.x,dz=pz-o.z;
        let nx,nz,depth;
        if(o.radius){
          const dist=Math.hypot(dx,dz);
          nx=dist?dx/dist:1;nz=dist?dz/dist:0;depth=r+o.radius-dist;
        }else{
          const u=dx*o.fx+dz*o.fz,v=-dx*o.fz+dz*o.fx;
          let a=u-Math.min(o.w,Math.max(-o.w,u)),b=v-Math.min(o.d,Math.max(-o.d,v));
          const dist=Math.hypot(a,b);
          if(dist){depth=r-dist;a/=dist;b/=dist;}
          else if(o.w-Math.abs(u)<o.d-Math.abs(v)){depth=r+o.w-Math.abs(u);a=u>=0?1:-1;b=0;}
          else{depth=r+o.d-Math.abs(v);a=0;b=v>=0?1:-1;}
          nx=a*o.fx-b*o.fz;nz=a*o.fz+b*o.fx;
        }
        if(depth>0&&(!hit||depth>hit.depth))hit={nx,nz,depth,kind:o.kind,id:o.id,height:o.height,pointX:x+nx*(depth-r),pointZ:z+nz*(depth-r)};
      }
      if(inBore)return hit;
      return hit||landmarks?.contact(x,z,r,y)||(y===null||y<ground(x,z)+3?district.contact(x,z,r):null);
    }
    function contact(...args){return regionContact(obstacleCells,originX,originZ,sceneGraph,tunnels,landmarks,district,relief.ground,...args);}
    // Keep a bounded supply of detached GPU buffers for the next road and
    // building meshes. Reusing their vertex arrays also reuses driver bindings.
    const freeGeometry=new Map(),bufferKeys=new WeakMap();
    let freeBytes=0;
    function releaseGeometry(g){
      const key=bufferKeys.get(g);
      if(key){
        const bytes=g.attributes.position.data.array.byteLength;
        if(freeBytes+bytes<=(small?8:32)*1024*1024){
          if(!freeGeometry.has(key))freeGeometry.set(key,[]);
          freeGeometry.get(key).push(g);freeBytes+=bytes;return;
        }
      }
      g.dispose();
    }
    function reuseGeometry(node){
      const source=node.geometry,attrs=source.attributes,packed=attrs.position.data;
      if(!source.userData.streamedSurface||!packed||bufferKeys.has(source)||packed.count<192)return false;
      const entries=Object.entries(attrs);
      if(entries.some(([,a])=>a.data!==packed)||!(packed.array instanceof Float32Array))return false;
      const capacity=2**Math.ceil(Math.log2(packed.count));
      const layout=entries.map(([name,a])=>name+','+a.itemSize+','+a.offset+','+Number(a.normalized)).join('|');
      const key=layout+'|'+packed.stride+'|'+capacity;
      const spare=freeGeometry.get(key)?.pop();
      const g=spare||source;
      let buffer;
      if(spare){
        buffer=spare.attributes.position.data;
        freeBytes-=buffer.array.byteLength;
        g.boundingSphere=source.boundingSphere;g.boundingBox=source.boundingBox;
        node.geometry=g;
      }else{
        buffer=new T.InterleavedBuffer(new Float32Array(capacity*packed.stride),packed.stride);
        buffer.setUsage(T.DynamicDrawUsage);
        for(const [name,a] of entries)g.setAttribute(name,new T.InterleavedBufferAttribute(buffer,a.itemSize,a.offset,a.normalized));
        bufferKeys.set(g,key);
      }
      buffer.count=packed.count;buffer.array.set(packed.array);
      buffer.clearUpdateRanges();buffer.addUpdateRange(0,packed.array.length);buffer.needsUpdate=true;
      g.setDrawRange(0,packed.count);
      return true;
    }
    function discardRoads(roadGroup){
      if(!roadGroup)return;roadGroup.removeFromParent();
      roadGroup.userData.discarded=true;roadGroup.userData.parking?.removeFromParent();
      roadGroup.userData.disposeSurvey?.();
      roadGroup.traverse(obj=>{if(obj.isInstancedMesh)obj.dispose();else if(obj.geometry)releaseGeometry(obj.geometry);});
    }
    function makeSpare(){
      const nextLand=new T.Mesh(new T.PlaneGeometry(landWidth,landWidth,landSegments,landSegments),land.material);
      nextLand.geometry.setAttribute('shoreSediment',land.geometry.attributes.shoreSediment.clone());
      nextLand.rotation.x=-Math.PI/2;nextLand.receiveShadow=true;
      return {land:nextLand,district:buildingSource.createView(new T.Group()),grounds:groundSource.createView()};
    }
    function activate(next){
      const previous={land,district,grounds};
      formationMesh?.dispose();shorePatch?.dispose();
      discardRoads(roadGroup);land.removeFromParent();district.group.removeFromParent();district.clear(releaseGeometry);
      ({land,district,grounds,landmarks,roadGroup,shorePatch,formationMesh,groundAt,bridges,tunnels,roadFormation,obstacleCells,waterAt,
        nearestWaterBlock,sceneGraph,originX,originZ,treeBatches,streetBulbs,runoff}=next);
      spare=previous;
      scene.add(land,roadGroup,district.group);groundSource.display(grounds);landmarks?.activate();
    }
    function* buildRoads(slot,edges,cx,cz,water,graph,streamed){
      let work=0;
      const {land,district,grounds}=slot;
      const roadGroup=new T.Group(),treeBatches=[],streetBulbs=[],obstacleCells=new Map(),obstacles=new Map();
      roadGroup.userData.eaves=[];
      const porchPositions=[],porchColors=[],porchUv=[],porchSurface=[];
      roadGroup.name='Street district origin';Object.assign(roadGroup.userData,{originX:cx,originZ:cz});
      let shorePatch=null,shoreFootings=null,formationMesh=null,showWaterField=null,committed=false;
      const registerObstacle=o=>{obstacles.set(o.id,o);return indexObstacle(obstacleCells,o);};
      try{
      const landscapes=yield* landscapeSource.prepareSteps(graph,streamed?renderer:null);
      const raw=relief.prepare(graph,landscapes);
      const formation=createPassRoadFormation(graph,passGrades.tiles(graph),raw,cx,cz,landWidth/2+64,worldRoadHalfWidth);
      const terrain=formation?{...raw,ungraded:raw,revision:Symbol(),ground:formation.ground,
        altitude:(x,z)=>raw.base+formation.ground(x,z)}:raw;
      yield;
      const bridges=graph?createBridgeDistrict(graph,edges,cx,cz,terrain.ground,formation?.roadHeight):null;
      const tunnels=graph?createTunnelDistrict(graph,edges,terrain.ground,formation?.roadHeight):null;
      const localGround=(x,z)=>terrain.ground(cx+x,cz+z);
      const landmarks=landmarkSource?yield* landmarkSource.prepareSteps(graph,cx,cz,terrain.ground,bridges?.signatureHeight):null;
      yield;
      yield* grounds.prepare(graph,cx,cz,landmarks,streamed?renderer:null);
      yield;
      const vistas=[];
      if(graph)for(const site of VietnamLandmarks.entries){
        const end=graph.point(site.lon,site.lat);if(Math.hypot(end.x-cx,end.z-cz)>1000)continue;
        const start=graph.point(...site.start),dx=end.x-start.x,dz=end.z-start.z;
        if(dx*dx+dz*dz<=70*70)vistas.push({start,dx,dz,length2:dx*dx+dz*dz||1});
      }
      function onApproach(x,z){
        return vistas.some(v=>{
          const dx=x-v.start.x,dz=z-v.start.z,f=(dx*v.dx+dz*v.dz)/v.length2;
          return f>-.12&&f<1.1&&Math.hypot(dx-v.dx*f,dz-v.dz*f)<9;
        });
      }
      const gx=Math.round(cx/terrain.step)*terrain.step,gz=Math.round(cz/terrain.step)*terrain.step,positions=land.geometry.attributes.position;
      const showCover=yield* coverMap.prepare(graph,gx,gz);
      const farms=yield* farmland.prepare(graph,cx,cz);
      if(farms.water.length)water=water.concat(farms.water);
      land.position.set(gx-cx,-.17,gz-cz);
      for(let i=0;i<positions.count;i++){
        if((i&255)===0)yield;
        positions.setZ(i,terrain.ground(gx+positions.getX(i),gz-positions.getY(i)));
      }
      positions.needsUpdate=true;yield* updateTerrainNormals(T,land.geometry);land.geometry.computeBoundingSphere();
      const natural=localGround;
      const seaOpening=worldHaiVanOpening(graph,cx,cz);
      const haiVan=seaOpening&&worldHaiVanPilot(graph,cx,cz,mountainStages.find(stage=>stage.id==='deo-hai-van'));
      const complexCenter=graph?.point(105.7956,20.5528);
      const innerPrecinct=complexCenter&&Math.hypot(complexCenter.x-cx,complexCenter.z-cz)<1500;
      const cover=complexCenter&&Math.hypot(complexCenter.x-cx,complexCenter.z-cz)<2200?(window.tamChucGroundCover||[]).map(([kind,coords])=>{
        const points=[];
        for(let i=0;i<coords.length;i+=2){
          const p=graph.point(105.79+coords[i]/1e6,20.54+coords[i+1]/1e6);
          points.push(new T.Vector2(p.x-cx,p.z-cz));
        }
        return {kind,points,bounds:new T.Box2().setFromPoints(points)};
      }):[];
      const groves=cover.filter(p=>p.kind==='wood');
      function inGrove(x,z){
        return groves.some(({points,bounds})=>{
          if(x<bounds.min.x||x>bounds.max.x||z<bounds.min.y||z>bounds.max.y)return false;
          let inside=false;
          for(let i=0,j=points.length-1;i<points.length;j=i++){
            const a=points[i],b=points[j];
            if((a.y>z)!==(b.y>z)&&x<(b.x-a.x)*(z-a.y)/(b.y-a.y)+a.x)inside=!inside;
          }
          return inside;
        });
      }

      const segments=[],cells=new Map(),roadData=[],landData=[],bankData=[],passVerges=[],railVerts=[],railIndices=[],cutVerts=[],cutUv=[],cutIndices=[],yellow=[],white=[],wires=[],junctions=new Map(),batches=new Map(),candidates=[],rivals=new Map();
      const roadSurfaces={asphalt:roadData,earth:[],pavers:[],roadConcrete:[],roadSlabs:[],roadWood:[],roadMetal:[]};

      const cellSize=32,cutoff=graphics.profile.districtRadius,detailRadius=graphics.profile.scenery;
      // A small occupancy mask lets each generated building test its footprint in constant time.
      // Keep two samples across the narrowest stretches of the Chùa Âng moat.
      const fineBank=water?.some(f=>f.bankSpacing===2&&f.points.some(p=>Math.max(Math.abs(p.x-cx),Math.abs(p.z-cz))<cutoff+16));
      const maskScale=fineBank?.5:.25,maskSize=Math.ceil((2*cutoff*maskScale+8)/16)*16;
      // Raster cells are aligned in world metres across render-origin shifts.
      const maskX=Math.floor((cx-cutoff)/4)*4-cx,maskZ=Math.floor((cz-cutoff)/4)*4-cz;
      let wetMask=null;
      const sampleShore=(x,z)=>shorePatch?.sample(x,z)||null;
      if(water.length||landscapes.visible){
        const mask=document.createElement('canvas');mask.width=mask.height=maskSize;
        const painter=mask.getContext('2d',{willReadFrequently:true});
        painter.setTransform(maskScale,0,0,maskScale,-maskX*maskScale,-maskZ*maskScale);
        painter.fillStyle=painter.strokeStyle='#fff';painter.lineJoin=painter.lineCap='round';
        const currentCanvas=mask.cloneNode();
        const current=currentCanvas.getContext('2d',{willReadFrequently:true});
        current.setTransform(painter.getTransform());current.lineCap='round';
        // A named lake may be split into rings to preserve islands. Estimate a
        // shared stage from its shore samples, keeping the water below the banks.
        const samples=new Map(),poolIds=new Map(),pools=[null];
        for(const feature of water){
          if(feature.kind!=='lake'||(!feature.sharedStage&&! /^(hồ|đầm|ao|bàu)\s/i.test(feature.name||'')))continue;
          if(!samples.has(feature.name))samples.set(feature.name,[]);
          const values=samples.get(feature.name),stride=Math.max(1,Math.ceil(feature.points.length/18));
          for(let i=0;i<feature.points.length;i+=stride){const p=feature.points[i];values.push(terrain.ground(p.x,p.z));}
        }
        for(const [name,values] of samples){
          if(pools.length>=255)break;
          values.sort((a,b)=>a-b);poolIds.set(name,pools.length);pools.push(values[Math.floor(values.length*.16)]-.58);
        }
        for(const feature of water){
          if(!feature.points||feature.points.length<2)continue;
          if(feature.kind==='lake'){
            let ring=feature.points.map(p=>new T.Vector2(p.x-cx,p.z-cz));
            if(ring.at(-1).equals(ring[0]))ring.pop();
            // Clip the ring first so a lake stretching into other tiles stays cheap to render.
            for(const [axis,limit,sign] of [['x',-cutoff,1],['x',cutoff,-1],['y',-cutoff,1],['y',cutoff,-1]]){
              if(!ring.length)break;
              const clean=[];let prev=ring.at(-1),prevIn=(prev[axis]-limit)*sign>=0;
              for(const p of ring){
                const inside=(p[axis]-limit)*sign>=0;
                if(inside!==prevIn)clean.push(prev.clone().lerp(p,(limit-prev[axis])/(p[axis]-prev[axis])));
                if(inside)clean.push(p);prev=p;prevIn=inside;
              }
              ring=clean;
            }
            if(ring.length<3)continue;
            painter.fillStyle=shorePoolColour(poolIds.get(feature.name)||0);
            painter.beginPath();painter.moveTo(ring[0].x,ring[0].y);
            for(let i=1;i<ring.length;i++)painter.lineTo(ring[i].x,ring[i].y);
            painter.closePath();
            for(const island of feature.holes||[]){
              painter.moveTo(island[0].x-cx,island[0].z-cz);
              for(const p of island.slice(1))painter.lineTo(p.x-cx,p.z-cz);
              painter.closePath();
            }
            painter.fill('evenodd');
          }else{
            const radius=Math.min(90,Math.max(2,Number(feature.width)||(/suối/i.test(feature.name||'')?8:23)))/2;
            painter.globalCompositeOperation='destination-over';painter.strokeStyle='#000';painter.lineWidth=radius*2;
            for(let i=1;i<feature.points.length;i++){
              let ax=feature.points[i-1].x-cx,az=feature.points[i-1].z-cz,bx=feature.points[i].x-cx,bz=feature.points[i].z-cz;
              const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.01)continue;
              const nx=-dz/len,nz=dx/len;
              const along=Math.max(0,Math.min(len,(-ax*dx-az*dz)/len)),lateral=Math.hypot(ax+dx/len*along,az+dz/len*along);
              if(lateral>cutoff+radius)continue;
              const lo=Math.max(0,along-cutoff-radius),hi=Math.min(len,along+cutoff+radius);
              bx=ax+dx/len*hi;bz=az+dz/len*hi;ax+=dx/len*lo;az+=dz/len*lo;
              const speed=radius<=5?.98:.58;
              current.strokeStyle='rgb('+Math.round(128+126*speed*dx/len)+','+Math.round(128+126*speed*dz/len)+',0)';
              current.lineWidth=radius*2;current.beginPath();current.moveTo(ax,az);current.lineTo(bx,bz);current.stroke();
              painter.beginPath();painter.moveTo(ax,az);painter.lineTo(bx,bz);painter.stroke();
            }
            painter.globalCompositeOperation='source-over';
          }
        }
        landscapes.paintWater(painter,cx,cz);
        wetMask=painter.getImageData(0,0,maskSize,maskSize).data;
        let waterPixel=3;
        while(waterPixel<wetMask.length&&!wetMask[waterPixel])waterPixel+=4;
        if(waterPixel>=wetMask.length)wetMask=null;
        if(wetMask){
          const field=yield* waterBankField(wetMask,current.getImageData(0,0,maskSize,maskSize).data,maskSize,1/maskScale);
          showWaterField=waterSurface.prepareField(field,maskSize,maskX,maskZ,maskScale,cx,cz,streamed&&driveWarmed?renderer:null);
          yield;
          shorePatch=yield* buildMappedShoreSteps(T,{mask:wetMask,field,size:maskSize,scale:maskScale,maskX,maskZ,cx,cz,gx,gz,landWidth,land,landIndex,
            ground:localGround,pools,group:roadGroup,waterMaterial:waterSurface.material});
          // The bank mesh replaces the grass near water. Keep its bare
          // surface independent of bridges, quays and the foundations themselves.
          shoreFootings={revision:Symbol(),step:1/maskScale,
            intersects:(x0,z0,x1,z1)=>shorePatch.intersects(x0-cx,z0-cz,x1-cx,z1-cz),
            ground(x,z,natural){
              const sample=shorePatch.sample(x-cx,z-cz,true,false);
              return sample?Math.min(natural,sample.bed+.17):natural;
            }};
          landmarks?.setShoreFootings(shoreFootings);
          landmarks?.addShoreCover(shorePatch);
        }
      }
      if(formation){
        formationMesh=yield* meshPassRoadFormation(T,formation,land,gx,gz,landWidth);
        const bank=shoreFootings;
        shoreFootings={revision:terrain.revision,step:Math.min(formation.fine,bank?.step??Infinity),
          intersects:(...bounds)=>formation.intersects(...bounds)||!!bank?.intersects(...bounds),
          ground:(x,z,h)=>bank?bank.ground(x,z,h):h};
        landmarks?.setShoreFootings(shoreFootings);
      }
      // Index occupied blocks once so narrow streams also enable local reflections.
      const wetBlocks=new Map(),blockSize=16,blocks=Math.ceil(maskSize/blockSize);
      if(wetMask)for(let row=0;row<maskSize;row++)for(let col=0;col<maskSize;col++){
        if(wetMask[(row*maskSize+col)*4+3]<=100)continue;
        const key=Math.floor(row/blockSize)*blocks+Math.floor(col/blockSize);
        const d=(col%blockSize+.5-blockSize/2)**2+(row%blockSize+.5-blockSize/2)**2;
        if(d<(wetBlocks.get(key)?.d??Infinity)){
          wetBlocks.set(key,{x:maskX+(col+.5)/maskScale,z:maskZ+(row+.5)/maskScale,d});
        }
      }
      const nearestWaterBlock=(x,z)=>{
        if(!wetBlocks.size)return null;
        const col=Math.floor((x-maskX)*maskScale/blockSize),row=Math.floor((z-maskZ)*maskScale/blockSize);
        let nearest=null,distance=Infinity;
        for(let j=Math.max(0,row-2);j<=Math.min(blocks-1,row+2);j++)for(let i=Math.max(0,col-2);i<=Math.min(blocks-1,col+2);i++){
          const p=wetBlocks.get(j*blocks+i);if(!p)continue;
          const d=(x-p.x)**2+(z-p.z)**2;
          if(d<distance){nearest=p;distance=d;}
        }
        return nearest;
      };
      function wet(x,z){
        const col=Math.floor((x-maskX)*maskScale),row=Math.floor((z-maskZ)*maskScale);
        return col>=0&&row>=0&&col<maskSize&&row<maskSize&&wetMask[(row*maskSize+col)*4+3]>100;
      }
      function openGround(x,z){
        return grounds.memorialAt(x,z)||grounds.mapped(x,z)||Boolean(wetMask&&wet(x-cx,z-cz));
      }
      const groundEdges=graph?bridgeGroundEdges(graph,edges):edges;
      yield* district.buildSteps(graph,cx,cz,landmarks,terrain.ground,groundEdges,openGround,Math.min(620,cutoff),terrain.revision,grounds.memorialAt,shoreFootings,grounds.finishes);
      const contact=(...args)=>regionContact(obstacleCells,cx,cz,graph,tunnels,landmarks,district,terrain.ground,...args);
      function nearbyCell(x,z){return Math.floor(x/cellSize)+','+Math.floor(z/cellSize);}
      function bounds(seg,pad,fn){
        for(let ix=Math.floor((Math.min(seg.ax,seg.bx)-pad)/cellSize);ix<=Math.floor((Math.max(seg.ax,seg.bx)+pad)/cellSize);ix++)
          for(let iz=Math.floor((Math.min(seg.az,seg.bz)-pad)/cellSize);iz<=Math.floor((Math.max(seg.az,seg.bz)+pad)/cellSize);iz++)fn(ix+','+iz);
      }
      function obstruction(x,z,r,allowWater=false,mapped=false){
        const occupied=mapped?landmarks?.contact(x+cx,z+cz,r):landmarks?.reserved(x+cx,z+cz,r);
        if(occupied||district.contact(x+cx,z+cz,r))return true;
        if(!allowWater&&wetMask&&(wet(x,z)||wet(x+r,z)||wet(x-r,z)||wet(x,z+r)||wet(x,z-r)))return true;
        const list=cells.get(nearbyCell(x,z))||[];
        for(const s of list){
          const t=Math.max(0,Math.min(s.len,(x-s.ax)*s.fx+(z-s.az)*s.fz));
          const dx=x-s.ax-s.fx*t,dz=z-s.az-s.fz*t;
          if(dx*dx+dz*dz<(s.w+r)*(s.w+r))return true;
        }return false;
      }
      function blocked(x,z,r){
        return grounds.nearFixture(x,z,r)||grounds.mapped(x+cx,z+cz)||obstruction(x,z,r);
      }
      const waterAt=(x,z)=>sampleShore(x-cx,z-cz);
      const shoreBed=(x,z)=>shorePatch?.sample(x-cx,z-cz,true)?.bed;
      let buildingBase=null;
      function instance(mat,geo,x,y,z,sx,sy,sz,yaw=0,color=null,owner=null,cell=''){
        const key=mat+':'+geo.id+cell;
        if(!batches.has(key))batches.set(key,{mat,geo,poses:[],colors:[],moving:[]});
        const b=batches.get(key);temp.position.set(x,y+(buildingBase??localGround(x,z)),z);temp.rotation.set(0,yaw,0,'YXZ');
        if(sz>2&&sy<.16&&buildingBase===null){
          temp.rotation.x=-Math.atan(terrain.grade(cx+x,cz+z,Math.PI-yaw));
          temp.rotation.z=Math.atan(terrain.grade(cx+x,cz+z,Math.PI/2-yaw));
        }temp.scale.set(sx,sy,sz);temp.updateMatrix();
        if(owner)b.moving.push([b.poses.length,owner]);
        b.poses.push(temp.matrix.clone());b.colors.push(color);
        return b;
      }
      function plantTree(kind,x,z,h,w,angle,color,owner){
        const variant=kind==='tea'?0:treeModels.variantAt(cx+x,cz+z);
        const geo=treeModels.geometry(kind,true,variant);
        const cell=':'+Math.floor(x/80)+','+Math.floor(z/80);
        const batch=instance(kind==='tea'?'tree':kind,geo,x,0,z,w,h,w,angle,color,owner,cell);
        const tree=batch.tree??={kind,variant,bounds:new T.Box3(),radius:0};
        tree.bounds.expandByPoint(temp.position);
        tree.radius=Math.max(tree.radius,Math.hypot(w,h,w));
      }
      function quad(points,ax,az,bx,bz,cx,cz,dx,dz){points.push(ax,az,bx,bz,cx,cz,cx,cz,bx,bz,dx,dz);}
      const sectionsFor=new Map([...Object.values(roadSurfaces),landData].map(data=>[data,[]]));
      function strip(target,s,start,end,l,r){
        const n=s.graded?Math.max(1,Math.ceil((end-start)/5)):1;
        for(let j=0;j<n;j++){
          const a=start+(end-start)*j/n,b=start+(end-start)*(j+1)/n;
          const ax=s.ax+s.fx*a,az=s.az+s.fz*a,bx=s.ax+s.fx*b,bz=s.az+s.fz*b;
          sectionsFor.get(target)?.push(s,s);
          quad(target,ax+s.nx*l,az+s.nz*l,ax+s.nx*r,az+s.nz*r,bx+s.nx*l,bz+s.nz*l,bx+s.nx*r,bz+s.nz*r);
        }
      }
      for(const e of groundEdges){
        if((++work & 15)===0)yield;
        const width=window.worldRoadHalfWidth(e);
        const finish=roadSurfaceClass(e),pavement=roadSurfaces[finish],source=e.sourceEdge||e;
        const cityStreet=e.kind==='residential'||e.kind==='living_street'||/^phố\s/i.test(e.name);
        let nextStation=e.sourceEdge?graph.nearest(e.points[0].x,e.points[0].z,[source]).s:0;
        for(let i=1;i<e.points.length;i++){
          const a=e.points[i-1],b=e.points[i];
          let ax=a.x-cx,az=a.z-cz,bx=b.x-cx,bz=b.z-cz;
          const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz);if(length<.05)continue;
          const station=nextStation;nextStation+=length;
          if(Math.min(ax,bx)>cutoff||Math.max(ax,bx)<-cutoff||Math.min(az,bz)>cutoff||Math.max(az,bz)<-cutoff)continue;
          const fx=dx/length,fz=dz/length,nx=-fz,nz=fx;
          const near=Math.max(0,Math.min(length,-ax*fx-az*fz)),perp=Math.hypot(ax+near*fx,az+near*fz);
          if(perp>cutoff)continue;
          const seed=(Math.imul(e.id,2246822519)^Math.imul(i,3266489917))>>>0;
          const latitude=graph?graph.lat-a.z/graph.my:0;
          const mx=graph?111320*Math.cos(latitude*Math.PI/180)/graph.mx:1;
          const sourceLength=Math.hypot(dx*mx,dz);
          const s={ax,az,bx,bz,fx,fz,nx,nz,len:length,sourceLength,w:width,kind:e.kind,oneway:e.oneway,rank:perp,seed};
          s.traffic=e.traffic;s.station=station;s.source=source;s.roadMaterial=material[finish];
          if(haiVan)s.haiVan=haiVan.match(s);
          s.profiled=formation&&(formation.roadHeight(source,station)!=null||formation.roadHeight(source,station+length)!=null);
          s.priority=s.profiled&&(namedPass(e)||/^(motorway|trunk|primary)/.test(e.kind))?2:
            s.profiled&&/^(secondary|tertiary)/.test(e.kind)?1:0;
          s.graded=s.profiled||namedPass(e)||terrain.altitude((a.x+b.x)*.5,(a.z+b.z)*.5)>280&&(e.visitorRoad||!district.builtUp(cx+(ax+bx)*.5,cz+(az+bz)*.5)&&!['residential','service','living_street'].includes(e.kind));
          s.laneLayout=roadLaneLayout(s,width);
          if(s.graded){
            const n=Math.max(1,Math.ceil(length/12));s.interval=length/n;s.crown=[];
            for(let j=0;j<=n;j++){
              const x=ax+fx*s.interval*j,z=az+fz*s.interval*j;
              // Build a level cross-section above the uphill shoulder. The two
              // batters reconnect it to natural ground without canting the car.
              if(s.profiled){s.crown.push(formation.roadHeight(source,station+s.interval*j)??natural(x,z));continue;}
              s.crown.push(Math.max(natural(x,z),natural(x+nx*width,z+nz*width),natural(x-nx*width,z-nz*width))+.10+width*.018);
            }
          }
          s.authoredPavement=Boolean(e.authoredHalfWidth);
          if(!s.authoredPavement&&perp<detailRadius+30&&!e.kind.startsWith('motorway')&&!e.kind.endsWith('_link')&&!e.traffic?.tunnel){
            const x=(a.x+b.x)/2,z=(a.z+b.z)/2;
            if(!s.haiVan&&(cityStreet||district.builtUp(x,z)||graph&&environment.sample(graph,x,z).cover===50))
              s.walkWidth=width<4?1.2:1.85;
            const sides=grounds.pavementEdges?.get(source.id);
            if(sides||s.walkWidth){
              s.walkSides=[-1,1].map((sign,side)=>{
                const value=sides?.[side]??-1;
                if(value!==-1)return value===-2?(width<4?1.2:1.85):value/100;
                // A residential road beside an irrigation bank may have a walk
                // on the village side only. Explicit sidewalk tags take priority.
                if(farms.features.length)for(const gap of [3,7,11,16]){
                  const across=width+gap,px=x+nx*sign*across,pz=z+nz*sign*across;
                  if(farms.parcelAt(px,pz)||(farms.water.length&&wetMask&&wet(px-cx,pz-cz))||graph&&environment.sample(graph,px,pz).cover===40)return 0;
                }
                return s.walkWidth||0;
              });
              s.walkWidth=Math.max(...s.walkSides);
            }
          }
          segments.push(s);
          if(!s.authoredPavement){
            if(s.profiled){
              // Match the two asphalt slabs exactly. A single wider triangle
              // can protrude through the inside of a hairpin.
              for(const [l,r] of [[-width-.85,-width],[-width,0],[0,width],[width,width+.85]])
                strip(landData,s,0,s.len,l,r);
            }else strip(landData,s,0,s.len,-width-.85,width+.85);
          }
          if(s.graded){strip(pavement,s,0,s.len,-width,0);strip(pavement,s,0,s.len,0,width);}
          else strip(pavement,s,0,s.len,-width,width);
          if(source.controls?.length)roadPaint(source,s.laneLayout,width,station,nextStation,
            (lo,hi,l,r)=>strip(white,s,lo-station,hi-station,l,r),{lines:false});
          for(const [x,z] of [[ax,az],[bx,bz]]){
            const k=Math.round(x*10)+','+Math.round(z*10);
            const node=junctions.get(k);
            if(node){
              if(width>node.r){node.r=width;node.pavement=pavement;}
              node.profiled||=s.profiled;node.n++;
            }else junctions.set(k,{x,z,r:width,n:1,pavement,profiled:s.profiled});
          }
          bounds(s,width+9,key=>{if(!cells.has(key))cells.set(key,[]);cells.get(key).push(s);});
        }
      }
      // Share the formation height at every OSM node to keep joined ribbons continuous.
      // Keep generated trees, shop plots and street furniture out of the bridge
      // footprint. Upper decks never enter the ground-level sidewalk contours.
      if(graph)for(const edge of [...bridges.edges,...tunnels.edges]){
        const w=worldRoadHalfWidth(edge);
        const profile=bridges.bridgeInfo(edge)||graph.tunnels.info(edge);
        for(const [start,end] of profile.ranges)for(let i=1;i<edge.dist.length;i++){
          const lo=Math.max(start,edge.dist[i-1]),hi=Math.min(end,edge.dist[i]);
          if(hi<=lo)continue;
          const a=graph.sample({edge,s:lo,dir:1}),b=graph.sample({edge,s:hi,dir:1});
          const ax=a.x-cx,az=a.z-cz,bx=b.x-cx,bz=b.z-cz,len=hi-lo;
          const seg={ax,az,bx,bz,len,w,fx:(bx-ax)/len,fz:(bz-az)/len,elevated:true,source:edge,station:lo};
          bounds(seg,w+9,key=>{if(!cells.has(key))cells.set(key,[]);cells.get(key).push(seg);});
        }
      }
      const crestNodes=new Map(),surveyNodes=new Set(),nodeKey=(x,z)=>Math.round((cx+x)*10)+','+Math.round((cz+z)*10);
      for(const s of segments)if(s.graded){
        for(const [x,z,h] of [[s.ax,s.az,s.crown[0]],[s.bx,s.bz,s.crown.at(-1)]]){
          const k=nodeKey(x,z);
          if(s.profiled){crestNodes.set(k,h);surveyNodes.add(k);}
          else if(!surveyNodes.has(k))crestNodes.set(k,Math.max(crestNodes.get(k)??-Infinity,h));
        }
      }
      for(const s of segments)if(s.graded){
        s.crown[0]=crestNodes.get(nodeKey(s.ax,s.az));
        s.crown[s.crown.length-1]=crestNodes.get(nodeKey(s.bx,s.bz));
      }
      const wooded=segments.some(s=>s.graded);
      const roadway=!wooded?terrain.ground:(x,z)=>{
        const lx=x-cx,lz=z-cz;
        let weightSum=0,formationSum=0,influence=0;
        let highest=0,lowest=Infinity,throughSum=0,throughWeight=0,throughBlend=0;
        for(const s of cells.get(nearbyCell(lx,lz))||[]){
          if(!s.graded)continue;
          const d=Math.max(0,Math.min(s.len,(lx-s.ax)*s.fx+(lz-s.az)*s.fz));
          const dx=lx-s.ax-s.fx*d,dz=lz-s.az-s.fz*d,cross2=dx*dx+dz*dz;
          const reach=s.w+(s.priority?8:4);
          if(cross2>=reach*reach)continue;
          const cross=Math.sqrt(cross2);
          const j=Math.min(s.crown.length-2,Math.floor(d/s.interval)),f=d/s.interval-j;
          const crown=s.crown[j]*(1-f)+s.crown[j+1]*f;
          const surface=crown-Math.min(s.w,cross)*.018;
          // Where a climbing side road runs beside the main carriageway,
          // retain the through road's crossfall and ease the side road into it.
          if(s.priority&&s.priority>=highest){
            if(s.priority>highest){highest=s.priority;throughSum=throughWeight=throughBlend=0;}
            const t=Math.max(0,Math.min(1,(s.w+8-cross)/7.7)),blend=t*t*(3-2*t),w=blend/(1+cross*cross);
            throughWeight+=w;throughSum+=surface*w;throughBlend=Math.max(throughBlend,blend);
          }
          if(cross>=s.w+4)continue;
          lowest=Math.min(lowest,s.priority);
          const t=Math.max(0,Math.min(1,(s.w+4-cross)/3.35));
          // Intersecting formations meet continuously where their nearest edges switch.
          const blend=t*t*(3-2*t),weight=blend/(1+cross*cross);
          formationSum+=surface*weight;
          weightSum+=weight;influence=Math.max(influence,blend);
        }
        if(!weightSum)return natural(lx,lz);
        let road=formationSum/weightSum;
        if(lowest<highest&&throughWeight)road+=(throughSum/throughWeight-road)*throughBlend;
        if(influence===1)return road;
        const naturalY=natural(lx,lz);
        return naturalY+(road-naturalY)*influence;
      };
      function cutClearance(x,z,own){
        let gap=8;
        for(const other of cells.get(nearbyCell(x,z))||[]){
          if(other===own)continue;
          const t=Math.max(0,Math.min(other.len,(x-other.ax)*other.fx+(z-other.az)*other.fz));
          gap=Math.min(gap,Math.hypot(x-other.ax-t*other.fx,z-other.az-t*other.fz)-other.w);
        }return Math.max(0,Math.min(1,(gap-.6)/4));
      }
      // Taper the fill into the natural slope beneath road bends and at joints.
      function cap(points,x,z,r){
        let a=0;
        for(let i=1;i<=12;i++){const b=i*Math.PI/6;points.push(x,z,x+Math.sin(a)*r,z+Math.cos(a)*r,x+Math.sin(b)*r,z+Math.cos(b)*r);a=b;}
      }
      // Continue the outer edge of the paved shoulder to the actual cut or
      // embankment mesh, including where two verges overlap around a bend.
      for(const s of segments)if(s.profiled)for(const sign of [-1,1]){
        for(const [lo,hi] of [[.78,1.6],[1.6,2.7],[2.7,4.1]])
          strip(passVerges,s,0,s.len,sign*(s.w+lo),sign*(s.w+hi));
      }
      function vergeHeight(x,z){
        let outside=4.1;
        for(const s of cells.get(nearbyCell(x,z))||[]){
          if(s.elevated)continue;
          const dx=x-s.ax,dz=z-s.az,u=Math.max(0,Math.min(s.len,dx*s.fx+dz*s.fz));
          outside=Math.min(outside,Math.hypot(dx-u*s.fx,dz-u*s.fz)-s.w);
        }
        const t=Math.max(0,Math.min(1,(outside-.85)/2.9));
        const top=roadway(cx+x,cz+z)-.034;
        const bed=shorePatch?.sample(x,z,true,false)?.bed??(localGround(x,z)-.17);
        return top+(Math.min(top,bed-.035)-top)*t;
      }
      for(const s of segments)if(s.graded&&!s.profiled)for(const sign of [-1,1]){
        const mid=s.len*.5,x=s.ax+s.fx*mid,z=s.az+s.fz*mid;
        const uphill=natural(x+s.nx*sign*8,z+s.nz*sign*8)-natural(x,z)>.35;
        strip(bankData,s,0,s.len,sign*(s.w+.68),sign*(s.w+(uphill?2.15:4.25)));
        if(!uphill||s.len<7||wetMask&&wet(x,z)||district.builtUp(cx+x,cz+z))continue;
        const count=Math.max(2,Math.ceil(s.len/2.4));
        let prev=-1;
        for(let j=0;j<=count;j++){
          const u=s.len*j/count,px=s.ax+s.fx*u,pz=s.az+s.fz*u;
          const wx=px+cx,wz=pz+cz,coarse=.5+.5*Math.sin(wx*.03+wz*.016+.8*Math.sin(wz*.047));
          const fracture=Math.sin(wx*.88+wz*.42)*.19+Math.cos(wz*1.14-wx*.29)*.13;
          const toe=1.45+.44*coarse+fracture;
          const footX=px+sign*s.nx*(s.w+toe),footZ=pz+sign*s.nz*(s.w+toe);
          const backX=footX+sign*s.nx*5.5,backZ=footZ+sign*s.nz*5.5;
          const cutRoads=cells.get(nearbyCell((footX+backX)*.5,(footZ+backZ)*.5))||[];
          if(!guardrailFits(footX,footZ,backX,backZ,cutRoads,s.len/count*.5+.45,s)){
            prev=-1;continue;
          }
          const rise=Math.max(0,natural(backX,backZ)-natural(footX,footZ));
          const ends=Math.min(1,u/4,(s.len-u)/4),gap=Math.min(cutClearance(footX,footZ,s),cutClearance(backX,backZ,s));
          const height=Math.min(3.9,.15+rise*(1.15+coarse)+coarse*coarse*1.65)*gap*ends;
          if(height<.08){prev=-1;continue;}
          const row=cutVerts.length/3,bankBase=roadway(wx+(footX-px),wz+(footZ-pz));
          for(const [lateral,y] of [[0,bankBase-.28],[.30+fracture,bankBase+height*.35],[.63-fracture,bankBase+height*.77],
            [1.28+coarse,bankBase+height],[3.1,natural(footX+sign*s.nx*3.1,footZ+sign*s.nz*3.1)+height*.32],[5.5,natural(backX,backZ)-.22]]){
            const xx=footX+sign*s.nx*lateral,zz=footZ+sign*s.nz*lateral;
            cutVerts.push(xx,y,zz);cutUv.push(((xx+cx)*s.fx+(zz+cz)*s.fz)*.33,(y+lateral*.67)*.33);
          }
          if(prev>=0){
            for(let k=0;k<5;k++)cutIndices.push(prev+k,row+k,prev+k+1,prev+k+1,row+k,row+k+1);
            if(height>.48){
              const lastX=cutVerts[prev*3],lastZ=cutVerts[prev*3+2];
              const dx=footX-lastX,dz=footZ-lastZ,length=Math.hypot(dx,dz);
              registerObstacle({id:s.seed+':cut:'+j,kind:'barrier',x:(footX+lastX)*.5,z:(footZ+lastZ)*.5,
                fx:dx/length,fz:dz/length,w:length*.5,d:.13,height,parts:[]});
            }
          }
          prev=row;
          if(j%3===1&&s.rank<260&&height>.8){
            const fh=.6+coarse*.65;
            instance('fern',unitPlane,footX+sign*s.nx*1.6,bankBase+height-natural(footX,footZ)+fh*.37,footZ+sign*s.nz*1.6,fh*2.24,fh,1,wx*.43+wz*.21);
          }
        }

      }
      for(const node of junctions.values()){
        cap(node.pavement,node.x,node.z,node.r);
        cap(landData,node.x,node.z,node.r+(node.profiled?0:.85));
      }
      function openNearEnd(s,x,z){
        const node=junctions.get(Math.round(x*10)+','+Math.round(z*10));return node&&node.n>2?node.r+1:.0;
      }
      // Placements compete only with immediate neighbours by fixed OSM-derived priority.
      // Reordering visible roads or clipping a distant street cannot cascade into a new layout.
      function compareCandidate(a,b){return a.priority-b.priority||a.key.localeCompare(b.key);}
      const plotSize=12;
      function visitPlots(c,cb){
        for(let i=Math.floor((c.hx-c.footprint)/plotSize);i<=Math.floor((c.hx+c.footprint)/plotSize);i++)
          for(let j=Math.floor((c.hz-c.footprint)/plotSize);j<=Math.floor((c.hz+c.footprint)/plotSize);j++)cb(i+','+j);
      }
      const walks=createGroundedWalkways(T,{cx,cz,step:terrain.step,
        height:(x,z)=>roadway(cx+x,cz+z),ground:(x,z)=>Math.min(localGround(x,z),shoreBed(cx+x,cz+z)??Infinity),
        needsDetail:(x0,z0,x1,z1)=>wooded||shorePatch?.intersects(x0,z0,x1,z1),
        wet:(x,z)=>{
          if(!wetMask||!wet(x,z))return false;
          // The four-metre water mask can straddle a waterfront street. Carry
          // the grounded kerb over its shallow bank up to the mapped bed.
          const shore=sampleShore(x,z);
          return shore&&shore.level-shore.bed>.65;
        }});
      const aprons=new Map(),walkRoads=new Set();
      function cellRoads(x,z,reach){
        const found=new Set();
        for(let i=Math.floor((x-reach)/cellSize);i<=Math.floor((x+reach)/cellSize);i++)
          for(let j=Math.floor((z-reach)/cellSize);j<=Math.floor((z+reach)/cellSize);j++)
            for(const s of cells.get(i+','+j)||[])found.add(s);
        return found;
      }
      yield* buildNationalStreetscape(T,{points:grounds.roadside,district,grounds,cx,cz,cellRoads,
        blocked:(x,z,r)=>onApproach(cx+x,cz+z)||blocked(x,z,r),ground:localGround,
        plantable:(x,z)=>grounds.plantable(cx+x,cz+z)&&!onApproach(cx+x,cz+z)&&!obstruction(x,z,.24),
        builtLand:(x,z)=>environment.sample(graph,cx+x,cz+z).cover===50,
        placeBox:(mat,...args)=>instance(mat,unitBox,...args),register:registerObstacle,
        plant:(kind,x,z,h,w,a,owner)=>plantTree(kind,x,z,h,w,a,null,owner),group:roadGroup,
        radius:detailRadius,commonSigns,compact:graphics.profile.id==='low'});
      const footbridgeIds=new Set(bridges?.footbridges.map(f=>'w'+f.id));
      function existingFarmBridge(id,x,z,fx,fz){
        if(footbridgeIds.has(id))return true;
        for(const s of cells.get(nearbyCell(x,z))||[]){
          if('w'+s.source.traffic?.way===id)return true;
          if(Math.abs(s.fx*fx+s.fz*fz)<.72)continue;
          const t=Math.max(0,Math.min(s.len,(x-s.ax)*s.fx+(z-s.az)*s.fz));
          if(Math.hypot(x-s.ax-s.fx*t,z-s.az-s.fz*t)<s.w+.25)return true;
        }
        return false;
      }
      const farmContext={features:farms.features,cx,cz,reach:Math.min(420,detailRadius),
        ground:localGround,blocked:(x,z,r)=>obstruction(x,z,r)||grounds.mapped(cx+x,cz+z),
        existingBridge:existingFarmBridge,shore:shorePatch,group:roadGroup,material};
      const farmDeck=yield* buildFarmEdges(T,farmContext);
      const terraceHeight=yield* buildRiceTerraces(T,{...farmContext,material:material.farmSoil});
      yield* plantCropRows(roadGroup,farms,segments,cx,cz,localGround,terraceHeight,
        (x,z,r)=>!farmContext.blocked(x,z,r),(x,z,h,seed)=>{
          const tree=registerObstacle({id:'orchard:'+Math.round(cx+x)+':'+Math.round(cz+z),kind:'tree',x,z,radius:.10,height:h,parts:[]});
          plantTree('tree',x,z,h,h*.9,seed%31,0xcad4a4,tree);
        },graphics.profile.id==='low');
      for(const s of segments){
        if((++work & 15)===0)yield;
        const start=openNearEnd(s,s.ax,s.az),end=s.len-openNearEnd(s,s.bx,s.bz);
        if(s.authoredPavement)continue;
        if(s.walkWidth)bounds(s,s.w+5,key=>{
          for(const neighbour of cells.get(key)||[])if(!neighbour.elevated)walkRoads.add(neighbour);
        });
        if(end<=start)continue;
        const mid=(start+end)/2,mx=s.ax+s.fx*mid,mz=s.az+s.fz*mid;
        const street=s.traffic?.way===37933540||s.kind==='residential'||s.kind==='living_street'||district.builtUp(mx+cx,mz+cz);
        if(!street && !s.kind.startsWith('motorway') && s.rank<420 && s.len>12){
          // Red-topped marker posts follow exposed verges, including the outside of bends.
          for(let d=8+s.seed%17;d<end-5;d+=48)for(const side of [-1,1]){
            if(d<start+4)continue;
            const x=s.ax+s.fx*d+side*s.nx*(s.w+1.05),z=s.az+s.fz*d+side*s.nz*(s.w+1.05);
            if(blocked(x,z,.24)||contact(cx+x,cz+z,.28))continue;
            const y=roadway(cx+x,cz+z)-localGround(x,z);
            instance('white',unitBox,x,y+.32,z,.17,.64,.17);
            instance('white',unitBox,x,y+.72,z,.18,.16,.18,0,0xc13f31);
          }
        }
        const pilot=s.haiVan,midStation=pilot&&(pilot.a+pilot.b)/2;
        if(pilot&&midStation>=haiVanPilot.start&&midStation<=haiVanPilot.end){
          strip(yellow,s,start,end,-.068,.068);
          for(const side of [-1,1]){
            const offset=side*(s.w-.22);strip(white,s,start,end,offset-.055,offset+.055);
          }
        }else roadPaint(s.source,s.laneLayout,s.w,s.station+start,s.station+end,(lo,hi,l,r,color)=>
          strip(color==='yellow'?yellow:white,s,lo-s.station,hi-s.station,l,r),{controls:false});
        if(s.rank>detailRadius||s.len<3)continue;
        if(!s.graded&&s.w>=4.2&&s.len>=24){
          const spacing=s.w>6?31:38;
          let last=null;
          for(let station=9;station<end-4;station+=spacing){
            const px=s.ax+s.fx*station+s.nx*(s.w+1.7),pz=s.az+s.fz*station+s.nz*(s.w+1.7);
            if(grounds.memorialAt(px+cx,pz+cz)||blocked(px,pz,.45)||(s.w>6&&grounds.nearFixture(px,pz,spacing*.8,'lamp'))){last=null;continue;}
            const pole=registerObstacle({id:s.seed+':pole:'+station,kind:'pole',x:px,z:pz,radius:.12,parts:[]});
            instance('concrete',unitPole,px,3.65,pz,.17,7.3,.17,0,null,pole);
            const rot=Math.atan2(s.nx,s.nz);
            if(s.w>6){
              instance('steel',unitBox,px-s.nx*.9,7.18,pz-s.nz*.9,.095,.09,1.98,rot,null,pole);
              instance('lantern',unitBox,px-s.nx*1.91,7.13,pz-s.nz*1.91,.34,.14,.68,rot,null,pole);
              const lx=px-s.nx*1.91,lz=pz-s.nz*1.91;
              streetBulbs.push(new T.Vector3(lx,localGround(lx,lz)+6.99,lz));
            }else{
              instance('steel',unitBox,px,6.89,pz,.085,.095,1.66,rot,null,pole);
              for(const side of [-1,1]){
                instance('roof',unitPole,px+s.nx*side*.67,7.04,pz+s.nz*side*.67,.1,.23,.1,0,null,pole);
                if(last)for(let j=0;j<6;j++){
                  const f=j/6,t=(j+1)/6;
                  for(const u of [f,t])wires.push(last.x+(px-last.x)*u+s.nx*side*.67,7.13-2.8*u*(1-u),last.z+(pz-last.z)*u+s.nz*side*.67);
                }
              }
            }last={x:px,z:pz};
          }
        }
        const dense=['residential','living_street','secondary','tertiary'].includes(s.kind);
        const step=dense?14:23;
        let first=(s.seed%step)+2;
        if(first>s.sourceLength&&s.sourceLength>5)first=s.sourceLength*.52;
        for(let station=first,index=0;station<s.sourceLength;station+=step,index++){
          const d=station*s.len/s.sourceLength,x=s.ax+s.fx*d,z=s.az+s.fz*d;
          if(Math.hypot(x,z)>detailRadius)continue;
          for(const sign of [-1,1]){
            let seed=(s.seed^Math.imul(1+2*index+(sign>0?1:0),1597334677))>>>0;
            const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
            const priority=random(),house=random()<(s.graded?.035:dense?.73:.34),type=Math.floor(random()*shopTypes.length);
            const width=4.5+random()*2.9,depth=5+random()*3.9;
            const dist=s.w+(house?3.5+depth/2:3)+random()*(house?3:5);
            const hx=x+sign*s.nx*dist,hz=z+sign*s.nz*dist,footprint=house?Math.hypot(width,depth)/2+.8:1.7;
            if(seaOpening?.(hx,hz)||farms.parcelAt(hx+cx,hz+cz))continue;
            const cover=landscapes.cover(hx+cx,hz+cz);
            const landClass=environment.sample(graph,hx+cx,hz+cz).cover;
            if(cover===1||house&&cover>178||landClass===80||landClass===95)continue;
            if(house&&(structures.covered(graph,hx+cx,hz+cz)||(landClass!=null&&landClass!==50)))continue;
            if(!house&&[40,60,70,90].includes(landClass)&&random()>.09)continue;
            if(blocked(hx,hz,footprint)||onApproach(hx+cx,hz+cz)||house&&(grounds.memorialAt(hx+cx,hz+cz)||district.mappedBlock(hx+cx,hz+cz)))continue;
            if(house){
              const x=hx+cx,z=hz+cz,w=width/2+.25,d=depth/2+.30,front=-sign*(depth/2+2);
              const ring=[[-w,front],[w,front],[w,sign*d],[-w,sign*d]].map(([u,v])=>new T.Vector2(x+s.fx*u+s.nx*v,z+s.fz*u+s.nz*v));
              const bounds=new T.Box2().setFromPoints(ring);
              if(ring.some(p=>openGround(p.x,p.y))||
                district.overlapsSight(landmarks,[ring],{minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.y,maxZ:bounds.max.y}))continue;
            }
            const c={key:s.seed+':'+index+':'+sign,priority,s,sign,hx,hz,footprint,house,width,depth,type,random,setback:dist-s.w-depth/2};
            candidates.push(c);
            visitPlots(c,k=>{if(!rivals.has(k))rivals.set(k,[]);rivals.get(k).push(c);});
          }
        }
      }
      yield* traceSidewalkSteps(walkRoads,(x,z)=>(cells.get(nearbyCell(x,z))||[]).filter(s=>!s.elevated),walks.sidewalk,(s,a,b,c)=>{
        if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<.00001)return;
        const mat=s.roadMaterial;
        if(!aprons.has(mat))aprons.set(mat,[]);
        aprons.get(mat).push(...a,...b,...c);
      },streamed&&requestSidewalkRings);
      for(const c of candidates){
        if((++work & 15)===0)yield;
        let obscured=false;
        visitPlots(c,k=>{
          if(obscured)return;
          obscured=rivals.get(k).some(o=>o!==c&&compareCandidate(o,c)<0&&Math.hypot(c.hx-o.hx,c.hz-o.hz)<c.footprint+o.footprint);
        });
        if(obscured)continue;
        const {house,s,sign,hx,hz,width,depth,type,random}=c;
            if(house){
              const rZone=graph&&centralStreetscapes?.zoneAt(...graph.geo(hx+cx,hz+cz));
              const twoStory=rZone?type%2===0:upstairs.has(shopTypes[type]);
              const h=(twoStory?6.7:3.65)+random()*.62;
              // Local +Z faces the road, with the façade just outside the wall.
              const sx=-s.nx*sign,sz=-s.nz*sign,rot=Math.atan2(sx,sz);
              const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>
                [cx+hx+s.fx*u*width/2+sx*v*depth/2,cz+hz+s.fz*u*width/2+sz*v*depth/2]);
              let low=localGround(hx,hz),high=low;
              for(let i=0;i<4;i++){
                const [ax,az]=corners[i],[bx,bz]=corners[(i+1)%4];
                for(const t of terrainEdgeBreaks(ax,az,bx,bz)){
                  const bed=terrain.ground(ax+(bx-ax)*t,az+(bz-az)*t);
                  low=Math.min(low,bed);high=Math.max(high,bed);
                }
              }
              buildingBase=high;
              const foot=high-low+.23;
              instance('concrete',unitBox,hx,.02-foot/2,hz,width,foot,depth,rot);

              const wallPal=rZone?rZone.walls:[0xe9d4b5,0xc7d6bb,0xf3dfb0];
              const roofPal=rZone?rZone.roofs:[0x989d98,0xaf846d,0x99aeb0];
              const gablePal=rZone?rZone.gables:[0xa26148,0x825947,0x7b8688];
              const awningPal=rZone?rZone.awnings:[0xa2a692,0xbc8062,0x809b93];
              const seed=Math.floor(c.priority*4294967295)>>>0;
              const wall=wallPal[type%wallPal.length],inset=Math.min(1.85,depth*.24,width*.29);
              const face={x:hx+sx*depth/2,z:hz+sz*depth/2,nx:sx,nz:sz,ux:s.fx,uz:s.fz,half:width/2,
                shoulder:Math.min(.47,width*.065),inset,levels:twoStory?2:1,seed,kind:type%3===0?'retail':'house'};
              const backDepth=depth-inset;
              instance('wall',unitBox,hx-sx*inset/2,h*.5,hz-sz*inset/2,width,h,backDepth,rot,wall);
              const solid=(id,x,z,w,d)=>registerObstacle({id,kind:'building',x,z,fx:s.fx,fz:s.fz,w,d,baseY:low-.21,height:h+foot});
              solid(c.key,hx-sx*inset/2,hz-sz*inset/2,width/2,backDepth/2);
              for(const side of [-1,1]){
                const u=side*(width-face.shoulder)/2;
                const px=face.x+s.fx*u-sx*inset/2,pz=face.z+s.fz*u-sz*inset/2;
                instance('wall',unitBox,px,h/2,pz,face.shoulder,h,inset,rot,wall);
                solid(c.key+side,px,pz,face.shoulder/2,inset/2);
              }
              const gallery=VietnamHouseFronts.draw(T,face,h,new T.Color(wall),new T.Color(roofPal[type%roofPal.length]),
                (px,py,pz,u,v,tint,finish=0)=>{porchPositions.push(px,high+py,pz);porchColors.push(tint.r,tint.g,tint.b);porchUv.push(u,v);porchSurface.push(finish);});
              for(const side of [-1,1]){
                const wx=hx+s.fx*side*(width/2+.035),wz=hz+s.fz*side*(width/2+.035);
                for(const floor of h>5?[1.7,4.5]:[1.7]){
                  instance('glass',unitBox,wx,floor,wz,.075,1.05,1.56,rot);
                  instance('concrete',unitBox,wx+s.fx*side*.10,floor-.57,wz+s.fz*side*.10,.28,.09,1.75,rot);
                }
              }
              instance('sheet',unitBox,hx,h+.07,hz,width+.46,.19,depth+.52,rot,roofPal[type%roofPal.length]);
              const pitched=(rZone?.forcePitched?h<8:h<5)&&c.priority<(rZone?.forcePitched?.95:.7);
              if(pitched)instance('gable',gable,hx,h+.14,hz,width+.5,width*(rZone?.forcePitched?.29:.24),depth+.59,rot,gablePal[type%gablePal.length]);
              const projection=Math.min(1.9,width*.27,c.setback-1.2);
              const porch=(depth+projection)/2,awningY=gallery.top;
              walks.porch(s,hx+sx*porch,hz+sz*porch,width+.35,projection+.18);
              const outer=depth/2+projection-.1;
              const postX=hx+sx*outer+s.fx*width*.45,postZ=hz+sz*outer+s.fz*width*.45;
              const postTop=awningY-.065,postFoot=Math.min(postTop-.1,localGround(postX,postZ)-buildingBase-.21);
              instance('awning',unitBox,hx+sx*porch,awningY,hz+sz*porch,width+.4,.13,projection,rot,awningPal[type%awningPal.length]);
              roadGroup.userData.eaves.push([hx+sx*(porch+projection/2),buildingBase+awningY-.065,
                hz+sz*(porch+projection/2),s.fx,s.fz,width+.4]);
              instance('concrete',unitPole,postX,(postFoot+postTop)/2,postZ,.09,postTop-postFoot,.09);
              if(type%3===0&&!pitched)instance('steel',unitPole,hx,h+.65,hz,1.2,1.0,1.2);
              buildingBase=null;
            }else{
              const [lon,lat]=graph?graph.geo(hx+cx,hz+cz):[105,21];
              const uplands=lat>21.3&&lon<106.4||lat>11.6&&lat<15&&lon>107&&lon<108.6;
              const palm=random()<(uplands?.015:lat<11?.48:lat<18?.32:.11),height=(palm?7.5:5)+random()*5,w=height*(palm?.59:.92),r=random()*Math.PI;
              const tree=registerObstacle({id:c.key,kind:'tree',x:hx,z:hz,radius:.27,height,parts:[]});
              plantTree(palm?'palm':'tree',hx,hz,height,w,r,null,tree);
            }
      }
      if(innerPrecinct){
        // Three shade trees on the inside verge frame the gate as the road turns.
        const verge=[[105.79649,20.55585,7.6],[105.79665,20.55580,9.2],[105.79682,20.55578,7.9]];
        for(const [lon,lat,h] of verge){
          const p=graph.point(lon,lat),x=p.x-cx,z=p.z-cz;
          if(Math.hypot(x,z)>540||blocked(x,z,1.5))continue;
          const tree=registerObstacle({id:'tam-chuc-verge:'+lon,kind:'tree',x,z,radius:.25,height:h,parts:[]});
          plantTree('tree',x,z,h,h*.94,.35,0xfff4d8,tree);
        }
      }
      if(graph&&window.CoastalRouteScenery){
        yield* CoastalRouteScenery.build({T,graph,cx,cz,segments,instance,plantTree,registerObstacle,localGround,streetBulbs,
          unitBox,unitPole,gable,radius:detailRadius,compact:graphics.profile.id==='low',
          clear:(x,z,r)=>!blocked(x,z,r)&&!contact(x+cx,z+cz,r)&&!onApproach(x+cx,z+cz)&&!seaOpening?.(x,z),
          farm:(x,z)=>Boolean(farms.parcelAt(x+cx,z+cz))});
      }
      if(graph){
        yield* forestPlots(graph,cx,cz,Math.min(600,detailRadius),(ix,iz,wx,wz,gx,gz,rand)=>{
            if(seaOpening?.(wx-cx,wz-cz))return;
            const precinct=Math.hypot(wx-complexCenter.x,wz-complexCenter.z)<1500;
            const observed=landscapes.cover(wx,wz),grove=precinct&&inGrove(wx-cx,wz-cz);
            const landClass=environment.sample(graph,wx,wz).cover;
            const woodland=landClass===10||landClass===95;
            if(!grove){
              if(landClass!=null&&!woodland)return;
              if(observed!==null?observed<(woodland?158:204):!woodland&&terrain.altitude(wx,wz)<(precinct?63:280))return;
            }
            // A high vegetation index also occurs in rice fields. Use the mapped
            // tree and mangrove classes to fill a canopy without planting the fields.
            if(!precinct&&rand()>(woodland?(small?.56:.76):.36))return;
            const openness=.46+.19*Math.sin(gx*.013+gz*.004)+.18*Math.sin(gz*.019-gx*.005);
            if(rand()>openness+.24||district.builtUp(wx,wz)||onApproach(wx,wz))return;
            const lx=wx-cx,lz=wz-cz,dist=Math.hypot(lx,lz);
            if(blocked(lx,lz,5.5))return;
            const occupants=obstacleCells.get(obstacleKey(lx,lz))||[];
            if(occupants.some(o=>!String(o.id).startsWith('stand:')&&
              Math.hypot(lx-o.x,lz-o.z)<(o.radius||Math.hypot(o.w,o.d))+2))return;
            const altitude=terrain.altitude(wx,wz),cool=altitude>650;
            const pine=cool&&rand()<.4;
            const h=landClass===95?4.7+rand()*5.5:(pine?10:6.7)+rand()*(pine?10:7.1);
            const w=h*(pine?.5:landClass===95?1.12:.82)*(.82+rand()*.32);
            const angle=rand()*Math.PI,tint=tone.setHSL(.24+rand()*.10,.08+rand()*.14,.66+rand()*.18).getHex();
            const id='stand:'+ix+':'+iz;
            const tree=registerObstacle({id,kind:'tree',x:lx,z:lz,radius:Math.max(.16,h*.02),height:h,parts:[]});
            plantTree(pine?'pine':'tree',lx,lz,h,w,angle,tint,tree);
            if(dist>365||rand()>.76)return;
            for(let k=0;k<3;k++){
              const fx=lx+(rand()-.5)*12,fz=lz+(rand()-.5)*12,fh=.6+rand()*1.0;
              if(!blocked(fx,fz,1.5))instance('fern',unitPlane,fx,fh*.47,fz,fh*2.24,fh,1,rand()*Math.PI,tint);
            }
        });
      }
      yield* buildWorldPassDetails(T,{segments,group:roadGroup,
        surface:(x,z,s)=>Math.max(s.profiled?vergeHeight(x,z):roadway(cx+x,cz+z)-.065,localGround(x,z)-.17),
        natural:(x,z)=>raw.ground(cx+x,cz+z),nearby:(x,z)=>cells.get(nearbyCell(x,z))||[],
        exclude:(x,z)=>(wetMask&&wet(x,z))||district.builtUp(cx+x,cz+z)});
      if(haiVan?.visible)buildHaiVanPilot(T,{
        group:roadGroup,compact:small,trees:treeModels,opening:seaOpening,ground:localGround,
        sample:haiVan.sample,roadHeight:p=>roadway(cx+p.x,cz+p.z),
        clear:(x,z,r)=>!blocked(x,z,r),
        barrier(a,b,d,side){
          const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
          if(len>.01)registerObstacle({id:'hai-van-wall:'+side+':'+d,kind:'barrier',
            x:(a.x+b.x)/2,z:(a.z+b.z)/2,fx:dx/len,fz:dz/len,w:len*.5,d:.22,height:.69,parts:[]});
        }
      });
      if(cutVerts.length){
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(cutVerts,3));
        g.setAttribute('uv',new T.Float32BufferAttribute(cutUv,2));g.setIndex(cutIndices);g.computeVertexNormals();
        if(!material.cut.map){
          material.cut.map=texture('surfaces/cut-rock-color.webp',true);
          material.cut.normalMap=skyLoader.load('streetscape/surfaces/cut-rock-normal.webp');
          material.cut.normalMap.wrapS=material.cut.normalMap.wrapT=T.RepeatWrapping;
        }
        const bank=new T.Mesh(g,material.cut);bank.name='Exposed rock cuttings';bank.castShadow=true;bank.receiveShadow=true;roadGroup.add(bank);
      }
      // A continuous folded W-beam follows the low shoulder above a drop.
      for(const s of segments){
        if((++work & 15)===0)yield;
        if(!s.graded||s.len<3||s.rank>530)continue;
        const mid=s.len/2,x=s.ax+s.fx*mid,z=s.az+s.fz*mid;
        const side=natural(x+s.nx*7,z+s.nz*7)<natural(x-s.nx*7,z-s.nz*7)?1:-1;
        const off=side*(s.w+.47);
        if(natural(x,z)-natural(x+side*s.nx*9,z+side*s.nz*9)<.45||
          wetMask&&wet(x,z)||district.builtUp(cx+x,cz+z))continue;
        const start=openNearEnd(s,s.ax,s.az),end=s.len-openNearEnd(s,s.bx,s.bz),length=end-start;
        if(length<2)continue;
        const count=Math.ceil(length/4),angle=Math.atan2(s.fx,s.fz);
        const span=length/count;
        function row(x,z){
          const first=railVerts.length/3,y=roadway(cx+x,cz+z);
          for(const [push,up] of [[0,.51],[.064,.55],[.012,.605],[.067,.66],[0,.70]])
            railVerts.push(x-side*push*s.nx,y+up,z-side*push*s.nz);
          return first;
        }
        let previousRow=-1;
        for(let j=0;j<count;j++){
          const d=start+span*j,px=s.ax+s.fx*d+s.nx*off,pz=s.az+s.fz*d+s.nz*off;
          if(s.haiVan){
            const {a,b}=s.haiVan,station=a+(b-a)*(d+span*.5)/s.len;
            if(replacesHaiVanBeam(station)){previousRow=-1;continue;}
          }
          const ex=px+s.fx*span,ez=pz+s.fz*span,mx=(px+ex)*.5,mz=(pz+ez)*.5;
          // A side road or the return leg of a hairpin can overlap a shoulder
          // well beyond the node itself. Open the rail and its collider together.
          if(!guardrailFits(px,pz,ex,ez,cells.get(nearbyCell(mx,mz))||[],.32,s)){
            previousRow=-1;continue;
          }
          const a=previousRow>=0?previousRow:row(px,pz),b=row(ex,ez);
          for(let k=0;k<4;k++)railIndices.push(a+k,b+k,a+k+1,a+k+1,b+k,b+k+1);
          previousRow=b;
          const adjust=roadway(cx+px,cz+pz)-natural(px,pz);
          instance('steel',unitBox,px+side*.08*s.nx,adjust+.27,pz+side*.08*s.nz,.10,.88,.12,angle);
          if(j%4===0)instance('white',unitBox,px,adjust+.697,pz,.12,.054,.06,angle);
          registerObstacle({id:s.seed+':rail:'+j,kind:'barrier',x:mx,z:mz,fx:s.fx,fz:s.fz,w:span*.5,d:.10,height:.70,parts:[]});
        }
      }
      if(railVerts.length){
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(railVerts,3));
        g.setIndex(railIndices);g.computeVertexNormals();const rails=new T.Mesh(g,material.rail);
        rails.name='Mountain safety rails';rails.castShadow=true;rails.receiveShadow=true;roadGroup.add(rails);
      }
      function* surface(data,mat,y,freq,groundHeight=null){
        if(!data.length)return;
        const step=data===passVerges?formation.fine:terrain.step;
        const asphalt=mat===material.asphalt,stride=asphalt?11:8,chunkVertices=shorePatch?3072:12288;
        let buffer=new Float32Array(Math.min(chunkVertices,Math.max(96,data.length))*stride),used=0;
        let section,fitTriangle=false;

        function finishChunk(){
          if(!used)return;
          const floats=buffer.subarray(0,used);
          writeFlatNormals(floats,floats,stride,3);
          const vertices=new T.InterleavedBuffer(floats,stride),g=new T.BufferGeometry();
          g.userData.streamedSurface=true;
          const attr=(size,offset)=>new T.InterleavedBufferAttribute(vertices,size,offset);
          g.setAttribute('position',attr(3,0));g.setAttribute('normal',attr(3,3));
          g.setAttribute('uv',attr(2,6));
          if(asphalt)g.setAttribute('carriageway',attr(3,8));
          if(mat!==whitePaint&&mat!==yellowPaint)shorePatch?.addCover(g);
          g.computeBoundingSphere();
          const mesh=new T.Mesh(g,mat);mesh.receiveShadow=true;
          if(mat.transparent&&mat.userData.templeSurface)mesh.renderOrder=1;
          roadGroup.add(mesh);used=0;
        }
        function vertex(x,z,roadY){
          // Keep complete triangles together. A fitted hairpin can otherwise
          // grow several large JS arrays and upload the entire road in one draw.
          if(used===buffer.length){
            finishChunk();
            buffer=new Float32Array(Math.min(chunkVertices*stride,buffer.length*2));
          }
          const h=groundHeight?groundHeight(x,z):roadY??roadway(cx+x,cz+z);
          const i=used;used+=stride;
          buffer[i]=x;buffer[i+1]=h+y;buffer[i+2]=z;
          if(asphalt){
            let sag=0;
            if(section && !section.elevated){
              if(!section.drainage){
                const n=Math.max(1,Math.ceil(section.len/8)),spacing=section.len/n;
                const heights=Array.from({length:n+1},(_,i)=>roadway(cx+section.ax+section.fx*i*spacing,cz+section.az+section.fz*i*spacing));
                section.drainage=heights.map((v,i)=>Math.min(1,Math.max(0,Math.min(heights[i-1]??v,heights[i+1]??v)-v)*4));
              }
              const samples=section.drainage,along=(x-section.ax)*section.fx+(z-section.az)*section.fz;
              const u=Math.max(0,Math.min(1,along/section.len))*(samples.length-1),i=Math.floor(u);
              sag=samples[i]+((samples[i+1]??samples[i])-samples[i])*(u-i);
            }
            buffer[i+8]=section?(x-section.ax)*section.nx+(z-section.az)*section.nz:0;
            buffer[i+9]=section?.w||0;buffer[i+10]=sag;
          }
          if(mat.userData.roadPanels&&section){
            const dx=x-section.ax,dz=z-section.az;
            buffer[i+6]=section.station+dx*section.fx+dz*section.fz;buffer[i+7]=dx*section.nx+dz*section.nz;
          }else if(mat.userData.templeSurface||mat===material.pavers){buffer[i+6]=cx+x;buffer[i+7]=cz+z;}
          else{buffer[i+6]=x*freq+(cx*freq)%1;buffer[i+7]=z*freq+(cz*freq)%1;}
        }
        const fitRoad=wooded&&(mat===material.pavers||mat===curbStone);
        // Child faces share the parent's corners and edge midpoints. Keep their
        // sampled road height on each point, including for the final mesh vertices.
        const sample=p=>p[2]??(p[2]=roadway(cx+p[0],cz+p[1]));
        const mid=(p,q)=>[(p[0]+q[0])/2,(p[1]+q[1])/2];
        let faces=0;
        function* triangle(a,b,c,depth=0){
          // A single source triangle on a hairpin can produce 1,024 faces.
          // Let the existing district scheduler pause even within that triangle.
          if((++faces&63)===0)yield;
          if(fitTriangle&&depth<5){
            const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a),ha=sample(a),hb=sample(b),hc=sample(c);
            const middle=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3];
            const error=Math.max(Math.abs(sample(ab)-(ha+hb)/2),Math.abs(sample(bc)-(hb+hc)/2),
              Math.abs(sample(ca)-(hc+ha)/2),Math.abs(sample(middle)-(ha+hb+hc)/3));
            if(error>.014){
              yield* triangle(a,ab,ca,depth+1);yield* triangle(ab,b,bc,depth+1);
              yield* triangle(ca,bc,c,depth+1);yield* triangle(ab,bc,ca,depth+1);return;
            }
          }
          vertex(a[0],a[1],a[2]);vertex(b[0],b[1],b[2]);vertex(c[0],c[1],c[2]);
        }
        // Split at terrain edges so a long road, its paint and the ground coincide
        // even when all three meshes have different source triangulations.
        const offset=[cx,cz,cx+cz];
        function* split(poly,axis){
          if(axis===3){
            for(let j=1;j<poly.length-1;j++)yield* triangle(poly[0],poly[j],poly[j+1]);
            return;
          }
          const coord=p=>axis===2?p[0]+p[1]:p[axis];
          let low=Infinity,high=-Infinity;
          for(const p of poly){const v=coord(p);low=Math.min(low,v);high=Math.max(high,v);}
          const cut=(Math.floor((low+offset[axis]+.00001)/step)+1)*step-offset[axis];
          if(cut>=high-.00001){yield* split(poly,axis+1);return;}
          const left=[],right=[];let prev=poly.at(-1),a=coord(prev)-cut;
          for(const p of poly){
            const b=coord(p)-cut;
            if(a*b<0){
              const f=a/(a-b),mid=[prev[0]+(p[0]-prev[0])*f,prev[1]+(p[1]-prev[1])*f];
              left.push(mid);right.push(mid);
            }
            if(b<=0)left.push(p);if(b>=0)right.push(p);prev=p;a=b;
          }
          yield* split(left,axis+1);yield* split(right,axis);
        }
        const same=(a,b,c,o)=>Math.floor((Math.min(a,b,c)+o)/step)===Math.floor((Math.max(a,b,c)+o)/step);
        const sections=sectionsFor.get(data);
        for(let i=0;i<data.length;i+=6){
          if(i%768===0)yield;
          if(sections)section=sections[i/6];
          const ax=data[i],az=data[i+1],bx=data[i+2],bz=data[i+3],dx=data[i+4],dz=data[i+5];
          // Junction fans, parking aprons and paint can cover the carriageway
          // without owning a road section. Fit them to the same wheel surface.
          fitTriangle=fitRoad||section?.profiled||(!groundHeight&&formation?.intersects(
            cx+Math.min(ax,bx,dx),cz+Math.min(az,bz,dz),cx+Math.max(ax,bx,dx),cz+Math.max(az,bz,dz)));
          if(same(ax,bx,dx,cx)&&same(az,bz,dz,cz)&&same(ax+az,bx+bz,dx+dz,cx+cz)){
            if(fitTriangle)yield* triangle([ax,az],[bx,bz],[dx,dz]);else{vertex(ax,az);vertex(bx,bz);vertex(dx,dz);}
          }else yield* split([[ax,az],[bx,bz],[dx,dz]],0);
        }
        finishChunk();
      }
      material.white.side=T.DoubleSide;
      // Full-scale lights require a recorded height. Locations without a
      // physical measurement remain on the close-range driving map.
      for(const f of grounds.streetFurniture){
        if(!f.height||Math.hypot(f.x,f.z)>detailRadius)continue;
        const {x,z,height:h}=f;
        const width=f.diameter||(f.kind==='lamp'?.14:.12);
        if(obstruction(x,z,width/2,true,true))continue;
        const owner=registerObstacle({id:'osm-node-'+f.id,kind:'pole',x,z,radius:width/2,height:h,parts:[]});
        instance('steel',unitPole,x,h/2,z,width,h,width,0,null,owner);
        if(f.kind==='lamp'){
          instance('lantern',unitPole,x,h-.07,z,width*1.7,.14,width*1.7,0,null,owner);
          streetBulbs.push(new T.Vector3(x,localGround(x,z)+h-.15,z));
        }
      }
      yield* grounds.build(roadGroup,localGround,obstruction,registerObstacle,sampleShore,(kind,x,z,h,w,angle)=>{
        if(kind==='tea'){
          plantTree('tea',x,z,h,w,angle,0xebf2cd,null);return;
        }
        const tree=registerObstacle({id:'mapped-tree:'+Math.round(cx+x)+':'+Math.round(cz+z),
          kind:'tree',x,z,radius:Math.max(.12,h*.022),height:h,parts:[]});
        plantTree(kind,x,z,h,w,angle,null,tree);
      },(x,z,r,allowWater=false)=>obstruction(x,z,r,allowWater,true),
      (ax,az,bx,bz,r)=>guardrailFits(ax,az,bx,bz,railRoads(ax,az,bx,bz),r,null,s=>!s.elevated));
      yield* surface(bankData,material.earth,-.065,.60);
      yield* surface(passVerges,material.earth,0,.60,vergeHeight);
      if(cover.length){
        temple??=createTempleSurfaces(T);temple.setOrigin(graph);
        const layer={stone:[],lawn:[],wood:[]};
        for(const {kind,points} of cover){
          for(const face of T.ShapeUtils.triangulateShape(points,[])){
            for(const i of face)layer[kind].push(points[i].x,points[i].y);
          }
        }
        // Ground cover extends beneath the mapped carriageway at the lakeside gate.
        yield* surface(layer.stone,temple.paving,-.158,1,localGround);
        yield* surface(layer.lawn,temple.lawn,-.153,1,localGround);
        yield* surface(layer.wood,temple.wood,-.148,1,localGround);
      }
      if(graph&&window.tamChucPaths){
        const center=graph.point(105.7956,20.5528);
        if(Math.hypot(center.x-cx,center.z-cz)<1500){
          const paving=[];
          for(const [steps,coords] of tamChucPaths){
            let a=graph.point(105.79+coords[0]/1e6,20.54+coords[1]/1e6);
            for(let i=2;i<coords.length;i+=2){
              const b=graph.point(105.79+coords[i]/1e6,20.54+coords[i+1]/1e6);
              const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
              if(len>.1){
                const half=steps?2.5:1.65,ox=-dz/len*half,oz=dx/len*half;
                const ax=a.x-cx,az=a.z-cz,bx=b.x-cx,bz=b.z-cz;
                paving.push(ax+ox,az+oz,bx+ox,bz+oz,bx-ox,bz-oz,ax+ox,az+oz,bx-ox,bz-oz,ax-ox,az-oz);
              }
              a=b;
            }
          }
          if(paving.length){temple??=createTempleSurfaces(T);yield* surface(paving,temple.paving,-.14,1,localGround);}
        }
      }
      yield* surface(landData,material.earth,-.032,.77);
      for(const [finish,data] of Object.entries(roadSurfaces))
        yield* surface(data,material[finish],.002,finish==='earth' ? .48 : finish==='pavers' ? 1 : .25);
      for(const [mat,data] of aprons)yield* surface(data,mat,.001,mat===material.earth ? .48 : mat===material.pavers ? 1 : .25);
      yield* surface(yellow,yellowPaint,.026,1);yield* surface(white,whitePaint,.026,1);
      yield* walks.buildSteps(roadGroup,surface,material.pavers,curbStone);const pavementLift=walks.liftAt;
      const lightScenery=small&&graphics.profile.id==='low';
      const grass=lightScenery?sparseGrass:grassClump;
      if(graph)yield* scatterVergeGrass(segments,Math.min(lightScenery?155:320,detailRadius),
        (x,z)=>environment.sample(graph,cx+x,cz+z).cover,
        (x,z,r)=>!walks.liftAt(x,z)&&!seaOpening?.(x,z)&&!farms.parcelAt(cx+x,cz+z)&&!blocked(x,z,r),
        (cover,x,z,size,angle)=>{
          if(cover===30){instance('vergeGrass',grass,x,-.18,z,size,size,size,angle);return;}
          const h=size*(cover===10?.95:.64),w=h*1.9;
          for(const turn of [0,Math.PI*.5])instance('fern',unitPlane,x,h*.49-.17,z,w,h,1,angle+turn);
        });
      if(wires.length){
        for(let i=0;i<wires.length;i+=3)wires[i+1]+=localGround(wires[i],wires[i+2]);
        const lines=new T.BufferGeometry();lines.setAttribute('position',new T.Float32BufferAttribute(wires,3));
        roadGroup.add(new T.LineSegments(lines,wireMaterial));
      }
      for(const b of batches.values()){
        if((++work & 15)===0)yield;
        const m=new T.InstancedMesh(b.geo,material[b.mat],b.poses.length);
        for(const [index,o] of b.moving)o.parts.push({index,mesh:m,rest:b.poses[index]});
        const tinted=b.colors.some(c=>c!==null);
        b.poses.forEach((pose,i)=>{m.setMatrixAt(i,pose);if(tinted)m.setColorAt(i,tone.set(b.colors[i]??0xffffff));});
        if(b.tree){
          // All levels share instance slots (including collision animation) and culling bounds.
          m.boundingSphere=b.tree.bounds.getBoundingSphere(new T.Sphere());
          m.boundingSphere.radius+=b.tree.radius;
          treeBatches.push({...b.tree,mesh:m,level:1});
        }
        m.castShadow=b.mat!=='vergeGrass';m.receiveShadow=true;roadGroup.add(m);
      }
      function railRoads(ax,az,bx,bz){
        // Roads are indexed with nine metres of padding beyond the pavement.
        if(Math.hypot(bx-ax,bz-az)<=16)return cells.get(nearbyCell((ax+bx)/2,(az+bz)/2))||[];
        const roads=new Set();
        bounds({ax,az,bx,bz},0,key=>{for(const s of cells.get(key)||[])roads.add(s);});
        return roads;
      }
      function roadHeight(s,u){
        if(!s.elevated)return roadway(cx+s.ax+s.fx*u,cz+s.az+s.fz*u);
        const structure=bridges.bridgeInfo(s.source)?bridges:tunnels;
        return structure.height(s.source,s.station+u);
      }
      if(bridges)yield* buildBridgeMeshSteps(T,{...bridges,graph,cx,cz,radius:cutoff,group:roadGroup,material,ground:terrain.ground,registerObstacle,railRoads,roadHeight});
      if(tunnels?.edges.length)buildTunnelMeshes(T,{...tunnels,graph,cx,cz,radius:cutoff,group:roadGroup,material,ground:terrain.ground,registerObstacle});
      const roadGround=drivingSurface(bridges,tunnels,pavementLift,roadway,shoreBed,cx,cz);
      const groundAt=farmDeck||terraceHeight?(x,z,edge)=>farmDeck?.(x-cx,z-cz)??terraceHeight?.(x-cx,z-cz)??roadGround(x,z,edge):roadGround;
      const showPeople=yield* streetLife.prepare(graph,cx,cz,segments,(x,z,r)=>!blocked(x-cx,z-cz,r)&&!contact(x,z,r));
      const signGround=(x,z,e,s)=>graph?.tunnels.info(e)?tunnels.height(e,s):bridges?.bridgeInfo(e)?bridges.height(e,s):groundAt(x,z);
      const showSigns=yield* signs.prepare(graph,edges,cx,cz,(x,z,r)=>!blocked(x-cx,z-cz,r)&&!contact(x,z,r),signGround,registerObstacle);
      // Three otherwise computes these bounds during the first draw of the
      // new district. Warm them while the previous scene is still visible.
      const meshes=[...roadGroup.children,...district.group.children,land],boundPoint=new T.Vector3();
      for(let i=0;i<meshes.length;i++){
        const mesh=meshes[i];
        if(mesh.isInstancedMesh){if(!mesh.boundingSphere)mesh.computeBoundingSphere();}
        else if(mesh.geometry&&!mesh.geometry.boundingSphere){
          const geometry=mesh.geometry,positions=geometry.attributes.position;
          if(positions?.count>4096&&!geometry.morphAttributes.position){
            // A box encloses the same vertices and takes only one interruptible pass.
            const box=new T.Box3();
            for(let j=0;j<positions.count;j++){
              box.expandByPoint(boundPoint.fromBufferAttribute(positions,j));
              if((j&2047)===2047)yield;
            }
            geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new T.Sphere());
          }else geometry.computeBoundingSphere();
        }
        if(mesh.children.length)meshes.push(...mesh.children);
        if((i & 7)===0)yield;
      }
      if(porchPositions.length){
        const g=new T.BufferGeometry();
        g.setAttribute('position',new T.Float32BufferAttribute(porchPositions,3));g.setAttribute('color',new T.Float32BufferAttribute(porchColors,3));
        g.setAttribute('uv',new T.Float32BufferAttribute(porchUv,2));g.setAttribute('roofFinish',new T.Float32BufferAttribute(porchSurface,1));
        g.computeVertexNormals();const mesh=new T.Mesh(g,district.prepareHouseMaterial());mesh.castShadow=true;mesh.receiveShadow=true;
        mesh.name='Roadside house porches';roadGroup.add(mesh);
      }
      district.group.userData.houseCount=district.streetFronts.filter(f=>f.house).length;
      const apronsAtDoors=[];
      for(const f of district.streetFronts){
        if(!f.house||f.gap<.7||f.gap>6||Math.hypot(f.x,f.z)>150)continue;
        const span=Math.min(f.half-f.shoulder,2.4),reach=Math.max(.35,f.gap-.42);
        const point=(u,v)=>{
          const x=f.x+f.ux*u+f.nx*v,z=f.z+f.uz*u+f.nz*v;
          return [x,groundAt(cx+x,cz+z)+.023,z];
        };
        const a=point(-span,.035),b=point(span,.035),c=point(span,reach),d=point(-span,reach);
        if([a,b,c,d].some(p=>Math.abs(p[1]-f.y)>.42)||[c,d].some(p=>district.contact(cx+p[0],cz+p[2],.05)))continue;
        apronsAtDoors.push(...a,...b,...d,...b,...c,...d);
      }
      if(apronsAtDoors.length){
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(apronsAtDoors,3));g.computeVertexNormals();
        const aprons=new T.Mesh(g,material.pavers);aprons.name='Paved house entrances';aprons.receiveShadow=true;roadGroup.add(aprons);
      }
      const districtRunoff=addEaveRunoff(T,roadGroup,district.streetFronts,localGround,eaveMaterial);
      // A parked scooter fits sideways under a wide overhang, wholly on
      // the lot. Leave a full doorway and the entire pavement clear.
      const bays=district.streetFronts.filter(f=>f.house&&f.seed%9===1&&f.inset>=1.5&&f.half-f.shoulder>2.25)
        .sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z)).slice(0,4);
      if(bays.length)loadModel('scooter').then(base=>{
        if(!base||roadGroup.userData.discarded)return;
        const parking=new T.Group();roadGroup.add(parking);roadGroup.userData.parking=parking;
        for(const f of bays){
          const u=f.half-f.shoulder-1.13,v=-.43,x=f.x+u*f.ux+v*f.nx,z=f.z+u*f.uz+v*f.nz;
          const stand=new T.Group();stand.position.set(x,f.y+.17,z);stand.rotation.y=Math.atan2(f.ux,f.uz);
          stand.add(base.clone(true));parking.add(stand);
          registerObstacle({id:'parked:'+f.buildingId,kind:'scooter',x,z,fx:f.ux,fz:f.uz,w:.90,d:.26,baseY:f.y,height:1.13,parts:[]});
        }
      });
      district.group.userData.surveyedFronts=district.streetFronts.filter(f=>f.surveyKind).map(f=>({kind:f.surveyKind,id:f.buildingId}));
      const showLights=yield* mappedLights.prepare(graph,edges,cx,cz,signGround,(x,z)=>cells.get(nearbyCell(x,z))||[],
        (x,z,y,edge)=>!contact(x,z,.45,y,edge));
      const showTunnelCut=yield* tunnelCut.prepare(graph,tunnels,cx,cz,streamed?renderer:null);
      if(streamed&&driveWarmed){
        const pending=new T.Group(),owner=job;
        pending.children.push(roadGroup,district.group,land,...(landmarks?.active||[]).map(site=>site.mesh));
        if(showSigns.group)pending.children.push(showSigns.group);
        yield* uploadDistrictGeometry(pending,land);
        yield {ready:warmMaterials(pending,()=>job!==owner,true).catch(error=>console.warn('District shader preparation',error))};
      }
      yield;
      // Publish geometry and its complete contact index in the same frame.
      activate({land,district,grounds,landmarks,roadGroup,shorePatch,formationMesh,groundAt,bridges,tunnels,roadFormation:formation,obstacleCells,waterAt,
        nearestWaterBlock,sceneGraph:graph,originX:cx,originZ:cz,treeBatches,streetBulbs,runoff:districtRunoff});
      committed=true;districtRadius=cutoff;nextLightCheck=0;asphaltOrigin.set(cx,cz);landOrigin.set(gx,gz);

      landscapeSource.setWaterDistrict(cx,cz,cutoff);
      if(graph)atmosphere.setLocation(...graph.geo(cx,cz));
      landscapeSource.activate(landscapes);relief.activate(terrain,cx,cz);showTunnelCut();showCover();farms.activate();
      showWaterField?.();
      // Local plane UV runs towards -Z. Synchronize the three PBR maps at a rebase.
      for(const [mat,tile] of [[meadow,3.1],[upland,14.2]]){
        surfaces.transform(mat,landWidth/tile,landWidth/tile,(gx/tile)%1,(-gz/tile)%1);
      }
      showPeople();showSigns();showLights();
      breakfast.place(graph,cx,cz,segments,(x,z,r)=>!grounds.memorialAt(x+cx,z+cz)&&!blocked(x,z,r)&&!contact(x+cx,z+cz,r),driveGround);
      centralStreetscapes?.place(graph,cx,cz,segments,(x,z,r)=>!blocked(x,z,r)&&!contact(x+cx,z+cz,r),driveGround,district.streetFronts,streetLife.places,graphics.profile.id==='low');
      roadsideImpact.rebase(cx,cz,obstacles);
      shadowStamp=-1000;
      }finally{
        if(!committed){formationMesh?.dispose();shorePatch?.dispose();discardRoads(roadGroup);district.clear(releaseGeometry);signs.cancel();landmarkSource?.trim();}
      }
    }
    let contourWorker=null,workerDisabled=false,contourSerial=0,waiting=null;
    const requests=new Map();
    function requestSidewalkRings(segments){
      if(!contourWorker&&!workerDisabled){
        try{
          contourWorker=new Worker('sidewalk-worker.js');
          contourWorker.onmessage=({data})=>{
            const finish=requests.get(data.id);
            if(finish){requests.delete(data.id);finish(data.rings);}
          };
          contourWorker.onerror=()=>{
            workerDisabled=true;contourWorker.terminate();contourWorker=null;
            for(const finish of requests.values())finish();requests.clear();
          };
        }catch{workerDisabled=true;}
      }
      const task={};
      if(contourWorker){
        const id=++contourSerial,rows=new Float64Array(segments.size*7);
        let i=0;
        for(const s of segments)for(const v of [s.ax,s.az,s.bx,s.bz,s.w,s.nx,s.nz])rows[i++]=v;
        task.ready=new Promise(resolve=>requests.set(id,rings=>{task.rings=rings;resolve();}));
        try{contourWorker.postMessage({id,rows},[rows.buffer]);}
        catch{requests.get(id)();requests.delete(id);}
      }
      return task;
    }
    function cancelRoads(){
      waiting=null;
      if(job){job.return();job=null;}
    }
    function beginRoads(edges,cx,cz,water=[],graph=null,streamed=false){
      cancelRoads();
      spare??=makeSpare();
      job=buildRoads(spare,edges,cx,cz,water,graph,streamed);
    }
    function advanceRoads(budget=5){
      if(!job)return true;
      const end=performance.now()+budget;
      if(waiting)return false;
      do{
        const step=job.next();
        if(step.done){job=null;return true;}
        if(step.value?.ready){
          const task=waiting=step.value;
          task.ready.then(()=>{if(waiting===task)waiting=null;});
          return false;
        }
      }while(performance.now()<end);
      return false;
    }
    function setRoads(edges,cx,cz,water=[],graph=null){
      beginRoads(edges,cx,cz,water,graph);
      advanceRoads(Infinity);
    }
    async function loadRoads(edges,cx,cz,water=[],graph=null){
      beginRoads(edges,cx,cz,water,graph,true);
      const mine=job;
      // These same desktop assets are required by prepareShaders at departure.
      // Fetch them during the first road build so the launch waits only once.
      if(!small&&!warmedTrafficProfiles.has(graphics.profile.id)){
        for(const kind of Object.keys(trafficModels))loadModel(kind);
        streetLife.preloadWardrobe();
      }
      while(job===mine){
        if(advanceRoads(12))return true;
        if(waiting)await waiting.ready;
        else if(globalThis.scheduler?.yield)await scheduler.yield();
        else await new Promise(resolve=>setTimeout(resolve,0));
      }
      return false;
    }
    function queueRoads(edges,cx,cz,water=[],graph=null){
      beginRoads(edges,cx,cz,water,graph,true);
      const mine=job;
      const schedule=()=>{
        if(job!==mine||document.hidden)return;
        if(globalThis.requestIdleCallback)requestIdleCallback(pump,{timeout:48});
        else if(globalThis.scheduler?.postTask)scheduler.postTask(pump,{priority:'background'});
        else setTimeout(pump,0);
      };
      function pump(idle){
        if(job!==mine||document.hidden)return;
        const budget=idle?Math.min(6,Math.max(idle.didTimeout?1:0,idle.timeRemaining()-1)):3;
        if(budget>0&&advanceRoads(budget))return;
        if(waiting)waiting.ready.then(schedule);
        else schedule();
      }
      schedule();
    }
    const trafficModels={
      sedan:{asset:'traffic/hatchback.glb',length:3.95},van:{asset:'traffic/kei-van.glb',length:4.05},
      scooter:{asset:'traffic/motor-scooter.glb',length:1.84},taxi:{asset:'streetscape/city-taxi.glb',length:4.52},rival:worldGarage.gt
    };
    const cache=new Map(),colors=[0x446370,0x9f553e,0x9aaba9,0x384c67,0xa7a39c,0x99864e];
    const contactTexture=document.createElement('canvas');contactTexture.width=contactTexture.height=64;
    const ctx=contactTexture.getContext('2d'),grad=ctx.createRadialGradient(32,32,9,32,32,31);
    grad.addColorStop(0,'rgba(10,13,15,.75)');grad.addColorStop(1,'rgba(10,13,15,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
    const contactMat=new T.MeshBasicMaterial({map:new T.CanvasTexture(contactTexture),transparent:true,depthWrite:false});
    const trafficBody=new T.MeshLambertMaterial();
    const fallbackMats=colors.map(c=>new T.MeshStandardMaterial({color:c,metalness:.5,roughness:.28}));
    const tires=basic(0x212323),windows=new T.MeshStandardMaterial({color:0x35494e,metalness:.48,roughness:.17}),lamps=new T.MeshBasicMaterial({color:0xa83227});
    function loadModel(kind){
      if(cache.has(kind))return cache.get(kind);
      const spec=worldGarage[kind]||trafficModels[kind];
      let request;
      if(kind==='motorcycle'){
        request=TrafficModels.load.loadAsync(spec.asset).then(gltf=>gltf.scene,()=>null)
          .then(body=>WorldSpecialVehicles.buildModel(T,kind,body));
      }else if(spec.license)request=Promise.resolve(WorldSpecialVehicles.buildModel(T,kind));
      else if(kind==='family-sedan')request=loadWorldFamilySedan(T,spec.asset);
      else request=TrafficModels.load.loadAsync(spec.asset).then(gltf=>gltf.scene);
      cache.set(kind,request.then(model=>{
        // The motorcycle and its rider use metres measured from the midpoint of the axles.
        if(kind!=='motorcycle'){
          const b=new T.Box3().setFromObject(model,true),center=b.getCenter(new T.Vector3()),scale=spec.length/(b.max.z-b.min.z);
          model.scale.multiplyScalar(scale);model.position.set(-center.x*scale,-b.min.y*scale,-center.z*scale);
        }
        model.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
        return model;
      }).catch(()=>{cache.delete(kind);return null;}));return cache.get(kind);
    }
    // Pooled vehicles and the hidden level of detail have no visible descendants.
    class VehicleGroup extends T.Group {
      updateMatrixWorld(force){if(this.visible)super.updateMatrixWorld(force);}
    }
    function makeVehicle(kind,idx,player=false){
      const root=new VehicleGroup(),outside=new VehicleGroup(),low=new VehicleGroup();root.add(outside);outside.add(low);scene.add(root);
      const spec=player?worldGarage[kind]:trafficModels[kind];
      const len=spec.length,wide=spec.width??(kind==='scooter'?.55:1.8),high=spec.height??(kind==='van'?1.65:1.18);
      const shadow=new T.Mesh(unitPlane,contactMat);shadow.rotation.x=-Math.PI/2;shadow.position.y=.013;shadow.scale.set(wide*1.75,len*1.32,1);root.add(shadow);
      const paint=fallbackMats[idx%colors.length];
      function block(x,y,z,w,h,l,m){
        const mesh=new T.Mesh(unitBox,m);mesh.position.set(x,y,z);mesh.scale.set(w,h,l);low.add(mesh);
      }
      if(kind==='scooter'||kind==='motorcycle'){
        for(const z of [-.59,.59]){
          const wheel=new T.Mesh(unitPole,tires);wheel.rotation.z=Math.PI/2;wheel.scale.set(.52,.16,.52);wheel.position.set(0,.26,z);low.add(wheel);
        }
        block(0,.46,-.26,.43,.42,.83,paint);block(0,.74,-.28,.39,.12,.63,tires);
        block(0,.4,.13,.36,.1,.7,paint);block(0,.69,.5,.32,.54,.18,paint);block(0,1.06,.20,.58,.06,.09,tires);
      }else{
      block(0,high*.38,0,wide,high*.42,len*.97,paint);block(0,high*.69,-len*.055,wide*.87,high*.43,len*.56,windows);
      block(0,high*.92,-len*.08,wide*.84,.07,len*.49,paint);
      for(const s of [-1,1]){
        block(s*wide*.34,high*.48,-len*.485,wide*.22,.1,.05,lamps);
        for(const side of [-1,1])block(s*wide*.47,.29,side*len*.31,.16,.38,.54,tires);
      }
      }
      if(!player){
        const groups=new Map();
        for(const panel of low.children){
          if(panel.geometry!==unitBox)continue;
          const mat=small?trafficBody:panel.material;
          if(!groups.has(mat))groups.set(mat,[]);
          groups.get(mat).push(panel);
        }
        for(const [mat,panels] of groups){
          if(panels.length===1)continue;
          const body=new T.InstancedMesh(unitBox,mat,panels.length);
          panels.forEach((panel,i)=>{
            panel.updateMatrix();body.setMatrixAt(i,panel.matrix);
            if(small)body.setColorAt(i,panel.material.color);
            low.remove(panel);
          });
          low.add(body);
        }
      }
      const item={root,outside,low,shadow,axleShadows:[],kind,idx,wheels:[],front:[],light:null,detail:null,loading:false};
      if(kind==='scooter'&&!player)item.rider=createTrafficScooterRider(T,outside);
      item.request=()=>{
        if(item.loading)return;item.loading=true;
        item.ready=loadModel(kind).then(async base=>{
          if(!base){item.modelReady=true;return;}
          const model=base.clone(true),tints=new Map();
          model.traverse(n=>{
            if(!n.isMesh)return;
            const src=n.material;
            if(!src||Array.isArray(src))return;
            if(/^(paint|paint_body)$/.test(src.name)){
              if(!tints.has(src)){
                const m=src.clone();
                if(player)m.color.setHex(spec.paint);
                else if(kind==='rival')m.color.setHex(0x3a7790);
                else if(kind!=='taxi')m.color.setHex(colors[idx%colors.length]);
                tints.set(src,m);
              }n.material=tints.get(src);
            }else if(player&&src.name==='glass'){
              if(!tints.has(src))tints.set(src,src.clone());
              n.material=tints.get(src);
            }else if(src.name==='light_rear'){
              if(!item.light){item.light=src.clone();item.light.emissive.setHex(0xff210b);}
              n.material=item.light;
            }
            atmosphere.registerFinish(n.material);
          });
          if(player)for(const m of tints.values())localLight.coat(m);
          item.wheels=['FL','FR','RL','RR','F','R'].map(id=>({n:model.getObjectByName('wheel_'+id),id})).filter(i=>i.n);
          item.front=['FL','FR','F'].map(id=>model.getObjectByName('steer_'+id)).filter(Boolean);
          if(kind==='motorcycle'){
            item.helmet=model.getObjectByName('rider_helmet');
            item.gripPivot=model.worldToLocal(item.front[0].getWorldPosition(new T.Vector3()));
          }
          const detail=new VehicleGroup();detail.add(model);
          const stand=kind==='scooter'&&model.getObjectByName('kickstand');if(stand)stand.visible=false;
          outside.add(detail);detail.visible=false;
          for(const {n} of item.wheels){
            const axle=outside.worldToLocal(n.getWorldPosition(new T.Vector3()));
            const patch=new T.Mesh(unitPlane,contactMat);patch.rotation.x=-Math.PI/2;
            patch.position.set(axle.x,.014,axle.z);patch.scale.set(kind==='scooter'?.24:.48,.62,1);root.add(patch);item.axleShadows.push(patch);
          }
          await prepareActor(kind,detail);
          item.detail=detail;item.modelReady=true;
        });
      };
      return item;
    }
    const playerRig=new T.Group();scene.add(playerRig);
    // A single unshadowed beam lights the actual road, kerbs and traffic ahead.
    const headlight=new T.SpotLight(0xffeccd,0,82,.49,.58,2);
    headlight.position.set(0,.73,-2.27);headlight.target.position.set(0,.08,-23);
    playerRig.add(headlight,headlight.target);
    let cabin;
    const cabins=new Map();
    function refreshMap(){cabin?.refreshMap?.();}
    const mapRay=new T.Raycaster(),mapPointer=new T.Vector2();
    function hitDashboardMap(clientX,clientY){
      if(!cabin?.mapScreen)return false;
      const rect=canvas.getBoundingClientRect();
      mapPointer.set((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2);
      mapRay.setFromCamera(mapPointer,camera);
      return mapRay.intersectObject(cabin.mapScreen,false).length>0;
    }
    const mirrorRotation=new T.Quaternion(),eye=new T.Vector3(),look=new T.Vector3(),mirrorAdapter={
      getRenderTarget:()=>renderer.getRenderTarget(),
      setRenderTarget:t=>renderer.setRenderTarget(t),
      render(s,c){
        c.position.z-=2.13;c.position.applyQuaternion(mirrorRotation).add(playerRig.position);
        c.quaternion.premultiply(mirrorRotation);renderer.render(s,c);
      }
    };
    let player=null,version=0;
    const players=new Map(),trafficItems=new Map(),pools=new Map();
    function pose(item,car,dt,near){
      const pitch=Math.atan(driveGrade(car.x,car.z,car.yaw,car.edge)),bank=Math.atan(driveGrade(car.x,car.z,car.yaw+Math.PI/2,car.edge));
      item.root.position.set(car.x-originX,(car.flood?.y??car.wading?.bed??driveGround(car.x,car.z,car.edge))+.011,car.z-originZ);
      item.root.rotation.set(car.flood?car.flood.pitch:-pitch,Math.PI-car.yaw,car.flood?0:-bank,'YXZ');
      if(near)item.request();
      const detailed=near&&!!item.detail;item.low.visible=!detailed;
      if(item.detail)item.detail.visible=detailed;
      for(const patch of item.axleShadows)patch.visible=detailed&&!car.flood&&!(car.recoil?.y>.06);
      if(item.rider){
        item.rider.update(car,dt,{rain:weather.rainfall,look:car.turnLook,detail:near});
      }
      if(detailed){
        item.wheels.forEach(({n,id})=>n.rotateX((id.endsWith('R')&&id.length===2?-1:1)*car.speed*dt/(car.spec?.wheelRadius??.33)));
        for(const steer of item.front)steer.rotation.y=-(car.steer||0)*.34;
        if(item.helmet){
          item.helmet.rotation.y=-(car.steer||0)*.19;
          steerMotorcycleRider(item.detail.children[0],item.front[0].rotation.y,item.gripPivot.x,item.gripPivot.z);
        }
        if(item.light)item.light.emissiveIntensity=car.brake||car.showroom&&car.opening||car.recoil?.braking?4.2:.55+atmosphere.lamps.value*1.15;
        updateBodywork(T,item.detail,car.dent,car.yaw);
      }
    }
    const driveFx=createDrivingFX(T,scene,renderer);
    const lookAxis=new T.Vector3(0,1,0),headTurn=new T.Euler(0,0,0,'YXZ');
    const reducedCameraMotion=matchMedia('(prefers-reduced-motion: reduce)');
    let chaseYaw=null,chaseBack=0,anchorX=0,anchorZ=0;
    function followVehicle(car,dt){
      // eye and look are still in vehicle space. Only the trailing view gets inertia.
      const speedRatio=T.MathUtils.smoothstep(Math.abs(car.speed||0),0,36);
      const targetBack=3.4*speedRatio;
      if(chaseYaw===null||Math.hypot(car.x-anchorX,car.z-anchorZ)>20){
        chaseYaw=car.yaw;chaseBack=targetBack;anchorX=car.x;anchorZ=car.z;
      }
      chaseBack+=(targetBack-chaseBack)*(1-Math.exp(-dt*(targetBack<chaseBack?3.4:2.2)));
      eye.z+=chaseBack;eye.y+=chaseBack*.10;

      // Follow the short arc across +/-pi and catch up faster through tight bends.
      const turn=car.yaw-chaseYaw,error=Math.atan2(Math.sin(turn),Math.cos(turn));
      const rate=2.6+3*T.MathUtils.smoothstep(Math.abs(error),.12,.48);
      const lag=T.MathUtils.clamp(error*Math.exp(-rate*dt),-.36,.36);
      chaseYaw=car.yaw-lag;

      // Follow forward travel immediately. Across the road, let the vehicle move
      // within the middle 18% of the view, accounting for narrow phone screens.
      const rightX=Math.cos(chaseYaw),rightZ=Math.sin(chaseYaw);
      const lateral=(car.x-anchorX)*rightX+(car.z-anchorZ)*rightZ;
      const halfWidth=eye.z*Math.tan(camera.fov*Math.PI/360)*camera.aspect;
      const limit=Math.min(1.15,halfWidth*.18);
      // The motorcycle's over-the-shoulder view already uses part of that space.
      const viewCenter=T.MathUtils.lerp(eye.x,look.x,eye.z/(eye.z-look.z));
      const offset=T.MathUtils.clamp(lateral*Math.exp(-2.3*dt),viewCenter-limit,viewCenter+limit);
      anchorX=car.x-rightX*offset;anchorZ=car.z-rightZ*offset;
      eye.x-=offset;look.x-=offset;
      eye.applyAxisAngle(lookAxis,lag);look.applyAxisAngle(lookAxis,lag);
    }
    function render(car,traffic,dt,inside=false,now=performance.now(),prepareOnly=false){
      caveOpenings.update(car.sightView?.monument,originX,originZ);
      foliageEye.set(car.x-originX,car.z-originZ,car.sightView?0:1);
      if(!car||!Number.isFinite(car.x)||!Number.isFinite(car.z))return;
      if(car.sightView||car.flood)inside=false;
      graphics.frame(now,car.driving);dt=Math.max(0,Math.min(.12,dt||0));version++;
      waterSurface.update(now*.001,weather.rainfall);
      mappedLights.update(now*.001);
      window.CoastalRouteScenery?.blink(material.beacon,now*.001);
      const x=car.x-originX,z=car.z-originZ;
      streetLife.render(dt,car.sightView?.x??car.x,car.sightView?.z??car.z,driveGround);
      const wake=car.flood?Math.exp(-car.flood.age*.36):car.wading?Math.min(1,Math.abs(car.speed)*.11):0;
      waterSurface.setWake(x,z,car.yaw+(car.speed<0?Math.PI:0),wake,car.flood?.age||0);
      const kind=car.model;
      if(!player||player.kind!==kind){
        chaseYaw=null;
        cabin?.update(false,0,0);
        cabin=cabins.get(car.spec.license?kind:'car');
        if(kind==='motorcycle')headlight.position.set(0,.85,-.65);
        else headlight.position.set(0,.73,-2.27);
        if(player)player.root.visible=false;
        if(!players.has(kind))players.set(kind,makeVehicle(kind,0,true));
        player=players.get(kind);
        if(player.modelReady&&!player.detail)player.loading=false;
        player.request();player.root.visible=true;
      }
      pose(player,car,dt,true);player.root.visible=!car.sightView;player.outside.visible=!inside;
      driveFx.mountExhaust(player.detail?.children[0],kind);
      player.shadow.visible=!car.flood;for(const shadow of player.axleShadows)shadow.visible=!car.flood&&!inside;
      const bump=reducedCameraMotion.matches?0:car.jointPitch||0;
      player.outside.rotation.set(-(car.pitch||0)-bump,0,-(car.roll||0));
      car.y=player.root.position.y-.011;playerRig.position.copy(player.root.position);
      playerRig.position.y+=(car.spec.seatLift??0)+(reducedCameraMotion.matches?0:car.jointHeave||0);
      playerRig.rotation.set(-player.root.rotation.x+bump,-car.yaw,-player.root.rotation.z,'YXZ');
      mirrorRotation.copy(playerRig.quaternion);
      if(inside&&!cabin){
        cabin=car.spec.license?WorldSpecialVehicles.buildCabin(T,playerRig,kind,kind==='motorcycle'?loadModel(kind):null):window.buildDriverCabin(T,playerRig,document.getElementById('map'));
        cabins.set(car.spec.license?kind:'car',cabin);
      }
      cabin?.update(inside,(car.speed||0)*3.6,(car.steer||0)+(car.jointSteer||0));
      const visibleTraffic=car.sightView?.data.memorialVisit?[]:traffic||[];
      const lightTraffic=small&&graphics.profile.id==='low';
      const trafficRange=lightTraffic?220:360,detailRange=lightTraffic?70:140;
      const closest=visibleTraffic.map(a=>({a,d:(a.x-car.x)**2+(a.z-car.z)**2})).filter(v=>v.d<trafficRange**2).sort((a,b)=>a.d-b.d);
      for(const [index,{a,d}] of closest.entries()){
        const kind=Object.hasOwn(trafficModels,a.kind)?a.kind:'sedan';
        let item=trafficItems.get(a.id);
        if(item&&item.kind!==kind){trafficItems.delete(a.id);item.root.visible=false;(pools.get(item.kind)||pools.set(item.kind,[]).get(item.kind)).push(item);item=null;}
        if(!item){item=pools.get(kind)?.pop()||makeVehicle(kind,Math.abs(Number(a.id)||index));trafficItems.set(a.id,item);}
        item.tick=version;item.root.visible=true;
        const recoil=a.flood?null:a.recoil;
        item.outside.position.y=(recoil?.y||0)+(recoil?.fallen ? .25*Math.abs(Math.sin(recoil.roll)) : 0);
        item.outside.rotation.set(-(recoil?.pitch||0),0,-(recoil?.roll||0));
        for(const shadow of item.axleShadows)shadow.visible=!a.flood&&!recoil?.fallen;
        item.shadow.visible=!a.flood&&(recoil?.y||0)<3.2;
        // Keep nearby riders legible without loading every scooter on a busy street.
        pose(item,a,dt,(index<graphics.profile.cars||kind==='scooter'&&d<35*35||!!recoil)&&d<detailRange**2);
      }
      for(const [id,item] of trafficItems)if(item.tick!==version){
        trafficItems.delete(id);item.root.visible=false;
        if(!pools.has(item.kind))pools.set(item.kind,[]);pools.get(item.kind).push(item);
      }
      const sin=Math.sin(car.yaw),cos=Math.cos(car.yaw),speed=Math.abs(car.speed||0);
      sun.target.position.set(Math.round(x+sin*17),car.y,Math.round(z-cos*17));
      if(now-shadowStamp>graphics.profile.shadowMs){renderer.shadowMap.needsUpdate=true;shadowStamp=now;}
      const viewpoint=car.sightView||car;
      land.material=car.region==='highlands'?upland:meadow;relief.update(viewpoint.x,viewpoint.z);
      const chase=!inside&&!car.showroom&&!car.sightView&&!car.flood&&!car.openingPose&&!reducedCameraMotion.matches;
      const backFromSpeed=chase?0:speed*.018,steerShift=chase?0:(car.steer||0);
      if(car.showroom&&!inside&&!car.opening){
        const portrait=camera.aspect<.85;
        eye.set(portrait?-5.6:-4.3,portrait?1.9:1.6,portrait?8.0:5.5);
        look.set(portrait?0:-1.38,.72,-.38);
      }else if(inside&&cabin.seatView){
        cabin.seatView(eye,look,camera.aspect);
      }else if(inside){
        const inset=cabin.seatInset(camera.aspect),seatX=-.31+inset*.72;
        eye.set(seatX,1.1,.58+inset*2.35);look.set(seatX,.46,-13);
      }else if(kind==='box-truck'){
        eye.set(0,4.35,(camera.aspect<.85?12.5:10.5)+backFromSpeed);look.set(0,1.35,-7);
      }else if(kind==='motorcycle'){
        eye.set(-.35-steerShift*.20,1.83+speed*.006,(camera.aspect<.85?5.75:4.85)+backFromSpeed);
        look.set(0,.92,-8);
      }else{
        const back=(camera.aspect<.85?7.55:6.35)+backFromSpeed;
        eye.set(-steerShift*.32,2.08+speed*.007,back);look.set(0,.9,-10);
      }
      if(chase)followVehicle(car,dt);
      else chaseYaw=null;
      if(car.openingPose&&!inside&&!car.sightView&&kind!=='box-truck'){
        const p=car.openingPose,portrait=camera.aspect<.85;
        eye.x+=(3.2-eye.x)*p;eye.y+=(1.22-eye.y)*p;eye.z+=((portrait?9.5:6.2)-eye.z)*p;
        look.x+=((portrait?-1.55:-2.7)-look.x)*p;look.y+=(1.12-look.y)*p;look.z+=(-3.1-look.z)*p;
      }
      if(car.driving && car.look && (car.look.yaw || car.look.pitch)){
        // Turn around the seat in the cabin, or around the car in chase view.
        look.sub(eye).applyEuler(headTurn.set(car.look.pitch,-car.look.yaw,0,'YXZ'));
        if(!inside)eye.applyAxisAngle(lookAxis,-car.look.yaw);
        look.add(eye);
      }
      eye.applyQuaternion(mirrorRotation).add(playerRig.position);look.applyQuaternion(mirrorRotation).add(playerRig.position);
      if(car.showroom&&car.departureView&&!inside){
        const v=car.departureView,offset=v.offset||0;
        const px=v.x+Math.sin(v.yaw)*offset,pz=v.z+Math.cos(v.yaw)*offset;
        const ground=(modeledBridgeLengths[car.tourStopId]?bridges?.signatureHeight(v.x,v.z):null)??relief.ground(v.x,v.z),radius=v.radius/Math.min(1,camera.aspect*1.32);
        look.set(px-originX,ground+v.focus,pz-originZ);
        eye.set(look.x+Math.sin(v.angle)*radius,ground+v.eye,look.z+Math.cos(v.angle)*radius);
        eye.y=Math.max(eye.y,relief.ground(eye.x+originX,eye.z+originZ)+1.5);
        sun.target.position.copy(look);
      }else if(car.showroom&&car.tourStop&&!car.opening){
        const stop=landmarks.nearest(car.x,car.z);
        if(stop&&stop.distance>3){
          const dx=(stop.x-car.x)/stop.distance,dz=(stop.z-car.z)/stop.distance;
          eye.set(x-dx*7+dz*1.5,car.y+2.15,z-dz*7-dx*1.5);
          look.set(x+dx*15,car.y+2.7,z+dz*15);
        }
      }
      if(car.edge&&sceneGraph?.tunnels.info(car.edge)?.bore&&!car.sightView&&!inside){
        // Keep the chase camera in the driver's bore on bends and at the mouth.
        const road=sceneGraph.nearest(eye.x+originX,eye.z+originZ,[car.edge]),p=sceneGraph.sample(road);
        const q=tunnels.section(car.edge),dx=eye.x+originX-p.x,dz=eye.z+originZ-p.z;
        const across=dx*Math.cos(p.yaw)+dz*Math.sin(p.yaw);
        const safe=Math.max(.25,q.roadHalfWidth-.4),correction=Math.max(-safe,Math.min(safe,across))-across;
        eye.x+=Math.cos(p.yaw)*correction;eye.z+=Math.sin(p.yaw)*correction;
        const floor=tunnels.height(car.edge,road.s);
        eye.y=Math.max(floor+.5,Math.min(floor+q.spring-.25,eye.y));
      }
      if(car.flood){eye.y=Math.max(eye.y,car.flood.level+2.2);look.set(x,car.flood.level-.25,z);}
      camera.position.copy(eye);camera.lookAt(look);
      if(inside&&kind==='motorcycle'&&!car.sightView)camera.rotateZ((car.roll||0)*.40);
      const viewport=car.sightView?.viewport;
      const tourAspect=viewport?viewport.width/viewport.visibleHeight:camera.aspect;
      if(car.sightView){
        const v=car.sightView,angle=v.angle-v.data.yaw;
        const span=Math.abs(Math.cos(angle))*v.data.width+Math.abs(Math.sin(angle))*v.data.depth;
        const front=Math.abs(Math.sin(angle))*v.data.width+Math.abs(Math.cos(angle))*v.data.depth;
        const radius=(v.data.viewRadius??(Math.max(span/Math.max(.35,tourAspect),v.height)*1.10+front*.40))*v.zoom;
        const monumentDatum=v.data.caveOpening||v.data.viewBase==='monument';
        const base=(monumentDatum?v.monument.base:null)??(modeledBridgeLengths[v.data.id]?bridges?.signatureHeight(v.x,v.z):null)??relief.ground(v.x,v.z);
        const focus=v.data.focusAltitude??(base+v.height*.46);
        look.set(v.x-originX,focus,v.z-originZ);
        camera.position.set(look.x+Math.sin(v.angle)*radius*Math.cos(v.elevation),focus+radius*Math.sin(v.elevation),
          look.z+Math.cos(v.angle)*radius*Math.cos(v.elevation));
        const floor=caveOpenings.floorAt(camera.position.x,camera.position.z)??relief.ground(camera.position.x+originX,camera.position.z+originZ);
        camera.position.y=Math.max(camera.position.y,floor+2);
        camera.lookAt(look);
        sun.target.position.copy(look);
      }
      // Fit the facade on a narrow screen without backing the eye into a tree.
      const fixedView=car.sightView?.data.viewRadius;
      const tourFov=car.sightView?.data.viewFov??57;
      const seatFov=kind==='motorcycle'?64+T.MathUtils.clamp((.78-camera.aspect)*32,0,10):64;
      const fov=fixedView?T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(tourFov/2))/Math.min(1,tourAspect))):
        (inside?seatFov:car.openingPose?57+Math.min(15,speed*.28)-9*car.openingPose:car.showroom?47:57+Math.min(15,speed*.28))+driveFx.boostFov(car.driving&&car.boost,inside);
      if(Math.abs(fov-camera.fov)>.05){
        camera.fov=car.showroom||car.sightView?.data.views?fov:camera.fov+(fov-camera.fov)*(1-Math.exp(-dt*7));
        camera.updateProjectionMatrix();
      }
      if(viewport){
        const {width,height,top,visibleHeight}=viewport,v=camera.view,scale=height/visibleHeight;
        const frameWidth=width*scale,frameHeight=height*scale;
        if(!v?.enabled||v.fullWidth!==width||v.fullHeight!==height||v.height!==frameHeight||v.offsetY!==-top*scale)
          camera.setViewOffset(width,height,(width-frameWidth)/2,-top*scale,frameWidth,frameHeight);
      }else if(camera.view?.enabled)camera.clearViewOffset();
      if(breakfast.update(car,dt))onBreakfastCall?.();
      atmosphere.setHour(car.sightView?.hour??car.scenicHour);
      const sheltered=!car.sightView&&car.edge&&sceneGraph?.tunnels.info(car.edge)?.bore;
      atmosphere.eclipse.value=sightings.update(dt,car,originX,originZ,camera.aspect,sheltered);
      const frontGlass=inside&&kind!=='motorcycle'?cabin?.interior:null;
      weather.render(camera,now,car.dawn||0,atmosphere.update,sheltered,frontGlass,kind==='box-truck',car.speed);
      material.earth.color.copy(dryEarth).multiplyScalar(1-.49*weather.moisture.soil.value);
      material.farmSoil.color.setScalar(1-.43*weather.moisture.soil.value);
      if(runoff){
        runoff.visible=!sheltered&&weather.moisture.eaves.value>.025;
        eaveMaterial.uniforms.seconds.value=now*.001;
      }
      headlight.intensity=car.flood?0:(sheltered?1:atmosphere.lamps.value)*2600;
      material.glass.emissiveIntensity=atmosphere.lamps.value*.37;
      material.lantern.emissiveIntensity=atmosphere.lamps.value*3.2;
      centralStreetscapes?.update(atmosphere.lamps.value);
      if(now>=nextLightCheck){
        nextLightCheck=now+240;
        const level=atmosphere.lamps.value;
        if(level>.04)streetBulbs.sort((a,b)=>a.distanceToSquared(camera.position)-b.distanceToSquared(camera.position));
        streetLights.forEach((light,i)=>{
          const bulb=streetBulbs[i],distance=bulb?.distanceTo(camera.position)??Infinity;
          // Changing the number of visible lights recompiles every lit material.
          if(level>.04&&i<(graphics.profile.id==='low'?1:3)&&distance<78){
            light.position.copy(bulb);
            light.intensity=230*level*(1-T.MathUtils.smoothstep(distance,48,78));
          }else light.intensity=0;
        });
      }
      updateTreeDetail(camera.position.x,camera.position.z,graphics.profile);
      if(prepareOnly)return warmScene();
      if(car.showroom&&player.modelReady)cabin?.prepare?.(renderer,scene,camera);
      const mirrorUpdated=inside&&cabin&&!waterSurface.capturePending&&
        (cabin.drawMirrors?cabin.drawMirrors(renderer,scene,graphics.profile.mirrorMs,now,player.outside):
          cabin.reflect(mirrorAdapter,scene,cabin.interior,0,0,graphics.profile.mirrorMs,now));
      roadsideImpact.update(dt);driveFx.update(car,dt,originX,originZ,inside,camera,atmosphere.wetness.value);
      landmarkSource?.weather(weather.rainfall);
      const wetBlock=graphics.profile.waterWidth&&nearestWaterBlock(viewpoint.x-originX,viewpoint.z-originZ);
      const waterLevel=wetBlock?shorePatch?.sample(wetBlock.x,wetBlock.z)?.level??null:null;
      const wetRoad=Math.max(weather.moisture.asphalt.value,weather.moisture.pools.value)>.12&&!sheltered&&!car.sightView&&!car.flood;
      const reflectionLevel=waterLevel??(wetRoad?car.y:null);
      if(wetRoad){
        const vehicles=[{a:car},...closest.slice(0,4)].filter(({a})=>!a.flood&&!a.recoil?.fallen&&Math.abs(a.deckLift-car.deckLift)<3);
        localLight.wetLights(vehicles.map(({a})=>({x:a.x-originX,z:a.z-originZ,y:driveGround(a.x,a.z,a.edge),yaw:a.yaw,
          grade:driveGrade(a.x,a.z,a.yaw,a.edge),length:a.spec?.length||trafficModels[a.kind]?.length||4.2,
          width:a.spec?.width||trafficModels[a.kind]?.width||1.7,bike:a.kind==='scooter'||a.model==='motorcycle',brake:a.brake||a.recoil?.braking})),
          weather.moisture.asphalt.value,atmosphere.lamps.value);
      }else localLight.wetLights([],0,0);
      // The cockpit is already hidden in chase view. Keep its headlight in
      // the cube capture so every face uses the precompiled scene lighting.
      const shadowDue=renderer.shadowMap.enabled&&renderer.shadowMap.needsUpdate;
      const autoUpdate=scene.matrixWorldAutoUpdate;
      if(autoUpdate)scene.updateMatrixWorld();
      scene.matrixWorldAutoUpdate=false;
      try{
        const paintUpdated=localLight.reflect(player.root.position,[player.root],now,!inside&&!car.sightView&&graphics.profile.id!=='low',
          shadowDue||waterSurface.capturePending);
        waterSurface.reflect(renderer,scene,camera,reflectionLevel,now,reflectionLevel!==null,graphics.profile,mirrorUpdated||paintUpdated);
        renderer.render(scene,camera);
      }finally{scene.matrixWorldAutoUpdate=autoUpdate;}
      return player.modelReady;
    }
    let driveWarmed=false;
    const warmedTrafficProfiles=new Set();
    const actorPrograms=new Map(),preparedPrograms=new WeakSet(),uploadedTextures=new WeakMap();
    const preparedLayouts=new WeakMap();
    function layoutKey(node){
      const g=node.geometry,attr=g.attributes,morph=g.morphAttributes;
      return [renderer.shadowMap.enabled,!!node.isInstancedMesh,!!node.instanceColor,!!node.isSkinnedMesh,
        attr.color?.itemSize||0,!!attr.tangent,!!attr.uv1,!!attr.uv2,!!attr.uv3,
        morph.position?.length||0,morph.normal?.length||0,morph.color?.length||0].join('|');
    }
    const uploadScene=new T.Scene(),uploadMaterial=new T.MeshBasicMaterial({visible:false});
    const uploadProbe=new T.Mesh(undefined,uploadMaterial),stagedGeometry=new WeakSet(),stagedInstances=new WeakSet();
    const indexProbe=new T.Mesh(undefined,new T.MeshBasicMaterial({colorWrite:false,depthWrite:false}));
    const stagedIndices=new WeakMap();
    indexProbe.frustumCulled=false;
    uploadProbe.frustumCulled=false;uploadScene.matrixWorldAutoUpdate=false;
    function* uploadDistrictGeometry(root,land){
      // Populate Three's attribute cache while preserving screen colour and depth.
      const batch=[];
      let bytes=0;
      function upload(){
        const clear=renderer.autoClear,shadow=renderer.shadowMap.needsUpdate,restore=[];
        try{
          renderer.autoClear=false;renderer.shadowMap.needsUpdate=false;
          for(const node of batch){
            // Three uploads an element buffer on its first draw, even if all
            // vertex attributes were staged. Pay for large terrain indices here.
            const g=node.geometry,index=g.index;
            if(index&&index.array.byteLength>=16384&&stagedIndices.get(index)!==index.version){
              const {start,count}=g.drawRange;
              indexProbe.geometry=g;uploadScene.children=[indexProbe];
              try{
                g.setDrawRange(0,3);renderer.render(uploadScene,camera);
                stagedIndices.set(index,index.version);
              }finally{g.setDrawRange(start,count);indexProbe.geometry=null;}
              if(!node.isInstancedMesh)continue;
            }
            if(node.children.length){
              // A terrain parent can also own visible shore and formation meshes.
              uploadProbe.geometry=node.geometry;uploadScene.children=[uploadProbe];
              renderer.render(uploadScene,camera);
            }else{
              restore.push([node,node.material,node.frustumCulled,node.visible]);
              node.material=uploadMaterial;node.frustumCulled=false;node.visible=true;
            }
          }
          uploadScene.children=restore.map(item=>item[0]);
          if(restore.length)renderer.render(uploadScene,camera);
        }finally{
          for(const [node,mat,culled,visible] of restore){node.material=mat;node.frustumCulled=culled;node.visible=visible;}
          uploadScene.children=[];uploadProbe.geometry=null;
          renderer.autoClear=clear;renderer.shadowMap.needsUpdate=shadow;
        }
        batch.length=0;bytes=0;
      }
      const nodes=[];
      root.traverse(node=>{if(node.geometry?.attributes.position)nodes.push(node);});
      for(const node of nodes){
        const reused=node.geometry.userData.streamedSurface&&reuseGeometry(node);
        const g=node.geometry;
        const geometry=reused||!stagedGeometry.has(g)||node===land;
        const instances=node.isInstancedMesh&&!stagedInstances.has(node);
        if(!geometry&&!instances)continue;
        if(geometry){
          const arrays=new Set(Object.values(g.attributes).map(a=>(a.data||a).array));
          if(g.index)arrays.add(g.index.array);
          for(const array of arrays)bytes+=array.byteLength;
          stagedGeometry.add(g);
        }
        if(instances){
          bytes+=node.instanceMatrix.array.byteLength+(node.instanceColor?.array.byteLength||0);
          stagedInstances.add(node);
        }
        batch.push(node);
        if(bytes>=768*1024||batch.length>=64){
          upload();
          // A fast CPU can otherwise queue a whole district on the GPU in one idle callback.
          yield {ready:new Promise(requestAnimationFrame)};
        }
      }
      if(batch.length){upload();yield;}
    }
    async function warmMaterials(object,canceled=()=>false,streamed=false){
      const programs=new Set(),textures=new Set();
      function queueTexture(tex){
        if(tex?.isTexture&&!tex.isRenderTargetTexture&&tex.image&&tex.image.complete!==false&&
          tex.version>0&&uploadedTextures.get(tex)!==tex.version)textures.add(tex);
      }
      function queueUniformTextures(properties){
        // Roofs and entrances use custom atlas uniforms shared between districts.
        // Their images can finish loading after the material's first compilation.
        if(properties.uniforms)for(const uniform of Object.values(properties.uniforms))queueTexture(uniform.value);
      }
      function compile(batch){
        for(const mat of renderer.compile(batch,camera,scene)){
          const properties=renderer.properties.get(mat);
          // A material can have separate screen, reflection and instancing
          // programs. A concurrent draw changes its currentProgram.
          for(const program of properties.programs.values()){
            if(!preparedPrograms.has(program))programs.add(program);
          }
          for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap'])queueTexture(mat[key]);
          queueUniformTextures(properties);
        }
      }
      function compileBatch(batch){
        waterSurface.prepare(renderer,graphics.profile,()=>compile(batch));
        compile(batch);
        batch.traverse(node=>{
          if(!node.geometry||!node.material)return;
          const key=layoutKey(node);
          for(const mat of Array.isArray(node.material)?node.material:[node.material]){
            if(!preparedLayouts.has(mat))preparedLayouts.set(mat,new Set());
            preparedLayouts.get(mat).add(key);
          }
        });
      }
      if(streamed){
        // The same road and building materials recur at every origin. Warm new
        // surfaces in small batches while the driver still sees the previous district.
        const fresh=[],batch=new T.Group(),seen=new Set(),queued=new Map();
        object.traverse(node=>{
          if(!node.material||!node.geometry)return;
          const materials=Array.isArray(node.material)?node.material:[node.material];
          const key=layoutKey(node);
          if(materials.some(mat=>!queued.get(mat)?.has(key)&&
            (!preparedLayouts.get(mat)?.has(key)||!renderer.properties.get(mat).programs?.size))){
            fresh.push(node);
            for(const mat of materials){
              if(!queued.has(mat))queued.set(mat,new Set());
              queued.get(mat).add(key);
            }
          }
          for(const mat of materials)if(!seen.has(mat)){
            seen.add(mat);queueUniformTextures(renderer.properties.get(mat));
          }
        });
        for(let i=0;i<fresh.length&&!canceled();i+=8){
          batch.children=fresh.slice(i,i+8);
          compileBatch(batch);
          if(i+8<fresh.length)await new Promise(resolve=>setTimeout(resolve,0));
        }
      }else compileBatch(object);
      while((programs.size||textures.size)&&!canceled()){
        const end=performance.now()+2;
        for(const program of programs){
          if(!program.program||preparedPrograms.has(program))programs.delete(program);
          else if(program.isReady()){
            program.getUniforms();preparedPrograms.add(program);programs.delete(program);
          }
          if(performance.now()>=end)break;
        }
        for(const tex of textures){
          if(performance.now()>=end)break;
          if(uploadedTextures.get(tex)!==tex.version){renderer.initTexture(tex);uploadedTextures.set(tex,tex.version);}
          textures.delete(tex);
          if(streamed)break;
        }
        if(programs.size||textures.size){
          if(streamed)await new Promise(requestAnimationFrame);
          else await new Promise(resolve=>setTimeout(resolve,8));
        }
      }
    }
    function prepareActor(kind,object){
      if(!driveWarmed)return;
      const key=kind+'|'+graphics.profile.id;
      if(!actorPrograms.has(key))actorPrograms.set(key,warmMaterials(object).catch(()=>actorPrograms.delete(key)));
      return actorPrograms.get(key);
    }
    async function warmScene(){
      const profile=graphics.profile.id,warmRoster=!small&&!warmedTrafficProfiles.has(profile);
      const actors=new Map([[player.kind,player]]);
      for(const item of trafficItems.values()){
        if(small&&!item.loading)continue;
        if(!actors.has(item.kind))actors.set(item.kind,item);
      }
      if(warmRoster)for(const kind of Object.keys(trafficModels)){
        if(actors.has(kind))continue;
        if(!pools.has(kind))pools.set(kind,[]);
        const pool=pools.get(kind),item=pool[0]||makeVehicle(kind,0);
        if(!pool.length){item.root.visible=false;pool.push(item);}
        actors.set(kind,item);
      }
      for(const item of actors.values())item.request();
      const [{walkGroup,templates}]=await Promise.all([streetLife.prepareDeparture(warmRoster),environmentReady,
        ...Array.from(actors.values(),item=>item.ready)]);
      driveFx.mountExhaust(player.detail?.children[0],player.kind);
      // Some drivers specialize a linked program on its first draw. Prime the
      // skinned, vehicle and impact layouts behind the departure screen.
      const actorsToRestore=[],scissor=renderer.getScissor(new T.Vector4()),clipped=renderer.getScissorTest();
      const departureProbes=[];
      try{
        const rider=actors.get('scooter')?.rider;
        if(warmRoster&&rider)templates.add(rider.departureVariants());
        scene.add(templates);
        await warmMaterials(scene);
        // Distant trees can all be billboards at departure. Solid coloured
        // roadside instances also need a different depth program on the first bend.
        {
          const lods=[[treeModels.geometry('tree',true,0),treeModels.material],
            [treeModels.distantGeometry('tree',0),treeModels.billboardMaterial()],
            [unitBox,material.steel]];
          for(const [geometry,mat] of lods)for(const tinted of [false,true]){
            const probe=new T.InstancedMesh(geometry,mat,1);
            if(tinted)probe.setColorAt(0,new T.Color(0xffffff));
            probe.receiveShadow=probe.castShadow=true;probe.frustumCulled=false;
            scene.add(probe);departureProbes.push(probe);
          }
        }
        for(const root of [walkGroup,templates,driveFx.group,...Array.from(actors.values(),item=>item.root)])root.traverse(node=>{
          actorsToRestore.push([node,node.visible,node.frustumCulled]);
          node.visible=true;node.frustumCulled=false;
        });
        renderer.setScissor(0,0,1,1);renderer.setScissorTest(true);
        renderer.shadowMap.needsUpdate=true;
        waterSurface.prepare(renderer,graphics.profile,()=>renderer.render(scene,camera),true);
        renderer.render(scene,camera);
      }finally{
        templates.removeFromParent();templates.clear();
        for(const probe of departureProbes){probe.removeFromParent();probe.dispose();}
        for(const [node,visible,culled] of actorsToRestore){node.visible=visible;node.frustumCulled=culled;}
        renderer.setScissor(scissor);renderer.setScissorTest(clipped);renderer.shadowMap.needsUpdate=true;
      }
      const gl=renderer.getContext(),fence=gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
      if(fence){
        gl.flush();
        try{while(gl.clientWaitSync(fence,0,0)===gl.TIMEOUT_EXPIRED)await new Promise(resolve=>setTimeout(resolve,8));}
        finally{gl.deleteSync(fence);}
      }
      if(warmRoster)warmedTrafficProfiles.add(profile);
      driveWarmed=true;
    }
    function prepareShaders(car,traffic){
      return render(car,traffic,0,false,performance.now(),true);
    }
    function capturePhoto(){
      if(renderer.getContext().isContextLost())throw Error('WebGL context lost');
      // The browser may clear the WebGL buffer after presenting it. Redraw the
      // displayed camera pose without advancing the drive or its sky events.
      renderer.render(scene,camera);
      return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    }
    function projectSummit(){
      const summit=scene.getObjectByName('chua-ngoc-tam-chuc');
      if(!summit?.visible)return null;
      markerPoint.copy(summit.position);
      markerPoint.y+=summit.userData.height;
      markerPoint.project(camera);
      return markerPoint.z>0 && markerPoint.z<1 && Math.abs(markerPoint.x)<.92 && Math.abs(markerPoint.y)<.9 ? markerPoint : null;
    }
    function ambience(car,traffic,cabin){
      if(!sceneGraph)return null;
      if(!car.sightView&&car.edge&&sceneGraph.tunnels.info(car.edge)?.bore)return null;
      const {x,z}=camera.position,right=camera.matrixWorld.elements;
      const wet=nearestWaterBlock(x,z),dx=wet?wet.x-x:0,dz=wet?wet.z-z:0;
      const waterDistance=Math.hypot(dx,dz);
      const wx=x+originX,wz=z+originZ,{cover,population}=environment.sample(sceneGraph,wx,wz);
      let closest=70,pan=0;
      if(!car.sightView)for(const actor of traffic){
        const ax=actor.x-wx,az=actor.z-wz,d=Math.hypot(ax,az);
        if(d>=closest)continue;
        closest=d;pan=(ax*right[0]+az*right[2])/Math.max(1,d);
      }
      const street=closest<40||cover===50||population>1100;
      return {kind:street?'street':'wind',presence:street?.38+.62*(1-closest/70):cover===10?.9:.5,
        pan:street?pan*(1-closest/70):0,rain:weather.rainfall,cabin,
        water:wet?Math.max(0,1-waterDistance/72):0,waterPan:(dx*right[0]+dz*right[2])/Math.max(1,waterDistance)};
    }
    function motorcycleSound(car,traffic){
      const m=camera.matrixWorld.elements;
      return DriveBody.passingBikes(m,originX,originZ,car,traffic.filter(n=>n.kind==='scooter'&&!n.flood&&Math.abs(n.deckLift-car.deckLift)<3));
    }
    return {ambience,motorcycleSound,get districtRadius(){return districtRadius;},get sceneryChanged(){return districtRadius!==graphics.profile.districtRadius;},get mappedFurniture(){return grounds.streetFurniture;},
      get roadsideSurvey(){return roadGroup?.userData.roadsideSurvey;},
      capturePhoto,hitDashboardMap,refreshMap,prepareShaders,projectSummit,weather,streetLife,accessLane:(x,z)=>grounds.accessLane(x,z),loadStructures:structures.load,preloadVehicle:loadModel,waterAt:(x,z,edge)=>{if(edge&&sceneGraph.tunnels.info(edge)?.bore&&tunnels.at(x,z,edge)!=null)return null;const wet=waterAt(x,z),deck=wet&&bridges?.at(x,z,edge);return wet&&deck!=null&&deck>=wet.level?null:wet;},terrainReady:relief.ready,grade:driveGrade,ground:driveGround,setRoads,queueRoads,loadRoads,advanceRoads,cancelRoads,districtDistance:(x,z)=>Math.hypot(x-originX,z-originZ),render,resize:graphics.resize,contact,loadDistrict:async(g,x,z)=>(await Promise.all([buildingSource.load(g,x,z),osmBuildings.load(g,x,z),relief.loadLocal(g,x,z),passGrades.load(g,x,z),landscapeSource.load(g,x,z),groundSource.load(g,x,z),environment.load(g,x,z),amenities.load(g,x,z),farmland.load(g,x,z)])).some(Boolean),splash:(x,z,nx,nz,strength,level)=>driveFx.impact(x,z,nx,nz,strength,'water',level,.3),sightFootprint:(...args)=>district.footprint(...args),footprintViews:(...args)=>district.footprintViews(...args,relief.ground),nearLandmark:(x,z,id)=>landmarks?.nearest(x,z,650,id),reactToContact:roadsideImpact.react,impact:(x,z,nx,nz,s,k,h=0,g,edge)=>driveFx.impact(x,z,nx,nz,s,k,driveGround(x,z,edge)+h,g),scrape:(x,y,z,vx,vz,edge)=>driveFx.scrape(x,driveGround(x,z,edge)+y,z,vx,vz),resetFx(){driveFx.reset();roadsideImpact.reset();sightings.reset();}};
  };
})();
