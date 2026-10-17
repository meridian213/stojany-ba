// Poistka proti pozastaveniu Supabase na bezplatnom pláne (po 7 dňoch bez aktivity).
// Spúšťa sa každú noc a pošle do databázy jeden malý dotaz.
// Adresu a verejný kľúč berie zo site/config.js, netreba nič nastavovať navyše.
// Keď Supabase ešte nie je napojený, nič nerobí.

import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../site/config.js", import.meta.url), "utf8");
const url = html.match(/SUPABASE_URL:\s*"([^"]*)"/)?.[1];
const key = html.match(/SUPABASE_ANON_KEY:\s*"([^"]*)"/)?.[1];

if (!url || !key) {
  console.log("Supabase nie je v site/config.js nastavený, preskakujem.");
  process.exit(0);
}

const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/ratings?select=stars&limit=1`, {
  headers: { apikey: key },   // nové kľúče (sb_publishable_…) sa posielajú len v hlavičke apikey
  signal: AbortSignal.timeout(30_000),
});
if (!res.ok) {
  console.error(`Supabase odpovedal HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
console.log("Supabase je aktívny.");
