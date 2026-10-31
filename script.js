const API = "https://api.modrinth.com/v2/search";
const PAGE_SIZE = 100;
const TARGET_COUNT = 300;
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
        '<a class="coming-soon source-link" href="' + escapeHTML(projectURL(pack)) + '" target="_blank" rel="noopener noreferrer">ОТКРЫТЬ ↗</a></div>' +
      '</div></article>';
  }).join("");
  emptyState.hidden = visible.length !== 0;
  grid.hidden = visible.length === 0;
  favoriteCount.textContent = favorites.size;
  favoritesToggle.setAttribute("aria-pressed", String(showFavorites));
  favoritesToggle.classList.toggle("active", showFavorites);
  if (catalogNote) catalogNote.innerHTML = '<span class="note-icon">i</span> В каталоге ' + packs.length + ' ресурс-паков из Modrinth. Скачивание открывается на странице автора.';
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
    const offsets = [0, 100, 200];
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
loadCatalog();
