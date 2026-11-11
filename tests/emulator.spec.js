// Signed-in flows, run against the Firebase emulators (never the real project):
//   npm run test:emulator
// The app switches to the emulators when opened at localhost with ?emulator (see app.js "Firebase").
// The emulators enforce ../firestore.rules, so these also check the rules allow what the app does.
const { test, expect } = require("@playwright/test");
const path = require("path");
const crypto = require("crypto");
const { execFileSync, spawn } = require("child_process");
const { createRequire } = require("module");

const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST;
test.skip(!FIRESTORE, "needs the Firebase emulators: npm run test:emulator");

const PROJECT = "demo-medtracker";
const CLEANUP = path.join(__dirname, "..", "cleanup");

// Admin access to the emulator (bypasses the rules) to seed and inspect data
let adminDb;
function admin() {
  if (adminDb) return adminDb;
  const req = createRequire(path.join(CLEANUP, "package.json"));
  const { initializeApp, getApps } = req("firebase-admin/app");
  const { getFirestore } = req("firebase-admin/firestore");
  adminDb = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT }));
  return adminDb;
}

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// The Sheet script counts doses by India date (like the app's users' phones), whatever this machine's time zone
function indiaToday() {
  return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
}

// A date n days from today, like today() (this machine's time zone, as the app in the browser uses)
function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The emulators answer their first requests slowly (Java warming up), which made whichever test
// ran first miss its 20 s waits. One throwaway guest sign-in warms them up first.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/?emulator");
  await page.getByRole("button", { name: "Just looking? Continue as guest" }).click();
  await page.locator("#name-input").fill("Warm Up");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#patient-name")).toHaveText("Warm Up", { timeout: 60000 });
  await context.close();
});

// Collect script errors for every page a test opens
let problems;
test.beforeEach(() => { problems = []; });
test.afterEach(() => { expect(problems, "no script errors").toEqual([]); });
function watch(page) {
  page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
  return page;
}

async function newPage(browser) {
  return watch(await (await browser.newContext()).newPage());
}

// Guest sign-in; with a name, a new tracker of their own (a link opens that tracker instead)
async function signInGuest(page, name, url = "/?emulator") {
  await page.goto(url);
  await page.getByRole("button", { name: "Just looking? Continue as guest" }).click();
  if (name) {
    await page.locator("#name-input").fill(name);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#patient-name")).toHaveText(name, { timeout: 20000 });
  }
}

async function addMedicine(page, name, doses = 1) {
  await page.locator(".fab").click();
  await page.locator("#add-name").fill(name);
  await page.keyboard.press("Escape"); // close the suggestions
  await page.locator("#add-doses").fill(String(doses));
  await page.locator("#add-form").getByRole("button", { name: "Add medicine" }).click();
  await expect(page.locator("#add-screen")).toBeHidden();
  await expect(page.locator("#progress-title")).toHaveText(name);
}

// The tracker's share link, kept on the emulators (?emulator)
function linkOf(page) {
  return `/?emulator&patient=${new URL(page.url()).searchParams.get("patient")}`;
}

async function pidOf(page) {
  await expect(page.locator("#today-label")).toContainText("PID ", { timeout: 20000 });
  return (await page.locator("#today-label").textContent()).match(/PID (\S{3}-\S{3})/)[1];
}

const dose = (page, i) => page.locator("#dose-list .dose").nth(i);
const status = (page, i) => dose(page, i).locator(".dose-status");

