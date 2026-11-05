/* Cheer & Chores QR helpers: draw the "add a device" QR code and read one from the camera.
   Built into ../qr.js with `npm run build`; the app loads it only when a QR code is shown or scanned.
   Everything runs on the device: nothing is sent anywhere. */
import qrcode from "qrcode-generator";
import jsQR from "jsqr";

/** The QR code for `text` as a grid: { n, dark(row, col) }. Medium error correction. */
export function matrix(text) {
  const q = qrcode(0, "M");
  q.addData(text, "Byte");
  q.make();
  const n = q.getModuleCount();
  return { n, dark: (r, c) => q.isDark(r, c) };
}

/** An SVG of the QR code: always black on white (phone cameras need the contrast), with a quiet zone. */
export function svg(text, margin = 4) {
  const { n, dark } = matrix(text);
  const size = n + margin * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) d += `M${c + margin},${r + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** Read a QR code from RGBA pixels (a camera frame). Returns its text, or null. */
export function decode(rgba, width, height) {
  const r = jsQR(rgba, width, height, { inversionAttempts: "dontInvert" });
  return r ? r.data : null;
}
