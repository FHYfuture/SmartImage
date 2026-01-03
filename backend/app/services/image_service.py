import os
import uuid
from datetime import datetime
from PIL import Image as PILImage, ImageOps
from PIL.ExifTags import TAGS, GPSTAGS
import reverse_geocoder as rg
from app.core.config import settings

import base64
import httpx
import json
import io

# 确保目录存在
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.THUMBNAIL_DIR, exist_ok=True)



def _get_exif_data(image: PILImage.Image):
    """提取原始 EXIF 数据"""
    exif_data = {}
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
    """将 EXIF 中的 (度, 分, 秒) 转为浮点数"""
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
    """解析 GPSInfo 为 (lat, lon)"""
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
            if gps_latitude_ref != "N": lat = -lat
            lon = _convert_to_degrees(gps_longitude)
            if gps_longitude_ref != "E": lon = -lon
            return (lat, lon)
    except Exception as e:
        print(f"Error parsing GPS: {e}")
    return None

async def _geocoding_amap(lat, lon):
    """
    使用高德地图 API 进行逆地理编码
    """
    # 【修改】从 settings 中读取 Key
    amap_key = settings.AMAP_KEY

    if not amap_key:
        print("⚠️ 未配置高德 Key (settings.AMAP_KEY)，跳过在线解析")
        return None, []

    url = "https://restapi.amap.com/v3/geocode/regeo"
    params = {
        "key": amap_key,  # 使用变量
        "location": f"{lon},{lat}",
        "extensions": "all",
        "coordsys": "gps",
        "radius": 1000,
        "poitype": "风景名胜|商务住宅|政府机构及社会团体|地名地址信息"
    }

    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(url, params=params)
            data = resp.json()
            
            if data.get("status") == "1" and data.get("regeocode"):
                # ... (原本的处理逻辑保持不变，不需要改动) ...
                address_component = data["regeocode"]["addressComponent"]
                formatted_address = data["regeocode"]["formatted_address"]
                
                parts = []
                tags = set()
                
                # 1. 提取行政区划
                province = address_component.get("province")
                if province and isinstance(province, str): 
                    parts.append(province)
                    tags.add(province)
                
                city = address_component.get("city")
                if city and isinstance(city, str): 
                    if city not in parts: parts.append(city)
                    tags.add(city)
                    
                district = address_component.get("district")
                if district and isinstance(district, str): 
                    if district not in parts: parts.append(district)
                    tags.add(district)
                    
                township = address_component.get("township")
                if township and isinstance(township, str):
                    if township not in parts: parts.append(township)
                    tags.add(township)

                # 2. 提取具体 POI
                pois = data["regeocode"].get("pois", [])
                if pois:
                    nearest_poi = pois[0].get("name")
                    if nearest_poi:
                        parts.append(nearest_poi)
                        tags.add(nearest_poi)
                
                # 3. 提取商圈或路名
                if not pois:
                    street = address_component.get("streetNumber", {}).get("street")
                    if street and isinstance(street, str):
                        parts.append(street)
                
                full_address = " ".join(parts)
                if len(full_address) < 5 and formatted_address:
                    full_address = formatted_address

                return full_address, list(tags)
            else:
                print(f"AMap API error info: {data.get('info')}")
                
        except Exception as e:
            print(f"AMap request failed: {e}")
            
    return None, []

