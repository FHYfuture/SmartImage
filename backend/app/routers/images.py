from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from app.db.database import get_db
from app.models.image import Image, Tag
from app.models.user import User
from app.schemas.image import ImageResponse
from app.services.image_service import process_upload
from app.core.security import settings
from jose import jwt, JWTError
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import selectinload, attributes
router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid auth")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid auth")
    
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@router.post("/upload", response_model=ImageResponse)
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    # 处理图片文件
    metadata = await process_upload(file, current_user.id)
    
    new_image = Image(
        user_id=current_user.id,
        filename=metadata["filename"],
        file_path=metadata["file_path"],
        thumbnail_path=metadata["thumbnail_path"],
        resolution=metadata["resolution"],
        capture_time=metadata["capture_time"],
        location=metadata["location"]
    )
    
    db.add(new_image)
    await db.commit()
    await db.refresh(new_image)
    attributes.set_committed_value(new_image, "tags", [])
    return new_image

@router.get("/", response_model=List[ImageResponse])
async def get_images(
    skip: int = 0, 
    limit: int = 20, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 使用 selectinload 预加载 tags 防止 N+1 问题
    stmt = (
        select(Image)
        .where(Image.user_id == current_user.id)
        .options(selectinload(Image.tags))
        .offset(skip)
        .limit(limit)
        .order_by(Image.upload_time.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()