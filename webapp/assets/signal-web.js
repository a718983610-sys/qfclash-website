// QFClash 网页版 Signal 协议核心（正式版，由 proto/qf-signal-web.js 移植）
// 与原型逐参数一致（X3DH / HKDFv3 / 双棘轮 / AES-256-CBC+HMAC / Signal 线格式 /
// App 中继打包 base64([type‖serialized])），差异仅在运行环境：
//   - AES/HMAC/SHA-512 经 WebCrypto（异步），故加密/解密 API 为 async；
//   - 曲线运算用 @noble/curves（经 importmap 解析到 ../vendor）；
//   - 会话状态可序列化为 JSON（仅内存保存，见 crypto-adapter 的存储口径）。
// 互通验证：原型已过 Dart 本体门禁（27 项）与 libsignal 参考实现互通（26 项）；
// 本文件在 Node 下以 WebCrypto 同实现复跑等价场景（见 webapp 测试记录）。
import { x25519, ed25519 } from '@noble/curves/ed25519.js';

const subtle = globalThis.crypto.subtle;
const u8 = (a) => (a instanceof Uint8Array ? a : new Uint8Array(a));
export const b64 = (b) => btoa(String.fromCharCode(...u8(b)));
export const unb64 = (s) => Uint8Array.from(atob(String(s)), (c) => c.charCodeAt(0));
const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0; for (const a of arrs) { out.set(u8(a), o); o += a.length; }
  return out;
};
const hex = (b) => [...u8(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function sha512(b) { return new Uint8Array(await subtle.digest('SHA-512', u8(b))); }
async function hmac(key, data) {
  const k = await subtle.importKey('raw', u8(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', k, u8(data)));
}
const utf8 = (s) => new TextEncoder().encode(s);
const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ---------- HKDFv3（与原型一致：salt 缺省 32 字节 0，expand 计数从 1） ----------
async function hkdf(ikm, salt, info, outLen) {
  const prk = await hmac(salt ?? new Uint8Array(32), ikm);
  const out = new Uint8Array(outLen);
  let mix = new Uint8Array(0); let pos = 0; let i = 1;
  while (pos < outLen) {
    mix = await hmac(prk, concat(mix, info, new Uint8Array([i])));
    const n = Math.min(32, outLen - pos);
    out.set(mix.subarray(0, n), pos); pos += n; i += 1;
  }
  return out;
}

// ---------- X25519 ----------
export function genKeyPair() {
  const priv = new Uint8Array(randomBytes(32));
  priv[0] &= 248; priv[31] &= 127; priv[31] |= 64;
  return { priv, pub: x25519.getPublicKey(priv) };
}
const dh = (priv, pub) => x25519.getSharedSecret(priv, pub);
export const typed = (rawPub) => concat(new Uint8Array([5]), rawPub);
export const rawOf = (typedPub) => (typedPub.length === 33 ? typedPub.subarray(1) : typedPub);

// ---------- XEdDSA（与原型逐行一致，SHA-512 改走 WebCrypto 故改 async） ----------
const Fp = ed25519.CURVE.Fp;
const L = ed25519.CURVE.n;
const modL = (x) => ((x % L) + L) % L;
function bytesToBigIntLE(b) { let x = 0n; for (let i = b.length - 1; i >= 0; i--) x = (x << 8n) | BigInt(b[i]); return x; }
function bigIntToBytesLE(x, len) { const out = new Uint8Array(len); let v = x; for (let i = 0; i < len; i++) { out[i] = Number(v & 0xffn); v >>= 8n; } return out; }
function montPubToEdPoint(uBytes) {
  const u = Fp.create(bytesToBigIntLE(uBytes) % Fp.ORDER);
  const y = Fp.div(Fp.sub(u, 1n), Fp.add(u, 1n));
  const y2 = Fp.sqr(y);
  const x2 = Fp.div(Fp.sub(y2, 1n), Fp.add(Fp.mul(ed25519.CURVE.d, y2), 1n));
  let x = Fp.sqrt(x2);
  if ((x & 1n) === 1n) x = Fp.neg(x);
  return ed25519.Point.fromAffine({ x, y });
}
function deriveEdwards(priv32) {
  const a = modL(bytesToBigIntLE(priv32));
  const A = ed25519.Point.BASE.multiply(a);
  return { a, A };
}
const XEDDSA_DIVERSIFIER = new Uint8Array([0xfe, ...new Array(31).fill(0xff)]);
export async function xeddsaSign(priv32, msg, rand64 = randomBytes(64)) {
  const { a, A } = deriveEdwards(priv32);
  const Aenc = A.toRawBytes();
  const r = modL(bytesToBigIntLE(await sha512(concat(XEDDSA_DIVERSIFIER, priv32, msg, rand64))));
  const R = ed25519.Point.BASE.multiply(r);
  const Renc = R.toRawBytes();
  const h = modL(bytesToBigIntLE(await sha512(concat(Renc, Aenc, msg))));
  const s = modL(h * a + r);
  const sig = concat(Renc, bigIntToBytesLE(s, 32));
  sig[63] |= Aenc[31] & 0x80;
  return sig;
}
export async function xeddsaVerify(pubRaw32, msg, sig) {
  try {
    if (sig.length !== 64) return false;
    const signBit = sig[63] & 0x80;
    const sBytes = new Uint8Array(sig.subarray(32, 64));
    sBytes[31] &= 0x7f;
    const s = bytesToBigIntLE(sBytes);
    if (s >= L) return false;
    let A = montPubToEdPoint(pubRaw32);
    if ((A.toRawBytes()[31] & 0x80) !== signBit) A = A.negate();
    const Renc = sig.subarray(0, 32);
    const R = ed25519.Point.fromHex(hex(Renc));
    const h = modL(bytesToBigIntLE(await sha512(concat(Renc, A.toRawBytes(), msg))));
    const left = ed25519.Point.BASE.multiply(s);
    const right = R.add(A.multiply(h));
    return left.equals(right);
  } catch { return false; }
}

// ---------- protobuf（最小实现，与原型一致） ----------
function varint(n) { const out = []; let v = n >>> 0; do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b); } while (v); return new Uint8Array(out); }
function fieldBytes(num, data) { return concat(varint((num << 3) | 2), varint(data.length), data); }
function fieldVarint(num, v) { return concat(varint((num << 3) | 0), varint(v)); }
export function parseProto(buf) {
  const fields = new Map(); let i = 0;
  const readVarint = () => { let shift = 0; let result = 0; while (true) { const b = buf[i++]; result |= (b & 0x7f) << shift; shift += 7; if (!(b & 0x80)) break; } return result >>> 0; };
  while (i < buf.length) {
    const tag = readVarint(); const num = tag >> 3; const wire = tag & 7;
    if (wire === 0) fields.set(num, readVarint());
    else if (wire === 2) { const len = readVarint(); fields.set(num, buf.subarray(i, i + len)); i += len; }
    else if (wire === 5) { fields.set(num, buf.subarray(i, i + 4)); i += 4; }
    else if (wire === 1) { fields.set(num, buf.subarray(i, i + 8)); i += 8; }
    else throw new Error('unsupported wire type ' + wire);
  }
  return fields;
}
export { fieldBytes, fieldVarint, concat };

// ---------- 消息密钥 / 链 ----------
async function messageKeys(chainKey) {
  const base = await hmac(chainKey, new Uint8Array([0x01]));
  const km = await hkdf(base, new Uint8Array(32), utf8('WhisperMessageKeys'), 80);
  return { cipherKey: km.subarray(0, 32), macKey: km.subarray(32, 64), iv: km.subarray(64, 80) };
}
const nextChainKey = (ck) => hmac(ck, new Uint8Array([0x02]));
async function rkStep(rootKey, dhOut) {
  const derived = await hkdf(dhOut, rootKey, utf8('WhisperRatchet'), 64);
  return { rootKey: derived.subarray(0, 32), chainKey: derived.subarray(32, 64) };
}
async function aesCbcEncrypt(key, iv, plain) {
  const k = await subtle.importKey('raw', u8(key), { name: 'AES-CBC' }, false, ['encrypt']);
  return new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv: u8(iv) }, k, u8(plain)));
}
async function aesCbcDecrypt(key, iv, cipher) {
  const k = await subtle.importKey('raw', u8(key), { name: 'AES-CBC' }, false, ['decrypt']);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv: u8(iv) }, k, u8(cipher)));
}
async function macFor(senderIdTyped, receiverIdTyped, macKey, versionAndBody) {
  return (await hmac(macKey, concat(senderIdTyped, receiverIdTyped, versionAndBody))).subarray(0, 8);
}

