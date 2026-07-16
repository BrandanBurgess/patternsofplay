"""Environment-driven config for auth. DATABASE_URL itself is read in
app/db.py (T-001 scaffold); this module holds the T-003 auth settings so
they are not scattered across routers.
"""

import os

# JWT signing secret. Must be overridden via env in any deployed environment;
# the fallback here is only so local dev and tests do not require setup.
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-insecure-secret-change-in-prod-please-32b")
JWT_ALGORITHM = "HS256"
JWT_TTL_SECONDS = 60 * 60 * 24 * 14  # 14 days

SESSION_COOKIE_NAME = "pop_session"

# Cookies must be Secure in any real (https) deployment. Local dev and the
# test suite run over http, so this defaults to false and is flipped by env
# at deploy time (doc 04 section 2: environment-driven config).
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