async function setReminder(page, i, time) {
  await dose(page, i).locator(".reminder-btn").click();
  // What the time picker does when a time is chosen (desktop Chrome's picker popup can't be driven)
  await dose(page, i).locator('input[type="time"]').evaluate((el, t) => {
    el.value = t;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, time);
  await expect(dose(page, i).locator(".reminder-btn")).toContainText(/\d/);
  await page.waitForTimeout(300); // the cards redraw just after a reminder is set
}

// ---------- Guest draft ----------
test("a guest's tracker is only saved once they add a medicine", async ({ page }) => {
  watch(page);
  await signInGuest(page, "Draft Guest");
  await expect(page.locator("#empty")).toBeVisible();
  expect(page.url()).not.toContain("patient=");
  await addMedicine(page, "Dolo 650");
  await pidOf(page);
  const id = new URL(page.url()).searchParams.get("patient");
  const snap = await admin().doc(`patients/${id}`).get();
  expect(snap.get("expireAt")).toBeTruthy(); // guests' trackers expire
});

// ---------- Who gave each dose ----------
test("ticking a dose records who gave it, and other phones see it", async ({ page, browser }) => {
  watch(page);
  await signInGuest(page, "Nurse Asha");
  await addMedicine(page, "Pan 40", 2);
  await dose(page, 0).locator(".dose-toggle").click();
  await expect(status(page, 0)).toHaveText(/^Given by Nurse Asha · \d/);
  await expect(status(page, 1)).toHaveText("Not taken yet");

  const other = await newPage(browser);
  await signInGuest(other, null, linkOf(page)); // a share link: no name needed
  await expect(status(other, 0)).toHaveText(/^Given by Nurse Asha · \d/, { timeout: 20000 });

  // Stored in a small per-day doc, not on the patient doc
  const id = new URL(page.url()).searchParams.get("patient");
  const day = (await admin().doc(`patients/${id}/days/${today()}`).get()).data();
  const [entry] = Object.entries(day).filter(([key]) => key.includes("_")).map(([, tick]) => tick);
  expect(entry.by).toBe("Nurse Asha");
  expect(day.changedAt.toMillis()).toBeGreaterThan(Date.now() - 120000); // the server's time of the change
  expect((await admin().doc(`patients/${id}`).get()).get("doses")).toBeUndefined();
});

test("unticking a dose can be undone", async ({ page }) => {
  watch(page);
  await signInGuest(page, "Undo Nurse");
  await addMedicine(page, "Thyronorm 50");
  await dose(page, 0).locator(".dose-toggle").click();
  await expect(status(page, 0)).toHaveText(/^Given by Undo Nurse/);
  await dose(page, 0).locator(".dose-toggle").click();
  await expect(status(page, 0)).toHaveText("Not taken yet");
  await expect(page.locator("#toast-text")).toContainText("marked not given");
  await page.locator("#toast-action").click();
  await expect(status(page, 0)).toHaveText(/^Given by Undo Nurse/);
});

// ---------- Overdue and next dose ----------
test("a dose past its time shows as overdue, and the bar shows what's next", async ({ page }) => {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  // Reminder times are times of day: 30 min ago and 90 min ahead must both still be today
  test.skip(minutes < 31 || minutes > 24 * 60 - 92, "needs times earlier and later today");
  watch(page);
  await signInGuest(page, "Time Nurse");
  await addMedicine(page, "Augmentin 625", 2);
  await setReminder(page, 0, hhmm(new Date(now.getTime() - 30 * 60000)));
  await setReminder(page, 1, hhmm(new Date(now.getTime() + 90 * 60000)));

  await expect(status(page, 0)).toHaveText(/^Overdue · 3[01] min$/);
  await expect(dose(page, 0).locator(".dose-toggle")).toHaveClass(/overdue/);
  await expect(status(page, 1)).toHaveText(/^Due at /);
  await expect(page.locator("#next-dose")).toHaveClass(/late/);
  await expect(page.locator("#next-dose-label")).toHaveText("Overdue");
  await expect(page.locator("#tabs .tab.active .tab-dot")).toBeVisible();
  // A long overdue line ellipsizes; it must never push the page sideways
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  // Given: no longer overdue; the bar moves on to the next dose
  await dose(page, 0).locator(".dose-toggle").click();
  await expect(page.locator("#next-dose-label")).toHaveText("Next");
  await expect(page.locator("#next-dose-text")).toContainText("2nd dose at");
  await expect(page.locator("#tabs .tab-dot")).toHaveCount(0);
});

// ---------- History ----------
test("the last 7 days show each dose, today included", async ({ page }) => {
  watch(page);
  await signInGuest(page, "History Nurse");
  await addMedicine(page, "Ecosprin 75", 2);
  await expect(page.locator("#history .history-day")).toHaveCount(7);
  const todayCol = page.locator("#history .history-day.today");
  await expect(todayCol).toHaveAttribute("aria-label", /0 of 2 given$/);
  await dose(page, 0).locator(".dose-toggle").click();
  await expect(todayCol).toHaveAttribute("aria-label", /1 of 2 given$/);
  await expect(todayCol.locator(".hdot.given")).toHaveCount(1);
  await expect(todayCol.locator(".hdot.pending")).toHaveCount(1);
  // Days before the medicine was added are marked as such
  await expect(page.locator("#history .history-day").first()).toHaveAttribute("aria-label", /No History$/);
  await todayCol.click();
  await expect(page.locator("#toast-text")).toContainText("1st: History Nurse");
});

// Past days come from the phone's own copy; one query asks which days changed (stamped by the
// server) and only those are read again. Only today is followed live.
test("finished days come from the phone's own copy, and changed ones are read again", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "data check, once is enough");
  watch(page);
  await page.clock.install(); // the real time; moved on below to stand for half an hour away
  const { Timestamp, FieldValue } = createRequire(path.join(CLEANUP, "package.json"))("firebase-admin/firestore");
  const id = `cache${crypto.randomBytes(8).toString("hex")}`;
  const tick = (by) => ({ by, uid: "x", at: Timestamp.now() });
  await admin().doc(`patients/${id}`).set({
    patient: { name: "Cache Tracker", pid: "CAC-HE1" }, ownerUid: "someone", builtinTabs: false,
    medicines: { m1: { name: "Aspirin", everyDays: 1, dosesPerDay: 2, startDate: dayOffset(-3), createdAt: Date.now() - 3 * 86400000 } },
  });
  const yesterdayRef = admin().doc(`patients/${id}/days/${dayOffset(-1)}`);
  await yesterdayRef.set({ m1_0: tick("Night Nurse") }); // written before change stamps existed
  await signInGuest(page, null, `/?emulator&patient=${id}`);
  const yesterday = page.locator("#history .history-day").nth(5);
  await expect(yesterday).toHaveAttribute("aria-label", /1 of 2 given$/, { timeout: 20000 });

  // Changed without a stamp (as a phone still on an older version would): not read again
  await yesterdayRef.delete();
  await page.reload();
  await expect(page.locator("#patient-name")).toHaveText("Cache Tracker", { timeout: 20000 });
  await expect(yesterday).toHaveAttribute("aria-label", /1 of 2 given$/);

  // A dose that synced late, stamped with the server's time: the next open reads that day again
  await yesterdayRef.set({ m1_0: tick("Night Nurse"), m1_1: tick("Late Nurse"), changedAt: FieldValue.serverTimestamp() });
  await page.reload();
  await expect(yesterday).toHaveAttribute("aria-label", /2 of 2 given$/, { timeout: 20000 });

  // Left open: it asks again when it comes back on screen after half an hour, not sooner
  await yesterdayRef.update({ m1_1: FieldValue.delete(), changedAt: FieldValue.serverTimestamp() });
  const comeBack = () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await comeBack();
  await page.waitForTimeout(1500);
  await expect(yesterday).toHaveAttribute("aria-label", /2 of 2 given$/);
  await page.clock.setSystemTime(Date.now() + 31 * 60000);
  await comeBack();
  await expect(yesterday).toHaveAttribute("aria-label", /1 of 2 given$/, { timeout: 20000 });

  // Today is followed live
  const todayCol = page.locator("#history .history-day.today");
  await expect(todayCol).toHaveAttribute("aria-label", /0 of 2 given$/);
  await admin().doc(`patients/${id}/days/${today()}`).set({ m1_0: tick("Day Nurse") });
  await expect(todayCol).toHaveAttribute("aria-label", /1 of 2 given$/);
});

