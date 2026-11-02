// 새 버전이 배포됐으면 화면 위에 띠를 띄운다 (열 때, 다시 볼 때, 5분마다 확인)
import { useEffect, useState } from 'react';
import { applyUpdate, hasUpdate } from './pwa';

export default function UpdateBar() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') void hasUpdate().then((u) => u && setOn(true)); };
    check(); document.addEventListener('visibilitychange', check);
    const t = setInterval(check, 5 * 60_000);
    return () => { document.removeEventListener('visibilitychange', check); clearInterval(t); };
  }, []);
  if (!on) return null;
  return <button className="update-bar" onClick={() => void applyUpdate()}>새 버전이 나왔어요 · <strong>눌러서 업데이트</strong></button>;
}
