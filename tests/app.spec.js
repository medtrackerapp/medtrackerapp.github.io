// Signed-out checks only: anything past sign-in would need a real Google account
// and would write to the live Firestore database.
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { HtmlValidate } = require("html-validate");
const fs = require("fs");
const path = require("path");

// Collect script errors and console errors for every test.
let problems;
test.beforeEach(async ({ page }) => {
  problems = [];
  page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
  page.on("console", (msg) => {
    // Missing files are reported below with their URL instead
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) {
      problems.push(`console error: ${msg.text()}`);
    }
  });
  page.on("response", (res) => {
    if (res.status() >= 400) problems.push(`${res.status()}: ${res.url()}`);
  });
  await page.goto("/");
  await expect(page.locator("#welcome")).toBeVisible({ timeout: 15000 });
});

test.afterEach(() => {
  expect(problems, "no script or console errors").toEqual([]);
});

// ---------- Loading ----------
test.describe("loading", () => {
  test("signed out: spinner gives way to the welcome screen", async ({ page }) => {
    await expect(page.locator("#boot")).toBeHidden();
    await expect(page.locator("body")).toHaveClass(/locked/);
    await expect(page.locator(".app-header")).toBeHidden();
  });

  test("welcome screen shows every way in", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Medicine Tracker" })).toBeVisible();
    for (const name of ["Log in", "Sign up", "Attendant", "Just looking? Continue as guest"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
  });
});

// ---------- Attendant ----------
test.describe("attendant", () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole("button", { name: "Attendant" }).click();
  });

  test("opens the PID form with the box focused", async ({ page }) => {
    await expect(page.locator("#pid-form")).toBeVisible();
    await expect(page.locator("#welcome-card")).toBeHidden();
    await expect(page.locator("#pid-input")).toBeFocused();
  });

  test("adds the dash and capitals while typing", async ({ page }) => {
    const input = page.locator("#pid-input");
    await input.pressSequentially("abc");
    await expect(input).toHaveValue("ABC");
    await input.pressSequentially("d#3");
    await expect(input).toHaveValue("ABC-D#3");
    await input.pressSequentially("x"); // 7th character is dropped
    await expect(input).toHaveValue("ABC-D#3");
  });

  test("backspace removes the dash cleanly", async ({ page }) => {
    const input = page.locator("#pid-input");
    await input.pressSequentially("abcd");
    await expect(input).toHaveValue("ABC-D");
    await input.press("Backspace");
    await expect(input).toHaveValue("ABC");
    await input.press("Backspace");
    await expect(input).toHaveValue("AB");
  });

  test("a typed dash doesn't double up", async ({ page }) => {
    const input = page.locator("#pid-input");
    await input.pressSequentially("abc-def");
    await expect(input).toHaveValue("ABC-DEF");
  });

  test("pasting works with or without the dash", async ({ page }) => {
    const input = page.locator("#pid-input");
    await input.fill("k7#qp@");
    await expect(input).toHaveValue("K7#-QP@");
  });

  test("an invalid PID is refused before signing in", async ({ page }) => {
    // O, 0, 1 and I are left out of PIDs on purpose
    await page.locator("#pid-input").fill("O01I");
    await page.getByRole("button", { name: "Enter" }).click();
    await expect(page.locator("#toast")).toContainText("A PID has 6 characters");
    await expect(page.locator("#pid-form")).toBeVisible();
  });

  test("Back returns to the welcome screen", async ({ page }) => {
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator("#welcome-card")).toBeVisible();
    await expect(page.locator("#pid-form")).toBeHidden();
  });
});

// ---------- Standards ----------
test.describe("standards", () => {
  test("page basics: language, title, viewport", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Medicine Tracker");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /width=device-width/);
  });

  // "standard" checks conformance to the HTML spec, not style preferences like <input />.
  test("index.html is valid HTML", async () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const report = await new HtmlValidate({ extends: ["html-validate:standard"] }).validateString(html);
    const messages = report.results.flatMap((r) => r.messages.map((m) => `line ${m.line}: ${m.message} (${m.ruleId})`));
    expect(messages).toEqual([]);
  });

  test("has a site icon (otherwise browsers hit a 404 for /favicon.ico)", async ({ page }) => {
    await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
  });

  for (const [screen, theme] of [["welcome", "light"], ["welcome", "dark"], ["attendant", "light"], ["attendant", "dark"]]) {
    test(`accessibility (WCAG 2.1 AA): ${screen} screen, ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.waitForTimeout(400); // let the theme fade finish before checking contrast
      if (screen === "attendant") await page.getByRole("button", { name: "Attendant" }).click();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const found = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target).join(", ")})`);
      expect(found).toEqual([]);
    });
  }

  test("no sideways scrolling on a small phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("buttons are big enough to tap (at least 44px tall)", async ({ page }) => {
    for (const name of ["Log in", "Sign up", "Attendant"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test("dark mode follows the phone setting", async ({ page }) => {
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.emulateMedia({ colorScheme: "light" });
    const light = await bg();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(bg).not.toBe(light); // the background fades over 0.3s
  });

  test("saved dark theme applies before the page paints", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("medicineTracker:theme", "dark"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
