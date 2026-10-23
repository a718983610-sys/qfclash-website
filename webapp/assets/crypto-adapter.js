/* QFCrypto —— 网页版聊天加密层正式适配（由 proto 原型移植，见 signal-web.js）。
 * 口径与隐私说明 §三（四）一致：身份密钥与会话状态仅保存在页面内存中，
 * 页面关闭即清除；不写 localStorage/sessionStorage。
 * 保险库：与 App 同一备份格式 —— GET/PUT /chat/key-backup，transport =
 * base64(utf8(json {v:'2', kdf:'argon2id', salt, nonce, data}))，
 * KEK = Argon2id(登录密码, salt, t=3, m=16384KB, p=1, 32B)（@noble/hashes，
 * 与 App PointyCastle 参数实测字节一致），data = AES-256-GCM(KEK, nonce12) 加密的
 * App store JSON（identity/registrationId/entries 同 App 序列化口径）。
 * 恢复校验（防静默错恢复）：解出的身份公钥须与服务端公钥包 identityKeyX25519
 * 逐字一致、签名预钥记录须与公钥包 signedPrekey.pubkey 一致，任一不一致即
 * 丢弃该部分并按 App ensureInstalled 口径重新生成/发布，界面如实提示。
 * 已知边界：App 的 SessionRecord 会话条目不在网页版恢复范围内（格式为
 * libsignal 内部 protobuf，网页版不做猜测性解析）；恢复身份后与各好友的
 * 会话按公钥包重新协商，协商前对方以旧会话发来的消息可能无法解开，
 * 聊天页会逐条标注，不会显示为乱码明文，更不会降级明文发送。 */
import { SpecIdentity, SpecSession, genKeyPair, makeSignedPreKey, makeOneTimePreKey, b64, unb64, typed, rawOf, parseProto, concat, fieldBytes, fieldVarint } from './signal-web.js';
import { argon2id } from '@noble/hashes/argon2.js';
import { xchachaEncrypt, xchachaDecrypt } from './xchacha.js';

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder(), td = new TextDecoder();
const rnd = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
function b64big(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
async function sha256hex(bytes) { const d = await subtle.digest('SHA-256', bytes); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join(''); }

// ---- libsignal 记录序列化（与 App store entries 同口径，用于备份互通） ----
// PreKeyRecordStructure:    1=id varint, 2=publicKey(typed 33B), 3=privateKey(32B)
// SignedPreKeyRecordStructure: 1=id, 2=publicKey, 3=privateKey, 4=signature(64B), 5=timestamp fixed64
function serializePreKey(rec) { return concat(fieldVarint(1, rec.id), fieldBytes(2, typed(rec.pair.pub)), fieldBytes(3, rec.pair.priv)); }
function serializeSignedPreKey(rec, sig, tsSec) {
  const ts = new Uint8Array(8); new DataView(ts.buffer).setBigUint64(0, BigInt(tsSec || 0), true);
  return concat(fieldVarint(1, rec.id), fieldBytes(2, typed(rec.pair.pub)), fieldBytes(3, rec.pair.priv), fieldBytes(4, sig), fieldBytes(5, ts));
}
function parseKeyRecord(buf) {
  const f = parseProto(buf);
  const pub = f.get(2), priv = f.get(3);
  if (!pub || !priv) return null;
  return { id: f.get(1), pair: { pub: rawOf(pub), priv: new Uint8Array(priv) }, signature: f.get(4) ? new Uint8Array(f.get(4)) : null };
}

const state = {
  api: null,
  identity: null,
  registrationId: 0,
  signedPreKey: null,
  signedSig: null,
  oneTime: new Map(),
  nextOtpId: 0,
  sessions: new Map(),
  published: false,
  restoredFromBackup: false,
  restoreNote: '',
};

function newRegistrationId() { return 1 + Math.floor(Math.random() * 16380); }
async function aesGcmEncrypt(key, nonce, plain) {
  const k = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
  return new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, k, plain));
}
async function aesGcmDecrypt(key, nonce, sealed) {
  const k = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, k, sealed));
}
function storeJson() {
  const entries = {};
  entries['signed:0'] = b64(serializeSignedPreKey(state.signedPreKey, state.signedSig, Math.floor(Date.now() / 1000)));
  for (const rec of state.oneTime.values()) entries['pre:' + rec.id] = b64(serializePreKey(rec));
  entries['meta:nextPreKeyId'] = String(state.nextOtpId);
  return {
    identity: b64(concat(typed(state.identity.pair.pub), state.identity.pair.priv)),
    registrationId: state.registrationId,
    bundlePublished: state.published,
    entries,
  };
}
async function publishBundle() {
  const bundle = await state.identity.bundleJson({ signedPreKey: state.signedPreKey, oneTimePreKeys: [...state.oneTime.values()] });
  const r = await state.api('/chat/prekey-bundle', { method: 'PUT', body: bundle });
  if (!r.ok) throw new Error(r.message || '公钥包发布失败。');
  state.published = true;
}
async function ensureKeys() {
  if (state.identity) return;
  state.identity = new SpecIdentity(genKeyPair());
  state.registrationId = newRegistrationId();
  state.signedPreKey = makeSignedPreKey(0);
  state.signedSig = await state.identity.sign(typed(state.signedPreKey.pair.pub));
  state.oneTime = new Map();
  for (let i = 0; i < 100; i++) state.oneTime.set(i, makeOneTimePreKey(i));
  state.nextOtpId = 100;
}
async function ensureBundle() {
  if (!state.api) throw notReady();
  await ensureKeys();
  if (!state.published) await publishBundle();
}
function notReady() { const e = new Error('聊天加密模块尚未就绪，请先在聊天页完成解锁。'); e.code = 'CRYPTO_NOT_READY'; return e; }

