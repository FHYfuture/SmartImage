
import { List,  Avatar } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const navigate = useNavigate();
  return (
    <div style={{ paddingTop: 50 }}>
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <Avatar src='' style={{ '--size': '80px', margin: '0 auto' }} />
        <h2>用户中心</h2>
      </div>
      <List>
        <List.Item onClick={() => { localStorage.removeItem('token'); navigate('/login'); }} style={{ color: 'red' }}>退出登录</List.Item>
      </List>
    </div>
  );
}