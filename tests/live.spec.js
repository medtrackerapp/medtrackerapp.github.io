// End-to-end against the real Firebase project: a guest makes a tracker, then an attendant
// opens it by PID on a fresh browser. It writes a small "Test Bot" tracker each run (the rules
// don't allow deleting patients), so it only runs when asked: LIVE=1 npx playwright test live
const { test, expect } = require("@playwright/test");

test.skip(!process.env.LIVE, "set LIVE=1 to run against the real database");
test.setTimeout(90000);

const NOTE = "Give after food (test note)";
const MEDICINE = "Test medicine";

test("attendant on a fresh phone sees the patient's notes and schedule", async ({ browser }) => {
  // ---------- Guest makes a tracker with one medicine and a note ----------
  const owner = await (await browser.newContext()).newPage();
  await owner.goto("/");
  await owner.getByRole("button", { name: "Just looking? Continue as guest" }).click();
  await owner.locator("#name-input").fill("Test Bot");
  await owner.getByRole("button", { name: "Continue" }).click();
  await expect(owner.locator("#patient-name")).toHaveText("Test Bot", { timeout: 20000 });

  await owner.locator("#add-btn").click();
  await owner.locator("#add-name").fill(MEDICINE);
  await owner.locator("#add-notes").fill(NOTE);
  await owner.locator("#add-form").getByRole("button", { name: "Add medicine" }).click();
  await expect(owner.locator("#tracker")).toBeVisible();

  await expect(owner.locator("#today-label")).toContainText("PID ", { timeout: 20000 });
  const pid = (await owner.locator("#today-label").textContent()).match(/PID (\S{3}-\S{3})/)[1];
  console.log(`test tracker PID: ${pid}`);

  // ---------- Attendant opens it by PID on a browser that has never seen it ----------
  const attendant = await (await browser.newContext()).newPage();
  await attendant.goto("/");
  await attendant.getByRole("button", { name: "Attendant" }).click();
  await attendant.locator("#pid-input").fill(pid);
  await attendant.getByRole("button", { name: "Enter" }).click();
  await expect(attendant.locator("#patient-name")).toHaveText("Test Bot", { timeout: 20000 });
  await expect(attendant.locator("#progress-title")).toHaveText(MEDICINE);

  // No tab tapped first: this is what used to fail
  await attendant.locator("#notes-btn").click();
  await expect(attendant.locator("#notes")).toBeVisible();
  await expect(attendant.locator("#notes-view")).toHaveText(NOTE);
  await attendant.locator("#notes-close").click();
  await expect(attendant.locator("#notes")).toBeHidden();

  await attendant.locator("#schedule-btn").click();
  await expect(attendant.locator("#schedule")).toBeVisible();
  await expect(attendant.locator("#schedule-title")).toHaveText(MEDICINE);
});
