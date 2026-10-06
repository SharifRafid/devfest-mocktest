// App wiring: load data, hold UI state, recompute + re-render synchronously on every change.
import { validateBuilding } from './validate.js';
import { buildGraph, createState, toggleNode, toggleEdge, toggleExit } from './graph.js';
import { findRoute } from './router.js';
import { fitToViewBox } from './geometry.js';
import { t } from './i18n.js';
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
  hazards: { nodes: $('hzNodes'), edges: $('hzEdges'), exits: $('hzExits') },
  modeSelect: $('modeSelect'),
  modeHazard: $('modeHazard'),
  fileInput: $('fileInput'),
  loadSample: $('loadSample'),
  reset: $('resetBtn'),
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

function applyStaticText() {
  document.documentElement.lang = store.lang;
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n, {}, store.lang);
  }
}

export function update() {
  const focusKey = document.activeElement?.dataset?.focusKey;
  render();
  if (focusKey) document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
}

function render() {
  const { graph, state, lang } = store;
  const route = currentRoute();

  renderStatus(dom.status, route.status, lang);
  renderRoutePanel(dom.route, route);
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
  renderHazardLists(dom.hazards, graph, state, { onToggleNode, onToggleEdge, onToggleExit });
  dom.buildingName.textContent = graph ? graph.building : '';

  if (graph) {
    renderMap(dom.map, graph, store.positions, state, route, {
      startId: store.startId,
      lang,
      onNodeClick,
      onEdgeClick: onToggleEdge, // corridors toggle in both modes
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
  applyStaticText();
  update();
});

dom.modeSelect.addEventListener('click', () => setMode('select'));
dom.modeHazard.addEventListener('click', () => setMode('hazard'));

// Reset: restore the file's original initial_state; keep the selected start.
dom.reset.addEventListener('click', () => {
  if (store.graph) setState(createState(store.graph));
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
  applyStaticText();
  update();
  await loadDefault();
}

boot();