async def _get_address_and_tags(coords):
    """
    双模地址解析：高德 (在线) -> Reverse Geocoder (离线)
    """
    if not coords:
        return None, []
    
    # 1. 尝试高德地图 (在线，极速)
    address_str, online_tags = await _geocoding_amap(coords[0], coords[1])
    if address_str:
        return address_str, online_tags

    # 2. 兜底方案：离线库 (只精确到城市/区)
    try:
        results = rg.search([coords]) 
        if results:
            res = results[0]
            parts = []
            tags = set()
            
            if res.get('admin1'): 
                parts.append(res['admin1'])
                tags.add(res['admin1'])
            if res.get('admin2'): 
                parts.append(res['admin2'])
                tags.add(res['admin2'])
            if res.get('name'): 
                parts.append(res['name'])
                tags.add(res['name'])
            
            return " ".join(parts), list(tags)
    except Exception as e:
        print(f"Offline geocoding error: {e}")

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
    """自动生成标签"""
    tags = []
    
    # 时间
    if capture_time:
        tags.append(f"{capture_time.year}年")
        tags.append(f"{capture_time.month}月")
        hour = capture_time.hour
        if 5 <= hour < 12: tags.append("上午")
        elif 12 <= hour < 18: tags.append("下午")
        elif 18 <= hour < 22: tags.append("夜晚")
        else: tags.append("深夜")

    # 设备
    make = exif_data.get("Make")
    if make:
        make = str(make).strip().split('\x00')[0]
        if make: tags.append(make)
            
    # 地点
    if location_tags:
        tags.extend(location_tags)

    return tags

async def process_upload(file, user_id: int):
    """处理上传的主逻辑"""
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
            exif = _get_exif_data(original_img)
            metadata["capture_time"] = _parse_datetime(exif)
            coords = _parse_gps(exif)
            
            # 这里调用改为异步 await
            address_str, loc_tags = await _get_address_and_tags(coords)
            metadata["location"] = address_str
            metadata["auto_tags"] = _generate_auto_tags(exif, metadata["capture_time"], loc_tags)
            
            img = ImageOps.exif_transpose(original_img)
            metadata["resolution"] = f"{img.width}x{img.height}"

            img.save(file_path, quality=95)
            
            img.thumbnail((400, 400))
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(thumb_path, "JPEG", quality=80)
            
    except Exception as e:
        print(f"Error processing image: {e}")
        # 出错也尽量保留基本信息
        metadata["thumbnail_path"] = file_path 

    return metadata

def delete_image_files(file_path: str, thumbnail_path: str):
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        if thumbnail_path and os.path.exists(thumbnail_path) and thumbnail_path != file_path:
            os.remove(thumbnail_path)
    except Exception as e:
        print(f"Error deleting files: {e}")

async def analyze_image_with_ai(file_path: str, api_key: str):
    """
    AI 分析 (复用之前的逻辑)
    """
    if not api_key or not os.path.exists(file_path):
        return None

    # ... (AI 分析部分代码保持不变，为了篇幅省略，直接复用您现有的即可) ...
    # 为了保证代码完整运行，这里简写一下，您之前的 analyze_image_with_ai 代码是完美的，可以保留
    
    base64_image = ""
    try:
        with PILImage.open(file_path) as img:
            if img.mode in ("RGBA", "P"): img = img.convert("RGB")
            img.thumbnail((1024, 1024))
            buffered = io.BytesIO()
            img.save(buffered, format="JPEG", quality=85)
            encoded_string = base64.b64encode(buffered.getvalue()).decode('utf-8')
            base64_image = f"data:image/jpeg;base64,{encoded_string}"
    except:
        return None

    system_prompt = """
    你是一个专业的图像分析助手。请分析用户提供的图片，并返回一个严格的 JSON 格式结果。
    JSON 字段：summary, scene_tags, object_tags, style_tags
    """
    
    payload = {
        "model": "Pro/Qwen/Qwen2.5-VL-7B-Instruct", 
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": base64_image}},
                {"type": "text", "text": "分析图片"}
            ]}
        ],
        "max_tokens": 512
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post("https://api.siliconflow.cn/v1/chat/completions", 
                                   headers={"Authorization": f"Bearer {api_key}"}, 
                                   json=payload)
            if resp.status_code == 200:
                content = resp.json()['choices'][0]['message']['content']
                if content.startswith("```json"): content = content[7:-3]
                data = json.loads(content)
                tags = []
                for k in ["scene_tags", "object_tags", "style_tags"]:
                    if isinstance(data.get(k), list): tags.extend(data[k])
                return {"summary": data.get("summary"), "tags": tags}
        except Exception as e:
            print(f"AI error: {e}")
    return None