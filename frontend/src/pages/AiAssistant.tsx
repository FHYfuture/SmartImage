import React, { useState, useRef, useEffect } from 'react';
import { NavBar, Input, Button, Avatar, Toast, Image } from 'antd-mobile';
import { SendOutline, PictureOutline } from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import request, { STATIC_URL } from '../utils/request';
import dayjs from 'dayjs';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  images?: any[]; // 关联的图片数据
}

export default function AiAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '你好！我是你的智能相册助手。你可以让我帮你找图片，比如：“找一下2025年10月的照片”' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || loading) return;
    
    const userMsg = inputValue;
    setInputValue('');
    setLoading(true);

    // 1. 添加用户消息上屏
    const newHistory = [...messages, { role: 'user', content: userMsg } as Message];
    setMessages(newHistory);

    try {
      // 2. 发送给后端
      const res: any = await request.post('/chat/completions', {
        message: userMsg,
        history: newHistory.filter(m => m.role !== 'assistant').map(m => ({ role: m.role, content: m.content })).slice(-5)
      });

      // 3. 添加 AI 回复
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: res.reply,
          images: res.images // 后端返回的图片列表
        }
      ]);
    } catch (e) {
      Toast.show('AI 响应超时或出错');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f5f5' }}>
      <div style={{ background: '#fff' }}>
        <NavBar onBack={() => navigate(-1)}>AI 助手</NavBar>
      </div>

      {/* 消息列表区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.map((msg, index) => (
          <div key={index} style={{ marginBottom: 24 }}>
            {/* 头像与气泡布局 */}
            <div style={{ 
              display: 'flex', 
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              gap: 12 
            }}>
              <Avatar src={msg.role === 'assistant' ? '' : ''} style={{ background: msg.role === 'assistant' ? '#1677ff' : '#ccc' }} />
              
              <div style={{ maxWidth: '80%' }}>
                {/* 文本气泡 */}
                <div style={{ 
                  background: msg.role === 'user' ? '#1677ff' : '#fff',
                  color: msg.role === 'user' ? '#fff' : '#333',
                  padding: '10px 14px', borderRadius: 8,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                  lineHeight: 1.6, whiteSpace: 'pre-wrap'
                }}>
                  {msg.content}
                </div>

                {/* 如果有图片结果，渲染为横向卡片流 */}
                {msg.images && msg.images.length > 0 && (
                  <div style={{ 
                    marginTop: 12, display: 'flex', gap: 12, overflowX: 'auto', 
                    paddingBottom: 4, scrollbarWidth: 'none' 
                  }}>
                    {msg.images.map((img: any) => (
                      <div 
                        key={img.id} 
                        onClick={() => navigate(`/detail/${img.id}`)}
                        style={{ 
                          minWidth: 120, background: '#fff', borderRadius: 8, overflow: 'hidden',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)', cursor: 'pointer'
                        }}
                      >
                        <Image 
                          src={`${STATIC_URL}/${img.thumbnail_path}`} 
                          fit='cover' 
                          style={{ width: 120, height: 120, display: 'block' }} 
                        />
                        <div style={{ padding: 6, fontSize: 10, color: '#666' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{dayjs(img.date).format('MM-DD')}</div>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {img.location || '未知地点'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && <div style={{ textAlign: 'center', color: '#999', fontSize: 12 }}>AI 正在思考...</div>}
        <div ref={bottomRef} />
      </div>

      {/* 底部输入框 */}
      <div style={{ padding: '12px 16px', background: '#fff', borderTop: '1px solid #eee', display: 'flex', gap: 12, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div style={{ flex: 1, background: '#f5f5f5', borderRadius: 20, padding: '8px 16px' }}>
          <Input 
            placeholder="告诉 AI 你想找什么..." 
            value={inputValue} 
            onChange={val => setInputValue(val)}
            onEnterPress={handleSend}
            style={{ '--font-size': '14px' }}
          />
        </div>
        <Button 
          color='primary' 
          shape='rounded' 
          onClick={handleSend} 
          disabled={loading || !inputValue.trim()}
          style={{ width: 60, padding: 0 }}
        >
          <SendOutline />
        </Button>
      </div>
    </div>
  );
}