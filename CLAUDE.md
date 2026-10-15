# Rozcestník

Úvodní stránka prohlížeče: vyhledávač, rozcestník na mé vlastní webové aplikace
a plocha z přizpůsobitelných widgetů (hodiny, RSS, počasí, poznámky, ...).
Cílem je, aby šly moduly dodělávat postupně, bez zásahu do jádra.

## Technická pravidla
- Jádro je statické: čisté HTML, CSS a JavaScript (ES moduly), bez frameworku a bez build kroku.
  Spouští se jednoduchým lokálním serverem (např. `python3 -m http.server`) nebo ze statického hostingu.
  Přímé otevření `index.html` přes `file://` nefunguje (ES moduly, `fetch` na `apps.json`).
- Malá knihovna (např. pro drag & drop mřížku) je povolená, jen když ušetří hodně práce.
  Vždy ji nejdřív navrhni v plánu a zdůvodni.
- Funkce, které prohlížeč sám nezvládne (RSS kvůli CORS, kontrola dostupnosti aplikací),
  jdou přes malou servisní vrstvu (lehký Node server nebo Cloudflare Worker).
  Konkrétní řešení navrhni v plánu. Jádro na ní nesmí záviset, bez ní jen daný widget hlásí, že je nedostupný.
- Žádná data nikam neposílat. Vše se ukládá lokálně (localStorage), žádné účty, žádné trackování.
- Odkazy na mé aplikace jsou v `apps.json`, výchozí rychlé odkazy v `links.json`, nikdy napevno v kódu.

## Plocha a widgety (hlavní požadavek)
Uživatel si plochu skládá sám:
- widget lze **zapnout a vypnout** (katalog dostupných widgetů),
- **přesouvat** přetažením, na pevné mřížce,
- **zvětšovat a zmenšovat** (každý widget má minimální a výchozí velikost),
- rozložení a nastavení widgetů se ukládá a jde **exportovat a importovat** jako JSON,
- tlačítko pro obnovení výchozího rozložení.

Každý widget je samostatný soubor v `widgets/` se společným rozhraním:
- `manifest`: id, název, ikona, výchozí a minimální velikost, popis,
- `init(container, ctx)`: vykreslení a spuštění,
- `destroy()`: úklid (časovače, posluchače),
- volitelně `settings`: popis nastavení, které widget nabízí.

Přidání nového widgetu = jeden nový soubor a záznam v registru. Jádro se nemění.
Widget nesmí sahat na DOM mimo svůj kontejner a nesmí shodit ostatní, když selže.

## Úvodní obrazovka (styl Brave)
- Pozadí přes celou stránku (`js/background.js`): fotka, která se mění sama (denně nebo při každém otevření),
  nebo jednobarevné (výchozí bledě zelená). Zdroj fotky: Bing „fotka dne“ přes servisní vrstvu (`/background`),
  bez ní Lorem Picsum. Když se fotka nenačte, zůstane barva. Autor fotky vlevo dole.
- Rychlé odkazy nahoře (`js/quicklinks.js`, data `js/links.js`): 1–3 řádky, 4–12 odkazů na řádek,
  přidání dlaždicí „+“, úprava a odebrání přes ⋮, přeřazení přetažením. Ikony ze samotné stránky
  (z HTML, pokud ho web dovolí číst, např. GitHub Pages; jinak apple-touch-icon, favicon.ico), jinak barevné písmeno.
  Volitelně (vypnuto) ostřejší ikony přes Google. Vyhledávač jde přesunout nad odkazy.
- Vpravo nahoře tužka (režim úprav plochy) a ozubené kolo (panel nastavení `js/catalog.js`:
  pozadí, motiv, odkazy, widgety, servisní vrstva, export/import).
- Pod vyhledávačem plocha widgetů; widgety jsou poloprůhledné karty.

## Vyhledávač
- výběr vyhledávače, prefixy (`g dotaz`, `yt dotaz`, ...), ovládání klávesnicí,
- hledá i v rychlých odkazech, v mých aplikacích z `apps.json` a v dostupných widgetech.

## Plánované widgety
1. Hodiny: více časových pásem, analogové nebo digitální.
2. Mé aplikace: mřížka odkazů z `apps.json`, správa (přidat, upravit, smazat, seřadit) přímo v rozhraní.
3. RSS čtečka: více zdrojů, označení přečtených.
4. Stav aplikací: zelená nebo červená tečka podle dostupnosti (servisní vrstva).
5. Počasí (zdroj bez API klíče, např. Open-Meteo).
6. Poznámky a úkoly.
7. Pomodoro časovač.
8. Odpočet do události (termíny, zkoušky).
9. Kurzy měn.
10. Kalendář s nadcházejícími událostmi.

Pořadí: nejdřív jádro (mřížka, registr widgetů, vyhledávač, ukládání), pak widgety 1 a 2,
další přidávat po jednom.

## Vzhled
- světlý a tmavý režim podle systému s ručním přepnutím,
- responzivní, použitelné i na telefonu,
- čistý, minimalistický styl, žádné zbytečné animace.

## Způsob práce
- Komunikace česky, komentáře v kódu stručné.
- Před větší změnou nejdřív plán (plan mode) a počkat na schválení.
- Po dokončení každého widgetu: kontrola agentem `reviewer`, pak commit s popisným českým textem.
- Jeden widget = jedna session. Mezi nimi `/clear`, ať se kontext nenafukuje.
- Nepřidávej funkce, o které jsem nežádal. Nápady navrhni a nech na mně.
