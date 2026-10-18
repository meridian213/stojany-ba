# Cyklostojany Bratislava

Mobilná mapa cyklostojanov v Bratislave. Stojany sa každú noc automaticky sťahujú z OpenStreetMap, používatelia ich môžu hodnotiť a navrhovať nové, ktoré schvaľuje správca.

## Čo je v repozitári

| Cesta | Na čo slúži |
|---|---|
| `site/index.html` | Mapa – celá aplikácia (HTML, CSS, JavaScript v jednom súbore). |
| `site/prehlad.html` | Prehľad pre mesto: počty po mestských častiach, najžiadanejšie miesta, hodnotenia, vývoj po mesiacoch a dáta na stiahnutie. |
| `site/config.js` | Adresa a verejný kľúč Supabase. |
| `site/fonts/` | Písma Atkinson Hyperlegible a Overpass (licencia OFL), uložené priamo tu namiesto Google Fonts kvôli súkromiu návštevníkov. |
| `site/data/osm.json` | Stojany z OSM, každý s číslom mestskej časti. Prepisuje ho nočná aktualizácia. |
| `site/data/districts.json` | Hranice 17 mestských častí z OSM (zjednodušené). Obnovuje sa raz za 30 dní. |
| `site/data/history.json` | Mesačné súhrny (počet stojanov, kapacita, nevhodné, zastrešené) – stav na konci mesiaca. |
| `scripts/update-osm.mjs` | Stiahne stojany z Overpass API, priradí ich k mestským častiam, zapíše mesačný súhrn a zaznamená, ktoré stojany pribudli a ktoré zmizli. Pri chybe, podozrivo malom počte alebo hromadnom zmiznutí stojanov súbor neprepíše. |
| `scripts/keep-alive.mjs` | Každú noc pošle do Supabase malý dotaz, aby sa projekt nepozastavil. |
| `.github/workflows/deploy.yml` | Každú noc o 2:17 UTC stiahne dáta a zverejní stránku. Beží aj po každej zmene a dá sa spustiť ručne. |
| `supabase/schema.sql` | Databáza pre hodnotenia, návrhy a fotky vrátane prístupových pravidiel. |
| `supabase/migrations/` | Zmeny pre už existujúcu databázu (002 až 005, 005 = hlásenia „Tu chýba stojan“). Spúšťajú sa ručne v SQL Editore v poradí podľa čísla. |

## Zverejnenie na GitHub Pages

1. **Založ si GitHub účet** na github.com (ak ešte nemáš).
2. **Vytvor repozitár**: tlačidlo *New repository*, názov napr. `stojany-ba`, viditeľnosť **Public** (GitHub Pages je na bezplatnom pláne len pre verejné repozitáre).
3. **Nahraj súbory**: v repozitári *Add file → Upload files* a pretiahni obsah tohto priečinka.
   Priečinok `.github` sa pri pretiahnutí niekedy vynechá, lebo je skrytý. Ak sa v repozitári neobjaví, vytvor ho ručne: *Add file → Create new file*, ako názov napíš `.github/workflows/deploy.yml` a vlož obsah súboru.
4. **Zapni Pages**: *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
5. **Spusti prvé zverejnenie**: záložka *Actions* → *Aktualizácia a zverejnenie* → *Run workflow*. Po pár minútach bude stránka na adrese
   `https://<tvoje-meno>.github.io/stojany-ba/`

Odteraz sa stránka aktualizuje sama: každú noc, a vždy keď v repozitári niečo zmeníš.

## Napojenie Supabase (hodnotenia, návrhy, fotky)

Bez tohto kroku stránka funguje, ale hodnotenia a návrhy sa ukladajú len v telefóne používateľa.

1. **Založ projekt** na supabase.com. Ako región vyber **Frankfurt (eu-central-1)**, aby dáta zostali v EÚ.
2. **Vytvor databázu**: *SQL Editor → New query*, vlož obsah `supabase/schema.sql` → *Run*.
3. **Pridaj správcu**: *Authentication → Users → Add user* s tvojím e-mailom. Potom v SQL editore:
   ```sql
   insert into public.admins (email) values ('tvoj@email.sk');
   ```
4. **Povoľ prihlásenie zo stránky**: *Authentication → URL Configuration*
   - *Site URL*: `https://<tvoje-meno>.github.io/stojany-ba/`
   - *Redirect URLs*: tá istá adresa
5. **Prepoj stránku**: *Project Settings → API* skopíruj **Project URL** a verejný kľúč **Publishable key** (`sb_publishable_…`, v starších projektoch **anon public**). V GitHube otvor `site/config.js`, klikni na ceruzku (Edit) a vyplň:
   ```js
   SUPABASE_URL: "https://xxxx.supabase.co",
   SUPABASE_ANON_KEY: "sb_publishable_...",
   ```
   Ulož (*Commit changes*). Stránka sa o pár minút zverejní znova.
   Verejný kľúč je určený na použitie v prehliadači, dáta chránia prístupové pravidlá v databáze. Kľúč **secret** ani **service_role** sem nikdy nedávaj.
6. **Vyskúšaj**: na telefóne pridaj skúšobný stojan, potom sa v menu ☰ → *Správca* prihlás e-mailom a návrh schváľ.

## Údržba a obmedzenia

- **Neaktívny repozitár**: GitHub vypne naplánované spúšťanie, ak sa v repozitári 60 dní nič nedeje. Nočná aktualizácia ukladá dáta späť do repozitára, takže by k tomu nemalo dôjsť. Ak sa to stane, v *Actions* stačí workflow znova povoliť.
- **Supabase na bezplatnom pláne** pozastaví projekt po týždni bez aktivity. Ako poistka pošle nočná aktualizácia do databázy jeden malý dotaz (`scripts/keep-alive.mjs`, adresu a kľúč berie zo `site/config.js`). Ak by sa projekt aj tak pozastavil, príde e-mail a v Supabase ho obnovíš tlačidlom *Resume project*, dáta zostanú zachované.
- **Mapové dlaždice** sa berú z tile.openstreetmap.org. Pri malej návštevnosti je to v poriadku. Pri väčšej treba podľa pravidiel OSM prejsť na iného poskytovateľa máp.
- **Výpadok OSM**: ak sa stojany v noci nepodarí stiahnuť, zverejnia sa posledné dobré dáta a v *Actions* sa zobrazí upozornenie.

## Pred zverejnením pre ľudí

- **Súkromie a cookies**: pri prvej návšteve sa zobrazí krátka informácia (aplikácia nepoužíva cookies, súhlas preto netreba). Podrobnosti sú v menu ☰ → *Súkromie a cookies*. Ak pridáš analytiku alebo inú službu tretej strany, treba text upraviť a zvážiť súhlas.
- Formulár na pridanie zatiaľ nemá ochranu proti robotom ani obmedzenie počtu odoslaní.

## Prevod typov z OSM

| Kategória v aplikácii | Hodnoty OSM tagu `bicycle_parking` |
|---|---|
| Bezpečný stojan | `stands`, `racks`, `wide_stands`, `safe_loops`, `bollard`, `rack`, `two-tier`, `anchors` |
| Uzamykateľný prístrešok alebo box | `shed`, `lockers`, `building` |
| Neformálne miesto | `informal`, `floor` |
| Nevhodný stojan (lámač kolies) | `wall_loops`, `ground_slots`, `handlebar_holder`, `crossbar` |
| Neznámy typ | chýbajúci tag a hodnoty zatiaľ nezaradené: `wave`, `upright_stands`, `saddle_holder`, `tree`, `surface` |

Mapové dáta © prispievatelia OpenStreetMap, licencia ODbL.
