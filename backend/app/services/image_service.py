import os
import uuid
from datetime import datetime
from PIL import Image as PILImage, ImageOps
from PIL.ExifTags import TAGS, GPSTAGS
from geopy.geocoders import Nominatim
from app.core.config import settings
import httpx 
import reverse_geocoder as rg
# 确保目录存在
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.THUMBNAIL_DIR, exist_ok=True)

def _get_exif_data(image: PILImage.Image):
    """解析 EXIF 数据 (增加健壮性检查)"""
    exif_data = {}
    
    # 【关键修改】先检查是否有 _getexif 方法 (PNG 等格式没有此方法)
    if not hasattr(image, '_getexif'):
        return exif_data
        
    try:
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
    except Exception as e:
        print(f"EXIF extract error: {e}")
        
    return exif_data
def _convert_to_degrees(value):
    """
    辅助函数：将 EXIF 中的 (度, 分, 秒) 格式转为浮点数
    兼容 ((num, den), (num, den), (num, den)) 格式
    """
    def _to_float(v):
        # 1. 处理元组/列表格式 (分子, 分母)
        if isinstance(v, (tuple, list)):
            if len(v) >= 2 and v[1] != 0:
                return float(v[0]) / float(v[1])
            return 0.0
        
        # 2. 处理 Pillow 的 IFDRational 对象
        if hasattr(v, 'numerator') and hasattr(v, 'denominator'):
            if v.denominator == 0: return 0.0
            return float(v.numerator) / float(v.denominator)
            
        # 3. 直接是数值
        try:
            return float(v)
        except:
            return 0.0

    d = _to_float(value[0])
    m = _to_float(value[1])
    s = _to_float(value[2])
    
    return d + (m / 60.0) + (s / 3600.0)

def _parse_gps(exif_data):
    """
    解析 GPSInfo 为浮点数元组 (lat, lon)
    例如: (30.254, 120.123)
    """
    if "GPSInfo" not in exif_data:
        return None
    
    gps_info = exif_data["GPSInfo"]
    
    try:
        gps_latitude = gps_info.get("GPSLatitude")
        gps_latitude_ref = gps_info.get("GPSLatitudeRef")
        gps_longitude = gps_info.get("GPSLongitude")
        gps_longitude_ref = gps_info.get("GPSLongitudeRef")

        if gps_latitude and gps_latitude_ref and gps_longitude and gps_longitude_ref:
            lat = _convert_to_degrees(gps_latitude)
            if gps_latitude_ref != "N":
                lat = -lat

            lon = _convert_to_degrees(gps_longitude)
            if gps_longitude_ref != "E":
                lon = -lon

            return (lat, lon)
    except Exception as e:
        print(f"Error parsing GPS: {e}")
    
    return None

def _get_address_from_gps(coords):
    """
    使用离线库将 (lat, lon) 转换为地址
    """
    if not coords:
        return None

    try:
        # rg.search 返回一个列表，取第一个结果
        # 格式: [{'name': 'Pienza', 'admin1': 'Tuscany', 'admin2': 'Siena', 'cc': 'IT', ...}]
        results = rg.search(coords)
        if results:
            res = results[0]
            # 尝试拼接更有意义的地址
            # admin1 是一级行政区(省/州), name 是地名(城市/区域)
            address_parts = []
            if res.get('admin1'):
                address_parts.append(res['admin1'])
            if res.get('name'):
                address_parts.append(res['name'])

            return " ".join(address_parts)

    except Exception as e:
        print(f"Offline Geocoding failed: {e}")

    return f"{coords[0]:.4f}, {coords[1]:.4f}"

def _parse_datetime(exif_data):
    """解析拍摄时间"""
    date_str = exif_data.get("DateTimeOriginal")
    if date_str:
        try:
            # 常见格式: 2023:10:23 14:27:05
            return datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
        except:
            pass
    return None

