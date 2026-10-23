# 聊天加密互通原型（网页版）

按 App 端参数逐项转写的 X3DH + 双棘轮浏览器端原型，与 Signal 官方参考实现做互通自测。
本目录为**验证原型，非生产代码**：生产网页版应以本原型验证过的参数为准，密码学实现仍只用成熟库（见设计文档 §5）。

## 文件

| 文件 | 说明 |
|---|---|
| `qf-signal-web.js` | 网页端原型：X25519/XEdDSA（@noble/curves）、HKDFv3、X3DH、双棘轮、AES-256-CBC + HMAC、Signal 线格式（protobuf 最小实现）、App 中继打包 `base64([type‖serialized])` |
| `oracle.js` | 测试预言机对端：`@signalapp/libsignal-client` 0.57.1（见下方版本说明） |
| `interop-test.js` | 互通自测：26 项断言，分 XEdDSA 原语、双向握手、双向乱序、负例四组 |
| `interop-test-output.txt` | 最近一次实测输出（ALL_PASS，退出码 0） |

## 运行

```bash
npm install
node interop-test.js   # 全部通过打印 ALL_PASS 并以 0 退出
```

## 实测结论（2026-10-23，Node v24.22.1）

- **XEdDSA 双向兼容**：原型签名被参考实现验签通过（8/8 组随机密钥）、参考实现签名被原型验签通过（8/8）。关键口径（对照 App 端 `ed25519.dart` 源码确认）：签名标量直接取私钥 32 字节（生成时已钳位），不做 SHA-512 展开；`r = ScReduce(SHA512(0xFE‖0xFF×31‖priv‖msg‖random))`；签名公钥 A 的 x 符号位藏在签名第 64 字节最高位，验签时据此恢复 A。
- **会话双向互通**：原型发起 → 参考实现解开 PreKey 消息；参考实现发起 → 原型解开；握手未确认前续发仍为 PreKey 包裹；确认后转普通消息并轮换发送链；双向乱序（跳过消息密钥）均可解；重复消息、篡改密文、伪造签名预钥签名均被拒绝；无一次性预钥（三路 DH）变体可通。
- **版本字节差异（已对齐）**：版本字节高 4 位为协议版本（=3）。App（Dart）发出 `0x33` 并只按高 4 位校验；参考实现 0.57.1 发出 `0x34`（低 4 位不同），App 口径可接受。原型与 App 一致：发出 `0x33`、按高 4 位校验、MAC 按收到字节原样计算。

## 为什么预言机钉在 0.57.1

最新版 `@signalapp/libsignal-client` 0.105.4 已移除经典 X3DH：解经典 PreKey 消息直接抛 `X3DH no longer supported`，且构造公钥包强制要求 Kyber 预钥，无法充当 App 所用经典协议的预言机。0.57.1 为 Signal 桌面端在产用过的版本，经典 X3DH 发起/接收完整。

## 残余项（上线前必测，如实记录）

本机无 Dart/Flutter 运行时，未能与 App 端 `libsignal_protocol_dart 0.8.2` 本体直接对测；原型按其源码逐行转写（含 `ratcheting_session.dart`、`session_cipher.dart`、`ed25519.dart`、`hkdfv3.dart` 等），并已与同协议的参考实现（Rust）双向互通。网页版正式开发前，须在 Flutter 测试环境中以同一批测试向量对 App 端库复跑一轮（测试向量即本目录场景一/二/三的固定明文与流程）。
