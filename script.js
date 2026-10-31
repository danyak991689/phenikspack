const API = "https://api.modrinth.com/v2/search";
const PAGE_SIZE = 100;
const TARGET_COUNT = 1000;
const grid = document.querySelector("#packGrid");
const search = document.querySelector("#searchInput");
const filters = document.querySelector("#filterRow");
const favoritesToggle = document.querySelector("#favoritesToggle");
const favoriteCount = document.querySelector("#favoriteCount");
const emptyState = document.querySelector("#emptyState");
const catalogNote = document.querySelector(".catalog-note");
let packs = [];
let activeFilter = "all";
let showFavorites = false;
let favorites = new Set();
try {
  favorites = new Set(JSON.parse(localStorage.getItem("phenikspack-favorites") || "[]"));
} catch (_) {}

function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char];
  });
}
function packCategory(pack) {
  const tags = (pack.categories || []).concat(pack.display_categories || []).map(function (x) { return String(x).toLowerCase().replace(/-/g, "_"); });
  if (tags.some(function (x) { return ["realistic","realism"].includes(x); })) return {key:"realism",label:"РЕАЛИЗМ"};
  if (tags.some(function (x) { return ["combat","pvp"].includes(x); })) return {key:"pvp",label:"PVP"};
  if (tags.some(function (x) { return ["vanilla_like","simplistic"].includes(x); })) return {key:"vanilla",label:"VANILLA"};
  if (tags.some(function (x) { return ["themed","decoration","environment"].includes(x); })) return {key:"atmosphere",label:"АТМОСФЕРА"};
  return {key:"other",label:"ДРУГОЕ"};
}
function projectURL(pack) {
  return "https://modrinth.com/resourcepack/" + encodeURIComponent(pack.slug || pack.project_id);
}
function formatDownloads(value) {
  return new Intl.NumberFormat("ru-RU", {notation:"compact",maximumFractionDigits:1}).format(value || 0);
}
function render() {
  const query = search.value.trim().toLowerCase();
  const sourcePacks = aiAnalysis
    ? Array.from(new Map(packs.concat(aiExtraPacks).map(function (pack) { return [pack.project_id, pack]; })).values())
    : packs;
  const requestedVersionExists = !aiAnalysis || !aiAnalysis.version || sourcePacks.some(function(pack){return (pack.versions||[]).includes(aiAnalysis.version);});
  let visible = sourcePacks.filter(function (pack) {
    const category = packCategory(pack);
    const text = [pack.title, pack.description, pack.author, category.label, (pack.versions || []).join(" ")].join(" ").toLowerCase();
    return (activeFilter === "all" || category.key === activeFilter) &&
      (!aiAnalysis || !aiAnalysis.version || !requestedVersionExists || (pack.versions || []).includes(aiAnalysis.version)) &&
      text.includes(query) && (!showFavorites || favorites.has(pack.project_id));
  });
  if (aiAnalysis && !query && !showFavorites) {
    const rankedPacks = visible.map(function (pack) {
      return {pack:pack, score:scorePackForAI(pack, aiAnalysis)};
    }).sort(function (a,b) { return b.score - a.score; });
    const matchedPacks = rankedPacks.filter(function (item) { return item.score > 0.15; });
    visible = (matchedPacks.length ? matchedPacks : rankedPacks.slice(0, 24)).map(function (item) { return item.pack; });
    aiAnalysis.noExactMatches = matchedPacks.length === 0;
  }
  grid.innerHTML = visible.map(function (pack) {
    const category = packCategory(pack);
    const saved = favorites.has(pack.project_id);
    const cover = pack.icon_url
      ? '<img class="pack-source-icon" src="' + escapeHTML(pack.icon_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="cover-glyph">◇</span>';
    const versions = (pack.versions || []).slice(0, 5).join(", ");
    const moreVersions = (pack.versions || []).length > 5 ? " +" + ((pack.versions || []).length - 5) : "";
    return '<article class="pack-card">' +
      '<div class="pack-cover source-cover">' +
        '<span class="cover-tag">' + escapeHTML(category.label) + '</span>' +
        '<button class="favorite-button ' + (saved ? "saved" : "") + '" data-favorite="' + escapeHTML(pack.project_id) + '" aria-label="' + (saved ? "Убрать из избранного" : "Добавить в избранное") + '">' + (saved ? "♥" : "♡") + '</button>' +
        cover +
        '<span class="cover-number">' + formatDownloads(pack.downloads) + ' загрузок</span>' +
      '</div>' +
      '<div class="pack-info">' +
        '<div class="pack-topline"><span>' + escapeHTML(category.label) + '</span><span>BY ' + escapeHTML(pack.author || "UNKNOWN") + '</span></div>' +
        '<h3>' + escapeHTML(pack.title) + '</h3>' +
        '<p>' + escapeHTML(pack.description || "Описание не указано.") + '</p>' +
        '<div class="pack-bottom"><span class="pack-version">MC ' + escapeHTML(versions || "версии не указаны") + escapeHTML(moreVersions) + '</span>' +
        '<button class="coming-soon source-link details-button" type="button" data-open-pack="' + escapeHTML(pack.project_id) + '">ПОДРОБНЕЕ ↗</button></div>' +
      '</div></article>';
  }).join("");
  emptyState.hidden = visible.length !== 0;
  grid.hidden = visible.length === 0;
  favoriteCount.textContent = favorites.size;
  favoritesToggle.setAttribute("aria-pressed", String(showFavorites));
  favoritesToggle.classList.toggle("active", showFavorites);
  if (catalogNote) catalogNote.innerHTML = '<span class="note-icon">i</span> В каталоге ' + packs.length + ' ресурс-паков. Подробности и скачивание доступны прямо здесь.';
}
async function fetchPacks(offset) {
  const params = new URLSearchParams({
    facets: JSON.stringify([["project_type:resourcepack"]]),
    index: "downloads",
    limit: String(PAGE_SIZE),
    offset: String(offset)
  });
  const response = await fetch(API + "?" + params.toString(), {
    headers: {"Accept":"application/json"}
  });
  if (!response.ok) throw new Error("Modrinth API вернул " + response.status);
  return response.json();
}
async function loadCatalog() {
  if (catalogNote) catalogNote.innerHTML = '<span class="note-icon">…</span> Загружаю популярные ресурс-паки с Modrinth…';
  grid.innerHTML = "";
  try {
    const offsets = Array.from({length:10}, function (_, index) { return index * 100; });
    const pages = await Promise.all(offsets.map(fetchPacks));
    const seen = new Set();
    packs = pages.flatMap(function (page) { return page.hits || []; }).filter(function (pack) {
      if (!pack.project_id || seen.has(pack.project_id)) return false;
      seen.add(pack.project_id);
      return true;
    }).slice(0, TARGET_COUNT);
    if (!packs.length) throw new Error("Modrinth не вернул ресурс-паки.");
    render();
  } catch (error) {
    console.error(error);
    if (catalogNote) catalogNote.innerHTML = '<span class="note-icon">!</span> Не удалось загрузить каталог из Modrinth. Проверь подключение и обнови страницу.';
    grid.innerHTML = '<div class="catalog-load-error">Не удалось получить список ресурс-паков. <button class="text-button" id="retryCatalog">Повторить</button></div>';
    grid.hidden = false;
    const retry = document.querySelector("#retryCatalog");
    if (retry) retry.addEventListener("click", loadCatalog);
  }
}
filters.addEventListener("click", function (event) {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  filters.querySelectorAll(".filter-chip").forEach(function (chip) {
    chip.classList.toggle("active", chip === button);
  });
  render();
});
grid.addEventListener("click", function (event) {
  const openButton = event.target.closest("[data-open-pack]");
  if (openButton) {
    openPackDetails(openButton.dataset.openPack);
    return;
  }
  const button = event.target.closest("[data-favorite]");
  if (!button) return;
  const id = button.dataset.favorite;
  if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
  localStorage.setItem("phenikspack-favorites", JSON.stringify(Array.from(favorites)));
  render();
});
const searchClear = document.querySelector("#searchClear");
function updateSearchClear() {
  if (searchClear) searchClear.hidden = !search.value;
}
search.addEventListener("input", function () {
  resetAIState();
  updateSearchClear();
  render();
});
search.addEventListener("search", function () {
  resetAIState();
  updateSearchClear();
  render();
});
if (searchClear) searchClear.addEventListener("click", function () {
  search.value = "";
  resetAIState();
  activeFilter = "all";
  showFavorites = false;
  filters.querySelectorAll(".filter-chip").forEach(function (chip) {
    chip.classList.toggle("active", chip.dataset.filter === "all");
  });
  updateSearchClear();
  render();
  search.focus();
});
favoritesToggle.addEventListener("click", function () {
  showFavorites = !showFavorites;
  render();
});
document.querySelector("#resetFilters").addEventListener("click", function () {
  resetAIState();
  activeFilter = "all";
  showFavorites = false;
  search.value = "";
  filters.querySelectorAll(".filter-chip").forEach(function (chip) {
    chip.classList.toggle("active", chip.dataset.filter === "all");
  });
  render();
});
document.addEventListener("keydown", function (event) {
  if (event.key === "/" && !["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    search.focus();
  }
  if (event.key === "Escape") search.blur();
});
const menuToggle = document.querySelector("#menuToggle");
const nav = document.querySelector(".nav-links");
menuToggle.addEventListener("click", function () {
  const opened = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(opened));
});
nav.querySelectorAll("a").forEach(function (link) {
  link.addEventListener("click", function () {
    nav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  });
});

/* In-site resource-pack details and downloads */
const detailModal = document.createElement("div");
detailModal.className = "pack-modal";
detailModal.id = "packModal";
detailModal.hidden = true;
detailModal.innerHTML = '<div class="pack-modal-backdrop" data-close-modal></div>' +
  '<section class="pack-modal-panel" role="dialog" aria-modal="true" aria-labelledby="packModalTitle">' +
    '<button class="pack-modal-close" type="button" aria-label="Закрыть" data-close-modal>×</button>' +
    '<div class="pack-modal-content" id="packModalContent"><div class="modal-loading">Загружаю информацию о ресурспаке…</div></div>' +
  '</section>';
document.body.appendChild(detailModal);
let activePackVersions = [];

function formatBytes(bytes) {
  if (!bytes) return "размер неизвестен";
  const units = ["Б","КБ","МБ","ГБ"];
  let size = bytes, unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return new Intl.NumberFormat("ru-RU", {maximumFractionDigits:1}).format(size) + " " + units[unit];
}
function selectedVersion() {
  const select = detailModal.querySelector("#packVersionSelect");
  return activePackVersions.find(function (version) { return version.id === (select && select.value); }) || activePackVersions[0];
}
function renderVersionFiles(version) {
  const target = detailModal.querySelector("#packDownloadArea");
  if (!target) return;
  const files = version && version.files ? version.files : [];
  const file = files.find(function (item) { return item.primary; }) || files[0];
  if (!file) {
    target.innerHTML = '<p class="modal-muted">Для этой версии пока нет доступного файла.</p>';
    return;
  }
  target.innerHTML = '<a class="button button-primary modal-download" href="' + escapeHTML(file.url) + '" download="' + escapeHTML(file.filename) + '">Скачать ZIP <span>↓</span></a>' +
    '<span class="modal-file-meta">' + escapeHTML(file.filename) + ' · ' + formatBytes(file.size) + '</span>';
}
async function openPackDetails(projectId) {
  const pack = packs.find(function (item) { return item.project_id === projectId; });
  if (!pack) return;
  detailModal.hidden = false;
  document.body.classList.add("modal-open");
  detailModal.querySelector("#packModalContent").innerHTML = '<div class="modal-loading">Загружаю описание, версии и файлы…</div>';
  try {
    const responses = await Promise.all([
      fetch("https://api.modrinth.com/v2/project/" + encodeURIComponent(projectId)),
      fetch("https://api.modrinth.com/v2/project/" + encodeURIComponent(projectId) + "/version?include_changelog=false")
    ]);
    if (!responses[0].ok || !responses[1].ok) throw new Error("Не удалось получить данные проекта");
    const project = await responses[0].json();
    activePackVersions = await responses[1].json();
    const latest = activePackVersions[0];
    const gallery = (project.gallery || []).slice(0, 6);
    const galleryHTML = gallery.length
      ? '<div class="modal-gallery">' + gallery.map(function (item) {
          return '<img src="' + escapeHTML(item.url) + '" alt="' + escapeHTML(item.title || project.title) + '" loading="lazy">';
        }).join("") + '</div>'
      : "";
    const versionOptions = activePackVersions.map(function (version) {
      return '<option value="' + escapeHTML(version.id) + '">' + escapeHTML(version.version_number || version.name || "Версия") +
        ' · ' + escapeHTML((version.game_versions || []).slice(-4).join(", ") || "Minecraft") +
        ' · ' + escapeHTML(version.version_type || "release") + '</option>';
    }).join("");
    detailModal.querySelector("#packModalContent").innerHTML =
      '<div class="modal-eyebrow">PHENIKSPACK / RESOURCE PACK</div>' +
      '<div class="modal-title-row">' +
        (project.icon_url ? '<img class="modal-icon" src="' + escapeHTML(project.icon_url) + '" alt="">' : '') +
        '<div><h2 id="packModalTitle">' + escapeHTML(project.title || pack.title) + '</h2>' +
        '<p class="modal-muted">Автор: ' + escapeHTML(project.author || pack.author || "неизвестен") +
        ' · ' + formatDownloads(project.downloads || pack.downloads) + ' загрузок</p></div>' +
      '</div>' +
      '<p class="modal-description">' + escapeHTML(project.description || pack.description || "Описание не указано.") + '</p>' +
      galleryHTML +
      '<div class="modal-stats"><span>Поддержка Minecraft: <b>' + escapeHTML((project.game_versions || pack.versions || []).slice(-8).join(", ") || "не указана") + '</b></span>' +
      '<span>Лицензия: <b>' + escapeHTML((project.license && (project.license.name || project.license.id)) || "не указана") + '</b></span></div>' +
      '<div class="modal-download-section"><label for="packVersionSelect">Выбери версию</label>' +
        (versionOptions ? '<select id="packVersionSelect">' + versionOptions + '</select>' : '<p class="modal-muted">Версии пока не опубликованы.</p>') +
        '<div id="packDownloadArea"></div></div>' +
      '<a class="modal-project-link" href="' + escapeHTML(projectURL(pack)) + '" target="_blank" rel="noopener noreferrer">Страница проекта и полная информация на Modrinth ↗</a>';
    const select = detailModal.querySelector("#packVersionSelect");
    if (select) {
      select.addEventListener("change", function () { renderVersionFiles(selectedVersion()); });
      if (latest) renderVersionFiles(latest);
    }
  } catch (error) {
    console.error(error);
    detailModal.querySelector("#packModalContent").innerHTML =
      '<div class="modal-loading">Не удалось загрузить подробности. Проверь подключение и попробуй ещё раз.' +
      '<button class="text-button" type="button" id="retryPackDetails">Повторить</button></div>';
    const retry = detailModal.querySelector("#retryPackDetails");
    if (retry) retry.addEventListener("click", function () { openPackDetails(projectId); });
  }
}
function closePackModal() {
  detailModal.hidden = true;
  document.body.classList.remove("modal-open");
}
detailModal.addEventListener("click", function (event) {
  if (event.target.closest("[data-close-modal]")) closePackModal();
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !detailModal.hidden) closePackModal();
});


