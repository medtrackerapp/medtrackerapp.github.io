// Fills a Google Sheet with who uses the app. Runs every hour from .github/workflows/sheet.yml.
//   People          Google accounts (rewritten each run)
//   Daily summary   one row per day; past days are rebuilt from sign-up dates and saved doses
//                   the first time, then yesterday and today are refreshed and older rows kept
//   Guest trackers  trackers made by guests, soonest deletion first (rewritten each run)
// IDs link to the document in the Firebase console. Other tabs in the file are left alone.
//
// Needs FIREBASE_SERVICE_ACCOUNT (as cleanup.js; or a key file as the first argument) and
// SHEET_ID (the long id in the Sheet's link), the Sheet shared as Editor with the service
// account's email, and the Google Sheets API turned on for the project.
// --json prints the tables instead of writing them (tests, checking).
import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { JWT } from "google-auth-library";

const args = process.argv.slice(2);
const json = args.includes("--json");
const keyFile = args.find((a) => !a.startsWith("--"));
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
const IST = 5.5 * 3600000;
const DAY = 86400000;
const dateOf = (ms) => new Date(ms + IST).toISOString().slice(0, 10);
const msOf = (iso) => (iso ? Date.parse(iso) : 0);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (date, n) => new Date(Date.parse(date) + n * DAY).toISOString().slice(0, 10);
const now = Date.now();
const today = dateOf(now);
const weekStart = addDays(today, -6);

// ---------- Read everything ----------
const accounts = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  accounts.push(...page.users);
  pageToken = page.pageToken;
} while (pageToken);
const isGoogle = (u) => u.providerData.some((p) => p.providerId === "google.com");
const byUid = new Map(accounts.map((u) => [u.uid, u]));
const google = accounts.filter(isGoogle);
const guests = accounts.filter((u) => u.providerData.length === 0);

async function allDocs(query) {
  const docs = [];
  let last = null;
  for (;;) {
    const page = await (last ? query.startAfter(last) : query).limit(500).get();
    docs.push(...page.docs);
    if (page.size < 500) return docs;
    last = page.docs[page.docs.length - 1];
  }
}
const byId = (name) => db.collection(name).orderBy(FieldPath.documentId());
const users = new Map((await allDocs(byId("users"))).map((d) => [d.id, d.data()]));
const patients = new Map((await allDocs(byId("patients"))).map((d) => [d.id, d.data()]));

// Ticked doses: patients/{id}/days/{date} = { "<tab>_<i>": { by, uid, at } | true }
const ticksOn = new Map(); // date -> count, all trackers
const tracker = new Map(); // patientId -> { week, last }
const lastTickBy = new Map(); // uid -> ms of their latest tick
const tickersOn = new Map(); // date -> Set of uids who ticked
for (const d of await allDocs(db.collectionGroup("days").orderBy(FieldPath.documentId()))) {
  const patientId = d.ref.parent.parent.id;
  const date = d.id;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
  const ticks = Object.values(d.data());
  ticksOn.set(date, (ticksOn.get(date) ?? 0) + ticks.length);
  const t = tracker.get(patientId) ?? { week: 0, last: "" };
  if (date >= weekStart && date <= today) t.week += ticks.length;
  if (ticks.length && date > t.last) t.last = date;
  tracker.set(patientId, t);
  for (const tick of ticks) {
    if (!tick?.uid) continue;
    const at = tick.at?.toMillis?.() ?? Date.parse(date);
    if (at > (lastTickBy.get(tick.uid) ?? 0)) lastTickBy.set(tick.uid, at);
    if (!tickersOn.has(date)) tickersOn.set(date, new Set());
    tickersOn.get(date).add(tick.uid);
  }
}

// Last time the account used the app: sign-in, token refresh (hourly while open) or a tick
const lastActive = (u) => Math.max(msOf(u.metadata.lastRefreshTime), msOf(u.metadata.lastSignInTime), lastTickBy.get(u.uid) ?? 0);

