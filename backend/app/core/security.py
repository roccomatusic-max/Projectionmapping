"""Password hashing, device-credential encryption, and JWTs."""

from __future__ import annotations

import base64
import hashlib
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

_hasher = PasswordHasher()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        _hasher.verify(hashed, password)
        return True
    except (VerifyMismatchError, InvalidHashError, ValueError):
        return False


def needs_rehash(hashed: str) -> bool:
    try:
        return _hasher.check_needs_rehash(hashed)
    except (InvalidHashError, ValueError):
        return True


def _fernet() -> Fernet:
    """Device-credential key, derived from SECRET_KEY.

    Device passwords must be replayable to the projector, so they are
    encrypted rather than hashed. Rotating SECRET_KEY therefore makes stored
    device passwords unreadable — the deployment docs say so explicitly.
    """
    digest = hashlib.sha256(settings.secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str | None) -> str | None:
    if plaintext is None or plaintext == "":
        return None
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str | None) -> str | None:
    if not ciphertext:
        return None
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, ValueError):
        # Key rotated, or the value predates encryption. Surface as "no
        # credential" rather than crashing a poll loop.
        return None


def create_access_token(subject: str, role: str, expires_minutes: int | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(
        minutes=expires_minutes or settings.access_token_minutes
    )
    payload = {"sub": subject, "role": role, "exp": expire,
               "iat": datetime.now(UTC)}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


def token_predates(payload: dict[str, Any], created_at: datetime | None) -> bool:
    """True if the token was issued before this account existed.

    Deleting a user revokes its tokens only while the name stays unused: a
    token from a deleted account must not open a new account of the same
    name. ``iat`` is whole seconds, hence the one-second allowance.
    """
    issued = payload.get("iat")
    if not isinstance(issued, int | float) or created_at is None:
        return False
    if created_at.tzinfo is None:  # SQLite hands datetimes back naive
        created_at = created_at.replace(tzinfo=UTC)
    return issued < created_at.timestamp() - 1


class HideTokens(logging.Filter):
    """uvicorn logs each WebSocket's path with its query string, and a
    browser can only send its sign-in token there; keep it out of logs."""

    TOKEN = re.compile(r"(token=)[^&\s\"]+")

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(self.TOKEN.sub(r"\1hidden", a) if isinstance(a, str) else a
                                for a in record.args)
        return True
