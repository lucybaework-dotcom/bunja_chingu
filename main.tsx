import { createRoot } from 'react-dom/client';
import { LocalBackend } from './backend';
import App from './App';
import './styles.css';

// 서버가 생기면 여기서 RemoteBackend로 바꾼다.
const backend = new LocalBackend();
createRoot(document.getElementById('root')!).render(<App backend={backend} />);
