// QFClash 网页版 Signal 协议核心（原型）
// 逐参数转写自 App 端 libsignal_protocol_dart 0.8.2 源码（pub-cache 实读）：
//   - X3DH: master = 0xFF*32 || DH1..DH3(||DH4)，SK = HKDFv3(salt=0*32, info="WhisperText", 64)
//   - KDF_RK: HKDF(ikm=DH, salt=RK, info="WhisperRatchet", 64) -> (新RK, 新CK)
//   - ChainKey: base = HMAC-SHA256(CK, seed)，seed 0x01=消息密钥材料 / 0x02=下一链钥；
//     消息密钥 = HKDF(ikm=base, salt=0*32, info="WhisperMessageKeys", 80) -> cipherKey32|macKey32|iv16
//   - 消息体: AES-256-CBC/PKCS7；SignalMessage 序列化 = 0x33 || protobuf{1:ratchetKey(33B),
//     2:counter, 3:previousCounter, 4:ciphertext} || MAC8，
//     MAC = HMAC-SHA256(macKey, 发送方身份公钥(33B) || 接收方身份公钥(33B) || 0x33||protobuf) 前 8 字节
//   - PreKeySignalMessage = 0x33 || protobuf{1:preKeyId?, 2:baseKey(33B), 3:identityKey(33B),
//     4:message, 5:registrationId, 6:signedPreKeyId}
//   - 中继打包（App QfSignalManager 口径）: base64( [type(2=signal/3=prekey) || serialized] )
// 曲线运算用 @noble/curves（成熟库）；AES/HMAC/SHA 经 Node crypto（浏览器端对应 WebCrypto，接口同形）。
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from 'node:crypto';
import { x25519, ed25519 } from '@noble/curves/ed25519.js';

const u8 = (a) => (a instanceof Uint8Array ? a : new Uint8Array(a));
export const b64 = (b) => Buffer.from(u8(b)).toString('base64');
export const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0; for (const a of arrs) { out.set(u8(a), o); o += a.length; }
  return out;
};
const hex = (b) => Buffer.from(u8(b)).toString('hex');
const sha512 = (b) => new Uint8Array(createHash('sha512').update(u8(b)).digest());
const hmac = (key, data) => new Uint8Array(createHmac('sha256', u8(key)).update(u8(data)).digest());

// ---------- HKDFv3（hkdf.dart 转写：salt 缺省 32 字节 0，expand 计数从 1） ----------
function hkdf(ikm, salt, info, outLen) {
  const prk = hmac(salt ?? new Uint8Array(32), ikm);
  const out = new Uint8Array(outLen);
  let mix = new Uint8Array(0); let pos = 0; let i = 1;
  while (pos < outLen) {
    mix = hmac(prk, concat(mix, info, new Uint8Array([i])));
    const n = Math.min(32, outLen - pos);
    out.set(mix.subarray(0, n), pos); pos += n; i += 1;
  }
  return out;
}
const utf8 = (s) => new TextEncoder().encode(s);

// ---------- X25519 ----------
export function genKeyPair() {
  // 与 libsignal 密钥生成同口径：私钥字节生成时即钳位。此后 DH 由 x25519 内部再钳位（结果一致），
  // 签名标量直接取私钥字节（Dart sign() 口径），钳位与否会改变签名公钥 A，故必须在生成时落钳位。
  const priv = new Uint8Array(randomBytes(32));
  priv[0] &= 248; priv[31] &= 127; priv[31] |= 64;
  return { priv, pub: x25519.getPublicKey(priv) };
}
const dh = (priv, pub) => x25519.getSharedSecret(priv, pub);
export const typed = (rawPub) => concat(new Uint8Array([5]), rawPub);
export const rawOf = (typedPub) => (typedPub.length === 33 ? typedPub.subarray(1) : typedPub);

