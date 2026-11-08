// Fills a Google Sheet with who uses the app, at 7:40 am, 11:40 am, 3:40 pm and 7:40 pm India
// time (.github/workflows/sheet.yml), so it's current by 8, 12, 4 and 8:
//   People          Google accounts
//   Daily summary   one row per day; rows already written are kept, yesterday and today refreshed
//   Guest trackers  trackers made by guests, soonest deletion first
// IDs link to the document in the Firebase console. Other tabs in the file are left alone.
//
// The app needs most of Firestore's free 50,000 reads a day, so this reads as little as it can:
// - Accounts, sign-ups and activity come from Firebase Auth, which costs no reads.
// - What it read before is kept in a hidden "Sync state" tab (the Sheet costs nothing), so a run
//   re-reads only accounts and trackers that someone linked to them used since the last run (Auth
//   says who), and of those trackers' doses only the last day or two: the app only ticks today's.
// - The first run of the day also checks every tracker's last days, which catches doses given by
//   attendants it hasn't seen yet. Once a week, or when the tracker count doesn't add up, it
//   reads everything again. It never reads the whole dose history.
//
// Needs FIREBASE_SERVICE_ACCOUNT (or a key file as the first argument), SHEET_ID, the Sheet
// shared as Editor with the service account's email, and the Google Sheets API turned on.
// For tests: --json prints the tables instead of writing them, --state <file> keeps the state in
// a file instead of the Sheet, --full reads everything.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldPath, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { JWT } from "google-auth-library";

const args = process.argv.slice(2);
const json = args.includes("--json");
const stateAt = args.indexOf("--state");
const stateFile = stateAt >= 0 ? args[stateAt + 1] : null;
const keyFile = args.find((a, i) => !a.startsWith("--") && (stateAt < 0 || i !== stateAt + 1));
let credentials;
try {
  credentials = JSON.parse(keyFile ? readFileSync(keyFile, "utf8") : process.env.FIREBASE_SERVICE_ACCOUNT ?? "");
} catch {
  console.error("No service account key: set FIREBASE_SERVICE_ACCOUNT or pass a key file.");
  process.exit(1);
}
const sheetId = process.env.SHEET_ID?.trim();
if (!json && !sheetId) {
  console.error("SHEET_ID is not set (GitHub: Settings → Secrets and variables → Actions).");
  process.exit(1);
}

if (!getApps().length) initializeApp({ credential: cert(credentials) });
const db = getFirestore();
const auth = getAuth();
const project = credentials.project_id;

