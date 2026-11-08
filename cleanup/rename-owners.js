// Puts each Google account's name on its own tracker (users/{uid}.patientId), and makes that
// account its owner, for trackers the app can't fix by itself: the account never opens the app
// again, or someone else claimed the tracker first (older app versions let the first Google
// visitor, e.g. a nurse, claim it; the rules don't let the app change ownerUid afterwards).
// A tracker that no Google account, or several, has as its own is left alone.
// It also refreshes the names saved in each account's patient switcher (users/{uid}.recent).
// Runs with the daily clean-up (.github/workflows/cleanup.yml). Only writes what differs, so
// running it again changes nothing. Logs no names or counts (Actions logs are public).
//
// Needs FIREBASE_SERVICE_ACCOUNT like cleanup.js. DRY_RUN=1 only counts what would change.
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const dryRun = process.env.DRY_RUN === "1";

const key = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!key) {
  console.error("FIREBASE_SERVICE_ACCOUNT is not set (GitHub: Settings → Secrets and variables → Actions).");
  process.exit(1);
}
let credentials;
try {
  credentials = JSON.parse(key);
} catch {
  console.error("FIREBASE_SERVICE_ACCOUNT isn't valid JSON. Paste the whole downloaded key file as the secret.");
  process.exit(1);
}

if (!getApps().length) initializeApp({ credential: cert(credentials) });
const db = getFirestore();
const auth = getAuth();

// Same as googleName() in app.js
function googleName(u) {
  return u.displayName || u.email?.split("@")[0] || "Patient";
}

async function allDocs(name) {
  // Pages of 500 by id
  const docs = [];
  let last = null;
  for (;;) {
    let query = db.collection(name).orderBy(FieldPath.documentId()).limit(500);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    docs.push(...page.docs);
    if (page.size < 500) break;
    last = page.docs[page.docs.length - 1];
  }
  return docs;
}

// uid -> Auth user (only accounts that still exist), 100 per lookup (the Admin SDK's limit)
async function lookUp(uids) {
  const found = new Map();
  const list = [...uids];
  for (let i = 0; i < list.length; i += 100) {
    const { users } = await auth.getUsers(list.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of users) found.set(u.uid, u);
  }
  return found;
}

const isGoogle = (u) => u?.providerData.some((p) => p.providerId === "google.com");

const patients = new Map((await allDocs("patients")).map((d) => [d.id, d]));
const users = await allDocs("users");
const accounts = await lookUp(new Set([
  ...users.map((d) => d.id),
  ...[...patients.values()].map((d) => d.get("ownerUid")).filter((uid) => typeof uid === "string" && uid),
]));

// Google accounts whose own tracker it is: patientId -> [uid]
const homeOf = new Map();
for (const d of users) {
  const id = d.get("patientId");
  if (typeof id !== "string" || !patients.has(id) || !isGoogle(accounts.get(d.id))) continue;
  homeOf.set(id, [...(homeOf.get(id) ?? []), d.id]);
}

const writer = dryRun ? null : db.bulkWriter();
const names = new Map(); // patientId -> name after this run
let renamed = 0, takenOver = 0, skipped = 0;
for (const [id, snap] of patients) {
  const ownerUid = snap.get("ownerUid");
  // Only the Google account whose own tracker it is names it. The recorded owner may just be the
  // first Google account that visited it (older app versions), so it never counts on its own.
  const homes = homeOf.get(id) ?? [];
  if (homes.length > 1) skipped++; // several Google accounts call it their own: leave it
  const uid = homes.length === 1 ? homes[0] : null;
  const takeOver = uid !== null && ownerUid !== uid;
  const current = snap.get("patient")?.name;
  names.set(id, current);
  if (!uid) continue;
  const name = googleName(accounts.get(uid));
  names.set(id, name);
  if (current === name && !takeOver) continue;
  if (current !== name) renamed++;
  if (takeOver) takenOver++;
  if (writer) {
    const update = [new FieldPath("patient", "name"), name];
    if (takeOver) update.push("ownerUid", uid);
    writer.update(snap.ref, ...update);
  }
}

// Patient switcher lists keep a copy of each tracker's name
let lists = 0;
for (const d of users) {
  const recent = d.get("recent");
  if (!recent || typeof recent !== "object") continue;
  const fields = [];
  for (const [id, entry] of Object.entries(recent)) {
    const name = names.get(id);
    if (name && entry?.name !== name) fields.push(new FieldPath("recent", id, "name"), name);
  }
  if (!fields.length) continue;
  lists++;
  writer?.update(d.ref, ...fields);
}
await writer?.close();

console.log(dryRun ? `Dry run: ${renamed || takenOver || lists ? "some" : "no"} names would change.` : "Done.");
