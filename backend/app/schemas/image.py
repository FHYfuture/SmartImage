from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class TagBase(BaseModel):
    name: str

class TagResponse(TagBase):
    id: int
    class Config:
        from_attributes = True

class ImageBase(BaseModel):
    filename: str
    description: Optional[str] = None

class ImageResponse(ImageBase):
    id: int
    user_id: int
    file_path: str
    thumbnail_path: Optional[str]
    upload_time: datetime
    capture_time: Optional[datetime]
    location: Optional[str]
    resolution: Optional[str]
    ai_description: Optional[str]
    tags: List[TagResponse] = []

    class Config:
        from_attributes = True

class ImageUpdate(BaseModel):
    custom_tags: List[str] = [] # 仅接收标签名列表
    ai_description: Optional[str] = None

class BatchDeleteRequest(BaseModel):
    ids: List[int]