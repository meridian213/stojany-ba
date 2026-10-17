// Stiahne cyklostojany v Bratislave z OpenStreetMap (Overpass API) do site/data/osm.json.
// Spúšťa sa každú noc cez GitHub Actions. Bez externých balíčkov, stačí Node 20+.
//
// Ak sťahovanie zlyhá alebo vráti podozrivo málo stojanov, súbor sa NEPREPÍŠE
// a skript skončí chybou – stránka ďalej použije posledné dobré dáta.

import { writeFile, readFile } from "node:fs/promises";

const ENDPOINTS = (process.env.OVERPASS_URL ||
  "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter").split(",");
const OUT = new URL("../site/data/osm.json", import.meta.url);
const DISTRICTS_OUT = new URL("../site/data/districts.json", import.meta.url);
const HISTORY_OUT = new URL("../site/data/history.json", import.meta.url);
// 17 mestských častí Bratislavy (OSM relácie, admin_level=9)
const DISTRICT_IDS = [1700677, 2185278, 2185279, 2185281, 2190576, 2190577, 2190578, 2208772, 2208773,
  2208774, 2208775, 2208776, 2208777, 2208778, 2208779, 2208780, 2208781];
const BAD_TYPES = ["wall_loops", "ground_slots", "handlebar_holder", "crossbar"];   // „lámače kolies“
const MIN_RACKS = Number(process.env.MIN_RACKS || 500);   // poistka proti neúplnej odpovedi
const KEEP_TAGS = ["bicycle_parking", "capacity", "covered", "access", "name", "operator", "description"];

const QUERIES = [
  // hranica mesta Bratislava (Wikidata Q1780)
  '[out:json][timeout:120];area["wikidata"="Q1780"]->.a;nwr["amenity"="bicycle_parking"](area.a);out center tags;',
  // záloha: obdĺžnik okolo mesta
  '[out:json][timeout:120];nwr["amenity"="bicycle_parking"](48.0,16.95,48.27,17.34);out center tags;',
];

async function overpass(query) {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "cyklostojany-bratislava (GitHub Actions)" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(180_000),
      });
      const text = await res.text();
      if (!res.ok || !text.startsWith("{")) throw new Error(`${url}: HTTP ${res.status} ${text.slice(0, 80)}`);
      const json = JSON.parse(text);
      if (json.remark && /runtime error|timed out/i.test(json.remark)) throw new Error(`${url}: ${json.remark}`);
      return json.elements || [];
    } catch (e) {
      console.warn("Pokus zlyhal:", e.message);
      lastErr = e;
    }
  }
  throw lastErr;
}

function compact(el) {
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const tags = {};
  for (const k of KEEP_TAGS) if (el.tags?.[k]) tags[k] = el.tags[k];
  return { type: el.type, id: el.id, lat: +lat.toFixed(6), lon: +lon.toFixed(6), tags };
}

/* ---------- mestské časti ---------- */
function ringsFromWays(ways) {
  // poskladá uzavreté obrysy z úsekov hranice (úseky na seba nadväzujú v spoločných bodoch)
  const k = (p) => p[0] + "," + p[1];
  const segs = ways.map((w) => w.slice());
  const rings = [];
  while (segs.length) {
    let ring = segs.shift();
    let guard = 0;
    while (k(ring[0]) !== k(ring[ring.length - 1]) && guard++ < 10000) {
      const end = k(ring[ring.length - 1]);
      const i = segs.findIndex((s) => k(s[0]) === end || k(s[s.length - 1]) === end);
      if (i < 0) break;
      let s = segs.splice(i, 1)[0];
      if (k(s[0]) !== end) s = s.reverse();
      ring = ring.concat(s.slice(1));
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  let md = 0, mi = 0; const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], dx = (b[0] - a[0]) * 0.67, dy = b[1] - a[1], L = dx * dx + dy * dy;
    let t = L ? (((p[0] - a[0]) * 0.67) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    const ex = (a[0] - p[0]) * 0.67 + t * dx, ey = a[1] - p[1] + t * dy, d = ex * ex + ey * ey;
    if (d > md) { md = d; mi = i; }
  }
  return md > tol * tol ? simplify(pts.slice(0, mi + 1), tol).slice(0, -1).concat(simplify(pts.slice(mi), tol)) : [a, b];
}
function inRings(lon, lat, rings) {
  let inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
async function loadDistricts() {
  // hranice sa menia zriedka: sťahujú sa raz za 30 dní
  try {
    const d = JSON.parse(await readFile(DISTRICTS_OUT, "utf8"));
    if (d.districts?.length === DISTRICT_IDS.length && Date.now() - Date.parse(d.fetched) < 30 * 864e5) return d.districts;
  } catch {}
  const els = await overpass(`[out:json][timeout:180];rel(id:${DISTRICT_IDS.join(",")});out geom;`);
  const districts = els.filter((e) => e.type === "relation").map((rel) => {
    const ways = rel.members.filter((m) => m.type === "way" && m.role === "outer" && m.geometry)
      .map((m) => m.geometry.map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)]));
    const rings = ringsFromWays(ways).map((r) => simplify(r, 0.00008).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]));
    return { id: rel.id, name: String(rel.tags.name || "").replace(/^Bratislava-/, ""), rings };
  }).sort((a, b) => a.name.localeCompare(b.name, "sk"));
  if (districts.length !== DISTRICT_IDS.length || districts.some((d) => !d.rings.length))
    throw new Error("Hranice mestských častí sú neúplné.");
  await writeFile(DISTRICTS_OUT, JSON.stringify({ fetched: new Date().toISOString(), source: "© prispievatelia OpenStreetMap, ODbL", districts }));
  console.log(`Hranice mestských častí: ${districts.map((d) => d.name).join(", ")}.`);
  return districts;
}

