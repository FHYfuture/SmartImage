from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# 创建异步引擎
engine = create_async_engine(settings.DATABASE_URL, echo=True)

# 创建异步 Session 工厂
SessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=engine, class_=AsyncSession
)

Base = declarative_base()

# 依赖注入项
async def get_db():
    async with SessionLocal() as session:
        yield session