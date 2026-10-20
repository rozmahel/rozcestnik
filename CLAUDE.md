# Rozcestník

Úvodní stránka prohlížeče: vyhledávač, rozcestník na mé vlastní webové aplikace
a plocha z přizpůsobitelných widgetů (hodiny, počasí, poznámky, ...).
Cílem je, aby šly moduly dodělávat postupně, bez zásahu do jádra.

## Technická pravidla
- Jádro je statické: čisté HTML, CSS a JavaScript (ES moduly), bez frameworku a bez build kroku.
  Spouští se jednoduchým lokálním serverem (např. `python3 -m http.server`) nebo ze statického hostingu.
  Přímé otevření `index.html` přes `file://` nefunguje (ES moduly, `fetch` na `apps.json`).
- Malá knihovna (např. pro drag & drop mřížku) je povolená, jen když ušetří hodně práce.
  Vždy ji nejdřív navrhni v plánu a zdůvodni.
- Žádná serverová část (servisní vrstva i RSS čtečka byly odstraněny). Co prohlížeč sám nezvládne
  (např. kvůli CORS), se nedělá, nebo jen přes veřejné zdroje bez klíče, které čtení odjinud dovolí.
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
  nebo jednobarevné (výchozí bledě zelená). Zdroj fotky: Lorem Picsum. Zásoba: 3 další fotky stažené dopředu
  v Cache API (`rozcestnik-foto`), při změně se vezme první z fronty a na konec se dotáhne nová.
  Když se fotka nenačte, zůstane barva. Autor fotky vlevo dole.
- Rychlé odkazy nahoře (`js/quicklinks.js`, data `js/links.js`): v patrech, každé patro je vlastní řádek
  (např. škola, soukromé, hry), bez popisků, jen větší mezera; 4–12 odkazů na řádek, delší patro se zalomí.
  V datech plochý seznam, odkaz má `floor` (1, 2, ...; chybí = první patro).
  Přidání dlaždicí „+“ (v dialogu výběr patra), úprava, přesun a odebrání přes ⋮, přeřazení přetažením,
  i mezi patry; puštění pod poslední patro založí nové. Ikony ze samotné stránky
  (z HTML, pokud ho web dovolí číst, např. GitHub Pages; jinak apple-touch-icon, favicon.ico), jinak barevné písmeno.
  Volitelně (vypnuto) ostřejší ikony přes Google. Vlastní ikona: emoji, adresa obrázku, nebo nahraný obrázek
  (`js/usericons.js`: zmenšený na PNG, uložený v Cache API `rozcestnik-ikony`; v datech jen cesta
  `vlastni-ikony/<název>.png`, při výměně nová cesta; když soubor chybí, výchozí ikona; nepoužité se mažou).
  Zarovnání pater vlevo / na střed / vpravo. Vyhledávač jde přesunout nad odkazy.
- Vpravo nahoře tužka (režim úprav plochy) a ozubené kolo (panel nastavení `js/catalog.js`:
  pozadí, motiv, odkazy, widgety, export/import).
- Pod vyhledávačem plocha widgetů; widgety jsou poloprůhledné karty.

## Vyhledávač
- po otevření je kurzor rovnou v poli (ne na dotykových zařízeních); psaní kdekoli na stránce jde do pole,
- výběr vyhledávače, prefixy (`g dotaz`, `yt dotaz`, ...), ovládání klávesnicí,
- hledá i v rychlých odkazech, v mých aplikacích z `apps.json` a v dostupných widgetech.

## Plánované widgety
1. Hodiny: více časových pásem, analogové nebo digitální.
2. Mé aplikace: mřížka odkazů z `apps.json`, správa (přidat, upravit, smazat, seřadit) přímo v rozhraní.
3. Počasí (zdroj bez API klíče, např. Open-Meteo).
4. Poznámky a úkoly.
5. Pomodoro časovač.
6. Odpočet do události (termíny, zkoušky).
7. Kurzy měn.
8. Kalendář s nadcházejícími událostmi.

Pořadí: nejdřív jádro (mřížka, registr widgetů, vyhledávač, ukládání), pak widgety 1 a 2,
další přidávat po jednom.

## Offline a rychlost (PWA)
- `sw.js`: mimo localhost se vše z vlastního webu bere nejdřív z cache a na pozadí se stáhne nová verze
  (změny se projeví až při dalším otevření). Na localhostu nejdřív ze sítě, ať jsou úpravy hned vidět.
- Nový soubor jádra přidej do `PRECACHE` v `sw.js` a zvyš `VERSION`.

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
