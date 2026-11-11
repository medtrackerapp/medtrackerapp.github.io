// The Worker must fire exactly when app.js would: same dueness maths, same wording,
// the patient's own timezone, and silence for anyone who turned reminders off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applySync, collectDue, isDueOn, localParts, mirrorOf, ordinal } from "../src/logic.js";

const sub = (at = 1, tz = "Asia/Kolkata") => ({ endpoint: "https://e/" + at, p256dh: "k", auth: "a", at, tz });

const doc = {
  patient: { name: "Ravi Iyer" },
  builtinTabs: false,
  medicines: {
    mA: { name: "Dolo 650", everyDays: 1, dosesPerDay: 3, startDate: "2026-11-01" },
    mB: { name: "Shelcal", everyDays: 2, dosesPerDay: 1, startDate: "2026-11-10" },
  },
  reminders: { mA_1: "14:30", mB_0: "14:30", mA_2: "20:00" },
  pushSubs: { s1: sub(1), s2: sub(2) },
};

// 09:00 UTC = 14:30 in Asia/Kolkata (+5:30, the half-hour offset catches sloppy tz maths)
const at1430 = new Date(Date.UTC(2026, 10, 11, 9, 0));

test("mirrorOf keeps only what firing needs, newest phone's timezone wins", () => {
  const m = mirrorOf(doc);
  assert.equal(m.name, "Ravi Iyer");
  assert.equal(m.tz, "Asia/Kolkata");
  assert.deepEqual(Object.keys(m.tabs), ["mA", "mB"]);
  assert.equal(mirrorOf({ ...doc, pushSubs: {} }), null, "no subscriptions, no mirror");
});

test("built-in 1x/4x/6x tabs count unless removed or switched off", () => {
  const old = mirrorOf({ patient: {}, builtins: { 1: { name: "Morning", removed: false }, 4: { removed: true } }, pushSubs: { s: sub() } });
  assert.deepEqual(Object.keys(old.tabs), ["1", "6"]);
  assert.equal(old.tabs[1].label, "Morning");
  assert.equal(old.tabs[6].label, "6x medicine");
});

test("isDueOn mirrors the app's every-N-days cycle", () => {
  const tab = { everyDays: 2, startDate: "2026-11-10" };
  assert.equal(isDueOn(tab, "2026-11-10"), true);
  assert.equal(isDueOn(tab, "2026-11-11"), false);
  assert.equal(isDueOn(tab, "2026-11-12"), true);
  assert.equal(isDueOn(tab, "2026-11-09"), false, "before it was started");
  assert.equal(isDueOn({ everyDays: 1 }, "2026-11-11"), true);
});

test("collectDue fires this minute's reminders in the patient's own timezone", () => {
  const patients = { p1: mirrorOf(doc) };
  const due = collectDue(patients, at1430);
  assert.deepEqual(due.map((d) => d.key), ["mA_1"], "mB is every other day and 2026-11-11 is its off day");
  assert.equal(due[0].title, "Time for medicine 💊");
  assert.equal(due[0].body, "2nd dose of Dolo 650 — Ravi Iyer");
  assert.equal(due[0].day, "2026-11-11");
  assert.equal(collectDue(patients, new Date(at1430.getTime() + 60e3)).length, 0, "a minute later: nothing");
  const dayAfter = collectDue(patients, new Date(Date.UTC(2026, 10, 12, 9, 0)));
  assert.deepEqual(dayAfter.map((d) => d.key).sort(), ["mA_1", "mB_0"], "mB's on-day");
});

test("a reminder for a deleted medicine is ignored, like in the app", () => {
  const m = mirrorOf({ ...doc, medicines: { mA: doc.medicines.mA } });
  assert.equal(collectDue({ p1: m }, at1430).length, 1, "only mA_1; mB_0 has no tab");
});

test("applySync adds, replaces and forgets patients", () => {
  const patients = {};
  applySync(patients, [{ id: "p1", data: doc }]);
  assert.ok(patients.p1);
  applySync(patients, [{ id: "p1", data: { ...doc, pushSubs: {} } }]);
  assert.equal(patients.p1, undefined, "every phone turned reminders off");
});

test("a broken timezone string falls back instead of crashing the cron", () => {
  assert.equal(localParts(at1430, "Not/AZone").time, "14:30");
});

test("midnight handling: h23 keeps 00, and the local date flips with the zone", () => {
  const utcEvening = new Date(Date.UTC(2026, 10, 11, 18, 45)); // 00:15 on the 12th in IST
  assert.deepEqual(localParts(utcEvening, "Asia/Kolkata"), { date: "2026-11-12", time: "00:15" });
});

test("ordinals read like the app's", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th"]);
});
