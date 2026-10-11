// ---- Rīgas ielu spēle ----
const KEY = 'rigas_ielas_v1';
let streets = {};          
let totalM = 0;
let guessed = JSON.parse(localStorage.getItem(KEY) || '[]'); 
let geo = null;

const LENGTH_STEPS = [5, 2, 1];
let statTotals = {};   

const map = L.map('map', {zoomControl: false}).setView([56.9496, 24.1052], 12);
L.control.zoom({position: 'bottomright'}).addTo(map);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {maxZoom: 19, attribution: 'Tiles © Esri'}).addTo(map);
const layerGroup = L.layerGroup().addTo(map);

const $ = id => document.getElementById(id);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();


const TYPES = ['iela','gatve','prospekts','bulvaris','linija','skerslinija','aleja','laukums',
  'dambis','soseja','cels','apvedcels','krastmala','tilts','pagalms','piebrauktuve','celiņs'];
const stripType = k => {
  const w = k.split(' ');
  return w.length > 1 && TYPES.includes(w[w.length - 1]) ? w.slice(0, -1).join(' ') : k;
};
let aliases = {};   

const lookup = input => {
  const k = norm(input);
  if (streets[k]) return [k];
  return aliases[stripType(k)] || [];
};


const NAME_FIELD = 'nosaukums';
const LEN_FIELD  = 'garums';   // metros
const LEN_UNIT   = 1;      // 1 = metri, 1000 = kilometri

fetch('streets.geojson')
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(data => { geo = data; startGame(); })
  .catch(err => {
    console.error(err);
    $('loadStatus').textContent = 'Neizdevās ielādēt datus: ' + err.message;
  });

function startGame() {
  const keys = Object.keys(geo.features[0].properties);
  const guess = (re, def) => keys.find(k => re.test(k)) || def;
  const nf = NAME_FIELD || guess(/nosauk|name|nos/i, keys[0]);
  const lf = LEN_FIELD || guess(/garum|length|len/i, keys[keys.length - 1]);
  const unit = LEN_UNIT;
  streets = {}; totalM = 0;
  for (const ft of geo.features) {
    const name = ft.properties[nf];
    if (!name || !ft.geometry) continue;
    const m = (parseFloat(String(ft.properties[lf]).replace(',', '.')) || 0) * unit;
    const k = norm(name);
    if (!k) continue;
    (streets[k] ||= {name: String(name).trim(), meters: 0, features: []});
    streets[k].meters += m; streets[k].features.push(ft); totalM += m;
  }
  aliases = {};
  for (const k of Object.keys(streets)) {
    const base = stripType(k);
    if (base !== k && /[a-z]/.test(base)) (aliases[base] ||= []).push(k); 
  }
  statTotals = {};
  for (const t of LENGTH_STEPS) statTotals[t] = Object.values(streets).filter(x => x.meters > t * 1000).length;
  guessed = guessed.filter(k => streets[k]);
  $('loader').hidden = true;
  $('guess').disabled = $('go').disabled = false;
  $('guess').focus();
  guessed.forEach(k => draw(k));
  render();
}


function draw(k) {
  const gj = L.geoJSON(streets[k].features, {style: {color: '#ffd23f', weight: 4, opacity: 1}});
  gj.addTo(layerGroup);
  streets[k].layer = gj;
  return gj;
}
function say(text, cls) {
  const m = $('msg'); m.textContent = text; m.className = 'show ' + cls;
  clearTimeout(say.t); say.t = setTimeout(() => m.className = '', 2500);
}
function submit() {
  const keys = lookup($('guess').value);
  if (!norm($('guess').value)) return;
  if (!keys.length) { say('Tādas ielas nav sarakstā', 'err'); return; }
  const fresh = keys.filter(k => !guessed.includes(k));
  if (!fresh.length) {
    say('Šo jau esi atminējis', 'err');
    map.fitBounds(L.featureGroup(keys.map(k => streets[k].layer)).getBounds(), {maxZoom: 16});
    return;
  }
  const layers = fresh.map(k => { guessed.unshift(k); return draw(k); });
  localStorage.setItem(KEY, JSON.stringify(guessed));
  map.fitBounds(L.featureGroup(layers).getBounds(), {maxZoom: 16, padding: [60, 60]});
  $('guess').value = '';
  say('✓ ' + fresh.map(k => streets[k].name).join(', '), 'ok');
  render(fresh[0]);
}
$('go').onclick = submit;
$('guess').addEventListener('keydown', e => e.key === 'Enter' && submit());

