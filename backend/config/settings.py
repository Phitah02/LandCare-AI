from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from dotenv import load_dotenv

load_dotenv()
from typing import List


class Settings(BaseSettings):
    app_name: str = Field(default="LandCare AI", env="APP_NAME")
    debug: bool = Field(default=False, env="DEBUG")
    secret_key: str = Field(..., env="SECRET_KEY")

    # CORS
    cors_origins: List[str] = Field(default=["http://localhost:3000", "http://localhost:5000"], env="CORS_ORIGINS")

    # Supabase
    supabase_url: str = Field(..., env="SUPABASE_URL")
    supabase_key: str = Field(..., env="SUPABASE_KEY")

    # Google Earth Engine
    gee_service_account: str = Field(default="test@example.com", env="GOOGLE_CLIENT_EMAIL")
    gee_private_key: str = Field(default="test_key", env="GOOGLE_PRIVATE_KEY")

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra='ignore')


settings = Settings()