/* 解锁：password = 登录密码。流程：
 * 1) 服务端有备份 → Argon2id 解密 → 校验身份/签名预钥与服务端公钥包一致 → 恢复；
 * 2) 无备份 → 生成新身份、发布公钥包、并把新备份上传（供 App/其他设备恢复）；
 * 3) 密码错误（AES-GCM 校验失败）→ 抛 VAULT_BAD_PASSWORD，不改动任何现有状态。 */
async function unlock(password) {
  if (!state.api) throw notReady();
  if (state.identity) return { restored: state.restoredFromBackup, note: state.restoreNote };
  const backupR = await state.api('/chat/key-backup');
  const transport = backupR.ok && backupR.data ? backupR.data.backup : null;
  if (transport) {
    let backup;
    try { backup = JSON.parse(td.decode(unb64(transport))); } catch { throw new Error('备份数据已损坏，无法恢复。'); }
    const kek = argon2id(te.encode(password), unb64(backup.salt), { t: 3, m: 16384, p: 1, dkLen: 32 });
    let plain;
    try { plain = await aesGcmDecrypt(kek, unb64(backup.nonce), unb64(backup.data)); }
    catch { const e = new Error('密码不正确，或备份已损坏。'); e.code = 'VAULT_BAD_PASSWORD'; throw e; }
    const store = JSON.parse(td.decode(plain));
    const idSer = unb64(store.identity || '');
    if (idSer.length !== 65) throw new Error('备份中的身份数据格式异常，无法恢复。');
    const pubRaw = rawOf(idSer.subarray(0, 33));
    const mine = await state.api('/chat/prekey-bundle');
    const serverId = mine.ok && mine.data ? mine.data.identityKeyX25519 : null;
    if (serverId && b64(pubRaw) !== serverId) {
      const e = new Error('备份中的身份与服务器记录不一致，已停止恢复以防误用。'); e.code = 'VAULT_IDENTITY_MISMATCH'; throw e;
    }
    state.identity = new SpecIdentity({ priv: new Uint8Array(idSer.subarray(33)), pub: new Uint8Array(pubRaw) });
    state.registrationId = Number(store.registrationId) || newRegistrationId();
    const entries = store.entries || {};
    let spkOk = false;
    if (entries['signed:0']) {
      const rec = parseKeyRecord(unb64(entries['signed:0']));
      const serverSpk = mine.ok && mine.data && mine.data.signedPrekey ? mine.data.signedPrekey.pubkey : null;
      if (rec && rec.id === 0 && (!serverSpk || b64(rec.pair.pub) === serverSpk)) {
        state.signedPreKey = { id: 0, pair: rec.pair };
        state.signedSig = rec.signature || await state.identity.sign(typed(rec.pair.pub));
        spkOk = true;
      }
    }
    if (!spkOk) {
      state.signedPreKey = makeSignedPreKey(0);
      state.signedSig = await state.identity.sign(typed(state.signedPreKey.pair.pub));
      state.restoreNote = '身份已恢复；签名预钥记录与服务端不一致，已重新生成并发布公钥包。';
    }
    state.oneTime = new Map();
    for (const k of Object.keys(entries)) {
      if (!k.startsWith('pre:')) continue;
      const rec = parseKeyRecord(unb64(entries[k]));
      if (rec && typeof rec.id === 'number') state.oneTime.set(rec.id, { id: rec.id, pair: rec.pair });
    }
    state.nextOtpId = state.oneTime.size ? Math.max(...[...state.oneTime.keys()].map((x) => x + 1)) : 0;
    if (state.oneTime.size === 0) { for (let i = 0; i < 100; i++) state.oneTime.set(i, makeOneTimePreKey(i)); state.nextOtpId = 100; }
    state.restoredFromBackup = true;
    state.published = spkOk && store.bundlePublished === true;
    if (!state.published) await publishBundle();
    return { restored: true, note: state.restoreNote };
  }
  await ensureKeys();
  await publishBundle();
  try {
    const salt = rnd(16), nonce = rnd(12);
    const kek = argon2id(te.encode(password), salt, { t: 3, m: 16384, p: 1, dkLen: 32 });
    const data = await aesGcmEncrypt(kek, nonce, te.encode(JSON.stringify(storeJson())));
    const transport = b64big(te.encode(JSON.stringify({ v: '2', kdf: 'argon2id', salt: b64(salt), nonce: b64(nonce), data: b64big(data) })));
    await state.api('/chat/key-backup', { method: 'PUT', body: { backup: transport } });
  } catch { /* 备份上传失败不阻断本次使用，身份仅存于本页内存 */ }
  return { restored: false, note: '' };
}