// A phone asleep past midnight runs no timers; when it wakes, the app must follow the new day
test("a phone that wakes after midnight follows the new day's doses", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "data check, once is enough");
  watch(page);
  const [y, m, d] = today().split("-").map(Number);
  await page.clock.install({ time: new Date(y, m - 1, d, 23, 58) });
  const { Timestamp } = createRequire(path.join(CLEANUP, "package.json"))("firebase-admin/firestore");
  const id = `night${crypto.randomBytes(8).toString("hex")}`;
  await admin().doc(`patients/${id}`).set({
    patient: { name: "Night Tracker", pid: "NIG-HT1" }, ownerUid: "someone", builtinTabs: false,
    medicines: { m1: { name: "Aspirin", everyDays: 1, dosesPerDay: 1, startDate: dayOffset(-1), createdAt: Date.now() - 86400000 } },
  });
  await signInGuest(page, null, `/?emulator&patient=${id}`);
  await expect(status(page, 0)).toHaveText("Not taken yet", { timeout: 20000 });

  await page.clock.setSystemTime(new Date(y, m - 1, d + 1, 0, 5)); // asleep: no timers ran
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); // woken up
  await admin().doc(`patients/${id}/days/${dayOffset(1)}`).set({ m1_0: { by: "Morning Nurse", uid: "y", at: Timestamp.now() } });
  await expect(status(page, 0)).toHaveText(/^Given by Morning Nurse/, { timeout: 20000 });
});

// ---------- Loading, offline and installing ----------
test("someone who signed in before sees the tracker's outline while it loads", async ({ page }) => {
  watch(page);
  await signInGuest(page, "Outline Nurse");
  await addMedicine(page, "Outline Med");
  // Hold the database's answers back, so the loading state stays on screen
  const slow = async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => {});
  };
  await page.route("http://127.0.0.1:8085/**", slow);
  await page.reload();
  await expect(page.locator("#boot .skeleton")).toBeVisible();
  await expect(page.locator("#boot .boot-spinner")).toBeHidden();
  await page.unroute("http://127.0.0.1:8085/**", slow);
  await expect(page.locator("#progress-title")).toHaveText("Outline Med", { timeout: 30000 });
  await expect(page.locator("#boot")).toBeHidden();
});

// Playwright's offline mode doesn't reach the offline worker's own requests, so this test serves
// the site itself and really switches that server off
test("once opened online, the app opens without a connection", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once is enough");
  const port = 3100 + Math.floor(Math.random() * 800);
  const server = spawn("python", ["-m", "http.server", String(port), "--bind", "localhost"], { cwd: path.join(__dirname, ".."), stdio: "ignore" });
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  try {
    // (Node's fetch trips over this server's way of closing connections, so plain http)
    const up = () => new Promise((resolve) => require("http").get(`http://localhost:${port}/`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    }).on("error", () => resolve(false)));
    await expect.poll(up, { timeout: 15000 }).toBe(true);
    watch(page);
    await signInGuest(page, "Offline Nurse", `http://localhost:${port}/?emulator`);
    await addMedicine(page, "Offline Med");
    // The offline worker took over and keeps the app's files
    await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 });
    await expect.poll(() => page.evaluate(async () => !!(await caches.match("app.js?v=dev"))), { timeout: 20000 }).toBe(true);

    server.kill();
    await stopped;
    await context.setOffline(true); // the database too: the tracker comes from the phone's own copy
    await page.reload();
    await expect(page.locator("#progress-title")).toHaveText("Offline Med", { timeout: 30000 });
  } finally {
    server.kill();
    await context.setOffline(false);
  }
});

test("the app offers to install itself; Not now puts the card away, Info keeps the button", async ({ page }) => {
  watch(page);
  await signInGuest(page, "Install Nurse");
  await addMedicine(page, "Install Med");
  // The browser's install offer, as Chrome sends it
  const offer = () => page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = () => { window.installPrompted = (window.installPrompted ?? 0) + 1; return Promise.resolve(); };
    window.dispatchEvent(e);
  });
  await offer();
  await expect(page.locator("#install-card")).toBeVisible();
  await page.locator("#install-card-btn").click();
  expect(await page.evaluate(() => window.installPrompted)).toBe(1);
  await expect(page.locator("#install-card")).toBeHidden(); // the browser's dialog opens only once per offer

  await offer();
  await page.locator("#install-card-close").click();
  await expect(page.locator("#install-card")).toBeHidden();
  await page.reload();
  await expect(page.locator("#progress-title")).toHaveText("Install Med", { timeout: 20000 });
  await offer();
  await expect(page.locator("#install-card")).toBeHidden(); // Not now is remembered
  await page.locator("#settings-btn").click();
  await page.locator("#info-open").click();
  await expect(page.locator("#install-btn")).toBeVisible();
});

