"""Authenticate persisted notebook operations against Supabase Auth."""
from dataclasses import dataclass
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.concurrency import run_in_threadpool

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str


async def require_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if not credentials:
        raise HTTPException(401, "Sign in to access your conversations.")
    from db.supabase import supabase_client
    try:
        result = await run_in_threadpool(supabase_client.auth.get_user, credentials.credentials)
    except Exception:
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    if not result.user or not result.user.email:
        raise HTTPException(401, "A signed-in account is required.")
    return AuthenticatedUser(id=result.user.id, email=result.user.email)
