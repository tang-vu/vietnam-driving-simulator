import departureIds from "./departure-ids.js";
import pagePaths from "./page-paths.js";
import trailerUrl from "./trailer-url.js";
import courseLengths from "./course-lengths.js";
import guidedLengths from "./guided-lengths.js";
import "../dist/road-tile-codec.js";

const tour = "xuyen-viet";
const tourVehicles = new Set(["supercar","gt","rally","muscle-car","mustang-gt3","family-sedan","suv","family-minivan",
  "city-sedan","classic-sedan","compact-mpv","touring-mpv","motorcycle","box-truck"]);
const isGuided = route => Object.hasOwn(guidedLengths,route);
const hour = 3600_000;
const maxAge = 7 * 24 * hour;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const knownRoute = route => typeof route === "string" && (route === tour || isGuided(route) || Object.hasOwn(courseLengths, route));
const json = (data, status = 200, headers = {}) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers },
});
const fail = (message, status) => json({error:message}, status);

async function digest(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}

async function identity(request, create) {
  const signedIn = request.headers.get("oai-authenticated-user-id");
  if (signedIn) return { player: await digest("site:" + signedIn) };
  const current = request.headers.get("Cookie")?.match(/(?:^|;\s*)__Host-taylai-racer=([^;]+)/)?.[1];
  if (current && uuid.test(current)) return {player:await digest("guest:" + current)};
  if (!create) return {};
  const token = crypto.randomUUID();
  return {
    player:await digest("guest:" + token),
    cookie:"__Host-taylai-racer=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000",
  };
}

async function readBody(request) {
  if (!request.body || Number(request.headers.get("content-length")) > 1024) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 1024) { await reader.cancel(); return null; }
    text += decoder.decode(chunk.value, {stream:true});
  }
  try { const result = JSON.parse(text + decoder.decode()); return result && typeof result === "object" && !Array.isArray(result) ? result : null; }
  catch { return null; }
}

async function standings(db, route, player) {
  const leaders = db.prepare("SELECT name,score FROM race_records WHERE route=? ORDER BY score,achieved,player LIMIT 10").bind(route);
  const rankQuery = db.prepare(`SELECT name,score,
    1+(SELECT COUNT(*) FROM race_records AS r WHERE r.route=me.route AND r.score<me.score) AS rank
    FROM race_records AS me WHERE route=? AND player=?`).bind(route,player || "");
  const [list, self] = await db.batch([leaders,rankQuery]);
  const format = row => route === tour ? {name:row.name,distanceM:-row.score} : {name:row.name,timeMs:row.score};
  const result = {entries:list.results.map(format),limit:10};
  const me = self.results[0];
  if (me) Object.assign(result, {rank:me.rank,personal:format(me)});
  return result;
}

async function start(request, db, body, now) {
  if (!knownRoute(body.route)) return fail("Chặng không hợp lệ.", 400);
  const {player,cookie} = await identity(request,true);
  const address = request.headers.get("cf-connecting-ip");
  const network = address ? await digest("network:" + Math.floor(now / (24 * hour)) + ":" + address) : player;
  const runId = crypto.randomUUID();
  const statements = [
    db.prepare("DELETE FROM race_runs WHERE id IN (SELECT id FROM race_runs WHERE started<? ORDER BY started LIMIT 50)").bind(now-maxAge),
    db.prepare(`INSERT INTO race_runs(id,player,network,route,started)
      SELECT ?,?,?,?,? WHERE
      (SELECT COUNT(*) FROM race_runs WHERE player=? AND started>?)<90 AND
      (SELECT COUNT(*) FROM race_runs WHERE network=? AND started>?)<600`)
      .bind(runId,player,network,body.route,now,player,now-hour,network,now-hour),
  ];
  if ((body.route === tour || isGuided(body.route)) && tourVehicles.has(body.vehicle)) {
    const previous = tourVehicles.has(body.previousVehicle) ? body.previousVehicle : "";
    // Count only accepted starts. The aggregate contains no run or player identifiers.
    statements.push(db.prepare(`INSERT INTO vehicle_choices(previous_vehicle,vehicle,trips)
      SELECT ?,?,1 WHERE EXISTS (SELECT 1 FROM race_runs WHERE id=?)
      ON CONFLICT(previous_vehicle,vehicle) DO UPDATE SET trips=trips+1`)
      .bind(previous,body.vehicle,runId));
  }
  const [, inserted] = await db.batch(statements);
  if (!inserted.meta.changes) return json({error:"Bạn đã mở nhiều lượt chơi. Hãy thử lại sau."},429,{"Retry-After":"60"});
  return json({runId},201,cookie ? {"Set-Cookie":cookie} : {});
}

