import axios from 'axios';
import { Toast } from 'antd-mobile';

// 【关键修改】
// 1. API 基础路径改为 '/api' (配合 vite 代理)
// 这样无论你是用 localhost 还是 192.168.x.x 访问，都会自动适配
export const baseURL = '/api';

// 2. 静态资源路径改为空字符串 (配合 vite 代理)
// 这样图片路径会变成 /static/xxx.jpg，浏览器会自动拼上前缀
export const STATIC_URL = ''; 

const request = axios.create({
  baseURL: baseURL,
  timeout: 5000,
});
// 请求拦截：自动带 Token
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：错误处理
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    } else {
      const msg = error.response?.data?.detail || '请求失败';
      Toast.show({ content: msg, icon: 'fail' });
    }
    return Promise.reject(error);
  }
);

export default request;