// Pure router (spec §3.3/§3.4). No DOM access.
// Dijkstra that keeps the full path per node so ties resolve to the
// lexicographically smallest node-ID sequence. IDs compare by UTF-16 code unit.

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Element-wise code-unit comparison; a shorter prefix sorts first. */
export function compareSeq(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = cmpStr(a[i], b[i]);
    if (c !== 0) return c;
  }
  return cmpStr(a.length, b.length);
}

const result = (status, path = [], exit = null, cost = null) => ({ status, path, exit, cost });

export function findRoute(graph, state, startId) {
  const start = startId == null ? null : graph.nodes.get(startId);
  if (!start || start.type === 'exit') return result('no_start');
  if (state.blockedNodes.has(startId)) return result('start_blocked');

  const usable = (id) => {
    if (state.blockedNodes.has(id)) return false;
    return !(graph.nodes.get(id).type === 'exit' && state.closedExits.has(id));
  };

  const dist = new Map([[startId, 0]]);
  const path = new Map([[startId, [startId]]]);
  const done = new Set();

  for (;;) {
    // O(V²) extraction: unsettled node with minimum distance.
    let u = null;
    for (const [id, d] of dist) {
      if (!done.has(id) && (u === null || d < dist.get(u))) u = id;
    }
    if (u === null) break;
    done.add(u);
    if (graph.nodes.get(u).type === 'exit') continue; // exits are terminal

    for (const { to, edgeId, cost } of graph.adj.get(u)) {
      if (done.has(to) || state.blockedEdges.has(edgeId) || !usable(to)) continue;
      const nd = dist.get(u) + cost;
      const np = [...path.get(u), to];
      const cur = dist.get(to);
      if (cur === undefined || nd < cur || (nd === cur && compareSeq(np, path.get(to)) < 0)) {
        dist.set(to, nd);
        path.set(to, np);
      }
    }
  }

  // Minimum cost, then smallest exit ID; that exit's path is already lex-minimal.
  let best = null;
  for (const [id, d] of dist) {
    if (graph.nodes.get(id).type !== 'exit') continue;
    if (best === null || d < dist.get(best) || (d === dist.get(best) && cmpStr(id, best) < 0)) best = id;
  }
  if (best === null) return result('no_route');
  return result('ok', path.get(best), best, dist.get(best));
}