// ---------- Settings ----------
test("Settings shows the account, keeps the phone's theme, and signs out from the bottom", async ({ page }) => {
  watch(page);
  await signInGuest(page, "Settings Nurse");
  await page.locator("#settings-btn").click();
  await expect(page.locator("#settings-account")).toHaveText("Settings Nurse · Guest");
  await expect(page.locator("#theme-current")).toHaveText("Indigo · Dark");

  await page.locator("#theme-open").click();
  await page.getByRole("button", { name: /^Night Shift/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "night-shift");
  await page.locator("#themes-back").click();
  await expect(page.locator("#themes-screen")).toBeHidden();
  await expect(page.locator("#settings-screen")).toBeVisible(); // Back closes only the Theme screen
  await expect(page.locator("#theme-current")).toHaveText("Night Shift · Dark");

  await page.locator("#signout-btn").click();
  await expect(page.locator("#welcome-card")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#settings-screen")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "night-shift"); // the theme belongs to the phone
});

// ---------- Push reminders ----------
test("closed-app reminders: Turn on stores this phone's subscription, Turn off removes it", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["notifications"] });
  const page = watch(await context.newPage());
  // A phone's push plumbing, minus the push service: subscribe() hands back a fixed subscription
  await page.addInitScript(() => {
    const sub = {
      endpoint: "https://push.example/sub-1",
      toJSON: () => ({ endpoint: "https://push.example/sub-1", keys: { p256dh: "pk", auth: "a" } }),
    };
    // The browser keeps a subscription across page loads; the stub does too
    let current = localStorage.getItem("_sub") ? sub : null;
    Object.defineProperty(ServiceWorkerRegistration.prototype, "pushManager", {
      get: () => ({
        getSubscription: async () => current,
        subscribe: async () => (localStorage.setItem("_sub", "1"), (current = sub)),
      }),
    });
  });
  await signInGuest(page, "Push Nurse");
  await addMedicine(page, "Push Med");
  await page.locator("#settings-btn").click();
  await expect(page.locator("#push-text")).toContainText("even when the app is closed");
  await page.locator("#push-on").click();
  await expect(page.locator("#push-text")).toContainText("On — this phone gets Push Nurse's");

  await page.reload(); // the subscription lives on the patient doc, not just in this page
  await expect(page.locator("#progress-title")).toHaveText("Push Med", { timeout: 20000 });
  await page.locator("#settings-btn").click();
  await expect(page.locator("#push-text")).toContainText("On — this phone gets");

  await page.locator("#push-off").click();
  await expect(page.locator("#push-text")).not.toContainText("On —");
  await context.close();
});

// ---------- Undo and confirm ----------
test("removing a medicine can be undone, and is gone for good otherwise", async ({ page }) => {
  watch(page);
  await signInGuest(page, "Remove Nurse");
  await addMedicine(page, "Keep Me");
  await addMedicine(page, "Remove Me");
  await page.locator("#remove-btn").click();
  await expect(page.locator("#tabs .tab-name")).toHaveText(["Keep Me"]);
  await page.locator("#toast-action").click();
  await expect(page.locator("#tabs .tab-name")).toHaveText(["Keep Me", "Remove Me"]);

  await page.locator("#tabs .tab", { hasText: "Remove Me" }).click();
  await page.locator("#remove-btn").click();
  await expect(page.locator("#toast-action")).toBeHidden({ timeout: 8000 }); // Undo window over
  await page.reload();
  await expect(page.locator("#tabs .tab-name")).toHaveText(["Keep Me"], { timeout: 20000 });
});

test("unsaved notes ask before being thrown away", async ({ page }) => {
  watch(page);
  await signInGuest(page, "Notes Nurse");
  await addMedicine(page, "Notes Med");
  await page.locator("#notes-btn").click();
  await page.locator("#notes-edit").click();
  await page.locator("#notes-input").fill("Give after food");
  await page.locator("#notes-close").click();
  await expect(page.locator("#confirm")).toBeVisible();
  await expect(page.locator("#confirm-title")).toHaveText("Discard changes?");
  await page.locator("#confirm-cancel").click();
  await expect(page.locator("#notes-input")).toHaveValue("Give after food");
  await page.locator("#notes-close").click();
  await page.locator("#confirm-ok").click();
  await expect(page.locator("#notes")).toBeHidden();
});

// ---------- Switching patient ----------
test("switch to another patient by PID, then back from the list", async ({ page, browser }) => {
  watch(page);
  await signInGuest(page, "Patient A");
  await addMedicine(page, "A's medicine");
  await pidOf(page);
  const other = await newPage(browser);
  await signInGuest(other, "Patient B");
  await addMedicine(other, "B's medicine");
  const pidB = await pidOf(other);

  await page.locator("#patient-btn").click();
  await page.locator("#patient-pid-input").fill(pidB.replace("-", "").toLowerCase());
  await page.locator("#patient-pid-form").getByRole("button", { name: "Open" }).click();
  await expect(page.locator("#patient-name")).toHaveText("Patient B", { timeout: 20000 });
  await expect(page.locator("#progress-title")).toHaveText("B's medicine");

  await page.locator("#patient-btn").click();
  await expect(page.locator("#patient-list .row-title")).toHaveText(["Patient B", "Patient A"]);
  await page.locator("#patient-list .row-main", { hasText: "Patient A" }).click();
  await expect(page.locator("#patient-name")).toHaveText("Patient A");
  await expect(page.locator("#progress-title")).toHaveText("A's medicine");
});

// ---------- Older trackers ----------
test("an older tracker's ticks move out of the patient doc", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "data check, once is enough");
  watch(page);
  const id = `legacy${crypto.randomBytes(8).toString("hex")}`;
  await admin().doc(`patients/${id}`).set({
    patient: { name: "Old Tracker", pid: "OLD-111" },
    ownerUid: "someone",
    builtinTabs: false,
    medicines: { m1: { name: "Aspirin", everyDays: 1, dosesPerDay: 2, startDate: today(), createdAt: Date.now() } },
    doses: { [today()]: { m1_0: true }, "2020-01-01": { m1_0: true } },
  });
  await signInGuest(page, null, `/?emulator&patient=${id}`);
  await expect(page.locator("#patient-name")).toHaveText("Old Tracker", { timeout: 20000 });
  await expect(status(page, 0)).toHaveText("Taken");
  await expect.poll(async () => (await admin().doc(`patients/${id}`).get()).get("doses"), { timeout: 15000 }).toBeUndefined();
  const moved = (await admin().doc(`patients/${id}/days/${today()}`).get()).data();
  expect(moved.m1_0).toBe(true);
  expect(moved.changedAt).toBeDefined(); // stamped, so other phones read it again
  expect((await admin().doc(`patients/${id}/days/2020-01-01`).get()).exists).toBe(false); // older than a week: dropped
});