// ---------- Dates (India time, like the app's users) ----------
const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const IST = 5.5 * HOUR;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOf = (ms) => new Date(ms + IST).toISOString().slice(0, 10);
const msOf = (iso) => (iso ? Date.parse(iso) : 0);
const addDays = (date, n) => new Date(Date.parse(date) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const earlier = (a, b) => (a && a < b ? a : b);
const later = (a, b) => (a > b ? a : b);
const now = Date.now();
const today = dateOf(now);
const yesterday = addDays(today, -1);
const weekStart = addDays(today, -6); // "7 days" = today and the 6 before
const GUEST_DAYS = 30;

// ---------- The Sheet ----------
const TABS = { people: "People", daily: "Daily summary", guests: "Guest trackers", state: "Sync state" };
const client = new JWT({ email: credentials.client_email, key: credentials.private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const API = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
async function api(path, method = "GET", body) {
  const res = await client.request({ url: API + path, method, data: body }).catch((err) => {
    const status = err.response?.status;
    const message = err.response?.data?.error?.message ?? err.message;
    if (status === 403) {
      console.error(`The Sheet refused access: ${message}\nShare the Sheet as Editor with ${credentials.client_email}, ` +
        `and turn on the Google Sheets API: https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=${project}`);
    } else if (status === 404) console.error(`No Sheet with that SHEET_ID (${message}).`);
    else console.error(message);
    process.exit(1);
  });
  return res.data;
}
const range = (title, a1) => encodeURIComponent(`'${title}'!${a1}`);

let sheets = []; // the file's tabs
let existing = []; // Daily summary's Date column as written so far
let stateRows = [];
if (!json) {
  sheets = (await api("?fields=sheets.properties")).sheets.map((s) => s.properties);
  const has = (title) => sheets.some((s) => s.title === title);
  // Dates come back as day numbers (days since 1899-12-30), whatever the Sheet's locale
  if (has(TABS.daily)) existing = (await api(`/values/${range(TABS.daily, "A:A")}?valueRenderOption=UNFORMATTED_VALUE`)).values ?? [];
  if (has(TABS.state)) stateRows = (await api(`/values/${range(TABS.state, "A:B")}?valueRenderOption=UNFORMATTED_VALUE`)).values ?? [];
} else if (stateFile && existsSync(stateFile)) {
  stateRows = JSON.parse(readFileSync(stateFile, "utf8"));
}

// ---------- What earlier runs read (the Sync state tab: one row per account or tracker) ----------
//   meta:  { v, lastRun, fullAt, sweepDay, needFull }
//   u:uid  { p: own tracker id, r: trackers in their patient list }            (Google accounts)
//   t:id   { n: name, pid, m: medicines, o: ownerUid, x: expireAt (ms),
//            d: { date: doses } this week, l: last day with a dose, g: { uid: last day they gave one } this week }
const VERSION = 1;
function parseState(rows) {
  try {
    const s = { users: {}, trackers: {} };
    for (const [key, value] of rows) {
      if (key === "meta") Object.assign(s, JSON.parse(value));
      else if (key?.startsWith("u:")) s.users[key.slice(2)] = JSON.parse(value);
      else if (key?.startsWith("t:")) s.trackers[key.slice(2)] = JSON.parse(value);
    }
    return s.v === VERSION ? s : null;
  } catch {
    return null; // edited or damaged: read everything again
  }
}
function toRows({ users, trackers, ...meta }) {
  return [["meta", JSON.stringify(meta)],
    ...Object.entries(users).map(([uid, u]) => [`u:${uid}`, JSON.stringify(u)]),
    ...Object.entries(trackers).map(([id, t]) => [`t:${id}`, JSON.stringify(t)])];
}
const state = parseState(stateRows);

// ---------- Accounts (Firebase Auth: no Firestore reads) ----------
const accounts = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  accounts.push(...page.users);
  pageToken = page.pageToken;
} while (pageToken);
const byUid = new Map(accounts.map((u) => [u.uid, u]));
const google = accounts.filter((u) => u.providerData.some((p) => p.providerId === "google.com"));
const guests = accounts.filter((u) => u.providerData.length === 0);
// Last time the account used the app: its last sign-in or token refresh (hourly while it's open)
const lastActive = (u) => (u ? Math.max(msOf(u.metadata.lastRefreshTime), msOf(u.metadata.lastSignInTime)) : 0);

// ---------- Firestore (every read counted, for the log) ----------
let reads = 0;
async function getDocs(refs) {
  const snaps = [];
  for (let i = 0; i < refs.length; i += 100) {
    const part = refs.slice(i, i + 100);
    reads += part.length; // a missing document costs a read too
    snaps.push(...(await db.getAll(...part)));
  }
  return snaps;
}
async function query(q) {
  const snap = await q.get();
  reads += Math.max(1, snap.size); // an empty result still costs one
  return snap.docs;
}
async function queryAll(q) {
  const docs = [];
  for (let last = null; ;) {
    const page = await query((last ? q.startAfter(last) : q).limit(500));
    docs.push(...page);
    if (page.length < 500) return docs;
    last = page.at(-1);
  }
}

const medsOf = (p) => Object.values(p?.medicines ?? {}).length +
  (p?.builtinTabs === false ? 0 : ["1", "4", "6"].filter((k) => !p?.builtins?.[k]?.removed).length); // old 1x/4x/6x tabs
const userFrom = (snap) => ({
  p: typeof snap.get("patientId") === "string" ? snap.get("patientId") : null,
  r: Object.keys(snap.get("recent") ?? {}).length,
});
function trackerFrom(snap, old) {
  const p = snap.data();
  return { n: p.patient?.name ?? "", pid: p.patient?.pid ?? "", m: medsOf(p), o: p.ownerUid ?? null,
    x: p.expireAt?.toMillis?.() ?? null, d: old?.d ?? {}, l: old?.l ?? "", g: old?.g ?? {} };
}
// Made by a guest: it expires, or its owner is a guest login
const isGuest = (t) => t.x !== null || byUid.get(t.o)?.providerData.length === 0;

let trackers = {};
// days/{date} = { "<tab>_<i>": { by, uid, at } | true }
function countDoses(t, doc) {
  const date = doc.id;
  if (!DATE.test(date) || date > today) return;
  const ticks = Object.values(doc.data());
  if (!ticks.length) return;
  if (date > t.l) t.l = date;
  if (date < weekStart) return;
  t.d[date] = ticks.length;
  for (const tick of ticks) if (tick?.uid && !(t.g[tick.uid] >= date)) t.g[tick.uid] = date;
}
// Doses from `from` to today for these trackers, 20 at a time, replacing what was known for those days
async function readDays(ids, from) {
  for (let i = 0; i < ids.length; i += 20) {
    await Promise.all(ids.slice(i, i + 20).map(async (id) => {
      const docs = await query(db.collection(`patients/${id}/days`).where(FieldPath.documentId(), ">=", from));
      const t = trackers[id];
      for (const date of Object.keys(t.d)) if (date >= from) delete t.d[date];
      for (const doc of docs) countDoses(t, doc);
    }));
  }
}
// A guest's tracker with no doses this week: its last dose from all its days (30 at most)
async function readLastDoses(ids) {
  const idle = ids.filter((id) => isGuest(trackers[id]) && trackers[id].l < weekStart);
  for (let i = 0; i < idle.length; i += 20) {
    await Promise.all(idle.slice(i, i + 20).map(async (id) => {
      for (const doc of await query(db.collection(`patients/${id}/days`))) countDoses(trackers[id], doc);
    }));
  }
}

// ---------- Read everything (first run, weekly, or when the tracker count was off) ----------
async function readEverything() {
  const users = {};
  for (const snap of await getDocs(google.map((u) => db.doc(`users/${u.uid}`)))) users[snap.id] = userFrom(snap);
  trackers = {};
  for (const snap of await queryAll(db.collection("patients").orderBy(FieldPath.documentId()))) {
    trackers[snap.id] = trackerFrom(snap);
  }
  const ids = Object.keys(trackers);
  await readDays(ids, weekStart);
  await readLastDoses(ids);
  return users;
}

// ---------- Read only what can have changed since the last run ----------
async function readChanges() {
  // Tokens refresh at least hourly while the app is open, so anyone who used it since the last
  // run has a sign-in or refresh after this
  const since = state.lastRun - 65 * MIN;
  const used = (uid) => lastActive(byUid.get(uid)) >= since;

  // An account's record only changes when that account uses the app
  const users = {};
  for (const u of google) if (state.users[u.uid]) users[u.uid] = state.users[u.uid];
  const reread = google.filter((u) => !users[u.uid] || used(u.uid));
  for (const snap of await getDocs(reread.map((u) => db.doc(`users/${u.uid}`)))) users[snap.id] = userFrom(snap);

  // A tracker only changes when someone linked to it uses the app: its owner, the account whose
  // own tracker it is, or anyone who gave a dose this week. Anyone else: the daily check below.
  trackers = state.trackers;
  const homeOf = new Map();
  for (const [uid, u] of Object.entries(users)) if (u.p) homeOf.set(u.p, [...(homeOf.get(u.p) ?? []), uid]);
  const changed = Object.keys(trackers).filter((id) => {
    const t = trackers[id];
    return used(t.o) || (homeOf.get(id) ?? []).some(used) || Object.keys(t.g).some(used);
  });

  // New trackers: a guest's (its expireAt is set 30 days ahead when it's made), or an account's own
  const added = new Set();
  const madeAfter = Timestamp.fromMillis(state.lastRun - 2 * HOUR + GUEST_DAYS * DAY);
  for (const snap of await query(db.collection("patients").where("expireAt", ">", madeAfter))) {
    if (trackers[snap.id]) continue;
    trackers[snap.id] = trackerFrom(snap);
    added.add(snap.id);
  }
  const newHomes = Object.values(users).map((u) => u.p).filter((id) => id && !trackers[id]);
  for (const snap of await getDocs([...new Set([...changed, ...newHomes])].map((id) => db.doc(`patients/${id}`)))) {
    if (!snap.exists) {
      delete trackers[snap.id];
      continue;
    }
    if (!trackers[snap.id]) added.add(snap.id);
    trackers[snap.id] = trackerFrom(snap, trackers[snap.id]);
  }
  await readDays([...added], weekStart);
  await readLastDoses([...added]);

  // The app only ticks today's doses; a phone that was offline can send yesterday's late
  const recent = changed.filter((id) => trackers[id] && !added.has(id));
  await readDays(recent, later(weekStart, earlier(yesterday, addDays(dateOf(state.lastRun), -1))));

  // First run of the day: every other tracker's last days too, for doses by accounts not linked yet
  if (state.sweepDay !== today) {
    const done = new Set([...added, ...recent]);
    await readDays(Object.keys(trackers).filter((id) => !done.has(id)), later(weekStart, earlier(state.sweepDay, yesterday)));
  }
  return users;
}

// ---------- Read ----------
const olderThan = (ms, age) => !(now - ms <= age); // a missing time counts as old
const full = args.includes("--full") || !state || state.needFull ||
  olderThan(state.fullAt, 7 * DAY) || olderThan(state.lastRun, 2 * DAY);
const users = full ? await readEverything() : await readChanges();
for (const t of Object.values(trackers)) {
  for (const date of Object.keys(t.d)) if (date < weekStart) delete t.d[date];
  for (const [uid, date] of Object.entries(t.g)) if (date < weekStart) delete t.g[uid];
}
// The tracker count shows whether anything was missed (it costs 1 read per 1,000 trackers)
const total = (await db.collection("patients").count().get()).data().count;
reads += Math.max(1, Math.ceil(total / 1000));
if (total < Object.keys(trackers).length) {
  // Normally guest trackers the nightly clean-up deleted
  const expired = Object.keys(trackers).filter((id) => trackers[id].x !== null && trackers[id].x <= now);
  for (const snap of await getDocs(expired.map((id) => db.doc(`patients/${id}`)))) if (!snap.exists) delete trackers[snap.id];
}
const newState = { v: VERSION, lastRun: now, fullAt: full ? now : state.fullAt, sweepDay: today,
  needFull: total !== Object.keys(trackers).length, users, trackers };

// ---------- Cells ----------
// Text people typed is sent with a leading ' so the Sheet never runs it as a formula
const text = (v) => (v === undefined || v === null || v === "" ? "" : `'${v}`);
const date = (v) => v || "";
const link = (path, id) => `=HYPERLINK("https://console.firebase.google.com/project/${project}/firestore/databases/-default-/data/~2F${path}~2F${id}","${id}")`;
const week = (t) => Object.values(t.d).reduce((n, v) => n + v, 0);

// ---------- People ----------
const peopleHead = ["Name", "Email", "Signed up", "Last active", "Days since active", "Tracker name", "PID",
  "Medicines", "Doses given (7 days)", "Trackers opened", "User ID", "Tracker ID"];
const people = google.map((u) => {
  const own = users[u.uid]?.p;
  const t = own ? trackers[own] : null;
  const active = lastActive(u);
  return {
    sort: active,
    row: [
      text(u.displayName), text(u.email), date(dateOf(msOf(u.metadata.creationTime))), active ? dateOf(active) : "",
      active ? daysBetween(dateOf(active), today) : "", text(t?.n), text(t?.pid), t ? t.m : "", t ? week(t) : "",
      users[u.uid]?.r ?? 0, link("users", u.uid), t ? link("patients", own) : "",
    ],
  };
}).sort((a, b) => b.sort - a.sort).map((r) => r.row);

// ---------- Guest trackers ----------
const guestHead = ["Guest name", "Tracker name", "PID", "Created", "Last dose given", "Medicines",
  "Doses given (7 days)", "Deletes on", "Days left", "Guest User ID", "Tracker ID"];
const guestTrackers = Object.entries(trackers).filter(([, t]) => isGuest(t)).map(([id, t]) => ({
  sort: t.x ?? Infinity,
  row: [
    text(byUid.get(t.o)?.displayName), text(t.n), text(t.pid), t.x ? date(dateOf(t.x - GUEST_DAYS * DAY)) : "",
    t.l ? date(t.l) : "—", t.m, week(t), t.x ? date(dateOf(t.x)) : "never",
    t.x ? Math.max(0, daysBetween(today, dateOf(t.x))) : "", t.o ? link("users", t.o) : "", link("patients", id),
  ],
})).sort((a, b) => a.sort - b.sort).map((r) => r.row);

// ---------- Daily summary ----------
const dailyHead = ["Date", "Google accounts", "New this day", "Active (7 days)", "Guest logins",
  "Guest trackers", "Trackers", "Doses given that day"];
const createdOn = (list) => list.map((u) => dateOf(msOf(u.metadata.creationTime)));
const googleDays = createdOn(google);
const guestDays = createdOn(guests);
// Active and tracker counts are only known for today; doses for this week
function dailyRow(day, live) {
  return [
    date(day), googleDays.filter((d) => d <= day).length, googleDays.filter((d) => d === day).length,
    live ? google.filter((u) => lastActive(u) >= now - 7 * DAY).length : "", guestDays.filter((d) => d <= day).length,
    live ? guestTrackers.length : "", live ? total : "",
    day >= weekStart ? Object.values(trackers).reduce((n, t) => n + (t.d[day] ?? 0), 0) : "",
  ];
}
const firstDay = [...googleDays, ...guestDays].reduce((a, d) => (d < a ? d : a), today);

if (json) {
  const daily = [];
  for (let d = firstDay; d <= today; d = addDays(d, 1)) daily.push(dailyRow(d, d === today));
  if (stateFile) writeFileSync(stateFile, JSON.stringify(toRows(newState)));
  console.log(JSON.stringify({ mode: full ? "full" : "update", reads,
    people: [peopleHead, ...people], daily: [dailyHead, ...daily], guests: [guestHead, ...guestTrackers] }));
  process.exit(0);
}

// ---------- Write to the Sheet ----------
const RED = { red: 0.98, green: 0.82, blue: 0.82 };
// Light red when a column's cell matches, from row 2 down
const redWhen = (sheetId, col, formula) => ({
  addConditionalFormatRule: { index: 0, rule: {
    ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 }],
    booleanRule: { condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: formula }] }, format: { backgroundColor: RED } },
  } },
});
const col = (n) => String.fromCharCode(65 + n);
const isZero = (n) => `=AND(ISNUMBER(${col(n)}2),${col(n)}2=0)`;
const ruleFor = {
  people: (id) => [redWhen(id, 4, `=AND(ISNUMBER(${col(4)}2),${col(4)}2>14)`), redWhen(id, 7, isZero(7)), redWhen(id, 8, isZero(8))],
  daily: () => [],
  guests: (id) => [redWhen(id, 8, `=AND(ISNUMBER(${col(8)}2),${col(8)}2<=7)`), redWhen(id, 5, isZero(5)), redWhen(id, 6, isZero(6))],
};
const widthOf = { people: peopleHead.length, daily: dailyHead.length, guests: guestHead.length, state: 2 };

