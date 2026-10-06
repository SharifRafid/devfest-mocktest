// PNG export of the current map (optional extension, spec §4.2). DOM-only.
// The SVG is cloned with computed styles inlined (an SVG rendered as an image
// can't see the page's stylesheet), drawn onto a canvas under a text header,
// then downloaded.

const STYLE_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight',
  'text-anchor', 'dominant-baseline', 'paint-order', 'visibility', 'display',
];
const SCALE = 2;

function inlineStyles(source, clone) {
  const src = [source, ...source.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((node, i) => {
    const cs = getComputedStyle(node);
    dst[i].setAttribute('style', STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
  });
  // Snapshot the final state, not a frame of a running animation.
  for (const line of clone.querySelectorAll('.route-line')) {
    line.style.strokeDasharray = 'none';
    line.style.opacity = '1';
  }
  for (const node of clone.querySelectorAll('.edge-hit, title')) node.remove();
}

/**
 * @param {SVGSVGElement} svg  the live map
 * @param {{title: string, lines: string[], filename: string, background?: string}} info
 */
export async function exportMapPng(svg, { title, lines, filename, background = '#ffffff' }) {
  const vb = svg.viewBox.baseVal;
  const clone = svg.cloneNode(true);
  inlineStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', vb.width * SCALE);
  clone.setAttribute('height', vb.height * SCALE);

  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();

  const font = getComputedStyle(document.body).fontFamily;
  const pad = 24 * SCALE;
  const lineH = 22 * SCALE;
  const headerH = pad + 30 * SCALE + lines.length * lineH + 8 * SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(vb.width * SCALE, 640 * SCALE);
  canvas.height = headerH + vb.height * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${22 * SCALE}px ${font}`;
  ctx.fillText(title, pad, pad);
  ctx.font = `500 ${15 * SCALE}px ${font}`;
  ctx.fillStyle = '#334155';
  lines.forEach((text, i) => ctx.fillText(text, pad, pad + 32 * SCALE + i * lineH));

  ctx.drawImage(img, (canvas.width - vb.width * SCALE) / 2, headerH);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return blob;
}
