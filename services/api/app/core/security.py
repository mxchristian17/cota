from datetime import UTC, datetime, timedelta
from uuid import uuid4

import bcrypt
from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt


def hash_password(password: str) -> str:
    # bcrypt only uses the first 72 bytes; the schema rejects longer values before this point.
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (TypeError, ValueError):
        return False


def create_access_token(
    subject: str,
    secret: str,
    algorithm: str,
    expire_minutes: int,
    issuer: str,
    audience: str,
) -> str:
    now = datetime.now(UTC)
    expire = now + timedelta(minutes=expire_minutes)
    return jwt.encode(
        {
            "sub": subject,
            "exp": expire,
            "iat": now,
            "nbf": now,
            "iss": issuer,
            "aud": audience,
            "jti": uuid4().hex,
        },
        secret,
        algorithm=algorithm,
    )


def decode_token(token: str, secret: str, algorithm: str, issuer: str, audience: str) -> str | None:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[algorithm],
            issuer=issuer,
            audience=audience,
            options={"require_sub": True, "require_exp": True, "require_iat": True},
        )
        subject = payload.get("sub")
        return subject if isinstance(subject, str) else None
    except JWTError:
        return None


def encrypt_secret(value: str, encryption_key: str) -> str:
    return Fernet(encryption_key.encode("utf-8")).encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str, encryption_key: str) -> str:
    try:
        return Fernet(encryption_key.encode("utf-8")).decrypt(value.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise ValueError("Stored secret cannot be decrypted") from exc
