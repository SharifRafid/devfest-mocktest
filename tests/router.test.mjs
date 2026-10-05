import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toggleNode, toggleEdge, toggleExit, createState } from '../js/graph.js';
import { findRoute, compareSeq } from '../js/router.js';
import { sample, mk, route, load, assertRoute, assertStatus } from './helpers.mjs';

describe('compareSeq (code-unit, element-wise)', () => {
  test('R10 < R2 (no natural sort)', () => assert.equal(compareSeq(['R10'], ['R2']), -1));
  test('E1 < e1 (no localeCompare)', () => assert.equal(compareSeq(['E1'], ['e1']), -1));
  test('Z < a', () => assert.equal(compareSeq(['Z'], ['a']), -1));
  test('element-wise, not joined', () => assert.equal(compareSeq(['S', 'A', 'Z'], ['S', 'B']), -1));
  test('prefix: shorter first', () => {
    assert.equal(compareSeq(['S', 'A'], ['S', 'A', 'B']), -1);
    assert.equal(compareSeq(['S', 'A', 'B'], ['S', 'A']), 1);
  });
  test('equal → 0', () => assert.equal(compareSeq(['S', 'A', 'E'], ['S', 'A', 'E']), 0));
  test('greater → 1', () => assert.equal(compareSeq(['R2'], ['R10']), 1));
});

describe('§4.1 sample checks', () => {
  test('S1 baseline R1 → R1-C1-C2-E1, 7', () => {
    assertRoute(route(sample(), 'R1'), ['R1', 'C1', 'C2', 'E1'], 7);
  });
  test('S2 R1 + block C2 → R1-C1-C3-C4-E2, 11 (beats tied R1-R2-C3-C4-E2)', () => {
    const r = route(sample(), 'R1', (g, s) => toggleNode(g, s, 'C2'));
    assertRoute(r, ['R1', 'C1', 'C3', 'C4', 'E2'], 11);
  });
  test('S3 R1 + close E1 and E2 → no_route', () => {
    const r = route(sample(), 'R1', (g, s) => toggleExit(g, toggleExit(g, s, 'E1'), 'E2'));
    assertStatus(r, 'no_route');
  });
  test('S4 start R2 → R2-C3-C4-E2, 7', () => {
    assertRoute(route(sample(), 'R2'), ['R2', 'C3', 'C4', 'E2'], 7);
  });
  test('S5 R1 then block R1 → start_blocked', () => {
    assertStatus(route(sample(), 'R1', (g, s) => toggleNode(g, s, 'R1')), 'start_blocked');
  });
});

