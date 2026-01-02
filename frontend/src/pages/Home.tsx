import React, { useState, useRef } from 'react';
import { SearchBar, FloatingBubble, InfiniteScroll, Toast, PullToRefresh, ImageViewer, ActionSheet, Button, Dialog } from 'antd-mobile';
import { AddOutline, MoreOutline, SearchOutline, CheckCircleFill, CheckCircleOutline, DeleteOutline } from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import request, { STATIC_URL } from '../utils/request';
import type { Action } from 'antd-mobile/es/components/action-sheet';

export default function Home() {
  const navigate = useNavigate();
  const [data, setData] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  
  // --- 批量选择模式状态 ---
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // --- 轮播图状态 ---
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

  // --- 上传逻辑 (支持多选) ---
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

  // --- 交互逻辑 ---
  const handleItemClick = (index: number, id: number) => {
    if (isSelectionMode) {
      toggleSelection(id);
      return;
    }

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

  // --- 批量操作逻辑 ---
  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
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
    
    const result = await Dialog.confirm({
      content: `确定要删除选中的 ${selectedIds.size} 张图片吗？此操作不可恢复。`,
    });

    if (result) {
      Toast.show({ icon: 'loading', content: '删除中...', duration: 0 });
      try {
        await request.post('/images/batch-delete', { ids: Array.from(selectedIds) });
        Toast.clear();
        Toast.show('删除成功');
        setIsSelectionMode(false);
        setSelectedIds(new Set());
        loadMore(true);
      } catch (e) {
        Toast.clear();
        Toast.show('删除失败');
      }
    }
  };

  // 判断是否全选
  const isAllSelected = data.length > 0 && selectedIds.size === data.length;

  return (
    // 修改 1: 底部 padding 减小，因为没有底部栏了
    <div style={{ paddingBottom: 80 }}>
      {/* 顶部导航栏 */}
      <div className="glass-nav" style={{ 
        position: 'sticky', top: 0, zIndex: 99, background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
      }}>
        {/* 顶部第一行：标题与操作区 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', height: 44 }}>
          {/* 左侧：标题 */}
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>
            {isSelectionMode ? `已选 ${selectedIds.size}` : '我的相册'}
          </div>

          {/* 右侧：按钮组 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isSelectionMode ? (
              <>
                {/* 按钮 1: 全选 */}
                <Button 
                  size='mini' 
                  fill='none'
                  onClick={toggleSelectAll}
                  style={{ fontSize: 14, padding: '0 8px' }}
                >
                  {isAllSelected ? '取消全选' : '全选'}
                </Button>

                {/* 按钮 2: 删除 (图标形式，节省空间) */}
                <Button 
                  size='mini' 
                  color='danger'
                  fill='none'
                  disabled={selectedIds.size === 0}
                  onClick={handleBatchDelete}
                  style={{ padding: '0 4px', border: 'none' }}
                >
                  <DeleteOutline fontSize={20} />
                </Button>

                {/* 按钮 3: 完成 */}
                <Button 
                  size='mini' 
                  color='primary' 
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                >
                  完成
                </Button>
              </>
            ) : (
              /* 非选择模式：仅显示管理按钮 */
              <Button 
                size='mini' 
                fill='outline'
                onClick={() => setIsSelectionMode(true)}
              >
                批量管理
              </Button>
            )}
          </div>
        </div>

        {/* 顶部第二行：搜索栏 (仅在非选择模式下显示) */}
        {!isSelectionMode && (
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ background: '#f5f5f5', borderRadius: 20, padding: '0 4px' }}>
              <SearchBar 
                placeholder='搜索图片标签...' 
                onSearch={val => { setSearch(val); loadMore(true, val); }} 
                onClear={() => { setSearch(''); loadMore(true, ''); }}
                style={{ '--background': 'transparent' }}
              />
            </div>
          </div>
        )}
      </div>

      <PullToRefresh onRefresh={() => loadMore(true)}>
        {/* 瀑布流布局 */}
        <div className="masonry-grid" style={{ marginTop: 12 }}>
          {data.map((item, index) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <div 
                key={item.id} 
                className="image-card" 
                onClick={() => handleItemClick(index, item.id)}
                style={{ 
                  position: 'relative',
                  border: isSelectionMode && isSelected ? '2px solid #1677ff' : '2px solid transparent',
                  transform: isSelectionMode && isSelected ? 'scale(0.95)' : 'scale(1)',
                  transition: 'all 0.2s'
                }}
              >
                <img 
                  src={`${STATIC_URL}/${item.thumbnail_path}`} 
                  loading="lazy" 
                  alt="img"
                />
                
                {/* 选择模式下的勾选图标 */}
                {isSelectionMode && (
                  <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
                    {isSelected ? (
                      <CheckCircleFill fontSize={24} color='#1677ff' />
                    ) : (
                      <CheckCircleOutline fontSize={24} color='#fff' style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }} />
                    )}
                  </div>
                )}
                
                {!isSelectionMode && (
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#666', background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>
                        {item.resolution || 'UNK'}
                      </span>
                      <MoreOutline color='#999' />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {data.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: '#ccc' }}>
            <SearchOutline fontSize={48} />
            <p>暂无图片</p>
          </div>
        )}
        
        <InfiniteScroll loadMore={() => loadMore(false)} hasMore={hasMore} />
      </PullToRefresh>

      {/* 修改 2: 删除了底部的操作栏代码 */}

      <ImageViewer.Multi
        images={data.map(item => `${STATIC_URL}/${item.file_path}`)}
        visible={viewerVisible}
        defaultIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      <input 
        type="file" 
        multiple 
        ref={fileRef} 
        style={{ display: 'none' }} 
        accept="image/*" 
        onChange={handleUpload} 
      />
      
      {!isSelectionMode && (
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
      )}
    </div>
  );
}