// Freeze the official time on arrival. Choosing a nickname or retrying a
// submission later must never alter the recorded time or a previous record.
async function arrive(request, db, body, now) {
  if (typeof body.runId !== "string" || !uuid.test(body.runId)) return fail("Mã lượt chơi không hợp lệ.",400);
  const {player} = await identity(request,false);
  if (!player) return fail("Hãy bắt đầu một lượt chơi mới.",401);
  const attempt = await db.prepare("SELECT route FROM race_runs WHERE id=? AND player=?").bind(body.runId,player).first();
  if (!attempt || !isGuided(attempt.route)) return fail("Lượt đi không còn hiệu lực.",410);
  const route=attempt.route, minimumMs=guidedLengths[route]*10;
  const [, row] = await db.batch([
    db.prepare(`UPDATE race_runs SET score=?-started,updated=?
      WHERE id=? AND player=? AND route=? AND score IS NULL AND started BETWEEN ? AND ?`)
      .bind(now,now,body.runId,player,route,now-maxAge,now-minimumMs),
    db.prepare("SELECT score,started FROM race_runs WHERE id=? AND player=? AND route=?")
      .bind(body.runId,player,route),
  ]);
  const run=row.results[0];
  if (!run || run.started<now-maxAge) return fail("Lượt đi không còn hiệu lực.",410);
  if (run.score===null) return fail("Chưa đủ thời gian để hoàn thành tuyến.",422);
  return json({timeMs:run.score});
}

async function finish(request, db, body, now) {
  if (typeof body.runId !== "string" || !uuid.test(body.runId)) return fail("Mã lượt chơi không hợp lệ.",400);
  const {player} = await identity(request,false);
  if (!player) return fail("Hãy bắt đầu một lượt chơi mới.",401);
  const run = await db.prepare("SELECT route,started,score,name,updated FROM race_runs WHERE id=? AND player=?").bind(body.runId,player).first();
  if (!run || run.started < now-maxAge) return fail("Lượt chơi không còn hiệu lực.",410);
  const name = typeof body.name === "string" ? body.name.normalize("NFC").trim() : "";
  if (Array.from(name).length < 1 || Array.from(name).length > 24 || /[\p{C}<>]/u.test(name)) return fail("Biệt danh cần từ 1 đến 24 ký tự.",400);
  const distance = run.route === tour;
  const value = distance ? body.distanceM : body.timeMs;
  if (!Number.isSafeInteger(value) || value < 1) return fail("Thành tích không hợp lệ.",400);
  const score = distance ? -value : value;
  const guidedArrival = isGuided(run.route);
  if (guidedArrival && run.score !== value) return fail("Cần xác nhận thời gian tại đích.",422);
  if (run.score !== null && (!guidedArrival || run.name!==null) && (!distance || score >= run.score)) {
    if (!distance && (run.score !== score || run.name !== name)) return fail("Lượt đua này đã ghi kết quả.",409);
    return json(await standings(db,run.route,player));
  }
  const elapsed = now-run.started;
  // Generous upper speed bound covers nitro, game-frame jitter and launch-request latency.
  const maxMetres = (elapsed/1000 + 4)*100;
  const metres = guidedArrival ? guidedLengths[run.route] : courseLengths[run.route];
  if (distance ? value>maxMetres : (metres>maxMetres || value<metres*10 || value>maxAge)) {
    return fail("Thành tích chưa phù hợp với chặng và thời gian chơi.",422);
  }
  if (distance && run.updated !== null && now-run.updated < 3000) return json({error:"Chờ vài giây trước khi cập nhật."},429,{"Retry-After":"3"});
  await db.batch([
    db.prepare(`UPDATE race_runs SET score=?,name=?,updated=? WHERE id=? AND player=?
      AND (score IS NULL OR (?=1 AND score=? AND name IS NULL) OR (route=? AND score>? AND updated<=?))`)
      .bind(score,name,now,body.runId,player,Number(guidedArrival),score,tour,score,now-3000),
    db.prepare(`INSERT INTO race_records(route,player,score,name,achieved)
      SELECT route,player,score,name,updated FROM race_runs WHERE id=? AND player=? AND score IS NOT NULL
      ON CONFLICT(route,player) DO UPDATE SET score=excluded.score,name=excluded.name,achieved=excluded.achieved
      WHERE excluded.score<race_records.score`).bind(body.runId,player),
  ]);
  return json(await standings(db,run.route,player));
}

