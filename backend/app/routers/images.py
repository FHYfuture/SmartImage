import os
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import date

from app.db.database import get_db, SessionLocal
from app.models.image import Image, Tag
from app.models.user import User
from app.schemas.image import ImageResponse, ImageUpdate, BatchDeleteRequest
from app.services.image_service import process_upload, delete_image_files, analyze_image_with_ai
from app.core.config import settings
from app.routers.auth import get_current_user

router = APIRouter()

# ==========================================
# 1. 静态与功能性路由
# ==========================================

@router.post("/upload")
async def upload_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    上传图片并自动处理
    """
    # 1. 处理文件 (Service 层)
    metadata = await process_upload(file, current_user.id)
    
    # 2. 存入数据库
    new_image = Image(
        user_id=current_user.id,
        filename=metadata["filename"],
        # 简单处理路径，实际可视需求调整
        file_path=os.path.relpath(metadata["file_path"], start=settings.BASE_DIR) if hasattr(settings, 'BASE_DIR') else metadata["file_path"],
        thumbnail_path=os.path.relpath(metadata["thumbnail_path"], start=settings.BASE_DIR) if hasattr(settings, 'BASE_DIR') else metadata["thumbnail_path"],
        resolution=metadata["resolution"],
        capture_time=metadata["capture_time"],
        location=metadata["location"]
    )
    
    # 修正相对路径
    if os.path.isabs(new_image.file_path):
         new_image.file_path = os.path.relpath(metadata["file_path"], os.getcwd())
         new_image.thumbnail_path = os.path.relpath(metadata["thumbnail_path"], os.getcwd())

    db.add(new_image)
    await db.commit()
    
    # 【关键修复】显式加载 tags，避免 MissingGreenlet 错误
    await db.refresh(new_image, attribute_names=["tags"])
    
    # 3. 处理自动生成的标签 (EXIF/地理位置)
    if metadata["auto_tags"]:
        for tag_name in metadata["auto_tags"]:
            # 查重或创建
            result = await db.execute(select(Tag).where(Tag.name == tag_name))
            tag = result.scalars().first()
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
                await db.commit()
                await db.refresh(tag)
            
            # 此时访问 new_image.tags 是安全的，因为上面已经 refresh 且预加载了
            if tag not in new_image.tags:
                new_image.tags.append(tag)
        
        await db.commit()

    # 4. 添加后台 AI 分析任务
    background_tasks.add_task(
        background_ai_analysis, 
        new_image.id, 
        metadata["file_path"] # 传绝对路径给 AI 读取
    )

    return {"msg": "Upload success", "id": new_image.id, "url": new_image.thumbnail_path}

# --- 批量删除接口 ---
@router.post("/batch-delete")
async def batch_delete_images(
    req: BatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Image).where(Image.user_id == current_user.id).where(Image.id.in_(req.ids))
    result = await db.execute(stmt)
    images = result.scalars().all()
    
    count = 0
    for img in images:
        delete_image_files(img.file_path, img.thumbnail_path)
        await db.delete(img)
        count += 1
        
    await db.commit()
    return {"message": f"Successfully deleted {count} images"}

# --- 图片列表查询 ---
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
    stmt = (
        select(Image)
        .where(Image.user_id == current_user.id)
        .options(selectinload(Image.tags))
    )
    
    if tag:
        stmt = stmt.join(Image.tags).where(Tag.name.contains(tag))
    
    if start_date:
        stmt = stmt.where(Image.upload_time >= start_date)
    if end_date:
        stmt = stmt.where(Image.upload_time <= end_date)

    # 【核心修改】
    # 原来: stmt = stmt.order_by(Image.upload_time.desc()).offset(skip).limit(limit)
    # 修改后: 增加 Image.id.desc() 作为第二排序条件
    stmt = stmt.order_by(
        Image.upload_time.desc(), 
        Image.id.desc()
    ).offset(skip).limit(limit)
    
    result = await db.execute(stmt)
    return result.scalars().all()

# --- 手动触发 AI 分析 ---
@router.post("/{image_id}/analyze")
async def analyze_image_endpoint(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Image).where(Image.id == image_id, Image.user_id == current_user.id)
    result = await db.execute(stmt)
    image = result.scalars().first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
        
    if not settings.SILICONFLOW_API_KEY:
        raise HTTPException(status_code=500, detail="API Key not configured")

    ai_result = await analyze_image_with_ai(image.file_path, settings.SILICONFLOW_API_KEY)
    
    if not ai_result:
        raise HTTPException(status_code=500, detail="AI Analysis failed")
        
    return ai_result

# --- 删除指定标签 ---
@router.delete("/{image_id}/tags/{tag_name}")
async def remove_tag_from_image(
    image_id: int,
    tag_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = (
        select(Image)
        .where(Image.id == image_id, Image.user_id == current_user.id)
        .options(selectinload(Image.tags))
    )
    result = await db.execute(stmt)
    image = result.scalars().first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    tag_to_remove = None
    for tag in image.tags:
        if tag.name == tag_name:
            tag_to_remove = tag
            break
            
    if tag_to_remove:
        image.tags.remove(tag_to_remove)
        await db.commit()
        return {"message": f"Tag '{tag_name}' removed"}
    else:
        raise HTTPException(status_code=404, detail="Tag not found on this image")

# --- 获取详情 ---
@router.get("/{image_id}", response_model=ImageResponse)
async def get_image_detail(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
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

# --- 删除图片 ---
@router.delete("/{image_id}")
async def delete_image(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Image).where(Image.id == image_id, Image.user_id == current_user.id))
    image = result.scalars().first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    delete_image_files(image.file_path, image.thumbnail_path)
    
    await db.delete(image)
    await db.commit()
    
    return {"message": "Image deleted successfully"}

# --- 更新图片信息 ---
@router.put("/{image_id}", response_model=ImageResponse)
async def update_image_info(
    image_id: int,
    update_data: ImageUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = (
        select(Image)
        .where(Image.id == image_id, Image.user_id == current_user.id)
        .options(selectinload(Image.tags))
    )
    result = await db.execute(stmt)
    image = result.scalars().first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # 更新 AI 描述
    if update_data.ai_description is not None:
        image.ai_description = update_data.ai_description

    # 更新标签 (采用追加模式)
    if update_data.custom_tags is not None:
        for tag_name in update_data.custom_tags:
            tag_name = tag_name.strip()
            if not tag_name: continue
            
            # 查重或创建
            tag_res = await db.execute(select(Tag).where(Tag.name == tag_name))
            tag = tag_res.scalars().first()
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
                await db.commit() # 提交以获取 ID
                await db.refresh(tag)
            
            # 避免重复关联
            if tag not in image.tags:
                image.tags.append(tag)
        
    await db.commit()
    await db.refresh(image)
    return image

# ==========================================
# 3. 辅助函数
# ==========================================

async def background_ai_analysis(image_id: int, file_path: str):
    """
    后台任务：分析图片并更新数据库
    """
    if not settings.SILICONFLOW_API_KEY:
        print("AI API Key not set, skipping background analysis.")
        return

    async with SessionLocal() as db:
        try:
            ai_result = await analyze_image_with_ai(file_path, settings.SILICONFLOW_API_KEY)
            
            if ai_result:
                # 使用 selectinload 预加载 tags
                stmt = (
                    select(Image)
                    .options(selectinload(Image.tags))
                    .where(Image.id == image_id)
                )
                result = await db.execute(stmt)
                img = result.scalars().first()
                
                if img:
                    img.ai_description = ai_result.get("summary")
                    
                    new_tag_names = ai_result.get("tags", [])
                    if new_tag_names:
                        current_tag_names = {t.name for t in img.tags}
                        
                        for tag_name in new_tag_names:
                            tag_name = tag_name.strip()
                            if not tag_name or tag_name in current_tag_names:
                                continue
                                
                            tag_res = await db.execute(select(Tag).where(Tag.name == tag_name))
                            tag = tag_res.scalars().first()
                            
                            if not tag:
                                tag = Tag(name=tag_name)
                                db.add(tag)
                                await db.flush() 
                            
                            img.tags.append(tag)
                            current_tag_names.add(tag_name)

                    await db.commit()
                    print(f"✅ AI Analysis complete for Image ID {image_id}")
            else:
                print(f"⚠️ AI Analysis returned no results for Image ID {image_id}.")

        except Exception as e:
            print(f"❌ AI Analysis background task failed: {e}")
            await db.rollback()