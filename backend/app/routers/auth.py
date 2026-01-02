from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from jose import jwt, JWTError

from app.db.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, Token
from app.services import auth_service
from app.core.security import create_access_token
from app.core.config import settings

router = APIRouter()

# 定义 OAuth2 Scheme，告诉 Swagger UI 登录接口在哪里
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# --- 补充缺失的 get_current_user 函数 ---
async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    """
    解析 Token 并获取当前登录用户对象
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # 解码 JWT
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # 查数据库
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalars().first()
    
    if user is None:
        raise credentials_exception
        
    return user

# --- 原有的路由 ---

@router.post("/register", response_model=UserResponse)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    return await auth_service.create_user(db, user)

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await auth_service.authenticate_user(db, form_data.username, form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.username, "id": user.id})
    return {"access_token": access_token, "token_type": "bearer"}