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
  let visible = sourcePacks.filter(function (pack) {
    const category = packCategory(pack);
    const text = [pack.title, pack.description, pack.author, category.label, (pack.versions || []).join(" ")].join(" ").toLowerCase();
    return (activeFilter === "all" || category.key === activeFilter) &&
      text.includes(query) && (!showFavorites || favorites.has(pack.project_id));
  });
  if (aiAnalysis && !query && !showFavorites) {
    const rankedPacks = visible.map(function (pack) {
      return {pack:pack, score:scorePackForAI(pack, aiAnalysis)};
    }).sort(function (a,b) { return b.score - a.score; });
    const matchedPacks = rankedPacks.filter(function (item) { return item.score > 0.015; });
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


/* PHENIKS AI: a tiny trainable neural network running locally in the browser */
let aiAnalysis = null;
const aiNote = document.querySelector("#aiResultNote");
const aiForm = document.querySelector("#aiSearchForm");
const aiInput = document.querySelector("#aiQueryInput");

const aiTrainingExamples = [
  ["розовый pvp", ["pvp","pink"]], ["pink pvp texture pack", ["pvp","pink"]],
  ["розовый пак для дуэлей", ["pvp","pink"]], ["розовые текстуры", ["pink"]],
  ["фиолетовый pvp", ["pvp","purple"]], ["purple pvp pack", ["pvp","purple"]],
  ["синий pvp ресурспак", ["pvp","blue"]], ["голубые текстуры", ["blue"]],
  ["реалистичные текстуры", ["realism"]], ["максимальный реализм", ["realism"]],
  ["реалистичная вода и небо", ["realism","water","sky"]],
  ["ванильный ресурспак", ["vanilla","faithful"]], ["почти как стандартный майнкрафт", ["vanilla","faithful"]],
  ["обычные текстуры но лучше", ["vanilla","faithful"]],
  ["минималистичный пак", ["vanilla"]], ["лёгкий пак для слабого пк", ["performance"]],
  ["повысить фпс с текстурами", ["performance"]], ["оптимизированный ресурспак", ["performance"]],
  ["красивое небо", ["sky","atmosphere"]], ["облака и звёзды", ["sky","atmosphere"]],
  ["красивая вода", ["water","atmosphere"]], ["прозрачная вода", ["water"]],
  ["мрачные тёмные текстуры", ["dark","atmosphere"]], ["чёрный тёмный пак", ["dark"]],
  ["уютная атмосфера", ["atmosphere"]], ["сказочный стиль", ["atmosphere"]],
  ["яркие розовые блоки", ["pink"]], ["нежный розовый стиль", ["pink"]],
  ["светлые синие текстуры", ["blue"]], ["фиолетовый стиль", ["purple"]],
  ["pvp pack", ["pvp"]], ["пак для сражений", ["pvp"]],
  ["ресурспак для выживания", ["vanilla"]], ["реализм для майнкрафта", ["realism"]],
  ["тёмный pvp для 1.21", ["pvp","dark"]], ["розовый пак для майнкрафта", ["pink"]],
  ["вода и небо", ["water","sky"]], ["пак не тормозит игру", ["performance"]],
  ["зелёный ресурспак", ["green"]], ["green texture pack", ["green"]],
  ["красные текстуры", ["red"]], ["red resource pack", ["red"]],
  ["белый светлый пак", ["white"]], ["white texture pack", ["white"]],
  ["оранжевые текстуры", ["orange"]], ["orange resource pack", ["orange"]],
  ["жёлтый пак", ["yellow"]], ["yellow resource pack", ["yellow"]]
];
const aiLabels = ["pvp","realism","vanilla","atmosphere","pink","blue","purple","dark","faithful","performance","sky","water","green","red","white","orange","yellow"];
const aiTokenize = function (value) {
  return String(value || "").toLowerCase().replace(/ё/g,"е").match(/[a-zа-я0-9.]+/g) || [];
};
const aiVocabulary = Array.from(new Set(aiTrainingExamples.flatMap(function (item) { return aiTokenize(item[0]); })));
const aiWordIndex = new Map(aiVocabulary.map(function (word,index) { return [word,index]; }));
const aiSigmoid = function (x) { return 1 / (1 + Math.exp(-Math.max(-30,Math.min(30,x)))); };
const aiHiddenSize = 24;
const aiWeights1 = Array.from({length:aiHiddenSize},function (_,h) {
  return aiVocabulary.map(function (_,i) { return Math.sin((h+1)*(i+3)*1.71)*0.12; });
});
const aiBias1 = Array(aiHiddenSize).fill(0);
const aiWeights2 = aiLabels.map(function (_,o) {
  return Array.from({length:aiHiddenSize},function (_,h) { return Math.cos((o+2)*(h+1)*1.37)*0.12; });
});
const aiBias2 = Array(aiLabels.length).fill(-0.25);
function aiVectorize(sentence) {
  const vector = Array(aiVocabulary.length).fill(0);
  aiTokenize(sentence).forEach(function (word) {
    if (aiWordIndex.has(word)) vector[aiWordIndex.get(word)] += 1;
  });
  const count = vector.reduce(function (sum,value) { return sum + value; },0);
  return count ? vector.map(function (value) { return value / Math.sqrt(count); }) : vector;
}
function aiForward(input) {
  const hidden = aiWeights1.map(function (weights,h) {
    let sum = aiBias1[h];
    for (let i=0;i<input.length;i++) sum += weights[i]*input[i];
    return Math.tanh(sum);
  });
  const output = aiWeights2.map(function (weights,o) {
    let sum = aiBias2[o];
    for (let h=0;h<hidden.length;h++) sum += weights[h]*hidden[h];
    return aiSigmoid(sum);
  });
  return {hidden:hidden,output:output};
}
function trainLocalNetwork() {
  const rate = 0.12;
  for (let epoch=0;epoch<420;epoch++) {
    aiTrainingExamples.forEach(function (example) {
      const input = aiVectorize(example[0]);
      const target = aiLabels.map(function (label) { return example[1].includes(label) ? 1 : 0; });
      const pass = aiForward(input);
      const deltaOut = pass.output.map(function (value,index) { return value-target[index]; });
      const deltaHidden = pass.hidden.map(function (value,h) {
        let error = 0;
        for (let o=0;o<aiLabels.length;o++) error += deltaOut[o]*aiWeights2[o][h];
        return error*(1-value*value);
      });
      for (let o=0;o<aiLabels.length;o++) {
        for (let h=0;h<aiHiddenSize;h++) aiWeights2[o][h] -= rate*deltaOut[o]*pass.hidden[h];
        aiBias2[o] -= rate*deltaOut[o];
      }
      for (let h=0;h<aiHiddenSize;h++) {
        for (let i=0;i<aiVocabulary.length;i++) aiWeights1[h][i] -= rate*deltaHidden[h]*input[i];
        aiBias1[h] -= rate*deltaHidden[h];
      }
    });
  }
}
trainLocalNetwork();

const aiMatchTerms = {
  pvp:["pvp","combat","battle","duel","sword","weapon","16x","8x","low fire","short sword","меч","дуэль","сраж","пвп","бой","арена"],
  realism:["realistic","realism","photoreal","real","реалист","реализм","фотореал"],
  vanilla:["vanilla","default","faithful","обычн","ванил","стандарт","классич"],
  atmosphere:["atmosphere","fantasy","medieval","environment","атмосфер","фэнтези","сказоч","средневек"],
  pink:["pink","rose","розов","пинк","малинов","фукси"],
  blue:["blue","cyan","aqua","turquoise","teal","light blue","sky blue","голуб","син","бирюз","лазур","небес","сапфир","аквамар"],
  purple:["purple","violet","фиолет","лилов","сирен"],
  dark:["dark","black","night","мрач","тём","темн","чёрн","черн","ночн"],
  faithful:["faithful","vanilla","default","стандарт","ванил"],
  performance:["performance","fps","low","16x","8x","легк","оптимиз","слаб","производительн"],
  sky:["sky","cloud","sunset","stars","небо","облак","звезд","закат","рассвет"],
  water:["water","clear water","ocean","океан","вода","воды","водн","море"],
  green:["green","lime","emerald","зелён","зелен","изумруд","лайм"],
  red:["red","crimson","scarlet","красн","ал"],
  white:["white","light","snow","бел","светл","снеж"],
  orange:["orange","amber","оранж","янтар"],
  yellow:["yellow","gold","золот","жёлт","желт"]
};
const aiLabelNames = {pvp:"PvP",realism:"реализм",vanilla:"Vanilla",atmosphere:"атмосфера",pink:"розовый",blue:"голубой / синий",purple:"фиолетовый",dark:"тёмный",faithful:"ванильный стиль",performance:"производительность",sky:"небо",water:"вода",green:"зелёный",red:"красный",white:"белый",orange:"оранжевый",yellow:"жёлтый"};
const aiSearchTerms = {pvp:"pvp",realism:"realistic",vanilla:"vanilla",atmosphere:"fantasy",pink:"pink",blue:"blue",purple:"purple",dark:"dark",faithful:"faithful",performance:"low resolution",sky:"sky",water:"water",green:"green",red:"red",white:"white",orange:"orange",yellow:"yellow"};
let aiExtraPacks = [];

function normalizeAIText(value) {
  return String(value || "").toLowerCase().replace(/ё/g,"е").replace(/[^a-zа-я0-9.]+/g," ");
}
function queryHasTerm(query, term) {
  return normalizeAIText(query).includes(normalizeAIText(term));
}
function scorePackForAI(pack, analysis) {
  const category = packCategory(pack);
  const haystack = normalizeAIText([
    pack.title,pack.description,pack.author,category.label,
    (pack.categories||[]).join(" "),(pack.display_categories||[]).join(" ")
  ].join(" "));
  let score = 0;
  analysis.labels.forEach(function (item) {
    const terms = aiMatchTerms[item.label] || [];
    const match = terms.some(function (term) { return haystack.includes(normalizeAIText(term)); });
    if (match) score += item.score * (item.label === "pvp" && category.key === "pvp" ? 1.8 : 1);
    if (item.label === "pvp" && category.key === "pvp" && !match) score += item.score * 1.5;
  });
  if (analysis.version && (pack.versions || []).includes(analysis.version)) score += 0.8;
  if (aiExtraPacks.some(function (item) { return item.project_id === pack.project_id; })) score += 0.025;
  return score;
}
function analyzeUserQuery(query) {
  const normalized = normalizeAIText(query);
  const detected = [];
  aiLabels.forEach(function (label) {
    const terms = aiMatchTerms[label] || [];
    if (terms.some(function (term) { return queryHasTerm(normalized, term); })) {
      detected.push({label:label,score:0.96});
    }
  });
  const knownTokens = aiTokenize(query).some(function (word) { return aiWordIndex.has(word); });
  if (knownTokens) {
    const output = aiForward(aiVectorize(query)).output;
    output.map(function (score,index) { return {label:aiLabels[index],score:score}; })
      .sort(function (a,b) { return b.score-a.score; })
      .filter(function (item) {
        return item.score >= 0.72 && !detected.some(function (found) { return found.label === item.label; });
      })
      .slice(0,3).forEach(function (item) { detected.push(item); });
  }
  const versionMatch = query.match(/\b1\.\d{1,2}(?:\.\d{1,2})?\b/);
  return {labels:detected.slice(0,6),version:versionMatch ? versionMatch[0] : null,noExactMatches:false};
}
function resetAIState() {
  aiAnalysis = null;
  aiExtraPacks = [];
  if (aiInput) aiInput.value = "";
  if (aiNote) aiNote.textContent = "Опиши, какой ресурспак хочешь найти. Нейросеть разберёт стиль, цвет и особенности.";
}
async function fetchAIPacks(analysis) {
  const terms = analysis.labels.map(function (item) { return aiSearchTerms[item.label]; }).filter(Boolean);
  if (!terms.length) return [];
  const uniqueTerms = Array.from(new Set(terms)).slice(0,3);
  const responses = await Promise.all(uniqueTerms.map(async function (term) {
    const params = new URLSearchParams({
      query:term,
      facets:JSON.stringify([["project_type:resourcepack"]]),
      index:"relevance",
      limit:"100"
    });
    const response = await fetch(API + "?" + params.toString(), {headers:{"Accept":"application/json"}});
    if (!response.ok) throw new Error("Modrinth AI search returned " + response.status);
    return response.json();
  }));
  const seen = new Set();
  return responses.flatMap(function (page) { return page.hits || []; }).filter(function (pack) {
    if (!pack.project_id || seen.has(pack.project_id)) return false;
    seen.add(pack.project_id);
    return true;
  });
}
async function runAISearch() {
  const query = aiInput.value.trim();
  if (!query) {
    if (aiNote) aiNote.textContent = "Напиши, какой ресурспак ты ищешь.";
    return;
  }
  aiAnalysis = analyzeUserQuery(query);
  aiExtraPacks = [];
  activeFilter = aiAnalysis.labels.some(function (item) { return item.label === "pvp"; }) ? "pvp" : "all";
  showFavorites = false;
  search.value = "";
  updateSearchClear();
  filters.querySelectorAll(".filter-chip").forEach(function (chip) {
    chip.classList.toggle("active",chip.dataset.filter === activeFilter);
  });
  render();
  const names = aiAnalysis.labels.map(function (item) { return aiLabelNames[item.label]; });
  if (!aiAnalysis.labels.length) {
    if (aiNote) aiNote.textContent = "Пока не распознал стиль. Попробуй указать цвет, PvP, реализм, воду или небо.";
    return;
  }
  if (aiNote) aiNote.textContent = "Ищу подходящие ресурс-паки на Modrinth…";
  try {
    aiExtraPacks = await fetchAIPacks(aiAnalysis);
    render();
    const count = grid.querySelectorAll(".pack-card").length;
    const versionText = aiAnalysis.version ? " · Minecraft " + aiAnalysis.version : "";
    const labelsText = names.join(", ");
    const noMatchText = aiAnalysis.noExactMatches ? " Точных совпадений по описаниям нет — показываю ближайшие варианты." : "";
    if (aiNote) aiNote.innerHTML = 'Распознано: <strong>'+escapeHTML(labelsText)+'</strong>'+escapeHTML(versionText)+'. Найдено вариантов: <strong>'+count+'</strong>.'+escapeHTML(noMatchText);
  } catch (error) {
    console.error(error);
    const count = grid.querySelectorAll(".pack-card").length;
    if (aiNote) aiNote.textContent = "Распознано: " + names.join(", ") + ". Показаны совпадения из каталога (" + count + ").";
  }
}
if (aiForm) aiForm.addEventListener("submit",function (event) {
  event.preventDefault();
  const query = aiInput.value.trim();
  if (!query) {
    if (aiNote) aiNote.textContent = "Напиши, какой ресурспак ты ищешь.";
    return;
  }
  aiAnalysis = analyzeUserQuery(query);
  const names = {pvp:"PvP",realism:"реализм",vanilla:"Vanilla",atmosphere:"атмосфера",pink:"розовый",blue:"синий",purple:"фиолетовый",dark:"тёмный",faithful:"ванильный стиль",performance:"производительность",sky:"небо",water:"вода"};
  const found = aiAnalysis.labels.map(function (item) { return names[item.label]; });
  activeFilter = aiAnalysis.labels.some(function (item) { return item.label === "pvp"; }) ? "pvp" : "all";
  showFavorites = false;
  search.value = "";
  filters.querySelectorAll(".filter-chip").forEach(function (chip) {
    chip.classList.toggle("active",chip.dataset.filter === activeFilter);
  });
  render();
  const versionText = aiAnalysis.version ? " · Minecraft "+aiAnalysis.version : "";
  const labelsText = found.length ? found.join(", ") : "общий запрос";
  const count = grid.querySelectorAll(".pack-card").length;
  if (aiNote) aiNote.innerHTML = 'Нейросеть распознала: <strong>'+escapeHTML(labelsText)+'</strong>'+escapeHTML(versionText)+'. Подходящих результатов: <strong>'+count+'</strong>.';
});


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


loadCatalog();
