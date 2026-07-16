"""Tiny shared helper for the T-004 model modules. Deliberately not merged
into platform.py's private _utcnow: platform.py is T-003 territory and this
package keeps each ticket's slice independently readable.
"""

from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
