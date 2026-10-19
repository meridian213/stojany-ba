// Service worker: robí z mapy inštalovateľnú aplikáciu („Pridať na plochu“).
// Nič neukladá do vyrovnávacej pamäte, aby sa vždy zobrazovala najnovšia verzia.
// Bez internetu namiesto chyby prehliadača ukáže zrozumiteľnú správu.
const OFFLINE = `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>cinkcink – bez internetu</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font:17px/1.5 system-ui,sans-serif;background:#eef2f7;color:#14213a;padding:24px;box-sizing:border-box;text-align:center}
@media (prefers-color-scheme:dark){body{background:#0e1520;color:#e9eef7}}
h1{font-size:1.4rem;margin:0 0 8px}p{margin:0 0 20px;max-width:28ch}
button{min-height:48px;padding:10px 22px;border-radius:12px;border:0;background:#1d5bd8;color:#fff;font:700 1rem system-ui,sans-serif}
</style></head><body><main><h1>Si bez internetu</h1><p>Mapa cyklostojanov potrebuje pripojenie. Skús to znova, keď budeš online.</p>
<button type="button" onclick="location.reload()">Skúsiť znova</button></main></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;   // ostatné požiadavky (dáta, mapa, databáza) idú bežne
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
