// Dose reminders while the app is closed. A 1-minute cron keeps a mirror of every push-enabled
// patient (reminder times, medicine names, subscriptions) in KV, refreshed from Firestore only
// when the app stamped pushChangedAt — so a quiet minute costs zero Firestore reads. At a
// reminder's minute it reads that patient's day-doc once and pushes unless the dose was given.
import { applySync, collectDue } from "./logic.js";
import { accessToken, changedPatients, getDocs, deleteSubField } from "./firestore.js";
import { sendPush } from "./webpush.js";

const SYNC_MS = 5 * 60e3; // how stale the mirror may get after a schedule change
const FULL_MS = 24 * 3600e3; // daily full rebuild also forgets deleted trackers

export default {
  scheduled(event, env, ctx) {
    ctx.waitUntil(tick(event.scheduledTime, env));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      const s = await state(env);
      return Response.json({
        patients: Object.keys(s.patients).length,
        subs: Object.values(s.patients).reduce((n, p) => n + Object.keys(p.subs).length, 0),
        lastSync: s.lastSync, lastFull: s.lastFull,
      });
    }
    if (url.pathname === "/test" && req.method === "POST") {
      if (req.headers.get("x-test-key") !== env.TEST_KEY) return new Response("wrong x-test-key", { status: 403 });
      const s = await sync(await state(env), Date.now(), env, true);
      await env.PUSH.put("state", JSON.stringify(s));
      const { patient } = await req.json();
      const p = s.patients[patient];
      if (!p) return Response.json({ sent: 0, note: "that patient has no subscriptions (is Reminders on, and the id the 20-char ?patient= one?)" });
      const statuses = await Promise.all(Object.values(p.subs).map((sub) =>
        sendPush(sub, { t: "Medicine Tracker", b: `Test — reminders for ${p.name} reach this phone.`, p: patient }, env)));
      return Response.json({ sent: statuses.filter((n) => n < 300).length, statuses });
    }
    return new Response("medtracker-push", { status: 404 });
  },
};

const state = async (env) => (await env.PUSH.get("state", "json")) ?? { patients: {}, lastSync: 0, lastFull: 0 };

async function tick(now, env) {
  const s = await state(env);
  const synced = s.lastSync;
  try {
    await sync(s, now, env);
  } catch (err) {
    console.log("sync failed, next minute retries:", err.message);
  }
  let pruned = false;
  if (s.lastSync) {
    try {
      pruned = await fire(s, now, env);
    } catch (err) {
      console.log("send failed:", err.message);
    }
  }
  if (s.lastSync !== synced || pruned) await env.PUSH.put("state", JSON.stringify(s));
}

async function sync(s, now, env, force = false) {
  const full = now - s.lastFull > FULL_MS;
  if (!force && !full && now - s.lastSync < SYNC_MS) return s;
  const token = await accessToken(env.FIREBASE_SERVICE_ACCOUNT);
  // A minute of overlap: our clock and Firestore's commit times aren't the same clock
  const docs = await changedPatients(env.FIREBASE_PROJECT_ID, token, full ? 0 : s.lastSync - 60e3);
  if (full) s.patients = {};
  applySync(s.patients, docs);
  s.lastSync = now;
  if (full) s.lastFull = now;
  return s;
}

async function fire(s, now, env) {
  const due = collectDue(s.patients, new Date(now));
  if (!due.length) return false;
  const token = await accessToken(env.FIREBASE_SERVICE_ACCOUNT);
  const days = await getDocs(env.FIREBASE_PROJECT_ID, token,
    [...new Set(due.map((d) => `patients/${d.id}/days/${d.day}`))]);
  let pruned = false;
  for (const d of due) {
    if (days[`patients/${d.id}/days/${d.day}`]?.[d.key]) continue; // a nurse already gave it
    const subs = s.patients[d.id].subs;
    for (const [key, sub] of Object.entries(subs)) {
      const status = await sendPush(sub, { t: d.title, b: d.body, p: d.id, g: d.key }, env).catch(() => 0);
      if (status === 404 || status === 410) { // that phone is gone for good
        delete subs[key];
        pruned = true;
        await deleteSubField(env.FIREBASE_PROJECT_ID, token, d.id, key).catch(() => {});
      }
    }
    if (!Object.keys(subs).length) delete s.patients[d.id];
  }
  return pruned;
}
