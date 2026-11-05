import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  collection,
  query,
  where,
  documentId,
  writeBatch,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteField,
  arrayUnion,
  arrayRemove,
  FieldPath,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  updateProfile,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------- Date helpers (local time, not UTC) ----------
function todayStr(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(fromStr, toStr) {
  const [y1, m1, d1] = fromStr.split("-").map(Number);
  const [y2, m2, d2] = toStr.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return todayStr(new Date(y, m - 1, d + n));
}

function shortDate(daysFromToday) {
  if (daysFromToday === 0) return "today";
  if (daysFromToday === 1) return "tomorrow";
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

// ---------- Patient ID (lives in the share link) ----------
function randomId(len = 20, chars = "abcdefghijkmnpqrstuvwxyz23456789") {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// ---------- PID (short code attendants will use to find a patient) ----------
// Uppercase only and no look-alikes (0/O, 1/I/L), so it's easy to read out and type.
// No "/" or ".": PIDs are also Firestore document ids.
const PID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789#$%&@*+=?";

function randomPid() {
  const raw = randomId(6, PID_CHARS);
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

// What an attendant typed -> "XXX-XXX", or null if it can't be a PID. Dash and case are optional.
function normalizePid(text) {
  const raw = text.replace(/[\s-]/g, "").toUpperCase();
  if (raw.length !== 6 || [...raw].some((c) => !PID_CHARS.includes(c))) return null;
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

// Both are set once someone signs in (see openPatient).
let patientId = null;
let patientRef = null;

// ---------- Firebase ----------
// Tests (tests/emulator.spec.js) use local emulators: on localhost, ?emulator switches to a
// throwaway demo project for the rest of the tab, so nothing touches the real database.
const useEmulators = ["localhost", "127.0.0.1"].includes(location.hostname) && (() => {
  try {
    if (new URLSearchParams(location.search).has("emulator")) sessionStorage.setItem("medicineTracker:emulator", "1");
    return sessionStorage.getItem("medicineTracker:emulator") === "1";
  } catch {
    return false;
  }
})();
const app = initializeApp(useEmulators
  ? { projectId: "demo-medtracker", apiKey: "demo-key", authDomain: "demo-medtracker.firebaseapp.com" }
  : firebaseConfig);
// Local cache lets the app keep working on spotty Wi-Fi; changes sync when back online.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
const auth = getAuth(app);
if (useEmulators) {
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}
let user; // undefined until Firebase reports the sign-in state, then null or the Google user

// ---------- State ----------
// Shared across all nurses (Firestore document):
//   patient: { name, code }       – name comes from the first Google account to open it; code is legacy
//   ownerUid                      – that account's uid
//   builtinTabs: false            – set for patients created after the 1x/4x/6x tabs were retired
//   builtins: { "4": { name, notes, everyDays, dosesPerDay, startDate, removed } } – nurse edits to 1x/4x/6x
//   courses: { "4": { startDays, startDate }, "m3k…": … }  – days-left baseline per tab
//   startDays, startDate          – old patient-wide days-left baseline (fallback for tabs without a course)
//   doses: { "2026-10-30": { "4_0": true } } – legacy; moved into days/ on open (migrateDoses)
//   reminders: { "4_0": "08:30" }
//   medicines: { "m3k…": { name, everyDays, dosesPerDay, notes, startDate, createdAt } } – added via "+"
//   order: ["m3k…", "4", …]       – tab order set by dragging on the Medicines screen
//   folders: { "f9x…": { name, meds: ["m3k…", …], createdAt } } – a medicine is in one folder at most
// Dose/reminder keys are `${tabId}_${doseIndex}`; tab IDs never contain "_".
// Ticked doses live in their own small docs, one per day, so the patient doc stops growing:
//   patients/{id}/days/{YYYY-MM-DD}: { "4_0": { by: "Priya", uid, at: Timestamp } }  (true if migrated)
let shared = null; // null until the first snapshot arrives
let days = {}; // the last HISTORY_DAYS of days/ docs, by date (see watchDays)
const HISTORY_DAYS = 7;

// Per-phone only (localStorage), per patient:
// notified: "4_0" -> last date this phone alerted; folder: open folder id, null for all ("Meds")
let local = { activeTab: "1", notified: {}, folder: null };

function loadLocal() {
  local = { activeTab: "1", notified: {}, folder: null };
  try {
    local = { ...local, ...JSON.parse(localStorage.getItem(`medicineTracker:${patientId}`)) };
  } catch {}
  local.activeTab = String(local.activeTab); // older versions stored a number
}

function saveLocal() {
  if (patientId) localStorage.setItem(`medicineTracker:${patientId}`, JSON.stringify(local));
}

function hasPatientDetails() {
  return !!shared?.patient?.name;
}

function courseOf(tabId) {
  if (shared?.courses?.[tabId]) return shared.courses[tabId];
  if (shared?.startDays != null) return { startDays: shared.startDays, startDate: shared.startDate };
  return null;
}

function daysLeft(tabId) {
  const c = courseOf(tabId);
  if (!c) return null;
  return Math.max(0, c.startDays - daysBetween(c.startDate, todayStr()));
}

// ---------- Tabs (built-in 1x/4x/6x for older patients + medicines added by nurses) ----------
const BUILTIN_TABS = [1, 4, 6].map((n) => ({
  id: String(n), name: `${n}x`, label: `${n}x medicine`, dosesPerDay: n, everyDays: 1,
}));

function allTabs() {
  const builtins = shared?.builtinTabs === false ? [] : BUILTIN_TABS
    .map((t) => {
      const extra = shared?.builtins?.[t.id] ?? {};
      return { ...t, ...extra, label: extra.name ?? t.label, renamed: !!extra.name };
    })
    .filter((t) => !t.removed);
  const custom = Object.entries(shared?.medicines ?? {})
    .map(([id, m]) => ({ id, custom: true, label: m.name, ...m }))
    .sort((a, b) => a.createdAt - b.createdAt);
  // Dragged order first; anything not in it yet (e.g. just added) keeps its place at the end.
  const order = shared?.order ?? [];
  const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
  return [...builtins, ...custom].filter((t) => !hiddenTabs.has(t.id)).sort((a, b) => rank(a.id) - rank(b.id));
}

// Removed on this phone but still in its Undo window (see removeWithUndo)
const hiddenTabs = new Set();
const hiddenFolders = new Set();

function findTab(id) {
  return allTabs().find((t) => t.id === id);
}

// ---------- Folders ----------
function allFolders() {
  return Object.entries(shared?.folders ?? {})
    .filter(([id]) => !hiddenFolders.has(id))
    .map(([id, f]) => ({ id, ...f, meds: f.meds ?? [] }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

// A medicine sits in one folder at most. Older data could list it in two; the first folder wins.
function folderOf(tabId) {
  return allFolders().find((f) => f.meds.includes(tabId))?.id ?? null;
}

function folderTabs(folder) {
  return allTabs().filter((t) => folderOf(t.id) === folder.id);
}

// The open folder, or null for all medicines. A folder that was deleted or emptied
// (maybe by another nurse) falls back to all medicines.
function currentFolder() {
  const folder = allFolders().find((f) => f.id === local.folder);
  return folder && folderTabs(folder).length ? folder : null;
}

function visibleTabs() {
  const folder = currentFolder();
  return folder ? folderTabs(folder) : allTabs();
}

// The tab on screen: the saved one, or the first tab when nothing valid is saved yet
// (a phone opening this patient for the first time, e.g. an attendant, still has the default "1").
function currentTab() {
  const tabs = visibleTabs();
  return tabs.find((t) => t.id === local.activeTab) ?? tabs[0];
}

function isDueOn(tab, dateStr) {
  if (tab.everyDays <= 1) return true;
  const elapsed = daysBetween(tab.startDate, dateStr);
  return elapsed >= 0 && elapsed % tab.everyDays === 0;
}

function isDueToday(tab) {
  return isDueOn(tab, todayStr());
}

function nextDueLabel(tab) {
  const elapsed = daysBetween(tab.startDate, todayStr());
  return shortDate(elapsed < 0 ? -elapsed : tab.everyDays - (elapsed % tab.everyDays));
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// How often, in words: the frequency number alone ("2") was hard for people to read
function everyText(everyDays) {
  if (everyDays === 1) return "every day";
  if (everyDays === 2) return "every other day";
  if (everyDays === 7) return "once a week";
  if (everyDays % 7 === 0) return `every ${everyDays / 7} weeks`;
  return `every ${everyDays} days`;
}

// Live wording next to the "How often" number on the add and schedule forms
function updateEveryUnit(input, unit) {
  const n = readNumber(input);
  unit.textContent = n ? everyText(n) : "";
}

function scheduleText(everyDays, dosesPerDay) {
  return `${plural(dosesPerDay, "dose")} ${everyText(everyDays)}`;
}

// Ticks for a day: the days/ doc, plus any not yet moved out of the old doses map
function dosesOn(dateStr) {
  return { ...shared?.doses?.[dateStr], ...days[dateStr] };
}

// The tick: { by, uid, at } (who gave it, when), true for older ticks, or undefined
function doseEntry(tabId, i, dateStr = todayStr()) {
  return dosesOn(dateStr)[`${tabId}_${i}`];
}

function isTaken(tabId, i, dateStr = todayStr()) {
  return !!doseEntry(tabId, i, dateStr);
}

// ---------- Due times (a dose's reminder time is when it's due) ----------
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function durationText(min) {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

// Today's state of one dose: taken, overdue (past its time), upcoming (has a later time) or open (no time)
function doseState(tab, i) {
  const key = `${tab.id}_${i}`;
  const entry = doseEntry(tab.id, i);
  if (entry) return { kind: "taken", key, entry };
  const time = shared.reminders?.[key];
  if (!time) return { kind: "open", key };
  const late = minutesNow() - toMinutes(time);
  return late > 0 ? { kind: "overdue", key, time, late } : { kind: "upcoming", key, time, wait: -late };
}

// Every dose due today across all medicines (not just the open folder)
function todaysDoses() {
  return allTabs().filter(isDueToday)
    .flatMap((tab) => Array.from({ length: tab.dosesPerDay }, (_, i) => ({ tab, i, ...doseState(tab, i) })));
}

function hasOverdue(tab) {
  return isDueToday(tab) && Array.from({ length: tab.dosesPerDay }, (_, i) => doseState(tab, i).kind === "overdue").some(Boolean);
}

function givenText(entry) {
  if (entry === true || !entry?.by) return "Taken";
  const at = entry.at?.toDate?.();
  return `Given by ${entry.by}${at ? ` · ${at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`;
}

function doseStatus(state) {
  if (state.kind === "taken") return { text: givenText(state.entry), cls: "" };
  if (state.kind === "overdue") return { text: `Overdue · ${durationText(state.late)}`, cls: "overdue" };
  if (state.kind === "upcoming") return { text: `Due at ${formatTime(state.time)}`, cls: "" };
  return { text: "Not taken yet", cls: "" };
}

// ---------- Writes ----------
function reportError(err) {
  console.error(err);
  showToast("Couldn't save — check your connection and try again.");
}

let justToggled = null; // animate only the dose that was just tapped

function myName() {
  return user.displayName || (user.isAnonymous ? "Attendant" : user.email?.split("@")[0]) || "Someone";
}

function dayRef(dateStr) {
  return doc(patientRef, "days", dateStr);
}

// Ticking records who gave the dose and when. Unticking offers Undo, since it wipes that record.
function toggleDose(tab, i) {
  const key = `${tab.id}_${i}`;
  const today = todayStr();
  const before = doseEntry(tab.id, i);
  justToggled = key;
  if (!before) {
    setDoc(dayRef(today), { [key]: { by: myName(), uid: user.uid, at: Timestamp.now() } }, { merge: true })
      .catch(reportError);
    return;
  }
  setDoc(dayRef(today), { [key]: deleteField() }, { merge: true }).catch(reportError);
  if (shared.doses?.[today]?.[key]) { // not migrated yet
    updateDoc(patientRef, new FieldPath("doses", today, key), deleteField()).catch(reportError);
  }
  showToast(`${ordinal(i + 1)} dose of ${tab.name} marked not given.`, {
    action: "Undo",
    onAction: () => setDoc(dayRef(today), { [key]: before }, { merge: true }).catch(reportError),
  });
}

function setReminder(key, time) {
  updateDoc(patientRef, new FieldPath("reminders", key), time ?? deleteField())
    .catch(reportError);
}

// Added while a folder is open, the medicine goes in that folder too.
function addMedicine({ name, everyDays, dosesPerDay, notes, totalDays }, folderId) {
  saveDraft(); // a new guest's first medicine is what saves their tracker
  const id = "m" + randomId(10);
  const medicine = { name, everyDays, dosesPerDay, notes, startDate: todayStr(), createdAt: Date.now() };
  const course = { startDays: totalDays, startDate: todayStr() };
  const data = { medicines: { [id]: medicine }, courses: { [id]: course } };
  if (folderId) {
    data.folders = { [folderId]: { meds: arrayUnion(id) } };
    shared.folders[folderId].meds = [...(shared.folders[folderId].meds ?? []), id]; // so the folder stays open
  }
  setDoc(patientRef, data, { merge: true }).catch(reportError);
  return id;
}

// Medicines ticked for this folder leave whatever folder they were in, so each is in one only.
function saveFolder(id, folder) {
  saveDraft();
  (shared.folders ??= {})[id] = folder; // apply locally first, like updateTabField
  const fields = [new FieldPath("folders", id), folder];
  for (const other of allFolders()) {
    const meds = other.meds.filter((m) => !folder.meds.includes(m));
    if (other.id === id || meds.length === other.meds.length) continue;
    shared.folders[other.id].meds = meds;
    fields.push(new FieldPath("folders", other.id, "meds"), meds);
  }
  updateDoc(patientRef, ...fields).catch(reportError);
}

// After a drag or arrow-key move on the Medicines screen: the row's group is now its folder
// (or none), and the tree from top to bottom is the new tab order.
function saveTree(row) {
  const id = row.dataset.id;
  const group = row.parentElement.dataset.group;
  const target = shared.folders?.[group] ? group : null;
  const fields = [];
  for (const f of allFolders()) {
    const want = f.id === target;
    if (f.meds.includes(id) === want) continue;
    const meds = want ? [...f.meds, id] : f.meds.filter((m) => m !== id);
    shared.folders[f.id].meds = meds;
    fields.push(new FieldPath("folders", f.id, "meds"), meds);
  }
  shared.order = [...els.folderList.querySelectorAll(".med-row")].map((r) => r.dataset.id);
  fields.push(new FieldPath("order"), shared.order);
  updateDoc(patientRef, ...fields).catch(reportError);
}

function deleteFolder(id) {
  delete shared.folders?.[id];
  updateDoc(patientRef, new FieldPath("folders", id), deleteField()).catch(reportError);
}

// Name and notes live under "medicines" for added medicines and "builtins" for 1x/4x/6x.
function updateTabField(tab, field, value) {
  const root = tab.custom ? "medicines" : "builtins";
  // Apply locally first so the change shows right away; the snapshot confirms it.
  ((shared[root] ??= {})[tab.id] ??= {})[field] = value;
  updateDoc(patientRef, new FieldPath(root, tab.id, field), value).catch(reportError);
}

// Field/value pairs that delete this tab's reminders from dose index `from` onwards.
function reminderDeletes(tabId, from = 0) {
  const fields = [];
  for (const key of Object.keys(shared.reminders ?? {})) {
    const [id, i] = key.split("_");
    if (id === tabId && Number(i) >= from) fields.push(new FieldPath("reminders", key), deleteField());
  }
  return fields;
}

function removeMedicine(tab) {
  const id = tab.id;
  updateDoc(
    patientRef,
    // Built-in tabs can't be deleted from the code's list, so they're flagged as removed instead.
    ...(tab.custom
      ? [new FieldPath("medicines", id), deleteField()]
      : [new FieldPath("builtins", id, "removed"), true]),
    new FieldPath("courses", id), deleteField(),
    ...reminderDeletes(id),
    // Take it out of the tab order and any folders too
    ...(shared.order?.includes(id) ? [new FieldPath("order"), arrayRemove(id)] : []),
    ...allFolders().filter((f) => f.meds.includes(id))
      .flatMap((f) => [new FieldPath("folders", f.id, "meds"), arrayRemove(id)]),
  ).catch(reportError);
}

// ---------- Rendering ----------
const els = {
  boot: document.getElementById("boot"),
  bootText: document.getElementById("boot-text"),
  welcome: document.getElementById("welcome"),
  loginBtn: document.getElementById("login-btn"),
  signupBtn: document.getElementById("signup-btn"),
  guestBtn: document.getElementById("guest-btn"),
  welcomeCard: document.getElementById("welcome-card"),
  nameForm: document.getElementById("name-form"),
  nameInput: document.getElementById("name-input"),
  nameBack: document.getElementById("name-back"),
  attendantBtn: document.getElementById("attendant-btn"),
  pidForm: document.getElementById("pid-form"),
  pidInput: document.getElementById("pid-input"),
  pidEnter: document.getElementById("pid-enter"),
  pidBack: document.getElementById("pid-back"),
  infoPid: document.getElementById("info-pid"),
  infoExpiryBox: document.getElementById("info-expiry-box"),
  infoExpiry: document.getElementById("info-expiry"),
  infoBtn: document.getElementById("info-btn"),
  infoScreen: document.getElementById("info-screen"),
  infoBack: document.getElementById("info-back"),
  infoAccount: document.getElementById("info-account"),
  signoutBtn: document.getElementById("signout-btn"),
  patientName: document.getElementById("patient-name"),
  daysLeftBtn: document.getElementById("days-left"),
  daysLeftNum: document.getElementById("days-left-number"),
  daysLeftLabel: document.getElementById("days-left-label"),
  shareBtn: document.getElementById("share-btn"),
  themeBtn: document.getElementById("theme-btn"),
  tabs: document.getElementById("tabs"),
  todayLabel: document.getElementById("today-label"),
  progressTitle: document.getElementById("progress-title"),
  progressSub: document.getElementById("progress-sub"),
  progressCount: document.getElementById("progress-count"),
  progressFill: document.getElementById("progress-fill"),
  allDone: document.getElementById("all-done"),
  notDue: document.getElementById("not-due"),
  notDueText: document.getElementById("not-due-text"),
  history: document.getElementById("history"),
  patientBtn: document.getElementById("patient-btn"),
  patients: document.getElementById("patients"),
  patientsClose: document.getElementById("patients-close"),
  patientList: document.getElementById("patient-list"),
  patientPidForm: document.getElementById("patient-pid-form"),
  patientPidInput: document.getElementById("patient-pid-input"),
  doseList: document.getElementById("dose-list"),
  removeBtn: document.getElementById("remove-btn"),
  empty: document.getElementById("empty"),
  emptyAdd: document.getElementById("empty-add"),
  tracker: document.getElementById("tracker"),
  tabActions: document.getElementById("tab-actions"),
  scheduleBtn: document.getElementById("schedule-btn"),
  notesBtn: document.getElementById("notes-btn"),
  renameBtn: document.getElementById("rename-btn"),
  schedule: document.getElementById("schedule"),
  scheduleTitle: document.getElementById("schedule-title"),
  scheduleView: document.getElementById("schedule-view"),
  scheduleEdit: document.getElementById("schedule-edit"),
  scheduleEditBtn: document.getElementById("schedule-edit-btn"),
  scheduleDiscard: document.getElementById("schedule-discard"),
  scheduleClose: document.getElementById("schedule-close"),
  statDays: document.getElementById("stat-days"),
  statDaysMeta: document.getElementById("stat-days-meta"),
  statEvery: document.getElementById("stat-every"),
  statEveryMeta: document.getElementById("stat-every-meta"),
  statDoses: document.getElementById("stat-doses"),
  statDosesMeta: document.getElementById("stat-doses-meta"),
  schedDays: document.getElementById("sched-days"),
  schedEvery: document.getElementById("sched-every"),
  schedEveryUnit: document.getElementById("sched-every-unit"),
  schedDoses: document.getElementById("sched-doses"),
  notes: document.getElementById("notes"),
  notesTitle: document.getElementById("notes-title"),
  notesView: document.getElementById("notes-view"),
  notesInput: document.getElementById("notes-input"),
  notesEdit: document.getElementById("notes-edit"),
  notesDiscard: document.getElementById("notes-discard"),
  notesClose: document.getElementById("notes-close"),
  rename: document.getElementById("rename"),
  renameForm: document.getElementById("rename-form"),
  renameInput: document.getElementById("rename-input"),
  renameCancel: document.getElementById("rename-cancel"),
  addBtn: document.getElementById("add-btn"),
  addScreen: document.getElementById("add-screen"),
  addForm: document.getElementById("add-form"),
  addBack: document.getElementById("add-back"),
  addName: document.getElementById("add-name"),
  addSuggest: document.getElementById("add-suggest"),
  addEvery: document.getElementById("add-every"),
  addEveryUnit: document.getElementById("add-every-unit"),
  addDoses: document.getElementById("add-doses"),
  addDuration: document.getElementById("add-duration"),
  addUnit: document.getElementById("add-unit"),
  addNotes: document.getElementById("add-notes"),
  addSummary: document.getElementById("add-summary"),
  toast: document.getElementById("toast"),
  toastText: document.getElementById("toast-text"),
  toastAction: document.getElementById("toast-action"),
  confirm: document.getElementById("confirm"),
  confirmTitle: document.getElementById("confirm-title"),
  confirmText: document.getElementById("confirm-text"),
  confirmOk: document.getElementById("confirm-ok"),
  confirmCancel: document.getElementById("confirm-cancel"),
  nextDose: document.getElementById("next-dose"),
  nextDoseLabel: document.getElementById("next-dose-label"),
  nextDoseText: document.getElementById("next-dose-text"),
  menuBtn: document.getElementById("menu-btn"),
  folderBar: document.getElementById("folder-bar"),
  folderName: document.getElementById("folder-name"),
  folderCount: document.getElementById("folder-count"),
  homeBtn: document.getElementById("home-btn"),
  medsScreen: document.getElementById("meds-screen"),
  medsBack: document.getElementById("meds-back"),
  folderNew: document.getElementById("folder-new"),
  folderList: document.getElementById("folder-list"),
  medHint: document.getElementById("med-hint"),
  medEmpty: document.getElementById("med-empty"),
  folderDialog: document.getElementById("folder-dialog"),
  folderForm: document.getElementById("folder-form"),
  folderDialogTitle: document.getElementById("folder-dialog-title"),
  folderNameInput: document.getElementById("folder-name-input"),
  folderPickList: document.getElementById("folder-pick-list"),
  folderCancel: document.getElementById("folder-cancel"),
};

function formatTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderTabs(tabs, activeId) {
  const scroll = els.tabs.scrollLeft;
  els.tabs.innerHTML = "";
  for (const tab of tabs) {
    const btn = document.createElement("button");
    btn.className = "tab" + (tab.id === activeId ? " active" : "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", tab.id === activeId);

    const name = document.createElement("span");
    name.className = "tab-name";
    name.textContent = tab.name;

    const count = document.createElement("span");
    count.className = "tab-count";
    if (shared) {
      if (isDueToday(tab)) {
        let done = 0;
        for (let i = 0; i < tab.dosesPerDay; i++) if (isTaken(tab.id, i)) done++;
        count.textContent = `${done}/${tab.dosesPerDay}`;
        count.classList.toggle("complete", done === tab.dosesPerDay);
      } else {
        count.textContent = "off";
        count.title = "Not due today";
      }
    }

    btn.append(name, count);
    if (shared && hasOverdue(tab)) {
      const dot = document.createElement("span");
      dot.className = "tab-dot";
      dot.title = "A dose is overdue";
      btn.append(dot);
      btn.setAttribute("aria-label", `${tab.name}, ${count.textContent}, overdue`);
    }
    btn.addEventListener("click", () => selectTab(tab.id));
    els.tabs.append(btn);
  }
  els.tabs.scrollLeft = scroll;
  // Bring a newly active tab into view (an added medicine only appears once the snapshot lands).
  if (activeId !== renderTabs.lastActive) {
    renderTabs.lastActive = activeId;
    els.tabs.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }
}

// ---------- History (last 7 days of the open medicine) ----------
function dayLabel(dateStr, opts) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], opts);
}

// Each dose that day: given, missed (a past day), pending (today), or the whole day off / before it was added
function historyDay(tab, dateStr) {
  const added = tab.createdAt ? todayStr(new Date(tab.createdAt)) : null;
  if (added && dateStr < added) return { kind: "before" };
  if (!isDueOn(tab, dateStr)) return { kind: "off" };
  const doses = Array.from({ length: tab.dosesPerDay }, (_, i) => {
    const entry = doseEntry(tab.id, i, dateStr);
    return { i, entry, kind: entry ? "given" : dateStr < todayStr() ? "missed" : "pending" };
  });
  return { kind: "due", doses };
}

function renderHistory(tab) {
  const today = todayStr();
  els.history.replaceChildren(...Array.from({ length: HISTORY_DAYS }, (_, n) => {
    const date = addDays(today, n - HISTORY_DAYS + 1);
    const day = historyDay(tab, date);
    const long = dayLabel(date, { weekday: "short", day: "numeric", month: "short" });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-day" + (date === today ? " today" : "");
    const dots = document.createElement("span");
    dots.className = "hdots";
    if (day.kind === "due") {
      for (const d of day.doses) {
        const dot = document.createElement("span");
        dot.className = `hdot ${d.kind}`;
        dots.append(dot);
      }
    } else {
      dots.innerHTML = `<span class="hdot off"></span>`;
    }
    const given = day.kind === "due" ? day.doses.filter((d) => d.entry).length : 0;
    const summary = day.kind === "before" ? "No History" : day.kind === "off" ? "not due"
      : `${given} of ${day.doses.length} given`;
    btn.setAttribute("aria-label", `${long}: ${summary}`);
    btn.innerHTML = `<span class="hday">${dayLabel(date, { weekday: "narrow" })}</span>`;
    btn.append(dots);
    btn.insertAdjacentHTML("beforeend", `<span class="hdate">${dayLabel(date, { day: "numeric" })}</span>`);
    btn.addEventListener("click", () => {
      const detail = day.kind !== "due" ? summary : day.doses.map((d) => `${ordinal(d.i + 1)}: ${
        d.entry ? givenText(d.entry).replace(/^Given by /, "") : d.kind === "missed" ? "missed" : "not yet"}`).join(" · ");
      showToast(`${long} — ${detail}`);
    });
    return btn;
  }));
}

// Checkmark drawn in when a dose is ticked (see .dose-toggle.bump in style.css)
const CHECK_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="check-path" d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

// The bar above the tabs: the most overdue dose, else the next one with a time. Across all medicines.
function renderNextDose() {
  const doses = shared && hasPatientDetails() ? todaysDoses() : [];
  const overdue = doses.filter((d) => d.kind === "overdue").sort((a, b) => b.late - a.late);
  const next = doses.filter((d) => d.kind === "upcoming").sort((a, b) => a.wait - b.wait)[0];
  const pick = overdue[0] ?? next;
  els.nextDose.classList.toggle("hidden", !pick);
  if (!pick) return;
  els.nextDose.classList.toggle("late", !!overdue.length);
  const what = `${pick.tab.name} · ${ordinal(pick.i + 1)} dose`;
  els.nextDoseLabel.textContent = overdue.length ? "Overdue" : "Next";
  els.nextDoseText.textContent = overdue.length
    ? `${what} · ${durationText(pick.late)} late${overdue.length > 1 ? ` · +${overdue.length - 1} more` : ""}`
    : `${what} at ${formatTime(pick.time)} · in ${durationText(pick.wait)}`;
  els.nextDose.onclick = () => {
    if (!currentFolder()?.meds.includes(pick.tab.id)) local.folder = null;
    selectTab(pick.tab.id);
  };
}

// Times move on without any data changing: every 20 s, update what depends on the clock
// (statuses, overdue dots, the next-dose bar) without rebuilding the dose cards,
// which would close a reminder time picker someone has open.
function refreshTimes() {
  if (!hasPatientDetails() || document.body.classList.contains("locked")) return;
  renderNextDose();
  const tab = currentTab();
  if (!tab) return;
  renderTabs(visibleTabs(), tab.id);
  els.doseList.querySelectorAll(".dose-status").forEach((el) => {
    const i = Number(el.dataset.key.split("_")[1]);
    const status = doseStatus(doseState(tab, i));
    el.textContent = status.text;
    el.closest(".dose-toggle").classList.toggle("overdue", status.cls === "overdue");
  });
}

// ---------- Motion ----------
// Animations only move or fade things (cheap on any phone) and are skipped for anyone who
// turned on "reduce motion"; the CSS side is switched off by the rule at the end of style.css.
function calm() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Runs a DOM change as a View Transition where the browser has them, so the selected tab
// glides to its new place (style.css captures only that tab), or just runs it.
function transition(change) {
  if (!document.startViewTransition || calm()) return change();
  document.startViewTransition(change);
}

// Animates elements from where they were to where a change puts them (FLIP), so rows glide
// instead of jumping. `change` moves them in the DOM.
function glide(elements, change) {
  if (calm()) return change();
  const before = new Map(elements.map((el) => [el, el.getBoundingClientRect().top]));
  change();
  for (const [el, top] of before) {
    const dy = top - el.getBoundingClientRect().top;
    if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 160, easing: "ease-out" });
  }
}

function selectTab(id) {
  const same = currentTab()?.id === id;
  local.activeTab = id;
  saveLocal();
  if (same) return render();
  transition(render);
}

let renderedDate = todayStr();

// Spinner while sign-in state or the patient loads, login screen when signed out,
// name form for a guest who hasn't given a name yet, PID form for an attendant.
function renderGate() {
  const askName = needsName();
  const ready = !!user && !askName && !attendant && hasPatientDetails();
  const welcome = user === null || askName || attendant;
  document.body.classList.toggle("locked", !ready);
  els.boot.classList.toggle("hidden", ready || welcome);
  els.welcome.classList.toggle("hidden", !welcome);
  els.welcomeCard.classList.toggle("hidden", askName || attendant);
  els.nameForm.classList.toggle("hidden", !askName);
  els.pidForm.classList.toggle("hidden", !attendant);
  return ready;
}

function render() {
  renderedDate = todayStr();
  if (!renderGate()) return;

  const tabs = visibleTabs();
  const folder = currentFolder();
  // Don't overwrite the saved tab: a just-added medicine may not be in the snapshot yet.
  const tab = currentTab();

  els.patientName.textContent = shared.patient.name;
  const id = shared.patient.pid ? `PID ${shared.patient.pid}` : shared.patient.code ? `ID ${shared.patient.code}` : "";
  els.todayLabel.textContent = (id ? `${id} · ` : "")
    + new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  if (notesTabId) renderNotes(); // another nurse may have changed or removed it
  if (scheduleTabId) renderSchedule();
  renderMeds();
  renderNextDose();

  const empty = !tab;
  els.empty.classList.toggle("hidden", !empty);
  els.tracker.classList.toggle("hidden", empty);
  els.tabs.classList.toggle("hidden", empty);
  els.daysLeftBtn.classList.toggle("hidden", empty);
  els.folderBar.classList.toggle("hidden", !folder);
  if (folder) {
    els.folderName.textContent = folder.name;
    els.folderCount.textContent = plural(tabs.length, "med");
  }
  if (empty) return;

  renderTabs(tabs, tab.id);

  const left = daysLeft(tab.id);
  els.daysLeftNum.textContent = left ?? "–";
  els.daysLeftLabel.textContent = left == null ? "set days" : left === 1 ? "day left" : "days left";
  els.daysLeftBtn.classList.toggle("low", left != null && left <= 3);

  els.progressTitle.textContent = tab.custom || tab.renamed ? tab.name : "Today's doses";
  els.progressSub.textContent = scheduleText(tab.everyDays, tab.dosesPerDay);
  els.progressSub.classList.remove("hidden");
  els.tabActions.classList.remove("hidden");
  els.notesBtn.classList.toggle("has-notes", !!tab.notes?.trim());

  const due = isDueToday(tab);
  const n = due ? tab.dosesPerDay : 0;
  const doses = Array.from({ length: n }, (_, i) => isTaken(tab.id, i));
  const doneCount = doses.filter(Boolean).length;
  els.progressCount.textContent = due ? `${doneCount} of ${n} taken` : "Not due today";
  els.progressFill.style.transform = `scaleX(${due ? doneCount / n : 0})`;
  renderHistory(tab);
  els.allDone.classList.toggle("hidden", !due || doneCount !== n);
  els.allDone.classList.toggle("celebrate", due && doneCount === n && justToggled?.startsWith(`${tab.id}_`));
  els.notDue.classList.toggle("hidden", due);
  if (!due) els.notDueText.textContent = `No doses today — next dose ${nextDueLabel(tab)}`;

  els.doseList.innerHTML = "";
  doses.forEach((taken, i) => {
    const key = `${tab.id}_${i}`;
    const reminder = shared.reminders?.[key];
    const status = doseStatus(doseState(tab, i));

    const li = document.createElement("li");
    li.className = "dose";

    const toggle = document.createElement("button");
    toggle.className = "dose-toggle" + (taken ? " taken" : "") + (status.cls ? ` ${status.cls}` : "")
      + (justToggled === key ? " bump" : "");
    toggle.setAttribute("aria-pressed", taken);
    toggle.innerHTML = `
      <span class="dose-num">${taken ? CHECK_ICON : i + 1}</span>
      <span class="dose-text">
        <span class="dose-title">${ordinal(i + 1)} dose</span>
        <span class="dose-status" data-key="${key}"></span>
      </span>`;
    toggle.querySelector(".dose-status").textContent = status.text; // has a nurse's name in it
    toggle.addEventListener("click", () => toggleDose(tab, i));

    const rem = document.createElement("div");
    rem.className = "reminder";

    const remBtn = document.createElement("button");
    remBtn.className = "reminder-btn" + (reminder ? " set" : "");
    remBtn.textContent = reminder ? `🔔 ${formatTime(reminder)}` : "🔔 Remind me";

    const timeInput = document.createElement("input");
    timeInput.type = "time";
    timeInput.className = "hidden";
    timeInput.value = reminder || "";

    remBtn.addEventListener("click", () => {
      remBtn.classList.add("hidden");
      timeInput.classList.remove("hidden");
      timeInput.focus();
      timeInput.showPicker?.();
    });
    timeInput.addEventListener("change", () => {
      if (!timeInput.value) return;
      // If the chosen time already passed today, start reminding from tomorrow.
      const [h, m] = timeInput.value.split(":").map(Number);
      const now = new Date();
      if (h * 60 + m <= now.getHours() * 60 + now.getMinutes()) {
        local.notified[key] = todayStr();
      } else {
        delete local.notified[key];
      }
      saveLocal();
      setReminder(key, timeInput.value);
      requestNotificationPermission();
    });
    timeInput.addEventListener("blur", () => setTimeout(render, 150));

    rem.append(remBtn, timeInput);

    if (reminder) {
      const clear = document.createElement("button");
      clear.className = "clear-btn";
      clear.title = "Remove reminder";
      clear.textContent = "✕";
      clear.addEventListener("click", () => setReminder(key, null));
      rem.append(clear);
    }

    li.append(toggle, rem);
    els.doseList.append(li);
  });
  justToggled = null;
}

// ---------- Dark mode ----------
const THEME_KEY = "medicineTracker:theme";

els.themeBtn.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme
    ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  // Phone browser bar follows the page background (--bg in style.css)
  document.querySelector('meta[name="theme-color"]').content = next === "dark" ? "#0d1020" : "#f3f5fb";
  try { localStorage.setItem(THEME_KEY, next); } catch {}
});

// ---------- Sign-in (Google) ----------
// Log in and Sign up are the same Google flow; a new account just gets a new tracker.
async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;
    if (err.code === "auth/popup-blocked") return signInWithRedirect(auth, provider).catch(signInFailed);
    signInFailed(err);
  }
}

function signInFailed(err) {
  console.error(err);
  // Include the code (e.g. auth/unauthorized-domain) so setup problems are visible on a phone.
  showToast(`Couldn't sign in with Google (${err.code || err.message}).`);
}

els.loginBtn.addEventListener("click", signIn);
els.signupBtn.addEventListener("click", signIn);

// ---------- Guest (anonymous) sign-in ----------
// Guests get their own tracker like anyone else, but must give a name before it opens.
els.guestBtn.addEventListener("click", () => signInAnonymously(auth).catch(signInFailed));

// Only a guest starting their own tracker needs a name; attendants and share links open an existing one.
function needsName() {
  return !!user?.isAnonymous && !user.displayName?.trim() && !attendant
    && !new URLSearchParams(location.search).get("patient");
}

els.nameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = els.nameInput.value.trim();
  if (!name) return;
  try {
    await updateProfile(user, { displayName: name });
    startPatient(user);
  } catch (err) {
    reportError(err);
  }
});

// A guest who backs out is signed out for good; that account can't be signed back into.
els.nameBack.addEventListener("click", () => signOut(auth).catch(reportError));

// ---------- Attendant (open a tracker by PID) ----------
// Attendants sign in as a guest behind the scenes (the rules need someone signed in),
// then the PID is looked up in pids/{pid} and that patient's tracker opens.
let attendant = false; // PID form is showing
let pendingPid = null; // looked up once the guest sign-in finishes

els.attendantBtn.addEventListener("click", () => {
  attendant = true;
  els.pidInput.value = "";
  render();
  els.pidInput.focus();
});

els.pidBack.addEventListener("click", () => {
  attendant = false;
  pendingPid = null;
  // A guest made only for this lookup has no tracker of its own, so drop it.
  if (user?.isAnonymous && !patientId) signOut(auth).catch(reportError);
  render();
});

// Format as they type: "abcd" -> "ABC-D". The dash appears with the 4th character, so backspace never fights it.
function formatPidInput(e) {
  const input = e.target;
  const charsBeforeCaret = input.value.slice(0, input.selectionStart).replace(/[\s-]/g, "").length;
  const raw = input.value.replace(/[\s-]/g, "").toUpperCase().slice(0, 6);
  input.value = raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw;
  // Keep the caret where it was, stepping over the dash
  const caret = Math.min(charsBeforeCaret, 6) + (charsBeforeCaret > 3 ? 1 : 0);
  input.setSelectionRange(caret, caret);
}
els.pidInput.addEventListener("input", formatPidInput);

els.pidForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const pid = normalizePid(els.pidInput.value);
  if (!pid) return showToast("A PID has 6 characters, like ABC-D#3.");
  els.pidInput.value = pid;
  els.pidEnter.disabled = true;
  pendingPid = pid;
  if (user) openByPid(user);
  else signInAnonymously(auth).catch((err) => {
    els.pidEnter.disabled = false;
    signInFailed(err);
  }); // onAuthStateChanged then calls openByPid
});

// PID -> patient id, or null. The PID can outlive its tracker for a few hours (each is deleted
// on its own after 30 days); opening it then would make a new empty tracker, so check it's there.
async function findByPid(pid) {
  const id = (await getDoc(doc(db, "pids", pid))).data()?.patientId;
  return id && await trackerExists(id) ? id : null;
}

async function openByPid(u) {
  const pid = pendingPid;
  try {
    const id = await findByPid(pid);
    if (user !== u || pendingPid !== pid) return; // signed out or backed out meanwhile
    if (!id) return showToast(`No patient found with PID ${pid}.`);
    pendingPid = null;
    attendant = false;
    openPatient(id);
  } catch (err) {
    console.error(err);
    showToast("Couldn't look up that PID — check your connection and try again.");
  } finally {
    els.pidEnter.disabled = false;
  }
}

function googleName(u) {
  return u.displayName || u.email?.split("@")[0] || "Patient";
}

// Which patient to open: the share link's, else this account's own, else a new one.
async function resolvePatient(u) {
  let fromLink = new URLSearchParams(location.search).get("patient");
  if (fromLink?.length < 16) fromLink = null;
  // A link to a tracker that's gone opens this account's own tracker instead of reviving it empty
  if (fromLink && !(await trackerExists(fromLink))) {
    showToast("That tracker no longer exists. Guest trackers are deleted after 30 days.");
    fromLink = null;
  }
  const userRef = doc(db, "users", u.uid);
  userData = (await getDoc(userRef)).data() ?? {};
  const home = userData.patientId ?? null;
  // A guest without a saved tracker gets a draft: nothing is written until they add something
  // (saveDraft), so someone just looking around leaves nothing in the database.
  if (!fromLink && u.isAnonymous && !(home && await trackerExists(home))) return { id: randomId(), draft: true };
  const id = fromLink ?? home ?? randomId();
  if (!home) {
    const data = { patientId: id };
    if (u.isAnonymous) data.expireAt = guestExpiry();
    setDoc(userRef, data, { merge: true }).catch(reportError);
  }
  return { id, draft: false };
}

let unsubscribe = null; // stops the current patient's snapshot listener
let unwatchDays = null; // stops the days/ listener
let claimed = false;
let migrated = false;
let pidRequested = false;
let newGuestExpiry = null; // set when a guest makes a tracker, so its PID gets the same expiry

// ---------- Guest clean-up ----------
// Guests can't sign back in once signed out, so what they make is deleted after 30 days.
// The app only stamps expireAt (a Firestore Timestamp) on the guest's patient, users and pids
// docs; a daily GitHub Action (cleanup/cleanup.js) deletes the ones whose date has passed.
const GUEST_DAYS = 30;

function guestExpiry() {
  return Timestamp.fromMillis(Date.now() + GUEST_DAYS * 86400000);
}

// Asks the server when online. Changes this phone made but hasn't synced yet count too,
// so a tracker just made offline isn't mistaken for a deleted one.
async function trackerExists(id) {
  return (await getDoc(doc(db, "patients", id))).exists();
}

// ---------- Guest draft (a new guest's tracker, only on this phone until the first change) ----------
let draft = false;

function openDraft(id) {
  stopWatching();
  patientId = id;
  patientRef = doc(db, "patients", id);
  draft = true;
  loadLocal();
  // No ?patient= yet: the tracker doesn't exist, so the link would lead nowhere
  history.replaceState(null, "", location.pathname);
  shared = { patient: { name: googleName(user) }, builtinTabs: false };
  render();
}

// The guest's first real change: save the tracker (expiring in 30 days, like the account's
// pointer to it), then follow it live. The snapshot then gives it a PID with the same expiry.
function saveDraft() {
  if (!draft) return;
  draft = false;
  const expireAt = guestExpiry();
  setDoc(doc(db, "users", user.uid), { patientId, expireAt }, { merge: true }).catch(reportError);
  setDoc(patientRef, { patient: { name: shared.patient.name }, ownerUid: user.uid, builtinTabs: false, expireAt },
    { merge: true }).catch(reportError);
  openPatient(patientId);
}

function stopWatching() {
  unsubscribe?.();
  unwatchDays?.();
  unsubscribe = unwatchDays = null;
  days = {};
}

function openPatient(id) {
  stopWatching();
  patientId = id;
  patientRef = doc(db, "patients", id);
  draft = false;
  claimed = false;
  pidRequested = false;
  migrated = false;
  remembered = false;
  newGuestExpiry = null;
  loadLocal();
  const params = new URLSearchParams(location.search);
  params.set("patient", id);
  history.replaceState(null, "", `${location.pathname}?${params}`);

  unsubscribe = onSnapshot(
    patientRef,
    (snap) => {
      shared = snap.data() ?? {};
      if (!shared.ownerUid) claimPatient();
      if (!shared.patient?.pid) assignPid(); // new trackers, and older ones made before PIDs
      if (shared.doses) migrateDoses();
      rememberPatient();
      render();
      checkReminders();
    },
    showConnectionError
  );
  watchDays();
}

// Only the last week of days/ is loaded: today's ticks plus the history strip.
// Called again at midnight so the window moves with the date.
function watchDays() {
  unwatchDays?.();
  days = {};
  const from = addDays(todayStr(), -(HISTORY_DAYS - 1));
  unwatchDays = onSnapshot(
    query(collection(patientRef, "days"), where(documentId(), ">=", from)),
    (snap) => {
      days = {};
      snap.forEach((d) => { days[d.id] = d.data(); });
      render();
    },
    showConnectionError
  );
}

// Older trackers kept every day's ticks in one map on the patient doc, which grows until it hits
// Firestore's 1 MB limit. Move the last week (all the app shows) into days/ and drop the map.
// Phones still on an old version may write it again; then it simply moves again next open.
function migrateDoses() {
  if (migrated) return; // once per open
  migrated = true;
  const from = addDays(todayStr(), -(HISTORY_DAYS - 1));
  const batch = writeBatch(db);
  for (const [date, ticks] of Object.entries(shared.doses)) {
    if (date >= from && Object.keys(ticks).length) batch.set(dayRef(date), ticks, { merge: true });
  }
  batch.update(patientRef, { doses: deleteField() });
  batch.commit().catch(reportError);
}

// The first Google account to open a tracker takes it over, and its name replaces any name typed before.
function claimPatient() {
  if (claimed) return; // once per open, so a failed write doesn't retry on every snapshot
  claimed = true;
  const data = { patient: { name: googleName(user) }, ownerUid: user.uid };
  // An empty record is a brand-new patient: start without the old 1x/4x/6x tabs.
  if (Object.keys(shared).length === 0) {
    data.builtinTabs = false;
    // Only a tracker a guest makes from scratch expires; an older one a guest happens to open never does.
    if (user.isAnonymous) data.expireAt = newGuestExpiry = guestExpiry();
  }
  setDoc(patientRef, data, { merge: true }).catch(reportError);
}

// Reserve a PID in pids/{pid}, then save it on the patient. The rules only allow creating a
// pids doc, never overwriting one, so a PID that's already taken fails and we draw another.
async function assignPid() {
  if (pidRequested) return; // once per open, like claimPatient
  pidRequested = true;
  const id = patientId;
  // A guest's tracker: the PID goes when the tracker does (claimPatient runs just before this)
  const expireAt = shared.expireAt ?? newGuestExpiry;
  for (let tries = 0; tries < 5; tries++) {
    const pid = randomPid();
    try {
      try {
        await setDoc(doc(db, "pids", pid), expireAt ? { patientId: id, expireAt } : { patientId: id });
      } catch (err) {
        // Rules published before expireAt existed refuse it; save the PID without it then
        // (the tracker still expires, this PID just stays reserved).
        if (!expireAt || err.code !== "permission-denied") throw err;
        await setDoc(doc(db, "pids", pid), { patientId: id });
      }
    } catch (err) {
      if (err.code === "permission-denied") continue; // PID already taken: draw another
      return reportError(err);
    }
    return setDoc(doc(db, "patients", id), { patient: { pid } }, { merge: true }).catch(reportError);
  }
  showToast("Couldn't create a PID. Check that the Firestore rules are published.");
}

function showConnectionError(err) {
  console.error(err);
  els.bootText.textContent = "Not connected";
  els.todayLabel.textContent = "Not connected";
  showToast("Couldn't connect to the database. Check that Firestore is created and the rules are published.");
}

onAuthStateChanged(auth, async (u) => {
  user = u;
  userData = {};
  stopWatching();
  shared = null;
  draft = false;
  els.bootText.textContent = "Loading…";
  render();
  if (!u) return;
  if (pendingPid) openByPid(u);
  else if (!attendant && !needsName()) startPatient(u);
});

async function startPatient(u) {
  render(); // a guest who just gave a name moves from the name form to the spinner
  try {
    const { id, draft: isDraft } = await resolvePatient(u);
    if (user !== u) return;
    if (isDraft) openDraft(id);
    else openPatient(id);
  } catch (err) {
    showConnectionError(err);
  }
}

// ---------- Steppers (− / + around a number input) ----------
function readNumber(input) {
  const v = parseInt(input.value, 10);
  return Number.isNaN(v) ? null : Math.min(Number(input.max), Math.max(Number(input.min), v));
}

document.querySelectorAll(".stepper").forEach((stepper) => {
  const input = stepper.querySelector("input");
  stepper.querySelectorAll("button[data-step]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const current = readNumber(input) ?? Number(input.min);
      input.value = current + Number(btn.dataset.step);
      input.value = readNumber(input);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })
  );
});

// ---------- Full screens (add medicine, info) ----------
// Each screen gets its own history entry, so the phone's back button closes it.
if (history.state?.screen) history.replaceState(null, "");

function openScreen(el) {
  el.classList.remove("hidden", "closing");
  history.pushState({ screen: true }, "");
}

function closeScreen(el) {
  if (history.state?.screen) history.back(); // popstate hides the screen
  else el.classList.add("hidden");
}

window.addEventListener("popstate", () => {
  for (const el of [els.addScreen, els.infoScreen, els.medsScreen]) {
    if (el.classList.contains("hidden")) continue;
    el.classList.add("closing"); // slides out (style.css), then hides
    setTimeout(() => el.classList.add("hidden"), calm() ? 0 : 180);
  }
});

// ---------- Info ----------
els.infoBtn.addEventListener("click", () => {
  els.infoAccount.textContent = user
    ? (user.isAnonymous && !user.displayName ? "Attendant"
      : [user.displayName, user.isAnonymous ? "Guest" : user.email].filter(Boolean).join(" · "))
    : "";
  els.infoPid.textContent = shared?.patient?.pid ?? (draft ? "Given when you add the first medicine" : "Not assigned yet");
  const expires = shared?.expireAt?.toDate?.();
  els.infoExpiryBox.classList.toggle("hidden", !expires);
  if (expires) {
    els.infoExpiry.textContent = `Made as a guest, so this tracker and everything in it is deleted on ${
      expires.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })}.`;
  }
  openScreen(els.infoScreen);
});
els.infoBack.addEventListener("click", () => closeScreen(els.infoScreen));

els.signoutBtn.addEventListener("click", () => {
  els.infoScreen.classList.add("hidden");
  // Drop the patient from the URL so the next account on this phone opens its own tracker.
  history.replaceState(null, "", location.pathname);
  signOut(auth).catch(reportError);
});

// ---------- Medicine name suggestions ----------
// The list is big, so it loads the first time the add screen opens.
// It only suggests: whatever the nurse types is saved as is.
let medicines = []; // [{ name, generic }] from medicines.js
let medicinesLoading = null;
let suggestions = []; // what the dropdown shows right now
let activeSuggestion = -1; // highlighted with the arrow keys
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }); // "Thyronorm 25" before "100"

function loadMedicines() {
  medicinesLoading ??= import("./medicines.js?v=dev")
    .then((m) => {
      medicines = m.MEDICINES.map((med) => ({ ...med, nameKey: med.name.toLowerCase(), genericKey: med.generic.toLowerCase() }));
      if (document.activeElement === els.addName) updateSuggestions(); // they started typing before it arrived
    })
    .catch((err) => {
      console.error(err);
      medicinesLoading = null; // try again next time
    });
}

// Best matches first: name starts with it, then a word in the name, then what's in it, then anywhere.
function matchMedicines(text) {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const startsWord = (s) => s.startsWith(q) || s.includes(` ${q}`) || s.includes(`-${q}`);
  const rank = (m) => {
    if (m.nameKey.startsWith(q)) return 0;
    if (startsWord(m.nameKey)) return 1;
    if (startsWord(m.genericKey)) return 2;
    if (m.nameKey.includes(q) || m.genericKey.includes(q)) return 3;
    return -1;
  };
  return medicines
    .map((m) => [rank(m), m])
    .filter(([r]) => r >= 0)
    .sort((a, b) => a[0] - b[0] || byName.compare(a[1].name, b[1].name))
    .map(([, m]) => m);
}

function updateSuggestions() {
  suggestions = matchMedicines(els.addName.value);
  // Nothing to offer once they've typed a name exactly
  if (suggestions.length === 1 && suggestions[0].nameKey === els.addName.value.trim().toLowerCase()) suggestions = [];
  activeSuggestion = -1;
  els.addSuggest.replaceChildren(
    ...suggestions.map((m, i) => {
      const li = document.createElement("li");
      li.id = `add-suggest-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      const name = document.createElement("span");
      name.className = "suggest-name";
      name.textContent = m.name;
      li.append(name);
      if (m.generic) {
        const generic = document.createElement("span");
        generic.className = "suggest-generic";
        generic.textContent = m.generic;
        li.append(generic);
      }
      return li;
    })
  );
  els.addSuggest.scrollTop = 0;
  showSuggestions(suggestions.length > 0);
}

function showSuggestions(show) {
  els.addSuggest.classList.toggle("hidden", !show);
  els.addName.setAttribute("aria-expanded", show);
  els.addName.removeAttribute("aria-activedescendant");
  if (show) fitSuggestions();
}

// Up to 10 rows, fewer if the phone keyboard would cover them.
function fitSuggestions() {
  const viewport = window.visualViewport;
  const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  const room = bottom - els.addName.getBoundingClientRect().bottom - 14;
  els.addSuggest.style.maxHeight = room < 440 ? `${Math.max(132, room)}px` : "";
}

function highlightSuggestion(i) {
  els.addSuggest.children[activeSuggestion]?.setAttribute("aria-selected", "false");
  activeSuggestion = i;
  const li = els.addSuggest.children[i];
  li.setAttribute("aria-selected", "true");
  li.scrollIntoView({ block: "nearest" });
  els.addName.setAttribute("aria-activedescendant", li.id);
}

function pickSuggestion(i) {
  els.addName.value = suggestions[i].name;
  showSuggestions(false);
  updateAddSummary();
}

els.addName.addEventListener("input", updateSuggestions);
els.addName.addEventListener("blur", () => showSuggestions(false));
window.visualViewport?.addEventListener("resize", () => {
  if (!els.addSuggest.classList.contains("hidden")) fitSuggestions();
});

els.addName.addEventListener("keydown", (e) => {
  const open = !els.addSuggest.classList.contains("hidden");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!open) return updateSuggestions();
    e.preventDefault();
    const step = e.key === "ArrowDown" ? 1 : -1;
    highlightSuggestion((activeSuggestion + step + suggestions.length) % suggestions.length);
  } else if (e.key === "Enter" && open && activeSuggestion >= 0) {
    e.preventDefault(); // pick it instead of submitting the form
    pickSuggestion(activeSuggestion);
  } else if (e.key === "Escape" && open) {
    e.stopPropagation();
    showSuggestions(false);
  }
});

// pointerdown would move focus off the input (and close the list) before the click lands.
els.addSuggest.addEventListener("pointerdown", (e) => e.preventDefault());
els.addSuggest.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (li) pickSuggestion([...els.addSuggest.children].indexOf(li));
});

// ---------- Add / remove medicine ----------

let addUnit = "days";

function setAddUnit(unit) {
  addUnit = unit;
  els.addUnit.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.unit === unit));
  els.addDuration.max = unit === "weeks" ? 52 : 365;
  if (els.addDuration.value) els.addDuration.value = readNumber(els.addDuration);
  updateAddSummary();
}

els.addUnit.querySelectorAll("button").forEach((b) =>
  b.addEventListener("click", () => setAddUnit(b.dataset.unit))
);

function updateAddSummary() {
  updateEveryUnit(els.addEvery, els.addEveryUnit);
  const name = els.addName.value.trim() || "This medicine";
  const every = readNumber(els.addEvery) ?? 1;
  const doses = readNumber(els.addDoses) ?? 1;
  const duration = readNumber(els.addDuration) ?? 1;
  const length = plural(duration, addUnit === "weeks" ? "week" : "day");
  els.addSummary.textContent = `${name}: ${scheduleText(every, doses)} for ${length}, starting today.`;
}

function openAddScreen() {
  els.addForm.reset();
  setAddUnit("days");
  showSuggestions(false);
  loadMedicines();
  openScreen(els.addScreen);
  els.addName.focus();
}

function closeAddScreen() {
  closeScreen(els.addScreen);
}

els.addBtn.addEventListener("click", openAddScreen);
els.emptyAdd.addEventListener("click", openAddScreen);
els.addBack.addEventListener("click", closeAddScreen);
els.addForm.addEventListener("input", updateAddSummary);

els.addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = els.addName.value.trim();
  const everyDays = readNumber(els.addEvery);
  const dosesPerDay = readNumber(els.addDoses);
  const duration = readNumber(els.addDuration);
  if (!name || !everyDays || !dosesPerDay || !duration) return;
  const totalDays = duration * (addUnit === "weeks" ? 7 : 1);
  const notes = els.addNotes.value.trim();
  const folder = currentFolder();
  const id = addMedicine({ name, everyDays, dosesPerDay, notes, totalDays }, folder?.id);
  closeAddScreen();
  selectTab(id);
  showToast(folder ? `${name} added to ${folder.name}.` : `${name} added for all nurses.`);
});

els.removeBtn.addEventListener("click", () => {
  const tab = currentTab();
  if (!tab) return;
  removeWithUndo({
    message: `${tab.name} removed for all nurses.`,
    hide: () => {
      local.activeTab = visibleTabs().find((t) => t.id !== tab.id)?.id ?? allTabs().find((t) => t.id !== tab.id)?.id ?? "";
      hiddenTabs.add(tab.id);
    },
    commit: () => {
      hiddenTabs.delete(tab.id);
      removeMedicine(tab);
    },
    restore: () => {
      hiddenTabs.delete(tab.id);
      local.activeTab = tab.id;
    },
  });
});

// ---------- Undo ----------
// Removing hides the thing on this phone at once but only deletes it for everyone once the
// Undo toast is gone (or the app is left), so Undo is instant and nothing has to be rebuilt.
let pending = null; // { commit } for a removal still in its Undo window

function flushPending() {
  const p = pending;
  pending = null;
  p?.commit();
}

function removeWithUndo({ message, hide, commit, restore }) {
  flushPending();
  hide();
  saveLocal();
  render();
  showToast(message, {
    action: "Undo",
    onAction: () => {
      restore();
      saveLocal();
      render();
    },
  });
  pending = { commit }; // after showToast, which flushes whatever was pending before
}

addEventListener("pagehide", flushPending);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) flushPending();
});

// ---------- Confirm dialog (instead of the browser's plain confirm()) ----------
let confirmAnswer = null; // resolves the open dialog's promise

function askConfirm({ title, text, ok, cancel = "Cancel" }) {
  confirmAnswer?.(false);
  els.confirmTitle.textContent = title;
  els.confirmText.textContent = text;
  els.confirmOk.textContent = ok;
  els.confirmCancel.textContent = cancel;
  showOverlay(els.confirm);
  els.confirmCancel.focus();
  return new Promise((resolve) => { confirmAnswer = resolve; });
}

function answerConfirm(yes) {
  const answer = confirmAnswer;
  confirmAnswer = null;
  hideOverlay(els.confirm);
  answer?.(yes);
}

els.confirmOk.addEventListener("click", () => answerConfirm(true));
els.confirmCancel.addEventListener("click", () => answerConfirm(false));
els.confirm.addEventListener("click", (e) => {
  if (e.target === els.confirm) answerConfirm(false);
});

// Overlays fade out before hiding (see .closing in style.css).
function showOverlay(el) {
  clearTimeout(el.hideTimer);
  el.classList.remove("hidden", "closing");
  hideToast(); // don't let a toast sit on top of the overlay
}

function hideOverlay(el) {
  if (el.classList.contains("hidden")) return;
  el.classList.add("closing");
  el.hideTimer = setTimeout(() => el.classList.add("hidden"), 180);
}

// ---------- Rename ----------
let renameTabId = null; // tab being renamed (from its card, or any row on the Medicines screen)

function openRename(id = currentTab()?.id) {
  const tab = findTab(id);
  if (!tab) return;
  renameTabId = id;
  els.renameInput.value = tab.name;
  showOverlay(els.rename);
  els.renameInput.select();
}

els.renameBtn.addEventListener("click", () => openRename());

els.renameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const tab = findTab(renameTabId);
  const name = els.renameInput.value.trim();
  if (!name) return;
  if (tab && name !== tab.name) updateTabField(tab, "name", name);
  render();
  hideOverlay(els.rename);
});

els.renameCancel.addEventListener("click", () => hideOverlay(els.rename));
els.rename.addEventListener("click", (e) => {
  if (e.target === els.rename) hideOverlay(els.rename);
});

// ---------- Notes ----------
let notesTabId = null; // tab whose notes are open
let notesEditing = false;

function renderNotes() {
  const tab = findTab(notesTabId);
  if (!tab) return closeNotes(true);
  const text = tab.notes?.trim() ?? "";
  els.notesTitle.textContent = tab.name;
  els.notesView.textContent = text;
  els.notesView.classList.toggle("empty", !text);
  els.notesView.classList.toggle("hidden", notesEditing);
  els.notesInput.classList.toggle("hidden", !notesEditing);
  els.notesDiscard.classList.toggle("hidden", !notesEditing);
  els.notesEdit.textContent = notesEditing ? "Save" : text ? "Edit" : "Add notes";
}

function openNotes(id = currentTab()?.id) {
  notesTabId = id;
  notesEditing = false;
  renderNotes();
  showOverlay(els.notes);
}

async function closeNotes(force = false) {
  const saved = findTab(notesTabId)?.notes?.trim() ?? "";
  if (!force && notesEditing && els.notesInput.value.trim() !== saved && !(await askConfirm({
    title: "Discard changes?", text: "Your changes to these notes haven't been saved.", ok: "Discard", cancel: "Keep editing",
  }))) return;
  notesTabId = null;
  notesEditing = false;
  hideOverlay(els.notes);
}

els.notesBtn.addEventListener("click", () => openNotes());
els.notesClose.addEventListener("click", () => closeNotes());
els.notes.addEventListener("click", (e) => {
  if (e.target === els.notes) closeNotes();
});

els.notesEdit.addEventListener("click", () => {
  const tab = findTab(notesTabId);
  if (!tab) return;
  if (notesEditing) {
    const text = els.notesInput.value.trim();
    if (text !== (tab.notes?.trim() ?? "")) {
      updateTabField(tab, "notes", text);
    }
    notesEditing = false;
    renderNotes();
  } else {
    notesEditing = true;
    els.notesInput.value = tab.notes ?? "";
    renderNotes();
    els.notesInput.focus();
  }
});

els.notesDiscard.addEventListener("click", () => {
  notesEditing = false;
  renderNotes();
});

// ---------- Schedule (days left, frequency, dosage) ----------
let scheduleTabId = null; // tab whose schedule is open
let scheduleEditing = false;

function renderSchedule() {
  const tab = findTab(scheduleTabId);
  if (!tab) return closeSchedule(true);
  const left = daysLeft(tab.id);

  els.scheduleTitle.textContent = tab.name;
  els.statDays.textContent = left == null ? "Not set" : plural(left, "day");
  els.statDaysMeta.textContent = left == null ? "Tap Edit to set how long it's taken"
    : left === 0 ? "Course finished" : `Last day ${shortDate(left - 1)}`;
  const every = everyText(tab.everyDays);
  els.statEvery.textContent = every[0].toUpperCase() + every.slice(1);
  els.statEveryMeta.textContent = isDueToday(tab) ? "Due today" : `Next dose ${nextDueLabel(tab)}`;
  els.statDoses.textContent = `${plural(tab.dosesPerDay, "dose")} a day`;
  els.statDosesMeta.textContent = "On each dose day";

  els.scheduleView.classList.toggle("hidden", scheduleEditing);
  els.scheduleEdit.classList.toggle("hidden", !scheduleEditing);
  els.scheduleDiscard.classList.toggle("hidden", !scheduleEditing);
  els.scheduleEditBtn.textContent = scheduleEditing ? "Save" : "Edit";
}

function scheduleChanges(tab) {
  const fields = [];
  const days = readNumber(els.schedDays);
  if (days != null && days !== daysLeft(tab.id)) {
    fields.push(new FieldPath("courses", tab.id), { startDays: days, startDate: todayStr() });
  }
  const root = tab.custom ? "medicines" : "builtins";
  const every = readNumber(els.schedEvery);
  if (every && every !== tab.everyDays) {
    // Restart the cycle today so the new frequency's first dose is today.
    fields.push(new FieldPath(root, tab.id, "everyDays"), every,
                new FieldPath(root, tab.id, "startDate"), todayStr());
  }
  const doses = readNumber(els.schedDoses);
  if (doses && doses !== tab.dosesPerDay) {
    fields.push(new FieldPath(root, tab.id, "dosesPerDay"), doses, ...reminderDeletes(tab.id, doses));
  }
  return fields;
}

function openSchedule(id = currentTab()?.id) {
  scheduleTabId = id;
  scheduleEditing = false;
  renderSchedule();
  showOverlay(els.schedule);
}

async function closeSchedule(force = false) {
  const tab = findTab(scheduleTabId);
  if (!force && scheduleEditing && tab && scheduleChanges(tab).length && !(await askConfirm({
    title: "Discard changes?", text: "Your changes to this schedule haven't been saved.", ok: "Discard", cancel: "Keep editing",
  }))) return;
  scheduleTabId = null;
  scheduleEditing = false;
  hideOverlay(els.schedule);
}

els.scheduleBtn.addEventListener("click", () => openSchedule());
els.daysLeftBtn.addEventListener("click", () => openSchedule());
els.scheduleClose.addEventListener("click", () => closeSchedule());
els.schedule.addEventListener("click", (e) => {
  if (e.target === els.schedule) closeSchedule();
});

els.scheduleEditBtn.addEventListener("click", () => {
  const tab = findTab(scheduleTabId);
  if (!tab) return;
  if (scheduleEditing) {
    const fields = scheduleChanges(tab);
    if (fields.length) updateDoc(patientRef, ...fields).catch(reportError);
    scheduleEditing = false;
    renderSchedule();
  } else {
    scheduleEditing = true;
    els.schedDays.value = daysLeft(tab.id) ?? "";
    els.schedEvery.value = tab.everyDays;
    updateEveryUnit(els.schedEvery, els.schedEveryUnit);
    els.schedDoses.value = tab.dosesPerDay;
    renderSchedule();
  }
});

els.schedEvery.addEventListener("input", () => updateEveryUnit(els.schedEvery, els.schedEveryUnit));

els.scheduleDiscard.addEventListener("click", () => {
  scheduleEditing = false;
  renderSchedule();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!els.confirm.classList.contains("hidden")) answerConfirm(false);
  else if (!els.rename.classList.contains("hidden")) hideOverlay(els.rename);
  else if (!els.folderDialog.classList.contains("hidden")) hideOverlay(els.folderDialog);
  else if (!els.patients.classList.contains("hidden")) closePatients();
  else if (notesTabId) closeNotes();
  else if (scheduleTabId) closeSchedule();
});

// ---------- Medicines screen (menu button): folders, reorder, per-medicine actions ----------
const svg = (paths) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  folder: svg(`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>`),
  pill: svg(`<path d="M10.5 20.5 3.5 13.5a4.95 4.95 0 1 1 7-7l7 7a4.95 4.95 0 1 1-7 7Z"/><path d="m8.5 8.5 7 7"/>`),
  grip: svg(`<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/>`
    + `<circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>`),
  rename: svg(`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>`),
  schedule: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
  notes: svg(`<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>`),
  trash: svg(`<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>`),
  user: svg(`<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>`),
  close: svg(`<path d="M18 6 6 18M6 6l12 12"/>`),
};

function rowButton(icon, label, onClick, extraClass = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `row-btn ${extraClass}`.trim();
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = ICONS[icon];
  btn.addEventListener("click", onClick);
  return btn;
}

// Icon + title + one line of detail; used by folder and medicine rows
function rowMain(icon, title, meta, onClick, iconClass = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "row-main";
  btn.innerHTML = `<span class="row-icon ${iconClass}">${ICONS[icon]}</span>
    <span class="row-text"><span class="row-title"></span><span class="row-meta"></span></span>`;
  btn.querySelector(".row-title").textContent = title;
  btn.querySelector(".row-meta").textContent = meta;
  btn.addEventListener("click", onClick);
  return btn;
}

function todayCount(tab) {
  if (!isDueToday(tab)) return "not due today";
  let done = 0;
  for (let i = 0; i < tab.dosesPerDay; i++) if (isTaken(tab.id, i)) done++;
  return `${done}/${tab.dosesPerDay} today`;
}

function medRow(tab, folderId) {
  const li = document.createElement("li");
  li.className = "row med-row";
  li.dataset.id = tab.id;

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "drag-handle";
  handle.title = "Drag to reorder";
  handle.setAttribute("aria-label", `Move ${tab.name} (arrow keys)`);
  handle.innerHTML = ICONS.grip;
  handle.addEventListener("pointerdown", (e) => startDrag(e, li));
  handle.addEventListener("keydown", (e) => moveWithKeys(e, li));

  li.append(
    handle,
    rowMain("pill", tab.name, `${scheduleText(tab.everyDays, tab.dosesPerDay)} · ${todayCount(tab)}`, () => showTab(tab.id, folderId)),
    rowButton("rename", `Rename ${tab.name}`, () => openRename(tab.id)),
    rowButton("schedule", `Schedule for ${tab.name}`, () => openSchedule(tab.id)),
    rowButton("notes", `Notes for ${tab.name}`, () => openNotes(tab.id), tab.notes?.trim() ? "has-notes" : ""),
  );
  return li;
}

// A folder's medicines, indented under it. Always there (even empty) so rows can be dropped in.
function medGroup(tabs, group, folderId = null) {
  const ul = document.createElement("ul");
  ul.className = "row-list med-group";
  ul.dataset.group = group;
  for (const tab of tabs) ul.append(medRow(tab, folderId));
  return ul;
}

// Tree: "Meds" (all), then each folder followed by its medicines, then the ones in no folder.
function renderMeds() {
  if (els.medsScreen.classList.contains("hidden") || drag) return; // don't rebuild a row mid-drag
  const tabs = allTabs();
  const folders = allFolders();
  const open = currentFolder();
  // Every database update redraws the list; keep the keyboard on the grip it was on
  const focusedId = document.activeElement?.matches?.("#folder-list .drag-handle")
    ? document.activeElement.closest(".med-row").dataset.id : null;
  els.folderList.innerHTML = "";

  const main = document.createElement("li");
  main.className = "tree-item";
  const mainRow = document.createElement("div");
  mainRow.className = "row" + (open ? "" : " active");
  mainRow.append(rowMain("folder", "Meds", `All medicines · ${plural(tabs.length, "med")}`, () => openFolder(null), "main"));
  main.append(mainRow);
  if (!folders.length && tabs.length) main.append(medGroup(tabs, "all"));
  els.folderList.append(main);

  for (const folder of folders) {
    const inFolder = folderTabs(folder);
    const li = document.createElement("li");
    li.className = "tree-item";
    const row = document.createElement("div");
    row.className = "row" + (open?.id === folder.id ? " active" : "");
    row.append(
      rowMain("folder", folder.name, inFolder.length ? plural(inFolder.length, "med") : "Empty, tap or drag medicines here",
        () => openFolder(folder.id)),
      rowButton("rename", `Edit folder ${folder.name}`, () => openFolderDialog(folder.id)),
      rowButton("trash", `Delete folder ${folder.name}`, () => confirmDeleteFolder(folder), "danger"),
    );
    li.append(row, medGroup(inFolder, folder.id, folder.id));
    els.folderList.append(li);
  }

  if (folders.length) {
    const li = document.createElement("li");
    li.className = "tree-item loose";
    const label = document.createElement("span");
    label.className = "group-label";
    label.textContent = "Not in a folder";
    li.append(label, medGroup(tabs.filter((t) => !folderOf(t.id)), "loose"));
    els.folderList.append(li);
  }

  els.medEmpty.classList.toggle("hidden", tabs.length > 0);
  els.medHint.classList.toggle("hidden", tabs.length < 2 && !folders.length);
  if (focusedId) els.folderList.querySelector(`.med-row[data-id="${CSS.escape(focusedId)}"] .drag-handle`)?.focus();
}

function openMeds() {
  openScreen(els.medsScreen);
  renderMeds();
}

function closeMeds() {
  if (!els.medsScreen.classList.contains("hidden")) closeScreen(els.medsScreen);
}

// null opens "Meds" (every medicine). An empty folder opens its editor instead, since there's nothing to show.
function openFolder(id) {
  const folder = allFolders().find((f) => f.id === id);
  if (folder && !folderTabs(folder).length) return openFolderDialog(id);
  local.folder = folder ? id : null;
  const tabs = folder ? folderTabs(folder) : allTabs();
  if (!tabs.some((t) => t.id === local.activeTab)) local.activeTab = tabs[0]?.id ?? local.activeTab;
  saveLocal();
  closeMeds();
  render();
}

// Tapping a medicine opens its tab, inside the folder it was listed under (or all medicines).
function showTab(id, folderId = null) {
  local.folder = folderId;
  closeMeds();
  selectTab(id);
}

els.menuBtn.addEventListener("click", openMeds);
els.medsBack.addEventListener("click", closeMeds);
els.homeBtn.addEventListener("click", () => openFolder(null));

// ---------- Moving medicines (drag the grip, or focus it and use the arrow keys) ----------
// A row can be dropped anywhere in the tree: between other medicines, on a folder's name
// (goes to the top of that folder) or on an empty folder's drop box.
let drag = null; // { li, startY, scroll, moved }

function middle(el) {
  const box = el.getBoundingClientRect();
  return box.top + box.height / 2;
}

function startDrag(e, li) {
  if (e.button > 0) return;
  e.preventDefault();
  drag = { li, startY: e.clientY, scroll: els.medsScreen.scrollTop, moved: false };
  li.classList.add("dragging");
  els.folderList.classList.add("drag-active"); // shows drop boxes for empty folders
  // On window, not the grip: moving the row in the page drops the grip's pointer capture
  addEventListener("pointermove", moveDrag);
  addEventListener("pointerup", endDrag);
  addEventListener("pointercancel", endDrag);
}

// Puts the row where the pointer is. Returns true if it moved.
function placeRow(li, x, y) {
  const target = document.elementFromPoint(x, y)?.closest(".med-row, .tree-item > .row, .group-label, .med-group");
  if (!target || !els.folderList.contains(target)) return false;
  const others = [...els.folderList.querySelectorAll(".med-row:not(.dragging)")];
  if (target.classList.contains("med-row")) {
    if (y > middle(target)) {
      if (target.nextElementSibling === li) return false;
      glide(others, () => target.after(li));
    } else {
      if (target.previousElementSibling === li) return false;
      glide(others, () => target.before(li));
    }
    return true;
  }
  // A folder's name or the "Not in a folder" label: to the top of that group.
  // Over a group itself (the gap between rows, or an empty folder's drop box): only if it's empty.
  const isGroup = target.classList.contains("med-group");
  const group = isGroup ? target : target.parentElement.querySelector(".med-group");
  if (!group || group === li.parentElement) return false;
  if (isGroup && group.querySelector(".med-row")) return false;
  glide(others, () => group.prepend(li));
  return true;
}

function moveDrag(e) {
  if (!drag) return;
  const { li } = drag;
  // Scroll the screen when dragging near its top or bottom edge
  if (e.clientY < 80) els.medsScreen.scrollTop -= 10;
  else if (e.clientY > innerHeight - 80) els.medsScreen.scrollTop += 10;
  drag.startY -= els.medsScreen.scrollTop - drag.scroll;
  drag.scroll = els.medsScreen.scrollTop;

  li.style.transform = `translateY(${e.clientY - drag.startY}px)`;
  const before = li.getBoundingClientRect().top;
  if (!placeRow(li, e.clientX, e.clientY)) return;
  drag.startY += li.getBoundingClientRect().top - before; // the row moved in the page, so count from its new spot
  li.style.transform = `translateY(${e.clientY - drag.startY}px)`;
  drag.moved = true;
}

function endDrag() {
  removeEventListener("pointermove", moveDrag);
  removeEventListener("pointerup", endDrag);
  removeEventListener("pointercancel", endDrag);
  if (!drag) return;
  const { li, moved } = drag;
  const offset = li.style.transform;
  li.style.transform = "";
  els.folderList.classList.remove("drag-active");
  const settle = offset && !calm()
    ? li.animate([{ transform: offset }, { transform: "none" }], { duration: 160, easing: "ease-out" }).finished
    : Promise.resolve();
  settle.finally(() => {
    li.classList.remove("dragging");
    drag = null;
    if (moved) saveTree(li);
    render();
  });
}

// Up/Down move one place; at the edge of a folder they step into the folder above or below.
function moveWithKeys(e, li) {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  const up = e.key === "ArrowUp";
  const sibling = up ? li.previousElementSibling : li.nextElementSibling;
  if (sibling) {
    if (up) sibling.before(li);
    else sibling.after(li);
  } else {
    const groups = [...els.folderList.querySelectorAll(".med-group")];
    const next = groups[groups.indexOf(li.parentElement) + (up ? -1 : 1)];
    if (!next) return;
    if (up) next.append(li);
    else next.prepend(li);
  }
  saveTree(li);
  render();
  els.folderList.querySelector(`.med-row[data-id="${CSS.escape(li.dataset.id)}"] .drag-handle`)?.focus();
}

// ---------- Folder dialog (new / edit) ----------
let folderEditId = null; // null while making a new folder

function openFolderDialog(id = null) {
  const folder = allFolders().find((f) => f.id === id);
  folderEditId = folder ? id : null;
  els.folderDialogTitle.textContent = folder ? "Edit folder" : "New folder";
  els.folderNameInput.value = folder?.name ?? "";
  els.folderPickList.innerHTML = "";
  const tabs = allTabs();
  for (const tab of tabs) {
    const inFolder = folderOf(tab.id);
    const label = document.createElement("label");
    label.className = "pick-row";
    label.innerHTML = `<input type="checkbox" /><span class="pick-name"></span><span class="pick-where"></span>`;
    label.querySelector("input").value = tab.id;
    label.querySelector("input").checked = !!folder && inFolder === folder.id;
    label.querySelector(".pick-name").textContent = tab.name;
    // Ticking a medicine from another folder moves it here (see saveFolder)
    if (inFolder && inFolder !== folder?.id) label.querySelector(".pick-where").textContent = `in ${shared.folders[inFolder].name}`;
    els.folderPickList.append(label);
  }
  if (!tabs.length) els.folderPickList.innerHTML = `<p class="dialog-sub">No medicines yet. Add one with the + button first.</p>`;
  showOverlay(els.folderDialog);
  els.folderNameInput.focus();
}

els.folderNew.addEventListener("click", () => openFolderDialog());
els.folderCancel.addEventListener("click", () => hideOverlay(els.folderDialog));
els.folderDialog.addEventListener("click", (e) => {
  if (e.target === els.folderDialog) hideOverlay(els.folderDialog);
});

els.folderForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = els.folderNameInput.value.trim();
  if (!name) return;
  const meds = [...els.folderPickList.querySelectorAll("input:checked")].map((box) => box.value);
  const id = folderEditId ?? "f" + randomId(10);
  const createdAt = shared.folders?.[id]?.createdAt ?? Date.now();
  saveFolder(id, { name, meds, createdAt });
  hideOverlay(els.folderDialog);
  render();
  if (!folderEditId) showToast(`Folder ${name} made.`);
});

function confirmDeleteFolder(folder) {
  const wasOpen = local.folder === folder.id;
  removeWithUndo({
    message: `Folder ${folder.name} deleted. Its medicines stay.`,
    hide: () => {
      hiddenFolders.add(folder.id);
      if (wasOpen) local.folder = null;
    },
    commit: () => {
      hiddenFolders.delete(folder.id);
      deleteFolder(folder.id);
    },
    restore: () => {
      hiddenFolders.delete(folder.id);
      if (wasOpen) local.folder = folder.id;
    },
  });
}

// ---------- Patients (switch between trackers) ----------
// Trackers this account opened recently. Google accounts keep the list in users/{uid}.recent so
// it follows them to other phones; guests and attendants keep it on this phone only, so they
// leave nothing extra in the database.
const RECENT_MAX = 10;
let userData = {}; // users/{uid} as read at sign-in: patientId (their own tracker), recent
let remembered = false; // this open has been added to the list

function recentKey() {
  return `medicineTracker:recent:${user.uid}`;
}

function recentMap() {
  if (!user.isAnonymous) return { ...userData.recent };
  try {
    return JSON.parse(localStorage.getItem(recentKey())) ?? {};
  } catch {
    return {};
  }
}

function saveRecent(map) {
  // Keep the newest few, but never drop the account's own tracker
  const keep = Object.entries(map).sort((a, b) => b[1].at - a[1].at)
    .filter(([id], n) => n < RECENT_MAX || id === userData.patientId);
  map = Object.fromEntries(keep);
  if (user.isAnonymous) {
    try { localStorage.setItem(recentKey(), JSON.stringify(map)); } catch {}
    return;
  }
  userData.recent = map;
  // mergeFields replaces the whole list, so dropped entries really go
  setDoc(doc(db, "users", user.uid), { recent: map }, { mergeFields: ["recent"] }).catch(reportError);
}

// On each snapshot: add or refresh the open tracker in the list (written only when something changed)
function rememberPatient() {
  if (draft || !shared?.patient?.name) return;
  const map = recentMap();
  const prev = map[patientId];
  const entry = { name: shared.patient.name, pid: shared.patient.pid ?? null, at: remembered ? prev?.at ?? Date.now() : Date.now() };
  remembered = true;
  if (prev && prev.name === entry.name && prev.pid === entry.pid && prev.at === entry.at) return;
  map[patientId] = entry;
  saveRecent(map);
}

function renderPatients() {
  const list = Object.entries(recentMap()).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.at - a.at);
  if (!list.some((p) => p.id === patientId) && shared?.patient?.name) {
    list.unshift({ id: patientId, name: shared.patient.name, pid: shared.patient.pid });
  }
  els.patientList.replaceChildren(...list.map((p) => {
    const li = document.createElement("li");
    const current = p.id === patientId;
    li.className = "row" + (current ? " active" : "");
    const meta = [p.pid ? `PID ${p.pid}` : null, p.id === userData.patientId ? "Your tracker" : null, current ? "Open now" : null]
      .filter(Boolean).join(" · ");
    li.append(rowMain("user", p.name, meta, () => switchPatient(p.id), current ? "main" : ""));
    if (!current && p.id !== userData.patientId) {
      li.append(rowButton("close", `Remove ${p.name} from this list`, () => {
        const map = recentMap();
        delete map[p.id];
        saveRecent(map);
        renderPatients();
      }));
    }
    return li;
  }));
}

function openPatients() {
  if (draft || !hasPatientDetails()) return;
  els.patientPidInput.value = "";
  renderPatients();
  showOverlay(els.patients);
}

function closePatients() {
  hideOverlay(els.patients);
}

function switchPatient(id) {
  closePatients();
  if (id === patientId) return;
  flushPending(); // a removal waiting for Undo belongs to the tracker being left
  openPatient(id);
  render();
}

els.patientBtn.addEventListener("click", openPatients);
els.patientsClose.addEventListener("click", closePatients);
els.patients.addEventListener("click", (e) => {
  if (e.target === els.patients) closePatients();
});
els.patientPidInput.addEventListener("input", formatPidInput);
els.patientPidForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pid = normalizePid(els.patientPidInput.value);
  if (!pid) return showToast("A PID has 6 characters, like ABC-D#3.");
  const submit = els.patientPidForm.querySelector("button");
  submit.disabled = true;
  try {
    const id = await findByPid(pid);
    if (!id) return showToast(`No patient found with PID ${pid}.`);
    switchPatient(id);
  } catch (err) {
    console.error(err);
    showToast("Couldn't look up that PID — check your connection and try again.");
  } finally {
    submit.disabled = false;
  }
});

// ---------- Share link with the other nurses ----------
els.shareBtn.addEventListener("click", async () => {
  if (draft) return showToast("Add a medicine first, then share the link.");
  const url = location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Medicine Tracker", url });
    } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast("Link copied — send it to the other nurses.");
  } catch {
    prompt("Copy this link and send it to the other nurses:", url);
  }
});

// ---------- Reminders ----------
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// A message at the bottom; with an action (Undo) it stays 6 s, otherwise 10 s.
let toastAction = null;

function showToast(msg, { action, onAction } = {}) {
  flushPending(); // a new message replaces any Undo still on screen
  els.toastText.textContent = msg;
  els.toastAction.textContent = action ?? "";
  els.toastAction.classList.toggle("hidden", !action);
  toastAction = onAction ?? null;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(hideToast, action ? 6000 : 10000);
}

function hideToast() {
  clearTimeout(showToast.timer);
  els.toast.classList.add("hidden");
  toastAction = null;
  flushPending();
}

els.toastAction.addEventListener("click", () => {
  const act = toastAction;
  toastAction = null;
  pending = null; // the action (Undo) replaces committing the removal
  clearTimeout(showToast.timer);
  els.toast.classList.add("hidden");
  act?.();
});

function notify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
  showToast(`${title} — ${body}`);
}

function checkReminders() {
  if (!hasPatientDetails()) return;
  const now = new Date();
  const today = todayStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const [key, time] of Object.entries(shared.reminders ?? {})) {
    if (local.notified[key] === today) continue;
    const [h, m] = time.split(":").map(Number);
    if (nowMinutes < h * 60 + m) continue;

    const [tabId, i] = key.split("_");
    const tab = findTab(tabId);
    if (!tab || !isDueToday(tab)) continue;
    local.notified[key] = today;
    saveLocal();
    // Skip the alert if any nurse already marked the dose taken.
    if (isTaken(tabId, Number(i))) continue;
    notify("Time for medicine 💊", `${ordinal(Number(i) + 1)} dose of ${tab.label}`);
  }
}

// ---------- Init ----------
window.appStarted = true; // tells the reload-on-crash guard in index.html that startup worked
render(); // the patient loads once onAuthStateChanged reports who's signed in

setInterval(() => {
  if (todayStr() !== renderedDate) { // new day → everything shows red again
    if (unwatchDays) watchDays();
    render();
  }
  refreshTimes();
  checkReminders();
}, 20000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});
