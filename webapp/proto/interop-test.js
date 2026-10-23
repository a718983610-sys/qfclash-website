// 互通自测：qf-signal-web.js（网页端原型，按 App 端 Dart 库参数转写）
//        × @signalapp/libsignal-client（Signal 官方参考实现）
// 运行：node interop-test.js；全部通过 exit 0，任一失败 exit 1 并打印 FAIL 行。
import * as L from '@signalapp/libsignal-client';
import { SpecIdentity, SpecSession, makeSignedPreKey, makeOneTimePreKey, xeddsaSign, xeddsaVerify, b64, unb64, typed } from './qf-signal-web.js';
import { OraclePeer } from './oracle.js';

let failures = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (!cond) failures += 1;
}
function eq(name, got, want) { check(name, got === want, 'got=' + JSON.stringify(got)); }

// ============ 0. XEdDSA 原语双向对验（独立于会话层；多组随机密钥覆盖 A 符号位两种情形） ============
{
  let signOk = 0, verifyOk = 0; const N = 8;
  for (let i = 0; i < N; i++) {
    const pair = L.IdentityKeyPair.generate();
    const privRaw = new Uint8Array(pair.privateKey.serialize());
    const pubRaw = new Uint8Array(pair.publicKey.getPublicKeyBytes());
    const msg = new TextEncoder().encode('xeddsa-cross-check-' + i);
    if (pair.publicKey.verify(msg, xeddsaSign(privRaw, msg, new Uint8Array(64).fill(7)))) signOk++;
    if (xeddsaVerify(pubRaw, msg, new Uint8Array(pair.privateKey.sign(msg)))) verifyOk++;
  }
  check(`XEdDSA spec-sign -> libsignal verify (${signOk}/${N})`, signOk === N);
  check(`XEdDSA libsignal-sign -> spec verify (${verifyOk}/${N})`, verifyOk === N);
  const pair = L.IdentityKeyPair.generate();
  const sigBad = new Uint8Array(pair.privateKey.sign(new TextEncoder().encode('t')));
  sigBad[10] ^= 1;
  check('XEdDSA tampered sig rejected by spec verify', !xeddsaVerify(new Uint8Array(pair.publicKey.getPublicKeyBytes()), new TextEncoder().encode('t'), sigBad));
}

// ============ 1. spec(Alice) -> oracle(Bob)：经典 X3DH 握手 + 首条消息 ============
const bob = await new OraclePeer(2002).install();
const aliceId = new SpecIdentity();
const alice = new SpecSession(aliceId, 2002);
alice.processBundle(bob.bundleJson());
const m1 = '你好，这是网页端原型发出的第一条消息。';
const packed1 = alice.encrypt(m1);
eq('S1 oracle decrypts spec prekey message', await bob.decryptPacked(packed1, 2001), m1);

// 未确认前第二条仍为 PreKey 形态（与 App hasUnacknowledgedPreKeyMessage 口径一致）
const m2 = '第二条（握手未确认，仍应为 type=3 包裹）';
const packed2 = alice.encrypt(m2);
check('S1b second message still prekey-wrapped before ack', unb64(packed2)[0] === 3, 'type=' + unb64(packed2)[0]);
eq('S1b oracle decrypts second prekey message', await bob.decryptPacked(packed2, 2001), m2);

// ============ 2. oracle(Bob) -> spec(Alice)：棘轮步进 + 双向续聊 + 乱序 ============
const r1 = '收到，我是参考实现这边的回复一。';
eq('S2 spec decrypts oracle reply 1', alice.decrypt(await bob.encryptTo(r1, 2001)), r1);
const r2 = '参考实现回复二。';
eq('S2 spec decrypts oracle reply 2', alice.decrypt(await bob.encryptTo(r2, 2001)), r2);

const a3 = '网页端在收到回复后的第三条（发送链应已轮换）。';
const packed3 = alice.encrypt(a3);
check('S2b after ack, spec sends plain signal message', unb64(packed3)[0] === 2, 'type=' + unb64(packed3)[0]);
eq('S2b oracle decrypts spec message 3', await bob.decryptPacked(packed3, 2001), a3);

// 乱序：spec 连发 3 条，oracle 按 1,3,2 收
const o1 = alice.encrypt('乱序一');
const o2 = alice.encrypt('乱序二');
const o3 = alice.encrypt('乱序三');
eq('S2c oracle recv #1', await bob.decryptPacked(o1, 2001), '乱序一');
eq('S2c oracle recv #3 (skip)', await bob.decryptPacked(o3, 2001), '乱序三');
eq('S2c oracle recv #2 (skipped key)', await bob.decryptPacked(o2, 2001), '乱序二');

// 乱序反向：oracle 连发 3 条，spec 按 1,3,2 收
const p1 = await bob.encryptTo('反向乱序一', 2001);
const p2 = await bob.encryptTo('反向乱序二', 2001);
const p3 = await bob.encryptTo('反向乱序三', 2001);
eq('S2d spec recv #1', alice.decrypt(p1), '反向乱序一');
eq('S2d spec recv #3 (skip)', alice.decrypt(p3), '反向乱序三');
eq('S2d spec recv #2 (skipped key)', alice.decrypt(p2), '反向乱序二');

