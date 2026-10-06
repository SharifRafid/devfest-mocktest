// Pure validator for building JSON (spec §3.1). No DOM access.
// Collects every error as {code, path, params}; messages are produced by i18n.

const NODE_TYPES = new Set(['room', 'junction', 'exit']);
const STATE_KEYS = ['blocked_nodes', 'blocked_edges', 'closed_exits'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const isId = (v) => typeof v === 'string' && v !== '';

export function stripBom(text) {
  return typeof text === 'string' && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseJsonText(text) {
  try {
    return { ok: true, value: JSON.parse(stripBom(String(text))) };
  } catch (e) {
    return { ok: false, errors: [{ code: 'json_parse', path: '$', params: { message: e.message } }] };
  }
}

export function validateBuilding(raw) {
  const errors = [];
  const warnings = [];
  const fail = () => ({ ok: false, errors, warnings, data: null });
  const err = (code, path, params = {}) => errors.push({ code, path, params });

  let root = raw;
  if (typeof raw === 'string') {
    const parsed = parseJsonText(raw);
    if (!parsed.ok) return { ok: false, errors: parsed.errors, warnings, data: null };
    root = parsed.value;
  }
  if (!isPlainObject(root)) {
    err('root_not_object', '$');
    return fail();
  }

  if (!isNonEmptyString(root.building)) err('building_invalid', 'building');

  // Nodes
  const nodes = new Map(); // id -> node (first occurrence of each valid id)
  const cleanNodes = [];
  if (!Array.isArray(root.nodes)) {
    err('nodes_not_array', 'nodes');
  } else {
    const n = root.nodes.length;
    if (n < 2 || n > 60) err('nodes_count', 'nodes', { count: n, min: 2, max: 60 });
    root.nodes.forEach((node, i) => {
      const p = `nodes[${i}]`;
      if (!isPlainObject(node)) return err('node_not_object', p);
      let valid = true;
      if (!isId(node.id)) {
        err('node_id_invalid', `${p}.id`);
        valid = false;
      } else if (nodes.has(node.id)) {
        err('node_id_duplicate', `${p}.id`, { id: node.id });
        valid = false;
      }
      if (!isNonEmptyString(node.label)) { err('node_label_invalid', `${p}.label`); valid = false; }
      if (!NODE_TYPES.has(node.type)) {
        err('node_type_invalid', `${p}.type`, { type: String(node.type) });
        valid = false;
      }
      for (const axis of ['x', 'y']) {
        if (typeof node[axis] !== 'number' || !Number.isFinite(node[axis])) {
          err('node_coord_invalid', `${p}.${axis}`, { axis });
          valid = false;
        }
      }
      if (isId(node.id) && !nodes.has(node.id)) {
        // Register even if other fields are bad, so edges referencing it don't add noise.
        nodes.set(node.id, node);
      }
      if (valid) {
        cleanNodes.push({ id: node.id, label: node.label, type: node.type, x: node.x, y: node.y });
      }
    });
    const types = root.nodes.filter(isPlainObject).map((nd) => nd.type);
    if (!types.some((t) => t === 'room' || t === 'junction')) err('need_room_or_junction', 'nodes');
    if (!types.includes('exit')) err('need_exit', 'nodes');
  }

  // Edges
  const edgeIds = new Set();
  const pairs = new Set();
  const cleanEdges = [];
  if (!Array.isArray(root.edges)) {
    err('edges_not_array', 'edges');
  } else {
    const m = root.edges.length;
    if (m < 1 || m > 150) err('edges_count', 'edges', { count: m, min: 1, max: 150 });
    root.edges.forEach((edge, i) => {
      const p = `edges[${i}]`;
      if (!isPlainObject(edge)) return err('edge_not_object', p);
      let valid = true;
      if (!isId(edge.id)) {
        err('edge_id_invalid', `${p}.id`);
        valid = false;
      } else if (edgeIds.has(edge.id)) {
        err('edge_id_duplicate', `${p}.id`, { id: edge.id });
        valid = false;
      } else {
        edgeIds.add(edge.id);
      }
      let endsOk = true;
      for (const end of ['from', 'to']) {
        if (!isId(edge[end]) || !nodes.has(edge[end])) {
          err('edge_endpoint_unknown', `${p}.${end}`, { id: String(edge[end]) });
          endsOk = false;
        }
      }
      if (endsOk) {
        if (edge.from === edge.to) {
          err('edge_self_loop', p, { id: edge.from });
          valid = false;
        } else {
          const key = JSON.stringify([edge.from, edge.to].sort());
          if (pairs.has(key)) {
            err('edge_pair_duplicate', p, { from: edge.from, to: edge.to });
            valid = false;
          }
          pairs.add(key);
        }
      } else {
        valid = false;
      }
      if (!Number.isSafeInteger(edge.cost) || edge.cost <= 0) {
        err('edge_cost_invalid', `${p}.cost`, { cost: String(edge.cost) });
        valid = false;
      }
      if (valid) cleanEdges.push({ id: edge.id, from: edge.from, to: edge.to, cost: edge.cost });
    });
  }

  // initial_state
  const cleanState = { blocked_nodes: [], blocked_edges: [], closed_exits: [] };
  const st = root.initial_state;
  if (!isPlainObject(st)) {
    err('initial_state_invalid', 'initial_state');
  } else {
    for (const key of STATE_KEYS) {
      const p = `initial_state.${key}`;
      const arr = st[key];
      if (!Array.isArray(arr)) {
        err('state_array_invalid', p);
        continue;
      }
      const seen = new Set();
      arr.forEach((id, i) => {
        const ip = `${p}[${i}]`;
        if (typeof id !== 'string') return err('state_id_not_string', ip);
        if (seen.has(id)) return warnings.push({ code: 'state_duplicate', path: ip, params: { id } });
        if (key === 'blocked_edges') {
          if (!edgeIds.has(id)) return err('state_unknown_id', ip, { id });
        } else {
          const node = nodes.get(id);
          if (!node) return err('state_unknown_id', ip, { id });
          const wantExit = key === 'closed_exits';
          if ((node.type === 'exit') !== wantExit) {
            return err('state_wrong_category', ip, { id, type: String(node.type) });
          }
        }
        seen.add(id);
        cleanState[key].push(id);
      });
    }
  }

  if (errors.length) return fail();
  return {
    ok: true,
    errors,
    warnings,
    data: { building: root.building, nodes: cleanNodes, edges: cleanEdges, initial_state: cleanState },
  };
}
