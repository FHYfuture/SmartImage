import  { useState } from 'react';
import { Form, Input, Button, Card, Toast, AutoCenter } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import request from '../utils/request';

export default function Auth() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);

  const onFinish = async (values: any) => {
    try {
      if (isLogin) {
        // 登录
        const formData = new FormData();
        formData.append('username', values.username);
        formData.append('password', values.password);
        const res: any = await request.post('/auth/login', formData);
        localStorage.setItem('token', res.access_token);
        Toast.show('登录成功');
        navigate('/home');
      } else {
        // 注册
        await request.post('/auth/register', values);
        Toast.show('注册成功，请登录');
        setIsLogin(true);
      }
    } catch (e) { /* 拦截器已处理 */ }
  };

  return (
    <div style={{ padding: 20, paddingTop: 80 }}>
      <AutoCenter><h1>Smart Gallery</h1></AutoCenter>
      <Card title={isLogin ? '用户登录' : '新用户注册'}>
        <Form layout='horizontal' onFinish={onFinish} footer={
          <Button block type='submit' color='primary' size='large'>
            {isLogin ? '登录' : '注册'}
          </Button>
        }>
          <Form.Item name='username' label='用户名' rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          {!isLogin && (
            <Form.Item name='email' label='邮箱' rules={[{ required: true, type: 'email' }]}>
              <Input />
            </Form.Item>
          )}
          <Form.Item name='password' label='密码' rules={[{ required: true, min: 6 }]}>
            <Input type='password' />
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 15, color: '#1677ff' }} onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? '没有账号？去注册' : '已有账号？去登录'}
        </div>
      </Card>
    </div>
  );
}