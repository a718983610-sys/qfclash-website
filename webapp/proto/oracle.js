// 测试预言机：Signal 官方库 @signalapp/libsignal-client **0.57.1** 实现的对端。
//
// 为什么钉在这个版本（2026-10-23 实测）：
//   - 最新版 0.105.4 已彻底移除经典 X3DH：signalDecryptPreKey 对经典 PreKey 消息直接抛
//     "invalid PreKey message: X3DH no longer supported"，且 PreKeyBundle 构造强制要求 Kyber 预钥，
//     无法再充当经典协议（App 端 Dart 库所用协议）的互通预言机。
//   - 0.57.1 为 Signal 桌面端在产使用过的版本，经典 X3DH 发起/接收完整可用，本机 Node 24 可正常加载。
// 用途：独立验证 qf-signal-web.js（按 App 端 Dart 库参数转写的网页端原型）的线格式与会话语义。
import * as L from '@signalapp/libsignal-client';

export class Sessions extends L.SessionStore {
  constructor() { super(); this.m = new Map(); }
  async saveSession(name, record) { this.m.set(name.toString(), record.serialize()); }
  async getSession(name) { const b = this.m.get(name.toString()); return b ? L.SessionRecord.deserialize(b) : null; }
  async getExistingSessions(addrs) { const out = []; for (const a of addrs) { const s = await this.getSession(a); if (s) out.push(s); } return out; }
}
export class Idents extends L.IdentityKeyStore {
  constructor(pair, regId) { super(); this.pair = pair; this.regId = regId; this.trusted = new Map(); }
  async getIdentityKey() { return this.pair.privateKey; }
  async getLocalRegistrationId() { return this.regId; }
  async saveIdentity(name, key) { this.trusted.set(name.toString(), key.serialize()); return false; }
  async isTrustedIdentity() { return true; }
  async getIdentity(name) { const b = this.trusted.get(name.toString()); return b ? L.PublicKey.deserialize(b) : null; }
}
export class PreKeys extends L.PreKeyStore {
  constructor() { super(); this.m = new Map(); }
  async savePreKey(id, record) { this.m.set(id, record.serialize()); }
  async getPreKey(id) { const b = this.m.get(id); if (!b) throw new Error('no prekey ' + id); return L.PreKeyRecord.deserialize(b); }
  async removePreKey(id) { this.m.delete(id); }
}
export class SignedPreKeys extends L.SignedPreKeyStore {
  constructor() { super(); this.m = new Map(); }
  async saveSignedPreKey(id, record) { this.m.set(id, record.serialize()); }
  async getSignedPreKey(id) { const b = this.m.get(id); if (!b) throw new Error('no spk ' + id); return L.SignedPreKeyRecord.deserialize(b); }
}
export class KyberPreKeys extends L.KyberPreKeyStore {
  async saveKyberPreKey() { throw new Error('kyber-not-used-in-classic-test'); }
  async getKyberPreKey() { throw new Error('kyber-not-used-in-classic-test'); }
  async markKyberPreKeyUsed() {}
}

const b64 = (b) => Buffer.from(b).toString('base64');
const pubFromRaw = (raw32) => L.PublicKey.deserialize(new Uint8Array([0x05, ...raw32]));

export class OraclePeer {
  constructor(userId) {
    this.userId = userId;
    this.addr = L.ProtocolAddress.new(String(userId), 1);
    this.pair = L.IdentityKeyPair.generate();
    this.idents = new Idents(this.pair, 4242);
    this.sessions = new Sessions();
    this.pre = new PreKeys();
    this.signed = new SignedPreKeys();
    this.kyber = new KyberPreKeys();
    this.spkPriv = L.PrivateKey.generate();
    this.spkPub = this.spkPriv.getPublicKey();
    this.spkSig = this.pair.privateKey.sign(this.spkPub.serialize());
    this.opkPriv = L.PrivateKey.generate();
    this.OPK_ID = 5;
  }
  async install() {
    await this.signed.saveSignedPreKey(0, L.SignedPreKeyRecord.new(0, Date.now(), this.spkPub, this.spkPriv, this.spkSig));
    await this.pre.savePreKey(this.OPK_ID, L.PreKeyRecord.new(this.OPK_ID, this.opkPriv.getPublicKey(), this.opkPriv));
    return this;
  }
  // 与 App 服务端公钥包完全同形的 JSON（原始 32 字节公钥、Ed25519 字段镜像 X25519）
  bundleJson() {
    return {
      identityKeyEd25519: b64(this.pair.publicKey.getPublicKeyBytes()),
      identityKeyX25519: b64(this.pair.publicKey.getPublicKeyBytes()),
      signedPrekey: { keyId: 0, pubkey: b64(this.spkPub.getPublicKeyBytes()), signature: b64(this.spkSig) },
      oneTimePrekeys: [{ keyId: this.OPK_ID, pubkey: b64(this.opkPriv.getPublicKey().getPublicKeyBytes()) }],
    };
  }
  // 以参考实现身份处理 spec 端给出的公钥包（App 同形 JSON），建立经典会话（发起方方向）
  async processSpecBundle(bundle, toUserId) {
    const spk = bundle.signedPrekey;
    const otpk = (bundle.oneTimePrekeys && bundle.oneTimePrekeys[0]) || null;
    const native = L.PreKeyBundle.new(
      0, 1,
      otpk ? otpk.keyId : null, otpk ? pubFromRaw(new Uint8Array(Buffer.from(otpk.pubkey, 'base64'))) : null,
      spk.keyId, pubFromRaw(new Uint8Array(Buffer.from(spk.pubkey, 'base64'))), new Uint8Array(Buffer.from(spk.signature, 'base64')),
      pubFromRaw(new Uint8Array(Buffer.from(bundle.identityKeyX25519, 'base64'))),
      null, null, null,
    );
    const to = L.ProtocolAddress.new(String(toUserId), 1);
    await L.processPreKeyBundle(native, to, this.sessions, this.idents);
  }
  async decryptPacked(packedB64, fromUserId) {
    const bytes = new Uint8Array(Buffer.from(packedB64, 'base64'));
    const type = bytes[0]; const body = bytes.subarray(1);
    const from = L.ProtocolAddress.new(String(fromUserId), 1);
    let plain;
    if (type === 3) {
      plain = await L.signalDecryptPreKey(L.PreKeySignalMessage.deserialize(body), from, this.sessions, this.idents, this.pre, this.signed, this.kyber);
    } else if (type === 2) {
      plain = await L.signalDecrypt(L.SignalMessage.deserialize(body), from, this.sessions, this.idents);
    } else {
      throw new Error('bad type ' + type);
    }
    return new TextDecoder().decode(plain);
  }
  async encryptTo(text, toUserId) {
    const to = L.ProtocolAddress.new(String(toUserId), 1);
    const ct = await L.signalEncrypt(new TextEncoder().encode(text), to, this.sessions, this.idents);
    const packed = new Uint8Array(1 + ct.serialize().length);
    packed[0] = ct.type(); packed.set(ct.serialize(), 1);
    return b64(packed);
  }
}
