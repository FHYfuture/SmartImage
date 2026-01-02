import React from 'react';
import { TabBar } from 'antd-mobile';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { AppOutline, UserOutline, MessageOutline } from 'antd-mobile-icons';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { key: '/home', title: '图库', icon: <AppOutline /> },
    { key: '/ai', title: 'AI助手', icon: <MessageOutline /> },
    { key: '/profile', title: '我的', icon: <UserOutline /> },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', background: '#f7f8fa' }}>
      <div className="responsive-container" style={{ display: 'flex', flexDirection: 'column' }}>
        
        {/* 内容区域 */}
        <div style={{ flex: 1 }}>
          <Outlet />
        </div>
        
        {/* 底部导航 - 毛玻璃效果 */}
        <div className="glass-nav" style={{ 
          position: 'sticky', 
          bottom: 0, 
          zIndex: 100, 
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}>
          <TabBar 
            activeKey={location.pathname} 
            onChange={val => navigate(val)}
            safeArea
            // === 修复点：添加 as React.CSSProperties ===
            style={{ '--item-active-color': '#1677ff' } as React.CSSProperties}
          >
            {tabs.map(item => (
              <TabBar.Item key={item.key} icon={item.icon} title={item.title} />
            ))}
          </TabBar>
        </div>

      </div>
    </div>
  );
}