// ---------- Cells ----------
// Text people typed is sent with a leading ' so the Sheet never runs it as a formula
const text = (v) => (v === undefined || v === null || v === "" ? "" : `'${v}`);
const date = (v) => v || "";
const link = (path, id) => `=HYPERLINK("https://console.firebase.google.com/project/${project}/firestore/databases/-default-/data/~2F${path}~2F${id}","${id}")`;
const medsOf = (p) => Object.values(p?.medicines ?? {}).length +
  (p?.builtinTabs === false ? 0 : ["1", "4", "6"].filter((k) => !p?.builtins?.[k]?.removed).length); // old 1x/4x/6x tabs

// ---------- People ----------
const peopleHead = ["Name", "Email", "Signed up", "Last active", "Days since active", "Tracker name", "PID",
  "Medicines", "Doses given (7 days)", "Trackers opened", "User ID", "Tracker ID"];
const people = google.map((u) => {
  const own = users.get(u.uid)?.patientId;
  const p = own ? patients.get(own) : null;
  const active = lastActive(u);
  return {
    sort: active,
    row: [
      text(u.displayName), text(u.email), date(dateOf(msOf(u.metadata.creationTime))), active ? dateOf(active) : "",
      active ? daysBetween(dateOf(active), today) : "", text(p?.patient?.name), text(p?.patient?.pid),
      p ? medsOf(p) : "", p ? tracker.get(own)?.week ?? 0 : "",
      Object.keys(users.get(u.uid)?.recent ?? {}).length, link("users", u.uid), p ? link("patients", own) : "",
    ],
  };
}).sort((a, b) => b.sort - a.sort).map((r) => r.row);

// ---------- Guest trackers ----------
const guestHead = ["Guest name", "Tracker name", "PID", "Created", "Last dose given", "Medicines",
  "Doses given (7 days)", "Deletes on", "Days left", "Guest User ID", "Tracker ID"];
const GUEST_DAYS = 30;
const guestTrackers = [...patients].filter(([, p]) => {
  const owner = byUid.get(p.ownerUid);
  return p.expireAt || (owner && owner.providerData.length === 0);
}).map(([id, p]) => {
  const expire = p.expireAt?.toMillis?.();
  const t = tracker.get(id);
  return {
    sort: expire ?? Infinity,
    row: [
      text(byUid.get(p.ownerUid)?.displayName), text(p.patient?.name), text(p.patient?.pid),
      expire ? date(dateOf(expire - GUEST_DAYS * DAY)) : "", t?.last ? date(t.last) : "—", medsOf(p), t?.week ?? 0,
      expire ? date(dateOf(expire)) : "never", expire ? Math.max(0, daysBetween(today, dateOf(expire))) : "",
      p.ownerUid ? link("users", p.ownerUid) : "", link("patients", id),
    ],
  };
}).sort((a, b) => a.sort - b.sort).map((r) => r.row);

// ---------- Daily summary ----------
const dailyHead = ["Date", "Google accounts", "New this day", "Active (7 days)", "Guest logins",
  "Guest trackers", "Trackers", "Doses given that day"];
const createdOn = (list) => list.map((u) => dateOf(msOf(u.metadata.creationTime)));
const googleDays = createdOn(google);
const guestDays = createdOn(guests);
// Past days: what can be rebuilt. Active = Google accounts that ticked a dose that week;
// tracker counts aren't known for the past, so they stay empty.
function dailyRow(day, live) {
  const googleUids = new Set(google.map((u) => u.uid));
  let active;
  if (live) active = google.filter((u) => lastActive(u) >= now - 7 * DAY).length;
  else {
    const seen = new Set();
    for (let i = 0; i < 7; i++) for (const uid of tickersOn.get(addDays(day, -i)) ?? []) if (googleUids.has(uid)) seen.add(uid);
    active = seen.size;
  }
  return [
    date(day), googleDays.filter((d) => d <= day).length, googleDays.filter((d) => d === day).length, active,
    guestDays.filter((d) => d <= day).length,
    live ? guestTrackers.length : "", live ? patients.size : "", ticksOn.get(day) ?? 0,
  ];
}
const firstDay = [...googleDays, ...guestDays, ...ticksOn.keys()].filter((d) => d <= today).sort()[0] ?? today;