// ---------- Nightly clean-up (cleanup/cleanup.js) ----------
test("the clean-up deletes only expired guest data, with its daily records", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "data check, once is enough");
  const db = admin();
  const { Timestamp } = createRequire(path.join(CLEANUP, "package.json"))("firebase-admin/firestore");
  const tag = crypto.randomBytes(6).toString("hex");
  const past = Timestamp.fromMillis(Date.now() - 86400000);
  const later = Timestamp.fromMillis(Date.now() + 29 * 86400000);
  await db.doc(`patients/old${tag}0000000`).set({ expireAt: past });
  await db.doc(`patients/old${tag}0000000/days/2026-01-01`).set({ m1_0: true });
  await db.doc(`patients/new${tag}0000000`).set({ expireAt: later });
  await db.doc(`patients/ggl${tag}0000000`).set({ patient: { name: "Google user" } });
  await db.doc(`pids/O${tag.slice(0, 2)}-${tag.slice(2, 5)}`).set({ patientId: `old${tag}0000000`, expireAt: past });
  await db.doc(`users/old${tag}`).set({ patientId: `old${tag}0000000`, expireAt: past });

  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = JSON.stringify({
    type: "service_account", project_id: PROJECT, client_email: `test@${PROJECT}.iam.gserviceaccount.com`,
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  });
  const run = (dry) => execFileSync("node", ["cleanup.js"], {
    cwd: CLEANUP, encoding: "utf8", env: { ...process.env, FIREBASE_SERVICE_ACCOUNT: key, DRY_RUN: dry ? "1" : "0" },
  });
  expect(run(true)).toContain("Dry run: some expired guest data");
  expect((await db.doc(`patients/old${tag}0000000`).get()).exists).toBe(true); // dry run deletes nothing
  run(false);
  expect((await db.doc(`patients/old${tag}0000000`).get()).exists).toBe(false);
  expect((await db.doc(`patients/old${tag}0000000/days/2026-01-01`).get()).exists).toBe(false);
  expect((await db.doc(`pids/O${tag.slice(0, 2)}-${tag.slice(2, 5)}`).get()).exists).toBe(false);
  expect((await db.doc(`users/old${tag}`).get()).exists).toBe(false);
  expect((await db.doc(`patients/new${tag}0000000`).get()).exists).toBe(true);
  expect((await db.doc(`patients/ggl${tag}0000000`).get()).exists).toBe(true);
});

// ---------- Google names on old trackers (cleanup/rename-owners.js) ----------
test("rename-owners puts each Google account's name on its tracker", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "data check, once is enough");
  const db = admin();
  const req = createRequire(path.join(CLEANUP, "package.json"));
  const { getAuth } = req("firebase-admin/auth");
  const auth = getAuth(req("firebase-admin/app").getApps()[0]);
  const tag = crypto.randomBytes(6).toString("hex");
  const google = (uid, displayName) => ({
    uid, displayName, email: `${uid}@example.com`,
    providerData: [{ uid: `g${uid}`, providerId: "google.com", displayName, email: `${uid}@example.com` }],
  });
  const r = await auth.importUsers([
    google(`own${tag}`, "Asha Verma"), google(`hom${tag}`, "Home Owner"), google(`nur${tag}`, "Nurse Two"),
    google(`aa${tag}`, "Shared A"), google(`bb${tag}`, "Shared B"), google(`pat${tag}`, "Real Patient"),
  ]);
  expect(r.failureCount).toBe(0);
  const guest = await auth.createUser({ uid: `gst${tag}` }); // no provider: a guest
  const p = (n) => `${n}${tag}00000000`;

  await db.doc(`patients/${p("own")}`).set({ patient: { name: "anuj typed", pid: "AAA-AAA" }, ownerUid: `own${tag}` });
  await db.doc(`patients/${p("gst")}`).set({ patient: { name: "Old typed" }, ownerUid: guest.uid });
  await db.doc(`patients/${p("non")}`).set({ patient: { name: "No owner" } });
  await db.doc(`patients/${p("two")}`).set({ patient: { name: "Two homes" } });
  await db.doc(`patients/${p("oth")}`).set({ patient: { name: "Guest tracker" }, ownerUid: guest.uid });
  // Claimed by a nurse who opened it first (older app versions): the patient's own account wins
  await db.doc(`patients/${p("vis")}`).set({ patient: { name: "Nurse Two" }, ownerUid: `nur${tag}` });
  await db.doc(`patients/${p("vno")}`).set({ patient: { name: "Typed" }, ownerUid: `nur${tag}` });
  await db.doc(`users/pat${tag}`).set({ patientId: p("vis") });
  await db.doc(`users/own${tag}`).set({ patientId: p("own"), recent: { [p("own")]: { name: "anuj typed", pid: "AAA-AAA", at: 1 } } });
  await db.doc(`users/hom${tag}`).set({ patientId: p("gst") });
  await db.doc(`users/nur${tag}`).set({ patientId: p("non"), recent: { [p("own")]: { name: "anuj typed", at: 2 } } });
  await db.doc(`users/aa${tag}`).set({ patientId: p("two") });
  await db.doc(`users/bb${tag}`).set({ patientId: p("two") });

  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = JSON.stringify({
    type: "service_account", project_id: PROJECT, client_email: `test@${PROJECT}.iam.gserviceaccount.com`,
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  });
  const run = (dry) => execFileSync("node", ["rename-owners.js"], {
    cwd: CLEANUP, encoding: "utf8", env: { ...process.env, FIREBASE_SERVICE_ACCOUNT: key, DRY_RUN: dry ? "1" : "0" },
  });
  const get = async (id) => (await db.doc(`patients/${p(id)}`).get()).data();
  expect(run(true)).toContain("Dry run: some names would change");
  expect((await get("own")).patient.name).toBe("anuj typed"); // dry run changes nothing

  run(false);
  expect(await get("own")).toEqual({ patient: { name: "Asha Verma", pid: "AAA-AAA" }, ownerUid: `own${tag}` });
  expect(await get("gst")).toEqual({ patient: { name: "Home Owner" }, ownerUid: `hom${tag}` }); // taken from the guest
  expect(await get("non")).toEqual({ patient: { name: "Nurse Two" }, ownerUid: `nur${tag}` });
  expect(await get("two")).toEqual({ patient: { name: "Two homes" } }); // ambiguous: left alone
  expect(await get("oth")).toEqual({ patient: { name: "Guest tracker" }, ownerUid: guest.uid });
  expect(await get("vis")).toEqual({ patient: { name: "Real Patient" }, ownerUid: `pat${tag}` });
  expect(await get("vno")).toEqual({ patient: { name: "Typed" }, ownerUid: `nur${tag}` }); // nobody's own: left alone
  expect((await db.doc(`users/own${tag}`).get()).get("recent")).toEqual({ [p("own")]: { name: "Asha Verma", pid: "AAA-AAA", at: 1 } });
  expect((await db.doc(`users/nur${tag}`).get()).get("recent")).toEqual({ [p("own")]: { name: "Asha Verma", at: 2 } });
});

