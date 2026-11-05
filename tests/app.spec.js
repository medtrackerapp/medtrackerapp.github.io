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
  // With the emulators running (npm run test:emulator, and on GitHub) the app uses them too:
  // GitHub only has a placeholder config, whose fake key Google's sign-in service rejects.
  await page.goto(process.env.FIREBASE_AUTH_EMULATOR_HOST ? "/?emulator" : "/");
  await expect(page.locator("#welcome")).toBeVisible({ timeout: 15000 });
});

test.afterEach(() => {
  expect(problems, "no script or console errors").toEqual([]);
});

// Dark is the default; light is what the moon/sun button saves.
async function useTheme(page, theme) {
  await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
  await page.waitForTimeout(400); // let the theme fade finish before checking contrast
}

// Waits for fade-ins to finish, so contrast is checked on the final colours, not mid-fade.
async function settle(page) {
  await page.waitForFunction(() => document.getAnimations()
    .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
}

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
      await useTheme(page, theme);
      if (screen === "attendant") await page.getByRole("button", { name: "Attendant" }).click();
      await settle(page);
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

  test("dark mode is the default, even on a phone set to light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("a saved light theme applies before the page paints", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => localStorage.setItem("medicineTracker:theme", "light"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

// ---------- Medicine name suggestions ----------
// The add screen is behind sign-in, so these show it without signing in (nothing is saved).
test.describe("medicine name suggestions", () => {
  const input = (page) => page.locator("#add-name");
  const list = (page) => page.locator("#add-suggest");
  const options = (page) => page.getByRole("option");

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      document.body.classList.remove("locked");
      document.getElementById("add-btn").click();
    });
    await expect(page.locator("#add-screen")).toBeVisible();
  });

  test("the list is big, with no repeats and every name fits the box", async ({ page }) => {
    const names = await page.evaluate(async () => (await import("/medicines.js")).MEDICINES.map((m) => m.name));
    expect(names.length).toBeGreaterThan(2000);
    // "Sat-Isabgol" and "Sat Isabgol" count as the same; dots stay so "12.5" isn't "125"
    const key = (n) => n.toLowerCase().replace(/[^a-z0-9.]/g, "");
    const seen = new Map();
    const repeats = names.filter((n) => seen.has(key(n)) || !seen.set(key(n), n));
    expect(repeats).toEqual([]);
    expect(names.filter((n) => n.length > 40)).toEqual([]);
    expect(names.filter((n) => !n)).toEqual([]);
  });

  test("nothing shows until they type", async ({ page }) => {
    await expect(input(page)).toBeFocused();
    await expect(list(page)).toBeHidden();
  });

  test("typing shows matches, best first", async ({ page }) => {
    await input(page).pressSequentially("dolo");
    await expect(list(page)).toBeVisible();
    await expect(options(page).first()).toContainText("Dolo");
    await expect(input(page)).toHaveAttribute("aria-expanded", "true");
  });

  test("searching what's in it finds brands too", async ({ page }) => {
    await input(page).pressSequentially("paracetamol");
    await expect(options(page).first()).toContainText("Paracetamol");
    await expect(list(page).getByRole("option", { name: /^Dolo 650/ })).toHaveCount(1);
    await expect(list(page).getByRole("option", { name: /^Calpol 500/ })).toHaveCount(1);
  });

  test("shows 10 at a time and scrolls for the rest", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await input(page).pressSequentially("a");
    expect(await options(page).count()).toBeGreaterThan(10);
    const { visible, scrollable } = await list(page).evaluate((ul) => ({
      visible: Math.round(ul.clientHeight / ul.firstElementChild.offsetHeight),
      scrollable: ul.scrollHeight > ul.clientHeight,
    }));
    expect(visible).toBe(10);
    expect(scrollable).toBe(true);
  });

  test("tapping a suggestion fills the name", async ({ page }) => {
    await input(page).pressSequentially("pan 4");
    await list(page).getByRole("option", { name: /^Pan 40/ }).click();
    await expect(input(page)).toHaveValue("Pan 40");
    await expect(list(page)).toBeHidden();
    await expect(page.locator("#add-summary")).toContainText("Pan 40");
  });

  test("arrow keys and Enter pick one; Escape closes", async ({ page }) => {
    await input(page).pressSequentially("thyronorm");
    await input(page).press("ArrowDown");
    await expect(options(page).first()).toHaveAttribute("aria-selected", "true");
    await input(page).press("Enter");
    await expect(input(page)).toHaveValue("Thyronorm 12.5"); // numbers sort naturally
    await input(page).pressSequentially("x");
    await input(page).fill("");
    await input(page).pressSequentially("telma");
    await expect(list(page)).toBeVisible();
    await input(page).press("Escape");
    await expect(list(page)).toBeHidden();
  });

  test("any name can be typed, even one not on the list", async ({ page }) => {
    await input(page).pressSequentially("Grandma's ginger tea");
    await expect(list(page)).toBeHidden();
    await expect(input(page)).toHaveValue("Grandma's ginger tea");
    expect(await input(page).evaluate((el) => el.checkValidity())).toBe(true);
  });

  for (const theme of ["light", "dark"]) {
    test(`accessibility (WCAG 2.1 AA): suggestions open, ${theme}`, async ({ page }) => {
      await useTheme(page, theme);
      await input(page).pressSequentially("amlo");
      await input(page).press("ArrowDown");
      await settle(page);
      const results = await new AxeBuilder({ page }).include("#add-screen")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target).join(", ")})`)).toEqual([]);
    });
  }
});

// ---------- Add medicine form ----------
test.describe("add medicine form", () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      document.body.classList.remove("locked");
      document.getElementById("add-btn").click();
    });
    await expect(page.locator("#add-screen")).toBeVisible();
  });

  test("How often is spelled out in words", async ({ page }) => {
    const every = page.locator("#add-every");
    const words = page.locator("#add-every-unit");
    await expect(words).toHaveText("every day");
    for (const [n, text] of [["2", "every other day"], ["3", "every 3 days"], ["7", "once a week"], ["14", "every 2 weeks"]]) {
      await every.fill(n);
      await expect(words).toHaveText(text);
    }
    await every.fill("2");
    await expect(page.locator("#add-summary")).toContainText("1 dose every other day");
    await page.getByRole("button", { name: "More days apart" }).click();
    await expect(words).toHaveText("every 3 days");
  });
});
