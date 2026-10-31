const packs = [
  {id:"frostline",name:"Frostline",category:"atmosphere",categoryName:"АТМОСФЕРА",version:"1.20 – 1.21",description:"Холодная палитра, мягкий свет и ощущение зимнего мира.",glyph:"❄",cover:"cover-frost"},
  {id:"ember-pvp",name:"Ember PvP",category:"pvp",categoryName:"PVP",version:"1.20 – 1.21",description:"Контрастный стиль для тех, кто ценит чистую картинку в бою.",glyph:"火",cover:"cover-pvp"},
  {id:"vanilla-leaf",name:"Vanilla Leaf",category:"vanilla",categoryName:"VANILLA",version:"1.19 – 1.21",description:"Знакомый Minecraft, но с чуть более выразительными деталями.",glyph:"✳",cover:"cover-vanilla"},
  {id:"violet-realism",name:"Violet Realism",category:"realism",categoryName:"РЕАЛИЗМ",version:"1.20 – 1.21",description:"Глубокие оттенки и атмосферная подача игрового мира.",glyph:"◈",cover:"cover-atmo"},
  {id:"clean-pvp",name:"Clean PvP",category:"pvp",categoryName:"PVP",version:"1.20 – 1.21",description:"Минимум визуального шума и акцент на важных деталях.",glyph:"＋",cover:"cover-pvp"},
  {id:"quiet-world",name:"Quiet World",category:"atmosphere",categoryName:"АТМОСФЕРА",version:"1.20 – 1.21",description:"Спокойное оформление для долгих прогулок и строительства.",glyph:"☾",cover:"cover-atmo"}
];
// Добавляй реальные ZIP-ссылки в поле download, когда файлы будут загружены в репозиторий.
const grid = document.querySelector("#packGrid");
const search = document.querySelector("#searchInput");
const filters = document.querySelector("#filterRow");
const favoritesToggle = document.querySelector("#favoritesToggle");
const favoriteCount = document.querySelector("#favoriteCount");
const emptyState = document.querySelector("#emptyState");
let activeFilter = "all";
let showFavorites = false;
let favorites = new Set(JSON.parse(localStorage.getItem("phenikspack-favorites") || "[]"));

function render(){
  const query = search.value.trim().toLowerCase();
  const visible = packs.filter(pack => {
    const matchesFilter = activeFilter === "all" || pack.category === activeFilter;
    const matchesSearch = (pack.name + " " + pack.description + " " + pack.categoryName).toLowerCase().includes(query);
    const matchesFavorites = !showFavorites || favorites.has(pack.id);
    return matchesFilter && matchesSearch && matchesFavorites;
  });
  grid.innerHTML = visible.map((pack,index) => `
    <article class="pack-card">
      <div class="pack-cover ${pack.cover}">
        <span class="cover-tag">${pack.categoryName}</span>
        <button class="favorite-button ${favorites.has(pack.id)?"saved":""}" data-favorite="${pack.id}" aria-label="${favorites.has(pack.id)?"Убрать из избранного":"Добавить в избранное"}">${favorites.has(pack.id)?"♥":"♡"}</button>
        <span class="cover-glyph">${pack.glyph}</span>
        <span class="cover-number">0${packs.findIndex(p=>p.id===pack.id)+1} / PH</span>
      </div>
      <div class="pack-info">
        <div class="pack-topline"><span>${pack.categoryName}</span><span>PHENIKSPACK SELECTION</span></div>
        <h3>${pack.name}</h3>
        <p>${pack.description}</p>
        <div class="pack-bottom"><span class="pack-version">Minecraft ${pack.version}</span><span class="coming-soon">СКОРО</span></div>
      </div>
    </article>`).join("");
  emptyState.hidden = visible.length !== 0;
  grid.hidden = visible.length === 0;
  favoriteCount.textContent = favorites.size;
  favoritesToggle.setAttribute("aria-pressed",String(showFavorites));
  favoritesToggle.classList.toggle("active",showFavorites);
}
filters.addEventListener("click",event=>{
  const button=event.target.closest("[data-filter]");
  if(!button)return;
  activeFilter=button.dataset.filter;
  filters.querySelectorAll(".filter-chip").forEach(chip=>chip.classList.toggle("active",chip===button));
  render();
});
grid.addEventListener("click",event=>{
  const button=event.target.closest("[data-favorite]");
  if(!button)return;
  const id=button.dataset.favorite;
  if(favorites.has(id))favorites.delete(id);else favorites.add(id);
  localStorage.setItem("phenikspack-favorites",JSON.stringify([...favorites]));
  render();
});
search.addEventListener("input",render);
favoritesToggle.addEventListener("click",()=>{showFavorites=!showFavorites;render()});
document.querySelector("#resetFilters").addEventListener("click",()=>{activeFilter="all";showFavorites=false;search.value="";filters.querySelectorAll(".filter-chip").forEach(chip=>chip.classList.toggle("active",chip.dataset.filter==="all"));render()});
document.addEventListener("keydown",event=>{
  if(event.key==="/" && !["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){event.preventDefault();search.focus()}
  if(event.key==="Escape")search.blur();
});
const menuToggle=document.querySelector("#menuToggle");
const nav=document.querySelector(".nav-links");
menuToggle.addEventListener("click",()=>{const opened=nav.classList.toggle("open");menuToggle.setAttribute("aria-expanded",String(opened))});
nav.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{nav.classList.remove("open");menuToggle.setAttribute("aria-expanded","false")}));
render();