// ---------- Table of Google accounts (cleanup/list-users.js) ----------
test("list-users tabulates Google accounts with their own tracker", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "data check, once is enough");
  const db = admin();
  const req = createRequire(path.join(CLEANUP, "package.json"));
  const auth = req("firebase-admin/auth").getAuth(req("firebase-admin/app").getApps()[0]);
  const tag = crypto.randomBytes(6).toString("hex");
  const uid = `lst${tag}`;
  await auth.importUsers([{ uid, displayName: "Table, \"Person\"", email: `${uid}@example.com`,
    providerData: [{ uid: `g${uid}`, providerId: "google.com", email: `${uid}@example.com` }] }]);
  await db.doc(`users/${uid}`).set({ patientId: `${uid}000000000` });
  await db.doc(`patients/${uid}000000000`).set({ patient: { name: "Table Tracker", pid: "TBL-123" }, ownerUid: uid,
    medicines: { m1: { name: "Dolo" }, m2: { name: "Pan" } } });

  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keyFile = testInfo.outputPath("key.json");
  require("fs").writeFileSync(keyFile, JSON.stringify({
    type: "service_account", project_id: PROJECT, client_email: `test@${PROJECT}.iam.gserviceaccount.com`,
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  }));
  const cwd = testInfo.outputPath("run");
  require("fs").mkdirSync(cwd, { recursive: true });
  const out = execFileSync("node", [path.join(CLEANUP, "list-users.js"), keyFile], { cwd, encoding: "utf8" });
  expect(out).toContain("Saved users.csv");
  const csv = require("fs").readFileSync(path.join(cwd, "users.csv"), "utf8");
  expect(csv).toContain(`"Table, ""Person""","${uid}@example.com"`);
  expect(csv).toContain(`"Table Tracker","TBL-123","2","yes"`);
});

