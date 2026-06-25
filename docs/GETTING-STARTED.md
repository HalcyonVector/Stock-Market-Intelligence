# Getting Started — open & use the app (no coding needed)

This guide walks you through opening **Stock Discovery & Intelligence** on your own
computer and using each screen. You do not need to know how to code.

> **What this is, in one line:** a research dashboard that shows interesting
> stocks and explains *why* they're moving. It is for **learning and research
> only** — it does not give advice, does not let you buy anything, and never
> touches your money or bank/brokerage accounts. (It also does **not** cover
> mutual funds — it's about individual stocks.)

---

## Part 1 — What you need to install (one time)

You only need **one** free program: **Docker Desktop**. It bundles everything the
app needs (database, server, website) so you don't have to install them one by one.

1. Go to **https://www.docker.com/products/docker-desktop/**
2. Download the version for your computer (Windows or Mac).
3. Install it like any normal app, then **open Docker Desktop** and leave it
   running (you'll see a little whale icon in your taskbar / menu bar).

That's it. You won't need to open Docker again after this — just make sure it's
running before you start the app.

---

## Part 2 — Open the app (3 steps)

1. **Open a terminal** in the project folder:
   - **Windows:** open the `stock-discovery-intelligence` folder, click the address
     bar, type `cmd`, and press Enter.
   - **Mac:** open the **Terminal** app, type `cd ` (with a space), then drag the
     `stock-discovery-intelligence` folder onto the window and press Enter.

2. **Copy-paste this one line** and press Enter:
   ```
   docker compose -f infra/docker-compose.yml up --build
   ```
   The first time, this takes a few minutes (it's downloading and setting things
   up). You'll see lots of text scroll by — that's normal. Wait until it settles
   down and stops scrolling.

3. **Open your web browser** and go to:
   ```
   http://localhost:3000
   ```
   🎉 The dashboard should load. Done!

**To stop the app:** click the terminal window and press `Ctrl + C` (Windows) or
`Cmd + C` (Mac). To start it again later, just repeat step 2 (it'll be much faster).

> **Note on the data:** out of the box the app runs in **demo mode** with realistic
> *sample* data so everything works instantly without any sign-ups or keys. The
> numbers are illustrative, not real market prices. Turning on real data is
> optional and covered at the bottom.

---

## Part 3 — Using the app (what each screen does)

### The home dashboard
A grid of "cards", each answering a question:

| Card | What it tells you |
|------|-------------------|
| **AI Market Briefing** | A short written summary of what's happening today |
| **Opportunity Radar** | A ranked list of stocks the app finds interesting, with a score |
| **Unusual Activity Feed** | Live ticker of big moves as they happen (the green "live" dot means it's connected) |
| **Live Market Movers** | Biggest gainers and losers right now |
| **Sector Rotation** | Which industries (IT, Energy, Pharma…) are heating up or cooling down |
| **Retail Sentiment** | What stocks people are talking about online and the mood |

### Searching for a stock
- Click **"Search markets"** at the top right (or press **Ctrl/Cmd + K**).
- Type a ticker like `AAPL` (Apple) or `NVDA` (Nvidia) and pick it.

### The stock page — the main feature
When you open a stock you get a **"Why is this stock moving?"** card: a plain-English
explanation, a **confidence %**, and the **signals it used** (so you can see *why* it
said that — nothing is a mystery). You also get a price chart, key numbers, and
recent news.

### Scores — and why you can trust them
Every score (Opportunity, Momentum, Sentiment, Risk, Attention) shows the exact
formula and how much each factor contributed. There are no hidden "black box"
numbers.

---

## Part 4 — Common hiccups

| Problem | Fix |
|--------|-----|
| Browser says "can't reach this page" | Give it another minute — the app may still be starting. Refresh `http://localhost:3000`. |
| The big command errors out | Make sure **Docker Desktop is open and running** first, then try again. |
| "Port already in use" | The app is probably already running in another terminal, or something else uses port 3000/8000. Close the other one and retry. |
| The "live" dot is grey, not green | The live feed needs the full app (Docker) running. In demo mode the dashboard still works; events just won't stream. |

---

## Part 5 — (Optional) Turn on real market data

Demo mode is enough to explore. If you want **real** prices and news:

1. In the `backend` folder, copy `.env.example` to a new file named `.env`.
2. Open `.env` and change one line to:  `DATA_MODE=live`
3. (Optional) For real AI write-ups, set `AI_PROVIDER=anthropic` and paste an
   `ANTHROPIC_API_KEY`.
4. Restart the app (stop with Ctrl/Cmd+C, then run the command again).

Real data uses free sources (Yahoo Finance, public news feeds, Reddit, Google
Trends). If a source isn't set up, the app quietly falls back to demo data instead
of breaking. To check what's actually live, a developer can run:
`cd backend && DATA_MODE=live python -m scripts.validate_live`.

---

## A reminder
This is an **educational research tool for individual stocks**. It does not provide
financial advice, recommendations, or a way to invest, and it does not deal with
mutual funds. Always do your own research and consider speaking with a qualified,
registered advisor before investing real money.
