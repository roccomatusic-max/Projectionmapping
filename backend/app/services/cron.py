"""Five-field cron expressions, matched against a timestamp.

Supports ``*``, ``*/n``, ``a-b``, ``a-b/n``, ``a/n`` (from a, every n),
lists, and month / weekday names. Sunday is 0 or 7. As in cron, when both
day-of-month and day-of-week are restricted the expression matches if
EITHER does.
"""

from __future__ import annotations

from datetime import datetime

MONTHS = {name: i + 1 for i, name in enumerate(
    ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
)}
WEEKDAYS = {name: i for i, name in enumerate(
    ("sun", "mon", "tue", "wed", "thu", "fri", "sat")
)}

#: (min, max) per field: minute, hour, day-of-month, month, day-of-week.
RANGES = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 7))


class CronError(ValueError):
    pass


def _atom(token: str, low: int, high: int, names: dict[str, int]) -> int:
    token = token.lower()
    if token in names:
        return names[token]
    try:
        value = int(token)
    except ValueError as exc:
        raise CronError(f"{token!r} is not a number") from exc
    if not low <= value <= high:
        raise CronError(f"{value} is outside {low}-{high}")
    return value


def _field(expr: str, low: int, high: int, names: dict[str, int]) -> set[int]:
    values: set[int] = set()
    for part in expr.split(","):
        part = part.strip()
        if not part:
            raise CronError("empty list element")
        step = 1
        if "/" in part:
            part, step_text = part.split("/", 1)
            step = _atom(step_text, 1, high, {})
            if part == "*":
                start, end = low, high
            elif "-" in part:
                a, b = part.split("-", 1)
                start, end = _atom(a, low, high, names), _atom(b, low, high, names)
            else:
                start, end = _atom(part, low, high, names), high
        elif part == "*":
            start, end = low, high
        elif "-" in part:
            a, b = part.split("-", 1)
            start, end = _atom(a, low, high, names), _atom(b, low, high, names)
        else:
            start = end = _atom(part, low, high, names)
        if start > end:
            raise CronError(f"range {expr!r} runs backwards")
        values.update(range(start, end + 1, step))
    return values


def parse(expression: str) -> tuple[set[int], ...]:
    fields = expression.split()
    if len(fields) != 5:
        raise CronError(
            f"expected 5 fields (minute hour day month weekday), got {len(fields)}"
        )
    parsed = []
    for index, (text, (low, high)) in enumerate(zip(fields, RANGES, strict=True)):
        names = MONTHS if index == 3 else WEEKDAYS if index == 4 else {}
        parsed.append(_field(text, low, high, names))
    minute, hour, dom, month, dow = parsed
    if 7 in dow:
        dow = (dow - {7}) | {0}
    return minute, hour, dom, month, dow


def matches(expression: str, when: datetime) -> bool:
    """True if ``when`` (to the minute) satisfies ``expression``."""
    minute, hour, dom, month, dow = parse(expression)
    fields = expression.split()
    # As in Vixie cron, a field beginning with '*' (including '*/2') counts
    # as unrestricted for the day-of-month OR day-of-week rule.
    dom_restricted = not fields[2].startswith("*")
    dow_restricted = not fields[4].startswith("*")
    cron_dow = (when.weekday() + 1) % 7  # Python Mon=0 -> cron Sun=0
    if when.minute not in minute or when.hour not in hour or when.month not in month:
        return False
    dom_ok = when.day in dom
    dow_ok = cron_dow in dow
    if dom_restricted and dow_restricted:
        return dom_ok or dow_ok
    return dom_ok and dow_ok


def validate(expression: str) -> None:
    """Raise :class:`CronError` if the expression does not parse."""
    parse(expression)
