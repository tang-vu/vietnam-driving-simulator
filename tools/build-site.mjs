import {prepareJourneyOpening,writeDeparturePages} from "./prepare-journey-opening.mjs";
import {bundleJourneyScripts} from "./bundle-journey.mjs";
import {packJourneyData} from "./pack-journey-data.mjs";
import {packRoadAssets} from "./pack-road-assets.mjs";
import {prepareSightSurfaces} from "./prepare-sight-surfaces.mjs";
import {preparePageUrls} from "./page-urls.mjs";
import {execFileSync} from "node:child_process";
import {mkdir,mkdtemp,readFile,readdir,rename,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {gzipSync} from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const revision = execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
// The trailer is larger than the Site source repository's per-object limit.
const trailerUrl = "https://raw.githubusercontent.com/tang-vu/vietnam-driving-simulator/3ecfc4b4b5184836663d1d9b6db2c4dd04eaf476/dist/trailer/qua-mot-khuc-cua.mp4";
const client = path.join(root,"dist/client");
const server = path.join(root,"dist/server");
await mkdir(client,{recursive:true});
await mkdir(server,{recursive:true});
// Export the exact public asset tree of the revision being published. In particular,
// no local config, test output, generated Worker or dotfiles from the checkout enter it.
const scratch = await mkdtemp(path.join(tmpdir(),"vivu3d-export-"));
try {
  const archive = path.join(scratch,"assets.tar");
  execFileSync("git",["archive","--format=tar","--output",archive,"HEAD:dist"],{cwd:root,stdio:"inherit"});
  execFileSync(process.platform==="win32"?"tar.exe":"tar",["-xf",archive,"-C",client],{cwd:root,stdio:"inherit"});
} finally {
  await rm(scratch,{recursive:true,force:true});
}
await Promise.all([packRoadAssets(client),prepareSightSurfaces(client)]);
// The Worker serves the original bytes at each public URL.
async function storeGzip(file) {
  await writeFile(file+".gz",gzipSync(await readFile(file),{level:9}));
  await rm(file);
}
for (const directory of ["streetscape","traffic"]) {
  const folder = path.join(client,directory);
  for (const name of await readdir(folder)) {
    if (!name.endsWith(".glb")) continue;
    await storeGzip(path.join(folder,name));
  }
}
const pagePaths = await preparePageUrls(client);
await packJourneyData(client);
const departures = await prepareJourneyOpening(client);
await bundleJourneyScripts(client);
// Sites normalizes public .html assets with a 307 before invoking the Worker.
// Keep the document bytes in the asset store and let the Worker own page URLs.
const documents = path.join(client, "page-content");
await mkdir(documents, {recursive:true});
await writeDeparturePages(documents, await readFile(path.join(client, "index.html"),"utf8"), departures);
for (const page of pagePaths) {
  const stem = page === "/" ? "index" : page.slice(1);
  await rename(path.join(client, stem + ".html"), path.join(documents, stem + ".bin"));
}
// A public .txt asset is served by Sites before the Worker can declare its charset.
for (const name of await readdir(client, {recursive:true})) {
  if (name.endsWith(".txt")) {
    const file = path.join(client, name);
    await rename(file, file + ".bin");
  }
}
const stageScript = await readFile(path.join(client,"mountain-stages.js"),"utf8");
const stages = JSON.parse(stageScript.slice(stageScript.indexOf("window.mountainStages=")+"window.mountainStages=".length).trim().replace(/;$/,""));
const courses = {river:2240,pass:2480};
for(const stage of stages) courses[stage.id]=stage.angles.length*stage.step;
const featured = JSON.parse(await readFile(path.join(client,"featured-drives.json"),"utf8"));
const guided = Object.fromEntries(featured.map(route => [route.id,route.metres]));
if(featured.length!==Object.keys(guided).length || featured.some(r=>!Number.isInteger(r.metres)||r.metres<=0||r.id==="xuyen-viet"||Object.hasOwn(courses,r.id)))
  throw new Error("Invalid or duplicate featured drive.");
const body = await readFile(path.join(root,"worker/leaderboard.mjs"),"utf8");
const roadCodec = await readFile(path.join(client,"road-tile-codec.js"),"utf8");
for (const name of await readdir(client)) {
  if (name.endsWith(".js")) await storeGzip(path.join(client,name));
}
// Sites accepts a single ES module as its Worker entry point.
await writeFile(path.join(server,"index.js"),body
  .replace('import trailerUrl from "./trailer-url.js";',"const trailerUrl = "+JSON.stringify(trailerUrl)+";")
  .replace('import "../dist/road-tile-codec.js";',()=>roadCodec)
  .replace('import departureIds from "./departure-ids.js";',"const departureIds = new Set("+JSON.stringify(departures.map(stop=>stop.id))+");")
  .replace('import pagePaths from "./page-paths.js";',"const pagePaths = new Set("+JSON.stringify(pagePaths)+");")
  .replace('import courseLengths from "./course-lengths.js";',"const courseLengths = "+JSON.stringify(courses)+";")
  .replace('import guidedLengths from "./guided-lengths.js";',"const guidedLengths = "+JSON.stringify(guided)+";"));
const wrangler = {
  name:"tay-lai-viet",main:"index.js",compatibility_date:"2026-05-15",
  assets:{directory:"../client",binding:"ASSETS",html_handling:"none",run_worker_first:true},
  d1_databases:[{binding:"DB",database_name:"taylai",database_id:"00000000-0000-4000-8000-000000000000"}],
};
await writeFile(path.join(server,"wrangler.json"),JSON.stringify(wrangler,null,2)+"\n");
console.log("Prepared "+Object.keys(courses).length+" race courses and static assets for "+revision.slice(0,7));
