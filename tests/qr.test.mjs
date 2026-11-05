/* QR round trip on the shipped bundle (qr.js): draw the join code, then read it back
   from a camera-like frame. Run: node tests/qr.test.mjs (after npm run build:qr). */
import assert from "assert";
import fs from "fs";
import * as QR from "../qr.js";
import { svgToRGBA } from "./qrpix.mjs";
let n = 0; const ok = m => { n++; console.log("ok", n, m); };
const b64u = s => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/* realistic lengths: a Firebase web API key, project id, app id and the 32-char family id */
const code = "CC1." + b64u(JSON.stringify({ k: "AIzaSyD" + "x".repeat(32), p: "choreboard-ab123", a: "1:123456789012:web:" + "f".repeat(22), f: "Ab3".repeat(10) + "Zz" }));
const url = "https://adameliaslaw.github.io/cheer-and-chores/#join=" + code;
const svg = QR.svg(url);
assert(svg.startsWith("<svg") && /viewBox="0 0 \d+ \d+"/.test(svg) && svg.includes('fill="#fff"'));
const { n: modules } = QR.matrix(url);
console.log(`  join link is ${url.length} characters; QR is ${modules}x${modules} modules`);
assert(modules <= 81, "QR stays small enough for an iPad camera at arm's length");
ok("draws the join link as a black-on-white SVG QR code");
for (const [scale, noise] of [[3, 0], [4, 25], [6, 40]]) {
  const f = svgToRGBA(svg, { scale, noise, frameW: 640, frameH: 480 });
  assert.equal(QR.decode(f.data, f.width, f.height), url, `decode at scale ${scale}, noise ${noise}`);
}
ok("reads the code back from 640x480 camera-like frames, including noisy ones");
const blank = new Uint8ClampedArray(320 * 240 * 4).fill(200);
assert.equal(QR.decode(blank, 320, 240), null);
ok("an empty frame reads as nothing");
const src = fs.readFileSync(new URL("../qr.js", import.meta.url), "utf8");
assert(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(src), "QR bundle makes no network calls");
ok("the QR bundle makes no network calls");
console.log(`ALL ${n} QR CHECKS PASSED`);