describe('hidden-style tests', () => {
  test('T1 exit-id tie: E10 beats E2', () => {
    const j = mk([['S'], ['E2', 'exit'], ['E10', 'exit']], [['S', 'E2', 5], ['S', 'E10', 5]]);
    assertRoute(route(j, 'S'), ['S', 'E10'], 5);
  });

  test('T2 predecessor trap → S-A-Z-T', () => {
    const j = mk(
      [['S'], ['B', 'junction'], ['Y', 'junction'], ['A', 'junction'], ['Z', 'junction'], ['T', 'exit']],
      [['S', 'B', 1], ['B', 'Y', 1], ['Y', 'T', 1], ['S', 'A', 1], ['A', 'Z', 1], ['Z', 'T', 1]],
    );
    assertRoute(route(j, 'S'), ['S', 'A', 'Z', 'T'], 3);
  });

  test('T3 exit id decided before path → S-B-E1', () => {
    const j = mk(
      [['S'], ['A', 'junction'], ['B', 'junction'], ['E1', 'exit'], ['E2', 'exit']],
      [['S', 'A', 1], ['A', 'E2', 1], ['S', 'B', 1], ['B', 'E1', 1]],
    );
    assertRoute(route(j, 'S'), ['S', 'B', 'E1'], 2);
  });

  test('T4 cost, not hops → S-A-B-E2, 3', () => {
    const j = mk(
      [['S'], ['A', 'junction'], ['B', 'junction'], ['E1', 'exit'], ['E2', 'exit']],
      [['S', 'E1', 10], ['S', 'A', 1], ['A', 'B', 1], ['B', 'E2', 1]],
    );
    assertRoute(route(j, 'S'), ['S', 'A', 'B', 'E2'], 3);
  });

  test('T5 disconnected graph is valid → no_route', () => {
    const j = mk(
      [['S'], ['A', 'junction'], ['E1', 'exit'], ['E2', 'exit']],
      [['S', 'A', 1], ['E1', 'E2', 1]],
    );
    assertStatus(route(j, 'S'), 'no_route');
  });

  test('T6 block edge L03 → R1-C1-C2-C4-E2, 10', () => {
    const r = route(sample(), 'R1', (g, s) => toggleEdge(s, 'L03'));
    assertRoute(r, ['R1', 'C1', 'C2', 'C4', 'E2'], 10);
  });

  const t7 = () => mk(
    [['S'], ['A', 'junction'], ['E1', 'exit'], ['E2', 'exit']],
    [['S', 'E1', 5], ['E1', 'E2', 1], ['S', 'A', 1], ['A', 'E2', 10]],
  );

  test('T7 closed exit is not an intermediate → S-A-E2, 11; then block A → no_route', () => {
    const { graph, state } = load(t7());
    let s = toggleExit(graph, state, 'E1');
    assertRoute(findRoute(graph, s, 'S'), ['S', 'A', 'E2'], 11);
    s = toggleNode(graph, s, 'A');
    assertStatus(findRoute(graph, s, 'S'), 'no_route');
  });

  test('T8 open exits are terminal → S-E1, 5', () => {
    assertRoute(route(t7(), 'S'), ['S', 'E1'], 5);
  });

  test('T9 no start → no_start (null, unknown, exit)', () => {
    const { graph, state } = load(sample());
    const s = toggleNode(graph, state, 'C2');
    assertStatus(findRoute(graph, s, null), 'no_start');
    assertStatus(findRoute(graph, s, 'NOPE'), 'no_start');
    assertStatus(findRoute(graph, s, 'E1'), 'no_start');
  });

  test('T10 block then unblock the start', () => {
    const { graph, state } = load(sample());
    let s = toggleNode(graph, state, 'R1');
    assertStatus(findRoute(graph, s, 'R1'), 'start_blocked');
    s = toggleNode(graph, s, 'R1');
    assertRoute(findRoute(graph, s, 'R1'), ['R1', 'C1', 'C2', 'E1'], 7);
  });

  test('T11 reset restores a non-empty initial_state; graph.initial untouched', () => {
    const j = sample();
    j.initial_state.blocked_edges = ['L03'];
    const { graph, state } = load(j);
    assertRoute(findRoute(graph, state, 'R1'), ['R1', 'C1', 'C2', 'C4', 'E2'], 10);
    let s = toggleEdge(state, 'L03');
    assertRoute(findRoute(graph, s, 'R1'), ['R1', 'C1', 'C2', 'E1'], 7);
    s = toggleNode(graph, s, 'C4');
    assertRoute(findRoute(graph, s, 'R1'), ['R1', 'C1', 'C2', 'E1'], 7);
    // toggles must not mutate graph.initial
    assert.deepEqual([...graph.initial.blockedEdges], ['L03']);
    assert.equal(graph.initial.blockedNodes.size, 0);
    assert.equal(graph.initial.closedExits.size, 0);
    // Reset
    s = createState(graph);
    assertRoute(findRoute(graph, s, 'R1'), ['R1', 'C1', 'C2', 'C4', 'E2'], 10);
    assert.notEqual(s.blockedEdges, graph.initial.blockedEdges, 'state must use fresh Sets');
  });

  test('T12 start blocked in initial_state; R2 still routes', () => {
    const j = sample();
    j.initial_state.blocked_nodes = ['R1'];
    const { graph, state } = load(j);
    assertStatus(findRoute(graph, state, 'R1'), 'start_blocked');
    assertRoute(findRoute(graph, state, 'R2'), ['R2', 'C3', 'C4', 'E2'], 7);
  });

  test('T13 all exits initially closed, reopen E1 → R2-C3-C4-C2-E1, 10', () => {
    const j = sample();
    j.initial_state.closed_exits = ['E1', 'E2'];
    const { graph, state } = load(j);
    assertStatus(findRoute(graph, state, 'R2'), 'no_route');
    const s = toggleExit(graph, state, 'E1');
    assertRoute(findRoute(graph, s, 'R2'), ['R2', 'C3', 'C4', 'C2', 'E1'], 10);
  });

  test('T14 case-sensitive ids: E1 beats e1 (edges L1 and l1)', () => {
    const j = mk(
      [['s'], ['E1', 'exit'], ['e1', 'exit']],
      [
        { id: 'L1', from: 's', to: 'E1', cost: 3 },
        { id: 'l1', from: 's', to: 'e1', cost: 3 },
      ],
    );
    assertRoute(route(j, 's'), ['s', 'E1'], 3);
  });

  test('T15 R10 beats R2 inside the path', () => {
    const j = mk(
      [['S'], ['R2'], ['R10'], ['E', 'exit']],
      [['S', 'R2', 1], ['R2', 'E', 1], ['S', 'R10', 1], ['R10', 'E', 1]],
    );
    assertRoute(route(j, 'S'), ['S', 'R10', 'E'], 2);
  });

  test('T16 longer path wins when lex-smaller → S-A-B-E', () => {
    const j = mk(
      [['S'], ['A', 'junction'], ['B', 'junction'], ['C', 'junction'], ['E', 'exit']],
      [['S', 'A', 1], ['A', 'B', 1], ['B', 'E', 1], ['S', 'C', 2], ['C', 'E', 1]],
    );
    assertRoute(route(j, 'S'), ['S', 'A', 'B', 'E'], 3);
  });

  test('T17 junction as start C3 → C3-C4-E2, 5', () => {
    assertRoute(route(sample(), 'C3'), ['C3', 'C4', 'E2'], 5);
  });
});

describe('state immutability', () => {
  test('toggles return a new state and leave the old one unchanged', () => {
    const { graph, state } = load(sample());
    const s2 = toggleNode(graph, state, 'C2');
    assert.notEqual(s2, state);
    assert.equal(state.blockedNodes.has('C2'), false);
    assert.equal(s2.blockedNodes.has('C2'), true);
    const s3 = toggleEdge(s2, 'L01');
    assert.equal(s2.blockedEdges.has('L01'), false);
    assert.equal(s3.blockedEdges.has('L01'), true);
    const s4 = toggleExit(graph, s3, 'E1');
    assert.equal(s3.closedExits.has('E1'), false);
    assert.equal(s4.closedExits.has('E1'), true);
  });
});
