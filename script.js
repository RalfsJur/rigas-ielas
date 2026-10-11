// ---- Rīgas ielu spēle ----
const KEY = 'rigas_ielas_v1';
let streets = {};          // normalizēts nosaukums -> {name, meters, layers: []}
let totalM = 0;
let guessed = JSON.parse(localStorage.getItem(KEY) || '[]'); // normalizētu nosaukumu saraksts
let geo = null;

const map = L.map('map', {zoomControl: false}).setView([56.9496, 24.1052], 12);
L.control.zoom({position: 'bottomright'}).addTo(map);
// Tikai satelīta attēli (bez ielu nosaukumiem)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {maxZoom: 19, attribution: 'Tiles © Esri'}).addTo(map);
const layerGroup = L.layerGroup().addTo(map);

const $ = id => document.getElementById(id);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

// Ielu veidu vārdi (bez garumzīmēm), ko drīkst izlaist, ievadot nosaukumu
const TYPES = ['iela','gatve','prospekts','bulvaris','linija','skerslinija','aleja','laukums',
  'dambis','soseja','cels','apvedcels','krastmala','tilts','pagalms','piebrauktuve','celiņs'];
const stripType = k => {
  const w = k.split(' ');
  return w.length > 1 && TYPES.includes(w[w.length - 1]) ? w.slice(0, -1).join(' ') : k;
};
let aliases = {};   // nosaukums bez veida -> [pilnie atslēgu nosaukumi]
// Atrod ielas pēc ievades: pilns nosaukums vai nosaukums bez veida (piem., "Jelgavas")
const lookup = input => {
  const k = norm(input);
  if (streets[k]) return [k];
  return aliases[stripType(k)] || [];
};

// ---------- Datu ielāde ----------
// Ja automātiskā lauku atpazīšana kļūdās, norādi lauku nosaukumus šeit:
const NAME_FIELD = null;   // piem., 'nosaukums'
const LEN_FIELD  = null;   // piem., 'garums'
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
    if (base !== k && /[a-z]/.test(base)) (aliases[base] ||= []).push(k); // "1. līnija" bez veida netiek saīsināta
  }
  guessed = guessed.filter(k => streets[k]);
  $('loader').hidden = true;
  $('guess').disabled = $('go').disabled = false;
  $('guess').focus();
  guessed.forEach(k => draw(k));
  render();
}

// ---------- Spēles loģika ----------
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

// ---------- Interfeiss ----------
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
}
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
  $('list').hidden = b.dataset.tab !== 'list'; $('ach').hidden = b.dataset.tab !== 'ach';
});
$('reset').onclick = () => {
  if (!confirm('Dzēst visu progresu?')) return;
  guessed = []; localStorage.removeItem(KEY); layerGroup.clearLayers(); render();
};
