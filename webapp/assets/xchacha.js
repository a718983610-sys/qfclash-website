// XChaCha20-Poly1305（IETF 构造，与 App 端 qf_vault.dart 的
// qfXChaCha20Poly1305Encrypt/Decrypt 逐参数一致）：
//   subKey = HChaCha20(key, nonce[0..16])；ietfNonce = 0x00000000 ‖ nonce[16..24]；
//   ChaCha20-Poly1305 AEAD（counter 从 0 取 Poly 密钥、从 1 加密），输出 = 密文 ‖ tag(16)。
// 纯 JS 实现，校验向量：RFC 8439 §2.8.2 AEAD、草案 HChaCha20 向量（见测试记录）。
const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
function load32le(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
function store32le(out, o, v) { out[o] = v & 0xff; out[o + 1] = (v >>> 8) & 0xff; out[o + 2] = (v >>> 16) & 0xff; out[o + 3] = (v >>> 24) & 0xff; }
const CONSTANTS = new TextEncoder().encode('expand 32-byte k');

function chachaBlock(key, counter, nonce12, rounds = 20) {
  const st = new Uint32Array(16);
  for (let i = 0; i < 4; i++) st[i] = load32le(CONSTANTS, i * 4);
  for (let i = 0; i < 8; i++) st[4 + i] = load32le(key, i * 4);
  st[12] = counter >>> 0;
  for (let i = 0; i < 3; i++) st[13 + i] = load32le(nonce12, i * 4);
  const w = new Uint32Array(st);
  function qr(a, b, c, d) {
    w[a] = (w[a] + w[b]) >>> 0; w[d] = rotl(w[d] ^ w[a], 16);
    w[c] = (w[c] + w[d]) >>> 0; w[b] = rotl(w[b] ^ w[c], 12);
    w[a] = (w[a] + w[b]) >>> 0; w[d] = rotl(w[d] ^ w[a], 8);
    w[c] = (w[c] + w[d]) >>> 0; w[b] = rotl(w[b] ^ w[c], 7);
  }
  for (let r = 0; r < rounds / 2; r++) {
    qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15);
    qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14);
  }
  const out = new Uint8Array(64);
  for (let i = 0; i < 16; i++) store32le(out, i * 4, (w[i] + st[i]) >>> 0);
  return out;
}
function chachaStream(key, counter, nonce12, data) {
  const out = new Uint8Array(data.length);
  let ctr = counter >>> 0;
  for (let off = 0; off < data.length; off += 64) {
    const block = chachaBlock(key, ctr++, nonce12);
    const n = Math.min(64, data.length - off);
    for (let i = 0; i < n; i++) out[off + i] = data[off + i] ^ block[i];
  }
  return out;
}
export function hchacha20(key, nonce16) {
  const st = new Uint32Array(16);
  for (let i = 0; i < 4; i++) st[i] = load32le(CONSTANTS, i * 4);
  for (let i = 0; i < 8; i++) st[4 + i] = load32le(key, i * 4);
  for (let i = 0; i < 4; i++) st[12 + i] = load32le(nonce16, i * 4);
  const w = new Uint32Array(st);
  function qr(a, b, c, d) {
    w[a] = (w[a] + w[b]) >>> 0; w[d] = rotl(w[d] ^ w[a], 16);
    w[c] = (w[c] + w[d]) >>> 0; w[b] = rotl(w[b] ^ w[c], 12);
    w[a] = (w[a] + w[b]) >>> 0; w[d] = rotl(w[d] ^ w[a], 8);
    w[c] = (w[c] + w[d]) >>> 0; w[b] = rotl(w[b] ^ w[c], 7);
  }
  for (let r = 0; r < 10; r++) {
    qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15);
    qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14);
  }
  const out = new Uint8Array(32);
  [0, 1, 2, 3, 12, 13, 14, 15].forEach((src, i) => store32le(out, i * 4, w[src]));
  return out;
}
// Poly1305（BigInt 实现，RFC 8439 §2.5）
const P = (1n << 130n) - 5n;
function poly1305(key32, msg) {
  const rBytes = key32.subarray(0, 16);
  let r = 0n;
  for (let i = 15; i >= 0; i--) r = (r << 8n) | BigInt(rBytes[i]);
  r &= 0x0ffffffc0ffffffc0ffffffc0fffffffn;
  let s = 0n;
  for (let i = 15; i >= 0; i--) s = (s << 8n) | BigInt(key32[16 + i]);
  let acc = 0n;
  for (let off = 0; off < msg.length; off += 16) {
    const n = Math.min(16, msg.length - off);
    let v = 0n;
    for (let i = n - 1; i >= 0; i--) v = (v << 8n) | BigInt(msg[off + i]);
    v += 1n << BigInt(8 * n);
    acc = ((acc + v) * r) % P;
  }
  acc = (acc + s) % (1n << 128n);
  const out = new Uint8Array(16);
  let x = acc;
  for (let i = 0; i < 16; i++) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}
function aeadTag(polyKey, ciphertext) {
  // AAD 为空：mac_data = pad16(aad)=∅ ‖ ciphertext ‖ pad ‖ le64(0) ‖ le64(ctLen)
  const pad = (16 - (ciphertext.length % 16)) % 16;
  const data = new Uint8Array(ciphertext.length + pad + 16);
  data.set(ciphertext, 0);
  const dv = new DataView(data.buffer);
  dv.setBigUint64(data.length - 16, 0n, true);
  dv.setBigUint64(data.length - 8, BigInt(ciphertext.length), true);
  return poly1305(polyKey, data);
}
export function ietfChaChaPolyEncrypt(key, nonce12, plain) {
  const polyKey = chachaBlock(key, 0, nonce12).subarray(0, 32);
  const cipher = chachaStream(key, 1, nonce12, plain);
  const tag = aeadTag(polyKey, cipher);
  const out = new Uint8Array(cipher.length + 16);
  out.set(cipher, 0); out.set(tag, cipher.length);
  return out;
}
export function ietfChaChaPolyDecrypt(key, nonce12, sealed) {
  const cipher = sealed.subarray(0, sealed.length - 16);
  const tag = sealed.subarray(sealed.length - 16);
  const polyKey = chachaBlock(key, 0, nonce12).subarray(0, 32);
  const expect = aeadTag(polyKey, cipher);
  let diff = 0; for (let i = 0; i < 16; i++) diff |= expect[i] ^ tag[i];
  if (diff !== 0) throw new Error('aead-tag-mismatch');
  return chachaStream(key, 1, nonce12, cipher);
}
export function xchachaEncrypt(key, nonce24, plain) {
  const sub = hchacha20(key, nonce24.subarray(0, 16));
  const nonce12 = new Uint8Array(12);
  nonce12.set(nonce24.subarray(16, 24), 4);
  return ietfChaChaPolyEncrypt(sub, nonce12, plain);
}
export function xchachaDecrypt(key, nonce24, sealed) {
  const sub = hchacha20(key, nonce24.subarray(0, 16));
  const nonce12 = new Uint8Array(12);
  nonce12.set(nonce24.subarray(16, 24), 4);
  return ietfChaChaPolyDecrypt(sub, nonce12, sealed);
}