// New tabs get their header style, frozen row, filter and colours once; later runs leave any
// formatting you change alone. The state tab is hidden: deleting it only makes the next run read everything.
const fresh = new Set();
for (const [key, title] of Object.entries(TABS)) {
  if (sheets.some((s) => s.title === title)) continue;
  const reply = await api(":batchUpdate", "POST", { requests: [{ addSheet: { properties: {
    title, hidden: key === "state", gridProperties: { frozenRowCount: key === "state" ? 0 : 1, columnCount: widthOf[key] } } } }] });
  const props = reply.replies[0].addSheet.properties;
  sheets.push(props);
  fresh.add(key);
  if (key === "state") continue;
  await api(":batchUpdate", "POST", { requests: [
    { repeatCell: { range: { sheetId: props.sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.93, blue: 0.98 } } },
      fields: "userEnteredFormat(textFormat,backgroundColor)" } },
    { setBasicFilter: { filter: { range: { sheetId: props.sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: widthOf[key] } } } },
    ...ruleFor[key](props.sheetId),
  ] });
}
// A brand-new file has an empty "Sheet1": drop it once our tabs exist
const blank = sheets.find((s) => s.title === "Sheet1" || s.title === "Sheet 1");
if (blank && fresh.size) {
  const values = (await api(`/values/${range(blank.title, "A1:Z5")}`)).values;
  if (!values?.length) await api(":batchUpdate", "POST", { requests: [{ deleteSheet: { sheetId: blank.sheetId } }] });
}