// ---------- XEdDSA（签名预钥签名/验签；按 XEdDSA 规范实现，noble 提供点运算） ----------
const Fp = ed25519.CURVE.Fp;
const L = ed25519.CURVE.n;
const modL = (x) => ((x % L) + L) % L;
function bytesToBigIntLE(b) { let x = 0n; for (let i = b.length - 1; i >= 0; i--) x = (x << 8n) | BigInt(b[i]); return x; }
function bigIntToBytesLE(x, len) { const out = new Uint8Array(len); let v = x; for (let i = 0; i < len; i++) { out[i] = Number(v & 0xffn); v >>= 8n; } return out; }
// Montgomery u -> Edwards 点（x 符号位强制为 0：若转换结果 x 为奇则取负）
function montPubToEdPoint(uBytes) {
  const u = Fp.create(bytesToBigIntLE(uBytes) % Fp.ORDER);
  // y = (u-1)/(u+1)
  const y = Fp.div(Fp.sub(u, 1n), Fp.add(u, 1n));
  // x^2 = (y^2-1)/(d*y^2+1)
  const y2 = Fp.sqr(y);
  const x2 = Fp.div(Fp.sub(y2, 1n), Fp.add(Fp.mul(ed25519.CURVE.d, y2), 1n));
  let x = Fp.sqrt(x2);
  if ((x & 1n) === 1n) x = Fp.neg(x);
  return ed25519.Point.fromAffine({ x, y });
}
function deriveEdwards(priv32) {
  // 逐行对照 Dart 端 ed25519.dart 的 sign()：私钥 32 字节直接作 Edwards 标量（LE mod L），
  // 不做 SHA-512 展开、不另行钳位（libsignal 生成密钥时私钥已预钳位，本文件生成时同口径处理）。
  const a = modL(bytesToBigIntLE(priv32));
  const A = ed25519.Point.BASE.multiply(a);
  return { a, A };
}
// XEdDSA 签名（Dart 端 ed25519.dart sign() 转写）：
//   r = ScReduce(SHA512(0xFE‖0xFF×31 ‖ priv ‖ msg ‖ random64))，R = r·B
//   h = ScReduce(SHA512(R ‖ A ‖ msg))，s = h·a + r (mod L)
//   签名 = R‖s，并把 A 编码的 x 符号位藏进 s 最后一字节最高位：sig[63] |= A_enc[31] & 0x80
const XEDDSA_DIVERSIFIER = new Uint8Array([0xfe, ...new Array(31).fill(0xff)]);
export function xeddsaSign(priv32, msg, rand64 = new Uint8Array(randomBytes(64))) {
  const { a, A } = deriveEdwards(priv32);
  const Aenc = A.toRawBytes();
  const r = modL(bytesToBigIntLE(sha512(concat(XEDDSA_DIVERSIFIER, priv32, msg, rand64))));
  const R = ed25519.Point.BASE.multiply(r);
  const Renc = R.toRawBytes();
  const h = modL(bytesToBigIntLE(sha512(concat(Renc, Aenc, msg))));
  const s = modL(h * a + r);
  const sig = concat(Renc, bigIntToBytesLE(s, 32));
  sig[63] |= Aenc[31] & 0x80;
  return sig;
}
// XEdDSA 验签（Dart 端 ed25519.dart verifySig() 转写）：
//   A 的 y 由蒙哥马利公钥换算 (u-1)/(u+1)，x 符号位取自签名 sig[63] 最高位；
//   s 先清除该位，再按标准 Ed25519 方程校验 s·B == R + h·A。
export function xeddsaVerify(pubRaw32, msg, sig) {
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
    const R = ed25519.Point.fromHex(Buffer.from(Renc).toString('hex'));
    const h = modL(bytesToBigIntLE(sha512(concat(Renc, A.toRawBytes(), msg))));
    const left = ed25519.Point.BASE.multiply(s);
    const right = R.add(A.multiply(h));
    return left.equals(right);
  } catch { return false; }
}

// ---------- protobuf（最小实现：varint + LEN，字段集与 whisper_text_protocol.proto 一致） ----------
function varint(n) { const out = []; let v = n >>> 0; do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b); } while (v); return new Uint8Array(out); }
function fieldBytes(num, data) { return concat(varint((num << 3) | 2), varint(data.length), data); }
function fieldVarint(num, v) { return concat(varint((num << 3) | 0), varint(v)); }
function parseProto(buf) {
  const fields = new Map(); let i = 0;
  const readVarint = () => { let shift = 0; let result = 0; while (true) { const b = buf[i++]; result |= (b & 0x7f) << shift; shift += 7; if (!(b & 0x80)) break; } return result >>> 0; };
  while (i < buf.length) {
    const tag = readVarint(); const num = tag >> 3; const wire = tag & 7;
    if (wire === 0) fields.set(num, readVarint());
    else if (wire === 2) { const len = readVarint(); fields.set(num, buf.subarray(i, i + len)); i += len; }
    else throw new Error('unsupported wire type ' + wire);
  }
  return fields;
}

