"""
Safe Investment Guide — zero/minimal loss instruments for beginners.

SIP calculator, instrument database with historical returns, risk profiling,
goal planner, and AI-powered personalized advice.

Supports India (default) and US instruments.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone

from app.adapters.registry import providers
from app.core.redis import get_redis
from app.services import live_rates

# ── Instrument Database ──────────────────────────────────────────────────────

# Indian government small-savings rates (PPF, SCSS, SSY, NSC, KVP, POMIS, POTD,
# RD) are official, notified quarterly by the Ministry of Finance, and are
# current as of the quarter below. Bank-FD, mutual-fund, NPS/ELSS/index and the
# US instruments are market-linked *estimates* that drift — treat them as
# indicative, not guaranteed.
RATES_AS_OF = "Q1 FY2026-27 (Apr–Jun 2026)"

INSTRUMENTS = {
    "IN": {
        "currency": "₹",
        "instruments": [
            {
                "id": "ppf",
                "name": "Public Provident Fund (PPF)",
                "category": "government",
                "risk": "zero",
                "lock_in": "15 years (partial withdrawal after 7y)",
                "min_investment": 500,
                "max_investment": 150000,  # per year
                "return_range": [7.0, 7.1],
                "current_rate": 7.1,
                "tax_benefit": "EEE — exempt at investment (80C), growth, and withdrawal",
                "liquidity": "low",
                "ideal_for": "Long-term savings, retirement, tax saving",
                "where_to_invest": "Any bank or post office. SBI, HDFC, ICICI all offer PPF accounts.",
                "guarantee": "Government of India sovereign guarantee",
                "compounding": "annual",
            },
            {
                "id": "fd",
                "name": "Bank Fixed Deposit",
                "category": "bank",
                "risk": "zero",
                "lock_in": "7 days to 10 years (choose tenure)",
                "min_investment": 1000,
                "max_investment": None,
                "return_range": [6.5, 7.5],
                "current_rate": 7.0,
                "tax_benefit": "Tax-saver FD (5y lock-in) qualifies for 80C. Interest is taxable.",
                "liquidity": "medium",
                "ideal_for": "Short to medium-term parking of money, emergency fund",
                "where_to_invest": "Any bank. SBI, HDFC, ICICI, or small finance banks (higher rates).",
                "guarantee": "DICGC insures up to ₹5 lakh per bank",
                "compounding": "quarterly",
            },
            {
                "id": "rd",
                "name": "Recurring Deposit (RD)",
                "category": "bank",
                "risk": "zero",
                "lock_in": "6 months to 10 years",
                "min_investment": 100,
                "max_investment": None,
                "return_range": [6.0, 7.0],
                "current_rate": 6.7,
                "tax_benefit": "Interest is taxable. No 80C benefit.",
                "liquidity": "low",
                "ideal_for": "Students/beginners who want to invest fixed amount monthly — like SIP but guaranteed",
                "where_to_invest": "Any bank. Can start from ₹100/month.",
                "guarantee": "DICGC insures up to ₹5 lakh per bank",
                "compounding": "quarterly",
            },
            {
                "id": "liquid_fund",
                "name": "Liquid Mutual Fund",
                "category": "mutual_fund",
                "risk": "very_low",
                "lock_in": "None (exit load for 7 days)",
                "min_investment": 100,
                "max_investment": None,
                "return_range": [5.5, 7.0],
                "current_rate": 6.5,
                "tax_benefit": "LTCG after 3y taxed at slab rate (no indexation post-2023). STCG at slab.",
                "liquidity": "very_high",
                "ideal_for": "Emergency fund, parking money for short periods, better than savings account",
                "where_to_invest": "Groww, Zerodha Coin, Paytm Money, Kuvera — all free direct plan platforms.",
                "guarantee": "No guarantee, but invests in govt securities and top-rated bonds. Loss is extremely rare.",
                "compounding": "daily",
            },
            {
                "id": "debt_fund",
                "name": "Debt Mutual Fund (Short Duration)",
                "category": "mutual_fund",
                "risk": "low",
                "lock_in": "None",
                "min_investment": 100,
                "max_investment": None,
                "return_range": [6.5, 8.0],
                "current_rate": 7.2,
                "tax_benefit": "Taxed at slab rate regardless of holding period (post-2023 rules).",
                "liquidity": "high",
                "ideal_for": "1-3 year goals. Better returns than FD with slightly more risk.",
                "where_to_invest": "Groww, Zerodha Coin, Kuvera. Look for funds with AUM > ₹5000 Cr.",
                "guarantee": "No guarantee. Can have minor fluctuations but rarely loses over 1+ year.",
                "compounding": "daily",
            },
            {
                "id": "sgb",
                "name": "Sovereign Gold Bond (SGB)",
                "category": "government",
                "risk": "very_low",
                "lock_in": "8 years (exit after 5y)",
                "min_investment": 4500,  # approx 1 gram
                "max_investment": None,
                "return_range": [8.0, 12.0],  # gold appreciation + 2.5% interest
                "current_rate": 2.5,  # guaranteed interest, plus gold price change
                "tax_benefit": "Interest taxable. Capital gains exempt if held to maturity (8y).",
                "liquidity": "low",
                "ideal_for": "Gold investment without storage hassle. Good inflation hedge.",
                "where_to_invest": "RBI issues periodically. Buy through banks or stock exchanges.",
                "guarantee": "Government of India guarantee on redemption value (in gold grams)",
                "compounding": "semi-annual (interest only)",
            },
            {
                "id": "nps",
                "name": "National Pension System (NPS)",
                "category": "government",
                "risk": "low_to_medium",
                "lock_in": "Until age 60",
                "min_investment": 500,
                "max_investment": None,
                "return_range": [8.0, 12.0],
                "current_rate": 10.0,
                "tax_benefit": "Additional ₹50K deduction under 80CCD(1B) over 80C limit. Partial tax on withdrawal.",
                "liquidity": "very_low",
                "ideal_for": "Retirement planning. Extra tax saving beyond ₹1.5L limit.",
                "where_to_invest": "eNPS portal, banks, or through apps like Groww.",
                "guarantee": "Market-linked but has very conservative debt options.",
                "compounding": "daily (market-linked)",
            },
            {
                "id": "elss",
                "name": "ELSS (Tax Saving Mutual Fund)",
                "category": "mutual_fund",
                "risk": "medium",
                "lock_in": "3 years",
                "min_investment": 500,
                "max_investment": None,
                "return_range": [10.0, 15.0],
                "current_rate": 12.0,
                "tax_benefit": "Deduction up to ₹1.5L under 80C. LTCG >₹1L taxed at 10%.",
                "liquidity": "low",
                "ideal_for": "Tax saving + wealth creation. Shortest lock-in among 80C options.",
                "where_to_invest": "Groww, Zerodha Coin, Kuvera. Choose top-rated funds (Mirae, Quant, Parag Parikh).",
                "guarantee": "No guarantee. Equity risk. But 3y+ holding usually gives positive returns historically.",
                "compounding": "daily (market-linked)",
            },
            {
                "id": "index_fund",
                "name": "Index Fund / ETF (Nifty 50)",
                "category": "mutual_fund",
                "risk": "medium",
                "lock_in": "None",
                "min_investment": 100,
                "max_investment": None,
                "return_range": [10.0, 14.0],
                "current_rate": 12.0,
                "tax_benefit": "LTCG >₹1L taxed at 10% (if held >1y). STCG at 15%.",
                "liquidity": "very_high",
                "ideal_for": "Long-term wealth building (5+ years). No stock picking needed.",
                "where_to_invest": "Groww, Zerodha Coin. UTI Nifty 50, HDFC Nifty 50 are popular choices.",
                "guarantee": "No guarantee. But Nifty has never given negative returns over any 7+ year period historically.",
                "compounding": "daily (market-linked)",
            },
            {
                "id": "nsc",
                "name": "National Savings Certificate (NSC)",
                "category": "government",
                "risk": "zero",
                "lock_in": "5 years",
                "min_investment": 1000,
                "max_investment": None,
                "return_range": [7.5, 7.7],
                "current_rate": 7.7,
                "tax_benefit": "Qualifies for 80C (up to ₹1.5L). Interest reinvested also counts as fresh 80C investment each year.",
                "liquidity": "low",
                "ideal_for": "Tax saving + guaranteed returns. Interest compounds but paid at maturity.",
                "where_to_invest": "Any India Post office. Carry Aadhaar + PAN + passport photo.",
                "guarantee": "Government of India sovereign guarantee",
                "compounding": "annual (reinvested, paid at maturity)",
            },
            {
                "id": "kvp",
                "name": "Kisan Vikas Patra (KVP)",
                "category": "government",
                "risk": "zero",
                "lock_in": "30 months (matures in 115 months)",
                "min_investment": 1000,
                "max_investment": None,
                "return_range": [7.2, 7.5],
                "current_rate": 7.5,
                "tax_benefit": "No 80C benefit. Interest is taxable at slab rate.",
                "liquidity": "low",
                "ideal_for": "Doubles your money in ~9.5 years. Open to ALL citizens — not just farmers despite the name.",
                "where_to_invest": "Any India Post office or select bank branches.",
                "guarantee": "Government of India sovereign guarantee",
                "compounding": "annual",
            },
            {
                "id": "pomis",
                "name": "Post Office Monthly Income Scheme (MIS)",
                "category": "government",
                "risk": "zero",
                "lock_in": "5 years",
                "min_investment": 1000,
                "max_investment": 900000,  # single account; 1500000 joint
                "return_range": [7.0, 7.4],
                "current_rate": 7.4,
                "tax_benefit": "No 80C benefit. Interest is taxable.",
                "liquidity": "low",
                "ideal_for": "Monthly income from savings. Great for parents/retirees who want regular cash flow.",
                "where_to_invest": "Any India Post office.",
                "guarantee": "Government of India sovereign guarantee",
                "compounding": "monthly (paid out, not reinvested)",
            },
            {
                "id": "potd",
                "name": "Post Office Time Deposit (TD)",
                "category": "government",
                "risk": "zero",
                "lock_in": "1, 2, 3, or 5 years",
                "min_investment": 1000,
                "max_investment": None,
                "return_range": [6.9, 7.5],
                "current_rate": 7.5,
                "tax_benefit": "5-year TD qualifies for 80C. Interest taxable on shorter tenures.",
                "liquidity": "medium",
                "ideal_for": "Like a bank FD but government-backed. 5y TD gives tax benefit too.",
                "where_to_invest": "Any India Post office.",
                "guarantee": "Government of India sovereign guarantee",
                "compounding": "quarterly",
            },
            {
                "id": "scss",
                "name": "Senior Citizens Savings Scheme (SCSS)",
                "category": "government",
                "risk": "zero",
                "lock_in": "5 years (extendable by 3y)",
                "min_investment": 1000,
                "max_investment": 3000000,
                "return_range": [8.0, 8.2],
                "current_rate": 8.2,
                "tax_benefit": "Qualifies for 80C. Interest taxable (TDS if >₹50K/year).",
                "liquidity": "low",
                "ideal_for": "Best rate among guaranteed instruments. Only for 60+ (or 55+ retired govt/defense).",
                "where_to_invest": "Any India Post office or authorized banks.",
                "guarantee": "Government of India sovereign guarantee",
                "compounding": "quarterly (paid out)",
                "eligibility": "Age 60+ (55+ for retired govt employees, 50+ for retired defense)",
            },
            {
                "id": "ssy",
                "name": "Sukanya Samriddhi Yojana (SSY)",
                "category": "government",
                "risk": "zero",
                "lock_in": "21 years (partial withdrawal after girl turns 18)",
                "min_investment": 250,
                "max_investment": 150000,  # per year
                "return_range": [8.0, 8.2],
                "current_rate": 8.2,
                "tax_benefit": "EEE — exempt at investment (80C), growth, and withdrawal. Best tax treatment possible.",
                "liquidity": "very_low",
                "ideal_for": "Highest guaranteed rate (8.2%). For girl child's education/marriage. Parents/guardians can open.",
                "where_to_invest": "Any India Post office or authorized banks.",
                "guarantee": "Government of India sovereign guarantee",
                "compounding": "annual",
                "eligibility": "Parent/guardian of girl child below age 10. Max 2 accounts (one per girl).",
            },
            {
                "id": "arbitrage_fund",
                "name": "Arbitrage Mutual Fund",
                "category": "mutual_fund",
                "risk": "very_low",
                "lock_in": "None (exit load if <30 days)",
                "min_investment": 500,
                "max_investment": None,
                "return_range": [6.0, 7.5],
                "current_rate": 6.8,
                "tax_benefit": "Taxed as equity fund — LTCG >₹1L at 10%, STCG at 15% (despite low-risk debt-like returns).",
                "liquidity": "high",
                "ideal_for": "Parking money 3-12 months with equity-fund tax treatment. Near risk-free in practice.",
                "where_to_invest": "Groww, Zerodha Coin, Kuvera.",
                "guarantee": "No guarantee, but exploits cash-futures price gaps — extremely low historical volatility.",
                "compounding": "daily",
            },
            {
                "id": "gilt_fund",
                "name": "Gilt Fund (Government Securities)",
                "category": "mutual_fund",
                "risk": "low",
                "lock_in": "None",
                "min_investment": 500,
                "max_investment": None,
                "return_range": [6.5, 8.5],
                "current_rate": 7.4,
                "tax_benefit": "Taxed at slab rate regardless of holding period (post-2023 rules).",
                "liquidity": "high",
                "ideal_for": "Only invests in govt bonds — no credit risk. Returns move with interest-rate cycles.",
                "where_to_invest": "Groww, Zerodha Coin, Kuvera.",
                "guarantee": "No default risk (govt securities only), but NAV fluctuates with interest rates.",
                "compounding": "daily",
            },
            {
                "id": "banking_psu_fund",
                "name": "Banking & PSU Debt Fund",
                "category": "mutual_fund",
                "risk": "low",
                "lock_in": "None",
                "min_investment": 500,
                "max_investment": None,
                "return_range": [6.8, 8.0],
                "current_rate": 7.3,
                "tax_benefit": "Taxed at slab rate regardless of holding period (post-2023 rules).",
                "liquidity": "high",
                "ideal_for": "1-3 year goals. Invests only in banks/PSUs — high credit quality.",
                "where_to_invest": "Groww, Zerodha Coin, Kuvera.",
                "guarantee": "No guarantee, but restricted to high-rated bank/PSU paper — low default risk.",
                "compounding": "daily",
            },
            {
                "id": "corporate_bond_fund",
                "name": "Corporate Bond Fund",
                "category": "mutual_fund",
                "risk": "low",
                "lock_in": "None",
                "min_investment": 500,
                "max_investment": None,
                "return_range": [7.0, 8.5],
                "current_rate": 7.6,
                "tax_benefit": "Taxed at slab rate regardless of holding period (post-2023 rules).",
                "liquidity": "high",
                "ideal_for": "Slightly better yield than banking & PSU funds; invests 80%+ in AA+ and above corporate bonds.",
                "where_to_invest": "Groww, Zerodha Coin, Kuvera.",
                "guarantee": "No guarantee. Restricted to high-rated corporate paper.",
                "compounding": "daily",
            },
            {
                "id": "overnight_fund",
                "name": "Overnight Fund",
                "category": "mutual_fund",
                "risk": "very_low",
                "lock_in": "None",
                "min_investment": 500,
                "max_investment": None,
                "return_range": [5.0, 6.5],
                "current_rate": 6.2,
                "tax_benefit": "Taxed at slab rate. No indexation.",
                "liquidity": "very_high",
                "ideal_for": "Parking money for a few days. Lowest-risk mutual fund category that exists.",
                "where_to_invest": "Groww, Zerodha Coin, Kuvera.",
                "guarantee": "Invests only in overnight (1-day) securities — negligible risk.",
                "compounding": "daily",
            },
            {
                "id": "ultra_short_fund",
                "name": "Ultra Short Duration Fund",
                "category": "mutual_fund",
                "risk": "very_low",
                "lock_in": "None",
                "min_investment": 500,
                "max_investment": None,
                "return_range": [6.0, 7.3],
                "current_rate": 6.7,
                "tax_benefit": "Taxed at slab rate regardless of holding period.",
                "liquidity": "very_high",
                "ideal_for": "3-6 month parking, slightly better yield than a liquid fund.",
                "where_to_invest": "Groww, Zerodha Coin, Kuvera.",
                "guarantee": "No guarantee, but very short maturity keeps volatility minimal.",
                "compounding": "daily",
            },
            {
                "id": "hybrid_conservative",
                "name": "Conservative Hybrid Fund",
                "category": "mutual_fund",
                "risk": "low_to_medium",
                "lock_in": "None",
                "min_investment": 500,
                "max_investment": None,
                "return_range": [8.0, 10.0],
                "current_rate": 9.0,
                "tax_benefit": "Taxed at slab rate (debt-oriented fund rules, post-2023).",
                "liquidity": "high",
                "ideal_for": "75-90% debt + 10-25% equity. A gentle first step beyond pure debt for 2+ year goals.",
                "where_to_invest": "Groww, Zerodha Coin, Kuvera.",
                "guarantee": "No guarantee. Small equity slice can dip short-term but cushions long-term inflation risk.",
                "compounding": "daily (market-linked)",
            },
            {
                "id": "multi_asset_fund",
                "name": "Multi Asset Allocation Fund",
                "category": "mutual_fund",
                "risk": "medium",
                "lock_in": "None",
                "min_investment": 500,
                "max_investment": None,
                "return_range": [9.0, 13.0],
                "current_rate": 11.0,
                "tax_benefit": "Tax treatment depends on the fund's equity allocation — check factsheet (equity vs. debt rules).",
                "liquidity": "high",
                "ideal_for": "One fund spread across equity, debt, and gold — reduces the effort of manual rebalancing.",
                "where_to_invest": "Groww, Zerodha Coin, Kuvera.",
                "guarantee": "No guarantee. Diversification across asset classes smooths volatility vs. pure equity.",
                "compounding": "daily (market-linked)",
            },
            {
                "id": "sfb_fd",
                "name": "Small Finance Bank FD",
                "category": "bank",
                "risk": "zero",
                "lock_in": "7 days to 10 years (choose tenure)",
                "min_investment": 1000,
                "max_investment": None,
                "return_range": [7.5, 9.0],
                "current_rate": 8.25,
                "tax_benefit": "Interest is taxable. 5y tax-saver FD qualifies for 80C.",
                "liquidity": "medium",
                "ideal_for": "Higher FD rate than large banks for the same DICGC protection, up to the insured limit.",
                "where_to_invest": "AU Small Finance Bank, Equitas, Ujjivan, Jana Small Finance Bank.",
                "guarantee": "DICGC insures up to ₹5 lakh per bank — same protection as a large bank, check coverage before investing large sums.",
                "compounding": "quarterly",
            },
            {
                "id": "corporate_fd",
                "name": "Corporate / NBFC Fixed Deposit",
                "category": "corporate",
                "risk": "low",
                "lock_in": "1 to 5 years",
                "min_investment": 5000,
                "max_investment": None,
                "return_range": [7.5, 8.6],
                "current_rate": 8.1,
                "tax_benefit": "Interest is fully taxable at slab rate. No 80C benefit.",
                "liquidity": "low",
                "ideal_for": "Better rate than bank FD in exchange for taking on issuer credit risk instead of DICGC cover.",
                "where_to_invest": "Bajaj Finance, HDFC Ltd / Shriram Finance — always check the CRIN/CRISIL rating (AAA only) before investing.",
                "guarantee": "NOT DICGC insured — pure issuer credit risk. Stick to AAA-rated NBFCs only.",
                "compounding": "annual or cumulative",
            },
            {
                "id": "tax_saver_fd",
                "name": "5-Year Tax Saver Bank FD",
                "category": "bank",
                "risk": "zero",
                "lock_in": "5 years (no premature withdrawal)",
                "min_investment": 1000,
                "max_investment": 150000,
                "return_range": [6.5, 7.5],
                "current_rate": 7.0,
                "tax_benefit": "Qualifies for 80C deduction up to ₹1.5L. Interest itself is still taxable.",
                "liquidity": "very_low",
                "ideal_for": "Simplest 80C option if you already bank somewhere and don't want a post-office visit.",
                "where_to_invest": "Any bank — ask specifically for the '5-year tax saving FD', it's a distinct product from a regular FD.",
                "guarantee": "DICGC insures up to ₹5 lakh per bank",
                "compounding": "quarterly",
            },
            {
                "id": "post_office_savings",
                "name": "Post Office Savings Account",
                "category": "government",
                "risk": "zero",
                "lock_in": "None",
                "min_investment": 500,
                "max_investment": None,
                "return_range": [4.0, 4.0],
                "current_rate": 4.0,
                "tax_benefit": "Interest up to ₹10,000/year exempt under 80TTA.",
                "liquidity": "very_high",
                "ideal_for": "Basic savings account with sovereign backing, mainly for those without easy bank access.",
                "where_to_invest": "Any India Post office.",
                "guarantee": "Government of India sovereign guarantee",
                "compounding": "annual",
            },
            {
                "id": "epf",
                "name": "Employees' Provident Fund (EPF)",
                "category": "government",
                "risk": "zero",
                "lock_in": "Until retirement/2 months unemployed (partial withdrawal allowed for specific needs)",
                "min_investment": 0,
                "max_investment": None,
                "return_range": [8.1, 8.25],
                "current_rate": 8.25,
                "tax_benefit": "EEE for most salaried employees — check your own contribution stays under ₹2.5L/yr for full tax exemption.",
                "liquidity": "very_low",
                "ideal_for": "Automatic if you're salaried — 12% of basic pay is already going here. Best guaranteed rate of any instrument.",
                "where_to_invest": "Automatic via employer. Check balance/UAN on the EPFO portal.",
                "guarantee": "Government of India backed, rate declared annually by EPFO",
                "compounding": "annual",
            },
            {
                "id": "vpf",
                "name": "Voluntary Provident Fund (VPF)",
                "category": "government",
                "risk": "zero",
                "lock_in": "Same as EPF — until retirement",
                "min_investment": 0,
                "max_investment": None,
                "return_range": [8.1, 8.25],
                "current_rate": 8.25,
                "tax_benefit": "Same EEE treatment as EPF, within the combined ₹2.5L/yr exemption threshold.",
                "liquidity": "very_low",
                "ideal_for": "Salaried employees who want to voluntarily contribute above the mandatory 12% at the same EPF rate.",
                "where_to_invest": "Ask your employer's payroll/HR team to increase your PF contribution.",
                "guarantee": "Government of India backed, rate declared annually by EPFO",
                "compounding": "annual",
            },
            {
                "id": "apy",
                "name": "Atal Pension Yojana (APY)",
                "category": "government",
                "risk": "zero",
                "lock_in": "Until age 60",
                "min_investment": 42,  # approx lowest monthly contribution
                "max_investment": None,
                "return_range": [8.0, 8.0],
                "current_rate": 8.0,
                "tax_benefit": "Contribution qualifies under 80CCD(1B), same bucket as NPS.",
                "liquidity": "very_low",
                "ideal_for": "Guaranteed pension of ₹1,000-5,000/month after 60. Best for unorganized-sector workers without employer EPF.",
                "where_to_invest": "Any bank via APY enrollment. Requires savings account + Aadhaar.",
                "guarantee": "Government of India guarantees the pension amount",
                "compounding": "n/a — fixed guaranteed pension payout",
                "eligibility": "Age 18-40, Indian citizen with a bank/post-office savings account",
            },
            {
                "id": "rbi_frsb",
                "name": "RBI Floating Rate Savings Bond",
                "category": "government",
                "risk": "zero",
                "lock_in": "7 years (partial early exit for 60+)",
                "min_investment": 1000,
                "max_investment": None,
                "return_range": [7.5, 8.5],
                "current_rate": 8.05,  # NSC rate + 0.35% spread, reset every 6 months
                "tax_benefit": "Interest fully taxable at slab rate. No 80C benefit.",
                "liquidity": "very_low",
                "ideal_for": "Rate resets every 6 months (linked to NSC + 0.35%), so it never falls behind current rates.",
                "where_to_invest": "RBI Retail Direct portal, or via SBI/nationalised banks.",
                "guarantee": "Government of India sovereign guarantee",
                "compounding": "semi-annual (paid out, not reinvested)",
            },
            {
                "id": "post_office_rd",
                "name": "Post Office Recurring Deposit (RD)",
                "category": "government",
                "risk": "zero",
                "lock_in": "5 years (premature closure allowed after 3y at lower rate)",
                "min_investment": 100,
                "max_investment": None,
                "return_range": [6.5, 6.9],
                "current_rate": 6.7,
                "tax_benefit": "No 80C benefit. Interest is taxable at slab rate.",
                "liquidity": "low",
                "ideal_for": "Same monthly-SIP-but-guaranteed idea as a bank RD, but sovereign-backed instead of bank/DICGC-backed.",
                "where_to_invest": "Any India Post office. Can start from ₹100/month.",
                "guarantee": "Government of India sovereign guarantee",
                "compounding": "quarterly (reinvested)",
            },
            {
                "id": "mssc",
                "name": "Mahila Samman Savings Certificate (MSSC)",
                "category": "government",
                "risk": "zero",
                "lock_in": "2 years (partial withdrawal up to 40% after 1 year)",
                "min_investment": 1000,
                "max_investment": 200000,
                "return_range": [7.5, 7.5],
                "current_rate": 7.5,
                "tax_benefit": "No 80C benefit. Interest is taxable at slab rate.",
                "liquidity": "low",
                "ideal_for": "Short 2-year lock-in with one of the highest guaranteed rates available. For women/girls only, any age.",
                "where_to_invest": "Any India Post office or authorized bank (SBI, PNB, and other major banks).",
                "guarantee": "Government of India sovereign guarantee",
                "compounding": "quarterly (reinvested, paid at maturity)",
                "eligibility": "Women of any age, or a guardian on behalf of a girl child. One account per person (two if a minor's own).",
            },
        ],
    },
    "US": {
        "currency": "$",
        "instruments": [
            {
                "id": "hysa",
                "name": "High-Yield Savings Account",
                "category": "bank",
                "risk": "zero",
                "lock_in": "None",
                "min_investment": 0,
                "max_investment": None,
                "return_range": [4.0, 5.0],
                "current_rate": 4.5,
                "tax_benefit": "Interest is taxable income.",
                "liquidity": "very_high",
                "ideal_for": "Emergency fund, short-term savings",
                "where_to_invest": "Marcus (Goldman Sachs), Ally Bank, Discover, SoFi.",
                "guarantee": "FDIC insured up to $250,000",
                "compounding": "daily",
            },
            {
                "id": "treasury",
                "name": "US Treasury Bonds / I-Bonds",
                "category": "government",
                "risk": "zero",
                "lock_in": "1 year minimum (I-Bonds), varies for T-Bills",
                "min_investment": 25,
                "max_investment": 10000,  # per year for I-Bonds
                "return_range": [4.0, 5.5],
                "current_rate": 4.28,
                "tax_benefit": "Exempt from state/local tax. Federal tax on interest.",
                "liquidity": "medium",
                "ideal_for": "Risk-free returns, inflation protection (I-Bonds)",
                "where_to_invest": "TreasuryDirect.gov",
                "guarantee": "Full faith and credit of the US Government",
                "compounding": "semi-annual",
            },
            {
                "id": "money_market",
                "name": "Money Market Fund",
                "category": "mutual_fund",
                "risk": "very_low",
                "lock_in": "None",
                "min_investment": 0,
                "max_investment": None,
                "return_range": [4.5, 5.2],
                "current_rate": 5.0,
                "tax_benefit": "Dividends taxable. Some govt-only funds exempt from state tax.",
                "liquidity": "very_high",
                "ideal_for": "Cash parking, slightly better than savings account",
                "where_to_invest": "Vanguard, Fidelity, Schwab — all have money market funds.",
                "guarantee": "No guarantee but extremely stable. $1 NAV maintained.",
                "compounding": "daily",
            },
            {
                "id": "bond_etf",
                "name": "Bond ETF (BND / AGG)",
                "category": "etf",
                "risk": "low",
                "lock_in": "None",
                "min_investment": 0,
                "max_investment": None,
                "return_range": [3.0, 5.0],
                "current_rate": 4.5,
                "tax_benefit": "Interest taxable. Capital gains rules apply.",
                "liquidity": "very_high",
                "ideal_for": "Diversified bond exposure, moderate risk tolerance",
                "where_to_invest": "Any brokerage — Vanguard, Fidelity, Schwab, Robinhood.",
                "guarantee": "No guarantee. Can fluctuate with interest rates.",
                "compounding": "monthly (dividends)",
            },
            {
                "id": "cd",
                "name": "Certificate of Deposit (CD)",
                "category": "bank",
                "risk": "zero",
                "lock_in": "3 months to 5 years",
                "min_investment": 0,
                "max_investment": None,
                "return_range": [4.0, 5.0],
                "current_rate": 4.5,
                "tax_benefit": "Interest is taxable.",
                "liquidity": "low",
                "ideal_for": "Known future expense, locking in current rates",
                "where_to_invest": "Marcus, Ally, Discover, Capital One.",
                "guarantee": "FDIC insured up to $250,000",
                "compounding": "monthly or daily",
            },
            {
                "id": "sp500_etf",
                "name": "S&P 500 Index ETF (VOO/SPY)",
                "category": "etf",
                "risk": "medium",
                "lock_in": "None",
                "min_investment": 0,
                "max_investment": None,
                "return_range": [8.0, 12.0],
                "current_rate": 10.0,
                "tax_benefit": "LTCG (>1y) taxed at 0-20%. STCG at ordinary rates.",
                "liquidity": "very_high",
                "ideal_for": "Long-term wealth building (5+ years), retirement accounts",
                "where_to_invest": "Any brokerage. VOO (Vanguard), SPY (State Street), IVV (iShares).",
                "guarantee": "No guarantee. But S&P 500 has never lost money over any 20-year period.",
                "compounding": "quarterly (dividends) + growth",
            },
            {
                "id": "brokered_cd",
                "name": "Brokered Certificate of Deposit",
                "category": "bank",
                "risk": "zero",
                "lock_in": "3 months to 10 years, tradable before maturity (at market price)",
                "min_investment": 1000,
                "max_investment": None,
                "return_range": [4.0, 5.2],
                "current_rate": 4.6,
                "tax_benefit": "Interest is taxable income.",
                "liquidity": "medium",
                "ideal_for": "Same FDIC protection as a bank CD but bought through a brokerage — often better rates via bank shopping.",
                "where_to_invest": "Fidelity, Schwab, Vanguard brokered-CD marketplace.",
                "guarantee": "FDIC insured up to $250,000 per issuing bank",
                "compounding": "varies by issuer",
            },
            {
                "id": "ibond",
                "name": "Series I Savings Bond",
                "category": "government",
                "risk": "zero",
                "lock_in": "1 year minimum, full interest only after 5 years (else 3-month penalty)",
                "min_investment": 25,
                "max_investment": 10000,  # per person per year, electronic
                "return_range": [3.5, 6.0],
                "current_rate": 4.28,
                "tax_benefit": "Exempt from state/local tax. Federal tax deferred until redemption; can be tax-free if used for qualified education expenses.",
                "liquidity": "low",
                "ideal_for": "Inflation-protected savings — composite rate combines a fixed rate plus an inflation adjustment reset every 6 months.",
                "where_to_invest": "TreasuryDirect.gov",
                "guarantee": "Full faith and credit of the US Government",
                "compounding": "semi-annual",
            },
            {
                "id": "eebond",
                "name": "Series EE Savings Bond",
                "category": "government",
                "risk": "zero",
                "lock_in": "1 year minimum, guaranteed to double in value at 20 years",
                "min_investment": 25,
                "max_investment": 10000,  # per person per year, electronic
                "return_range": [2.7, 3.5],
                "current_rate": 2.7,
                "tax_benefit": "Exempt from state/local tax. Federal tax deferred until redemption.",
                "liquidity": "low",
                "ideal_for": "Guaranteed to double in 20 years regardless of the stated rate — a genuine zero-loss long-term instrument.",
                "where_to_invest": "TreasuryDirect.gov",
                "guarantee": "Full faith and credit of the US Government — doubling guarantee at 20 years",
                "compounding": "semi-annual",
            },
            {
                "id": "tips",
                "name": "Treasury Inflation-Protected Securities (TIPS)",
                "category": "government",
                "risk": "very_low",
                "lock_in": "None (tradable), issued in 5/10/30-year terms",
                "min_investment": 100,
                "max_investment": None,
                "return_range": [1.5, 2.5],  # real yield, on top of CPI adjustment
                "current_rate": 2.0,
                "tax_benefit": "Federal tax on interest AND on the inflation adjustment each year, even though it's not paid out until maturity ('phantom income').",
                "liquidity": "high",
                "ideal_for": "Principal adjusts with CPI inflation — protects purchasing power over long horizons.",
                "where_to_invest": "TreasuryDirect.gov, or TIPS ETFs (SCHP, TIP) through any brokerage.",
                "guarantee": "Full faith and credit of the US Government",
                "compounding": "semi-annual (interest) + inflation adjustment to principal",
            },
            {
                "id": "municipal_bond",
                "name": "Municipal Bond Fund",
                "category": "etf",
                "risk": "low",
                "lock_in": "None",
                "min_investment": 0,
                "max_investment": None,
                "return_range": [3.0, 4.5],
                "current_rate": 3.6,
                "tax_benefit": "Interest generally exempt from federal tax, and from state tax if issued in your home state.",
                "liquidity": "very_high",
                "ideal_for": "Higher-tax-bracket investors — the tax-equivalent yield often beats a taxable bond fund.",
                "where_to_invest": "Any brokerage. VTEB (Vanguard), MUB (iShares) are broad muni ETFs.",
                "guarantee": "No guarantee. Municipal defaults are historically rare but not zero.",
                "compounding": "monthly (dividends)",
            },
            {
                "id": "corporate_bond_etf",
                "name": "Investment-Grade Corporate Bond ETF",
                "category": "etf",
                "risk": "low_to_medium",
                "lock_in": "None",
                "min_investment": 0,
                "max_investment": None,
                "return_range": [4.5, 6.0],
                "current_rate": 5.2,
                "tax_benefit": "Interest taxable at ordinary income rates. No special treatment.",
                "liquidity": "very_high",
                "ideal_for": "Higher yield than Treasuries/govt bond ETFs, still investment-grade (BBB and above) credit quality.",
                "where_to_invest": "Any brokerage. LQD (iShares), VCIT (Vanguard).",
                "guarantee": "No guarantee. Corporate credit risk, though limited to investment-grade issuers.",
                "compounding": "monthly (dividends)",
            },
        ],
    },
}

async def get_instruments(country: str = "IN") -> dict:
    """Static instrument table for ``country``, with live-rate overlays applied
    wherever a free public feed exists (see ``app.services.live_rates``).

    Every instrument gets ``rate_source`` ("static" by default, or the actual
    live source when overridden) and ``rate_as_of`` so the UI never presents a
    stale hardcoded number as if it were current.
    """
    base = INSTRUMENTS.get(country.upper(), INSTRUMENTS["IN"])
    overrides = await live_rates.get_live_overrides()

    out = []
    for inst in base["instruments"]:
        inst = dict(inst)
        override = overrides.get(inst["id"])
        if override:
            inst["current_rate"] = override["current_rate"]
            inst["rate_source"] = override["rate_source"]
            inst["rate_as_of"] = override.get("rate_as_of")
            if override.get("reference_fund"):
                inst["reference_fund"] = override["reference_fund"]
        else:
            inst.setdefault("rate_source", "static")
            inst.setdefault("rate_as_of", None)
        out.append(inst)

    return {"currency": base["currency"], "instruments": out}


RISK_PROFILES = [
    {
        "id": "ultra_safe",
        "name": "Ultra Safe (Zero Loss)",
        "description": "You cannot afford to lose even ₹1. Only government-backed instruments.",
        "max_risk": "zero",
        "instruments_in": ["ppf", "fd", "rd", "nsc", "kvp", "pomis", "potd", "scss", "ssy", "epf", "post_office_savings", "tax_saver_fd", "post_office_rd", "mssc"],
        "instruments_us": ["hysa", "treasury", "cd", "ibond", "eebond", "brokered_cd"],
        "suggested_split": {"guaranteed": 100},
    },
    {
        "id": "conservative",
        "name": "Conservative (Minimal Risk)",
        "description": "Okay with tiny fluctuations but want 95%+ safety. Liquid/debt funds acceptable.",
        "max_risk": "very_low",
        "instruments_in": ["ppf", "fd", "rd", "nsc", "kvp", "pomis", "potd", "liquid_fund", "debt_fund", "sgb", "sfb_fd", "overnight_fund", "ultra_short_fund", "arbitrage_fund"],
        "instruments_us": ["hysa", "treasury", "money_market", "cd", "bond_etf", "tips"],
        "suggested_split": {"guaranteed": 70, "low_risk": 30},
    },
    {
        "id": "balanced_safe",
        "name": "Balanced Safe (Small Risk for Better Returns)",
        "description": "Can tolerate small short-term dips for better long-term growth. 3+ year horizon.",
        "max_risk": "low",
        "instruments_in": ["ppf", "fd", "nsc", "kvp", "liquid_fund", "debt_fund", "sgb", "nps", "elss", "gilt_fund", "banking_psu_fund", "corporate_bond_fund", "hybrid_conservative", "corporate_fd"],
        "instruments_us": ["hysa", "treasury", "money_market", "bond_etf", "cd", "municipal_bond"],
        "suggested_split": {"guaranteed": 50, "low_risk": 30, "moderate": 20},
    },
    {
        "id": "growth",
        "name": "Growth (Long-Term Wealth Building)",
        "description": "5+ year horizon. Can handle market ups and downs for higher returns.",
        "max_risk": "medium",
        "instruments_in": ["ppf", "nsc", "liquid_fund", "debt_fund", "elss", "index_fund", "sgb", "nps", "multi_asset_fund"],
        "instruments_us": ["hysa", "treasury", "bond_etf", "sp500_etf", "corporate_bond_etf"],
        "suggested_split": {"guaranteed": 20, "low_risk": 30, "moderate": 50},
    },
]


# ── SIP Calculator ───────────────────────────────────────────────────────────

def sip_calculator(
    monthly_amount: float,
    annual_rate: float,
    years: int,
    step_up_pct: float = 0,  # annual increase in SIP amount
    lump_sum: float = 0,     # one-time amount invested upfront
) -> dict:
    """Calculate returns for a one-time lump sum plus a monthly SIP.

    The lump sum is invested at the start and compounds for the full duration;
    the monthly contribution (with optional annual step-up) is added on top. Set
    ``monthly_amount=0`` for a pure lump-sum projection, or ``lump_sum=0`` for a
    pure SIP.
    """
    months = years * 12
    monthly_rate = annual_rate / 100 / 12

    total_invested = lump_sum
    current_value = lump_sum  # lump sum starts compounding immediately
    current_sip = monthly_amount
    yearly_data = []

    for month in range(1, months + 1):
        # Annual step-up
        if step_up_pct > 0 and month > 1 and (month - 1) % 12 == 0:
            current_sip *= (1 + step_up_pct / 100)

        total_invested += current_sip
        current_value = (current_value + current_sip) * (1 + monthly_rate)

        if month % 12 == 0:
            yearly_data.append({
                "year": month // 12,
                "invested": round(total_invested),
                "value": round(current_value),
                "gains": round(current_value - total_invested),
                "gains_pct": round((current_value - total_invested) / total_invested * 100, 1) if total_invested > 0 else 0,
            })

    return {
        "monthly_sip": round(monthly_amount),
        "lump_sum": round(lump_sum),
        "annual_rate": annual_rate,
        "years": years,
        "step_up_pct": step_up_pct,
        "total_invested": round(total_invested),
        "final_value": round(current_value),
        "total_gains": round(current_value - total_invested),
        "gains_pct": round((current_value - total_invested) / total_invested * 100, 1) if total_invested > 0 else 0,
        "yearly_data": yearly_data,
    }


def goal_planner(
    target_amount: float,
    years: int,
    annual_rate: float,
) -> dict:
    """How much to invest monthly to reach a target."""
    monthly_rate = annual_rate / 100 / 12
    months = years * 12

    if monthly_rate == 0:
        monthly_sip = target_amount / months
    else:
        monthly_sip = target_amount * monthly_rate / ((1 + monthly_rate) ** months - 1)

    total_invested = monthly_sip * months
    return {
        "target_amount": round(target_amount),
        "years": years,
        "annual_rate": annual_rate,
        "monthly_sip_needed": round(monthly_sip),
        "total_invested": round(total_invested),
        "gains": round(target_amount - total_invested),
    }


# ── Allocation Calculator ────────────────────────────────────────────────────

def allocation_calc(
    total_monthly: float,
    allocations: list[dict],  # [{"instrument_id": "ppf", "pct": 50}, ...]
    years: int,
    country: str = "IN",
    lump_sum: float = 0,      # one-time amount invested upfront, split by the same pcts
) -> dict:
    """Calculate combined returns from a multi-instrument allocation.

    Supports a one-time ``lump_sum`` invested upfront in addition to the recurring
    ``total_monthly`` SIP — both are split across instruments by their pct weights.
    Each instrument's lock-in / liquidity is surfaced so the caller knows when the
    money can actually be withdrawn.
    """
    insts = {i["id"]: i for i in INSTRUMENTS.get(country, INSTRUMENTS["IN"])["instruments"]}

    results = []
    total_invested = 0
    total_value = 0
    combined_yearly: dict[int, dict] = {}
    max_risk = "zero"
    risk_order = ["zero", "very_low", "low", "low_to_medium", "medium"]
    # Most→least liquid, for finding the binding (longest) lock-in.
    liquidity_order = ["very_high", "high", "medium", "low", "very_low"]

    for alloc in allocations:
        inst = insts.get(alloc["instrument_id"])
        if not inst:
            continue

        pct = alloc["pct"]
        monthly = total_monthly * pct / 100
        inst_lump = lump_sum * pct / 100
        rate = inst["current_rate"]

        # Track highest risk
        inst_risk_idx = risk_order.index(inst["risk"]) if inst["risk"] in risk_order else 0
        max_risk_idx = risk_order.index(max_risk) if max_risk in risk_order else 0
        if inst_risk_idx > max_risk_idx:
            max_risk = inst["risk"]

        sip = sip_calculator(monthly, rate, years, lump_sum=inst_lump)
        total_invested += sip["total_invested"]
        total_value += sip["final_value"]

        for yd in sip["yearly_data"]:
            y = yd["year"]
            if y not in combined_yearly:
                combined_yearly[y] = {"year": y, "invested": 0, "value": 0}
            combined_yearly[y]["invested"] += yd["invested"]
            combined_yearly[y]["value"] += yd["value"]

        results.append({
            "instrument_id": alloc["instrument_id"],
            "name": inst["name"],
            "risk": inst["risk"],
            "rate": rate,
            "pct": pct,
            "monthly": round(monthly),
            "lump_sum": round(inst_lump),
            "invested": sip["total_invested"],
            "final_value": sip["final_value"],
            "gains": sip["total_gains"],
            # Withdrawal / access info
            "lock_in": inst.get("lock_in", "—"),
            "liquidity": inst.get("liquidity", "medium"),
        })

    yearly = sorted(combined_yearly.values(), key=lambda x: x["year"])
    for yd in yearly:
        yd["invested"] = round(yd["invested"])
        yd["value"] = round(yd["value"])
        yd["gains"] = yd["value"] - yd["invested"]

    guaranteed_pct = sum(r["pct"] for r in results if r["risk"] == "zero")
    weighted_rate = sum(r["rate"] * r["pct"] / 100 for r in results) if results else 0

    # Liquidity summary: which slice is locked up longest vs. accessible anytime.
    def _liq_rank(r):
        return liquidity_order.index(r["liquidity"]) if r["liquidity"] in liquidity_order else 2

    most_restrictive = max(results, key=_liq_rank) if results else None
    liquid_now_pct = sum(r["pct"] for r in results if r["liquidity"] in ("very_high", "high"))

    return {
        "total_monthly": round(total_monthly),
        "lump_sum": round(lump_sum),
        "years": years,
        "rates_as_of": RATES_AS_OF,
        "total_invested": round(total_invested),
        "total_value": round(total_value),
        "total_gains": round(total_value - total_invested),
        "gains_pct": round((total_value - total_invested) / total_invested * 100, 1) if total_invested > 0 else 0,
        "weighted_rate": round(weighted_rate, 2),
        "max_risk": max_risk,
        "guaranteed_pct": round(guaranteed_pct),
        "liquidity": {
            "liquid_now_pct": round(liquid_now_pct),
            "longest_lock_in": most_restrictive["lock_in"] if most_restrictive else "—",
            "longest_lock_in_instrument": most_restrictive["name"] if most_restrictive else None,
        },
        "instruments": results,
        "yearly_data": yearly,
    }


# ── AI Advisor ───────────────────────────────────────────────────────────────

ADVISOR_SYSTEM = """You are a friendly, patient financial guide for complete beginners in India (and globally).
The user has ZERO experience with investing. Explain everything simply, like talking to a friend.

