// Table of everyone who signed in with Google: name, email, dates, and their own tracker.
// Run on your own computer only (it reads everyone's email):
//   cd cleanup
//   npm run users              (uses key.json in this folder)
//   npm run users -- other.json
// Prints the table and saves users.csv here (opens in Excel / Google Sheets). Both key.json and
// users.csv are git-ignored. Key: Firebase console → Project settings → Service accounts →
// Generate new private key. Reads only; changes nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const keyFile = process.argv[2] ?? "key.json";
let credentials;
try {
  credentials = JSON.parse(readFileSync(keyFile, "utf8"));
} catch {
  console.error(`Couldn't read ${keyFile}. Save the service account key there (Firebase console → ` +
    "Project settings → Service accounts → Generate new private key).");
  process.exit(1);
}
if (!getApps().length) initializeApp({ credential: cert(credentials) });
const db = getFirestore();
const auth = getAuth();

// All sign-in accounts, 1000 per page
const accounts = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  accounts.push(...page.users);
  pageToken = page.pageToken;
} while (pageToken);
const google = accounts.filter((u) => u.providerData.some((p) => p.providerId === "google.com"));

// Their users/ docs (own tracker), then those trackers, in batches
async function getAll(refs) {
  const out = [];
  for (let i = 0; i < refs.length; i += 300) out.push(...(await db.getAll(...refs.slice(i, i + 300))));
  return out;
}
const userDocs = new Map((await getAll(google.map((u) => db.doc(`users/${u.uid}`)))).map((d) => [d.id, d]));
const trackerIds = [...new Set([...userDocs.values()].map((d) => d.get("patientId")).filter((id) => typeof id === "string"))];
const trackers = new Map((await getAll(trackerIds.map((id) => db.doc(`patients/${id}`)))).map((d) => [d.id, d]));

const day = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
const rows = google.map((u) => {
  const id = userDocs.get(u.uid)?.get("patientId");
  const t = id ? trackers.get(id) : null;
  const meds = Object.values(t?.get("medicines") ?? {}).length;
  return {
    Name: u.displayName ?? "",
    Email: u.email ?? "",
    "Signed up": day(u.metadata.creationTime),
    "Last sign-in": day(u.metadata.lastSignInTime),
    "Tracker name": t?.exists ? t.get("patient")?.name ?? "" : "",
    PID: t?.exists ? t.get("patient")?.pid ?? "" : "",
    Medicines: t?.exists ? meds : "",
    "Owns tracker": t?.exists ? (t.get("ownerUid") === u.uid ? "yes" : "no") : "",
    "Trackers opened": Object.keys(userDocs.get(u.uid)?.get("recent") ?? {}).length,
  };
}).sort((a, b) => b["Last sign-in"].localeCompare(a["Last sign-in"]));

console.table(rows);
console.log(`${rows.length} Google account(s), ${accounts.length - google.length} guest/attendant login(s).`);

// CSV with a BOM so Excel reads names in any language correctly
const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
const columns = Object.keys(rows[0] ?? { Name: "" });
const csv = [columns, ...rows.map((r) => columns.map((c) => r[c]))].map((r) => r.map(cell).join(",")).join("\r\n");
writeFileSync("users.csv", "﻿" + csv + "\r\n");
console.log("Saved users.csv");
