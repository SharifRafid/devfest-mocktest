// DOM/SVG rendering. Every dataset string goes through textContent — never innerHTML.
import { midpoint } from './geometry.js';
import { t, formatError } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

/** Edge ids along a node path (consecutive pairs are unique: no repeated node pairs). */
function routeEdgeIds(graph, path) {
  const ids = new Set();
  for (let i = 1; i < path.length; i++) {
    const hop = graph.adj.get(path[i - 1]).find((a) => a.to === path[i]);
    if (hop) ids.add(hop.edgeId);
  }
  return ids;
}

function nodeShape(type, g) {
  if (type === 'room') return el('rect', { class: 'shape', x: -19, y: -19, width: 38, height: 38, rx: 8 }, g);
  if (type === 'exit') return el('rect', { class: 'shape', x: -23, y: -23, width: 46, height: 46, rx: 12 }, g);
  return el('circle', { class: 'shape', r: 18 }, g);
}

/**
 * Draw the whole map. Layers: edges → route → cost pills → nodes (shape + id + label).
 * opts: { startId, lang, onNodeClick(id), onEdgeClick(id) }
 */
export function renderMap(svg, graph, positions, state, route, opts) {
  svg.replaceChildren();
  // Crop the viewBox to the drawing (+ room for node labels) so wide buildings don't leave empty bands.
  const xs = [...positions.values()].map((p) => p.x), ys = [...positions.values()].map((p) => p.y);
  const minX = Math.min(...xs) - 70, maxX = Math.max(...xs) + 70;
  const minY = Math.min(...ys) - 50, maxY = Math.max(...ys) + 60;
  const h = Math.max(maxY - minY, 220), w = Math.max(maxX - minX, 360);
  svg.setAttribute('viewBox', `${minX - (w - (maxX - minX)) / 2} ${minY - (h - (maxY - minY)) / 2} ${w} ${h}`);
  const { startId, lang, onNodeClick, onEdgeClick } = opts;
  const anim = opts.anim ?? { route: false, start: false, changed: new Set() };
  const onRoute = route.status === 'ok' ? new Set(route.path) : new Set();
  const routeEdges = route.status === 'ok' ? routeEdgeIds(graph, route.path) : new Set();

  // Route sits under the cost pills so corridor costs stay readable along the route.
  const gEdges = el('g', { class: 'edges' }, svg);
  const gRoute = el('g', { class: 'route-layer' }, svg);
  const gCosts = el('g', { class: 'costs' }, svg);
  const gNodes = el('g', { class: 'nodes' }, svg);

  for (const id of graph.edgeIds) {
    const e = graph.edges.get(id);
    const p = positions.get(e.from), q = positions.get(e.to);
    const cls = ['edge'];
    if (state.blockedEdges.has(id)) cls.push('blocked');
    if (state.blockedNodes.has(e.from) || state.blockedNodes.has(e.to)) cls.push('dimmed');
    if (routeEdges.has(id)) cls.push('on-route');
    if (anim.changed.has(`e:${id}`)) cls.push('changed');
    const g = el('g', { class: cls.join(' '), 'data-id': id }, gEdges);
    el('line', { class: 'edge-line', x1: p.x, y1: p.y, x2: q.x, y2: q.y }, g);
    const hit = el('line', { class: 'edge-hit', x1: p.x, y1: p.y, x2: q.x, y2: q.y }, g);
    const title = el('title', {}, hit);
    title.textContent = `${id}: ${e.from} – ${e.to} (${e.cost})`;
    if (onEdgeClick) hit.addEventListener('click', () => onEdgeClick(id));

    const m = midpoint(p, q);
    const text = String(e.cost);
    const w = 14 + text.length * 8;
    const pill = el('g', { class: `cost-pill${routeEdges.has(id) ? ' on-route' : ''}`, transform: `translate(${m.x} ${m.y})` }, gCosts);
    el('rect', { x: -w / 2, y: -11, width: w, height: 22, rx: 11 }, pill);
    el('text', {}, pill).textContent = text;
    pill.style.pointerEvents = 'none';
  }

  if (route.status === 'ok') {
    const pts = route.path.map((nid) => positions.get(nid)).map((p) => `${p.x},${p.y}`).join(' ');
    el('polyline', { class: `route-line${anim.route ? ' draw' : ''}`, points: pts, pathLength: 1 }, gRoute);
  }

  for (const id of graph.nodeIds) {
    const n = graph.nodes.get(id);
    const p = positions.get(id);
    const cls = ['node', `type-${n.type}`];
    if (state.blockedNodes.has(id)) cls.push('blocked');
    if (state.closedExits.has(id)) cls.push('closed');
    if (onRoute.has(id)) cls.push('on-route');
    if (id === startId) cls.push('is-start');
    if (anim.changed.has(`n:${id}`)) cls.push('changed');
    const g = el('g', {
      class: cls.join(' '),
      transform: `translate(${p.x} ${p.y})`,
      tabindex: 0,
      role: 'button',
      'data-id': id,
      'data-focus-key': `node:${id}`,
      'aria-label': `${t(`node.type.${n.type}`, {}, lang)} ${id}: ${n.label}`,
    }, gNodes);

    if (id === startId) el('circle', { class: `start-ring${anim.start ? ' ring-in' : ''}`, r: n.type === 'exit' ? 33 : 28 }, g);
    nodeShape(n.type, g);
    if (state.blockedNodes.has(id)) {
      el('path', { class: 'mark', d: 'M-11,-11 L11,11 M11,-11 L-11,11' }, g);
    } else if (state.closedExits.has(id)) {
      el('path', { class: 'lock-shackle', d: 'M-6,-2 v-5 a6,6 0 0 1 12,0 v5' }, g);
      el('rect', { class: 'lock-body', x: -10, y: -3, width: 20, height: 15, rx: 3 }, g);
    } else {
      el('text', { class: 'node-id' }, g).textContent = id;
    }
    const label = el('text', { class: 'node-label', y: n.type === 'exit' ? 40 : 36 }, g);
    label.textContent = n.label;

    if (onNodeClick) {
      g.addEventListener('click', () => onNodeClick(id));
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onNodeClick(id);
        }
      });
    }
  }
}

