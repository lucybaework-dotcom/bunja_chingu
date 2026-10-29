// Web Push 보내기 (RFC 8291 aes128gcm 암호화 + RFC 8292 VAPID 서명). WebCrypto만 써서 Deno·Node 둘 다 돌아간다.
export interface PushTarget { endpoint: string; keys: { p256dh: string; auth: string } }
export interface VapidKeys { publicKey: string; privateJwk: JsonWebKey; subject: string }

const enc = new TextEncoder();
export const b64u = {
  enc(buf: ArrayBuffer | Uint8Array): string {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = ''; for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(s: string): Uint8Array {
    const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(p); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};
const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** 받는 쪽 키로 내용을 암호화해 aes128gcm 본문을 만든다 */
export async function encryptPayload(target: PushTarget, payload: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array> {
  const uaPublic = b64u.dec(target.keys.p256dh);
  const authSecret = b64u.dec(target.keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, cat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/** VAPID JWT (ES256) */
export async function vapidAuth(endpoint: string, v: VapidKeys, now = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.enc(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: v.subject })));
  const key = await crypto.subtle.importKey('jwk', { ...v.privateJwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64u.enc(sig)}, k=${v.publicKey}`;
}

/** 실제로 보낸다. 돌려주는 값은 HTTP 상태 (404·410이면 구독이 사라진 것) */
export async function sendWebPush(target: PushTarget, data: unknown, v: VapidKeys, fetcher: typeof fetch = fetch): Promise<number> {
  const body = await encryptPayload(target, enc.encode(JSON.stringify(data)));
  const res = await fetcher(target.endpoint, {
    method: 'POST',
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal', Authorization: await vapidAuth(target.endpoint, v) },
    body,
  });
  return res.status;
}
