// Capture the README screenshots from a running site (default: the live demo).
//   node e2e/capture-screenshots.mjs [baseUrl]
// Writes docs/screenshots/*.png at the repo root.
import { chromium } from "@playwright/test";

const base = process.argv[2] || "https://stock-market-intelligence-sable.vercel.app";
const out = new URL("../../docs/screenshots/", import.meta.url);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" });
await ctx.addInitScript(() => localStorage.setItem("si_seen_landing", "1"));
const page = await ctx.newPage();

// Dashboard: give the free-tier server time to wake and the cards to fill.
await page.goto(base + "/", { waitUntil: "networkidle", timeout: 120_000 }).catch(() => {});
await page.waitForTimeout(15_000);
await page.screenshot({ path: new URL("dashboard.png", out).pathname.replace(/^\/([A-Z]:)/, "$1") });

// Safe Invest: after-tax and after-inflation comparison.
await page.goto(base + "/invest", { waitUntil: "networkidle", timeout: 120_000 }).catch(() => {});
await page.getByRole("button", { name: "After Tax & Inflation" }).click();
await page.waitForTimeout(4_000);
await page.screenshot({ path: new URL("after-tax-returns.png", out).pathname.replace(/^\/([A-Z]:)/, "$1") });

await browser.close();
console.log("saved to", out.pathname);
