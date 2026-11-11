// The scheduling brain, kept pure so node --test covers it. Date and dueness maths mirror app.js
// (daysBetween, isDueOn, allTabs, checkReminders) so the Worker fires exactly when the app would.

export function daysBetween(fromStr, toStr) {
  const [y1, m1, d1] = fromStr.split("-").map(Number);
  const [y2, m2, d2] = toStr.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function isDueOn(tab, dateStr) {
  if (!tab.everyDays || tab.everyDays <= 1) return true;
  if (!tab.startDate) return true; // an unedited built-in tab has no start date
  const elapsed = daysBetween(tab.startDate, dateStr);
  return elapsed >= 0 && elapsed % tab.everyDays === 0;
}

// One patient's mirror entry (just what firing needs), or null when no phone is subscribed
export function mirrorOf(doc) {
  const subs = doc.pushSubs ?? {};
  if (!Object.keys(subs).length) return null;
  const tabs = {};
  if (doc.builtinTabs !== false) {
    for (const n of ["1", "4", "6"]) {
      const b = doc.builtins?.[n] ?? {};
      if (!b.removed) tabs[n] = { label: b.name ?? `${n}x medicine`, everyDays: b.everyDays ?? 1, startDate: b.startDate };
    }
  }
  for (const [id, m] of Object.entries(doc.medicines ?? {})) {
    tabs[id] = { label: m.name, everyDays: m.everyDays, startDate: m.startDate };
  }
  const newest = Object.values(subs).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
  return { name: doc.patient?.name ?? "", tz: newest.tz || "Asia/Kolkata", tabs, reminders: doc.reminders ?? {}, subs };
}

export function applySync(patients, docs) {
  for (const { id, data } of docs) {
    const entry = mirrorOf(data);
    if (entry) patients[id] = entry;
    else delete patients[id]; // last phone turned reminders off
  }
}

const TIME_OPTS = { hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" };

// The patient's own date and HH:MM for this instant — reminder times are local, like the app's
export function localParts(date, tz) {
  let fmt;
  try { fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, ...TIME_OPTS }); }
  catch { fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", ...TIME_OPTS }); }
  const get = (t, parts = fmt.formatToParts(date)) => parts.find((p) => p.type === t).value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

// Every reminder landing on this exact minute, with the notification already worded
export function collectDue(patients, date) {
  const due = [];
  for (const [id, p] of Object.entries(patients)) {
    const { date: day, time } = localParts(date, p.tz);
    for (const [key, at] of Object.entries(p.reminders)) {
      if (at !== time) continue;
      const [tabId, i] = key.split("_");
      const tab = p.tabs[tabId];
      if (!tab || !isDueOn(tab, day)) continue;
      due.push({ id, key, day, title: "Time for medicine 💊", body: `${ordinal(Number(i) + 1)} dose of ${tab.label} — ${p.name}` });
    }
  }
  return due;
}