/** Start dropdown: rooms and junctions only, in file order; blocked ones are disabled. */
export function renderStartSelect(select, graph, state, startId, lang) {
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('start.placeholder', {}, lang);
  select.appendChild(placeholder);
  if (!graph) {
    select.disabled = true;
    return;
  }
  select.disabled = false;
  for (const id of graph.nodeIds) {
    const n = graph.nodes.get(id);
    if (n.type === 'exit') continue;
    const opt = document.createElement('option');
    opt.value = id;
    const blocked = state.blockedNodes.has(id);
    opt.textContent = `${id} — ${n.label}${blocked ? ` ${t('start.blocked_suffix', {}, lang)}` : ''}`;
    if (blocked && id !== startId) opt.disabled = true;
    select.appendChild(opt);
  }
  select.value = startId ?? '';
}

export function renderRoutePanel(els, route) {
  const ok = route.status === 'ok';
  els.seq.textContent = ok ? route.path.join(' - ') : '—';
  els.exit.textContent = ok ? route.exit : '—';
  els.cost.textContent = ok ? String(route.cost) : '—';
}

/** Status line: exact required strings, alone, no prefix. */
export function renderStatus(statusEl, status, lang) {
  statusEl.dataset.status = status;
  statusEl.textContent = t(`status.${status}`, {}, lang);
}

export function renderErrors(container, errors, lang, max = 12) {
  container.replaceChildren();
  if (!errors || !errors.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const head = document.createElement('strong');
  head.textContent = t('load.invalid', {}, lang);
  const list = document.createElement('ul');
  for (const err of errors.slice(0, max)) {
    const li = document.createElement('li');
    li.textContent = formatError(err, lang);
    list.appendChild(li);
  }
  if (errors.length > max) {
    const li = document.createElement('li');
    li.textContent = t('err.more', { n: errors.length - max }, lang);
    list.appendChild(li);
  }
  container.append(head, list);
}

/** Checkbox lists for hazards; kept in sync with the map on every render. */
export function renderHazardLists(els, graph, state, handlers, changed = new Set()) {
  for (const box of Object.values(els)) box.replaceChildren();
  if (!graph) return;
  const chip = (box, extraCls, key, animKey, checked, text, title, onChange) => {
    const label = document.createElement('label');
    label.className = `chk ${extraCls}${changed.has(animKey) ? ' changed' : ''}`;
    label.title = title;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.dataset.focusKey = key;
    input.addEventListener('change', onChange);
    const span = document.createElement('span');
    span.textContent = text;
    label.append(input, span);
    box.appendChild(label);
  };
  for (const id of graph.nodeIds) {
    const n = graph.nodes.get(id);
    if (n.type === 'exit') {
      chip(els.exits, 'exit', `exit:${id}`, `n:${id}`, state.closedExits.has(id), id, n.label, () => handlers.onToggleExit(id));
    } else {
      chip(els.nodes, 'node', `chk-node:${id}`, `n:${id}`, state.blockedNodes.has(id), id, n.label, () => handlers.onToggleNode(id));
    }
  }
  for (const id of graph.edgeIds) {
    const e = graph.edges.get(id);
    chip(els.edges, 'edge', `edge:${id}`, `e:${id}`, state.blockedEdges.has(id), `${id} ${e.from}–${e.to} (${e.cost})`, id,
      () => handlers.onToggleEdge(id));
  }
}
