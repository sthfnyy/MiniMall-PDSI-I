from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    supabase_jwt_secret: str

    model_config = SettingsConfigDict(env_file="backend/.env", extra="ignore")


settings = Settings()
