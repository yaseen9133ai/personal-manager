import base64
import hashlib
import hmac
import secrets

VALID_USERNAME = "user"
VALID_PASSWORD = "password"
SESSION_COOKIE = "session"

# Generated fresh on process start: signed sessions don't need server-side
# storage, but restarting the backend invalidates any existing sessions.
# Acceptable for the MVP's single hardcoded user.
_SECRET_KEY = secrets.token_bytes(32)


def verify_credentials(username: str, password: str) -> bool:
    # Constant-time comparison -- avoids leaking match-length via timing,
    # matching the compare_digest already used for session signatures below.
    return hmac.compare_digest(username, VALID_USERNAME) and hmac.compare_digest(
        password, VALID_PASSWORD
    )


def sign_session(username: str) -> str:
    payload_b64 = base64.urlsafe_b64encode(username.encode()).decode().rstrip("=")
    signature = hmac.new(_SECRET_KEY, payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"


def verify_session(token: str) -> str | None:
    try:
        payload_b64, signature = token.split(".", 1)
    except ValueError:
        return None

    expected = hmac.new(_SECRET_KEY, payload_b64.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None

    padding = "=" * (-len(payload_b64) % 4)
    try:
        return base64.urlsafe_b64decode(payload_b64 + padding).decode()
    except ValueError:
        return None
