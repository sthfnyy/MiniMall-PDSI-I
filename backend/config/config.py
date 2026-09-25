from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # string de conexão direta ao Postgres do Supabase
    # (Project Settings -> Database -> Connection string)
    database_url: str

    # Project Settings -> API -> JWT Secret
    supabase_jwt_secret: str

    model_config = SettingsConfigDict(env_file="backend/.env", extra="ignore")


settings = Settings()
