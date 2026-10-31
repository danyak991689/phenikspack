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
  const visible = packs.filter(function (pack) {
    const category = packCategory(pack);
    const text = [pack.title, pack.description, pack.author, category.label, (pack.versions || []).join(" ")].join(" ").toLowerCase();
    return (activeFilter === "all" || category.key === activeFilter) &&
      text.includes(query) && (!showFavorites || favorites.has(pack.project_id));
  });
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
search.addEventListener("input", render);
favoritesToggle.addEventListener("click", function () {
  showFavorites = !showFavorites;
  render();
});
document.querySelector("#resetFilters").addEventListener("click", function () {
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

loadCatalog();
