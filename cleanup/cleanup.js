// Deletes what guests left behind once its expireAt date has passed (30 days after a guest made it):
// their tracker (patients, with its days/ of ticked doses), its PID (pids) and their account's record (users).
// Runs once a day from .github/workflows/cleanup.yml; the free alternative to Firestore TTL
// policies, which need the paid plan. Only documents that have expireAt are ever touched, and
// the app only sets it on trackers a guest made from scratch (claimPatient in app.js).
//
// Needs FIREBASE_SERVICE_ACCOUNT: the JSON key of a service account allowed to use Firestore.
// DRY_RUN=1 only counts what would be deleted.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const COLLECTIONS = ["patients", "pids", "users"];
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

initializeApp({ credential: cert(credentials) });
const db = getFirestore();
const now = Timestamp.now();
console.log(`${dryRun ? "Dry run: counting" : "Deleting"} documents with expireAt before ${now.toDate().toISOString()}`);

let total = 0;
for (const name of COLLECTIONS) {
  // Pages of 500, so a big backlog never has to fit in memory at once
  let count = 0;
  let last = null; // dry run only: nothing gets deleted, so page past what was already counted
  for (;;) {
    let query = db.collection(name).where("expireAt", "<=", now).orderBy("expireAt").limit(500);
    if (dryRun && last) query = query.startAfter(last);
    const page = await query.get();
    if (page.empty) break;
    last = page.docs[page.docs.length - 1];
    count += page.size;
    if (!dryRun) {
      const writer = db.bulkWriter();
      // A tracker's days/ (ticked doses) go with it; deleting just the doc would leave them behind
      if (name === "patients") for (const snap of page.docs) await db.recursiveDelete(snap.ref, writer);
      else for (const snap of page.docs) writer.delete(snap.ref);
      await writer.close();
    }
    if (page.size < 500) break;
  }
  console.log(`${name}: ${count}`);
  total += count;
}
console.log(`${dryRun ? "Would delete" : "Deleted"} ${total} document(s).`);
