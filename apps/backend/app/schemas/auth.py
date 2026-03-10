from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str
    portal: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    username: str
    portal: str | None = None


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str


class PasswordResetTokenResponse(BaseModel):
    message: str
    reset_token: str | None = None


class MessageResponse(BaseModel):
    message: str


class SessionInfo(BaseModel):
    session_id: str
    created_at: str
    expires_at: str
    revoked: bool
    is_current: bool


class AuthUserInfo(BaseModel):
    user_id: str
    account_type: str
    portal: str
    portal_scope: str | None = None
    session_id: str | None = None
    employee_id: str | None = None
    employee_role: str | None = None
    customer_id: str | None = None
    display_name: str | None = None
