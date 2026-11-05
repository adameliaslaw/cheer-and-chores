/* Cheer & Chores family sync.
   Thin wrapper over Cloud Firestore. The app (index.html) decides WHAT changed
   (syncOps) and this file only talks to Firebase. Built into ../sync.js with
   `npm run build`; the app loads it only after a family is set up.

   Data layout (one family):
     families/{familyId}            settings: chores, rewards, PIN hash, rules, kid order
     families/{familyId}/kids/{id}  one kid: balance, savings, check-offs, history, goals
   The family id is a long random code that only your own devices know. */
import { initializeApp, deleteApp } from "firebase/app";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  connectFirestoreEmulator, doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc,
  getDocFromServer, writeBatch, increment, arrayUnion, arrayRemove, deleteField, FieldPath, terminate,
  enableNetwork, disableNetwork
} from "firebase/firestore";

let appCount = 0;
/* plain copies: the app hands us plain JSON data; this also strips anything Firestore can't store */
const plain = o => o === undefined ? null : JSON.parse(JSON.stringify(o));

/** Open a connection to one family. opts.memory = no on-device cache (tests); opts.emulator = {host,port}. */
export function open(cfg, fid, opts = {}) {
  /* The long-lived connection is named after the family so its offline cache is found again
     on the next launch; quick checks (opts.temp) use a throwaway in-memory connection. */
  const name = opts.temp ? "cc-tmp-" + (++appCount) : "cc-" + fid + (opts.memory ? "-" + (++appCount) : "");
  const app = initializeApp({ apiKey: cfg.apiKey, projectId: cfg.projectId, appId: cfg.appId }, name);
  let localCache;
  if (opts.memory || opts.temp) localCache = memoryLocalCache();
  else {
    try { localCache = persistentLocalCache({ tabManager: persistentMultipleTabManager() }); }
    catch (e) { localCache = memoryLocalCache(); }
  }
  const db = initializeFirestore(app, { localCache, ignoreUndefinedProperties: true });
  if (opts.emulator) connectFirestoreEmulator(db, opts.emulator.host, opts.emulator.port);
  const fam = doc(db, "families", fid);
  return { app, db, fam, kids: collection(fam, "kids"), fid };
}

/** True if this family exists on the server (needs internet). */
export async function exists(h) {
  const s = await getDocFromServer(h.fam);
  return s.exists();
}

/** Create the family on the server from this device's data. Resolves once the server has it. */
export async function upload(h, family, kids) {
  const b = writeBatch(h.db);
  b.set(h.fam, plain(family));
  for (const k of kids) b.set(doc(h.kids, k.id), plain(k.data));
  await b.commit();
}

/** Live updates. onData(family|null, kids[]) fires when data changes; onStatus({pending,fromCache}|{error}). */
export function listen(h, onData, onStatus) {
  let fam, kids, famMeta, kidsMeta, last = "";
  const status = () => onStatus && onStatus({
    pending: !!((famMeta && famMeta.hasPendingWrites) || (kidsMeta && kidsMeta.hasPendingWrites)),
    fromCache: !!((famMeta && famMeta.fromCache) || (kidsMeta && kidsMeta.fromCache))
  });
  const emit = () => {
    if (fam === undefined || kids === undefined) return;
    const now = JSON.stringify([fam, kids]);
    if (now !== last) { last = now; onData(fam, kids); }
    status();
  };
  const fail = e => onStatus && onStatus({ error: (e && (e.code || e.message)) || "error" });
  const u1 = onSnapshot(h.fam, { includeMetadataChanges: true }, s => {
    famMeta = s.metadata;
    if (!s.exists() && s.metadata.fromCache) { status(); return; } /* not known yet; wait for the server */
    fam = s.exists() ? s.data() : null; emit();
  }, fail);
  const u2 = onSnapshot(h.kids, { includeMetadataChanges: true }, qs => {
    kids = qs.docs.map(d => Object.assign({}, d.data(), { id: d.id }));
    kidsMeta = qs.metadata; emit();
  }, fail);
  return () => { u1(); u2(); };
}

/** Write one set of changes (from syncOps in index.html). Works offline; Firestore sends it later. */
export function apply(h, ops) {
  const P = [];
  if (ops.family && Object.keys(ops.family).length) P.push(setDoc(h.fam, plain(ops.family), { merge: true }));
  for (const k of ops.kidsSet || []) {
    const d = plain(k); delete d.id;
    P.push(setDoc(doc(h.kids, k.id), d));
  }
  for (const id of ops.kidsDel || []) P.push(deleteDoc(doc(h.kids, id)));
  for (const u of ops.kidsUpd || []) {
    const args = [];
    for (const [path, op] of u.ops) {
      args.push(new FieldPath(...path),
        op.inc !== undefined ? increment(op.inc)
        : op.union ? arrayUnion(...plain(op.union))
        : op.remove ? arrayRemove(...plain(op.remove))
        : op.del ? deleteField()
        : plain(op.set));
    }
    if (args.length) P.push(updateDoc(doc(h.kids, u.id), ...args));
  }
  return Promise.all(P);
}

/** Turn the connection off/on (used by the tests to simulate going offline). */
export function network(h, on) { return on ? enableNetwork(h.db) : disableNetwork(h.db); }

/** Disconnect and free resources. */
export async function close(h) {
  try { await terminate(h.db); } catch (e) {}
  try { await deleteApp(h.app); } catch (e) {}
}
