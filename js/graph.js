// Pure graph model + hazard state. No DOM access. State objects are never mutated.

export function buildGraph(data) {
  const nodes = new Map();
  const edges = new Map();
  const adj = new Map();
  for (const n of data.nodes) {
    nodes.set(n.id, { ...n });
    adj.set(n.id, []);
  }
  for (const e of data.edges) {
    edges.set(e.id, { ...e });
    adj.get(e.from).push({ to: e.to, edgeId: e.id, cost: e.cost });
    adj.get(e.to).push({ to: e.from, edgeId: e.id, cost: e.cost });
  }
  const init = data.initial_state;
  return {
    building: data.building,
    nodeIds: data.nodes.map((n) => n.id),
    nodes,
    edgeIds: data.edges.map((e) => e.id),
    edges,
    adj,
    initial: {
      blockedNodes: new Set(init.blocked_nodes),
      blockedEdges: new Set(init.blocked_edges),
      closedExits: new Set(init.closed_exits),
    },
  };
}

/** Fresh state from the file's original initial_state (used for load and Reset). */
export function createState(graph) {
  return cloneState(graph.initial);
}

export function cloneState(state) {
  return {
    blockedNodes: new Set(state.blockedNodes),
    blockedEdges: new Set(state.blockedEdges),
    closedExits: new Set(state.closedExits),
  };
}

function toggled(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Block/unblock a room or junction. Exits and unknown ids are ignored. */
export function toggleNode(graph, state, id) {
  const node = graph.nodes.get(id);
  if (!node || node.type === 'exit') return state;
  return { ...cloneState(state), blockedNodes: toggled(state.blockedNodes, id) };
}

export function toggleEdge(state, id) {
  return { ...cloneState(state), blockedEdges: toggled(state.blockedEdges, id) };
}

/** Close/reopen an exit. Non-exits are ignored. */
export function toggleExit(graph, state, id) {
  const node = graph.nodes.get(id);
  if (!node || node.type !== 'exit') return state;
  return { ...cloneState(state), closedExits: toggled(state.closedExits, id) };
}
