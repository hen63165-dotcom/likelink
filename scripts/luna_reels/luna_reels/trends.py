"""What people in Israel are searching for today, used only where it fits.

Source: Google Trends' public daily feed for Israel (RSS, free, no key):
https://trends.google.com/trending/rss?geo=IL . (pytrends' trending_searches
is unmaintained and often fails; the RSS feed is what Google serves today.)

A trend changes a hook only when it really matches the episode's own topics
(the same rule as LikeLoop's trend hook in src/lib/growth/likeloop.js):
daily trends are mostly news, sport and sometimes tragedies, and gluing a
product reel to an unrelated or sad headline is spam. No match → no trend.
Calendar moments that are facts (11.11, Black Friday) are matched the same way.
"""
from __future__ import annotations

import datetime as dt
import re
import xml.etree.ElementTree as ET

import requests

FEED = "https://trends.google.com/trending/rss?geo=IL"
UA = {"User-Agent": "LikeLink-LunaReels/1.0 (+https://likelink2.vercel.app)"}


def fetch(timeout: int = 20) -> list[str]:
    """Today's trending searches in Israel (titles only). [] when the feed is unreachable."""
    try:
        r = requests.get(FEED, headers=UA, timeout=timeout)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        return [t.text.strip() for t in root.iter("title") if t.text and t.text.strip() and "Daily Search Trends" not in t.text][:40]
    except Exception:  # noqa: BLE001 (no trends is a normal answer)
        return []


def _stem(word: str) -> str:
    w = re.sub(r"[^\w]", "", word).translate(str.maketrans("ךםןףץ", "כמנפצ"))
    w = re.sub(r"^(ה|ו|ב|ל|מ|ש|כ)(?=\w{3,})", "", w)
    return w[:4].lower()


def matches(trend: str, topics: list[str]) -> str | None:
    """The topic word a trend matches (Hebrew 4-letter stem or a Latin word), or None."""
    stems = {_stem(t): t for topic in topics for t in topic.split() if len(_stem(t)) >= 3}
    for word in trend.split():
        s = _stem(word)
        if len(s) >= 3 and s in stems:
            return stems[s]
    return None


def calendar(today: dt.date | None = None, horizon_days: int = 35) -> list[str]:
    """Shopping dates that are facts, when they are near: 11.11 and Black Friday."""
    today = today or dt.date.today()
    out = []
    singles = dt.date(today.year, 11, 11)
    if 0 <= (singles - today).days <= horizon_days:
        out.append("11.11")
    nov30 = dt.date(today.year, 11, 30)
    black_friday = nov30 - dt.timedelta(days=(nov30.weekday() - 4) % 7)
    if 0 <= (black_friday - today).days <= horizon_days:
        out.append("בלאק פריידיי")
    return out


def trend_hook(base_hook: str, topics: list[str], *, trends: list[str] | None = None,
               today: dt.date | None = None) -> tuple[str, dict] | None:
    """A hook that opens with a matching trend or date, and where it came from."""
    plain = base_hook.replace("*", "")
    for moment in calendar(today):
        if matches(moment, topics) or moment in " ".join(topics):
            return f"{moment} מתקרב: {plain}", {"term": moment, "source": "calendar", "date": str(today or dt.date.today())}
    for trend in trends if trends is not None else fetch():
        word = matches(trend, topics)
        if word and len(trend) <= 22:
            return f"{trend}? {plain}", {"term": trend, "source": FEED, "matched": word}
    return None
