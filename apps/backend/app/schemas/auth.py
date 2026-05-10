from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    identifier: str = Field(validation_alias="username")
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
    model_config = ConfigDict(populate_by_name=True)

    identifier: str = Field(validation_alias="username")
    portal: str | None = None


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str


class PasswordResetTokenResponse(BaseModel):
    message: str
    reset_token: str | None = None
    reset_link: str | None = None


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
    is_super_admin: bool = False
    session_id: str | None = None
    employee_id: str | None = None
    employee_role: str | None = None
    admin_role_id: str | None = None
    admin_role_name: str | None = None
    admin_permissions: dict[str, dict[str, bool]] = {}
    customer_id: str | None = None
    display_name: str | None = None
