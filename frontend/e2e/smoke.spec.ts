import { test, expect, type Page } from "@playwright/test";

// Skip the one-time landing page and collect any uncaught JS errors.
async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => window.localStorage.setItem("si_seen_landing", "1"));
  await page.goto(path);
  return errors;
}

const PAGES: [string, RegExp][] = [
  ["/", /Market/i],
  ["/heatmap", /Market Heatmap/],
  ["/screener", /Screener/i],
  ["/watchlists", /Watchlists/],
  ["/alerts", /Price Alerts/],
  ["/paper", /Paper/i],
  ["/portfolio", /Portfolio/i],
  ["/invest", /Safe Investment Guide/],
  ["/learn", /Learn the Basics/],
  ["/study", /Market Study/],
  ["/stock/AAPL", /AAPL/],
];

for (const [path, heading] of PAGES) {
  test(`${path} renders without errors @phone`, async ({ page }) => {
    const errors = await open(page, path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(errors, `uncaught errors on ${path}`).toEqual([]);
  });
}

test("no page scrolls sideways on a phone @phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only check");
  for (const path of ["/", "/heatmap", "/screener", "/study", "/stock/AAPL", "/invest", "/learn", "/watchlists"]) {
    await open(page, path);
    await page.waitForLoadState("networkidle").catch(() => {});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} is wider than the screen`).toBeLessThanOrEqual(1);
  }
});

test("phone tab bar, More drawer and folded cards @phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only check");
  await open(page, "/");
  const tabs = page.getByRole("navigation", { name: "Quick" });
  await expect(tabs).toBeVisible();
  // Long list cards fold on a phone and open with "Show all".
  const showAll = page.getByRole("button", { name: /Show all/ }).first();
  await expect(showAll).toBeVisible();
  await showAll.click();
  await expect(page.getByRole("button", { name: /Show less/ }).first()).toBeVisible();
  // Every page is reachable from More.
  await tabs.getByRole("button", { name: "All pages" }).click();
  await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Compare Stocks" }).click();
  await expect(page).toHaveURL(/\/compare/);
});

test("create a watchlist and add a stock", async ({ page }) => {
  await open(page, "/watchlists");
  await page.getByPlaceholder(/Watchlist name/).fill("E2E list");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "Expand" }).first().click();
  const add = page.getByPlaceholder(/Add ticker/);
  await add.fill("AAPL");
  await add.press("Enter");
  await expect(page.getByRole("link", { name: "AAPL", exact: true }).first()).toBeVisible();
});

test("Safe Invest after-tax table and goals", async ({ page }) => {
  await open(page, "/invest");
  await page.getByRole("button", { name: "After Tax & Inflation" }).click();
  await expect(page.getByText("What you actually keep")).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.getByRole("button", { name: "Goals", exact: true }).click();
  await page.getByRole("button", { name: /^Add ₹/ }).click();
  await expect(page.getByText("Emergency fund").first()).toBeVisible();
});

test("search finds a tracked stock", async ({ page }) => {
  await open(page, "/");
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Search stocks" }).fill("infy");
  await expect(page.getByRole("option").filter({ hasText: "INFY" }).first()).toBeVisible();
});

test("device link code round trip", async ({ browser }) => {
  const a = await browser.newPage();
  await open(a, "/watchlists");
  await a.getByPlaceholder(/Watchlist name/).fill("Shared list");
  await a.getByRole("button", { name: "Create" }).click();
  await expect(a.getByText("Shared list")).toBeVisible();
  await a.getByRole("button", { name: "Use on another device" }).first().click();
  await a.getByRole("button", { name: "Make a code" }).click();
  const code = (await a.locator("p.font-mono.text-2xl").textContent())!.trim();

  const ctx = await browser.newContext();
  const b = await ctx.newPage();
  await open(b, `/link?code=${code}`);
  await b.getByRole("button", { name: "Link this device" }).click();
  await expect(b.getByText("Shared list")).toBeVisible();
  await ctx.close();
});

test("broker CSV import parses a Zerodha-style file", async ({ page }) => {
  await open(page, "/portfolio");
  const csv = [
    "Instrument,Qty.,Avg. cost,LTP,Cur. val,P&L",
    "RELIANCE,10,1200.5,1400,14000,1995",
    "\"INFY\",5,\"1,450.00\",1500,7500,250",
    "IDEA-EQ,100,8.2,9,900,80",
    "Total,,,,22400,",
  ].join("\n");
  await page.locator('input[type="file"]').setInputFiles({ name: "holdings.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  for (const sym of ["RELIANCE", "INFY", "IDEA"]) {
    await expect(page.locator("td", { hasText: sym }).first()).toBeVisible();
  }
});