/* PHENIKS AI — multilingual intent parser + relevance ranking */
let aiAnalysis = null;
const aiNote = document.querySelector("#aiResultNote");
const aiForm = document.querySelector("#aiSearchForm");
const aiInput = document.querySelector("#aiQueryInput");
let aiExtraPacks = [];
let aiSearchRequest = 0;

const AI_CONCEPTS = {
  pvp:{name:"PvP",search:"pvp",aliases:["pvp","пвп","для пвп","для дуэлей","дуэль","дуэли","арена","комбат","combat","crystal pvp","кристаллы","тотем","мечи","короткие мечи","short swords","low fire","низкий огонь","маленький прицел","crosshair"]},
  realism:{name:"реализм",search:"realistic",aliases:["реализм","реалист","реалистичный","реалистичная","реалистичные","фотореализм","фотореалистичный","realistic","realism","photoreal","pbr","реальные текстуры","как в жизни"]},
  vanilla:{name:"ванильный стиль",search:"vanilla",aliases:["ваниль","ванильный","ванильная","ванильные","ванилла","vanilla","default","стандартные текстуры","обычный майнкрафт","как в оригинале","почти как стандарт","не менять стиль"]},
  faithful:{name:"Faithful / улучшенная ваниль",search:"faithful",aliases:["faithful","фейтфул","32x","64x","128x","улучшенная ваниль","ваниль но лучше","ванильные текстуры в высоком разрешении"]},
  simplistic:{name:"минимализм",search:"simplistic",aliases:["минимализм","минималистичный","минималистичный стиль","простые текстуры","мультяшный","мультяшные","bare bones","barebones","плоский стиль","упрощенный","упрощённый"]},
  atmosphere:{name:"атмосфера",search:"fantasy",aliases:["атмосфер","атмосферный","атмосферная","погружение","иммерсивный","immersion","fantasy","фэнтези","сказочный","сказка","уютный","уютная","мрачная атмосфера","aesthetic"]},
  pink:{name:"розовый",search:"pink",aliases:["розов","пинк","pink","фуксия","малинов","пастельно розов","нежно розов"]},
  blue:{name:"синий / голубой",search:"blue",aliases:["голуб","син","blue","cyan","аквамарин","бирюз","лазур","небесно голуб","сапфир"]},
  purple:{name:"фиолетовый",search:"purple",aliases:["фиолет","лилов","сирен","лаванд","purple","violet","lavender"]},
  dark:{name:"тёмный",search:"dark",aliases:["темн","тёмн","мрач","черн","чёрн","black","dark","night","ночн","готичес","horror","хоррор"]},
  green:{name:"зелёный",search:"green",aliases:["зелен","зелён","изумруд","лайм","green","emerald","lime"]},
  red:{name:"красный",search:"red",aliases:["красн","алый","бордов","red","crimson","scarlet"]},
  white:{name:"белый / светлый",search:"white",aliases:["бел","светл","снеж","white","snow","ледян","лед","ice"]},
  orange:{name:"оранжевый",search:"orange",aliases:["оранж","янтар","orange","amber"]},
  yellow:{name:"жёлтый / золотой",search:"yellow",aliases:["желт","жёлт","золот","yellow","gold"]},
  performance:{name:"лёгкий для FPS",search:"low resolution",aliases:["фпс","fps","слабый пк","слабого пк","слабом компьютере","производительност","оптимизац","легкий","лёгкий","мало весит","без лагов","не нагружает","low end","low resolution","16x","8x"]},
  sky:{name:"небо",search:"sky",aliases:["небо","небеса","облак","облака","закат","рассвет","звезд","звёзд","луна","солнце","sky","cloud","sunset","stars","moon"]},
  water:{name:"вода",search:"water",aliases:["вод","океан","море","река","water","ocean","реалистичная вода","прозрачная вода"]},
  mobs:{name:"мобы и анимации",search:"mobs",aliases:["моб","мобы","животн","зомби","скелет","крипер","анимац","движения существ","fresh animations","entity","entities"]},
  gui:{name:"интерфейс",search:"gui",aliases:["интерфейс","gui","hud","худ","инвентарь","меню","иконки","прицел","контрастный интерфейс"]},
  items:{name:"предметы и оружие",search:"items",aliases:["предмет","предметы","оруж","меч","мечи","инструмент","иконк","items","weapons","tools"]},
  blocks:{name:"блоки и окружение",search:"blocks",aliases:["блок","блоки","строительств","окружение","terrain","blocks","дерев","трава","камень","руда"]},
  medieval:{name:"средневековье",search:"medieval",aliases:["средневек","рыцар","замок","medieval","knight","castle","фэнтези средневек"]},
  sci_fi:{name:"фантастика / sci-fi",search:"sci fi",aliases:["sci fi","sci-fi","фантастик","космос","киберпанк","cyberpunk","футурист","технологич"]},
  anime:{name:"аниме",search:"anime",aliases:["аниме","anime","манга","manga","японский стиль"]},
  horror:{name:"хоррор",search:"horror",aliases:["хоррор","ужас","страшный","страшные","horror","spooky","жуткий","зловещ"]},
  cute:{name:"милый стиль",search:"cute",aliases:["милый","милые","няшный","cute","kawaii","пастельный","пастельные"]},
  x16:{name:"16x",search:"16x",aliases:["16x","16 на 16","16 пиксел"]},
  x32:{name:"32x",search:"32x",aliases:["32x","32 на 32","32 пиксел"]},
  x64:{name:"64x",search:"64x",aliases:["64x","64 на 64","64 пиксел"]},
  x128:{name:"128x",search:"128x",aliases:["128x","128 на 128","128 пиксел"]},
  x256:{name:"256x",search:"256x",aliases:["256x","256 на 256","256 пиксел"]}
};

