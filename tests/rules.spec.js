// firestore.rules, checked against the Firestore emulator (it loads the rules from ../firebase.json):
//   npm run test:emulator
// Each check acts as a particular signed-in user (or nobody) and expects allowed / denied.
const { test, expect } = require("@playwright/test");
const { initializeApp } = require("firebase/app");
const {
  getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, getDoc, getDocs, collection,
  deleteDoc, deleteField, Timestamp, FieldPath,
} = require("firebase/firestore");

test.skip(!process.env.FIRESTORE_EMULATOR_HOST, "needs the Firebase emulators: npm run test:emulator");
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "desktop", "no browser involved, once is enough"));

let n = 0;
function client(uid) {
  const app = initializeApp({ projectId: "demo-medtracker", apiKey: "demo-key" }, `rules-${n++}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8085, uid ? { mockUserToken: { user_id: uid, sub: uid } } : undefined);
  return db;
}

async function outcome(fn) {
  try {
    await fn();
    return "allowed";
  } catch (e) {
    return e.code === "permission-denied" ? "denied" : `error ${e.code}`;
  }
}

const tag = Math.random().toString(36).slice(2, 10);
const G = `guest${tag}tracker00`;
const T = `googl${tag}tracker00`;
const OLD = `older${tag}tracker00`;
const later = Timestamp.fromMillis(Date.now() + 30 * 86400000);
const past = Timestamp.fromMillis(Date.now() - 86400000);

test("firestore.rules", async () => {
  const guest = client(`guest${tag}`);
  const google = client(`google${tag}`);
  const stranger = client(`stranger${tag}`);
  const nobody = client(null);

  const checks = [
    // Trackers are created with a delete date (guest) or without (Google user); older ones have no owner
    ["guest creates tracker with expireAt", "allowed", () =>
      setDoc(doc(guest, "patients", G), { patient: { name: "Guest" }, ownerUid: `guest${tag}`, expireAt: later }, { merge: true })],
    ["Google user creates tracker", "allowed", () =>
      setDoc(doc(google, "patients", T), { patient: { name: "Google" }, ownerUid: `google${tag}` }, { merge: true })],
    ["older tracker without owner", "allowed", () => setDoc(doc(stranger, "patients", OLD), { patient: { name: "Old" } })],

    // What nurses do with a link
    ["nurse adds a medicine", "allowed", () =>
      setDoc(doc(stranger, "patients", T), { medicines: { m1: { name: "Dolo", everyDays: 1, dosesPerDay: 2 } } }, { merge: true })],
    ["PID saved on tracker", "allowed", () => setDoc(doc(google, "patients", T), { patient: { pid: "ABC-DEF" } }, { merge: true })],
    ["nurse edits guest tracker", "allowed", () => updateDoc(doc(stranger, "patients", G), "notes", "hi")],
    ["older ticks map removed", "allowed", () => updateDoc(doc(stranger, "patients", T), "doses", deleteField())],
    ["nurse ticks a dose (daily record)", "allowed", () =>
      setDoc(doc(stranger, "patients", T, "days", "2026-11-05"), { m1_0: { by: "Asha", at: Timestamp.now() } }, { merge: true })],
    ["nurse unticks a dose", "allowed", () =>
      setDoc(doc(stranger, "patients", T, "days", "2026-11-05"), { m1_0: deleteField() }, { merge: true })],
    ["nurse reads the last week", "allowed", () => getDocs(collection(stranger, "patients", T, "days"))],
    ["daily record with a bad date id", "denied", () => setDoc(doc(stranger, "patients", T, "days", "yesterday"), { m1_0: true })],
    ["daily record deleted", "denied", () => deleteDoc(doc(stranger, "patients", T, "days", "2026-11-05"))],
    ["signed-out user reads daily records", "denied", () => getDocs(collection(nobody, "patients", T, "days"))],

    // Nobody can mark someone's tracker for deletion, or change its owner
    ["add expireAt to Google tracker", "denied", () => updateDoc(doc(stranger, "patients", T), "expireAt", past)],
    ["add expireAt via merge set", "denied", () => setDoc(doc(stranger, "patients", T), { expireAt: past }, { merge: true })],
    ["move guest tracker's date earlier", "denied", () => updateDoc(doc(stranger, "patients", G), "expireAt", past)],
    ["remove guest tracker's date", "denied", () => updateDoc(doc(stranger, "patients", G), "expireAt", deleteField())],
    ["change owner", "denied", () => updateDoc(doc(stranger, "patients", T), "ownerUid", `stranger${tag}`)],
    ["remove owner", "denied", () => updateDoc(doc(stranger, "patients", T), "ownerUid", deleteField())],
    ["older tracker gets its first owner", "allowed", () =>
      setDoc(doc(google, "patients", OLD), { ownerUid: `google${tag}` }, { merge: true })],
    ["delete a tracker", "denied", () => deleteDoc(doc(google, "patients", T))],

    // Signed out, bad ids
    ["signed-out user reads tracker", "denied", () => getDoc(doc(nobody, "patients", T))],
    ["signed-out user edits tracker", "denied", () => updateDoc(doc(nobody, "patients", T), "x", 1)],
    ["short tracker id", "denied", () => setDoc(doc(guest, "patients", "short"), { a: 1 })],

    // PIDs: create-only, exact shape
    ["guest PID with expireAt", "allowed", () => setDoc(doc(guest, "pids", `G${tag.slice(0, 2)}-${tag.slice(2, 5)}`), { patientId: G, expireAt: later })],
    ["PID taken twice", "denied", () => setDoc(doc(stranger, "pids", `G${tag.slice(0, 2)}-${tag.slice(2, 5)}`), { patientId: T })],
    ["PID with other fields", "denied", () => setDoc(doc(guest, "pids", `B${tag.slice(0, 2)}-${tag.slice(2, 5)}`), { patientId: G, extra: 1 })],
    ["PID with non-date expireAt", "denied", () => setDoc(doc(guest, "pids", `C${tag.slice(0, 2)}-${tag.slice(2, 5)}`), { patientId: G, expireAt: "soon" })],

    // Users: only your own record
    ["user writes own record", "allowed", () => setDoc(doc(guest, "users", `guest${tag}`), { patientId: G, recent: {} })],
    ["user writes someone else's record", "denied", () => setDoc(doc(stranger, "users", `guest${tag}`), { patientId: T })],
    ["user reads someone else's record", "denied", () => getDoc(doc(stranger, "users", `guest${tag}`))],
  ];

  const results = [];
  for (const [label, , fn] of checks) results.push(`${label}: ${await outcome(fn)}`);
  expect(results).toEqual(checks.map(([label, want]) => `${label}: ${want}`));
});
