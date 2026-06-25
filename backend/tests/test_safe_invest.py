"""
Unit tests for the Safe Investment Guide calculators (pure, no network/DB).

Covers the SIP compounding engine, the reverse goal planner, the multi-instrument
allocation calculator, and basic integrity of the instrument database.
"""
from __future__ import annotations

from app.services import safe_invest as si
from app.services.safe_invest import (
    INSTRUMENTS,
    RISK_PROFILES,
    allocation_calc,
    goal_planner,
    sip_calculator,
)


# ── SIP calculator ───────────────────────────────────────────────────────────
def test_sip_zero_rate_has_no_gains():
    out = sip_calculator(1000, 0, 1)
    assert out["total_invested"] == 12000
    assert out["final_value"] == 12000
    assert out["total_gains"] == 0


def test_sip_positive_rate_grows():
    out = sip_calculator(5000, 12, 10)
    assert out["total_invested"] == 5000 * 12 * 10
    assert out["final_value"] > out["total_invested"]
    assert out["total_gains"] == out["final_value"] - out["total_invested"]
    # One row per year.
    assert len(out["yearly_data"]) == 10
    assert out["yearly_data"][-1]["year"] == 10


def test_sip_step_up_beats_flat():
    flat = sip_calculator(1000, 10, 10, step_up_pct=0)
    stepped = sip_calculator(1000, 10, 10, step_up_pct=10)
    # Increasing the contribution every year invests more and ends higher.
    assert stepped["total_invested"] > flat["total_invested"]
    assert stepped["final_value"] > flat["final_value"]


def test_sip_pure_lump_sum():
    # monthly=0 → pure lump-sum compounding.
    out = sip_calculator(0, 10, 10, lump_sum=100000)
    assert out["total_invested"] == 100000
    assert out["lump_sum"] == 100000
    assert out["final_value"] > 100000  # grew via compounding
    assert len(out["yearly_data"]) == 10


def test_sip_lump_plus_monthly():
    monthly_only = sip_calculator(5000, 10, 10)
    combined = sip_calculator(5000, 10, 10, lump_sum=100000)
    # Adding an upfront lump sum raises both invested and final value.
    assert combined["total_invested"] == monthly_only["total_invested"] + 100000
    assert combined["final_value"] > monthly_only["final_value"]


# ── Goal planner ─────────────────────────────────────────────────────────────
def test_goal_planner_zero_rate_is_linear():
    out = goal_planner(120000, 1, 0)
    assert out["monthly_sip_needed"] == 10000


def test_goal_planner_inverts_sip_within_tolerance():
    target, years, rate = 1_000_000, 10, 12
    plan = goal_planner(target, years, rate)
    # Feeding the recommended SIP back into the calculator should land near the
    # target (small gap is the annuity-due vs ordinary-annuity timing offset).
    check = sip_calculator(plan["monthly_sip_needed"], rate, years)
    assert abs(check["final_value"] - target) / target < 0.03


# ── Allocation calculator ────────────────────────────────────────────────────
def test_allocation_splits_and_aggregates():
    out = allocation_calc(
        10000,
        [{"instrument_id": "ppf", "pct": 50}, {"instrument_id": "elss", "pct": 50}],
        years=10,
        country="IN",
    )
    assert len(out["instruments"]) == 2
    # Monthly contributions split by pct.
    assert out["instruments"][0]["monthly"] == 5000
    # PPF is zero-risk and is 50% of the book.
    assert out["guaranteed_pct"] == 50
    # Blended rate sits between the two instrument rates.
    rates = [i["rate"] for i in out["instruments"]]
    assert min(rates) <= out["weighted_rate"] <= max(rates)
    # Highest risk reported is the riskier (ELSS = medium) of the two.
    assert out["max_risk"] == "medium"


def test_allocation_lump_sum_split_and_lockin():
    out = allocation_calc(
        2000,
        [{"instrument_id": "ppf", "pct": 50}, {"instrument_id": "liquid_fund", "pct": 50}],
        years=10,
        country="IN",
        lump_sum=100000,
    )
    # Lump sum recorded and split by weight.
    assert out["lump_sum"] == 100000
    assert out["instruments"][0]["lump_sum"] == 50000
    # Withdrawal info surfaced per instrument.
    for inst in out["instruments"]:
        assert inst["lock_in"] and inst["liquidity"]
    # Liquidity summary: liquid_fund (very_high) is accessible; PPF locks 15y.
    assert out["liquidity"]["liquid_now_pct"] == 50
    assert "15 year" in out["liquidity"]["longest_lock_in"]
    assert out["rates_as_of"]


def test_allocation_skips_unknown_instrument():
    out = allocation_calc(
        1000,
        [{"instrument_id": "does_not_exist", "pct": 100}],
        years=5,
        country="IN",
    )
    assert out["instruments"] == []


# ── Instrument database integrity ────────────────────────────────────────────
def test_instrument_db_well_formed():
    for country in ("IN", "US"):
        insts = INSTRUMENTS[country]["instruments"]
        ids = [i["id"] for i in insts]
        assert len(ids) == len(set(ids)), f"duplicate instrument id in {country}"
        for inst in insts:
            lo, hi = inst["return_range"]
            assert lo <= hi
            assert inst["current_rate"] > 0
            assert inst["risk"] in {
                "zero", "very_low", "low", "low_to_medium", "medium",
            }


def test_risk_profile_instruments_exist():
    in_ids = {i["id"] for i in INSTRUMENTS["IN"]["instruments"]}
    us_ids = {i["id"] for i in INSTRUMENTS["US"]["instruments"]}
    for profile in RISK_PROFILES:
        assert set(profile["instruments_in"]).issubset(in_ids)
        assert set(profile["instruments_us"]).issubset(us_ids)
