/* Test helper: turn the app's QR SVG into camera-like RGBA pixels. */
export function svgToRGBA(svg, { scale = 5, frameW = 640, frameH = 480, noise = 0, bg = 128 } = {}) {
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/); if (!vb) throw new Error("no viewBox");
  const size = +vb[1];
  const dark = new Set();
  for (const m of svg.matchAll(/M(\d+),(\d+)h1v1h-1z/g)) dark.add(m[1] + "," + m[2]);
  const data = new Uint8ClampedArray(frameW * frameH * 4);
  const ox = Math.floor((frameW - size * scale) / 2), oy = Math.floor((frameH - size * scale) / 2);
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < frameH; y++) for (let x = 0; x < frameW; x++) {
    const mx = Math.floor((x - ox) / scale), my = Math.floor((y - oy) / scale);
    let v = bg;
    if (mx >= 0 && my >= 0 && mx < size && my < size) v = dark.has(mx + "," + my) ? 20 : 235;
    v = Math.max(0, Math.min(255, v + (rnd() - 0.5) * 2 * noise));
    const i = (y * frameW + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width: frameW, height: frameH, size };
}