if (json) {
  const daily = [];
  for (let d = firstDay; d <= today; d = addDays(d, 1)) daily.push(dailyRow(d, d === today));
  console.log(JSON.stringify({ people: [peopleHead, ...people], daily: [dailyHead, ...daily], guests: [guestHead, ...guestTrackers] }));
  process.exit(0);
}

// ---------- Write to the Sheet ----------
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

const TABS = { people: "People", daily: "Daily summary", guests: "Guest trackers" };
const RED = { red: 0.98, green: 0.82, blue: 0.82 };
// Light red when a column's cell matches, from row 2 down
const redWhen = (sheetId, col, formula) => ({
  addConditionalFormatRule: { index: 0, rule: {
    ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 }],
    booleanRule: { condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: formula }] }, format: { backgroundColor: RED } },
  } },
});
const col = (n) => String.fromCharCode(65 + n);
const ruleFor = {
  people: (id) => [redWhen(id, 4, `=AND(ISNUMBER(${col(4)}2),${col(4)}2>14)`), redWhen(id, 7, `=${col(7)}2=0`), redWhen(id, 8, `=${col(8)}2=0`)],
  daily: () => [],
  guests: (id) => [redWhen(id, 8, `=AND(ISNUMBER(${col(8)}2),${col(8)}2<=7)`), redWhen(id, 5, `=${col(5)}2=0`), redWhen(id, 6, `=${col(6)}2=0`)],
};
const widthOf = { people: peopleHead.length, daily: dailyHead.length, guests: guestHead.length };

// New tabs get their header style, frozen row, filter and colours once; later runs leave
// any formatting you change alone
let sheets = (await api("?fields=sheets.properties")).sheets.map((s) => s.properties);
const fresh = new Set();
for (const [key, title] of Object.entries(TABS)) {
  if (sheets.some((s) => s.title === title)) continue;
  const reply = await api(":batchUpdate", "POST", { requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] });
  const props = reply.replies[0].addSheet.properties;
  sheets.push(props);
  fresh.add(key);
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
if (blank && fresh.size && sheets.length > 3) {
  const values = (await api(`/values/${encodeURIComponent(`'${blank.title}'!A1:Z5`)}`)).values;
  if (!values?.length) await api(":batchUpdate", "POST", { requests: [{ deleteSheet: { sheetId: blank.sheetId } }] });
}

const range = (title, a1) => encodeURIComponent(`'${title}'!${a1}`);
async function replaceTab(title, rows) {
  await api(`/values/${range(title, "A:Z")}:clear`, "POST", {});
  await api(`/values/${range(title, "A1")}?valueInputOption=USER_ENTERED`, "PUT", { values: rows });
}
await replaceTab(TABS.people, [peopleHead, ...people]);
await replaceTab(TABS.guests, [guestHead, ...guestTrackers]);

// Daily summary: keep rows already written (their live numbers can't be rebuilt), add missing
// days, and refresh yesterday and today
// Dates come back as day numbers (days since 1899-12-30), whatever the Sheet's locale
const existing = (await api(`/values/${range(TABS.daily, "A:A")}?valueRenderOption=UNFORMATTED_VALUE`)).values ?? [];
const isoOf = (v) => (typeof v === "number" ? new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY).toISOString().slice(0, 10) : String(v ?? ""));
const rowOf = new Map(existing.slice(1).map((r, i) => [isoOf(r[0]), i + 2]));
const data = [{ range: `'${TABS.daily}'!A1`, values: [dailyHead] }];
const missing = [];
for (let d = firstDay; d <= today; d = addDays(d, 1)) {
  const row = rowOf.get(d);
  if (row && d < addDays(today, -1)) continue;
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
console.log(`Sheet updated: ${people.length} Google account(s), ${guestTrackers.length} guest tracker(s), ` +
  `${missing.length} new day(s) in the summary.`);
