// App wiring: load data, hold UI state, recompute + re-render synchronously on every change.
import { validateBuilding } from './validate.js';
import { buildGraph, createState, toggleNode, toggleEdge, toggleExit } from './graph.js';
import { findRoute } from './router.js';
import { fitToViewBox } from './geometry.js';
import { t } from './i18n.js';
import { exportMapPng } from './export.js';
import {
  renderMap, renderStartSelect, renderRoutePanel, renderStatus, renderErrors, renderHazardLists,
} from './render.js';

const MAX_FILE_BYTES = 1024 * 1024;

const $ = (id) => document.getElementById(id);
const dom = {
  map: $('map'),
  startSelect: $('startSelect'),
  status: $('status'),
  errors: $('errors'),
  hint: $('hint'),
  buildingName: $('buildingName'),
  langToggle: $('langToggle'),
  route: { seq: $('routeSeq'), exit: $('routeExit'), cost: $('routeCost') },
  routePanel: $('routePanel'),
  hazards: { nodes: $('hzNodes'), edges: $('hzEdges'), exits: $('hzExits') },
  modeSelect: $('modeSelect'),
  modeHazard: $('modeHazard'),
  fileInput: $('fileInput'),
  loadSample: $('loadSample'),
  reset: $('resetBtn'),
  exportPng: $('exportPng'),
  dropZone: $('dropZone'),
};

const store = {
  graph: null,
  positions: null,
  state: null,
  startId: null,
  lang: 'en',
  mode: 'select', // 'select' | 'hazard'
  loading: true,
  loadErrors: null, // errors from the last rejected file
  loadFailed: false, // default building.json could not be fetched
  hintKey: 'hint.select',
  notice: null, // {key, params} info message, e.g. file too large / loaded OK
};

/** Validate text and, only if valid, swap in the new building (start is cleared). */
export function loadText(text) {
  const res = validateBuilding(text);
  store.loading = false;
  if (!res.ok) {
    store.loadErrors = res.errors; // keep the previous map/state untouched
    update();
    return false;
  }
  store.graph = buildGraph(res.data);
  store.positions = fitToViewBox(res.data.nodes, { width: 1000, height: 600, pad: 60 });
  store.state = createState(store.graph);
  store.startId = null;
  store.loadErrors = null;
  store.loadFailed = false;
  store.hintKey = 'hint.select';
  update();
  return true;
}

function setStart(id) {
  const node = store.graph?.nodes.get(id);
  if (!node) return;
  if (node.type === 'exit') {
    store.hintKey = 'hint.exit_not_start';
  } else {
    store.startId = id;
    store.hintKey = 'hint.select';
  }
  update();
}

function setState(next) {
  store.state = next;
  update();
}

const onToggleNode = (id) => setState(toggleNode(store.graph, store.state, id));
const onToggleExit = (id) => setState(toggleExit(store.graph, store.state, id));
const onToggleEdge = (id) => setState(toggleEdge(store.state, id));

function onNodeClick(id) {
  if (store.mode === 'select') return setStart(id);
  const node = store.graph.nodes.get(id);
  return node.type === 'exit' ? onToggleExit(id) : onToggleNode(id);
}

function setMode(mode) {
  store.mode = mode;
  store.hintKey = mode === 'hazard' ? 'hint.hazard' : 'hint.select';
  update();
}

function currentRoute() {
  if (!store.graph) return { status: store.loading ? 'loading' : 'no_building', path: [], exit: null, cost: null };
  const r = findRoute(store.graph, store.state, store.startId);
  return r.status === 'no_start' ? { ...r, status: 'select_start' } : r;
}

const LANG_KEY = 'smartEscape.lang';

function savedLang() {
  try {
    return localStorage.getItem(LANG_KEY) === 'bn' ? 'bn' : 'en';
  } catch {
    return 'en'; // storage blocked (private mode etc.)
  }
}

function applyStaticText() {
  document.documentElement.lang = store.lang;
  document.title = t('app.title', {}, store.lang);
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n, {}, store.lang);
  }
  for (const node of document.querySelectorAll('[data-i18n-aria]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nAria, {}, store.lang));
  }
}

export function update() {
  const focusKey = document.activeElement?.dataset?.focusKey;
  render();
  if (focusKey) document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
}

// Previous render snapshot, used only to decide which brief animations to play.
let prev = { graph: null, routeKey: '', startId: null, state: null };

const diffSet = (a, b, prefix, out) => {
  for (const id of a) if (!b.has(id)) out.add(prefix + id);
  for (const id of b) if (!a.has(id)) out.add(prefix + id);
};

function animations(route) {
  const routeKey = route.status === 'ok' ? route.path.join('\u0000') : '';
  const sameGraph = prev.graph === store.graph;
  const changed = new Set();
  if (sameGraph && prev.state && store.state) {
    diffSet(prev.state.blockedNodes, store.state.blockedNodes, 'n:', changed);
    diffSet(prev.state.closedExits, store.state.closedExits, 'n:', changed);
    diffSet(prev.state.blockedEdges, store.state.blockedEdges, 'e:', changed);
  }
  const anim = {
    routeChanged: routeKey !== prev.routeKey,
    route: routeKey !== '' && routeKey !== prev.routeKey,
    start: store.startId !== null && store.startId !== prev.startId,
    changed,
  };
  prev = { graph: store.graph, routeKey, startId: store.startId, state: store.state };
  return anim;
}

