import { describe, expect, it } from 'vitest';
import { b64u, encryptPayload, vapidAuth } from './webpush';

const dec = new TextDecoder(), enc = new TextEncoder();
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };

/** 브라우저(받는 쪽)가 하는 복호화를 그대로 흉내 낸다 (RFC 8291) */
async function uaDecrypt(body: Uint8Array, uaPair: CryptoKeyPair, auth: Uint8Array) {
  const salt = body.slice(0, 16); const idlen = body[20]; const asPublic = body.slice(21, 21 + idlen); const ct = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaPair.publicKey));
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPair.privateKey, 256));
  const prkKey = await hmac(auth, ecdh);
  const ikm = await hmac(prkKey, cat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
  expect(plain[plain.length - 1]).toBe(2); // 마지막 레코드 구분자
  return dec.decode(plain.slice(0, -1));
}

describe('웹 푸시 암호화', () => {
  it('받는 기기가 풀면 원래 내용이 나온다', async () => {
    const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const target = { endpoint: 'https://push.example.com/abc', keys: { p256dh: b64u.enc(await crypto.subtle.exportKey('raw', ua.publicKey)), auth: b64u.enc(auth) } };
    const msg = JSON.stringify({ title: '점심 실험실', body: '수소방울: 안녕하세요! 🙂' });
    const body = await encryptPayload(target, enc.encode(msg));
    expect(await uaDecrypt(body, ua, auth)).toBe(msg);
  });
  it('VAPID 서명이 공개키로 검증된다', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const pub = b64u.enc(await crypto.subtle.exportKey('raw', pair.publicKey));
    const h = await vapidAuth('https://fcm.googleapis.com/fcm/send/xyz', { publicKey: pub, privateJwk: jwk, subject: 'mailto:a@b.c' }, 1_800_000_000_000);
    const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
    expect(m[4]).toBe(pub);
    const claims = JSON.parse(dec.decode(b64u.dec(m[2])));
    expect(claims).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'mailto:a@b.c' });
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64u.dec(m[3]), enc.encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });
});
