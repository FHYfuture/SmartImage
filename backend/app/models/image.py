from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

# 图片-标签关联表 (Many-to-Many)
image_tag_map = Table(
    "image_tag_map",
    Base.metadata,
    Column("image_id", Integer, ForeignKey("images.id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id"), primary_key=True),
    Column("source", String(16), default="manual") # manual 或 ai
)

class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    filename = Column(String(255), nullable=False)
    file_path = Column(String(255), nullable=False)
    thumbnail_path = Column(String(255), nullable=True)
    
    upload_time = Column(DateTime(timezone=True), server_default=func.now())
    capture_time = Column(DateTime(timezone=True), nullable=True)
    location = Column(String(128), nullable=True)
    resolution = Column(String(32), nullable=True)
    ai_description = Column(Text, nullable=True)

    # 关联
    tags = relationship("Tag", secondary=image_tag_map, back_populates="images")
    user = relationship("User")

class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(32), unique=True, index=True)
    
    images = relationship("Image", secondary=image_tag_map, back_populates="tags")