async function getSession(peerId) {
  let s = state.sessions.get(String(peerId));
  if (!s) { s = new SpecSession(state.identity, Number(peerId), state.registrationId); state.sessions.set(String(peerId), s); }
  return s;
}
async function encryptFor(peerId, text) {
  if (!state.identity) throw notReady();
  await ensureBundle();
  const s = await getSession(peerId);
  if (!s.sender) {
    const r = await state.api('/chat/prekey-bundle/' + encodeURIComponent(peerId));
    if (!r.ok || !r.data || !r.data.identityKeyX25519) { const e = new Error('对方还没有可用的聊天公钥，暂时无法发送加密消息。'); e.code = 'PEER_NO_BUNDLE'; throw e; }
    await s.processBundle(r.data);
  }
  const ciphertext = await s.encrypt(text);
  return { ciphertext, nonce: b64(rnd(16)), msgId: 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36) };
}
/* 解密一条消息：先 peek 密文头拿 preKeyId，按 id 取本机一次性预钥再正式解密。 */
async function decryptMessage(peerId, packedB64) {
  if (!state.identity) throw notReady();
  const s = await getSession(peerId);
  let otp = null;
  try {
    const packed = unb64(packedB64);
    if (packed[0] === 3) {
      const f = parseProto(packed.subarray(2));
      const pid = f.has(1) ? f.get(1) : null;
      if (pid != null && state.oneTime.has(pid)) otp = state.oneTime.get(pid);
    }
  } catch { /* 头解析失败交由正式解密报错 */ }
  return s.decrypt(packedB64, { signedPreKey: state.signedPreKey, oneTimePreKey: otp });
}
/* 附件：XChaCha20-Poly1305 封包（与 App QfBlobCrypto 同口径）→ POST /chat/blobs（原始字节＋校验头）。 */
async function sealAndUploadBlob(peerId, file) {
  if (!state.identity) throw notReady();
  const plain = new Uint8Array(await file.arrayBuffer());
  if (plain.length > 25 * 1024 * 1024) throw new Error('单个文件大小不能超过 25MB。');
  const fileKey = rnd(32), nonce = rnd(24);
  const cipher = xchachaEncrypt(fileKey, nonce, plain);
  const cipherSha256 = await sha256hex(cipher);
  const up = await state.api('/chat/blobs', { method: 'POST', bodyRaw: cipher, headers: { 'Content-Type': 'application/octet-stream', 'X-Blob-Recipient': String(peerId), 'X-Blob-Sha256': cipherSha256 } });
  if (!up.ok || !up.data || !up.data.blobId) throw new Error((up && up.message) || '附件上传失败，请稍后重试。');
  const ref = { type: 'attachment', blobId: up.data.blobId, fileKey: b64(fileKey), nonce: b64(nonce), cipherSha256, name: file.name || '附件', mime: file.type || 'application/octet-stream', size: plain.length };
  return { ref, wireText: 'qf1:' + JSON.stringify(ref) };
}
async function openBlob(ref) {
  const r = await state.api('/chat/blobs/' + encodeURIComponent(ref.blobId), {});
  if (!r.ok || !r.bytes) throw new Error('附件下载失败，请稍后重试。');
  if ((await sha256hex(r.bytes)) !== ref.cipherSha256) throw new Error('附件校验失败，文件可能已损坏。');
  return xchachaDecrypt(unb64(ref.fileKey), unb64(ref.nonce), r.bytes);
}

window.QFCrypto = {
  ready: false,
  setApi(api) { state.api = api; },
  isUnlocked() { return !!state.identity; },
  unlock,
  ensureBundle,
  encryptFor,
  decryptFrom: decryptMessage,
  decryptMessage,
  sealAndUploadBlob,
  openBlob,
  lock() { state.identity = null; state.sessions.clear(); state.oneTime.clear(); state.published = false; state.restoredFromBackup = false; },
};
export default window.QFCrypto;
// 模块脚本晚于经典脚本 app.js 执行：发就绪事件，app.js 据此补做 setApi 接线
try { window.dispatchEvent(new CustomEvent('qf-crypto-ready')); } catch (e) { /* ignore */ }
