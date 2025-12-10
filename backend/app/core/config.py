from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str
    API_V1_STR: str
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    DATABASE_URL: str
    SILICONFLOW_API_KEY: Optional[str] = None
    
    # 图片存储路径
    UPLOAD_DIR: str = "static/uploads"
    THUMBNAIL_DIR: str = "static/thumbnails"

    class Config:
        env_file = ".env"

settings = Settings()