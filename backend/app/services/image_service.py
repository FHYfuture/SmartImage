import os
import uuid
from datetime import datetime
from PIL import Image as PILImage, ImageOps
from PIL.ExifTags import TAGS, GPSTAGS
from geopy.geocoders import Nominatim
import reverse_geocoder as rg
from app.core.config import settings

# 确保目录存在
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.THUMBNAIL_DIR, exist_ok=True)

def _get_exif_data(image: PILImage.Image):
    """提取原始 EXIF 数据 (包含健壮性检查)"""
    exif_data = {}
    # 检查是否有 _getexif 方法 (PNG 等格式没有此方法)
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
        if isinstance(v, (tuple, list)):
            if len(v) >= 2 and v[1] != 0:
                return float(v[0]) / float(v[1])
            return 0.0
        if hasattr(v, 'numerator') and hasattr(v, 'denominator'):
            if v.denominator == 0: return 0.0
            return float(v.numerator) / float(v.denominator)
        try:
            return float(v)
        except:
            return 0.0

    d = _to_float(value[0])
    m = _to_float(value[1])
    s = _to_float(value[2])
    return d + (m / 60.0) + (s / 3600.0)

def _parse_gps(exif_data):
    """解析 GPSInfo 为浮点数元组 (lat, lon)"""
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

def _get_address_and_tags(coords):
    """
    双模地址解析：
    返回: (全量地址字符串, 标签列表)
    """
    if not coords:
        return None, []
    
    tags = set()
    display_parts = []
    
    # --- 模式 1: 在线获取中文 (全字段提取) ---
    try:
        geolocator = Nominatim(user_agent="smartimage_student_project", timeout=3)
        location = geolocator.reverse(coords, language='zh-cn')
        
        if location and location.raw.get('address'):
            addr = location.raw['address']
            
            # 【调试关键】这行代码会在后端控制台打印所有返回的字段
            # 如果依然不显示杭州，请看控制台输出，确认 OSM 数据里到底有没有杭州
            print(f"DEBUG - GPS: {coords} | Raw Address Data: {addr}")

            # 定义完整的行政层级顺序 (从大到小)
            # 只要 addr 里包含这些 key，我们就把它提取出来
            hierarchy = [
                'country',          # 国家
                'state',            # 省/州
                'province',         # 省 (备用)
                'municipality',     # 直辖市
                'state_district',   # 地区/自治州 (杭州有时在这里)
                'city',             # 市
                'county',           # 县
                'district',         # 区
                'town',             # 镇/街道
                'village',          # 村
                'suburb',           # 郊区
                'neighbourhood',    # 社区
                'quarter',          # 街区
                'road',             # 道路
                'house_number',     # 门牌号
                'building',         # 建筑
                'amenity',          # 设施/POI
                'tourism'           # 景点
            ]

            for key in hierarchy:
                val = addr.get(key)
                if val:
                    tags.add(val)
                    # 去重逻辑：只有当这个词在结果里还没出现过时，才添加
                    # 防止 "浙江省 浙江省" 或 "北京市 北京市" 这种重复
                    if val not in display_parts:
                        display_parts.append(val)
            
            # 如果 hierarchy 漏掉了一些特殊字段，用 location.address 兜底吗？
            # 不，直接用我们拼接的长字符串，这样更可控
            display_str = " ".join(display_parts)
            return display_str, list(tags)

    except Exception as e:
        print(f"Online geocoding failed/timeout: {e}")

    # --- 模式 2: 离线获取英文 (兜底方案) ---
    try:
        results = rg.search([coords]) 
        if results:
            res = results[0]
            tags = set()
            display_parts = []
            
            # 把 rg 返回的所有非空字段都拼起来
            # rg 的字段比较少: admin1(省), admin2(市), name(具体地点)
            if res.get('admin1'): 
                tags.add(res['admin1'])
                display_parts.append(res['admin1'])
            
            if res.get('admin2'): 
                tags.add(res['admin2'])
                display_parts.append(res['admin2'])

            if res.get('name'):
                tags.add(res['name'])
                if res.get('name') not in display_parts:
                    display_parts.append(res['name'])
            
            return " ".join(display_parts), list(tags)
    except Exception as e:
        print(f"Offline geocoding failed: {e}")

    return f"{coords[0]:.4f}, {coords[1]:.4f}", []

def _parse_datetime(exif_data):
    """解析拍摄时间"""
    date_str = exif_data.get("DateTimeOriginal")
    if date_str:
        try:
            return datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
        except:
            pass
    return None

def _generate_auto_tags(exif_data, capture_time, location_tags):
    """基于 EXIF 和地理位置自动生成标签"""
    tags = []
    
    # 1. 基于时间的标签
    if capture_time:
        tags.append(f"{capture_time.year}年")
        tags.append(f"{capture_time.month}月")
        hour = capture_time.hour
        if 5 <= hour < 12: tags.append("上午")
        elif 12 <= hour < 18: tags.append("下午")
        elif 18 <= hour < 22: tags.append("夜晚")
        else: tags.append("深夜")

    # 2. 基于设备的标签
    make = exif_data.get("Make")
    if make:
        make = str(make).strip().split('\x00')[0]
        if make: tags.append(make)
            
    # 3. 基于位置的标签
    if "GPSInfo" in exif_data:
        tags.append("有定位")
    
    # 将解析到的所有地点层级（省、市、区）都加为标签
    if location_tags:
        tags.extend(location_tags)

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
        with open(file_path, "wb") as f:
            f.write(content)

        with PILImage.open(file_path) as original_img:
            # 1. 提取 EXIF
            exif = _get_exif_data(original_img)
            
            # 2. 解析时间与坐标
            metadata["capture_time"] = _parse_datetime(exif)
            coords = _parse_gps(exif)
            
            # 3. 解析地址与多层级标签
            # 返回值示例: ("Zhejiang Hangzhou Gudang", ["Zhejiang", "Hangzhou", "Gudang"])
            address_str, loc_tags = _get_address_and_tags(coords)
            metadata["location"] = address_str
            
            # 4. 生成最终标签列表
            metadata["auto_tags"] = _generate_auto_tags(exif, metadata["capture_time"], loc_tags)
            
            # 5. 处理图片方向 (旋转)
            img = ImageOps.exif_transpose(original_img)
            metadata["resolution"] = f"{img.width}x{img.height}"

            # 6. 保存旋转后的原图
            img.save(file_path, quality=95)
            
            # 7. 生成缩略图
            img.thumbnail((400, 400))
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(thumb_path, "JPEG", quality=80)
            
    except Exception as e:
        print(f"Error processing image: {e}")
        metadata["thumbnail_path"] = file_path 

    return metadata

def delete_image_files(file_path: str, thumbnail_path: str):
    """物理删除文件"""
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        if thumbnail_path and os.path.exists(thumbnail_path) and thumbnail_path != file_path:
            os.remove(thumbnail_path)
    except Exception as e:
        print(f"Error deleting files: {e}")

async def analyze_image_with_ai(image_path: str, api_key: str):
    """AI 分析占位符"""
    import asyncio
    await asyncio.sleep(1)
    return None