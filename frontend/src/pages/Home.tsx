import React, { useState, useRef } from 'react';
import { SearchBar, FloatingBubble, InfiniteScroll, Toast, PullToRefresh, ImageViewer, ActionSheet } from 'antd-mobile';
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

  /**
   * 加载数据
   * @param isRefresh 是否为刷新/重新搜索
   * @param customTag 可选：强制使用的搜索标签（解决 state 异步更新问题）
   */
  async function loadMore(isRefresh = false, customTag?: string) {
    const skip = isRefresh ? 0 : data.length;
    
    // 逻辑：如果传入了 customTag (包括空字符串)，则优先使用它；否则使用状态中的 search
    // 这样在点击搜索的一瞬间，可以使用最新的值 customTag，而滚动加载时使用已保存的状态 search
    const activeSearch = customTag !== undefined ? customTag : search;

    try {
      const res: any = await request.get('/images/', {
        params: { 
          skip, 
          limit: 10, 
          tag: activeSearch || undefined // 空字符串转为 undefined，后端不过滤
        }
      });
      
      if (isRefresh) {
        setData(res);
        setHasMore(res.length >= 10); // 刷新时重置 hasMore 状态
      } else {
        setData(val => [...val, ...res]);
        setHasMore(res.length >= 10);
      }
    } catch (e) { 
      console.error(e);
      setHasMore(false); 
    }
  }

  const triggerUpload = () => { fileRef.current?.click(); };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 清空 input 使得同一文件可重复上传
    e.target.value = ''; 
    
    const formData = new FormData();
    formData.append('file', file);
    
    Toast.show({ icon: 'loading', content: '上传中...', duration: 0 });
    try {
      await request.post('/images/upload', formData);
      Toast.clear();
      Toast.show({ icon: 'success', content: '上传成功' });
      // 上传成功后刷新列表
      loadMore(true); 
    } catch (e) { 
      Toast.clear(); 
      Toast.show({ icon: 'fail', content: '上传失败' });
    }
  };

  const handleImageClick = (index: number, id: number) => {
    ActionSheet.show({
      actions: [{ key: 'view', text: '大图轮播' }, { key: 'detail', text: '查看详情与编辑' }],
      closeOnAction: true,
      onAction: (action: Action) => {
        if (action.key === 'view') { 
          setViewerIndex(index); 
          setViewerVisible(true); 
        }
        else if (action.key === 'detail') { 
          navigate(`/detail/${id}`); 
        }
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
            // 【关键修改】同时更新状态并传递当前值给 loadMore
            onSearch={val => { 
              setSearch(val); 
              loadMore(true, val); 
            }} 
            // 【关键修改】清空时重置列表
            onClear={() => {
              setSearch('');
              loadMore(true, '');
            }}
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
              <img 
                src={`${STATIC_URL}/${item.thumbnail_path}`} 
                loading="lazy" 
                alt="img"
                onError={(e) => {
                  // 图片加载失败时的回退逻辑（可选）
                  (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error';
                }} 
              />
              
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

      {/* 图片轮播查看器 */}
      <ImageViewer.Multi
        images={data.map(item => `${STATIC_URL}/${item.file_path}`)}
        visible={viewerVisible}
        defaultIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      {/* 隐藏的文件输入框 */}
      <input type="file" ref={fileRef} style={{ display: 'none' }} accept="image/*" onChange={handleUpload} />
      
      {/* 悬浮球 (手机端补充) */}
      <FloatingBubble 
        style={{ 
          '--initial-position-bottom': '90px', 
          '--initial-position-right': '24px', 
          '--z-index': '100', 
          '--background': '#1677ff' 
        }}
        onClick={triggerUpload}
      >
        <AddOutline fontSize={32} color='#fff' />
      </FloatingBubble>
    </div>
  );
}