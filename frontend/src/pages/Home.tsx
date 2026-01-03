import React, { useState, useRef, useEffect } from 'react';
import { SearchBar, FloatingBubble, InfiniteScroll, Toast, PullToRefresh, ImageViewer, Button, Dialog, Modal } from 'antd-mobile';
import { 
  AddOutline, MoreOutline, SearchOutline, CheckCircleFill, CheckCircleOutline, 
  DeleteOutline, DownOutline, EnvironmentOutline, ClockCircleOutline, 
  PictureOutline, EyeOutline, EditSOutline, DownlandOutline 
} from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import request, { STATIC_URL, baseURL } from '../utils/request';
import dayjs from 'dayjs';

export default function Home() {
  const navigate = useNavigate();
  const [data, setData] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  
  // --- 批量选择模式状态 ---
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // --- 增强版轮播图状态 ---
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // 加载数据
  async function loadMore(isRefresh = false, customTag?: string) {
    const skip = isRefresh ? 0 : data.length;
    const activeSearch = customTag !== undefined ? customTag : search;

    try {
      const res: any = await request.get('/images/', {
        params: { skip, limit: 10, tag: activeSearch || undefined }
      });
      
      if (isRefresh) {
        setData(res);
        setHasMore(res.length >= 10);
      } else {
        setData(val => [...val, ...res]);
        setHasMore(res.length >= 10);
      }
    } catch (e) { 
      setHasMore(false); 
    }
  }

  // --- 上传逻辑 ---
  const triggerUpload = () => { fileRef.current?.click(); };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const total = files.length;
    let successCount = 0;
    
    Toast.show({ icon: 'loading', content: `正在上传 0/${total}...`, duration: 0 });

    const uploadPromises = Array.from(files).map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      try {
        await request.post('/images/upload', formData);
        successCount++;
        Toast.show({ icon: 'loading', content: `正在上传 ${successCount}/${total}...`, duration: 0 });
      } catch (err) {
        console.error(err);
      }
    });

    await Promise.all(uploadPromises);

    e.target.value = ''; 
    Toast.clear();
    Toast.show({ icon: 'success', content: `成功上传 ${successCount} 张图片` });
    loadMore(true); 
  };

  // --- 点击交互 ---
  const handleItemClick = (index: number, id: number) => {
    if (isSelectionMode) {
      toggleSelection(id);
    } else {
      // 直接打开增强版大图
      setViewerIndex(index); 
      setViewerVisible(true); 
    }
  };

  // --- 批量选择逻辑 ---
  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === data.length && data.length > 0) {
      setSelectedIds(new Set());
    } else {
      const allIds = data.map(item => item.id);
      setSelectedIds(new Set(allIds));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const result = await Dialog.confirm({ content: `确定删除 ${selectedIds.size} 张图片吗？` });
    if (result) {
      Toast.show({ icon: 'loading', content: '删除中...', duration: 0 });
      try {
        await request.post('/images/batch-delete', { ids: Array.from(selectedIds) });
        Toast.clear();
        Toast.show('删除成功');
        setIsSelectionMode(false);
        setSelectedIds(new Set());
        loadMore(true);
      } catch (e) { Toast.show('删除失败'); }
    }
  };

  // --- 单图操作逻辑 (在大图模式下使用) ---
  const handleSingleDelete = async (id: number) => {
    const result = await Dialog.confirm({ content: '确定删除这张图片吗？' });
    if (result) {
      await request.delete(`/images/${id}`);
      Toast.show('已删除');
      setViewerVisible(false);
      loadMore(true);
    }
  };

  const handleDownload = (filePath: string) => {
    const link = document.createElement('a');
    // 注意：这里需要完整的 URL，且如果跨域可能需要后端配置 CORS
    link.href = `${STATIC_URL}/${filePath}`;
    link.download = filePath.split('/').pop() || 'image.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- 渲染大图覆盖层 (Immersive Overlay) ---
  // 这是本次修改的核心：自定义一个悬浮在 ImageViewer 之上的 UI 层
  const renderViewerOverlay = () => {
    if (!viewerVisible || !data[viewerIndex]) return null;
    
    const currentImg = data[viewerIndex];
    const dateStr = currentImg.capture_time 
      ? dayjs(currentImg.capture_time).format('YYYY年MM月DD日 HH:mm') 
      : dayjs(currentImg.upload_time).format('YYYY-MM-DD (上传)');

    return (
      <div 
        className="viewer-overlay" 
        style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          zIndex: 1001, pointerEvents: 'none', // 让点击事件穿透到底下的图片
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
        }}
      >
        {/* 顶部栏 */}
        <div style={{ 
          padding: '12px 16px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)', 
          color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto'
        }}>
          <div style={{ fontSize: 14 }}>
            {viewerIndex + 1} / {data.length}
          </div>
          <span onClick={() => setViewerVisible(false)} style={{ fontSize: 24, cursor: 'pointer' }}>×</span>
        </div>

        {/* 底部详细信息栏 */}
        <div style={{ 
          background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', 
          padding: '20px 16px 30px', color: '#fff', pointerEvents: 'auto'
        }}>
          {/* 信息区 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ClockCircleOutline /> {dateStr}
            </div>
            {currentImg.location && (
              <div style={{ fontSize: 13, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6 }}>
                <EnvironmentOutline /> {currentImg.location}
              </div>
            )}
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4, marginLeft: 22 }}>
              {currentImg.resolution || '未知分辨率'} · {currentImg.filename}
            </div>
          </div>

          {/* 按钮操作区 */}
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            <div onClick={() => navigate(`/detail/${currentImg.id}`)} style={{ textAlign: 'center', opacity: 0.9 }}>
              <EditSOutline fontSize={24} />
              <div style={{ fontSize: 10, marginTop: 2 }}>编辑/详情</div>
            </div>
            <div onClick={() => handleDownload(currentImg.file_path)} style={{ textAlign: 'center', opacity: 0.9 }}>
              <DownlandOutline fontSize={24} />
              <div style={{ fontSize: 10, marginTop: 2 }}>原图下载</div>
            </div>
            <div onClick={() => handleSingleDelete(currentImg.id)} style={{ textAlign: 'center', color: '#ff4d4f' }}>
              <DeleteOutline fontSize={24} />
              <div style={{ fontSize: 10, marginTop: 2 }}>删除</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const isAllSelected = data.length > 0 && selectedIds.size === data.length;

  return (
    <div style={{ paddingBottom: 80, background: '#f9f9f9', minHeight: '100vh' }}>
      {/* 顶部导航栏 */}
      <div className="glass-nav" style={{ 
        position: 'sticky', top: 0, zIndex: 99, background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', height: 44 }}>
          <div style={{ fontSize: 20, fontWeight: '800', color: '#333' }}>
            {isSelectionMode ? `已选 ${selectedIds.size}` : 'Photos'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isSelectionMode ? (
              <>
                <Button size='mini' fill='none' onClick={toggleSelectAll}>
                  {isAllSelected ? '取消' : '全选'}
                </Button>
                <Button size='mini' color='danger' fill='none' disabled={selectedIds.size === 0} onClick={handleBatchDelete} style={{ border: 'none' }}>
                  <DeleteOutline fontSize={22} />
                </Button>
                <Button size='mini' color='primary' shape='rounded' onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}>
                  完成
                </Button>
              </>
            ) : (
              <Button size='mini' fill='none' onClick={() => setIsSelectionMode(true)} style={{ fontWeight: 'bold' }}>
                选择
              </Button>
            )}
          </div>
        </div>

        {!isSelectionMode && (
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ background: '#f0f2f5', borderRadius: 12, padding: '2px 4px' }}>
              <SearchBar placeholder='搜索地点、时间或标签...' onSearch={val => { setSearch(val); loadMore(true, val); }} onClear={() => { setSearch(''); loadMore(true, ''); }} style={{ '--background': 'transparent' }} />
            </div>
          </div>
        )}
      </div>

      <PullToRefresh onRefresh={() => loadMore(true)}>
        <div className="masonry-grid" style={{ padding: '8px', gap: '8px' }}>
          {data.map((item, index) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <div 
                key={item.id} 
                className="image-card" 
                onClick={() => handleItemClick(index, item.id)}
                style={{ 
                  position: 'relative', borderRadius: 8, overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)', background: '#fff',
                  transform: isSelectionMode && isSelected ? 'scale(0.95)' : 'scale(1)',
                  transition: 'all 0.2s',
                  border: isSelectionMode && isSelected ? '2px solid #1677ff' : 'none'
                }}
              >
                <img src={`${STATIC_URL}/${item.thumbnail_path}`} loading="lazy" alt="img" style={{ display: 'block', width: '100%' }} />
                
                {/* 遮罩层：增强文字可读性 */}
                {!isSelectionMode && (
                   <div style={{ 
                     position: 'absolute', bottom: 0, left: 0, right: 0, 
                     background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
                     padding: '20px 8px 6px', pointerEvents: 'none'
                   }}>
                     <div style={{ color: '#fff', fontSize: 10, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{item.capture_time ? dayjs(item.capture_time).format('MM-DD') : ''}</span>
                        {item.location && <span>{item.location.split(' ').pop()}</span>}
                     </div>
                   </div>
                )}

                {isSelectionMode && (
                  <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 10 }}>
                    {isSelected ? <CheckCircleFill fontSize={22} color='#1677ff' /> : <CheckCircleOutline fontSize={22} color='#fff' style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {data.length === 0 && (
          <div style={{ textAlign: 'center', padding: 80, color: '#ccc' }}>
            <PictureOutline fontSize={64} style={{ opacity: 0.5 }} />
            <p style={{ marginTop: 16 }}>暂无照片，快去上传吧</p>
          </div>
        )}
        <InfiniteScroll loadMore={() => loadMore(false)} hasMore={hasMore} />
      </PullToRefresh>

      {/* 增强版图片查看器 */}
      {viewerVisible && (
        <>
          {renderViewerOverlay()}
          <ImageViewer.Multi
            images={data.map(item => `${STATIC_URL}/${item.file_path}`)}
            visible={viewerVisible}
            defaultIndex={viewerIndex}
            onClose={() => setViewerVisible(false)}
            onIndexChange={(index) => setViewerIndex(index)}
          />
        </>
      )}

      <input type="file" multiple ref={fileRef} style={{ display: 'none' }} accept="image/*" onChange={handleUpload} />
      
      {!isSelectionMode && (
        <FloatingBubble 
          style={{ '--initial-position-bottom': '40px', '--initial-position-right': '20px', '--z-index': '90', '--background': '#000' }}
          onClick={triggerUpload}
        >
          <AddOutline fontSize={32} color='#fff' />
        </FloatingBubble>
      )}
    </div>
  );
}