// Existing clients read gzip-compressed JSON at the original tile URL. New
// clients request the smaller binary representation with ?format=packed.
async function legacyRoadTile(request, env, url, matrix=false) {
  const input = new Headers(request.headers);
  for (const key of ["Range","If-Range","If-Match","If-None-Match","If-Modified-Since"]) input.delete(key);
  const source = await env.ASSETS.fetch(new Request(url, {headers:input}));
  if (source.status !== 200) return source;
  const headers = new Headers(source.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Content-Type","application/gzip");
  const original = headers.get("ETag");
  if (original) headers.set("ETag",original.replace(/"$/,matrix?'.i32"':'.json"'));
  const match = request.headers.get("If-None-Match");
  if (match === "*" || (match && match.split(",").some(tag=>tag.trim()===headers.get("ETag")))) {
    await source.body?.cancel();
    return new Response(null,{status:304,headers});
  }
  if (request.method === "HEAD") {
    await source.body?.cancel();
    return new Response(null,{headers});
  }
  const raw = await RoadTileCodec.content(source);
  const content = matrix ? RoadTileCodec.routeCosts(raw) : RoadTileCodec.packed(raw) ? JSON.stringify(RoadTileCodec.decode(raw)) : raw;
  const body = new Blob([content]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(body,{headers});
}

async function serveGameAsset(request, env, url) {
  const pathname = url.pathname;
  if (request.method === "GET" || request.method === "HEAD") {
    const clean = pathname === "/index.html" ? "/" : pathname.replace(/\.html$|\/$/, "");
    const redirectPage = clean !== pathname && pagePaths.has(clean);
    const redirectHttp = url.protocol === "http:" && url.hostname === "vivu3d.com";
    if (redirectPage || redirectHttp) {
      if (redirectPage) url.pathname = clean;
      if (redirectHttp) url.protocol = "https:";
      return Response.redirect(url.href, 301);
    }
    const scan = /^\/landmark-scans\/(?:my-son|my-son-g4|den-ngoc-son)\.glb$/.test(pathname);
    const garageModel = /^\/streetscape\/(?:city-sedan|classic-sedan|compact-mpv|touring-mpv|street-motorcycle)\.glb$/.test(pathname);
    const elevationSource = pathname === "/streetscape/surfaces/vietnam-elevation.png";
    const sightPhoto = /^\/sight-photos\/[a-z0-9-]+\.webp$/.test(pathname);
    const pinnedAsset = scan || garageModel || elevationSource || sightPhoto;
    if (pinnedAsset || pathname === "/trailer/qua-mot-khuc-cua.mp4") {
      const upstreamHeaders = new Headers({"Accept-Encoding":"identity"});
      for (const name of ["Range","If-Range","If-None-Match","If-Modified-Since"]) {
        if (request.headers.has(name)) upstreamHeaders.set(name,request.headers.get(name));
      }
      const url = pinnedAsset ? new URL(".."+pathname,trailerUrl).href : trailerUrl;
      const options = {method:request.method,headers:upstreamHeaders};
      let media;
      try {
        media = await fetch(url,options);
      } catch (error) {
        if (!pinnedAsset) throw error;
      }
      if (pinnedAsset && (!media || media.status>=500 || [403,404,429].includes(media.status))) {
        await media?.body?.cancel();
        const mirror = url.replace(/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([0-9a-f]{40})\//,
          "https://cdn.jsdelivr.net/gh/$1@$2/");
        media = await fetch(mirror,options);
      }
      const headers = new Headers();
      for (const name of ["Accept-Ranges","Content-Range","Content-Length","ETag","Last-Modified","Cache-Control"]) {
        if (media.headers.has(name)) headers.set(name,media.headers.get(name));
      }
      if (media.ok) headers.set("Content-Type",sightPhoto?"image/webp":elevationSource?"image/png":pinnedAsset?"model/gltf-binary":"video/mp4");
      return new Response(media.body,{status:media.status,headers});
    }
  }
  const isPage = pagePaths.has(pathname);
  const isText = pathname.endsWith(".txt");
  if (isPage) {
    let stem = pathname === "/" ? "index" : pathname.slice(1);
    if (pathname === "/" && !["drive","pass","collection","route","pin"].some(key=>url.searchParams.has(key))) {
      const id = url.searchParams.get("landmark") || url.searchParams.get("intro");
      if (departureIds.has(id)) stem = "intro-" + id;
    }
    // Tracking parameters belong to the visitor URL; the stored document is identical.
    url.search = "";
    url.pathname = "/page-content/" + stem + ".bin";
  } else if (isText) {
    url.pathname += ".bin";
  }
  if (/^\/sight-landscapes\/N\d{2}E\d{3}-\d+-water\.png$/.test(pathname)) {
    url.pathname = pathname.replace(/\.png$/,".webp");
  } else if (/^\/sight-landscapes\/N\d{2}E\d{3}-\d+\.png$/.test(pathname)) {
    url.pathname = pathname.replace(/\.png$/,".surface.webp");
  }
  const roadTile = (request.method === "GET" || request.method === "HEAD")
    && /^\/vn-roads\/\d+_\d+(?:_\d+_\d+)?\.gz$/.test(pathname);
  if (roadTile) url.pathname = pathname.replace(/\.gz$/,".vrd.gz");
  const matrix = (request.method==="GET" || request.method==="HEAD") && /^\/route-network\/costs-\d+\.gz$/.test(pathname);
  if (matrix) url.pathname = pathname.replace(/\.gz$/,".vrc.gz");
  const legacyTile = (roadTile || matrix) && url.searchParams.get("format") !== "packed";
  let response;
  const packedModel = /^\/(streetscape|traffic)\/[^/]+\.glb$/.test(pathname);
  const packedScript = /^\/[^/]+\.js$/.test(pathname) ||
    /^\/(?:journey-data|stage-terrain)\/[^/]+\.m?js$/.test(pathname);
  const packedDocument = isPage || /^\/page-content\/[^/]+\.bin$/.test(pathname);
  const packedJson = pathname.endsWith(".json");
  const packedCss = pathname.endsWith(".css");
  if (["GET","HEAD"].includes(request.method) && (packedModel || packedScript || packedDocument || packedJson || packedCss)) {
    url.pathname += ".gz";
    const input = new Headers(request.headers);
    // Byte ranges on the public URL refer to the decoded asset.
    input.delete("Range");
    input.delete("If-Range");
    response = await env.ASSETS.fetch(new Request(url,{method:request.method,headers:input}));
    if (response.status === 200) {
      const headers = new Headers(response.headers);
      headers.delete("Content-Encoding");
      headers.delete("Content-Length");
      headers.delete("Content-Disposition");
      headers.set("Content-Type",packedModel ? "model/gltf-binary" :
        packedScript ? "text/javascript; charset=utf-8" :
        packedCss ? "text/css; charset=utf-8" :
        packedJson ? "application/json; charset=utf-8" : "application/octet-stream");
      headers.set("Accept-Ranges","bytes");
      const body = request.method === "HEAD" ? null : await RoadTileCodec.content(response);
      response = new Response(body,{headers});
    }
  } else {
    response = legacyTile ? await legacyRoadTile(request, env, url, matrix) : await env.ASSETS.fetch(new Request(url,request));
  }
  if (response.ok && (isPage || isText)) {
    const headers = new Headers(response.headers);
    headers.set("Content-Type", isPage ? "text/html; charset=utf-8" : "text/plain; charset=utf-8");
    headers.delete("Content-Disposition");
    response = new Response(response.body, {status:response.status, headers});
  }
  const range = request.headers.get("Range");
  if (request.method !== "GET" || !range || response.status !== 200 ||
      (request.headers.has("If-Range") && ![response.headers.get("etag"),response.headers.get("last-modified")].includes(request.headers.get("If-Range")))) return response;
  const parts = /^bytes=(\d*)-(\d*)$/i.exec(range);
  if (!parts || (!parts[1] && !parts[2])) return response;
  // Wrangler local asset bindings can return the entire resource for a Range GET.
  // Game files are bounded static assets (the largest model is under 3 MB).
  const bytes = await response.arrayBuffer(), size = bytes.byteLength;
  const start = parts[1] ? Number(parts[1]) : Math.max(0,size-Number(parts[2]));
  const end = parts[1] && parts[2] ? Math.min(size-1,Number(parts[2])) : size-1;
  if (start>end || start>=size) return new Response(null,{status:416,headers:{"Content-Range":"bytes */"+size}});
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges","bytes");
  headers.set("Content-Range","bytes "+start+"-"+end+"/"+size);
  headers.set("Content-Length",String(end-start+1));
  headers.delete("Content-Encoding");
  return new Response(bytes.slice(start,end+1),{status:206,headers});
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const base = "/api/leaderboard";
    if (url.pathname !== base && !url.pathname.startsWith(base + "/")) return serveGameAsset(request,env,url);
    if (url.pathname === base && request.method === "GET") {
      const route = url.searchParams.get("route");
      if (!knownRoute(route)) return fail("Chặng không hợp lệ.",400);
      const {player} = await identity(request,false);
      return json(await standings(env.DB,route,player));
    }
    const action = url.pathname.slice(base.length);
    if (!["/start","/arrive","/finish"].includes(action)) return fail("Không tìm thấy.",404);
    if (request.method !== "POST") return fail("Phương thức không hợp lệ.",405);
    if (request.headers.get("Origin") !== url.origin) return fail("Nguồn yêu cầu không hợp lệ.",403);
    if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") return fail("Cần dữ liệu JSON.",415);
    const body = await readBody(request);
    if (!body) return fail("Nội dung không hợp lệ.",400);
    if (action === "/arrive") return arrive(request,env.DB,body,Date.now());
    return action === "/start" ? start(request,env.DB,body,Date.now()) : finish(request,env.DB,body,Date.now());
  },
};