// ---------- Google Sheet report (cleanup/sheet-report.js --json) ----------
test("sheet-report builds the tables, then re-reads only what was used since", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "data check, once is enough");
  const fs = require("fs");
  const db = admin();
  const req = createRequire(path.join(CLEANUP, "package.json"));
  const auth = req("firebase-admin/auth").getAuth(req("firebase-admin/app").getApps()[0]);
  const { Timestamp } = req("firebase-admin/firestore");
  const tag = crypto.randomBytes(6).toString("hex");
  const g = `shg${tag}`, q = `shq${tag}`;
  await auth.importUsers([{ uid: g, displayName: "=Sheet Person", email: `${g}@example.com`,
    metadata: { creationTime: new Date().toUTCString(), lastSignInTime: new Date().toUTCString() },
    providerData: [{ uid: `x${g}`, providerId: "google.com", email: `${g}@example.com` }] }]);
  await auth.createUser({ uid: q, displayName: "Guesty" });
  await db.doc(`users/${g}`).set({ patientId: `${g}00000000`, recent: { a: {}, b: {} } });
  await db.doc(`patients/${g}00000000`).set({ patient: { name: "Sheet Tracker", pid: "+HT-123" }, ownerUid: g,
    builtinTabs: false, medicines: { m1: { name: "Dolo" } } });
  await db.doc(`patients/${g}00000000/days/${indiaToday()}`).set({ m1_0: { by: "Sheet Person", uid: g, at: Timestamp.now() }, changedAt: Timestamp.now() });
  await db.doc(`patients/${q}00000000`).set({ patient: { name: "Guest Tracker", pid: "GST-123" }, ownerUid: q,
    builtinTabs: false, expireAt: Timestamp.fromMillis(Date.now() + 5 * 86400000) });
  await db.doc(`patients/${q}00000000/days/2020-01-05`).set({ m1_0: true }); // long before this week

  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keyFile = testInfo.outputPath("key.json");
  fs.writeFileSync(keyFile, JSON.stringify({
    type: "service_account", project_id: PROJECT, client_email: `test@${PROJECT}.iam.gserviceaccount.com`,
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  }));
  const stateFile = testInfo.outputPath("state.json");
  const run = () => JSON.parse(execFileSync("node", ["sheet-report.js", keyFile, "--json", "--state", stateFile], { cwd: CLEANUP, encoding: "utf8" }));
  // Moves the last run's time (the tests run alongside others, so a full read is never asked for)
  const lastRunAt = (ms) => {
    const rows = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    const meta = JSON.parse(rows[0][1]);
    Object.assign(meta, { lastRun: ms, fullAt: Date.now(), needFull: false });
    rows[0][1] = JSON.stringify(meta);
    fs.writeFileSync(stateFile, JSON.stringify(rows));
  };
  const personIn = (out) => out.people.find((r) => r[1] === `'${g}@example.com`);
  const guestIn = (out) => out.guests.find((r) => r[2] === "'GST-123");

  // First run: reads everything
  const out = run();
  expect(out.mode).toBe("full");
  const person = personIn(out);
  expect(person.slice(0, 2)).toEqual(["'=Sheet Person", `'${g}@example.com`]); // typed text never runs as a formula
  expect(person.slice(4, 10)).toEqual([0, "'Sheet Tracker", "'+HT-123", 1, 1, 2]);
  expect(person[10]).toBe(`=HYPERLINK("https://console.firebase.google.com/project/${PROJECT}/firestore/databases/-default-/data/~2Fusers~2F${g}","${g}")`);
  expect(person[11]).toContain(`~2Fpatients~2F${g}00000000`);
  const guest = guestIn(out);
  expect(guest[0]).toBe("'Guesty");
  expect(guest.slice(4, 9)).toEqual(["2020-01-05", 0, 0, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 5]); // last dose found
  expect(out.guests.some((r) => r[2] === "'+HT-123")).toBe(false); // Google trackers aren't guests
  const todayRow = out.daily[out.daily.length - 1];
  expect(out.daily[0][0]).toBe("Date");
  expect(todayRow[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/); // India date, may differ from this machine's
  expect(todayRow[1]).toBeGreaterThanOrEqual(1);
  expect(out.daily.slice(1).slice(-2).reduce((n, r) => n + r[7], 0)).toBeGreaterThanOrEqual(1);

  // Nobody used the app since the last run: (almost) nothing is read, and the tables stay the same
  await db.doc(`patients/${g}00000000`).update({ "patient.name": "Renamed Meanwhile" });
  lastRunAt(Date.now() + 2 * 3600000);
  const quiet = run();
  expect(quiet.mode).toBe("update");
  expect(quiet.reads).toBeLessThan(out.reads);
  expect(personIn(quiet)).toEqual(person);
  expect(guestIn(quiet)).toEqual(guest);

  // The account used it since: its tracker is read again, with today's new dose
  await db.doc(`patients/${g}00000000/days/${indiaToday()}`).update({ m1_1: { by: "Sheet Person", uid: g, at: Timestamp.now() }, changedAt: Timestamp.now() });
  await db.doc(`patients/${q}00000001`).set({ patient: { name: "New Guest", pid: "NEW-123" }, ownerUid: q,
    builtinTabs: false, expireAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) });
  lastRunAt(Date.now() - 10 * 60000);
  const used = run();
  expect(used.mode).toBe("update");
  expect(personIn(used).slice(5, 9)).toEqual(["'Renamed Meanwhile", "'+HT-123", 1, 2]);
  expect(used.guests.find((r) => r[2] === "'NEW-123")?.[1]).toBe("'New Guest"); // a guest's new tracker shows up
  expect(guestIn(used).slice(4, 7)).toEqual(["2020-01-05", 0, 0]); // kept from before
});

// ---------- Medicines screen: folders and dragging ----------
async function makeFolder(page, name, meds) {
  await page.locator("#folder-new").click();
  await page.locator("#folder-name-input").fill(name);
  for (const m of meds) await page.locator(".pick-row", { hasText: m }).click();
  await page.locator("#folder-form").getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#folder-dialog")).toBeHidden();
}

// Folder and medicine names top to bottom, folders in brackets
async function tree(page) {
  return page.locator("#folder-list").evaluate((list) => [...list.querySelectorAll(".tree-item > .row .row-title, .group-label, .med-row .row-title")]
    .filter((el) => el.getClientRects().length) // only what's on screen
    .map((el) => (el.closest(".med-row") ? el.textContent : `[${el.textContent}]`)));
}

