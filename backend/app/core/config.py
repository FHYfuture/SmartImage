import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # 项目基础配置
    PROJECT_NAME: str = "Smart Picture Manager"
    API_V1_STR: str = "/api"
    
    # 存储路径配置
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    UPLOAD_DIR: str = os.path.join(BASE_DIR, "static", "uploads")
    THUMBNAIL_DIR: str = os.path.join(BASE_DIR, "static", "thumbnails")

    # 数据库与安全
    DATABASE_URL: str = ""
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # --- 外部 API 密钥 (自动读取 .env) ---
    SILICONFLOW_API_KEY: str = ""
    AMAP_KEY: str = ""  # <--- 必须添加这行，名字要和 .env 里的一样

    # 配置读取 .env 文件
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()