async function main() {
  let elements = [];
  for (const q of QUERIES) {
    elements = await overpass(q);
    if (elements.length) break;
  }
  const racks = elements.map(compact).filter(Boolean).sort((a, b) => (a.type + a.id).localeCompare(b.type + b.id));
  if (racks.length < MIN_RACKS) throw new Error(`Len ${racks.length} stojanov (menej ako ${MIN_RACKS}), súbor neprepisujem.`);

  // Sledovanie zmien: pri každom stojane si pamätáme deň, keď sa prvýkrát objavil („seen“),
  // a zoznam stojanov, ktoré zmizli za posledných 30 dní („removed“).
  let prev = null;
  try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
  const today = new Date().toISOString().slice(0, 10);
  const key = (e) => `${e.type}/${e.id}`;
  const prevMap = new Map((prev?.elements || []).map((e) => [key(e), e]));
  const nowKeys = new Set(racks.map(key));

  let added = 0;
  for (const r of racks) {
    const p = prevMap.get(key(r));
    if (p) { if (p.seen) r.seen = p.seen; }
    else if (prev) { r.seen = today; added++; }   // pri úplne prvom behu nič neoznačujeme ako nové
  }

  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const removed = (prev?.removed || []).filter((x) => x.date >= cutoff && !nowKeys.has(x.id));
  const newlyRemoved = [...prevMap.keys()].filter((k) => !nowKeys.has(k) && !removed.some((x) => x.id === k));
  // poistka: ak naraz zmizne podozrivo veľa stojanov, je to skôr chyba odpovede než realita
  const maxRemoved = Math.max(50, Math.round(prevMap.size * 0.1));
  if (newlyRemoved.length > maxRemoved) throw new Error(`Naraz by zmizlo ${newlyRemoved.length} stojanov (limit ${maxRemoved}), súbor neprepisujem.`);
  for (const k of newlyRemoved) removed.push({ id: k, date: today });

  // mestská časť ku každému stojanu (pri výpadku hraníc sa len vynechá)
  try {
    const districts = await loadDistricts();
    for (const r of racks) { const d = districts.find((x) => inRings(r.lon, r.lat, x.rings)); if (d) r.d = d.id; }
  } catch (e) { console.warn("Mestské časti sa nepodarilo priradiť:", e.message); }

  // mesačná história (posledný stav v mesiaci)
  let history = { months: {} };
  try { history = JSON.parse(await readFile(HISTORY_OUT, "utf8")); } catch {}
  const cap = racks.reduce((s, r) => s + (parseInt(r.tags.capacity, 10) > 0 ? parseInt(r.tags.capacity, 10) : 0), 0);
  history.months[today.slice(0, 7)] = {
    racks: racks.length,
    capacity: cap,
    capacity_unknown: racks.filter((r) => !(parseInt(r.tags.capacity, 10) > 0)).length,
    bad: racks.filter((r) => BAD_TYPES.includes(r.tags.bicycle_parking)).length,
    covered: racks.filter((r) => r.tags.covered === "yes").length,
  };
  await writeFile(HISTORY_OUT, JSON.stringify(history));

  const data = {
    fetched: new Date().toISOString(),
    tracking_since: prev?.tracking_since || today,
    source: "© prispievatelia OpenStreetMap, licencia ODbL (Overpass API)",
    removed,
    elements: racks,
  };
  await writeFile(OUT, JSON.stringify(data));
  console.log(`Uložených ${racks.length} stojanov (predtým ${prevMap.size}), nových ${added}, zmiznutých ${newlyRemoved.length}.`);
}

main().catch((e) => { console.error("Aktualizácia zlyhala:", e.message); process.exit(1); });
