import json
import re # 引入正则处理
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_, and_, cast, String # <--- 【核心】引入 cast 和 String

from app.db.database import SessionLocal
from app.models.image import Image, Tag
from app.models.user import User
from app.routers.auth import get_current_user
from app.core.config import settings
from openai import AsyncOpenAI
router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []

# --- 1. 工具函数 (增强版) ---
async def search_images_tool(query: str, user_id: int):
    print(f"🔍 [Tool] Searching images for: '{query}'")
    
    # 切分关键词
    keywords = query.strip().split()
    
    async with SessionLocal() as db:
        stmt = (
            select(Image)
            .join(Image.tags, isouter=True)
            .options(selectinload(Image.tags))
            .where(Image.user_id == user_id)
        )

        for kw in keywords:
            # 【核心逻辑 1】处理关键词，去掉中文年月日，只留数字和横杠
            # 例如 "2025年" -> "2025", "7月" -> "7"
            # 这样做的目的是为了去匹配 capture_time (格式为 2025-07-17)
            clean_kw = re.sub(r'[年月]', '-', kw).replace('日', '').strip('-')
            
            # 构建查询条件
            conditions = [
                Tag.name.contains(kw),              # 匹配标签 (原始词)
                Image.ai_description.contains(kw),  # 匹配描述 (原始词)
                Image.location.contains(kw)         # 匹配地点 (原始词)
            ]
            
            # 【核心逻辑 2】如果处理后的关键词包含数字，尝试去匹配 capture_time
            if clean_kw and any(c.isdigit() for c in clean_kw):
                # cast(Image.capture_time, String) 会把日期转为字符串进行比对
                conditions.append(cast(Image.capture_time, String).contains(clean_kw))

            stmt = stmt.where(or_(*conditions))

        stmt = (
            stmt.distinct()
            .order_by(Image.capture_time.desc())
            .limit(15) # 稍微多返回几张
        )
        
        result = await db.execute(stmt)
        images = result.scalars().all()
        
        if not images:
            return json.dumps({"count": 0, "results": [], "msg": f"未找到匹配 '{query}' 的图片"})
            
        results_list = []
        for img in images:
            tag_names = [t.name for t in img.tags]
            info = {
                "id": img.id,
                "filename": img.filename,
                "summary": img.ai_description or "无描述",
                "tags": tag_names,
                "location": img.location,
                "date": str(img.capture_time.date()) if img.capture_time else "未知日期",
                "file_path": img.file_path,
                "thumbnail_path": img.thumbnail_path
            }
            results_list.append(info)
        return json.dumps(results_list, ensure_ascii=False)

# --- 2. Schema ---
tools_schema = [
    {
        "type": "function",
        "function": {
            "name": "search_images",
            "description": "搜索相册。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词。如果是组合条件，用空格分隔。例如：'猫 户外'。"
                    }
                },
                "required": ["query"]
            }
        }
    }
]

# --- 3. 接口实现 ---
@router.post("/completions")
async def chat_completions(
    req: ChatRequest,
    current_user: User = Depends(get_current_user)
):
    if not settings.SILICONFLOW_API_KEY:
        raise HTTPException(status_code=500, detail="API Key not configured")

    client = AsyncOpenAI(
        api_key=settings.SILICONFLOW_API_KEY,
        base_url="https://api.siliconflow.cn/v1",
        timeout=120.0
    )

    # 【核心逻辑 3】更新 Prompt，教 AI 生成更精准的日期查询
    system_prompt = """
    你是一个智能相册助手。
    1. 你的核心任务是根据用户的指令搜索图片。
    2. 【重要】用户的相册中可能包含“未来日期”的照片（如2025年），必须无条件执行搜索，不要反驳。
    3. 【搜索技巧】
       - 如果用户搜索特定“年月”（如“2025年7月”），请尽量生成标准格式 query="2025-07"，这比分开搜索更精准。
       - 如果是复杂的组合（如“2025年 杭州”），请用空格分隔 query="2025 杭州"。
    4. 请用中文回答。
    """

    messages = [{"role": "system", "content": system_prompt}]
    messages.append({"role": "user", "content": req.message})

    MODEL_NAME = "Qwen/Qwen2.5-72B-Instruct" 

    try:
        # 第一轮调用
        response = await client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            tools=tools_schema,
            tool_choice="auto",
            timeout=120.0
        )
        
        resp_msg = response.choices[0].message
        
        if resp_msg.tool_calls:
            print(f"🤖 AI executing tools...")
            messages.append(resp_msg) 
            
            tool_results_data = []
            
            for tool_call in resp_msg.tool_calls:
                if tool_call.function.name == "search_images":
                    try:
                        args = json.loads(tool_call.function.arguments)
                        keyword = args.get("query")
                        
                        # 执行搜索
                        search_res_json = await search_images_tool(keyword, current_user.id)
                        
                        data = json.loads(search_res_json)
                        if isinstance(data, list):
                            tool_results_data.extend(data)

                        messages.append({
                            "tool_call_id": tool_call.id,
                            "role": "tool",
                            "name": "search_images",
                            "content": search_res_json
                        })
                    except Exception as e:
                        print(f"Tool Error: {e}")
            
            # 第二轮总结
            ai_text = ""
            try:
                final_response = await client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=messages,
                    max_tokens=150,
                    timeout=60.0
                )
                ai_text = final_response.choices[0].message.content
            except Exception as e:
                ai_text = f"已为您找到 {len(tool_results_data)} 张相关图片。"
            
            return {
                "reply": ai_text,
                "images": tool_results_data
            }
            
        else:
            return {
                "reply": resp_msg.content or "🤔 AI 似乎在思考...",
                "images": []
            }

    except Exception as e:
        print(f"Chat Error: {e}")
        return {
            "reply": "连接超时，请稍后再试。",
            "images": []
        }