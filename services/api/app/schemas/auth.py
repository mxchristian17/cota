from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class CredentialsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=12, max_length=72)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 bytes")
        return value


class RegisterIn(CredentialsIn):
    pass


class LoginIn(CredentialsIn):
    pass


class UserOut(BaseModel):
    id: int
    email: str


class SessionOut(BaseModel):
    user: UserOut
