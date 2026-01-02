import React, { useState, useRef } from 'react';
import { SearchBar, Image, FloatingBubble, InfiniteScroll, Toast, PullToRefresh, ImageViewer, ActionSheet } from 'antd-mobile';
import { AddOutline, MoreOutline, SearchOutline } from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import request, { STATIC_URL } from '../utils/request';
import type { Action } from 'antd-mobile/es/components/action-sheet';

export default function Home() {
  const navigate = useNavigate();
  const [data, setData] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  
  // 轮播图状态
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  async function loadMore(isRefresh = false) {
    const skip = isRefresh ? 0 : data.length;
    try {
      const res: any = await request.get('/images/', {
        params: { skip, limit: 10, tag: search || undefined }
      });
      if (isRefresh) setData(res);
      else setData(val => [...val, ...res]);
      setHasMore(res.length >= 10);
    } catch (e) { setHasMore(false); }
  }

  const triggerUpload = () => { fileRef.current?.click(); };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; 
    const formData = new FormData();
    formData.append('file', file);
    
    Toast.show({ icon: 'loading', content: '上传中...', duration: 0 });
    try {
      await request.post('/images/upload', formData);
      Toast.clear();
      Toast.show({ icon: 'success', content: '上传成功' });
      loadMore(true); 
    } catch (e) { Toast.clear(); }
  };

  const handleImageClick = (index: number, id: number) => {
    ActionSheet.show({
      actions: [{ key: 'view', text: '大图轮播' }, { key: 'detail', text: '查看详情与编辑' }],
      closeOnAction: true,
      onAction: (action: Action) => {
        if (action.key === 'view') { setViewerIndex(index); setViewerVisible(true); }
        else if (action.key === 'detail') { navigate(`/detail/${id}`); }
      },
    });
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* 顶部磨砂搜索栏 */}
      <div className="glass-nav" style={{ 
        position: 'sticky', top: 0, zIndex: 99, padding: '12px 16px',
        display: 'flex', gap: 12, alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
      }}>
        <div style={{ flex: 1, background: '#f5f5f5', borderRadius: 20, padding: '0 4px' }}>
          <SearchBar 
            placeholder='搜索图片标签...' 
            onSearch={val => { setSearch(val); loadMore(true); }} 
            style={{ '--background': 'transparent' }}
          />
        </div>
        <div 
          onClick={triggerUpload} 
          style={{ 
            width: 36, height: 36, borderRadius: '50%', background: '#1677ff', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', cursor: 'pointer', boxShadow: '0 4px 10px rgba(22, 119, 255, 0.3)'
          }}
        >
          <AddOutline fontSize={20} />
        </div>
      </div>

      <PullToRefresh onRefresh={() => loadMore(true)}>
        {/* 瀑布流布局 */}
        <div className="masonry-grid">
          {data.map((item, index) => (
            <div key={item.id} className="image-card" onClick={() => handleImageClick(index, item.id)}>
              <img src={`${STATIC_URL}/${item.thumbnail_path}`} loading="lazy" alt="img" />
              
              {/* 图片上的遮罩信息 */}
              <div style={{ padding: '8px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#666', background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>
                    {item.resolution || 'UNK'}
                  </span>
                  <MoreOutline color='#999' />
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {data.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: '#ccc' }}>
            <SearchOutline fontSize={48} />
            <p>暂无图片，去上传一张吧</p>
          </div>
        )}
        
        <InfiniteScroll loadMore={() => loadMore(false)} hasMore={hasMore} />
      </PullToRefresh>

      <ImageViewer.Multi
        images={data.map(item => `${STATIC_URL}/${item.file_path}`)}
        visible={viewerVisible}
        defaultIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      <input type="file" ref={fileRef} style={{ display: 'none' }} accept="image/*" onChange={handleUpload} />
      
      {/* 悬浮球 (手机端补充) */}
      <FloatingBubble 
        style={{ '--initial-position-bottom': '90px', '--initial-position-right': '24px', '--z-index': '100', '--background': '#1677ff' }}
        onClick={triggerUpload}
      >
        <AddOutline fontSize={32} color='#fff' />
      </FloatingBubble>
    </div>
  );
}