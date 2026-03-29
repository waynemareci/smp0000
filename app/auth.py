import os
import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError

_jwks_cache: dict = {}

bearer_scheme = HTTPBearer()


def _get_jwks() -> dict:
    if _jwks_cache:
        return _jwks_cache

    jwks_url = os.getenv("CLERK_JWKS_URL")
    if not jwks_url:
        raise RuntimeError("CLERK_JWKS_URL environment variable is not set")

    # Accept either the bare instance URL or the full JWKS path.
    # e.g. https://foo.clerk.accounts.dev  →  append /.well-known/jwks.json
    if not jwks_url.endswith("/jwks.json") and "/.well-known/" not in jwks_url:
        jwks_url = jwks_url.rstrip("/") + "/.well-known/jwks.json"

    response = httpx.get(jwks_url, timeout=10)
    response.raise_for_status()
    data = response.json()
    _jwks_cache.update(data)
    return _jwks_cache


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        jwks = _get_jwks()
        # Decode header to find the matching key id (kid)
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        # Find the matching public key in the JWKS
        key = next(
            (k for k in jwks.get("keys", []) if k.get("kid") == kid),
            None,
        )
        if key is None:
            raise credentials_exception

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except JWTError:
        raise credentials_exception
    except Exception:
        raise credentials_exception

    clerk_id: str | None = payload.get("sub")
    if not clerk_id:
        raise credentials_exception

    email: str | None = payload.get("email")

    return {"clerk_id": clerk_id, "email": email}