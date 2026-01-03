import axios from 'axios';
import { Toast } from 'antd-mobile';

// 动态获取 Base URL (兼容 Vite 代理)
export const baseURL = '/api'; 

// 【核心修复】将这里的 '/static' 改为 '' (空字符串)
// 原因：数据库里的路径已经包含 'static/' 前缀了 (如 'static/uploads/...')
// 如果这里再加 '/static'，就会拼成 '/static/static/...' 导致 404
export const STATIC_URL = ''; 

const service = axios.create({
  baseURL: baseURL,
  timeout: 120000, // 保持 120秒超时以等待 AI
});

// ... (拦截器代码保持不变) ...

// 请求拦截器
service.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// 响应拦截器
service.interceptors.response.use(
  response => {
    return response.data;
  },
  error => {
    if (error.response) {
      const msg = error.response.data.detail || '请求失败';
      // 忽略 401 报错 (避免页面刚加载时的干扰)
      if (error.response.status !== 401) {
          Toast.show({ content: msg, icon: 'fail' });
      }
    } else if (error.code === 'ECONNABORTED') {
      Toast.show({ content: '请求超时，请检查网络或稍后重试', icon: 'fail' });
    } else {
      Toast.show({ content: '网络连接异常', icon: 'fail' });
    }
    return Promise.reject(error);
  }
);

export default service;