Rules:
1. NEVER recommend specific stocks or time the market
2. Always prioritize SAFETY — the user cannot afford to lose money
3. Recommend specific platforms/apps where they can start (Groww, Zerodha, Kuvera for India)
4. Use the local currency (₹ for India, $ for US)
5. Give step-by-step actionable advice, not vague theory
6. Mention tax benefits where applicable (80C for India)
7. Always suggest starting small — even ₹100/month is fine
8. Compare with relatable things ("instead of 2 coffees a month, invest that ₹200")
9. Be encouraging and supportive — investing feels scary for beginners
10. If they mention a specific amount, calculate what it could become
11. Always mention that past returns don't guarantee future results
12. Suggest a specific split/allocation based on their situation
13. Keep it SHORT — beginners get overwhelmed by walls of text
"""


async def ai_advise(question: str, context: dict) -> str:
    """Get AI investment advice for beginners."""
    profile = context.get("risk_profile", "ultra_safe")
    monthly = context.get("monthly_amount", 1000)
    country = context.get("country", "IN")
    age = context.get("age", "student")

    currency = "₹" if country == "IN" else "$"
    instruments = INSTRUMENTS.get(country, INSTRUMENTS["IN"])

    profile_info = next((p for p in RISK_PROFILES if p["id"] == profile), RISK_PROFILES[0])

    prompt = f"""User's situation:
- Country: {country}
- Age/Status: {age}
- Monthly budget: {currency}{monthly}
- Risk profile: {profile_info['name']} — {profile_info['description']}
- Suitable instruments: {', '.join(profile_info.get(f'instruments_{country.lower()}', profile_info.get('instruments_in', [])))}

Available instruments in their country:
{json.dumps([{
    'name': i['name'],
    'risk': i['risk'],
    'current_rate': i['current_rate'],
    'where_to_invest': i['where_to_invest'],
    'ideal_for': i['ideal_for'],
    'tax_benefit': i['tax_benefit'],
} for i in instruments['instruments']], indent=2)}

User's question: {question}

Give a personalized, actionable answer. Include specific amounts and platform recommendations."""

    try:
        return await providers.ai.explain(ADVISOR_SYSTEM, prompt)
    except Exception as e:
        return f"AI advisor is currently unavailable. Error: {e}"
