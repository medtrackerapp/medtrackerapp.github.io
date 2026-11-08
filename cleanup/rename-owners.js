// Puts each Google account's name on its tracker, for trackers the app can't fix by itself:
// - the owner never opens the app again (the app only renames on the owner's own open, syncOwnerName)
// - the tracker has no ownerUid, or was claimed by a guest or a deleted account, so the app
//   never sees it as the Google user's (the rules don't let the app change ownerUid afterwards).
//   Such a tracker goes to the Google account whose own tracker it is (users/{uid}.patientId),
//   only when exactly one Google account has it as its own.
// It also refreshes the names saved in each account's patient switcher (users/{uid}.recent).
// Runs with the daily clean-up (.github/workflows/cleanup.yml). Only writes what differs, so
// running it again changes nothing. Logs counts only, no names (Actions logs are public).
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
  const owner = ownerUid ? accounts.get(ownerUid) : null;
  let uid = null;
  let takeOver = false;
  if (isGoogle(owner)) uid = ownerUid;
  else if (!owner || owner.providerData.length === 0) {
    // No owner, a guest owner, or an owner whose account is gone
    const homes = homeOf.get(id) ?? [];
    if (homes.length === 1) [uid, takeOver] = [homes[0], true];
    else if (homes.length > 1) skipped++; // several Google accounts call it their own: leave it
  }
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

console.log(`${dryRun ? "Would rename" : "Renamed"} ${renamed} tracker(s) to their Google name` +
  ` (${takenOver} taken over from no owner, a guest or a deleted account).`);
console.log(`${dryRun ? "Would update" : "Updated"} the patient list of ${lists} account(s).`);
if (skipped) console.log(`Left ${skipped} tracker(s) that several Google accounts call their own.`);