async function dragOnto(page, med, target) {
  const from = await page.locator(".med-row", { hasText: med }).locator(".drag-handle").boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const steps = 15;
  for (let n = 1; n <= steps; n++) {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + (to.y + to.height / 2 - from.y - from.height / 2) * n / steps);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

test("folders hold each medicine once; drag or arrow keys move it between them", async ({ page }) => {
  watch(page);
  await signInGuest(page, "Folder Nurse");
  for (const m of ["Dolo 650", "Pan 40", "Thyronorm 50"]) await addMedicine(page, m);
  await page.locator("#menu-btn").click();
  await makeFolder(page, "Morning", ["Dolo 650", "Pan 40"]);
  await makeFolder(page, "Night", []);
  expect(await tree(page)).toEqual(["[Meds]", "[Morning]", "Dolo 650", "Pan 40", "[Night]", "[Not in a folder]", "Thyronorm 50"]);

  await dragOnto(page, "Pan 40", page.locator(".tree-item > .row", { hasText: "Night" }));
  expect(await tree(page)).toEqual(["[Meds]", "[Morning]", "Dolo 650", "[Night]", "Pan 40", "[Not in a folder]", "Thyronorm 50"]);

  await page.locator(".med-row", { hasText: "Thyronorm 50" }).locator(".drag-handle").focus();
  await page.keyboard.press("ArrowUp"); // from "Not in a folder" into the end of Night
  await expect(page.locator(".med-row", { hasText: "Thyronorm 50" }).locator(".drag-handle")).toBeFocused();
  expect(await tree(page)).toEqual(["[Meds]", "[Morning]", "Dolo 650", "[Night]", "Pan 40", "Thyronorm 50"]);

  // Ticking Dolo for a new folder moves it out of Morning
  await page.locator("#folder-new").click();
  await expect(page.locator(".pick-row", { hasText: "Dolo 650" }).locator(".pick-where")).toHaveText("in Morning");
  await page.locator("#folder-name-input").fill("Evening");
  await page.locator(".pick-row", { hasText: "Dolo 650" }).click();
  await page.locator("#folder-form").getByRole("button", { name: "Save" }).click();
  expect(await tree(page)).toEqual(["[Meds]", "[Morning]", "[Night]", "Pan 40", "Thyronorm 50", "[Evening]", "Dolo 650"]);

  // Opening a folder shows only its medicines, with Home back to all
  await page.locator(".tree-item > .row .row-main", { hasText: "Night" }).click();
  await expect(page.locator("#folder-name")).toHaveText("Night");
  await expect(page.locator("#tabs .tab-name")).toHaveText(["Pan 40", "Thyronorm 50"]);
  await page.locator("#home-btn").click();
  await expect(page.locator("#folder-bar")).toBeHidden();
  await expect(page.locator("#tabs .tab-name")).toHaveCount(3);

  // Survives a reload (saved, not just on screen)
  await page.reload();
  await page.locator("#menu-btn").click();
  expect(await tree(page)).toEqual(["[Meds]", "[Morning]", "[Night]", "Pan 40", "Thyronorm 50", "[Evening]", "Dolo 650"]);
});

test("deleting a folder can be undone; its medicines stay", async ({ page }) => {
  watch(page);
  await signInGuest(page, "Folder Undo");
  await addMedicine(page, "Dolo 650");
  await page.locator("#menu-btn").click();
  await makeFolder(page, "Morning", ["Dolo 650"]);
  await page.getByRole("button", { name: "Delete folder Morning" }).click();
  expect(await tree(page)).toEqual(["[Meds]", "Dolo 650"]);
  await page.locator("#toast-action").click();
  expect(await tree(page)).toEqual(["[Meds]", "[Morning]", "Dolo 650"]);
});

// Google sign-in through the Auth emulator's own popup (it stands in for Google's)
async function signInGoogle(page, displayName, email) {
  await page.goto("/?emulator");
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.locator("#login-btn").click()]);
  await popup.waitForLoadState();
  // A click before the window's script is ready does nothing, so click until the form opens
  await expect(async () => {
    await popup.getByText("Add new account").click();
    await expect(popup.locator("#display-name-input")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await popup.locator("#display-name-input").fill(displayName);
  await popup.locator("#email-input").fill(email);
  await popup.getByRole("button", { name: /Sign in with Google/ }).click();
}

test("a Google account's own tracker shows the Google name, even an old one with a typed name", async ({ browser }, info) => {
  // The emulator's stand-in Google window hides its form at phone size; the app side is the same
  test.skip(info.project.name === "phone", "desktop only: the emulator's sign-in window");
  const page = await newPage(browser);
  const email = `r${crypto.randomUUID().slice(0, 8)}@example.com`;
  await signInGoogle(page, "Real Name", email);
  await expect(page.locator("#patient-name")).toHaveText("Real Name", { timeout: 20000 });
  const id = new URL(page.url()).searchParams.get("patient");

  // An older tracker: owned by this account, but still named what was typed back then
  // (the page shows the name before its save reaches the server, so wait for the save first)
  await expect.poll(async () => (await admin().doc(`patients/${id}`).get()).exists, { timeout: 20000 }).toBe(true);
  await admin().doc(`patients/${id}`).update({ "patient.name": "Typed Name" });
  await expect(page.locator("#patient-name")).toHaveText("Typed Name");
  await page.reload();
  await expect(page.locator("#patient-name")).toHaveText("Real Name", { timeout: 20000 });
  await expect.poll(async () => (await admin().doc(`patients/${id}`).get()).get("patient.name"), { timeout: 20000 })
    .toBe("Real Name");

  // Someone else's tracker opened by link keeps its own name
  const other = await newPage(browser);
  await signInGuest(other, "Other Patient");
  await other.locator(".fab").click(); // a guest's tracker is saved on the first medicine
  await other.locator("#add-name").fill("Pan 40");
  await other.keyboard.press("Escape");
  await other.locator("#add-form").getByRole("button", { name: "Add medicine" }).click();
  await expect(other).toHaveURL(/patient=/, { timeout: 20000 });
  const otherId = new URL(other.url()).searchParams.get("patient");
  await expect.poll(async () => (await admin().doc(`patients/${otherId}`).get()).exists, { timeout: 20000 }).toBe(true);
  await page.goto(`/?emulator&patient=${otherId}`);
  await expect(page.locator("#patient-name")).toHaveText("Other Patient", { timeout: 20000 });
  await page.waitForTimeout(1000);
  expect((await admin().doc(`patients/${otherId}`).get()).get("patient.name")).toBe("Other Patient");

  // A visitor never claims or renames an old unowned tracker, nor one it claimed in an older version
  admin();
  const req = createRequire(path.join(CLEANUP, "package.json"));
  const { uid } = await req("firebase-admin/auth").getAuth(req("firebase-admin/app").getApps()[0]).getUserByEmail(email);
  for (const [name, extra] of [["Old Unowned", {}], ["Claimed Earlier", { ownerUid: uid }]]) {
    const vid = `v${crypto.randomBytes(10).toString("hex")}`;
    await admin().doc(`patients/${vid}`).set({ patient: { name }, ...extra });
    await page.goto(`/?emulator&patient=${vid}`);
    await expect(page.locator("#patient-name")).toHaveText(name, { timeout: 20000 });
    await page.waitForTimeout(1000);
    expect((await admin().doc(`patients/${vid}`).get()).data()).toEqual({ patient: expect.objectContaining({ name }), ...extra });
  }
});
