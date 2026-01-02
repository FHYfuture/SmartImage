import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Image, NavBar, Tag, List, Button, Dialog, Toast, Input, Slider, Tabs } from 'antd-mobile';
import { 
  DeleteOutline, EditSOutline, EnvironmentOutline, ClockCircleOutline, 
  UndoOutline, RedoOutline, CheckOutline, CloseOutline 
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
  const [newTag, setNewTag] = useState('');

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

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    try {
      const currentTags = data.tags.map((t: any) => t.name);
      await request.put(`/images/${id}`, { custom_tags: [...currentTags, newTag] });
      setNewTag('');
      fetchDetail();
      Toast.show('标签已添加');
    } catch (e) {}
  };

  // --- 编辑器操作 ---
  
  const resetEditor = () => {
    setBrightness(100);
    setContrast(100);
    setSaturate(100);
    setScaleX(1);
    setScaleY(1);
    cropperRef.current?.cropper.reset();
  };

const handleRotate = (degree: number) => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      cropper.rotate(degree);
      
      // 1. 强制缩小图片以适应容器 (viewMode: 1 会限制最小缩放为 Fit 状态)
      // 这样解决了“持续放大”的问题
      cropper.zoomTo(0); 
      
      // 2. 将裁剪框设置为容器大小 (0,0 -> full width/height)
      // viewMode: 1 会自动把这个框“压”到图片边缘，实现全选
      // 这样避免了读取 canvasData 导致的计算循环
      const containerData = cropper.getContainerData();
      cropper.setCropBoxData({
        left: 0,
        top: 0,
        width: containerData.width,
        height: containerData.height
      });
    }
  };

  const handleFlip = (type: 'h' | 'v') => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    if (type === 'h') {
      const newScale = scaleX * -1;
      cropper.scaleX(newScale);
      setScaleX(newScale);
    } else {
      const newScale = scaleY * -1;
      cropper.scaleY(newScale);
      setScaleY(newScale);
    }
  };

  const handleSaveCrop = () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      Toast.show({ icon: 'loading', content: '处理图片中...', duration: 0 });

      // 1. 获取裁剪后的 Canvas
      const sourceCanvas = cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' });
      if (!sourceCanvas) return;

      // 2. 创建新 Canvas 用于应用滤镜 (亮度/对比度等)
      const targetCanvas = document.createElement('canvas');
      targetCanvas.width = sourceCanvas.width;
      targetCanvas.height = sourceCanvas.height;
      const ctx = targetCanvas.getContext('2d');

      if (ctx) {
        // 应用滤镜
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`;
        ctx.drawImage(sourceCanvas, 0, 0);

        // 3. 导出为 Blob
        targetCanvas.toBlob(async (blob) => {
          if (!blob) return;
          const formData = new FormData();
          // 强制使用 .jpg 后缀
          const filename = (data.filename || 'image').replace(/\.[^/.]+$/, "") + ".jpg";
          formData.append('file', blob, `edited_${filename}`);
          
          try {
            await request.post('/images/upload', formData);
            Toast.clear();
            Toast.show({ icon: 'success', content: '保存副本成功' });
            setIsEditing(false);
            resetEditor();
            navigate('/home'); 
          } catch (e) {
            Toast.clear();
            Toast.show('保存失败');
          }
        }, 'image/jpeg', 0.95);
      }
    }
  };

  if (!data) return <div>加载中...</div>;
  const imgUrl = `${STATIC_URL}/${data.file_path}`;

  // --- 编辑模式 UI ---
  if (isEditing) {
    const filterStyle = {
      filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`
    };

    return (
      <div style={{ height: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
        {/* 顶部栏 */}
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', color: '#fff', alignItems: 'center', zIndex: 10 }}>
          <span onClick={() => setIsEditing(false)}><CloseOutline fontSize={24} /></span>
          <span style={{ fontSize: 16 }}>编辑图片</span>
          <span onClick={handleSaveCrop} style={{ color: '#1677ff' }}><CheckOutline fontSize={24} /></span>
        </div>

        {/* 裁剪主区域 */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Cropper
            src={imgUrl}
            style={{ height: "100%", width: "100%", ...filterStyle }} 
            initialAspectRatio={NaN}
            guides={true}
            ref={cropperRef}
            viewMode={1}
            background={false}
            autoCropArea={1} 
          />
        </div>

        {/* 底部工具栏 */}
        <div style={{ background: '#1a1a1a', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div style={{ height: 120, padding: '16px 20px', color: '#fff' }}>
            {editTab === 'crop' ? (
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: '100%' }}>
                <div onClick={() => handleRotate(-90)} style={{ textAlign: 'center' }}>
                  <UndoOutline fontSize={28} />
                  <div style={{ fontSize: 12, marginTop: 4 }}>左旋90°</div>
                </div>
                <div onClick={() => handleRotate(90)} style={{ textAlign: 'center' }}>
                  <RedoOutline fontSize={28} />
                  <div style={{ fontSize: 12, marginTop: 4 }}>右旋90°</div>
                </div>
                <div onClick={() => handleFlip('h')} style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 24, fontWeight: 'bold' }}>⇄</span>
                  <div style={{ fontSize: 12, marginTop: 4 }}>水平翻转</div>
                </div>
                <div onClick={resetEditor} style={{ textAlign: 'center', color: '#ff4d4f' }}>
                  <span style={{ fontSize: 24 }}>↺</span>
                  <div style={{ fontSize: 12, marginTop: 4 }}>重置</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 40, fontSize: 12 }}>亮度</span>
                  <Slider 
                    style={{ flex: 1 }} ticks min={50} max={150} 
                    value={brightness} onChange={v => setBrightness(v as number)} 
                  />
                  <span style={{ width: 30, fontSize: 12 }}>{brightness}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 40, fontSize: 12 }}>对比</span>
                  <Slider 
                    style={{ flex: 1 }} ticks min={50} max={150} 
                    value={contrast} onChange={v => setContrast(v as number)} 
                  />
                  <span style={{ width: 30, fontSize: 12 }}>{contrast}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 40, fontSize: 12 }}>饱和</span>
                  <Slider 
                    style={{ flex: 1 }} ticks min={0} max={200} 
                    value={saturate} onChange={v => setSaturate(v as number)} 
                  />
                  <span style={{ width: 30, fontSize: 12 }}>{saturate}%</span>
                </div>
              </div>
            )}
          </div>

          <Tabs 
            activeKey={editTab} 
            onChange={key => setEditTab(key as any)}
            style={{ '--content-padding': '0', '--active-line-height': '2px' }}
          >
            <Tabs.Tab title='裁剪 / 旋转' key='crop' />
            <Tabs.Tab title='调色 / 滤镜' key='adjust' />
          </Tabs>
        </div>
      </div>
    );
  }

  // --- 正常详情模式 UI ---
  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', paddingBottom: 50 }}>
      <NavBar onBack={() => navigate(-1)}>图片详情</NavBar>
      
      <div style={{ background: '#000', minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Image src={imgUrl} fit='contain' style={{ maxHeight: '60vh', maxWidth: '100%' }} />
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <Button block color='primary' fill='solid' onClick={() => setIsEditing(true)}>
            <EditSOutline /> 编辑美化
          </Button>
          <Button block color='danger' fill='outline' onClick={handleDelete}>
            <DeleteOutline /> 删除图片
          </Button>
        </div>

        <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <List header='图片信息 (EXIF)'>
            <List.Item prefix={<ClockCircleOutline />} extra={data.capture_time ? dayjs(data.capture_time).format('YYYY-MM-DD HH:mm') : '未知'}>
              拍摄时间
            </List.Item>
            <List.Item prefix={<EnvironmentOutline />} extra={data.location || '无位置'}>
              拍摄地点
            </List.Item>
            <List.Item extra={data.resolution}>分辨率</List.Item>
          </List>
        </div>

        <div style={{ background: '#fff', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>分类标签</div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.tags.map((tag: any) => (
              <Tag key={tag.id} color='primary' fill='outline' round>
                {tag.name}
              </Tag>
            ))}
            {data.tags.length === 0 && <span style={{ color: '#ccc', fontSize: 12 }}>暂无标签</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input 
              placeholder='输入新标签' 
              style={{ background: '#f5f5f5', borderRadius: 4, padding: '4px 8px', flex: 1 }} 
              value={newTag} 
              onChange={setNewTag} 
            />
            <Button size='small' color='primary' onClick={handleAddTag}>添加</Button>
          </div>
        </div>
      </div>
    </div>
  );
}