const ACH = [[1, 'Pirmā iela'], [10, '10 ielas'], [50, '50 ielas'], [100, '100 ielas'], [250, '250 ielas'], [500, '500 ielas'], [1000, '1000 ielas']];
const PCT = [[1, '1% pilsētas'], [5, '5% pilsētas'], [10, '10% pilsētas'], [25, '25% pilsētas'], [50, 'Puse pilsētas'], [75, '75% pilsētas'], [100, 'Visa Rīga!']];
function render(newKey) {
  const doneM = guessed.reduce((s, k) => s + streets[k].meters, 0);
  const pct = totalM ? doneM / totalM * 100 : 0;
  $('pct').textContent = pct.toFixed(2);
  $('barFill').style.width = pct + '%';
  $('kmDone').textContent = (doneM / 1000).toFixed(2) + ' km atminēts';
  $('cnt').textContent = $('cnt2').textContent = guessed.length;
  $('empty').hidden = guessed.length > 0;
  $('rows').innerHTML = guessed.map(k => {
    const s = streets[k];
    return `<tr class="${k === newKey ? 'new' : ''}"><td>${s.name}</td><td>${(s.meters / totalM * 100).toFixed(2)} %</td><td>${(s.meters / 1000).toFixed(2)}</td></tr>`;
  }).join('');
  const list = [...ACH.map(([n, t]) => [guessed.length >= n, t]), ...PCT.map(([n, t]) => [pct >= n, t])];
  $('achCnt').textContent = list.filter(a => a[0]).length;
  $('ach').innerHTML = list.map(([on, t]) => `<div class="a ${on ? 'on' : ''}">${t}</div>`).join('');
  renderStats();
}
function statsRows() {
  return LENGTH_STEPS.map(t => {
    const total = statTotals[t] || 0;
    const done = guessed.filter(k => streets[k].meters > t * 1000).length;
    const p = total ? done / total * 100 : 0;
    return `<div class="st ${total && done === total ? 'full' : ''}">
      <div class="st-top"><span>Ielas garākas par ${t} km</span><span class="st-num"><b>${done}</b> no <b>${total}</b> (${p.toFixed(1)} %)</span></div>
      <div class="st-bar"><i style="width:${p}%"></i></div></div>`;
  }).join('');
}
function renderStats() {
  $('stats').innerHTML = statsRows();
}
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
  for (const id of ['list', 'ach', 'stats']) $(id).hidden = b.dataset.tab !== id;
});
$('reset').onclick = () => {
  if (!confirm('Dzēst visu progresu?')) return;
  guessed = []; localStorage.removeItem(KEY); layerGroup.clearLayers(); render();
};


(() => {
  const grip = $('grip'), panel = $('panel');
  let startY = null, startH = 0;
  grip.addEventListener('pointerdown', e => {
    startY = e.clientY; startH = panel.offsetHeight;
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', e => {
    if (startY === null) return;
    const h = Math.min(innerHeight * 0.85, Math.max(130, startH + startY - e.clientY));
    panel.style.setProperty('--ph', h + 'px');
  });
  const end = () => { if (startY === null) return; startY = null; map.invalidateSize(); };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
})();


const fmtLen = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
const topList = arr => `<ol class="top">${arr.map(k => `<li><span>${streets[k].name}</span><b>${fmtLen(streets[k].meters)}</b></li>`).join('')}</ol>`;
function showEnd() {
  const n = guessed.length;
  const doneM = guessed.reduce((s, k) => s + streets[k].meters, 0);
  const pct = totalM ? doneM / totalM * 100 : 0;
  let html = `<div class="big">${pct.toFixed(2)} %<small>pilsētas atminēts</small></div>
    <p class="end-sub"><b>${n}</b> no <b>${Object.keys(streets).length}</b> ielām &nbsp;·&nbsp; <b>${(doneM / 1000).toFixed(2)}</b> no <b>${(totalM / 1000).toFixed(2)}</b> km</p>`;
  if (!n) {
    html += '<p class="empty">Tu vēl neesi atminējis nevienu ielu.</p>';
  } else {
    const byLen = [...guessed].sort((a, b) => streets[b].meters - streets[a].meters);
    html += `<h3>Pēc garuma</h3>${statsRows()}
      <div class="end-lists">
        <div><h3>Garākās atminētās ielas</h3>${topList(byLen.slice(0, 10))}</div>
        <div><h3>Īsākās atminētās ielas</h3>${topList(byLen.slice(-10).reverse())}</div>
      </div>`;
  }
  $('endBody').innerHTML = html;
  $('end').hidden = false;
  $('endClose').focus();
}
const hideEnd = () => { $('end').hidden = true; $('guess').focus(); };
$('finish').onclick = showEnd;
$('endClose').onclick = hideEnd;
$('endReset').onclick = () => { hideEnd(); $('reset').click(); };
$('end').addEventListener('click', e => e.target === $('end') && hideEnd());
document.addEventListener('keydown', e => e.key === 'Escape' && !$('end').hidden && hideEnd());