function normalizeAIText(value){
  return String(value||"").toLowerCase().replace(/ё/g,"е").replace(/[’']/g,"").replace(/[^a-zа-я0-9.+-]+/g," ").replace(/\s+/g," ").trim();
}
function aiAliasMatches(normalized,alias){
  const a=normalizeAIText(alias);
  if(!a)return false;
  if(a.includes(" "))return (" "+normalized+" ").includes(" "+a+" ");
  const tokens=normalized.split(" ");
  return tokens.some(function(token){
    if(token===a)return true;
    if(a.length>=4 && token.length>=4 && (token.startsWith(a)||a.startsWith(token)))return true;
    return false;
  });
}
function analyzeUserQuery(query){
  const normalized=normalizeAIText(query);
  const labels=[];
  const negatives=[];
  Object.keys(AI_CONCEPTS).forEach(function(key){
    const concept=AI_CONCEPTS[key];
    const hits=concept.aliases.filter(function(alias){return aiAliasMatches(normalized,alias);});
    if(!hits.length)return;
    const isNegated=hits.some(function(alias){
      const phrase=normalizeAIText(alias);
      const at=normalized.indexOf(phrase);
      const before=normalized.slice(Math.max(0,at-15),at);
      return /(?:не|без|никак не|не нужен|не нужна|не нужны)$/.test(before.trim());
    });
    if(isNegated){negatives.push(key);return;}
    labels.push({label:key,score:Math.min(1.5,0.72+hits.length*0.12),matched:hits});
  });
  const versionMatches=normalized.match(/\b1\.\d{1,2}(?:\.\d{1,2})?\b/g)||[];
  const resolution=(normalized.match(/\b(8|16|32|64|128|256|512)x\b/)||[])[0]||null;
  const intent=labels.some(function(x){return ["pvp","performance","realism","vanilla","faithful","simplistic","atmosphere","mobs","gui","items","blocks"].includes(x.label);});
  const terms=normalized.split(" ").filter(function(w){return w.length>2&&!/^(для|мне|нужен|нужна|нужно|хочу|найди|подбери|ресурспак|ресурс|пак|текстуры|майнкрафт|minecraft|версия|на|под|чтобы|который|есть|были|было|с|и|или|в|во|по|из|как)$/.test(w);});
  return {query:query,normalized:normalized,labels:labels,negativeLabels:negatives,version:versionMatches[versionMatches.length-1]||null,resolution:resolution,terms:terms,intent:intent};
}
function getPackSearchText(pack){
  return normalizeAIText([
    pack.title,pack.description,pack.author,
    (pack.categories||[]).join(" "),(pack.display_categories||[]).join(" "),
    (pack.versions||[]).join(" ")
  ].join(" "));
}
function scorePackForAI(pack,analysis){
  const text=getPackSearchText(pack);
  const tokens=new Set(text.split(" "));
  let score=0;
  let matched=0;
  analysis.labels.forEach(function(item){
    const concept=AI_CONCEPTS[item.label];
    const aliases=concept.aliases;
    const hits=aliases.filter(function(alias){return aiAliasMatches(text,alias);});
    if(hits.length){
      matched++;
      score+=Math.min(2.2,item.score*(hits.length>1?1.18:1));
      if(normalizeAIText(pack.title).includes(normalizeAIText(hits[0])))score+=0.65;
    }
  });
  analysis.negativeLabels.forEach(function(key){
    const concept=AI_CONCEPTS[key];
    if(concept.aliases.some(function(alias){return aiAliasMatches(text,alias);}))score-=2.5;
  });
  if(analysis.version){
    if((pack.versions||[]).includes(analysis.version))score+=2.5;
    else score-=0.7;
  }
  if(analysis.resolution){
    if(text.includes(analysis.resolution))score+=1.1;
    else if(analysis.resolution==="16x" && /8x|16x/.test(text))score+=0.25;
  }
  analysis.terms.forEach(function(term){
    if(tokens.has(term))score+=0.12;
    else if(term.length>=5 && text.split(" ").some(function(t){return t.startsWith(term)||term.startsWith(t)&&t.length>=4;}))score+=0.045;
  });
  if(pack.project_type==="resourcepack")score+=0.08;
  if(aiExtraPacks.some(function(p){return p.project_id===pack.project_id;}))score+=0.08;
  return score;
}
function updateAIStatus(message){
  if(aiNote)aiNote.textContent=message;
}
function resetAIState(){
  aiAnalysis=null;
  aiExtraPacks=[];
  if(aiInput)aiInput.value="";
  updateAIStatus("Опиши желаемый ресурспак: например, «мрачный средневековый стиль, реалистичная вода, красивые облака, 32x для 1.21.11».");
}
async function fetchAIPacks(analysis){
  const queries=[];
  if(analysis.query.trim())queries.push(analysis.query.trim());
  analysis.labels.forEach(function(item){
    const term=AI_CONCEPTS[item.label]&&AI_CONCEPTS[item.label].search;
    if(term)queries.push(term);
  });
  if(analysis.resolution)queries.push(analysis.resolution);
  const unique=Array.from(new Set(queries)).slice(0,5);
  const responses=await Promise.all(unique.map(async function(term){
    const params=new URLSearchParams({
      query:term,
      facets:JSON.stringify([["project_type:resourcepack"]]),
      index:"relevance",
      limit:"100"
    });
    const response=await fetch(API+"?"+params.toString(),{headers:{"Accept":"application/json"}});
    if(!response.ok)throw new Error("Modrinth search "+response.status);
    return response.json();
  }));
  const byId=new Map();
  responses.forEach(function(page,index){
    (page.hits||[]).forEach(function(pack){
      if(!pack.project_id)return;
      if(!byId.has(pack.project_id))byId.set(pack.project_id,pack);
    });
  });
  return Array.from(byId.values());
}
async function runAISearch(){
  const query=aiInput.value.trim();
  if(!query){updateAIStatus("Напиши запрос — можно подробно, обычными словами.");return;}
  const requestId=++aiSearchRequest;
  aiAnalysis=analyzeUserQuery(query);
  aiExtraPacks=[];
  activeFilter="all";
  showFavorites=false;
  search.value="";
  updateSearchClear();
  filters.querySelectorAll(".filter-chip").forEach(function(chip){chip.classList.toggle("active",chip.dataset.filter==="all");});
  render();
  const found=aiAnalysis.labels.map(function(item){return AI_CONCEPTS[item.label].name;});
  updateAIStatus("Разбираю запрос и ищу подходящие паки на Modrinth…");
  try{
    aiExtraPacks=await fetchAIPacks(aiAnalysis);
    if(requestId!==aiSearchRequest)return;
    render();
    const count=grid.querySelectorAll(".pack-card").length;
    aiAnalysis.versionNotFound=!!(aiAnalysis.version && !aiExtraPacks.concat(packs).some(function(p){return (p.versions||[]).includes(aiAnalysis.version);}));
    const parts=[];
    if(found.length)parts.push("Понял: "+found.join(", "));
    if(aiAnalysis.version)parts.push("Minecraft "+aiAnalysis.version);
    if(aiAnalysis.resolution)parts.push(aiAnalysis.resolution);
    if(!parts.length)parts.push("общий поиск по описанию");
    const exact=aiAnalysis.labels.length>0||aiAnalysis.version||aiAnalysis.terms.length>0;
    if(aiAnalysis.versionNotFound)parts.push("точного совпадения версии нет — показаны близкие варианты");
    updateAIStatus(parts.join(" · ")+". Подобрал "+count+" вариантов. "+(aiAnalysis.labels.length?"Результаты отсортированы по совпадению с запросом.":"Показаны результаты поиска Modrinth."));
  }catch(error){
    console.error(error);
    if(requestId!==aiSearchRequest)return;
    render();
    updateAIStatus("Не удалось выполнить расширенный поиск Modrinth. Показываю совпадения из уже загруженного каталога.");
  }
}
if(aiForm)aiForm.addEventListener("submit",function(event){event.preventDefault();runAISearch();});

/* PHENIKS companion cat */
(function initPheniksCat() {
  const cat = document.createElement("button");
  cat.type = "button";
  cat.className = "pheniks-cat walking";
  cat.setAttribute("aria-label","Котик PHENIKS AI");
  cat.innerHTML = '<span class="cat-bubble" aria-live="polite">Мяу! Я слежу за ресурс-паками.</span>' +
    '<span class="cat-body">' +
      '<svg class="cat-art" viewBox="0 0 140 90" role="img" aria-label="Чёрный пушистый кот">' +
        '<defs><linearGradient id="catFur" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#514e5a"/><stop offset=".48" stop-color="#302e38"/><stop offset="1" stop-color="#17171e"/></linearGradient><linearGradient id="catChest" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#77717d" stop-opacity=".55"/><stop offset="1" stop-color="#302e38" stop-opacity="0"/></linearGradient></defs>' +
        '<path class="cat-tail" d="M34 57 C16 63 7 53 12 39 C16 28 28 30 27 40 C26 45 21 46 19 42" fill="none" stroke="#24232d" stroke-width="10" stroke-linecap="round"/>' +
        '<path d="M34 52 Q35 37 54 36 Q75 32 96 44 Q108 51 106 64 Q104 76 85 76 L49 75 Q31 72 34 52Z" fill="url(#catFur)" stroke="#17161d" stroke-width="1.4"/>' +
        '<path d="M42 45 Q58 36 77 43 Q88 47 91 64 Q78 71 62 68 Q48 65 42 45Z" fill="url(#catChest)" opacity=".8"/>' +
        '<path class="cat-leg leg-back-a" d="M45 66 Q43 74 40 79 L48 80" fill="none" stroke="#292832" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path class="cat-leg leg-back-b" d="M61 67 Q61 75 57 80 L65 81" fill="none" stroke="#24232c" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path class="cat-leg leg-front-a" d="M85 65 Q88 73 85 80 L94 80" fill="none" stroke="#373540" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path class="cat-leg leg-front-b" d="M99 62 Q105 69 103 78 L112 78" fill="none" stroke="#292832" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M78 43 Q77 25 91 18 Q103 10 117 20 Q129 29 123 46 Q119 61 103 62 Q84 60 78 43Z" fill="url(#catFur)" stroke="#17161d" stroke-width="1.5"/>' +
        '<path d="M83 29 L80 8 Q80 3 86 7 L101 20 M108 19 L121 5 Q126 2 126 9 L124 31" fill="#302e38" stroke="#17161d" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M85 13 L88 24 L97 21Z M113 21 L122 11 L120 26Z" fill="#b97983" opacity=".9"/>' +
        '<ellipse cx="94" cy="39" rx="3.1" ry="4.2" fill="#f4b45f"/><ellipse cx="113" cy="39" rx="3.1" ry="4.2" fill="#f4b45f"/>' +
        '<ellipse cx="95" cy="39" rx="1.1" ry="2.8" fill="#17151b"/><ellipse cx="114" cy="39" rx="1.1" ry="2.8" fill="#17151b"/>' +
        '<path d="M102 48 Q105 45 108 48 Q105 52 102 48Z" fill="#d88991"/><path d="M105 51 Q102 56 98 53 M105 51 Q109 56 113 53" fill="none" stroke="#d88991" stroke-width="1.4" stroke-linecap="round"/>' +
        '<path d="M94 49 L79 46 M94 53 L78 55 M115 49 L131 46 M115 53 L131 56" stroke="#aaa3b0" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>' +
        '<path d="M37 49 Q40 43 44 41 M49 39 Q53 35 58 35 M66 38 Q71 37 75 40" fill="none" stroke="#77717e" stroke-width="1.1" opacity=".5" stroke-linecap="round"/>' +
      '</svg>' +
    '</span><span class="cat-name">PHENIKS AI</span>';
  document.body.appendChild(cat);

  const messages = [
    "Мяу! Ищу самые красивые текстуры.",
    "Кажется, этот ресурспак мне нравится.",
    "Не трогай, я охраняю каталог.",
    "Проверяю, нет ли тут чего-нибудь розового...",
    "Уф... столько ресурспаков. Нужен сон.",
    "Мр-р-р. Хороший выбор!"
  ];
  let x = Math.max(12, Math.min(window.innerWidth - 100, 34));
  let y = Math.max(110, window.innerHeight * 0.68);
  let direction = 1;
  let sleepingOn = null;
  let timer = null;
  let bubbleTimer = null;
  let asleep = false;

  function position() {
    cat.style.left = x + "px";
    cat.style.top = y + "px";
    cat.classList.toggle("facing-left", direction < 0);
  }
  function say(message) {
    const bubble = cat.querySelector(".cat-bubble");
    bubble.textContent = message;
    bubble.classList.add("visible");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.classList.remove("visible"); }, 3200);
  }
  function schedule(fn, delay) {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  }
  function walk() {
    asleep = false;
    sleepingOn = null;
    cat.classList.remove("sleeping");
    cat.classList.add("walking");
    const maxX = Math.max(8, window.innerWidth - 105);
    if (x > maxX - 15) direction = -1;
    else if (x < 15) direction = 1;
    else if (Math.random() < 0.32) direction *= -1;
    x = Math.max(8, Math.min(maxX, x + direction * (100 + Math.random() * 180)));
    y = Math.max(105, Math.min(window.innerHeight - 105, window.innerHeight * (0.58 + Math.random() * 0.17)));
    position();
    if (Math.random() < 0.2) say(messages[Math.floor(Math.random() * messages.length)]);
    schedule(function () {
      if (Math.random() < 0.34) napOnPack();
      else walk();
    }, 2600 + Math.random() * 3200);
  }
  function napOnPack() {
    const cards = Array.from(document.querySelectorAll(".pack-card")).filter(function (card) {
      const rect = card.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 80 && rect.top < window.innerHeight - 35;
    });
    if (!cards.length) { walk(); return; }
    sleepingOn = cards[Math.floor(Math.random() * cards.length)];
    const rect = sleepingOn.getBoundingClientRect();
    x = Math.max(6, Math.min(window.innerWidth - 100, rect.left + rect.width * (0.55 + Math.random() * 0.2) - 42));
    y = Math.max(82, rect.top - 45);
    asleep = true;
    cat.classList.remove("walking");
    cat.classList.add("sleeping");
    position();
    say("Мр-р-р... этот пак такой уютный...");
    schedule(function () {
      asleep = false;
      sleepingOn = null;
      cat.classList.remove("sleeping");
      cat.classList.add("waking");
      say("Потягушки! Пора дальше.");
      schedule(walk, 1300);
    }, 6500 + Math.random() * 6500);
  }
  cat.addEventListener("click", function () {
    if (asleep) {
      clearTimeout(timer);
      asleep = false;
      sleepingOn = null;
      cat.classList.remove("sleeping");
      cat.classList.add("waking");
      say("Ой! Разбудили. Мяу!");
      schedule(walk, 1100);
    } else {
      say(messages[Math.floor(Math.random() * messages.length)]);
    }
  });
  window.addEventListener("resize", function () {
    x = Math.min(x, window.innerWidth - 100);
    if (asleep && sleepingOn && sleepingOn.isConnected) {
      const rect = sleepingOn.getBoundingClientRect();
      x = Math.max(6, Math.min(window.innerWidth - 100, rect.left + rect.width * 0.65 - 42));
      y = Math.max(82, rect.top - 45);
    }
    position();
  });
  window.addEventListener("scroll", function () {
    if (asleep && sleepingOn && sleepingOn.isConnected) {
      const rect = sleepingOn.getBoundingClientRect();
      x = Math.max(6, Math.min(window.innerWidth - 100, rect.left + rect.width * 0.65 - 42));
      y = Math.max(82, rect.top - 45);
      position();
    }
  }, {passive:true});
  position();
  say("Привет! Я котик PHENIKS AI.");
  schedule(walk, 2600);
})();


