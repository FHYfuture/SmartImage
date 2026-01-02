import os
from PIL import Image as PILImage
from PIL.ExifTags import TAGS, GPSTAGS
from datetime import datetime
from app.core.config import settings
import uuid
import httpx # 用于 AI 请求

# 确保目录存在
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.THUMBNAIL_DIR, exist_ok=True)

def _get_exif_data(image: PILImage.Image):
    """解析 EXIF 数据"""
    exif_data = {}
    info = image._getexif()
    if info:
        for tag, value in info.items():
            decoded = TAGS.get(tag, tag)
            if decoded == "GPSInfo":
                gps_data = {}
                for t in value:
                    sub_decoded = GPSTAGS.get(t, t)
                    gps_data[sub_decoded] = value[t]
                exif_data[decoded] = gps_data
            else:
                exif_data[decoded] = value
    return exif_data

def _parse_gps(exif_data):
    """简化的 GPS 解析"""
    # 这里为了简化，暂不进行复杂的度分秒转换
    if "GPSInfo" in exif_data:
        return "Has GPS Data" 
    return None

def _parse_datetime(exif_data):
    """解析拍摄时间"""
    date_str = exif_data.get("DateTimeOriginal")
    if date_str:
        try:
            return datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
        except:
            return None
    return None

async def process_upload(file, user_id: int):
    """处理上传：保存文件、生成缩略图、提取 EXIF"""
    # 生成唯一文件名
    ext = file.filename.split(".")[-1]
    unique_name = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_name)
    thumb_path = os.path.join(settings.THUMBNAIL_DIR, unique_name)
    
    # 保存原图
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    # 处理图片
    metadata = {
        "filename": file.filename,
        "file_path": file_path,
        "thumbnail_path": thumb_path,
        "resolution": "0x0",
        "capture_time": None,
        "location": None
    }

    try:
        with PILImage.open(file_path) as img:
            # 记录分辨率
            metadata["resolution"] = f"{img.width}x{img.height}"
            
            # 提取 EXIF
            exif = _get_exif_data(img)
            metadata["capture_time"] = _parse_datetime(exif)
            metadata["location"] = _parse_gps(exif)
            
            # 生成缩略图 (最大 300x300，保持比例)
            img.thumbnail((300, 300))
            # 转换模式以支持保存为 JPEG (针对 PNG 透明通道)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(thumb_path)
    except Exception as e:
        print(f"Error processing image: {e}")
        # 如果缩略图生成失败，回退使用原图路径（防止前端 404）
        metadata["thumbnail_path"] = file_path

    return metadata

def delete_image_files(file_path: str, thumbnail_path: str):
    """物理删除文件 (此次报错缺少的函数)"""
    try:
        # 删除原图
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            print(f"Deleted file: {file_path}")
            
        # 删除缩略图
        if thumbnail_path and os.path.exists(thumbnail_path):
            # 防止原图和缩略图是同一个文件时重复删除
            if thumbnail_path != file_path:
                os.remove(thumbnail_path)
                print(f"Deleted thumbnail: {thumbnail_path}")
    except Exception as e:
        print(f"Error deleting files: {e}")

async def analyze_image_with_ai(image_path: str, api_key: str):
    """
    调用 AI 分析图片
    """
    if not api_key:
        return None

    # 模拟 AI 返回 (如果需要真实调用，请参考 SiliconFlow 文档将图片转 Base64)
    import asyncio
    await asyncio.sleep(1) # 模拟网络延迟
    return "AI Analysis: 这是一张精彩的照片 (Mock Data)"