// Writing past a tab's last row fails, so it grows first when needed
async function fitRows(title, count) {
  const props = sheets.find((s) => s.title === title);
  if (props.gridProperties.rowCount >= count) return;
  await api(":batchUpdate", "POST", { requests: [{ updateSheetProperties: {
    properties: { sheetId: props.sheetId, gridProperties: { rowCount: count } }, fields: "gridProperties.rowCount" } }] });
  props.gridProperties.rowCount = count;
}
async function replaceTab(title, rows, input = "USER_ENTERED") {
  await fitRows(title, rows.length + 1);
  // Only as wide as the tab: a range past its last column fails
  const width = Math.min(26, sheets.find((s) => s.title === title).gridProperties.columnCount);
  await api(`/values/${range(title, `A:${col(width - 1)}`)}:clear`, "POST", {});
  for (let i = 0; i < rows.length; i += 5000) {
    await api(`/values/${range(title, `A${i + 1}`)}?valueInputOption=${input}`, "PUT", { values: rows.slice(i, i + 5000) });
  }
}
await replaceTab(TABS.people, [peopleHead, ...people]);
await replaceTab(TABS.guests, [guestHead, ...guestTrackers]);

// Daily summary: keep rows already written (their live numbers can't be rebuilt), add missing
// days, and refresh yesterday and today
const isoOf = (v) => (typeof v === "number" ? new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY).toISOString().slice(0, 10) : String(v ?? ""));
const rowOf = new Map(existing.slice(1).map((r, i) => [isoOf(r[0]), i + 2]));
const data = [{ range: `'${TABS.daily}'!A1`, values: [dailyHead] }];
const missing = [];
for (let d = firstDay; d <= today; d = addDays(d, 1)) {
  const row = rowOf.get(d);
  if (row && d < yesterday) continue;
  const values = dailyRow(d, d === today);
  // Yesterday's row was written live last night; keep what can't be rebuilt (null = leave the cell)
  if (row && d !== today) values[3] = values[5] = values[6] = null;
  if (row) data.push({ range: `'${TABS.daily}'!A${row}`, values: [values] });
  else missing.push(values);
}
await api("/values:batchUpdate", "POST", { valueInputOption: "USER_ENTERED", data });
if (missing.length) {
  await api(`/values/${range(TABS.daily, "A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, "POST", { values: missing });
}

// Last, so a run that fails before this is simply redone from the previous state
await replaceTab(TABS.state, toRows(newState), "RAW");
console.log(`Sheet updated (${full ? "read everything" : "changes only"}): ${people.length} Google account(s), ` +
  `${guestTrackers.length} guest tracker(s), ${missing.length} new day(s), about ${reads} Firestore read(s).`);
