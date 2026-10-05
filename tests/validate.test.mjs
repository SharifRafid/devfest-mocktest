import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateBuilding, stripBom } from '../js/validate.js';
import { sample, sampleText, mk } from './helpers.mjs';

const codes = (res) => res.errors.map((e) => e.code);

function expectReject(input, code) {
  const res = validateBuilding(input);
  assert.equal(res.ok, false, `expected rejection (${code})`);
  assert.ok(res.errors.length > 0);
  if (Array.isArray(code)) {
    assert.ok(code.some((c) => codes(res).includes(c)), `expected one of ${code}, got ${codes(res)}`);
  } else {
    assert.ok(codes(res).includes(code), `expected ${code}, got ${codes(res)}`);
  }
  for (const e of res.errors) assert.equal(typeof e.path, 'string', 'every error has a path');
  return res;
}

/** Sample with a mutation applied. */
function bad(fn) {
  const j = sample();
  fn(j);
  return j;
}

/** n nodes (last one an exit, rest rooms) and m edges with unique unordered pairs. */
function big(n, m) {
  const ids = Array.from({ length: n }, (_, i) => (i === n - 1 ? 'X' : `N${i}`));
  const nodes = ids.map((id, i) => [id, i === n - 1 ? 'exit' : 'room']);
  const edges = [];
  outer: for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (edges.length >= m) break outer;
      edges.push([ids[i], ids[j], 1 + ((i + j) % 9)]);
    }
  }
  assert.equal(edges.length, m, 'generator could not produce enough unique pairs');
  return mk(nodes, edges);
}

describe('valid inputs', () => {
  test('sample object is ok with no errors', () => {
    const res = validateBuilding(sample());
    assert.equal(res.ok, true, JSON.stringify(res.errors));
    assert.deepEqual(res.errors, []);
    assert.equal(res.data.nodes.length, 8);
    assert.equal(res.data.edges.length, 9);
  });

  test('JSON string input is accepted', () => {
    assert.equal(validateBuilding(sampleText()).ok, true);
    assert.equal(validateBuilding(JSON.stringify(sample())).ok, true);
  });

  test('leading UTF-8 BOM is stripped', () => {
    assert.equal(stripBom('﻿{}'), '{}');
    assert.equal(validateBuilding('﻿' + sampleText()).ok, true);
  });

  test('ids "__proto__" and "constructor" work', () => {
    const j = mk(
      [['__proto__'], ['constructor', 'junction'], ['toString', 'exit']],
      [['__proto__', 'constructor', 1], ['constructor', 'toString', 2]],
      { blocked_nodes: ['constructor'], closed_exits: ['toString'], blocked_edges: ['L1'] },
    );
    const res = validateBuilding(JSON.stringify(j));
    assert.equal(res.ok, true, JSON.stringify(res.errors));
    assert.deepEqual(res.data.nodes.map((n) => n.id), ['__proto__', 'constructor', 'toString']);
  });

  test('extra fields are ignored', () => {
    const j = bad((j) => {
      j.meta = { version: 2 };
      j.nodes[0].color = 'red';
      j.edges[0].note = 'stairs';
      j.initial_state.comment = 'x';
    });
    assert.equal(validateBuilding(j).ok, true);
  });

  test('negative, decimal and huge finite coordinates are valid', () => {
    const j = bad((j) => {
      j.nodes[0].x = -50;
      j.nodes[1].y = 12.5;
      j.nodes[2].x = 1e6;
    });
    assert.equal(validateBuilding(j).ok, true);
  });

  test('disconnected graph is valid', () => {
    const j = mk([['S'], ['A', 'junction'], ['E1', 'exit'], ['E2', 'exit']], [['S', 'A', 1], ['E1', 'E2', 1]]);
    assert.equal(validateBuilding(j).ok, true);
  });

  test('case-sensitive ids R1 and r1 are distinct', () => {
    const j = mk([['R1'], ['r1'], ['E1', 'exit']], [['R1', 'r1', 1], ['r1', 'E1', 1]]);
    assert.equal(validateBuilding(j).ok, true);
  });

  test('edge id equal to a node id is allowed', () => {
    const j = mk([['S'], ['E1', 'exit']], [['S', 'E1', 1, 'S']]);
    assert.equal(validateBuilding(j).ok, true);
  });

  test('bounds: 60 nodes / 150 edges ok; 2 nodes / 1 edge ok', () => {
    const res = validateBuilding(big(60, 150));
    assert.equal(res.ok, true, JSON.stringify(res.errors.slice(0, 3)));
    assert.equal(validateBuilding(big(2, 1)).ok, true);
  });

  test('duplicate initial_state ids → ok with warning, deduped', () => {
    const j = bad((j) => {
      j.initial_state.blocked_nodes = ['C2', 'C2'];
      j.initial_state.closed_exits = ['E1', 'E1'];
    });
    const res = validateBuilding(j);
    assert.equal(res.ok, true, JSON.stringify(res.errors));
    assert.ok(res.warnings.some((w) => w.code === 'state_duplicate'));
    assert.deepEqual(res.data.initial_state.blocked_nodes, ['C2']);
    assert.deepEqual(res.data.initial_state.closed_exits, ['E1']);
  });
});

