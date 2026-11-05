/* End-to-end family sync test: two (and then three) app instances talk to a real
   Firestore emulator through src/sync.js, with the real security rules loaded.
   Start the emulator first (see README): firebase emulators:start --only firestore --project demo-cheer
   Then: node tests/sync.test.mjs */
import { JSDOM } from "jsdom";
import fs from "fs";
import assert from "assert";
import { webcrypto } from "crypto";
import * as SYNCMOD from "../src/sync.js";
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, collection, getDocs, doc, getDoc } from "firebase/firestore";

const HOST = process.env.FS_HOST || "127.0.0.1", PORT = +(process.env.FS_PORT || 8085);
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const CONFIG_SNIPPET = `// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "AIzaFakeKeyForEmulator000000000000000",
  authDomain: "demo-cheer.firebaseapp.com",
  projectId: "demo-cheer",
  storageBucket: "demo-cheer.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
const app = initializeApp(firebaseConfig);`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (await fn()) return; } catch (e) {} await sleep(50); }
  for (const d of DEVICES) console.log(`  [${d.name}] toast=${(d.$(".toast") || {}).textContent} sync=${JSON.stringify({ state: d.SYNC().state, err: d.SYNC().err })}`);
  throw new Error("timed out waiting for: " + what);
}
let n = 0; const ok = m => { n++; console.log("ok", n, m); };
const errors = [];