/* Interactive Halloween decorations */
(function initHalloweenDecor() {
  const ghostButton = document.getElementById("ghostButton");
  const pumpkinButton = document.getElementById("pumpkinButton");
  const potionButton = document.getElementById("potionButton");
  const message = document.getElementById("spookyMessage");
  if (!ghostButton || !pumpkinButton || !potionButton || !message) return;

  const ghostLines = [
    "Бу-у! Я всего лишь дружелюбный призрак каталога.",
    "Говорят, в полночь даже ресурспаки оживают…",
    "Я видел пак, от которого скелеты стали стильными.",
    "Не бойся темноты. Бойся несовместимых версий.",
    "Мяу? Ой, это котик научил меня здороваться."
  ];
  const potionLines = [
    "Зелье скорости! Баты теперь летают быстрее.",
    "Зелье ночного зрения: теперь видно каждый пиксель.",
    "Зелье удачи! Пусть выпадет идеальный ресурспак.",
    "Зелье огня! Тыквы засияли ярче.",
    "Зелье невидимости… где кнопка? Я её потерял."
  ];
  let toastTimer = null;

  function showMessage(text) {
    message.textContent = text;
    let toast = document.querySelector(".spooky-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "spooky-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("visible"); }, 2600);
  }
  function sparkleBurst(count) {
    for (let i = 0; i < count; i++) {
      const spark = document.createElement("span");
      spark.className = "spooky-spark";
      spark.setAttribute("aria-hidden", "true");
      spark.style.left = (18 + Math.random() * 64) + "vw";
      spark.style.top = (18 + Math.random() * 58) + "vh";
      spark.style.setProperty("--spark-x", (Math.random() * 100 - 50) + "px");
      spark.style.setProperty("--spark-y", (Math.random() * -100 - 20) + "px");
      document.body.appendChild(spark);
      setTimeout(function () { spark.remove(); }, 900);
    }
  }

  ghostButton.addEventListener("click", function () {
    showMessage(ghostLines[Math.floor(Math.random() * ghostLines.length)]);
    ghostButton.classList.add("active");
    setTimeout(function () { ghostButton.classList.remove("active"); }, 900);
    sparkleBurst(7);
  });
  pumpkinButton.addEventListener("click", function () {
    const active = document.body.classList.toggle("haunted-lanterns");
    pumpkinButton.classList.toggle("active", active);
    pumpkinButton.querySelector("span").textContent = active ? "Погасить" : "Огоньки";
    showMessage(active ? "Все тыквы зажглись. Теперь здесь по-настоящему жутко уютно." : "Фонарики погасли. Но кто-то всё ещё шуршит в темноте…");
    if (active) sparkleBurst(12);
  });
  potionButton.addEventListener("click", function () {
    const active = document.body.classList.toggle("haunted-bats");
    potionButton.classList.toggle("active", active);
    showMessage(potionLines[Math.floor(Math.random() * potionLines.length)]);
    sparkleBurst(16);
  });

  // Small floating bats drift through the hero; no external assets required.
  const sky = document.querySelector(".spooky-scenery");
  if (sky) {
    for (let i = 0; i < 4; i++) {
      const bat = document.createElement("span");
      bat.className = "spooky-bat generated-bat";
      bat.textContent = "🦇";
      bat.style.left = (12 + i * 19) + "%";
      bat.style.top = (24 + (i % 2) * 34) + "%";
      bat.style.animationDelay = (-i * 1.7) + "s";
      bat.style.fontSize = (13 + (i % 3) * 4) + "px";
      sky.appendChild(bat);
    }
  }

  // A small seasonal sparkle on pointer movement, throttled naturally by distance.
  let lastX = -100, lastY = -100;
  document.addEventListener("pointermove", function (event) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (Math.hypot(event.clientX - lastX, event.clientY - lastY) < 90) return;
    lastX = event.clientX;
    lastY = event.clientY;
    const dot = document.createElement("span");
    dot.className = "spooky-spark";
    dot.style.left = event.clientX + "px";
    dot.style.top = event.clientY + "px";
    dot.style.setProperty("--spark-x", (Math.random() * 28 - 14) + "px");
    dot.style.setProperty("--spark-y", (Math.random() * -32 - 8) + "px");
    document.body.appendChild(dot);
    setTimeout(function () { dot.remove(); }, 850);
  }, {passive:true});
})();


