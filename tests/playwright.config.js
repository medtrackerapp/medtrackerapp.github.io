// Runs the app from the project folder over HTTP (ES modules need it) in the installed Chrome.
// A real firebase-config.js must be present, as for local development.
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  timeout: 30000,
  reporter: [["list"]],
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
