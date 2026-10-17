// Stiahne cyklostojany v Bratislave z OpenStreetMap (Overpass API) do site/data/osm.json.
// Spúšťa sa každú noc cez GitHub Actions. Bez externých balíčkov, stačí Node 20+.
//
// Ak sťahovanie zlyhá alebo vráti podozrivo málo stojanov, súbor sa NEPREPÍŠE
// a skript skončí chybou – stránka ďalej použije posledné dobré dáta.

import { writeFile, readFile } from "node:fs/promises";

const ENDPOINTS = (process.env.OVERPASS_URL ||
  "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter").split(",");
const OUT = new URL("../site/data/osm.json", import.meta.url);
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
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "stojany-ba (GitHub Actions)" },
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

async function main() {
  let elements = [];
  for (const q of QUERIES) {
    elements = await overpass(q);
    if (elements.length) break;
  }
  const racks = elements.map(compact).filter(Boolean).sort((a, b) => (a.type + a.id).localeCompare(b.type + b.id));
  if (racks.length < MIN_RACKS) throw new Error(`Len ${racks.length} stojanov (menej ako ${MIN_RACKS}), súbor neprepisujem.`);

  let previous = 0;
  try { previous = JSON.parse(await readFile(OUT, "utf8")).elements.length; } catch {}
  const data = {
    fetched: new Date().toISOString(),
    source: "© prispievatelia OpenStreetMap, licencia ODbL (Overpass API)",
    elements: racks,
  };
  await writeFile(OUT, JSON.stringify(data));
  console.log(`Uložených ${racks.length} stojanov (predtým ${previous}).`);
}

main().catch((e) => { console.error("Aktualizácia zlyhala:", e.message); process.exit(1); });
