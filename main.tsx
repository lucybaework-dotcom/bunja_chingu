import { createRoot } from 'react-dom/client';
import { LocalBackend } from './backend';
import App from './App';
import AuthGate from './Auth';
import './styles.css';

// 실제 서비스: 로그인 + Supabase 서버. 시연: 이 기기 안의 가상 사용자 (Claude 미리보기 빌드 또는 주소 뒤 #demo).
const demo = import.meta.env.MODE === 'demo' || location.hash === '#demo';
const root = createRoot(document.getElementById('root')!);
root.render(demo ? <App backend={new LocalBackend()} /> : <AuthGate />);