// ---------- 消息密钥 / 链 ----------
function messageKeys(chainKey) {
  const base = hmac(chainKey, new Uint8Array([0x01]));
  const km = hkdf(base, new Uint8Array(32), utf8('WhisperMessageKeys'), 80);
  return { cipherKey: km.subarray(0, 32), macKey: km.subarray(32, 64), iv: km.subarray(64, 80) };
}
const nextChainKey = (ck) => hmac(ck, new Uint8Array([0x02]));
function rkStep(rootKey, dhOut) {
  const derived = hkdf(dhOut, rootKey, utf8('WhisperRatchet'), 64);
  return { rootKey: derived.subarray(0, 32), chainKey: derived.subarray(32, 64) };
}
function aesCbcEncrypt(key, iv, plain) {
  const c = createCipheriv('aes-256-cbc', u8(key), u8(iv));
  return concat(new Uint8Array(c.update(u8(plain))), new Uint8Array(c.final()));
}
function aesCbcDecrypt(key, iv, cipher) {
  const d = createDecipheriv('aes-256-cbc', u8(key), u8(iv));
  return concat(new Uint8Array(d.update(u8(cipher))), new Uint8Array(d.final()));
}
function macFor(senderIdTyped, receiverIdTyped, macKey, versionAndBody) {
  return hmac(macKey, concat(senderIdTyped, receiverIdTyped, versionAndBody)).subarray(0, 8);
}

// ---------- 会话 ----------
const MAX_SKIP = 2000; // 与 Dart 端一致：counter 超出当前链 2000 以上直接拒绝
export class SpecIdentity {
  constructor(keyPair) { this.pair = keyPair ?? genKeyPair(); }
  get pubRaw() { return this.pair.pub; }
  get pubTyped() { return typed(this.pair.pub); }
  sign(data) { return xeddsaSign(this.pair.priv, data); }
  // 服务端公钥包 JSON（App _fullBundle 口径：Ed25519 字段镜像同一 X25519 公钥）
  bundleJson({ signedPreKey, oneTimePreKeys }) {
    return {
      identityKeyEd25519: b64(this.pubRaw),
      identityKeyX25519: b64(this.pubRaw),
      signedPrekey: { keyId: signedPreKey.id, pubkey: b64(signedPreKey.pair.pub), signature: b64(this.sign(typed(signedPreKey.pair.pub))) },
      oneTimePrekeys: oneTimePreKeys.map((k) => ({ keyId: k.id, pubkey: b64(k.pair.pub) })),
    };
  }
}
export function makeSignedPreKey(id) { return { id, pair: genKeyPair() }; }
export function makeOneTimePreKey(id) { return { id, pair: genKeyPair() }; }

