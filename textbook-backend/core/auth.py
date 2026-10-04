"""Verify Supabase access tokens; request-supplied IDs never establish identity."""
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.concurrency import run_in_threadpool

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str
    name: str | None = None


async def require_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> AuthUser:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Sign in to access saved conversations", headers={"WWW-Authenticate": "Bearer"})
    # get_user(token) verifies against the project's Auth service. It does not
    # mutate the shared Storage client's session or trust decoded JWT claims.
    from db.supabase import supabase_client
    from supabase_auth.errors import AuthApiError
    try:
        result = await run_in_threadpool(supabase_client.auth.get_user, credentials.credentials)
    except AuthApiError as error:
        status = getattr(error, "status", None)
        if str(status) in {"400", "401", "403"}:
            raise HTTPException(401, "Your session has expired; sign in again", headers={"WWW-Authenticate": "Bearer"}) from None
        raise HTTPException(503, "Sign-in verification is temporarily unavailable") from None
    except Exception:
        raise HTTPException(503, "Sign-in verification is temporarily unavailable") from None
    user = result.user
    if not user:
        raise HTTPException(401, "Invalid session", headers={"WWW-Authenticate": "Bearer"})
    try:
        user_id = str(UUID(str(user.id)))
    except ValueError:
        raise HTTPException(401, "Invalid session") from None
    if not user.email:
        raise HTTPException(403, "Saved conversations require an account with an email address")
    return AuthUser(user_id, user.email, (user.user_metadata or {}).get("full_name"))


def check_user_id(supplied: str | None, user: AuthUser) -> None:
    if supplied is not None and supplied != user.id:
        raise HTTPException(403, "The requested workspace does not belong to your account")