function restartAnimation(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth; // reflow so the animation can replay
  node.classList.add(cls);
}

function render() {
  const { graph, state, lang } = store;
  const route = currentRoute();
  const anim = animations(route);

  renderStatus(dom.status, route.status, lang);
  renderRoutePanel(dom.route, route);
  if (anim.routeChanged) restartAnimation(dom.routePanel, 'fade-in');
  renderStartSelect(dom.startSelect, graph, state ?? {}, store.startId, lang);
  renderErrors(dom.errors, store.loadErrors, lang);
  if (store.loadFailed && !store.loadErrors) {
    dom.errors.hidden = false;
    dom.errors.textContent = t('load.failed', {}, lang);
  }
  if (store.notice) {
    dom.hint.textContent = t(store.notice.key, store.notice.params, lang);
    dom.hint.classList.toggle('warn', store.notice.warn);
  } else {
    dom.hint.textContent = t(store.hintKey, {}, lang);
    dom.hint.classList.toggle('warn', store.hintKey === 'hint.exit_not_start');
  }
  store.notice = null;
  document.body.classList.toggle('mode-hazard', store.mode === 'hazard');
  dom.modeSelect.setAttribute('aria-pressed', String(store.mode === 'select'));
  dom.modeHazard.setAttribute('aria-pressed', String(store.mode === 'hazard'));
  dom.reset.disabled = !graph;
  dom.exportPng.disabled = !graph;
  renderHazardLists(dom.hazards, graph, state, { onToggleNode, onToggleEdge, onToggleExit }, anim.changed);
  dom.buildingName.textContent = graph ? graph.building : '';

  if (graph) {
    renderMap(dom.map, graph, store.positions, state, route, {
      startId: store.startId,
      lang,
      onNodeClick,
      onEdgeClick: onToggleEdge, // corridors toggle in both modes
      anim,
    });
  } else {
    dom.map.replaceChildren();
  }
}

dom.startSelect.addEventListener('change', () => {
  store.startId = dom.startSelect.value || null;
  store.hintKey = 'hint.select';
  update();
});

dom.langToggle.addEventListener('click', () => {
  store.lang = store.lang === 'en' ? 'bn' : 'en';
  try {
    localStorage.setItem(LANG_KEY, store.lang);
  } catch {
    // ignore: language still switches for this session
  }
  applyStaticText();
  update();
});

dom.modeSelect.addEventListener('click', () => setMode('select'));
dom.modeHazard.addEventListener('click', () => setMode('hazard'));

// Reset: restore the file's original initial_state; keep the selected start.
dom.reset.addEventListener('click', () => {
  if (!store.graph) return;
  const g = store.graph.initial;
  const restored = g.blockedNodes.size + g.blockedEdges.size + g.closedExits.size;
  // Always confirm, so Reset is never a silent no-op (e.g. when nothing was changed yet).
  store.notice = restored
    ? { key: 'reset.done_initial', params: { n: restored }, warn: false }
    : { key: 'reset.done', params: {}, warn: false };
  setState(createState(store.graph));
});

async function loadFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    store.notice = { key: 'load.too_large', params: { name: file.name }, warn: true };
    update();
    return;
  }
  const ok = loadText(await file.text());
  store.notice = ok
    ? { key: 'load.ok', params: { name: file.name }, warn: false }
    : { key: 'load.rejected', params: { name: file.name }, warn: true };
  update();
}

dom.fileInput.addEventListener('change', async () => {
  await loadFile(dom.fileInput.files[0]);
  dom.fileInput.value = ''; // allow re-uploading the same file
});

dom.loadSample.addEventListener('click', () => loadDefault());

// Optional extension: download the current map + route summary as a PNG.
dom.exportPng.addEventListener('click', async () => {
  if (!store.graph) return;
  const route = currentRoute();
  const { lang } = store;
  const lines = [t(`status.${route.status}`, {}, lang)];
  if (route.status === 'ok') {
    lines.push(`${t('route.sequence', {}, lang)}: ${route.path.join(' - ')}  ·  ${t('route.exit', {}, lang)}: ${route.exit}  ·  ${t('route.cost', {}, lang)}: ${route.cost}`);
  }
  const name = `smart-escape-${store.startId ?? 'map'}.png`;
  try {
    await exportMapPng(dom.map, { title: store.graph.building, lines, filename: name });
    store.notice = { key: 'export.ok', params: { name }, warn: false };
  } catch {
    store.notice = { key: 'export.failed', params: {}, warn: true };
  }
  update();
});

// Drag and drop onto the map area.
let dragDepth = 0;
dom.dropZone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  dom.dropZone.classList.add('dragging');
});
dom.dropZone.addEventListener('dragover', (e) => e.preventDefault());
dom.dropZone.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) dom.dropZone.classList.remove('dragging');
});
dom.dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dom.dropZone.classList.remove('dragging');
  loadFile(e.dataTransfer.files[0]);
});
// Dropping a file elsewhere must not navigate away from the app.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

async function loadDefault() {
  try {
    const res = await fetch('building.json', { cache: 'no-cache' }); // relative: works under /<repo>/ on Pages
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadText(await res.text());
  } catch {
    store.loading = false;
    store.loadFailed = true;
    update();
  }
}

async function boot() {
  // If modules do run from file:// (some browsers allow it), the app works: drop the notice.
  document.getElementById('fileWarning').hidden = true;
  store.lang = savedLang();
  applyStaticText();
  update();
  await loadDefault();
}

boot();
