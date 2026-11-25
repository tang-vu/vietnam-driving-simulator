'use strict';
// Roadside dressing for the featured Hải Phòng coastal drive (ven-bien-hon-dau).
// OSM maps almost nothing beside the Tiên Lãng and Kiến Thụy sea dikes, so the
// trees, houses and lights here are representative, not surveyed:
// - casuarina (phi lao) windbreak rows on the seaward toe of the dikes,
// - pond-guard huts and solar lamps on the landward side of the dikes,
// - village tube houses along the inland stretch to Cầu Văn Úc,
// - promenade lamps and shade trees on the Đồ Sơn shore roads,
// - flashing amber warning lights before junctions with larger roads.
// EDGES row: [signed route edge id, route station m, metres to the OSM
// coastline, nearest coast point lon/lat in 1e-5 degrees from 106.6 / 20.6].
// JUNCTIONS row: [lon, lat, route station m].
(() => {
  const EDGES=[[1088855,28,283,3624,2816],[1088856,253,247,3624,2816],[1088853,455,322,3773,2762],[1038365,609,382,3860,2732],[-963171,769,468,3951,2683],[-1088863,964,620,3860,2731],[-1088862,1151,773,3860,2732],[-1088864,1161,781,3860,2732],[-1088717,1172,791,3857,2733],[1101541,1202,805,3860,2732],[1101540,1232,818,3860,2732],[1016239,1238,820,3860,2732],[1016240,1574,985,3987,2661],[1088859,1909,1121,4530,2430],[1088858,1916,1123,4530,2430],[1088710,1922,1125,4530,2430],[1088711,2080,1136,5454,2477],[1088712,2439,1030,5465,2481],[1088861,2647,990,6070,2663],[1088860,2675,975,6089,2675],[1088708,2716,953,6116,2692],[1088707,2741,940,6133,2703],[1016226,2973,856,6501,3061],[986199,3311,784,6501,3061],[986200,3424,787,6552,3087],[986874,3431,788,6558,3090],[986875,3468,787,6590,3106],[-986202,3961,1240,6590,3106],[-986201,4501,1780,6590,3106],[986878,4593,1858,6590,3106],[986876,4612,1857,6590,3106],[986204,4789,1880,6590,3106],[986205,5158,1982,6590,3106],[986637,5359,2060,6590,3106],[986636,5364,2055,6590,3106],[986435,5373,2048,6590,3106],[986436,5603,1846,6590,3106],[986870,5871,1595,6590,3106],[986871,5942,1564,6590,3106],[986627,6370,1490,8412,4072],[986997,6772,1306,8412,4072],[986990,6780,1298,8412,4072],[986991,6786,1292,8412,4072],[986992,6830,1252,8412,4072],[986979,6942,1175,8412,4072],[986980,7033,1150,8412,4072],[986981,7089,1130,8412,4072],[986982,7184,1112,8412,4072],[986975,7276,1078,8427,4082],[986976,7365,990,8440,4090],[986977,7473,884,8455,4099],[986978,7558,800,8467,4107],[986972,7597,762,8472,4110],[-986004,7605,754,8473,4111],[987100,7642,718,8479,4114],[987101,7740,582,8480,4115],[-986751,8303,606,8889,4375],[-986750,8843,569,9294,4668],[-986749,8976,553,9393,4741],[-986748,9137,522,9595,5503],[-986747,9334,338,9595,5503],[-986746,9584,153,9595,5503],[-986745,9754,25,9573,5645],[-995392,9948,99,9584,5663],[-995391,10186,346,9954,6247],[-995390,10385,168,9959,6247],[-988266,10513,68,9954,6247],[-988265,10554,77,9954,6247],[-988264,10610,100,9954,6247],[-988269,10664,143,9954,6247],[-988268,10723,200,9954,6247],[-988267,10779,252,9954,6247],[-995386,10811,283,9954,6247],[-995385,10907,365,9954,6247],[-995384,11013,469,9954,6247],[-995383,11056,509,9954,6247],[-995382,11084,534,9954,6247],[-995381,11114,561,9954,6247],[-995380,11176,617,9954,6247],[-995379,11297,657,9966,6258],[-995378,11479,769,10205,6549],[-995377,11936,1185,10246,6624],[-995376,12341,1479,10387,7328],[-995375,12398,1515,10387,7328],[-995374,12495,1557,10387,7328],[-995373,12806,1869,10387,7328],[-995372,13389,2204,10400,7355],[-995371,13825,2581,10400,7355],[995315,13909,2663,10400,7355],[995316,13936,2690,10400,7355],[3594436,14350,2652,10400,7355],[-3553176,15491,2754,11013,7798],[3678065,16516,2909,11188,7912],[-1032977,17079,2785,11188,7912],[-1032980,17371,2560,11188,7912],[-554188,17741,2233,11188,7912],[-554187,18172,1966,11188,7912],[554184,18257,1908,11188,7912],[1008720,18354,1843,11188,7912],[1008719,18446,1785,11188,7912],[1008932,18517,1729,11188,7912],[1008933,18603,1660,11188,7912],[1008931,18635,1632,11188,7912],[1007004,18850,1435,11188,7912],[1007321,19067,1242,11188,7912],[1007322,19096,1216,11188,7912],[1007323,19163,1157,11188,7912],[-1007327,19395,1203,11188,7912],[-1007326,19720,1463,11349,7837],[-768187,20184,1459,13635,9568],[-768186,20638,1031,13635,9568],[-768185,20781,876,13635,9568],[-768184,21191,453,13635,9568],[1010652,21598,425,13635,9568],[1010653,21664,480,13635,9568],[1010654,21839,616,13635,9568],[2619432,22218,1042,13635,9568],[2619433,22669,1339,13635,9568],[1066794,22892,1417,15077,10526],[1066795,23161,1365,15077,10526],[1066796,23508,1265,15077,10526],[1066797,23819,1242,15096,10538],[1066798,24026,1197,15096,10538],[3762596,24036,1193,15096,10538],[3762593,24366,1155,15096,10538],[3762594,24816,1333,15096,10538],[3762595,25309,930,16707,11439],[1031795,25698,827,16707,11439],[1031791,25831,789,16708,11439],[3761849,26399,127,16757,11451],[-3554125,27501,18,17227,10864],[-3554124,28167,131,17344,10618],[-3554123,28864,488,17349,10622],[-3554122,29589,215,18443,10005],[3792822,29647,231,18443,10005],[3062812,29679,214,18443,10005],[3062813,29717,196,18468,9981],[3062814,29735,192,18468,9981],[31428,29797,184,18471,9975],[31429,30189,64,18472,9733],[31430,30564,89,18782,9479],[31431,30845,61,18874,9476],[3549558,31093,206,19362,9683],[3745315,31106,205,19362,9683],[3745316,31113,208,19367,9681],[3201158,31577,230,19582,9017],[3745319,32076,34,19246,8684],[3201159,32156,40,19261,8664],[3201160,32265,52,19347,8467],[3201133,32359,45,19362,8453],[3201134,32488,39,19434,8381],[3201132,32621,64,19648,8421],[3555887,32807,26,19836,8345],[3745318,32973,46,19935,8324],[3201152,33295,43,20113,8076],[3201153,33724,47,20403,7836],[3201154,34001,132,20368,7712],[3201155,34614,199,20410,7778]];
  const JUNCTIONS=[[106.65851,20.64633,4581],[106.66507,20.64964,5357],[106.69529,20.65624,9710],[106.68158,20.68597,13957],[106.68691,20.69099,14743],[106.69712,20.70049,16240],[106.70067,20.7042,16793],[106.71172,20.69642,18241],[106.728,20.69409,20766],[106.73759,20.70933,22862],[106.74118,20.71255,23401],[106.76371,20.72061,25941],[106.76805,20.71355,26856],[106.77357,20.70519,28147],[106.78597,20.70165,29637],[106.78617,20.70083,29734],[106.79301,20.6951,31102],[106.79246,20.68727,32037],[106.79376,20.68499,32333],[106.79574,20.68388,32591],[106.79913,20.68291,32963]];
  const routeEdges = new Map(EDGES.map(([id, station, coast, lon, lat]) => [Math.abs(id),
    { dir: Math.sign(id), station, coast, lon: 106.6 + lon / 1e5, lat: 20.6 + lat / 1e5 }]));
  const bounds = [106.62, 20.62, 106.82, 20.73];

  function zoneOf(edge) {
    if (edge.station >= 26500) return 'doson';
    if (edge.station < 12000 || edge.coast < 500) return 'dike';
    return 'village';
  }
  function hash(a, b) {
    let h = Math.imul(a ^ 0x9e3779b9, 2654435761) ^ Math.imul(b + 0x7f4a7c15, 2246822519);
    h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  const WALLS = [0xf1e0b0, 0xe9d6c4, 0xd8e3d2, 0xf2ead8, 0xe6c9a8, 0xcfdde6, 0xf0d8d0];
  const TILE = [0xa4553c, 0x9a4b36, 0xb06446];
  const SHEET = [0x4f7593, 0x8e9a9e, 0x5f8a7a, 0xa25a43];

  // ctx comes from world-scene buildRoads. Coordinates are relative to (cx, cz).
  function* build(ctx) {
    const { T, graph, cx, cz, segments, instance, plantTree, registerObstacle, clear, farm,
      localGround, streetBulbs, unitBox, unitPole, gable, radius, compact } = ctx;
    if (!graph) return;
    const [lon, lat] = graph.geo(cx, cz);
    if (lon < bounds[0] - .02 || lon > bounds[2] + .02 || lat < bounds[1] - .02 || lat > bounds[3] + .02) return;
    const reach = Math.min(radius, compact ? 360 : 520);
    const route = segments.filter(s => s.rank <= reach && routeEdges.has(s.source?.id));
    if (!route.length) return;
    const limits = { tree: compact ? 140 : 320, house: compact ? 26 : 60, lamp: compact ? 16 : 40 };
    const count = { tree: 0, house: 0, lamp: 0, beacon: 0 };
    const taken = [];
    const coastCache = new Map();
    let work = 0;
    function seaSide(s, edge) {
      let p = coastCache.get(s.source.id);
      if (!p) { const q = graph.point(edge.lon, edge.lat); p = { x: q.x - cx, z: q.z - cz }; coastCache.set(s.source.id, p); }
      const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
      return (p.x - mx) * s.nx + (p.z - mz) * s.nz >= 0 ? 1 : -1;
    }
    function spaced(x, z, r) { return !taken.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + r) ** 2); }
    function at(s, d, side, off) { return { x: s.ax + s.fx * d + s.nx * side * off, z: s.az + s.fz * d + s.nz * side * off }; }

    function tree(kind, x, z, h, w, seed) {
      if (count.tree >= limits.tree || !clear(x, z, .6) || !spaced(x, z, .8)) return false;
      const owner = registerObstacle({ id: 'coast-tree:' + Math.round((cx + x) * 10) + ':' + Math.round((cz + z) * 10), kind: 'tree', x, z, radius: .2, height: h, parts: [] });
      plantTree(kind, x, z, h, w, seed * Math.PI * 2, null, owner);
      taken.push({ x, z, r: .8 }); count.tree++;
      return true;
    }
    // Single-arm solar lamps on the dikes and villages; double-arm lamps on the Đồ Sơn promenade.
    function lamp(s, d, side, off, id, double) {
      if (count.lamp >= limits.lamp) return;
      const { x, z } = at(s, d, side, off);
      if (!clear(x, z, .5) || !spaced(x, z, 1)) return;
      const pole = registerObstacle({ id: 'coast-lamp:' + id, kind: 'pole', x, z, radius: .12, parts: [] });
      const h = double ? 8 : 6.4, rot = Math.atan2(s.nx, s.nz);
      instance('concrete', unitPole, x, h / 2, z, .16, h, .16, 0, null, pole);
      for (const arm of double ? [-1, 1] : [-side]) {
        instance('steel', unitBox, x + s.nx * arm * .8, h - .2, z + s.nz * arm * .8, .08, .08, 1.6, rot, null, pole);
        const lx = x + s.nx * arm * 1.55, lz = z + s.nz * arm * 1.55;
        instance('lantern', unitBox, lx, h - .28, lz, .32, .13, .62, rot, null, pole);
        streetBulbs.push(new T.Vector3(lx, localGround(lx, lz) + h - .42, lz));
      }
      if (!double) instance('steel', unitBox, x, h + .15, z, .9, .05, .62, rot, 0x24343f, pole);
      taken.push({ x, z, r: 1 }); count.lamp++;
    }
    // A house faces the road. storeys=0 builds a pond-guard hut.
    function house(s, d, side, setback, seed, storeys) {
      if (count.house >= limits.house) return false;
      const hut = storeys === 0;
      const W = hut ? 3.2 : 4.4 + hash(seed, 1) * 3, D = hut ? 3.4 : 8 + hash(seed, 2) * 5;
      const off = s.w + setback + D / 2;
      const { x, z } = at(s, d, side, off);
      const r = Math.hypot(W, D) / 2 + .6;
      if (!clear(x, z, r) || farm(x, z) || !spaced(x, z, r)) return false;
      for (const [u, v] of [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]]) {
        const px = x + s.fx * u + s.nx * side * v, pz = z + s.fz * u + s.nz * side * v;
        if (!clear(px, pz, .4)) return false;
      }
      const sx = -s.nx * side, sz = -s.nz * side, rot = Math.atan2(sx, sz);
      const H = hut ? 2.5 : storeys * 3.3 + .2;
      const ground = localGround(x, z);
      const wall = WALLS[Math.floor(hash(seed, 3) * WALLS.length)];
      const pitched = hut || storeys === 1 && hash(seed, 4) < .7;
      const roof = pitched && !hut ? TILE[Math.floor(hash(seed, 5) * TILE.length)] : SHEET[Math.floor(hash(seed, 6) * SHEET.length)];
      instance('concrete', unitBox, x, .15, z, W + .3, .3, D + .3, rot);
      instance('wall', unitBox, x, H / 2 + .3, z, W, H, D, rot, hut ? 0xb9a98b : wall);
      if (pitched) instance('gable', gable, x, H + .32, z, W + .5, W * (hut ? .35 : .3), D + .6, rot, roof);
      else {
        instance('sheet', unitBox, x, H + .38, z, W + .3, .16, D + .3, rot, 0xd9d4c8);
        // Parapet along the street front of a flat roof.
        instance('wall', unitBox, x + sx * (D / 2 - .06), H + .75, z + sz * (D / 2 - .06), W, .6, .12, rot, wall);
      }
      const fx = x + sx * (D / 2 + .05), fz = z + sz * (D / 2 + .05);
      instance('glass', unitBox, fx, 1.35, fz, W * (hut ? .35 : .55), 2.1, .08, rot);
      for (let k = 1; k < storeys; k++) {
        const y = .3 + k * 3.3;
        instance('concrete', unitBox, x + sx * (D / 2 + .45), y, z + sz * (D / 2 + .45), W + .2, .14, .9, rot);
        instance('glass', unitBox, fx, y + 1.35, fz, W * .6, 1.5, .08, rot);
        instance('steel', unitBox, x + sx * (D / 2 + .85), y + .55, z + sz * (D / 2 + .85), W + .1, .9, .04, rot, 0x3a4044);
      }
      if (!hut && hash(seed, 7) < .5) instance('awning', unitBox, x + sx * (D / 2 + .7), 2.8, z + sz * (D / 2 + .7), W + .3, .1, 1.4, rot, roof);
      registerObstacle({ id: 'coast-house:' + seed, kind: 'building', x, z, fx: s.fx, fz: s.fz, w: W / 2, d: D / 2, baseY: ground - .2, height: H + 1 });
      taken.push({ x, z, r }); count.house++;
      return true;
    }

    for (const s of route.sort((a, b) => a.rank - b.rank)) {
      const edge = routeEdges.get(s.source.id), zone = zoneOf(edge), sea = seaSide(s, edge);
      // Anchor spacing to the edge so segments beginning on an odd metre also get scenery.
      for (let station = Math.ceil((s.station + 1) / 2) * 2; station < s.station + s.len - 1; station += 2) {
        if ((++work & 31) === 0) yield;
        const d = station - s.station, seed = s.source.id * 7919 + station;
        // A 90 m gap every few hundred metres keeps glimpses of the water.
        const gap = hash(s.source.id, Math.floor(station / 90)) < .22;
        if (zone === 'dike') {
          if (!gap && station % 6 === 0) {
            const j = hash(seed, 11) - .5, h = 8 + hash(seed, 12) * 6;
            const p = at(s, d + j * 1.5, sea, s.w + 3 + hash(seed, 13) * 1.2);
            tree('pine', p.x, p.z, h, h * .3, hash(seed, 14));
            if (station % 12 === 0) {
              const q = at(s, d + 3, sea, s.w + 7.5 + j * 2);
              tree('pine', q.x, q.z, h * .9, h * .28, hash(seed, 15));
            }
          }
          if (station % 46 === 0) lamp(s, d, -sea, s.w + 1.1, s.source.id + ':' + station, false);
          if (station % 10 === 0 && hash(seed, 16) < .1) house(s, d, -sea, 6 + hash(seed, 17) * 10, seed, hash(seed, 18) < .6 ? 0 : 1);
          else if (station % 8 === 0 && hash(seed, 19) < .08) {
            const p = at(s, d, -sea, s.w + 4 + hash(seed, 20) * 6), h = 5 + hash(seed, 21) * 4;
            tree('tree', p.x, p.z, h, h * .9, hash(seed, 22));
          }
        } else if (zone === 'village') {
          for (const side of [-1, 1]) {
            if (station % 12 !== (side > 0 ? 0 : 6)) continue;
            const roll = hash(seed, side + 30);
            if (roll < .55) house(s, d, side, 3 + hash(seed, side + 32) * 3, seed * 2 + (side > 0 ? 1 : 0), roll < .2 ? 1 : roll < .45 ? 2 : 3);
            else if (roll < .85) {
              const p = at(s, d, side, s.w + 3 + hash(seed, side + 34) * 5), palm = hash(seed, side + 36) < .3;
              const h = (palm ? 7 : 5) + hash(seed, side + 38) * 5;
              tree(palm ? 'palm' : 'tree', p.x, p.z, h, h * (palm ? .59 : .9), hash(seed, side + 40));
            }
          }
          if (station % 40 === 0) lamp(s, d, 1, s.w + 1.4, s.source.id + ':' + station, false);
        } else {
          if (station % 8 === 0 && !gap) {
            const p = at(s, d, sea, s.w + 2.6 + hash(seed, 50)), kind = hash(seed, 51) < .55 ? 'pine' : 'tree', h = 7 + hash(seed, 52) * 6;
            tree(kind, p.x, p.z, h, h * (kind === 'pine' ? .32 : .85), hash(seed, 53));
          }
          if (station % 34 === 0) lamp(s, d, sea, s.w + 1.2, s.source.id + ':' + station, true);
          if (station % 14 === 0 && hash(seed, 54) < .5) house(s, d, -sea, 3 + hash(seed, 55) * 4, seed, 2 + Math.floor(hash(seed, 56) * 3));
        }
      }
    }
    // Flashing amber lights 9 m before larger junctions, on the right of the route.
    for (const [jlon, jlat] of JUNCTIONS) {
      if ((++work & 7) === 0) yield;
      const q = graph.point(jlon, jlat), jx = q.x - cx, jz = q.z - cz;
      if (jx * jx + jz * jz > reach * reach) continue;
      for (const s of route) {
        const t = (jx - s.ax) * s.fx + (jz - s.az) * s.fz;
        if (t < -1 || t > s.len + 1 || Math.abs((jx - s.ax) * s.nx + (jz - s.az) * s.nz) > 1.5) continue;
        const dir = routeEdges.get(s.source.id).dir, back = t - dir * 9;
        if (back < 0 || back > s.len) continue;
        const p = at(s, back, dir, s.w + 1.3);
        if (!clear(p.x, p.z, .4) || !spaced(p.x, p.z, .6)) continue;
        const pole = registerObstacle({ id: 'coast-beacon:' + jlon + ':' + Math.round(back), kind: 'pole', x: p.x, z: p.z, radius: .1, parts: [] });
        const yaw = Math.atan2(s.fx * dir, s.fz * dir);
        instance('steel', unitPole, p.x, 1.8, p.z, .11, 3.6, .11, 0, 0x3d4648, pole);
        instance('steel', unitBox, p.x, 3.75, p.z, .42, .46, .3, yaw, 0x2b3133, pole);
        instance('steel', unitBox, p.x, 3.75, p.z, .62, .62, .05, yaw, 0x111111, pole);
        // Lenses face both ways along the road.
        for (const k of [-1, 1]) {
          instance('beacon', unitBox, p.x + s.fx * dir * k * .17, 3.75, p.z + s.fz * dir * k * .17, .26, .26, .05, yaw, null, pole);
        }
        taken.push({ x: p.x, z: p.z, r: .6 }); count.beacon++;
      }
    }
    api.last = count;
    return count;
  }

  // Shared amber lens material; world-scene adds it to its material table and blinks it.
  function beaconMaterial(T) {
    return new T.MeshStandardMaterial({ color: 0x6b4a12, roughness: .35, emissive: 0xffa31a, emissiveIntensity: 0 });
  }
  function blink(mat, seconds) {
    if (mat) mat.emissiveIntensity = (seconds % 1.2) < .55 ? 3.2 : .06;
  }
  const api = { build, beaconMaterial, blink, routeEdges, last: null };
  window.CoastalRouteScenery = api;
})();
