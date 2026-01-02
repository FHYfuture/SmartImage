import  { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Image, NavBar, Tag, List, Button, Dialog, Toast, Input } from 'antd-mobile';
import { DeleteOutline, EditSOutline, EnvironmentOutline, ClockCircleOutline } from 'antd-mobile-icons';
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

  const fetchDetail = async () => {
    try {
      const res: any = await request.get('/images/');
      const target = res.find((i: any) => i.id === Number(id));
      if (target) setData(target);
    } catch(e) {}
  };

  useEffect(() => { fetchDetail(); }, [id]);

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

  const handleSaveCrop = () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      cropper.getCroppedCanvas().toBlob(async (blob) => {
        if (!blob) return;
        const formData = new FormData();
        formData.append('file', blob, `edited_${data.filename}`);
        Toast.show({ icon: 'loading', content: '保存新图片...' });
        await request.post('/images/upload', formData);
        Toast.show('成功');
        setIsEditing(false);
        navigate('/home');
      });
    }
  };

  if (!data) return <div>加载中...</div>;
  const imgUrl = `${STATIC_URL}/${data.file_path}`;

  if (isEditing) {
    return (
      <div style={{ height: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>
          <Cropper src={imgUrl} style={{ height: "100%", width: "100%" }} initialAspectRatio={NaN} guides={true} ref={cropperRef} viewMode={1} />
        </div>
        <div style={{ padding: 20, display: 'flex', gap: 15, background: '#222' }}>
          <Button block onClick={() => setIsEditing(false)}>取消</Button>
          <Button block color='primary' onClick={handleSaveCrop}>保存副本</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', paddingBottom: 50 }}>
      <NavBar onBack={() => navigate(-1)}>详情</NavBar>
      <Image src={imgUrl} fit='contain' style={{ maxHeight: '50vh', background: '#000' }} />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <Button block onClick={() => setIsEditing(true)}><EditSOutline /> 编辑</Button>
          <Button block color='danger' fill='outline' onClick={handleDelete}><DeleteOutline /> 删除</Button>
        </div>
        <List header='图片信息 (EXIF)'>
          <List.Item prefix={<ClockCircleOutline />} extra={data.capture_time ? dayjs(data.capture_time).format('YYYY-MM-DD HH:mm') : '未知'}>拍摄时间</List.Item>
          <List.Item prefix={<EnvironmentOutline />} extra={data.location || '无位置'}>地点</List.Item>
          <List.Item extra={data.resolution}>分辨率</List.Item>
        </List>
        <List header='标签'>
          <div style={{ padding: '12px 16px', background: '#fff' }}>
            <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.tags.map((tag: any) => <Tag key={tag.id} color='primary' fill='outline'>{tag.name}</Tag>)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input placeholder='输入新标签' style={{ border: '1px solid #ddd', borderRadius: 4, padding: '4px 8px', flex: 1 }} value={newTag} onChange={setNewTag} />
              <Button size='small' color='primary' onClick={handleAddTag}>添加</Button>
            </div>
          </div>
        </List>
      </div>
    </div>
  );
}