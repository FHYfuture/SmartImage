import axios from 'axios';
import { Toast } from 'antd-mobile';

// 指向后端 API 地址
// 在 WSL2 运行时，浏览器访问 localhost:8000 通常能自动转发到 WSL
export const BASE_URL = 'http://localhost:8000/api';
export const STATIC_URL = 'http://localhost:8000';

const request = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
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