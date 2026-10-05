import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validateBuilding } from '../js/validate.js';
import { buildGraph, createState } from '../js/graph.js';
import { findRoute } from '../js/router.js';

const SAMPLE_URL = new URL('../building.json', import.meta.url);

/** Fresh parsed copy of building.json. */
export function sample() {
  return JSON.parse(readFileSync(SAMPLE_URL, 'utf8'));
}

/** Raw text of building.json. */
export function sampleText() {
  return readFileSync(SAMPLE_URL, 'utf8');
}

/**
 * Build a valid building object.
 * nodes: [['S','room'], ['E1','exit'], 'A'] or full node objects. Type defaults to 'room'.
 * edges: [['S','E1',5], ['S','A',1,'myId']] or full edge objects. Ids default to L1, L2, ...
 * init:  partial initial_state.
 */
export function mk(nodes, edges, init = {}) {
  return {
    building: 'Test Building',
    nodes: nodes.map((n, i) => {
      if (n && typeof n === 'object' && !Array.isArray(n)) return n;
      const [id, type = 'room'] = Array.isArray(n) ? n : [n];
      return { id, label: `Node ${id}`, type, x: 50 + i * 40, y: 50 + (i % 4) * 30 };
    }),
    edges: edges.map((e, i) => {
      if (e && typeof e === 'object' && !Array.isArray(e)) return e;
      const [from, to, cost, id = `L${i + 1}`] = e;
      return { id, from, to, cost };
    }),
    initial_state: {
      blocked_nodes: [],
      blocked_edges: [],
      closed_exits: [],
      ...init,
    },
  };
}

/** Validate → build graph → initial state → optional mutate(graph, state) → findRoute. */
export function route(json, start, mutate) {
  const v = validateBuilding(json);
  assert.equal(v.ok, true, `fixture invalid: ${JSON.stringify(v.errors)}`);
  const graph = buildGraph(v.data);
  let state = createState(graph);
  if (mutate) state = mutate(graph, state) ?? state;
  return findRoute(graph, state, start);
}

/** Load a fixture into {graph, state} for multi-step scenarios. */
export function load(json) {
  const v = validateBuilding(json);
  assert.equal(v.ok, true, `fixture invalid: ${JSON.stringify(v.errors)}`);
  const graph = buildGraph(v.data);
  return { graph, state: createState(graph) };
}

export function assertRoute(r, path, cost) {
  assert.equal(r.status, 'ok', `expected ok, got ${r.status}`);
  assert.deepEqual(r.path, path);
  assert.equal(r.cost, cost);
  assert.equal(r.exit, path[path.length - 1]);
}

export function assertStatus(r, status) {
  assert.equal(r.status, status);
  assert.deepEqual(r.path, []);
  assert.equal(r.exit, null);
  assert.equal(r.cost, null);
}
