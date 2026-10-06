// App wiring: load data, hold UI state, recompute + re-render synchronously on every change.
import { validateBuilding } from './validate.js';
import { buildGraph, createState } from './graph.js';
import { findRoute } from './router.js';
import { fitToViewBox } from './geometry.js';
import { t } from './i18n.js';
import { renderMap, renderStartSelect, renderRoutePanel, renderStatus, renderErrors } from './render.js';

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
};

const store = {
  graph: null,
  positions: null,
  state: null,
  startId: null,
  lang: 'en',
  loading: true,
  loadErrors: null, // errors from the last rejected file
  loadFailed: false, // default building.json could not be fetched
  hintKey: 'hint.select',
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
  dom.hint.textContent = t(store.hintKey, {}, lang);
  dom.hint.classList.toggle('warn', store.hintKey !== 'hint.select');
  dom.buildingName.textContent = graph ? graph.building : '';

  if (graph) {
    renderMap(dom.map, graph, store.positions, state, route, {
      startId: store.startId,
      lang,
      onNodeClick: setStart,
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

async function boot() {
  applyStaticText();
  update();
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

boot();
