// 홈 화면 앱(PWA) 파일을 빌드 때 만들어 낸다: manifest, 아이콘, 서비스 워커. 폴더를 따로 올리지 않아도 되게.
import type { Plugin } from 'vite';
import { ICONS } from './pwa-icons';

const MANIFEST = {
  name: '분자친구', short_name: '분자친구', description: '나를 닮은 원소로, 실제 분자만큼 모여 친구가 돼요.',
  lang: 'ko', start_url: './', scope: './', display: 'standalone', orientation: 'portrait',
  background_color: '#eef2f4', theme_color: '#0f6e78',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

const SW = `// 분자친구 서비스 워커: 화면 파일을 저장해 두고(새 버전은 네트워크 우선), 알림을 띄운다.
const CACHE = 'bunja-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // 서버(Supabase) 요청은 건드리지 않는다
  // 저장해 둔 화면을 바로 보여 주고, 새 버전은 뒤에서 받아 다음에 열 때 쓴다 (느린 데이터에서도 바로 열리게)
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const nav = e.request.mode === 'navigate';
    const hit = (await c.match(e.request, { ignoreSearch: true })) || (nav ? await c.match('./index.html') : undefined);
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(nav ? './index.html' : e.request, r.clone()).catch(() => {}); return r; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net.catch(() => c.match('./index.html'));
  }));
});
self.addEventListener('push', (e) => {
  let d = { title: '분자친구', body: '새 소식이 있어요.', url: './', tag: 'bunja' };
  try { d = Object.assign(d, e.data ? e.data.json() : {}); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: './icon-192.png', badge: './icon-192.png', tag: d.tag, renotify: true, data: { url: d.url } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope)) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
`;

export function pwaPlugin(): Plugin {
  let demo = false;
  return {
    name: 'bunja-pwa',
    configResolved(c) { demo = c.mode === 'demo'; },
    transformIndexHtml(html) {
      if (demo) return html; // 시연판(Claude 미리보기)에는 넣지 않는다
      return html.replace('</head>', [
        '<link rel="manifest" href="./manifest.webmanifest" />',
        '<meta name="theme-color" content="#0f6e78" />',
        '<link rel="apple-touch-icon" href="./apple-touch-icon.png" />',
        '<meta name="apple-mobile-web-app-capable" content="yes" />',
        '<meta name="mobile-web-app-capable" content="yes" />',
        '<meta name="apple-mobile-web-app-title" content="분자친구" />',
        '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
      ].join('\n') + '\n</head>');
    },
    generateBundle() {
      if (demo) return;
      for (const [fileName, b64] of Object.entries(ICONS)) this.emitFile({ type: 'asset', fileName, source: Buffer.from(b64, 'base64') });
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(MANIFEST, null, 2) });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: SW });
    },
  };
}
