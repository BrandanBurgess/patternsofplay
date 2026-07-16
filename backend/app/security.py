"""Password hashing and join code generation.

Password hashing uses stdlib PBKDF2-HMAC-SHA256 rather than an extra
compiled dependency (bcrypt/argon2), which keeps `make bootstrap`
dependency-free of native extensions while remaining a defensible KDF
for pilot scale. Revisit if a security review calls for argon2id.
"""

import hashlib
import hmac
import secrets

_PBKDF2_ITERATIONS = 260_000
_SALT_BYTES = 16

# Excludes 0/O and 1/I so a coach can read a join code aloud without
# ambiguity.
_JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_JOIN_CODE_LENGTH = 6


def hash_password(password: str) -> str:
    salt = secrets.token_hex(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), _PBKDF2_ITERATIONS
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt, expected_hex = password_hash.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), _PBKDF2_ITERATIONS
    )
    return hmac.compare_digest(digest.hex(), expected_hex)


def generate_join_code() -> str:
    return "".join(secrets.choice(_JOIN_CODE_ALPHABET) for _ in range(_JOIN_CODE_LENGTH))