describe('bounds rejections', () => {
  test('61 nodes', () => expectReject(big(61, 1), 'nodes_count'));
  test('1 node', () =>
    expectReject(mk([['E1', 'exit']], [{ id: 'L1', from: 'E1', to: 'E1', cost: 1 }]), 'nodes_count'));
  test('0 edges', () => expectReject(mk([['S'], ['E1', 'exit']], []), 'edges_count'));
  test('151 edges', () => expectReject(big(60, 151), 'edges_count'));
});

describe('invalid-input set (EDGE_CASES.md §3)', () => {
  // Bad file shape
  test('invalid JSON', () => expectReject('{"building": "x", nodes: [}', 'json_parse'));
  test('empty file', () => expectReject('', 'json_parse'));
  test('whitespace-only file', () => expectReject('   \n ', 'json_parse'));
  test('root []', () => expectReject('[]', 'root_not_object'));
  test('root null', () => expectReject('null', 'root_not_object'));

  // Top level
  test('building ""', () => expectReject(bad((j) => { j.building = ''; }), 'building_invalid'));
  test('building whitespace', () => expectReject(bad((j) => { j.building = '   '; }), 'building_invalid'));
  test('nodes missing', () => expectReject(bad((j) => { delete j.nodes; }), 'nodes_not_array'));
  test('edges missing', () => expectReject(bad((j) => { delete j.edges; }), 'edges_not_array'));
  test('only exits', () =>
    expectReject(bad((j) => { j.nodes.forEach((n) => { n.type = 'exit'; }); }), 'need_room_or_junction'));
  test('no exits', () =>
    expectReject(bad((j) => { j.nodes.forEach((n) => { n.type = 'room'; }); }), 'need_exit'));

  // Costs
  for (const cost of [0, -1, 2.5, '3', null, 1e20]) {
    test(`cost ${JSON.stringify(cost)}`, () =>
      expectReject(bad((j) => { j.edges[0].cost = cost; }), 'edge_cost_invalid'));
  }
  test('cost 2.0 parses to 2 and is accepted', () => {
    const text = sampleText().replace('"cost": 2', '"cost": 2.0');
    assert.equal(validateBuilding(text).ok, true);
  });

  // Coordinates
  test('x "10"', () => expectReject(bad((j) => { j.nodes[0].x = '10'; }), 'node_coord_invalid'));
  test('x null', () => expectReject(bad((j) => { j.nodes[0].x = null; }), 'node_coord_invalid'));
  test('x missing', () => expectReject(bad((j) => { delete j.nodes[0].y; }), 'node_coord_invalid'));
  test('x 1e999 (text → Infinity)', () => {
    const text = JSON.stringify(sample()).replace('"x":60', '"x":1e999');
    assert.ok(text.includes('1e999'));
    expectReject(text, 'node_coord_invalid');
  });

  // Node fields
  test('label ""', () => expectReject(bad((j) => { j.nodes[0].label = ''; }), 'node_label_invalid'));
  test('type "Exit"', () => expectReject(bad((j) => { j.nodes[6].type = 'Exit'; }), 'node_type_invalid'));
  test('numeric node id', () => expectReject(bad((j) => { j.nodes[0].id = 1; }), 'node_id_invalid'));
  test('empty node id', () => expectReject(bad((j) => { j.nodes[0].id = ''; }), 'node_id_invalid'));
  test('duplicate node id', () => expectReject(bad((j) => { j.nodes[1].id = 'R1'; }), 'node_id_duplicate'));
  test('node not an object', () => expectReject(bad((j) => { j.nodes.push('R9'); }), 'node_not_object'));

  // Edges
  test('duplicate edge id', () =>
    expectReject(bad((j) => { j.edges.push({ id: 'L01', from: 'R2', to: 'C4', cost: 1 }); }), 'edge_id_duplicate'));
  test('edge to "Z9"', () => expectReject(bad((j) => { j.edges[0].to = 'Z9'; }), 'edge_endpoint_unknown'));
  test('self-loop', () => expectReject(bad((j) => { j.edges[0].to = 'R1'; }), 'edge_self_loop'));
  test('A-B plus B-A', () =>
    expectReject(bad((j) => { j.edges.push({ id: 'L99', from: 'C1', to: 'R1', cost: 1 }); }), 'edge_pair_duplicate'));
  test('edge id missing', () => expectReject(bad((j) => { delete j.edges[0].id; }), 'edge_id_invalid'));
  test('edge not an object', () => expectReject(bad((j) => { j.edges.push(42); }), 'edge_not_object'));

  // initial_state category / reference
  test('blocked_nodes ["E1"] (exit)', () =>
    expectReject(bad((j) => { j.initial_state.blocked_nodes = ['E1']; }), 'state_wrong_category'));
  test('closed_exits ["R1"] (room)', () =>
    expectReject(bad((j) => { j.initial_state.closed_exits = ['R1']; }), 'state_wrong_category'));
  test('blocked_edges ["C1"] (node id, not an edge)', () =>
    expectReject(bad((j) => { j.initial_state.blocked_edges = ['C1']; }), ['state_unknown_id', 'state_wrong_category']));
  test('blocked_nodes ["X"] (unknown)', () =>
    expectReject(bad((j) => { j.initial_state.blocked_nodes = ['X']; }), 'state_unknown_id'));
  test('blocked_nodes [1] (not a string)', () =>
    expectReject(bad((j) => { j.initial_state.blocked_nodes = [1]; }), 'state_id_not_string'));

  // initial_state structure
  test('initial_state missing', () => expectReject(bad((j) => { delete j.initial_state; }), 'initial_state_invalid'));
  test('initial_state is an array', () => expectReject(bad((j) => { j.initial_state = []; }), 'initial_state_invalid'));
  test('blocked_edges missing', () =>
    expectReject(bad((j) => { delete j.initial_state.blocked_edges; }), 'state_array_invalid'));
  test('blocked_nodes "R1"', () =>
    expectReject(bad((j) => { j.initial_state.blocked_nodes = 'R1'; }), 'state_array_invalid'));
});

describe('error collection', () => {
  test('multi-error file yields ≥3 errors', () => {
    const res = expectReject(
      bad((j) => {
        j.building = '';
        j.edges[0].cost = 0;
        j.nodes[0].type = 'Exit';
      }),
      'building_invalid',
    );
    assert.ok(res.errors.length >= 3, `got ${res.errors.length}: ${codes(res)}`);
    assert.ok(codes(res).includes('edge_cost_invalid'));
    assert.ok(codes(res).includes('node_type_invalid'));
  });

  test('rejected result has data null', () => {
    const res = validateBuilding('[]');
    assert.equal(res.data, null);
  });
});
