// Pure geometry helpers: map arbitrary dataset coordinates into a fixed SVG viewBox.

/**
 * Uniformly scale and center node coordinates into [pad, width-pad] × [pad, height-pad].
 * Handles negative, huge and identical coordinates; y keeps pointing down (screen coords).
 */
export function fitToViewBox(nodes, { width = 1000, height = 600, pad = 60 } = {}) {
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX, spanY = maxY - minY;
  const innerW = width - 2 * pad, innerH = height - 2 * pad;

  const scales = [];
  if (spanX > 0) scales.push(innerW / spanX);
  if (spanY > 0) scales.push(innerH / spanY);
  const scale = scales.length ? Math.min(...scales) : 0;

  // Center the scaled drawing (a zero-extent axis collapses to the middle).
  const offX = pad + (innerW - spanX * scale) / 2;
  const offY = pad + (innerH - spanY * scale) / 2;

  const out = new Map();
  for (const n of nodes) {
    out.set(n.id, { x: offX + (n.x - minX) * scale, y: offY + (n.y - minY) * scale });
  }
  return out;
}

export function midpoint(p, q) {
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}
