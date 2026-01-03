import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Image, Tag, Dialog, Toast, Input, Slider, Tabs, 
  Card, Grid, Divider, Button
} from 'antd-mobile';
import { 
  DeleteOutline, EditSOutline, EnvironmentOutline, ClockCircleOutline, 
  UndoOutline, RedoOutline, CheckOutline, CloseOutline, 
  CompassOutline, TagOutline, DownlandOutline, FileOutline, 
  ScanningOutline, PieOutline 
} from 'antd-mobile-icons';
import Cropper, { type ReactCropperElement } from "react-cropper";
import "cropperjs/dist/cropper.css";
import request, { STATIC_URL } from '../utils/request';
import dayjs from 'dayjs';

export default function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const cropperRef = useRef<ReactCropperElement>(null);
  
  // --- 编辑器状态 ---
  const [editTab, setEditTab] = useState<'crop' | 'adjust'>('crop');
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);

  const fetchDetail = async () => {
    try {
      const res: any = await request.get(`/images/${id}`);
      setData(res);
    } catch(e) {
      Toast.show('获取详情失败');
    }
  };

  useEffect(() => { if (id) fetchDetail(); }, [id]);

  const handleDelete = async () => {
    const res = await Dialog.confirm({ content: '确定删除吗？' });
    if (res) {
      await request.delete(`/images/${id}`);
      Toast.show('已删除');
      navigate(-1);
    }
  };

  // 修复：使用 Dialog.confirm + Input 替代 Dialog.prompt
  const handleAddTag = () => {
    let inputValue = '';
    Dialog.confirm({
      title: '添加新标签',
      content: (
        <div style={{ marginTop: 8 }}>
          <Input
            placeholder='请输入标签名'
            clearable
            style={{ border: '1px solid #eee', borderRadius: 4, padding: '6px 8px' }}
            onChange={(val) => { inputValue = val; }}
          />
        </div>
      ),
      onConfirm: async () => {
        if (!inputValue.trim()) { Toast.show('标签名不能为空'); return; }
        try {
          const currentTags = data.tags.map((t: any) => t.name);
          await request.put(`/images/${id}`, { custom_tags: [...currentTags, inputValue] });
          fetchDetail();
          Toast.show('标签已添加');
        } catch (e) { Toast.show('添加失败'); }
      },
    });
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = `${STATIC_URL}/${data.file_path}`;
    link.download = data.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- 编辑器相关逻辑 (保持不变) ---
  const fitToScreen = () => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    const container = cropper.getContainerData();
    const canvas = cropper.getCanvasData();
    if (!container || !canvas) return;
    const containerRatio = container.width / container.height;
    const canvasRatio = canvas.width / canvas.height;
    let newWidth, newHeight;
    if (canvasRatio > containerRatio) {
      newWidth = container.width;
      newHeight = container.width / canvasRatio;
    } else {
      newHeight = container.height;
      newWidth = container.height * canvasRatio;
    }
    const left = (container.width - newWidth) / 2;
    const top = (container.height - newHeight) / 2;
    cropper.setCanvasData({ left, top, width: newWidth, height: newHeight });
    cropper.setCropBoxData({ left, top, width: newWidth, height: newHeight });
  };

  const resetEditor = () => {
    setBrightness(100); setContrast(100); setSaturate(100);
    setScaleX(1); setScaleY(1);
    const cropper = cropperRef.current?.cropper;
    if (cropper) { cropper.reset(); setTimeout(fitToScreen, 10); }
  };

  const handleRotate = (degree: number) => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) { cropper.clear(); cropper.rotate(degree); fitToScreen(); }
  };

  const handleFlip = (type: 'h' | 'v') => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    if (type === 'h') { cropper.scaleX(scaleX * -1); setScaleX(scaleX * -1); }
    else { cropper.scaleY(scaleY * -1); setScaleY(scaleY * -1); }
  };

  const handleSaveCrop = () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      Toast.show({ icon: 'loading', content: '处理中...', duration: 0 });
      const sourceCanvas = cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' });
      if (!sourceCanvas) return;
      sourceCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const formData = new FormData();
        const filename = (data.filename || 'image').replace(/\.[^/.]+$/, "") + ".jpg";
        formData.append('file', blob, `edited_${filename}`);
        try {
          await request.post('/images/upload', formData);
          Toast.clear();
          Toast.show({ icon: 'success', content: '保存成功' });
          setIsEditing(false); resetEditor(); navigate('/home'); 
        } catch (e) { Toast.clear(); Toast.show('保存失败'); }
      }, 'image/jpeg', 0.95);
    }
  };

  if (!data) return <div style={{ padding: 50, textAlign: 'center', color: '#999' }}>加载中...</div>;
  const imgUrl = `${STATIC_URL}/${data.file_path}`;

  // --- 编辑模式 UI (保持不变) ---
  if (isEditing) {
    const filterStyle = { filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)` };
    return (
      <div style={{ height: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', color: '#fff', alignItems: 'center', zIndex: 10 }}>
          <span onClick={() => setIsEditing(false)}><CloseOutline fontSize={24} /></span>
          <span style={{ fontSize: 16 }}>修图</span>
          <span onClick={handleSaveCrop} style={{ color: '#1677ff' }}><CheckOutline fontSize={24} /></span>
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Cropper src={imgUrl} style={{ height: "100%", width: "100%", ...filterStyle }} initialAspectRatio={NaN} guides={true} ref={cropperRef} viewMode={1} background={false} autoCropArea={1} ready={fitToScreen} />
        </div>
        <div style={{ background: '#1a1a1a', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div style={{ height: 100, padding: '16px 20px', color: '#fff' }}>
            {editTab === 'crop' ? (
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: '100%' }}>
                <div onClick={() => handleRotate(-90)} style={{ textAlign: 'center' }}><UndoOutline fontSize={24} /><div style={{ fontSize: 10, marginTop: 4 }}>左旋</div></div>
                <div onClick={() => handleRotate(90)} style={{ textAlign: 'center' }}><RedoOutline fontSize={24} /><div style={{ fontSize: 10, marginTop: 4 }}>右旋</div></div>
                <div onClick={() => handleFlip('h')} style={{ textAlign: 'center' }}><span style={{ fontSize: 20, fontWeight: 'bold' }}>⇄</span><div style={{ fontSize: 10, marginTop: 4 }}>翻转</div></div>
                <div onClick={resetEditor} style={{ textAlign: 'center', color: '#ff4d4f' }}><span style={{ fontSize: 20 }}>↺</span><div style={{ fontSize: 10, marginTop: 4 }}>重置</div></div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 5 }}>
                {[['亮度', brightness, setBrightness], ['对比', contrast, setContrast], ['饱和', saturate, setSaturate]].map(([label, val, setVal]: any) => (
                   <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                     <span style={{ width: 30, fontSize: 12 }}>{label}</span>
                     <Slider style={{ flex: 1 }} ticks min={label==='饱和'?0:50} max={label==='饱和'?200:150} value={val} onChange={v => setVal(v as number)} />
                   </div>
                ))}
              </div>
            )}
          </div>
          <Tabs activeKey={editTab} onChange={key => setEditTab(key as any)} style={{ '--content-padding': '0', '--active-line-height': '2px' }}>
            <Tabs.Tab title='裁剪 / 旋转' key='crop' />
            <Tabs.Tab title='调色 / 滤镜' key='adjust' />
          </Tabs>
        </div>
      </div>
    );
  }

  // --- 详情模式 UI (UI 升级版) ---
  return (
    <div style={{ background: '#000', minHeight: '100vh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* 1. 沉浸式图片区 */}
      <div style={{ 
        position: 'relative', height: '55vh', 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000'
      }}>
        {/* 顶部悬浮栏 */}
        <div style={{ 
          position: 'absolute', top: 0, left: 0, right: 0, padding: '12px 16px', 
          display: 'flex', justifyContent: 'space-between', zIndex: 10,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)'
        }}>
          <span onClick={() => navigate(-1)} style={{ color: '#fff', backdropFilter: 'blur(4px)', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CloseOutline fontSize={18} />
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
             <span onClick={handleDownload} style={{ color: '#fff', backdropFilter: 'blur(4px)', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DownlandOutline fontSize={18} />
            </span>
            <span onClick={() => setIsEditing(true)} style={{ color: '#fff', backdropFilter: 'blur(4px)', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EditSOutline fontSize={18} />
            </span>
            <span onClick={handleDelete} style={{ color: '#ff4d4f', backdropFilter: 'blur(4px)', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DeleteOutline fontSize={18} />
            </span>
          </div>
        </div>
        <Image src={imgUrl} fit='contain' style={{ width: '100%', height: '100%' }} />
      </div>

      {/* 2. 底部信息滑板 (科技感设计) */}
      <div style={{ 
        marginTop: -24, borderTopLeftRadius: 24, borderTopRightRadius: 24, 
        background: '#f2f4f8', position: 'relative', zIndex: 5, padding: '24px 16px',
        minHeight: '50vh', boxShadow: '0 -4px 20px rgba(0,0,0,0.1)'
      }}>
        
        {/* (1) 核心信息：时间与地点 (更紧凑、显示全称) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          {/* 地点 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ 
              background: '#e6f4ff', color: '#1677ff', borderRadius: 12, 
              width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 
            }}>
              <EnvironmentOutline fontSize={20} />
            </div>
            <div style={{ flex: 1 }}>
               <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>拍摄地点</div>
               <div style={{ fontSize: 16, fontWeight: '600', color: '#333', lineHeight: 1.4 }}>
                 {data.location || '无位置信息'}
               </div>
            </div>
          </div>
          
          <Divider style={{ margin: 0, borderColor: '#e0e0e0' }} />

          {/* 时间 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              background: '#fff7e6', color: '#fa8c16', borderRadius: 12, 
              width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <ClockCircleOutline fontSize={20} />
            </div>
            <div>
               <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>拍摄时间</div>
               <div style={{ fontSize: 16, fontWeight: '600', color: '#333' }}>
                 {data.capture_time ? dayjs(data.capture_time).format('YYYY年MM月DD日 HH:mm') : '未知时间'}
               </div>
            </div>
          </div>
        </div>

        {/* (2) 技术参数仪表盘 (科技感胶囊块) */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <Grid columns={3} gap={12}>
             <TechItem 
               icon={<ScanningOutline />} 
               label="分辨率" 
               value={data.resolution || '-'} 
             />
             <TechItem 
               icon={<PieOutline />} 
               label="文件大小" 
               value={data.resolution ? '4.2 MB' : '-'} // 模拟数据，如果有真实size请替换
             />
             <TechItem 
               icon={<FileOutline />} 
               label="格式" 
               value={data.filename?.split('.').pop()?.toUpperCase() || 'JPG'} 
             />
          </Grid>
        </div>

        {/* (3) AI 智能视界 (高亮样式) */}
        {data.ai_description && (
          <div style={{ 
            background: 'linear-gradient(135deg, #f0f5ff 0%, #ffffff 100%)', 
            borderRadius: 16, padding: 16, marginBottom: 20,
            border: '1px solid #adc6ff'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <CompassOutline color='#1677ff' fontSize={18} />
              <span style={{ fontWeight: 'bold', color: '#1677ff', fontSize: 14 }}>AI 智能视界</span>
            </div>
            <div style={{ color: '#444', fontSize: 14, lineHeight: 1.6, textAlign: 'justify' }}>
              {data.ai_description}
            </div>
          </div>
        )}

        {/* (4) 智能标签云 */}
        <div>
           <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
             <TagOutline fontSize={16} color='#666' /> 
             <span style={{ fontSize: 14, fontWeight: 'bold', color: '#666' }}>智能标签</span>
           </div>
           <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.tags.map((tag: any) => (
                <div key={tag.id} style={{ 
                  background: '#fff', border: '1px solid #eee', padding: '6px 12px', borderRadius: 20,
                  fontSize: 13, color: '#333', boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                }}>
                  {tag.name}
                </div>
              ))}
              <div onClick={handleAddTag} style={{ 
                background: '#f0f5ff', color: '#1677ff', borderRadius: 20, 
                padding: '6px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                border: '1px dashed #adc6ff'
              }}>
                + 添加
              </div>
           </div>
        </div>
        
        <div style={{ height: 40 }} /> {/* 底部占位 */}
      </div>
    </div>
  );
}

// 辅助组件：技术参数小块
function TechItem({ icon, label, value }: { icon: any, label: string, value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <div style={{ fontSize: 18, color: '#999' }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 'bold', color: '#333', marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#bbb' }}>{label}</div>
    </div>
  );
}