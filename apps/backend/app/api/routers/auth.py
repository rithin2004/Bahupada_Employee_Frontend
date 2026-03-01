import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import APIRouter, Depends, Header, HTTPException, Path, status
from jose import JWTError, jwt
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, hash_password, verify_password
from app.db.session import get_db
from app.models.entities import (
    AccountType,
    Customer,
    Employee,
    EmployeeRole,
    Permission,
    PortalScope,
    Role,
    RolePermission,
    User,
    UserSession,
)
from app.schemas.auth import (
    AuthUserInfo,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    PasswordChangeRequest,
    PasswordResetTokenResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SessionInfo,
    TokenPair,
)

router = APIRouter()
RESET_TOKEN_MINUTES = 30


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _infer_portal_scope(
    user: User,
    employee: Employee | None,
    role: Role | None,
) -> str:
    if user.account_type == AccountType.CUSTOMER:
        return PortalScope.BOTH.value
    if user.account_type == AccountType.SYSTEM:
        return PortalScope.BOTH.value
    if role is not None:
        return role.portal_scope.value
    if employee is not None and employee.role == EmployeeRole.ADMIN:
        return PortalScope.ADMIN.value
    return PortalScope.EMPLOYEE.value


def _normalize_portal(portal: str | None) -> str | None:
    if portal is None:
        return None
    normalized = portal.strip().upper()
    if normalized not in {"ADMIN", "EMPLOYEE", "CUSTOMER"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported portal")
    return normalized


def _portal_matches(portal: str, user: User, employee: Employee | None, portal_scope: str) -> bool:
    if portal == "CUSTOMER":
        return user.account_type == AccountType.CUSTOMER
    if user.account_type == AccountType.CUSTOMER:
        return False
    if portal == "ADMIN":
        return portal_scope in {PortalScope.ADMIN.value, PortalScope.BOTH.value} or (
            employee is not None and employee.role == EmployeeRole.ADMIN
        )
    return portal_scope in {PortalScope.EMPLOYEE.value, PortalScope.BOTH.value}


def _get_display_name(
    user: User,
    employee: Employee | None,
    customer: Customer | None,
) -> str | None:
    if customer is not None:
        return customer.name
    if employee is not None:
        return employee.full_name
    if user.username:
        return user.username
    if user.email:
        return user.email
    if user.phone:
        return user.phone
    return None


def _auth_user_info(
    user: User,
    portal: str,
    portal_scope: str,
    session_id: str | None,
    employee: Employee | None,
    customer: Customer | None,
) -> AuthUserInfo:
    display_name = _get_display_name(user, employee, customer)
    return AuthUserInfo(
        user_id=str(user.id),
        account_type=user.account_type.value,
        portal=portal,
        portal_scope=portal_scope,
        session_id=session_id,
        employee_id=str(employee.id) if employee is not None else None,
        customer_id=str(customer.id) if customer is not None else None,
        display_name=display_name,
    )


async def _load_linked_entities(db: AsyncSession, user: User) -> tuple[Employee | None, Role | None, Customer | None]:
    employee = await db.get(Employee, user.employee_id) if user.employee_id else None
    role = await db.get(Role, employee.role_id) if employee and employee.role_id else None
    customer = await db.get(Customer, user.customer_id) if user.customer_id else None
    return employee, role, customer


async def _find_user(db: AsyncSession, identifier: str, portal: str | None) -> User | None:
    normalized = identifier.strip()
    if portal is None:
        stmt = select(User).where(or_(User.username == normalized, User.email == normalized, User.phone == normalized))
        return (await db.execute(stmt.limit(1))).scalar_one_or_none()
    if portal == "CUSTOMER":
        stmt = select(User).where(
            User.account_type == AccountType.CUSTOMER,
            or_(User.username == normalized, User.email == normalized, User.phone == normalized),
        )
        return (await db.execute(stmt.limit(1))).scalar_one_or_none()

    stmt = select(User).where(
        User.account_type != AccountType.CUSTOMER,
        or_(User.username == normalized, User.email == normalized, User.phone == normalized),
    )
    return (await db.execute(stmt.limit(1))).scalar_one_or_none()


async def _touch_login_failure(db: AsyncSession, user: User) -> None:
    user.failed_login_attempts += 1
    if user.failed_login_attempts >= 5:
        user.locked_until = (_utcnow() + timedelta(minutes=15)).replace(microsecond=0)
    await db.commit()


async def _touch_login_success(db: AsyncSession, user: User) -> None:
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = _utcnow().replace(microsecond=0)
    await db.commit()


def decode_token(token: str) -> dict[str, Any]:
    try:
        decoded = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    return decoded


async def _load_active_session(db: AsyncSession, session_id: str, user_id: str) -> UserSession:
    try:
        parsed_session_id = uuid.UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session") from exc
    session = await db.get(UserSession, parsed_session_id)
    if session is None or str(session.user_id) != str(user_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    if session.revoked or session.expires_at <= _utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    return session


async def _issue_tokens(
    db: AsyncSession,
    user: User,
    employee: Employee | None,
    customer: Customer | None,
    portal_scope: str,
    resolved_portal: str,
    session_id: str | None = None,
) -> TokenPair:
    sid = session_id or str(uuid.uuid4())
    subject = str(user.id)
    display_name = _get_display_name(user, employee, customer)
    access_token = create_access_token(
        subject,
        {
            "account_type": user.account_type.value,
            "employee_role": employee.role.value if employee else None,
            "portal_scope": portal_scope,
            "portal": resolved_portal,
            "employee_id": str(employee.id) if employee else None,
            "customer_id": str(customer.id) if customer else None,
            "sid": sid,
            "display_name": display_name,
        },
    )
    refresh_token = create_refresh_token(subject, {"portal": resolved_portal, "sid": sid})
    expires_at = (_utcnow() + timedelta(days=settings.refresh_token_days)).replace(microsecond=0)

    session = await db.get(UserSession, sid)
    if session is None:
        session = UserSession(
            id=uuid.UUID(sid),
            user_id=user.id,
            refresh_token_hash=_hash_token(refresh_token),
            device_info=None,
            ip_address=None,
            revoked=False,
            expires_at=expires_at,
            created_at=_utcnow().replace(microsecond=0),
        )
        db.add(session)
    else:
        session.refresh_token_hash = _hash_token(refresh_token)
        session.revoked = False
        session.expires_at = expires_at

    await db.commit()
    return TokenPair(access_token=access_token, refresh_token=refresh_token)


def _bool_for_action(record: RolePermission, action_name: str) -> bool:
    action = action_name.lower()
    if action == "create":
        return bool(record.can_create)
    if action in {"read", "view", "list"}:
        return bool(record.can_read)
    if action == "update":
        return bool(record.can_update)
    if action == "delete":
        return bool(record.can_delete)
    return False


async def get_current_auth_info(
    authorization: str = Header(default=""),
) -> AuthUserInfo:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    decoded = decode_token(token)
    if decoded.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    subject = decoded.get("sub")
    session_id = decoded.get("sid")
    if not subject or not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return AuthUserInfo(
        user_id=str(subject),
        account_type=decoded.get("account_type", AccountType.EMPLOYEE.value),
        portal=decoded.get("portal", "EMPLOYEE"),
        portal_scope=decoded.get("portal_scope", PortalScope.EMPLOYEE.value),
        session_id=str(session_id),
        employee_id=decoded.get("employee_id"),
        customer_id=decoded.get("customer_id"),
        display_name=decoded.get("display_name"),
    )


async def require_admin_portal(info: AuthUserInfo = Depends(get_current_auth_info)) -> AuthUserInfo:
    if info.portal != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return info


async def require_employee_or_admin_portal(info: AuthUserInfo = Depends(get_current_auth_info)) -> AuthUserInfo:
    if info.portal not in {"ADMIN", "EMPLOYEE"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return info


async def require_customer_portal(info: AuthUserInfo = Depends(get_current_auth_info)) -> AuthUserInfo:
    if info.portal != "CUSTOMER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customer access required")
    return info


async def require_any_portal(info: AuthUserInfo = Depends(get_current_auth_info)) -> AuthUserInfo:
    return info


def require_module_access(module_name: str) -> Callable[..., Any]:
    async def dependency(
        info: AuthUserInfo = Depends(get_current_auth_info),
        db: AsyncSession = Depends(get_db),
    ) -> AuthUserInfo:
        if info.portal == "CUSTOMER":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
        if info.portal == "ADMIN" or info.account_type == AccountType.SYSTEM.value:
            return info
        stmt = (
            select(RolePermission)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .join(Role, Role.id == RolePermission.role_id)
            .join(Employee, Employee.role_id == Role.id)
            .where(
                Employee.id == uuid.UUID(info.employee_id),
                Permission.module_name == module_name,
            )
            .limit(50)
        )
        rows = (await db.execute(stmt)).scalars().all()
        allowed = any(record.can_create or record.can_read or record.can_update or record.can_delete for record in rows)
        if not allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"{module_name} access denied")
        return info

    return dependency


def require_permission(module_name: str, action_name: str) -> Callable[..., Any]:
    async def dependency(
        info: AuthUserInfo = Depends(get_current_auth_info),
        db: AsyncSession = Depends(get_db),
    ) -> AuthUserInfo:
        if info.portal == "CUSTOMER":
            if module_name == "sales" and action_name == "create":
                return info
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
        if info.portal == "ADMIN" or info.account_type == AccountType.SYSTEM.value:
            return info
        stmt = (
            select(RolePermission)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .join(Role, Role.id == RolePermission.role_id)
            .join(Employee, Employee.role_id == Role.id)
            .where(
                Employee.id == uuid.UUID(info.employee_id),
                Permission.module_name == module_name,
                Permission.action_name == action_name,
            )
            .limit(1)
        )
        record = (await db.execute(stmt)).scalar_one_or_none()
        if record is None or not _bool_for_action(record, action_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {module_name}.{action_name}",
            )
        return info

    return dependency


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    requested_portal = _normalize_portal(payload.portal)
    user = await _find_user(db, payload.username, requested_portal)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.locked_until and user.locked_until > _utcnow():
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Account locked")

    if not verify_password(payload.password, user.password_hash):
        await _touch_login_failure(db, user)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    await _touch_login_success(db, user)

    employee, role, customer = await _load_linked_entities(db, user)
    portal_scope = _infer_portal_scope(user, employee, role)
    resolved_portal = requested_portal or ("CUSTOMER" if user.account_type == AccountType.CUSTOMER else "EMPLOYEE")
    if not _portal_matches(resolved_portal, user, employee, portal_scope):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Portal access denied")

    return await _issue_tokens(db, user, employee, customer, portal_scope, resolved_portal)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    decoded = decode_token(payload.refresh_token)
    if decoded.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    subject = decoded.get("sub")
    session_id = decoded.get("sid")
    if not subject or not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await db.get(User, subject)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive account")

    session = await _load_active_session(db, str(session_id), str(user.id))
    if session.refresh_token_hash != _hash_token(payload.refresh_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    employee, role, customer = await _load_linked_entities(db, user)
    portal_scope = _infer_portal_scope(user, employee, role)
    resolved_portal = _normalize_portal(decoded.get("portal")) or (
        "CUSTOMER" if user.account_type == AccountType.CUSTOMER else "EMPLOYEE"
    )
    if not _portal_matches(resolved_portal, user, employee, portal_scope):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Portal access denied")

    return await _issue_tokens(db, user, employee, customer, portal_scope, resolved_portal, str(session.id))


@router.get("/me", response_model=AuthUserInfo)
async def me(info: AuthUserInfo = Depends(get_current_auth_info)) -> AuthUserInfo:
    return info


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    payload: PasswordChangeRequest,
    info: AuthUserInfo = Depends(get_current_auth_info),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    user = await db.get(User, info.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive account")
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    sessions = (await db.execute(select(UserSession).where(UserSession.user_id == user.id))).scalars().all()
    for session in sessions:
        session.revoked = True
    await db.commit()
    return MessageResponse(message="Password changed. Please log in again.")


@router.post("/forgot-password", response_model=PasswordResetTokenResponse)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)) -> PasswordResetTokenResponse:
    requested_portal = _normalize_portal(payload.portal)
    user = await _find_user(db, payload.username, requested_portal)
    if user is None or not user.is_active:
        return PasswordResetTokenResponse(message="If the account exists, a reset token has been issued.", reset_token=None)

    employee, role, customer = await _load_linked_entities(db, user)
    portal_scope = _infer_portal_scope(user, employee, role)
    resolved_portal = requested_portal or ("CUSTOMER" if user.account_type == AccountType.CUSTOMER else "EMPLOYEE")
    if not _portal_matches(resolved_portal, user, employee, portal_scope):
        return PasswordResetTokenResponse(message="If the account exists, a reset token has been issued.", reset_token=None)

    reset_token = jwt.encode(
        {
            "sub": str(user.id),
            "type": "reset",
            "portal": resolved_portal,
            "iat": int(_utcnow().timestamp()),
            "exp": int((_utcnow() + timedelta(minutes=RESET_TOKEN_MINUTES)).timestamp()),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    return PasswordResetTokenResponse(
        message="Reset token issued. Use it with /auth/reset-password.",
        reset_token=reset_token,
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    decoded = decode_token(payload.reset_token)
    if decoded.get("type") != "reset":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    subject = decoded.get("sub")
    if not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await db.get(User, subject)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive account")

    user.password_hash = hash_password(payload.new_password)
    sessions = (await db.execute(select(UserSession).where(UserSession.user_id == user.id))).scalars().all()
    for session in sessions:
        session.revoked = True
    await db.commit()
    return MessageResponse(message="Password reset successful. Please log in again.")


@router.get("/sessions", response_model=list[SessionInfo])
async def list_sessions(
    info: AuthUserInfo = Depends(get_current_auth_info),
    db: AsyncSession = Depends(get_db),
) -> list[SessionInfo]:
    sessions = (
        await db.execute(select(UserSession).where(UserSession.user_id == uuid.UUID(info.user_id)).order_by(UserSession.created_at.desc()))
    ).scalars().all()
    return [
        SessionInfo(
            session_id=str(session.id),
            created_at=session.created_at.isoformat(),
            expires_at=session.expires_at.isoformat(),
            revoked=bool(session.revoked),
            is_current=str(session.id) == (info.session_id or ""),
        )
        for session in sessions
    ]


@router.post("/sessions/{session_id}/revoke", response_model=MessageResponse)
async def revoke_session(
    session_id: str = Path(...),
    info: AuthUserInfo = Depends(get_current_auth_info),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    try:
        parsed_session_id = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    session = await db.get(UserSession, parsed_session_id)
    if session is None or str(session.user_id) != info.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    session.revoked = True
    await db.commit()
    return MessageResponse(message="Session revoked.")


@router.post("/logout", response_model=MessageResponse)
async def logout(
    info: AuthUserInfo = Depends(get_current_auth_info),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if info.session_id:
        session = await db.get(UserSession, uuid.UUID(info.session_id))
        if session is not None and str(session.user_id) == info.user_id:
            session.revoked = True
            await db.commit()
    return MessageResponse(message="Logged out")