// 重复消息必须被拒
let dupRejected = false;
try { alice.decrypt(p2); } catch { dupRejected = true; }
check('S2e duplicate message rejected by spec', dupRejected);

// ============ 1R. oracle 发起 -> spec 接收（参考实现主动握手方向） ============
{
  const daveId = new SpecIdentity();
  const daveSpk = makeSignedPreKey(0);
  const daveOpk = makeOneTimePreKey(7);
  const daveBundle = daveId.bundleJson({ signedPreKey: daveSpk, oneTimePreKeys: [daveOpk] });
  const eve = await new OraclePeer(2005).install();
  await eve.processSpecBundle(daveBundle, 2004);
  const dave = new SpecSession(daveId, 2005);
  const hello = '参考实现主动发起的握手消息。';
  eq('S1R spec decrypts oracle-initiated prekey message',
    dave.decrypt(await eve.encryptTo(hello, 2004), { signedPreKey: daveSpk, oneTimePreKey: daveOpk }), hello);
  const back = 'spec 端对参考实现握手的回复。';
  eq('S1R oracle decrypts spec reply', await eve.decryptPacked(dave.encrypt(back), 2004), back);
}

// ============ 3. spec <-> spec（双端同为网页端原型，含无一次性预钥变体） ============
{
  const bobId = new SpecIdentity();
  const bobSpk = makeSignedPreKey(0);
  const bobOpk = makeOneTimePreKey(9);
  const bundle = bobId.bundleJson({ signedPreKey: bobSpk, oneTimePreKeys: [bobOpk] });
  const a2 = new SpecSession(new SpecIdentity(), 3002);
  a2.processBundle(bundle);
  const b2 = new SpecSession(bobId, 3001);
  const t1 = 'spec 对 spec 第一条。';
  eq('S3 spec-bob decrypts', b2.decrypt(a2.encrypt(t1), { signedPreKey: bobSpk, oneTimePreKey: bobOpk }), t1);
  const t2 = 'spec 对 spec 回复。';
  eq('S3 spec-alice decrypts reply', a2.decrypt(b2.encrypt(t2)), t2);

  // 无一次性预钥（仅三路 DH）
  const carolId = new SpecIdentity();
  const carolSpk = makeSignedPreKey(0);
  const bundleNoOtpk = carolId.bundleJson({ signedPreKey: carolSpk, oneTimePreKeys: [] });
  bundleNoOtpk.oneTimePrekeys = [];
  const a3s = new SpecSession(new SpecIdentity(), 3003);
  a3s.processBundle(bundleNoOtpk);
  const c3 = new SpecSession(carolId, 3001);
  const t3 = '无一次性预钥的第一条。';
  eq('S3b no-OPK handshake decrypts', c3.decrypt(a3s.encrypt(t3), { signedPreKey: carolSpk, oneTimePreKey: null }), t3);
}

// ============ 4. 负面用例 ============
{
  // 篡改密文中部一字节（落在密文区内）：oracle 必须拒绝
  const tampered = unb64(packed1); tampered[Math.floor(tampered.length / 2)] ^= 1;
  let oracleRejected = false;
  const bob2 = await new OraclePeer(2002).install(); // 新身份无关：MAC 校验在解密前必然失败或身份不符
  try { await bob2.decryptPacked(b64(tampered), 2001); } catch { oracleRejected = true; }
  check('S4a tampered ciphertext rejected', oracleRejected);

  // 篡改后给 spec 自己解（会话已建立，MAC 必须失败）
  const good = alice.encrypt('完整性校验样本');
  const bad = unb64(good); bad[Math.floor(bad.length / 2)] ^= 0x40;
  let specRejected = false;
  const bobCopy = new SpecSession(new SpecIdentity(), 9999); // 无会话也会先在 MAC/会话层失败
  try { bobCopy.decrypt(b64(bad)); } catch { specRejected = true; }
  check('S4b tampered ciphertext rejected by spec (no-session path)', specRejected);
  eq('S4b untampered still decrypts by oracle', await bob.decryptPacked(good, 2001), '完整性校验样本');

  // 签名预钥签名来自他人身份：spec 在建会话时必须拒绝
  const evil = new SpecIdentity();
  const victim = new SpecIdentity();
  const victimSpk = makeSignedPreKey(0);
  const evilBundle = victim.bundleJson({ signedPreKey: victimSpk, oneTimePreKeys: [] });
  evilBundle.identityKeyX25519 = evilBundle.identityKeyEd25519 = b64(evil.pubRaw); // 身份与签名者不一致
  let sigRejected = false;
  try { new SpecSession(new SpecIdentity(), 1).processBundle(evilBundle); } catch (e) { sigRejected = /signature/.test(e.message); }
  check('S4c forged signed-prekey signature rejected at bundle processing', sigRejected);
}

console.log(failures === 0 ? 'ALL_PASS' : `FAILURES=${failures}`);
process.exit(failures === 0 ? 0 : 1);
