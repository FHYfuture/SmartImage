import axios from 'axios';
import { Toast } from 'antd-mobile';

// 动态获取 Base URL (兼容 Vite 代理)
export const baseURL = '/api'; 

// 保持之前的修复：置空 STATIC_URL，避免路径重复拼接
export const STATIC_URL = ''; 

const service = axios.create({
  baseURL: baseURL,
  // 保持 120秒超时，等待 AI 分析
  timeout: 120000, 
});

// 请求拦截器
service.interceptors.request.use(
  config => {
    // 每次发送请求前，从本地取出 token 带在头上
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
      // --- 核心修改：处理 401 过期 ---
      if (error.response.status === 401) {
        // 1. 清除失效的 token
        localStorage.removeItem('token');
        localStorage.removeItem('user'); // 如果您存了用户信息，也一起清掉
        
        // 2. 避免重复弹窗 (比如首页并发了10个请求，不要弹10次窗)
        // 这里简单处理，直接跳转
        
        // 3. 强制跳转到登录页
        // 注意：这里不在 React 组件内，不能用 useNavigate，直接用原生跳转
        // 为了体验更好，只有当当前不在登录页时才跳转
        if (!window.location.pathname.includes('/login')) {
            Toast.show({ content: '登录已过期，请重新登录', icon: 'fail' });
            setTimeout(() => {
                window.location.href = '/login';
            }, 1000);
        }
        
        return Promise.reject(error);
      }

      // 处理其他错误
      const msg = error.response.data.detail || '请求失败';
      Toast.show({ content: msg, icon: 'fail' });
      
    } else if (error.code === 'ECONNABORTED') {
      Toast.show({ content: '请求超时，请检查网络或稍后重试', icon: 'fail' });
    } else {
      console.error(error);
      Toast.show({ content: '网络连接异常', icon: 'fail' });
    }
    return Promise.reject(error);
  }
);

export default service;