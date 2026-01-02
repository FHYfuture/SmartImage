import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Auth from './pages/Auth';
import AppLayout from './components/AppLayout';
import Home from './pages/Home';
import AI from './pages/AI';
import Profile from './pages/Profile';
import Detail from './pages/Detail';

function PrivateRoute({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Auth />} />
        <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/ai" element={<AI />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="/detail/:id" element={<PrivateRoute><Detail /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}