// ---------- 身份 ----------
export class SpecIdentity {
  constructor(keyPair) { this.pair = keyPair ?? genKeyPair(); }
  get pubRaw() { return this.pair.pub; }
  get pubTyped() { return typed(this.pair.pub); }
  async sign(data) { return xeddsaSign(this.pair.priv, data); }
  async bundleJson({ signedPreKey, oneTimePreKeys }) {
    return {
      identityKeyEd25519: b64(this.pubRaw),
      identityKeyX25519: b64(this.pubRaw),
      signedPrekey: { keyId: signedPreKey.id, pubkey: b64(signedPreKey.pair.pub), signature: b64(await this.sign(typed(signedPreKey.pair.pub))) },
      oneTimePrekeys: oneTimePreKeys.map((k) => ({ keyId: k.id, pubkey: b64(k.pair.pub) })),
    };
  }
}
export function makeSignedPreKey(id) { return { id, pair: genKeyPair() }; }
export function makeOneTimePreKey(id) { return { id, pair: genKeyPair() }; }

// ---------- 会话（状态可 JSON 序列化，仅内存保存） ----------
const MAX_SKIP = 2000;
const pairToJson = (p) => ({ priv: b64(p.priv), pub: b64(p.pub) });
const pairFromJson = (j) => ({ priv: unb64(j.priv), pub: unb64(j.pub) });
const keysToJson = (k) => ({ cipherKey: b64(k.cipherKey), macKey: b64(k.macKey), iv: b64(k.iv) });
const keysFromJson = (j) => ({ cipherKey: unb64(j.cipherKey), macKey: unb64(j.macKey), iv: unb64(j.iv) });