/* Giant sword descends and dissolves in a beam of light on resource-pack download */
(function initSwordDownloadEffect() {
  let activeOverlay = null;
  const swordArt =
    '<svg class="sword-art" viewBox="0 0 120 440" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="bladeSteel" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#536477"/><stop offset=".22" stop-color="#e8f5ff"/><stop offset=".48" stop-color="#fff"/><stop offset=".72" stop-color="#a7c4d9"/><stop offset="1" stop-color="#35485e"/></linearGradient>' +
        '<linearGradient id="goldGuard" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff0a8"/><stop offset=".45" stop-color="#d49a3e"/><stop offset="1" stop-color="#75451f"/></linearGradient>' +
        '<linearGradient id="gripLeather" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#241c20"/><stop offset=".5" stop-color="#8a4c36"/><stop offset="1" stop-color="#21191e"/></linearGradient>' +
      '</defs>' +
      '<path d="M60 5 L89 292 L60 330 L31 292 Z" fill="#243244" opacity=".7"/>' +
      '<path d="M60 5 L82 286 L60 316 L38 286 Z" fill="url(#bladeSteel)" stroke="#e8f4ff" stroke-width="2"/>' +
      '<path d="M60 14 L60 310 L43 285 Z" fill="#fff" opacity=".42"/>' +
      '<path d="M38 282 L82 282 L91 303 Q60 324 29 303 Z" fill="url(#goldGuard)" stroke="#fff0bb" stroke-width="3"/>' +
      '<path d="M26 299 Q60 325 94 299 L104 312 Q60 354 16 312 Z" fill="url(#goldGuard)" stroke="#a66a2d" stroke-width="3"/>' +
      '<path d="M54 326 L66 326 L70 398 L50 398 Z" fill="url(#gripLeather)" stroke="#d5a36b" stroke-width="2"/>' +
      '<path d="M50 341 L70 351 M50 358 L70 368 M50 375 L70 385" stroke="#e4c18c" stroke-width="5"/>' +
      '<path d="M43 399 Q60 389 77 399 L82 420 Q60 435 38 420 Z" fill="url(#goldGuard)" stroke="#fff0bb" stroke-width="3"/>' +
      '<circle cx="60" cy="412" r="7" fill="#dff7ff" stroke="#80512c" stroke-width="3"/>' +
      '<path d="M60 8 L60 315" stroke="#fff" stroke-width="2" opacity=".55"/>' +
    '</svg>';
  function playSwordDissolve() {
    if (activeOverlay) activeOverlay.remove();
    const overlay = document.createElement("div");
    overlay.className = "sword-effect-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML =
      '<div class="sword-effect-scene">' +
        '<div class="sword-aura"></div>' +
        '<div class="sword-sprite">' + swordArt + '</div>' +
        '<div class="sword-light-beam"></div>' +
        '<div class="sword-light-flash"></div>' +
        '<div class="sword-particles"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    activeOverlay = overlay;
    window.setTimeout(function () {
      if (activeOverlay === overlay) {
        overlay.remove();
        activeOverlay = null;
      }
    }, 3400);
  }
  document.addEventListener("click", function (event) {
    const downloadLink = event.target.closest && event.target.closest("a.modal-download");
    if (!downloadLink) return;
    playSwordDissolve();
  });
})();
loadCatalog();
