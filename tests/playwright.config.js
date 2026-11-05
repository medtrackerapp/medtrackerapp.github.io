// Runs the app from the project folder over HTTP (ES modules need it) in the installed Chrome.
// A real firebase-config.js must be present, as for local development.
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  // GitHub's machines are slower: more time per test, and one retry before calling it a failure.
  // The "github" reporter turns failures into annotations on the run, readable without the logs.
  timeout: process.env.CI ? 60000 : 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
  },
  webServer: {
    command: "python -m http.server 3000 --bind localhost",
    cwd: "..",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "phone", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
});
