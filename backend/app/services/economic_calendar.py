"""
Economic calendar — key macro events with historical market reaction data.

Since we can't reliably scrape live economic calendars for free,
we maintain a static schedule of recurring events and enrich with
estimated market impact.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

# Key recurring US economic events
RECURRING_EVENTS = [
    {
        "name": "FOMC Interest Rate Decision",
        "frequency": "6-8 weeks",
        "category": "monetary_policy",
        "impact": "high",
        "description": "Federal Reserve sets the federal funds rate target. Major market mover.",
        "avg_sp500_move": 1.2,
    },
    {
        "name": "Non-Farm Payrolls",
        "frequency": "Monthly (1st Friday)",
        "category": "employment",
        "impact": "high",
        "description": "US jobs report — total new jobs created. Key economic health indicator.",
        "avg_sp500_move": 0.8,
    },
    {
        "name": "CPI Inflation Report",
        "frequency": "Monthly",
        "category": "inflation",
        "impact": "high",
        "description": "Consumer Price Index measuring inflation. Drives Fed policy expectations.",
        "avg_sp500_move": 1.0,
    },
    {
        "name": "GDP (Advance Estimate)",
        "frequency": "Quarterly",
        "category": "growth",
        "impact": "high",
        "description": "First estimate of quarterly GDP growth. Broad economic health measure.",
        "avg_sp500_move": 0.7,
    },
    {
        "name": "PPI Producer Price Index",
        "frequency": "Monthly",
        "category": "inflation",
        "impact": "medium",
        "description": "Measures wholesale price changes. Leading indicator for CPI.",
        "avg_sp500_move": 0.5,
    },
    {
        "name": "Retail Sales",
        "frequency": "Monthly",
        "category": "consumer",
        "impact": "medium",
        "description": "Consumer spending trends. 70% of GDP is consumer-driven.",
        "avg_sp500_move": 0.5,
    },
    {
        "name": "Initial Jobless Claims",
        "frequency": "Weekly (Thursday)",
        "category": "employment",
        "impact": "low",
        "description": "Weekly new unemployment filings. Early labor market signal.",
        "avg_sp500_move": 0.2,
    },
    {
        "name": "ISM Manufacturing PMI",
        "frequency": "Monthly (1st business day)",
        "category": "manufacturing",
        "impact": "medium",
        "description": "Purchasing Managers Index. Above 50 = expansion. Below 50 = contraction.",
        "avg_sp500_move": 0.6,
    },
    {
        "name": "Consumer Confidence",
        "frequency": "Monthly",
        "category": "consumer",
        "impact": "medium",
        "description": "Survey of consumer sentiment about economic conditions.",
        "avg_sp500_move": 0.3,
    },
    {
        "name": "FOMC Meeting Minutes",
        "frequency": "3 weeks after FOMC",
        "category": "monetary_policy",
        "impact": "medium",
        "description": "Detailed record of FOMC deliberations. Reveals policy thinking.",
        "avg_sp500_move": 0.4,
    },
    {
        "name": "Housing Starts",
        "frequency": "Monthly",
        "category": "housing",
        "impact": "low",
        "description": "New residential construction started. Housing sector health.",
        "avg_sp500_move": 0.2,
    },
    {
        "name": "PCE Price Index",
        "frequency": "Monthly",
        "category": "inflation",
        "impact": "high",
        "description": "Fed's preferred inflation gauge. Personal Consumption Expenditures.",
        "avg_sp500_move": 0.8,
    },
]


async def get_economic_calendar() -> dict:
    """Return economic events with impact ratings."""
    now = datetime.now(timezone.utc)

    # Generate approximate upcoming dates for recurring events
    events = []
    for event in RECURRING_EVENTS:
        # Create a plausible next occurrence
        if "Weekly" in event["frequency"]:
            # Next Thursday
            days_ahead = (3 - now.weekday()) % 7
            next_date = now + timedelta(days=days_ahead if days_ahead > 0 else 7)
        elif "1st Friday" in event["frequency"]:
            # Next first Friday of month
            first_day = (now.replace(day=1) + timedelta(days=32)).replace(day=1)
            days_to_friday = (4 - first_day.weekday()) % 7
            next_date = first_day + timedelta(days=days_to_friday)
        elif "1st business day" in event["frequency"]:
            first_day = (now.replace(day=1) + timedelta(days=32)).replace(day=1)
            while first_day.weekday() >= 5:
                first_day += timedelta(days=1)
            next_date = first_day
        elif "Quarterly" in event["frequency"]:
            quarter_month = ((now.month - 1) // 3 + 1) * 3 + 1
            if quarter_month > 12:
                next_date = now.replace(year=now.year + 1, month=quarter_month - 12, day=28)
            else:
                next_date = now.replace(month=quarter_month, day=28)
        elif "6-8 weeks" in event["frequency"]:
            next_date = now + timedelta(weeks=6)
        else:
            # Monthly — mid-month
            if now.day > 15:
                next_month = now.replace(day=15) + timedelta(days=32)
                next_date = next_month.replace(day=15)
            else:
                next_date = now.replace(day=15)

        days_until = (next_date.date() - now.date()).days

        events.append({
            **event,
            "estimated_date": next_date.strftime("%Y-%m-%d"),
            "days_until": max(0, days_until),
        })

    events.sort(key=lambda x: x["days_until"])

    return {
        "events": events,
        "categories": list(set(e["category"] for e in events)),
        "generated_at": now.isoformat(),
    }