function device(name, storage = {}) {
  const dom = new JSDOM(html, {
    url: "https://example.test/", runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, save() {}, translate() {}, rotate() {}, fillRect() {}, restore() {} });
      Object.defineProperty(w, "crypto", { value: webcrypto });
      w.TextEncoder = TextEncoder;
      const ls = { getItem: k => k in storage ? storage[k] : null, setItem: (k, v) => { storage[k] = String(v) }, removeItem: k => { delete storage[k] } };
      Object.defineProperty(w, "localStorage", { value: ls });
      w.scrollTo = () => {};
      w.__ccSyncModule = SYNCMOD;
      w.__ccSyncOpts = { memory: true, emulator: { host: HOST, port: PORT } };
    }
  });
  const w = dom.window;
  w.addEventListener("error", e => errors.push(name + ": " + e.message));
  const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
  const click = el => { assert(el, name + ": missing element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
  const act = (a, extra = "") => $(`[data-act="${a}"]${extra}`);
  const S = () => w.eval("S"), SY = () => w.eval("SY"), SYNC = () => w.eval("SYNC");
  const text = () => w.document.getElementById("app").textContent;
  const kidByName = nm => S().kids.find(k => k.name === nm);
  async function parent(pin = "4321") {
    if (act("home")) click(act("home"));
    click(act("parentLogin"));
    for (const d of pin) click($(`[data-n="${d}"]`));
    await until(() => text().includes("Parent Dashboard"), name + " parent dashboard");
  }
  const dev = { w, storage, $, $$, click, act, S, SY, SYNC, text, kidByName, parent, name };
  DEVICES.push(dev);
  return dev;
}
const DEVICES = [];

/* ---------- 1. Device A: normal first-run setup, then turn on family sync ---------- */
const A = device("A");
let inputs = A.$$("#setupKids input");
inputs[0].value = "Kid A"; inputs[0].dispatchEvent(new A.w.Event("input"));
inputs[1].value = "7"; inputs[1].dispatchEvent(new A.w.Event("input"));
A.click(A.act("addSetupKid")); inputs = A.$$("#setupKids input");
inputs[2].value = "Kid B"; inputs[2].dispatchEvent(new A.w.Event("input"));
inputs[3].value = "5"; inputs[3].dispatchEvent(new A.w.Event("input"));
A.$("#setupPin").value = "4321"; A.click(A.act("finishSetup"));
await until(() => A.$$('[data-act="openKid"]').length === 2, "A setup");
ok("device A set up with two kids, no sync yet");

await A.parent(); A.click(A.act("ptab", '[data-tab="settings"]'));
assert(A.text().includes("Family sync")); assert(A.$("#syncCode"), "sync code box");
A.$("#syncCode").value = "not a config"; A.click(A.act("syncOn"));
assert(!A.SY(), "garbage rejected"); ok("garbage setup text is rejected");

A.$("#syncCode").value = CONFIG_SNIPPET; A.click(A.act("syncOn"));
await until(() => A.SY() && A.SYNC().ready, "A family created", 15000);
const fid = A.SY().fid;
assert(/^[A-Za-z0-9]{32}$/.test(fid), "32-char family id");
assert.equal(A.SY().cfg.projectId, "demo-cheer"); assert.equal(A.SY().cfg.apiKey, "AIzaFakeKeyForEmulator000000000000000");
await until(() => A.$("#modal") && A.$("#modal").textContent.includes("Your family code"), "join code shown");
const code = A.$("#modal textarea").value;
assert(code.startsWith("CC1."), "join code format");
A.click(A.$("#modal [data-close]"));
ok("pasting the Firebase config snippet creates the family and shows a family code");

/* check what's on the server directly */
const admin = getFirestore(initializeApp({ projectId: "demo-cheer", apiKey: "x", appId: "x" }, "checker"));
connectFirestoreEmulator(admin, HOST, PORT);
const famSnap = await getDoc(doc(admin, "families", fid));
assert(famSnap.exists()); assert.equal(famSnap.data().chores.length, 12); assert.equal(famSnap.data().kidOrder.length, 2);
assert.equal(famSnap.data().pinHash.length, 64);
const kidSnaps = await getDocs(collection(admin, "families", fid, "kids"));
assert.equal(kidSnaps.size, 2);
ok("server holds settings, PIN hash and both kids");

/* ---------- 2. Device B joins with the family code ---------- */
const B = device("B");
assert(B.act("joinPrompt"), "join button on first-run screen");
B.click(B.act("joinPrompt"));
B.$("#joinCode").value = "CC1.garbage"; B.click(B.$("#modal [data-ok]"));
await sleep(100); assert(!B.SY(), "bad join code rejected");
B.$("#joinCode").value = "  " + code + "\n"; B.click(B.$("#modal [data-ok]"));
await until(() => B.$$('[data-act="openKid"]').length === 2, "B shows both kids", 15000);
assert.equal(B.SY().fid, fid);
assert.deepEqual(B.S().kids.map(k => k.name), ["Kid A", "Kid B"]);
assert.equal(B.S().kids[0].allowance, 7);
ok("device B joins with the family code and sees both kids");

/* ---------- 3. Kids on different devices: everyone sees each other's progress ---------- */
const kA = A.kidByName("Kid A").id, kB = A.kidByName("Kid B").id, chores = A.S().chores.map(c => c.id);
A.click(A.act("home")); A.click(A.$(`[data-act="openKid"][data-id="${kA}"]`));
B.click(B.$(`[data-act="openKid"][data-id="${kB}"]`));
for (const c of chores.slice(0, 3)) A.click(A.$(`[data-act="toggle"][data-id="${c}"]`));
B.click(B.$(`[data-act="toggle"][data-id="${chores[5]}"]`));
const today = A.w.eval("dayKey()");
await until(() => (B.kidByName("Kid A").done[today] || []).length === 3 && (A.kidByName("Kid B").done[today] || []).length === 1, "check-offs cross over");
ok("chores checked on one iPad show up on the other");

A.click(A.act("home")); B.click(B.act("home"));
await until(() => B.text().includes("Leading this week") && A.text().includes("Leading this week"), "leader crown");
const leadCard = B.$(`[data-act="openKid"][data-id="${kA}"]`).textContent;
assert(leadCard.includes("Leading this week")); assert(!B.$(`[data-act="openKid"][data-id="${kB}"]`).textContent.includes("Leading"));
ok("home screen crowns the kid with the most stars this week on every device");

/* same kid, same day, two devices at once: both check-offs survive */
A.click(A.$(`[data-act="openKid"][data-id="${kB}"]`)); B.click(B.$(`[data-act="openKid"][data-id="${kB}"]`));
A.click(A.$(`[data-act="toggle"][data-id="${chores[6]}"]`));
B.click(B.$(`[data-act="toggle"][data-id="${chores[7]}"]`));
await until(() => {
  const a = A.kidByName("Kid B").done[today] || [], b = B.kidByName("Kid B").done[today] || [];
  return a.length === 3 && b.length === 3 && [5, 6, 7].every(i => a.includes(chores[i]) && b.includes(chores[i]));
}, "simultaneous check-offs merge");
ok("two devices checking the same kid's chores at once both count");

/* unchecking on one device removes it everywhere */
B.click(B.$(`[data-act="toggle"][data-id="${chores[6]}"]`));
await until(() => !(A.kidByName("Kid B").done[today] || []).includes(chores[6]), "uncheck syncs");
ok("unchecking syncs too");

/* ---------- 4. Money: simultaneous changes add up, never overwrite ---------- */
await A.parent(); A.click(A.act("ptab", '[data-tab="money"]'));
A.click(A.act("payAllowance", `[data-kid="${kA}"]`));
await until(() => B.kidByName("Kid A").balance === 7, "allowance reaches B");
assert(B.kidByName("Kid A").allowancePaidWeek, "paid flag synced");
ok("allowance paid on one device shows on the other, marked paid for the week");

/* B: kid A buys a $0.50 item while A gives a $2 bonus at the same moment */
B.click(B.act("home")); B.click(B.$(`[data-act="openKid"][data-id="${kA}"]`)); B.click(B.act("tab", '[data-tab="shop"]'));
const buyBtn = B.$$('[data-act="buy"]').find(b => !b.disabled && b.closest(".item").textContent.includes("$0.50"));
B.click(buyBtn);
A.click(A.act("adjust", `[data-kid="${kA}"][data-dir="1"]`)); A.$("#amt").value = "2"; A.$("#note").value = "Helped"; A.click(A.$("#modal [data-ok]"));
B.click(B.$("#modal [data-ok]"));
await until(() => A.kidByName("Kid A").balance === 8.5 && B.kidByName("Kid A").balance === 8.5, "balance 7 + 2 - 0.50 on both");
await until(() => A.kidByName("Kid A").log.length === 3 && B.kidByName("Kid A").log.length === 3, "3 history lines on both");
assert.deepEqual(A.kidByName("Kid A").log.map(l => l.what).sort(), ["Bought 2 candies", "Helped", "Weekly allowance"].sort());
ok("a purchase on one device and a bonus on the other at the same time add up correctly ($8.50)");

/* ---------- 5. Offline: changes made offline merge when back online ---------- */
await SYNCMOD.network(B.SYNC().h, false);
B.click(B.act("tab", '[data-tab="savings"]'));
B.click(B.act("moveSave", '[data-dir="in"]')); B.$("#amt").value = "3"; B.click(B.$("#modal [data-ok]"));
assert.equal(B.kidByName("Kid A").saved, 3);
A.click(A.act("adjust", `[data-kid="${kA}"][data-dir="-1"]`)); A.$("#amt").value = "1"; A.$("#note").value = "Late"; A.click(A.$("#modal [data-ok]"));
await sleep(600);
assert.equal(A.kidByName("Kid A").saved, 0, "A can't see B's offline change yet");
await until(() => /offline|saving/.test(B.SYNC().state), "B knows it's not synced");
B.click(B.act("home")); assert(/Offline|Saving/.test(B.$("#syncpill").textContent), "home pill shows offline");
await SYNCMOD.network(B.SYNC().h, true);
await until(() => A.kidByName("Kid A").saved === 3 && A.kidByName("Kid A").balance === 4.5 && B.kidByName("Kid A").balance === 4.5 && B.kidByName("Kid A").saved === 3, "offline merge 8.5 - 3 - 1");
await until(() => B.SYNC().state === "synced" && /Synced/.test(B.$("#syncpill").textContent), "B pill back to synced");
B.click(B.$(`[data-act="openKid"][data-id="${kA}"]`));
ok("money moved to savings while offline merges with a change made elsewhere ($4.50 + $3 saved)");

/* ---------- 6. Parent settings sync, PIN works on every device ---------- */
A.click(A.act("ptab", '[data-tab="settings"]'));
const ci = A.$('[data-cf="nm"][data-i="0"]'); ci.value = "Make Your Bed!"; ci.dispatchEvent(new A.w.Event("change", { bubbles: true }));
const kn = A.$(`[data-kf="allowance"][data-id="${kB}"]`); kn.value = "6"; kn.dispatchEvent(new A.w.Event("change", { bubbles: true }));
await until(() => B.S().chores[0].nm === "Make Your Bed!" && B.kidByName("Kid B").allowance === 6, "settings reach B");
ok("chore and allowance edits on one device reach the others");

/* B's parent opens the dashboard with the same PIN */
await B.parent("4321");
ok("the same parent PIN unlocks the dashboard on the joined device");

/* typing on B is not interrupted by a remote change */
B.click(B.act("ptab", '[data-tab="settings"]'));
const bInput = B.$('[data-cf="nm"][data-i="1"]'); bInput.focus(); bInput.value = "Brush Teeth (typing…";
A.click(A.act("addChore"));
await until(() => B.w.eval("SYNC.pending") === true, "B defers render while typing");
assert.equal(B.$('[data-cf="nm"][data-i="1"]'), bInput, "B's input element wasn't replaced");
bInput.value = "Brush Teeth Morning"; bInput.dispatchEvent(new B.w.Event("change", { bubbles: true })); bInput.blur();
await until(() => A.S().chores.length === 13 && A.S().chores[1].nm === "Brush Teeth Morning" && B.S().chores.length === 13, "both edits land");
ok("a remote change never wipes out what a parent is typing; both edits land");

/* undo on B removes A's bonus everywhere */
B.click(B.act("ptab", '[data-tab="money"]'));
const before = A.kidByName("Kid A").balance;
B.click(B.act("undo", `[data-kid="${kA}"]`)); B.click(B.$("#modal [data-ok]"));
await until(() => A.kidByName("Kid A").balance === r2(before + 1) && !A.kidByName("Kid A").log.some(l => l.what === "Late"), "undo syncs");
ok("undo on one device reverses the entry everywhere");
function r2(x) { return Math.round(x * 100) / 100; }

/* ---------- 7. A third device (Karen's phone) joins, and a reload keeps working ---------- */
const C = device("C");
C.click(C.act("joinPrompt")); C.$("#joinCode").value = A.w.eval("joinCode()"); C.click(C.$("#modal [data-ok]"));
await until(() => C.S().kids.length === 2 && C.kidByName("Kid A").balance === A.kidByName("Kid A").balance, "C joined", 15000);
ok("a third device joins and matches");

const Breload = device("B2", B.storage);
await until(() => Breload.SYNC().ready && Breload.$$('[data-act="openKid"]').length === 2, "B reload connects");
assert.equal(Breload.SY().fid, fid);
ok("reopening the app reconnects to the family automatically");

/* add and remove a kid */
await A.parent(); A.click(A.act("ptab", '[data-tab="settings"]')); A.click(A.act("addKid"));
await until(() => C.S().kids.length === 3, "new kid reaches C");
const newId = A.S().kids[2].id;
A.click(A.act("delKid", `[data-id="${newId}"]`)); A.click(A.$("#modal [data-ok]"));
await until(() => C.S().kids.length === 2 && Breload.S().kids.length === 2, "kid removal reaches others");
ok("adding and removing a kid syncs");

/* disconnecting a device leaves the family alone */
C.click(C.act("parentLogin")); for (const d of "4321") C.click(C.$(`[data-n="${d}"]`));
await until(() => C.text().includes("Parent Dashboard"), "C parent");
C.click(C.act("ptab", '[data-tab="settings"]')); C.click(C.act("syncOff")); C.click(C.$("#modal [data-ok]"));
await until(() => !C.SY(), "C disconnected");
const famAfter = await getDoc(doc(admin, "families", fid));
assert(famAfter.exists()); assert.equal((await getDocs(collection(admin, "families", fid, "kids"))).size, 2);
ok("disconnecting a device keeps its own copy and doesn't touch the family");

/* ---------- 8. Security rules ---------- */
const anon = getFirestore(initializeApp({ projectId: "demo-cheer", apiKey: "x", appId: "x" }, "stranger"));
connectFirestoreEmulator(anon, HOST, PORT);
await assert.rejects(getDocs(collection(anon, "families")), e => /permission/i.test(e.code + e.message));
ok("nobody can list families");
await assert.rejects(getDoc(doc(anon, "families", "short")), e => /permission/i.test(e.code + e.message));
await assert.rejects(getDocs(collection(anon, "otherstuff")), e => /permission/i.test(e.code + e.message));
ok("short ids and anything outside families/ are refused");
const guess = await getDoc(doc(anon, "families", "A".repeat(32)));
assert(!guess.exists());
ok("a guessed id finds nothing");

assert.deepEqual(errors, [], "no runtime errors: " + errors.join("; "));
ok("no runtime errors on any device");
console.log(`ALL ${n} SYNC CHECKS PASSED`);
process.exit(0);