def _generate_auto_tags(exif_data, capture_time, location_str):
    """基于 EXIF 和地理位置自动生成标签"""
    tags = []
    
    # 1. 基于时间的标签
    if capture_time:
        tags.append(f"{capture_time.year}年")
        tags.append(f"{capture_time.month}月")
        
        hour = capture_time.hour
        if 5 <= hour < 12:
            tags.append("上午")
        elif 12 <= hour < 18:
            tags.append("下午")
        elif 18 <= hour < 22:
            tags.append("夜晚")
        else:
            tags.append("深夜")

    # 2. 基于设备的标签
    make = exif_data.get("Make")
    if make:
        # 清理字符串，例如 "Apple " -> "Apple"
        make = str(make).strip().split('\x00')[0]
        if make:
            tags.append(make)
            
    # 3. 基于位置的标签
    if location_str:
        tags.append("有定位")
        # 尝试提取城市名作为标签 (简单按空格分割取最后一段，如 "浙江省 杭州市" -> "杭州市")
        if " " in location_str:
            city = location_str.split(" ")[-1]
            tags.append(city)

    return tags

async def process_upload(file, user_id: int):
    """处理上传：保存文件、纠正方向、生成缩略图、提取 EXIF"""
    ext = file.filename.split(".")[-1].lower()
    if ext not in ["jpg", "jpeg", "png", "webp"]:
        ext = "jpg"
        
    unique_name = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_name)
    thumb_path = os.path.join(settings.THUMBNAIL_DIR, unique_name)
    
    content = await file.read()
    
    metadata = {
        "filename": file.filename,
        "file_path": file_path,
        "thumbnail_path": thumb_path,
        "resolution": "0x0",
        "capture_time": None,
        "location": None,
        "auto_tags": []
    }

    try:
        # 写入临时文件以便 PIL 读取
        with open(file_path, "wb") as f:
            f.write(content)

        with PILImage.open(file_path) as original_img:
            # 1. 优先提取 EXIF (此时必须使用原始对象 original_img)
            # 如果在旋转后提取，EXIF 数据会丢失
            exif = _get_exif_data(original_img)
            
            # 解析元数据
            metadata["capture_time"] = _parse_datetime(exif)
            
            # 处理 GPS 与 地理编码
            coords = _parse_gps(exif)
            metadata["location"] = _get_address_from_gps(coords)
            
            # 自动生成标签
            metadata["auto_tags"] = _generate_auto_tags(exif, metadata["capture_time"], metadata["location"])
            
            # 2. 处理图片方向 (这会生成新对象，并丢失原始 EXIF)
            img = ImageOps.exif_transpose(original_img)
            
            # 3. 记录最终分辨率 (以旋转后的为准)
            metadata["resolution"] = f"{img.width}x{img.height}"

            # 4. 保存旋转后的原图 (覆盖旧文件)
            # 注意：这里保存后的文件物理上可能不再包含完整 EXIF，但我们已经在数据库存好了
            # quality=95 保证原图质量
            img.save(file_path, quality=95)
            
            # 5. 生成缩略图
            img.thumbnail((400, 400))
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(thumb_path, "JPEG", quality=80)
            
    except Exception as e:
        print(f"Error processing image: {e}")
        # 出错时的回退逻辑：缩略图指向原图
        metadata["thumbnail_path"] = file_path 

    return metadata

def delete_image_files(file_path: str, thumbnail_path: str):
    """物理删除文件"""
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            print(f"Deleted file: {file_path}")
            
        if thumbnail_path and os.path.exists(thumbnail_path):
            if thumbnail_path != file_path:
                os.remove(thumbnail_path)
                print(f"Deleted thumbnail: {thumbnail_path}")
    except Exception as e:
        print(f"Error deleting files: {e}")

async def analyze_image_with_ai(image_path: str, api_key: str):
    """
    调用 AI 分析图片 (占位符)
    实际使用时可对接 OpenAI / SiliconFlow
    """
    # 模拟异步延迟
    import asyncio
    await asyncio.sleep(1)
    return None