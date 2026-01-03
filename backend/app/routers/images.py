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

# --- 批量删除接口 (已修复为异步) ---
@router.post("/batch-delete")
async def batch_delete_images(
    req: BatchDeleteRequest,
    db: AsyncSession = Depends(get_db), # 使用 AsyncSession
    current_user: User = Depends(get_current_user)
):
    # 【关键修改】使用 user_id 而非 owner_id，并使用 await 执行查询
    stmt = select(Image).where(Image.user_id == current_user.id).where(Image.id.in_(req.ids))
    result = await db.execute(stmt)
    images = result.scalars().all()
    
    count = 0
    for img in images:
        # 物理删除文件
        delete_image_files(img.file_path, img.thumbnail_path)
        # 数据库删除 (异步)
        await db.delete(img)
        count += 1
        
    await db.commit()
    return {"message": f"Successfully deleted {count} images"}

# --- 辅助函数：AI 后台任务 ---
async def background_ai_analysis(image_id: int, file_path: str):
    """
    后台任务：分析图片并更新数据库 (支持多标签)
    注意：这里通过 SessionLocal 创建新的数据库会话，因为请求上下文已结束
    """
    if not settings.SILICONFLOW_API_KEY:
        print("AI API Key not set, skipping background analysis.")
        return

    # 使用异步上下文管理器获取 session
    async with SessionLocal() as db:
        try:
            # 1. 调用 AI 服务 (现在返回的是一个字典或 None)
            ai_result = await analyze_image_with_ai(file_path, settings.SILICONFLOW_API_KEY)
            
            if ai_result:
                # 2. 重新查询图片，并预加载 tags
                stmt = (
                    select(Image)
                    .options(selectinload(Image.tags))
                    .where(Image.id == image_id)
                )
                result = await db.execute(stmt)
                img = result.scalars().first()
                
                if img:
                    # 3. 更新 AI 描述摘要
                    img.ai_description = ai_result.get("summary")
                    
                    # 4. 处理 AI 生成的新标签
                    new_tag_names = ai_result.get("tags", [])
                    if new_tag_names:
                        # 获取当前已有的标签名集合，避免重复添加
                        current_tag_names = {t.name for t in img.tags}
                        
                        for tag_name in new_tag_names:
                            tag_name = tag_name.strip()
                            # 如果标签已存在于这张图片，跳过
                            if not tag_name or tag_name in current_tag_names:
                                continue
                                
                            # 检查标签是否在数据库中已存在
                            tag_res = await db.execute(select(Tag).where(Tag.name == tag_name))
                            tag = tag_res.scalars().first()
                            
                            # 如果不存在，创建新标签
                            if not tag:
                                tag = Tag(name=tag_name)
                                db.add(tag)
                                # 需要先 flush 以获取新创建标签的 ID，否则可能导致关联错误
                                await db.flush() 
                            
                            # 将标签添加到图片关联中
                            img.tags.append(tag)
                            # 记录到当前集合，防止本次循环内重复
                            current_tag_names.add(tag_name)

                    # 5. 提交所有更改
                    await db.commit()
                    print(f"✅ AI Analysis complete and saved for Image ID {image_id}")
                else:
                   print(f"❌ Image ID {image_id} not found during background task.")
            else:
                print(f"⚠️ AI Analysis returned no results for Image ID {image_id}.")

        except Exception as e:
            print(f"❌ AI Analysis background task failed: {e}")
            # 出错时回滚，保持数据库一致性
            await db.rollback()

@router.post("/{image_id}/analyze")
async def analyze_image_endpoint(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 获取图片路径
    stmt = select(Image).where(Image.id == image_id, Image.user_id == current_user.id)
    result = await db.execute(stmt)
    image = result.scalars().first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
        
    if not settings.SILICONFLOW_API_KEY:
        raise HTTPException(status_code=500, detail="API Key not configured")

    # 调用 Service 进行分析
    ai_result = await analyze_image_with_ai(image.file_path, settings.SILICONFLOW_API_KEY)
    
    if not ai_result:
        raise HTTPException(status_code=500, detail="AI Analysis failed")
        
    # 直接返回结果给前端，让前端去编辑
    return ai_result


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

    # 更新标签 (追加模式)
    if update_data.custom_tags is not None:
        new_tag_list = []
        # 保留原有标签 (如果想要完全覆盖，可以去掉这行逻辑，视需求而定)
        # 这里逻辑是：用户在前端提交的 tag 列表，我们把它们加入到图片中
        
        # 为了避免 bug，我们直接处理新增的
        for tag_name in update_data.custom_tags:
            tag_name = tag_name.strip()
            if not tag_name: continue
            
            # 查重或创建
            tag_res = await db.execute(select(Tag).where(Tag.name == tag_name))
            tag = tag_res.scalars().first()
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
            
            # 避免重复关联
            if tag not in image.tags:
                image.tags.append(tag)
        
    await db.commit()
    await db.refresh(image)
    return image

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
    # 构建查询语句，预加载 tags
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
    # 1. 查询图片
    result = await db.execute(select(Image).where(Image.id == image_id, Image.user_id == current_user.id))
    image = result.scalars().first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # 2. 删除物理文件
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

    # 2. 更新标签
    if update_data.custom_tags is not None:
        new_tag_list = []
        for tag_name in update_data.custom_tags:
            tag_name = tag_name.strip()
            if not tag_name: 
                continue
                
            # 查找标签是否存在
            tag_res = await db.execute(select(Tag).where(Tag.name == tag_name))
            tag = tag_res.scalars().first()
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
            new_tag_list.append(tag)
        
        # 更新关系
        image.tags = new_tag_list
        
    await db.commit()
    await db.refresh(image)
    return image


# 【新增】删除指定图片的指定标签
@router.delete("/{image_id}/tags/{tag_name}")
async def remove_tag_from_image(
    image_id: int,
    tag_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. 获取图片 (同时预加载 tags)
    stmt = (
        select(Image)
        .where(Image.id == image_id, Image.user_id == current_user.id)
        .options(selectinload(Image.tags))
    )
    result = await db.execute(stmt)
    image = result.scalars().first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # 2. 在图片的标签列表中查找目标标签
    tag_to_remove = None
    for tag in image.tags:
        if tag.name == tag_name:
            tag_to_remove = tag
            break
            
    # 3. 如果找到了，从列表中移除 (SQLAlchemy 会自动处理中间表删除)
    if tag_to_remove:
        image.tags.remove(tag_to_remove)
        await db.commit()
        return {"message": f"Tag '{tag_name}' removed"}
    else:
        raise HTTPException(status_code=404, detail="Tag not found on this image")