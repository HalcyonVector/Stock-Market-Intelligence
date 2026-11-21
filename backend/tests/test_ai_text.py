"""Emoji are stripped from LLM text before it reaches the UI."""
from app.adapters.ai import strip_emoji


def test_strip_emoji_removes_pictographs_and_keeps_text():
    text = "📈 **Markets** rose 🚀 today\n- 🔴 Risk: rates ⚠️ high\n  - nested stays indented\n₹5,000 → 3% ✓"
    assert strip_emoji(text) == (
        "**Markets** rose today\n- Risk: rates high\n  - nested stays indented\n₹5,000 → 3%"
    )


def test_strip_emoji_leaves_plain_text_alone():
    text = "## Outlook\n\nNifty -0.4%, S&P 500 +1.2% (beta 0.25).\n  1. Watch IT stocks"
    assert strip_emoji(text) == text
