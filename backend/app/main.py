from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, images
from app.db.database import engine
from app.db.base import Base  # 确保导入了刚才建立的 Base
from app.core.config import settings

# --- 新的 Lifespan (生命周期) 定义 ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. 启动时执行 (Startup)
    print("正在启动数据库连接...")
    async with engine.begin() as conn:
        # 开发模式下自动创建表
        await conn.run_sync(Base.metadata.create_all)
    print("数据库连接成功，表结构已同步。")
    
    yield  # 服务运行期间，代码会停在这里
    
    # 2. 关闭时执行 (Shutdown)
    print("正在关闭数据库连接...")
    await engine.dispose()
    print("数据库连接已关闭。")

# --- 初始化 App ---
# 将 lifespan 函数传入 FastAPI 构造函数
app = FastAPI(
    title=settings.PROJECT_NAME, 
    lifespan=lifespan 
)

# CORS 设置
origins = [
    "http://localhost",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")

# 注册路由
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(images.router, prefix="/api/images", tags=["Images"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Picture Management System API"}