export class SpecSession {
  constructor(localIdentity, remoteUserId, registrationId = 1337) {
    this.me = localIdentity; this.peer = remoteUserId; this.registrationId = registrationId;
    this.rootKey = null;
    this.sender = null;
    this.receivers = new Map();
    this.remoteIdentity = null;
    this.pendingPreKey = null;
    this.senderMustRotate = false;
    this.lastReceiverRatchet = null;
  }
  toJson() {
    return {
      peer: this.peer, registrationId: this.registrationId,
      rootKey: this.rootKey ? b64(this.rootKey) : null,
      sender: this.sender ? { pair: pairToJson(this.sender.pair), chainKey: b64(this.sender.chainKey), index: this.sender.index, previousCounter: this.sender.previousCounter } : null,
      receivers: [...this.receivers.entries()].map(([k, v]) => [k, { chainKey: b64(v.chainKey), index: v.index, skipped: [...v.skipped.entries()].map(([i, keys]) => [i, keysToJson(keys)]) }]),
      remoteIdentity: this.remoteIdentity ? b64(this.remoteIdentity) : null,
      pendingPreKey: this.pendingPreKey ? { basePair: pairToJson(this.pendingPreKey.basePair), preKeyId: this.pendingPreKey.preKeyId, signedPreKeyId: this.pendingPreKey.signedPreKeyId } : null,
      senderMustRotate: this.senderMustRotate,
      lastReceiverRatchet: this.lastReceiverRatchet ? b64(this.lastReceiverRatchet) : null,
    };
  }
  static fromJson(me, j) {
    const s = new SpecSession(me, j.peer, j.registrationId);
    s.rootKey = j.rootKey ? unb64(j.rootKey) : null;
    s.sender = j.sender ? { pair: pairFromJson(j.sender.pair), chainKey: unb64(j.sender.chainKey), index: j.sender.index, previousCounter: j.sender.previousCounter } : null;
    s.receivers = new Map((j.receivers || []).map(([k, v]) => [k, { chainKey: unb64(v.chainKey), index: v.index, skipped: new Map((v.skipped || []).map(([i, keys]) => [i, keysFromJson(keys)])) }]));
    s.remoteIdentity = j.remoteIdentity ? unb64(j.remoteIdentity) : null;
    s.pendingPreKey = j.pendingPreKey ? { basePair: pairFromJson(j.pendingPreKey.basePair), preKeyId: j.pendingPreKey.preKeyId, signedPreKeyId: j.pendingPreKey.signedPreKeyId } : null;
    s.senderMustRotate = !!j.senderMustRotate;
    s.lastReceiverRatchet = j.lastReceiverRatchet ? unb64(j.lastReceiverRatchet) : null;
    return s;
  }
  async processBundle(bundle) {
    const remoteIdRaw = unb64(bundle.identityKeyX25519);
    const spkRaw = unb64(bundle.signedPrekey.pubkey);
    const sig = unb64(bundle.signedPrekey.signature);
    if (!(await xeddsaVerify(remoteIdRaw, typed(spkRaw), sig))) throw new Error('signed-prekey-signature-invalid');
    this.remoteIdentity = remoteIdRaw;
    const base = genKeyPair();
    const otpk = (bundle.oneTimePrekeys && bundle.oneTimePrekeys.length) ? bundle.oneTimePrekeys[0] : (bundle.oneTimePrekey || null);
    const secrets = [new Uint8Array(32).fill(0xff),
      dh(this.me.pair.priv, spkRaw),
      dh(base.priv, remoteIdRaw),
      dh(base.priv, spkRaw)];
    if (otpk) secrets.push(dh(base.priv, unb64(otpk.pubkey)));
    const derived = await hkdf(concat(...secrets), new Uint8Array(32), utf8('WhisperText'), 64);
    this.rootKey = derived.subarray(0, 32);
    this.receivers.set(hex(spkRaw), { chainKey: derived.subarray(32, 64), index: 0, skipped: new Map() });
    this.lastReceiverRatchet = spkRaw;
    const sending = genKeyPair();
    const step = await rkStep(this.rootKey, dh(sending.priv, spkRaw));
    this.rootKey = step.rootKey;
    this.sender = { pair: sending, chainKey: step.chainKey, index: 0, previousCounter: 0 };
    this.pendingPreKey = { basePair: base, preKeyId: otpk ? otpk.keyId : null, signedPreKeyId: bundle.signedPrekey.keyId };
  }
  async initAsBob(preKeyMsg, mySignedPreKey, myOneTimePreKey) {
    this.remoteIdentity = rawOf(preKeyMsg.identityKey);
    const baseRaw = rawOf(preKeyMsg.baseKey);
    const secrets = [new Uint8Array(32).fill(0xff),
      dh(mySignedPreKey.pair.priv, this.remoteIdentity),
      dh(this.me.pair.priv, baseRaw),
      dh(mySignedPreKey.pair.priv, baseRaw)];
    if (preKeyMsg.preKeyId != null) {
      if (!myOneTimePreKey || myOneTimePreKey.id !== preKeyMsg.preKeyId) throw new Error('one-time-prekey-missing');
      secrets.push(dh(myOneTimePreKey.pair.priv, baseRaw));
    }
    const derived = await hkdf(concat(...secrets), new Uint8Array(32), utf8('WhisperText'), 64);
    this.rootKey = derived.subarray(0, 32);
    this.sender = { pair: mySignedPreKey.pair, chainKey: derived.subarray(32, 64), index: 0, previousCounter: 0 };
    this.lastReceiverRatchet = null;
  }
  async _rotateSender() {
    const fresh = genKeyPair();
    const step = await rkStep(this.rootKey, dh(fresh.priv, this.lastReceiverRatchet));
    this.rootKey = step.rootKey;
    this.sender = { pair: fresh, chainKey: step.chainKey, index: 0, previousCounter: this.sender ? Math.max(this.sender.index - 1, 0) : 0 };
    this.senderMustRotate = false;
  }
  async encrypt(text) {
    if (!this.sender) throw new Error('no-sender-chain');
    if (this.senderMustRotate) await this._rotateSender();
    const keys = await messageKeys(this.sender.chainKey);
    const cipher = await aesCbcEncrypt(keys.cipherKey, keys.iv, utf8(text));
    const proto = concat(
      fieldBytes(1, typed(this.sender.pair.pub)),
      fieldVarint(2, this.sender.index),
      fieldVarint(3, this.sender.previousCounter),
      fieldBytes(4, cipher));
    const versioned = concat(new Uint8Array([0x33]), proto);
    const mac = await macFor(this.me.pubTyped, typed(this.remoteIdentity), keys.macKey, versioned);
    const serialized = concat(versioned, mac);
    this.sender.chainKey = await nextChainKey(this.sender.chainKey);
    this.sender.index += 1;
    let packed;
    if (this.pendingPreKey) {
      const pk = this.pendingPreKey;
      const parts = [];
      if (pk.preKeyId != null) parts.push(fieldVarint(1, pk.preKeyId));
      parts.push(fieldBytes(2, typed(pk.basePair.pub)));
      parts.push(fieldBytes(3, this.me.pubTyped));
      parts.push(fieldBytes(4, serialized));
      parts.push(fieldVarint(5, this.registrationId));
      parts.push(fieldVarint(6, pk.signedPreKeyId));
      packed = concat(new Uint8Array([3, 0x33]), ...parts);
    } else {
      packed = concat(new Uint8Array([2]), serialized);
    }
    return b64(packed);
  }
  async decrypt(packedB64, bobKeys = null) {
    const packed = unb64(packedB64);
    const type = packed[0];
    const body = packed.subarray(1);
    if (type === 3) {
      const f = parseProto(body.subarray(1));
      const preKeyMsg = {
        preKeyId: f.has(1) ? f.get(1) : null,
        baseKey: f.get(2), identityKey: f.get(3),
        message: f.get(4), registrationId: f.get(5), signedPreKeyId: f.get(6),
      };
      if (!this.sender && bobKeys) await this.initAsBob(preKeyMsg, bobKeys.signedPreKey, bobKeys.oneTimePreKey ?? null);
      if (this.remoteIdentity && hex(rawOf(preKeyMsg.identityKey)) !== hex(this.remoteIdentity)) throw new Error('identity-mismatch');
      return this._decryptSignal(preKeyMsg.message);
    }
    if (type === 2) return this._decryptSignal(body);
    throw new Error('unknown-ciphertext-type-' + type);
  }
  async _decryptSignal(serialized) {
    if ((serialized[0] >> 4) !== 3) throw new Error('bad-version');
    const f = parseProto(serialized.subarray(1, serialized.length - 8));
    const ratchetRaw = rawOf(f.get(1));
    const counter = f.get(2); const cipher = f.get(4);
    const macGiven = serialized.subarray(serialized.length - 8);
    const keyHex = hex(ratchetRaw);
    let chain = this.receivers.get(keyHex);
    if (!chain) {
      if (!this.sender) throw new Error('no-session');
      const step = await rkStep(this.rootKey, dh(this.sender.pair.priv, ratchetRaw));
      this.rootKey = step.rootKey;
      chain = { chainKey: step.chainKey, index: 0, skipped: new Map() };
      this.receivers.set(keyHex, chain);
      this.lastReceiverRatchet = ratchetRaw;
      this.senderMustRotate = true;
    }
    let keys;
    if (counter < chain.index) {
      keys = chain.skipped.get(counter);
      if (!keys) throw new Error('duplicate-or-too-old-message');
      chain.skipped.delete(counter);
    } else {
      if (counter - chain.index > MAX_SKIP) throw new Error('too-many-skipped');
      let ck = chain.chainKey;
      while (chain.index < counter) { chain.skipped.set(chain.index, await messageKeys(ck)); ck = await nextChainKey(ck); chain.index += 1; }
      keys = await messageKeys(ck);
      chain.chainKey = await nextChainKey(ck);
      chain.index += 1;
    }
    const expect = await macFor(typed(this.remoteIdentity), this.me.pubTyped, keys.macKey, serialized.subarray(0, serialized.length - 8));
    if (hex(expect) !== hex(macGiven)) throw new Error('bad-mac');
    const text = new TextDecoder().decode(await aesCbcDecrypt(keys.cipherKey, keys.iv, cipher));
    this.pendingPreKey = null;
    return text;
  }
}
