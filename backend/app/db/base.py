# app/db/base.py
from app.db.database import Base
from app.models.user import User
from app.models.image import Image, Tag

# 这个文件不需要写其他逻辑
# 它的存在只是为了让 SQLAlchemy 知道所有的 Model 都在这里注册过了