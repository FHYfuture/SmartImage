from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, attributes
from typing import List, Optional
from datetime import date

from app.db.database import get_db, SessionLocal
from app.models.image import Image, Tag
from app.models.user import User
from app.schemas.image import ImageResponse, ImageUpdate
from app.services.image_service import process_upload, delete_image_files, analyze_image_with_ai
from app.core.config import settings
from app.routers.auth import get_current_user

router = APIRouter()

# --- 辅助函数：AI 后台任务 ---
async def background_ai_analysis(image_id: int, file_path: str):
    """
    后台任务：分析图片并更新数据库
    注意：这里通过 SessionLocal 创建新的数据库会话，因为请求上下文已结束
    """
    if not settings.SILICONFLOW_API_KEY:
        return

    async with SessionLocal() as db:
        try:
            # 调用 AI 服务 (image_service.py 中定义的)
            description = await analyze_image_with_ai(file_path, settings.SILICONFLOW_API_KEY)
            
            if description:
                # 重新查询图片
                result = await db.execute(select(Image).where(Image.id == image_id))
                img = result.scalars().first()
                if img:
                    img.ai_description = description
                    # 这里简化处理：如果 AI 返回了特定格式，也可以自动添加 Tag
                    # 例如：if "风景" in description: ...
                    await db.commit()
                    print(f"AI Analysis complete for Image {image_id}")
        except Exception as e:
            print(f"AI Analysis failed: {e}")

# --- API 接口 ---

@router.post("/upload", response_model=ImageResponse)
async def upload_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    # 1. 处理文件 (保存到硬盘, 提取 EXIF)
    metadata = await process_upload(file, current_user.id)
    
    # 2. 创建数据库对象
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
    
    # 3. 【关键修复】强制设置 tags 为空列表，防止 Pydantic 序列化时触发隐式查询报错
    attributes.set_committed_value(new_image, "tags", [])

    # 4. 添加后台任务：AI 分析
    if settings.SILICONFLOW_API_KEY:
        background_tasks.add_task(background_ai_analysis, new_image.id, new_image.file_path)

    return new_image

@router.get("/", response_model=List[ImageResponse])
async def get_images(
    tag: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    skip: int = 0, 
    limit: int = 20, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 构建查询语句，预加载 tags 防止 N+1 问题
    stmt = (
        select(Image)
        .where(Image.user_id == current_user.id)
        .options(selectinload(Image.tags))
    )
    
    # 筛选条件 1: 标签
    if tag:
        stmt = stmt.join(Image.tags).where(Tag.name.contains(tag))
    
    # 筛选条件 2: 日期
    if start_date:
        stmt = stmt.where(Image.upload_time >= start_date)
    if end_date:
        stmt = stmt.where(Image.upload_time <= end_date)

    # 排序与分页
    stmt = stmt.order_by(Image.upload_time.desc()).offset(skip).limit(limit)
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{image_id}", response_model=ImageResponse)
async def get_image_detail(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取单张图片详情"""
    stmt = (
        select(Image)
        .where(Image.id == image_id, Image.user_id == current_user.id)
        .options(selectinload(Image.tags))
    )
    result = await db.execute(stmt)
    image = result.scalars().first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
        
    return image

@router.delete("/{image_id}")
async def delete_image(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. 查询图片 (确保属于当前用户)
    result = await db.execute(select(Image).where(Image.id == image_id, Image.user_id == current_user.id))
    image = result.scalars().first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # 2. 删除物理文件 (调用 service 层)
    delete_image_files(image.file_path, image.thumbnail_path)
    
    # 3. 删除数据库记录
    await db.delete(image)
    await db.commit()
    
    return {"message": "Image deleted successfully"}

@router.put("/{image_id}", response_model=ImageResponse)
async def update_image_info(
    image_id: int,
    update_data: ImageUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. 获取图片并预加载 tags
    stmt = (
        select(Image)
        .where(Image.id == image_id, Image.user_id == current_user.id)
        .options(selectinload(Image.tags))
    )
    result = await db.execute(stmt)
    image = result.scalars().first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # 2. 更新标签 (如果前端传了 custom_tags)
    if update_data.custom_tags is not None:
        new_tag_list = []
        for tag_name in update_data.custom_tags:
            tag_name = tag_name.strip()
            if not tag_name: 
                continue
                
            # 查找标签是否存在，不存在则创建
            tag_res = await db.execute(select(Tag).where(Tag.name == tag_name))
            tag = tag_res.scalars().first()
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
            new_tag_list.append(tag)
        
        # 更新关系 (SQLAlchemy 会自动处理中间表)
        image.tags = new_tag_list
        
    await db.commit()
    await db.refresh(image)
    return image