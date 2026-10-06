"""Demo clock. The calendar date is pinned so overdue/today/upcoming stay consistent;
the time-of-day is real so new events sort correctly."""
from datetime import datetime, timedelta

TODAY = "2026-10-06"


def now() -> str:
    t = datetime.now().strftime("%H:%M:%S")
    return f"{TODAY}T{t}"


def d(offset: int) -> str:
    """Date string offset from the demo date."""
    base = datetime.strptime(TODAY, "%Y-%m-%d")
    return (base + timedelta(days=offset)).strftime("%Y-%m-%d")


def dt(offset: int, hhmm: str = "10:00") -> str:
    return f"{d(offset)}T{hhmm}:00"