export class SpecSession {
  constructor(localIdentity, remoteUserId, registrationId = 1337) {
    this.me = localIdentity; this.peer = remoteUserId; this.registrationId = registrationId;
    this.rootKey = null;
    this.sender = null;            // {pair, chainKey, index, previousCounter}
    this.receivers = new Map();    // ratchetPubHex -> {chainKey, index, skipped: Map<idx, keys>}
    this.remoteIdentity = null;    // raw32
    this.pendingPreKey = null;     // Alice 首发: {basePair, preKeyId|null, signedPreKeyId}
    this.senderMustRotate = false;
    this.lastReceiverRatchet = null;
  }
  // ---- Alice: 处理对方公钥包（服务端 JSON 形状） ----
  processBundle(bundle) {
    const remoteIdRaw = unb64(bundle.identityKeyX25519);
    const spkRaw = unb64(bundle.signedPrekey.pubkey);
    const sig = unb64(bundle.signedPrekey.signature);
    if (!xeddsaVerify(remoteIdRaw, typed(spkRaw), sig)) throw new Error('signed-prekey-signature-invalid');
    this.remoteIdentity = remoteIdRaw;
    const base = genKeyPair();
    const otpk = (bundle.oneTimePrekeys && bundle.oneTimePrekeys.length) ? bundle.oneTimePrekeys[0] : null;
    const secrets = [new Uint8Array(32).fill(0xff),
      dh(this.me.pair.priv, spkRaw),
      dh(base.priv, remoteIdRaw),
      dh(base.priv, spkRaw)];
    if (otpk) secrets.push(dh(base.priv, unb64(otpk.pubkey)));
    const derived = hkdf(concat(...secrets), new Uint8Array(32), utf8('WhisperText'), 64);
    this.rootKey = derived.subarray(0, 32);
    this.receivers.set(hex(spkRaw), { chainKey: derived.subarray(32, 64), index: 0, skipped: new Map() });
    this.lastReceiverRatchet = spkRaw;
    const sending = genKeyPair();
    const step = rkStep(this.rootKey, dh(sending.priv, spkRaw));
    this.rootKey = step.rootKey;
    this.sender = { pair: sending, chainKey: step.chainKey, index: 0, previousCounter: 0 };
    this.pendingPreKey = { basePair: base, preKeyId: otpk ? otpk.keyId : null, signedPreKeyId: bundle.signedPrekey.keyId };
  }
  // ---- Bob: 由入站 PreKey 消息初始化 ----
  initAsBob(preKeyMsg, mySignedPreKey, myOneTimePreKey) {
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
    const derived = hkdf(concat(...secrets), new Uint8Array(32), utf8('WhisperText'), 64);
    this.rootKey = derived.subarray(0, 32);
    this.sender = { pair: mySignedPreKey.pair, chainKey: derived.subarray(32, 64), index: 0, previousCounter: 0 };
    this.lastReceiverRatchet = null;
  }
  _rotateSender() {
    const fresh = genKeyPair();
    const step = rkStep(this.rootKey, dh(fresh.priv, this.lastReceiverRatchet));
    this.rootKey = step.rootKey;
    // previousCounter 口径与 Dart 端 _getOrCreateChainKey 一致：max(旧链已发数 - 1, 0)；
    // 该字段两端解密均不参与校验，仅作信息字段。
    this.sender = { pair: fresh, chainKey: step.chainKey, index: 0, previousCounter: this.sender ? Math.max(this.sender.index - 1, 0) : 0 };
    this.senderMustRotate = false;
  }
  // ---- 发送：返回 App 中继打包 base64([type||serialized]) ----
  encrypt(text) {
    if (!this.sender) throw new Error('no-sender-chain');
    if (this.senderMustRotate) this._rotateSender();
    const keys = messageKeys(this.sender.chainKey);
    const cipher = aesCbcEncrypt(keys.cipherKey, keys.iv, utf8(text));
    const proto = concat(
      fieldBytes(1, typed(this.sender.pair.pub)),
      fieldVarint(2, this.sender.index),
      fieldVarint(3, this.sender.previousCounter),
      fieldBytes(4, cipher));
    const versioned = concat(new Uint8Array([0x33]), proto);
    const mac = macFor(this.me.pubTyped, typed(this.remoteIdentity), keys.macKey, versioned);
    const serialized = concat(versioned, mac);
    this.sender.chainKey = nextChainKey(this.sender.chainKey);
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
      // 与 App 一致：未收到对方确认（成功解出对方任一消息）前，后续消息仍包 PreKey 形态，
      // pendingPreKey 在 _decryptSignal 成功后才清除。
    } else {
      packed = concat(new Uint8Array([2]), serialized);
    }
    return b64(packed);
  }
  // ---- 接收 ----
  decrypt(packedB64, bobKeys = null) {
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
      if (!this.sender && bobKeys) this.initAsBob(preKeyMsg, bobKeys.signedPreKey, bobKeys.oneTimePreKey ?? null);
      if (this.remoteIdentity && hex(rawOf(preKeyMsg.identityKey)) !== hex(this.remoteIdentity)) throw new Error('identity-mismatch');
      return this._decryptSignal(preKeyMsg.message);
    }
    if (type === 2) return this._decryptSignal(body);
    throw new Error('unknown-ciphertext-type-' + type);
  }
  _decryptSignal(serialized) {
    // 版本字节口径与 Dart 端一致：高 4 位为消息版本（须 ==3），低 4 位接收时忽略
    // （Dart 发出 0x33；较新 libsignal 参考实现发出 0x34，高位同为 3，App 照常接受）。
    // MAC 按收到的原始字节校验，不受此影响。
    if ((serialized[0] >> 4) !== 3) throw new Error('bad-version');
    const f = parseProto(serialized.subarray(1, serialized.length - 8));
    const ratchetRaw = rawOf(f.get(1));
    const counter = f.get(2); const cipher = f.get(4);
    const macGiven = serialized.subarray(serialized.length - 8);
    const keyHex = hex(ratchetRaw);
    let chain = this.receivers.get(keyHex);
    if (!chain) {
      if (!this.sender) throw new Error('no-session');
      const step = rkStep(this.rootKey, dh(this.sender.pair.priv, ratchetRaw));
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
      while (chain.index < counter) { chain.skipped.set(chain.index, messageKeys(ck)); ck = nextChainKey(ck); chain.index += 1; }
      keys = messageKeys(ck);
      chain.chainKey = nextChainKey(ck);
      chain.index += 1;
    }
    const expect = macFor(typed(this.remoteIdentity), this.me.pubTyped, keys.macKey, serialized.subarray(0, serialized.length - 8));
    if (!Buffer.from(expect).equals(Buffer.from(macGiven))) throw new Error('bad-mac');
    const text = new TextDecoder().decode(aesCbcDecrypt(keys.cipherKey, keys.iv, cipher));
    this.pendingPreKey = null; // 对方消息已成功解密 = 握手已被确认，停止 PreKey 包裹
    return text;
  }
}
