/* QFClash 网页版：会话、抽屉导航、路由与各页面（正式接线版）。
 * 会话语义与官网 auth.js 同形：双令牌（access/refresh）、"记住此设备"决定 local/session 存储、
 * 401 自动续期重试一次、deviceId 为浏览器特征哈希 + 随机串（qf_web_id 与官网共用）。
 * 字段口径全部以服务端真实回包为准（见各页注释中的契约来源）。 */
(function () {
  'use strict';
  var API = 'https://qfclash-account.a718983610.workers.dev';
  var GOOGLE_CLIENT_ID = '340614194006-7a7anda3p473qjlhr67k6hn3o6aaqu9o.apps.googleusercontent.com';
  // 维护状态（L-02）：版本清单以 fork main 的 raw 地址为现行口径（与 App 同源）
  var RELEASE_URL = 'https://raw.githubusercontent.com/a718983610-sys/FlClash/main/qfclash-release.json';
  var MAINTENANCE_TEXT = '系统维护中，请稍后再试';

  // ---------- 工具 ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function fmtTs(sec) {
    if (sec == null || sec === '') return '';
    var n = Number(sec); if (!isFinite(n)) return String(sec);
    var ms = n < 1e12 ? n * 1000 : n;
    return new Date(ms).toLocaleString('zh-CN', { hour12: false });
  }
  function b64OfBytes(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + 0x8000)); return btoa(s); }
  function bytesOfB64(b64) { var bin = atob(String(b64 || '')); var out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

  // ---------- 通行密钥域名闸与错误翻译 ----------
  // 服务端 WebAuthn 的 RP ID 固定为正式域名 qfclash.eu.org，临时域名（如
  // github.io）下浏览器根本不许创建/使用通行密钥。此前在临时域名点「创建
  // 通行密钥」，前端会把浏览器英文原话（RP ID 不匹配）原样弹给用户。现：
  // 非正式域名时入口先置灰并给中文说明（pageSecurity 渲染处）；万一仍走到
  // 调用层，waErrText 把浏览器错误逐类翻成大白话中文，绝不原样上屏。
  var PK_DOMAIN_NOTE = '通行密钥将在正式域名上线后可用。';
  function pkDomainOk() { return /(^|\.)qfclash\.eu\.org$/i.test(location.hostname || ''); }
  function waErrText(e, fb) {
    var name = (e && e.name) || '', msg = (e && e.message) || '';
    if (msg && /[一-鿿]/.test(msg)) return msg; // 服务端中文提示（自抛 Error）原样保留
    if (name === 'SecurityError' || /RP ID|not authorized|origin/i.test(msg)) {
      return pkDomainOk() ? '当前访问地址与通行密钥不匹配，无法使用通行密钥。请通过正式网址访问后再试。' : PK_DOMAIN_NOTE;
    }
    switch (name) {
      case 'NotAllowedError': return '通行密钥操作未完成（可能已取消或超时），请重试；也可以改用密码或邮箱验证码。';
      case 'AbortError': return '通行密钥操作已取消。';
      case 'InvalidStateError': return '此设备已创建过通行密钥，无需重复创建。';
      case 'ConstraintError': return '当前设备不满足创建通行密钥的条件。';
      case 'NotSupportedError': return '当前浏览器或设备不支持通行密钥。';
      case 'TimeoutError': return '通行密钥操作超时，请重试。';
    }
    if (/timed out|timeout/i.test(msg)) return '通行密钥操作超时，请重试。';
    return fb || '通行密钥操作失败，请稍后重试。';
  }
  // 非 WebAuthn 的浏览器/底层库错误同样不许把英文原话上屏：已是中文的保留，
  // 英文的一律换成调用方给的大白话兜底文案。
  function uiErrText(e, fb) {
    var msg = (e && e.message) || '';
    if (msg && /[一-鿿]/.test(msg)) return msg;
    return fb;
  }

  // ---------- 设备标识（与官网 deviceId 同形，共用 qf_web_id） ----------
  function deviceId() {
    var id = localStorage.getItem('qf_web_id');
    if (id) return id;
    var feat = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');
    var h = 5381; for (var i = 0; i < feat.length; i++) { h = ((h << 5) + h + feat.charCodeAt(i)) >>> 0; }
    var rnd = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    id = 'web-' + h.toString(16) + '-' + rnd;
    localStorage.setItem('qf_web_id', id);
    return id;
  }

  // ---------- 会话 ----------
  var KEYS = ['qf_access_token', 'qf_refresh_token', 'qf_nickname', 'qf_email', 'qf_username'];
  function storeGet(k) { return localStorage.getItem(k) || sessionStorage.getItem(k); }
  function saveSession(data, remember) {
    var store = remember ? localStorage : sessionStorage, other = remember ? sessionStorage : localStorage;
    KEYS.forEach(function (k) { other.removeItem(k); });
    // 服务端登录类回包形状为 {user:{id,email,username,...}, accessToken,...}：
    // 身份字段嵌在 user 里、顶层只有令牌。先摊平（顶层同名字段优先），否则
    // 昵称/邮箱/账户 ID/用户 ID 全部存不进会话——横幅与抽屉只能落到兜底文案
    // （2026-10-24 缺陷根因：头像靠令牌拉图正常、名字显示「用户」）。
    var flat = Object.assign({}, (data && data.user) || {}, data || {});
    if (flat.userId == null && flat.id != null) flat.userId = flat.id;
    if (flat.accessToken) store.setItem('qf_access_token', flat.accessToken);
    if (flat.refreshToken) store.setItem('qf_refresh_token', flat.refreshToken);
    if (flat.nickname) store.setItem('qf_nickname', flat.nickname);
    if (flat.email) store.setItem('qf_email', flat.email);
    if (flat.username) store.setItem('qf_username', flat.username);
    if (flat.userId != null) { other.removeItem('qf_user_id'); store.setItem('qf_user_id', String(flat.userId)); }
  }
  // 显示名统一口径（2026-10-24）：昵称优先；无昵称用账户名（账户 ID/对方账
  // 户名，都是真标识）；都没有才用占位「未设置昵称」——不再用「用户」这种
  // 假名字冒充昵称。服务端作者名走 effectiveNickname（昵称→历史昵称→邮箱
  // 前缀）恒有值，前端兜底只在接口缺字段时才触发。
  function nameOrFallback(name, username) {
    if (name) return name;
    if (username) return username;
    return '未设置昵称';
  }
  function myDisplayName() {
    var me = meBasic();
    return nameOrFallback(me.nickname, me.username);
  }

  // 站长绿标（2026-10-24 用户亲定）：站长账号在各处名字旁带绿色「站长」
  // 小徽标。判断口径（2026-10-24 服务端定版）：优先认 ownerBadge 字段
  // （'green' | null，登录回包 user、/profile、公开资料视图同口径）；
  // 旧字段 is_owner/isOwner 作兜底；只带用户 ID 的视图按站长账号固定
  // ID 15 兜底（站长账号全站唯一）。
  function ownerFlagOf(o) { return !!(o && (o.ownerBadge === 'green' || o.is_owner || o.isOwner)); }
  function ownerBadgeHtml(userId, flag) {
    return (flag || Number(userId) === 15) ? '<span class="owner-badge">站长</span>' : '';
  }
  // 登录类回包不带 nickname（服务端契约如此，不动以免影响 App）：登录后与
  // 启动时各补拉一次 GET /profile，用 effectiveNickname 回填会话存储。
  // 返回 true 表示本次补上了此前缺失的昵称（调用方据此决定是否重渲染）。
  var profileSyncDone = false;
  async function syncMyProfile(force) {
    if (!loggedIn() || (profileSyncDone && !force)) return false;
    profileSyncDone = true;
    var before = storeGet('qf_nickname') || '';
    var r = await api('/profile');
    if (!r.ok || !r.data) return false;
    var p = r.data;
    saveSession({ nickname: p.effectiveNickname || p.nickname || '', username: p.username || '', email: p.email || '', userId: p.userId }, !!localStorage.getItem('qf_access_token'));
    renderIdentity();
    return !before && !!(p.effectiveNickname || p.nickname);
  }
  function clearSession() { KEYS.concat(['qf_user_id']).forEach(function (k) { localStorage.removeItem(k); sessionStorage.removeItem(k); }); hideBanBanner(); }
  function loggedIn() { return !!storeGet('qf_access_token'); }
  function myUserId() { var v = storeGet('qf_user_id'); return v ? Number(v) : null; }
  function meBasic() { return { nickname: storeGet('qf_nickname') || '', email: storeGet('qf_email') || '', username: storeGet('qf_username') || '' }; }

  // ---------- API ----------
  // 请求超时（W-02）：全站统一 15 秒。接口挂起（TCP 半开、Worker 冷启动卡死）
  // 时不再无限「正在加载…」，AbortController 到点中断后按网络失败归一呈现，
  // 页面既有错误文案与重试入口随之生效。
  var API_TIMEOUT_MS = 15000;
  function fetchTimeout(url, opts, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms || API_TIMEOUT_MS);
    var o = Object.assign({}, opts || {}, { signal: ctrl.signal });
    return fetch(url, o).then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }
  async function api(path, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.bodyRaw === undefined) headers['Content-Type'] = 'application/json';
    if (opts.headers) Object.keys(opts.headers).forEach(function (k) { headers[k] = opts.headers[k]; });
    if (opts.auth !== false && storeGet('qf_access_token')) headers['Authorization'] = 'Bearer ' + storeGet('qf_access_token');
    var res;
    try {
      res = await fetchTimeout(API + path, { method: opts.method || 'GET', headers: headers, body: opts.bodyRaw !== undefined ? opts.bodyRaw : (opts.body ? JSON.stringify(opts.body) : undefined) });
    } catch (e) {
      return { ok: false, network: true, message: (e && e.name === 'AbortError') ? '请求超时，请检查网络后重试。' : '网络连接失败，请检查网络后重试。' };
    }
    if (opts.expectBytes) {
      if (!res.ok) { var eb = null; try { eb = await res.json(); } catch (e) {} return { ok: false, status: res.status, data: eb, code: eb && eb.code, message: (eb && (eb.message || eb.error)) || '请求失败（' + res.status + '）' }; }
      return { ok: true, status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
    }
    var data = null; try { data = await res.json(); } catch (e) { /* 非 JSON 响应按状态码处理 */ }
    if (res.status === 401 && !opts._retried && storeGet('qf_refresh_token')) {
      var rr = await api('/auth/refresh', { method: 'POST', auth: false, body: { refreshToken: storeGet('qf_refresh_token') }, _retried: true });
      if (rr.ok && rr.data && rr.data.accessToken) {
        saveSession(rr.data, !!localStorage.getItem('qf_access_token'));
        opts._retried = true; return api(path, opts);
      }
      clearSession(); renderIdentity();
      if (rr && rr.code === 'ACCOUNT_BANNED') showBanBanner(rr.data);
    }
    if (data && data.code === 'ACCOUNT_BANNED' && opts.auth !== false) showBanBanner(data);
    return { ok: res.ok && !(data && data.ok === false), status: res.status, data: data, code: data && data.code, message: (data && (data.message || data.error)) || (res.ok ? '' : '请求失败（' + res.status + '），请稍后重试。') };
  }
  // 发码倒计时：与服务端 60 秒发码冷却一致。发送成功或被冷却拦下（429）后调用，
  // 期间禁用按钮并显示剩余秒数，避免连点必吃限流且用户无预期。
  function armCodeCooldown(btn, seconds) {
    if (!btn || btn.disabled) return;
    var left = seconds || 60;
    var label = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', label);
    btn.disabled = true;
    btn.textContent = '重新发送（' + left + ' 秒）';
    var timer = setInterval(function () {
      left -= 1;
      if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = label; return; }
      btn.textContent = '重新发送（' + left + ' 秒）';
    }, 1000);
  }
  // 提交防重（W-05）：表单提交执行期间禁用提交按钮并置在飞标志，弱网下连点/
  // 双击不再发出多份相同请求。返回解锁函数；表单已在提交中时返回 null，
  // 调用方应直接 return。意见反馈页原有的禁用写法与此同口径。
  function lockSubmit(form) {
    if (!form || form.dataset.qfLocked) return null;
    form.dataset.qfLocked = '1';
    var btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    return function () { delete form.dataset.qfLocked; if (btn) btn.disabled = false; };
  }
  // crypto-adapter 是 ES 模块（defer 执行），晚于本经典脚本：就绪后补接线
  function wireCrypto() {
    if (!(window.QFCrypto && QFCrypto.setApi)) return false;
    QFCrypto.setApi(function (path, opts) {
      opts = opts || {};
      if (opts.bodyRaw !== undefined) return api(path, opts);
      if (path.indexOf('/chat/blobs/') === 0 && (opts.method || 'GET') === 'GET') return api(path, Object.assign({}, opts, { expectBytes: true }));
      return api(path, opts);
    });
    return true;
  }
  if (!wireCrypto()) {
    window.addEventListener('qf-crypto-ready', wireCrypto);
    document.addEventListener('DOMContentLoaded', wireCrypto);
  }

  // ---------- 头像（带令牌取图，失败回落占位） ----------
  // 断链主因（2026-10-24 修复）：服务端头像接口回 cache-control: private, max-age=300，
  // 且头像 URL 恒定不变。此前 avatarUrl 用默认缓存的 fetch 取图，上传后 300 秒内
  // 重新取图会直接回放浏览器 HTTP 缓存里的旧图字节，页面怎么刷新都还是旧头像。
  // 对策：取图一律 cache:'no-store' 绕过 HTTP 缓存，并按资料的 avatarUpdatedAt 拼
  // ?v= 版本参数击穿任何中间缓存；上传成功后以 PUT 回包的 avatarUpdatedAt 为准
  // 更新 myAvatarVer，全站头像位（抽屉/我的/论坛/好友/会话）统一以此刷新。
  var myAvatarVer = 0;   // 本人头像版本（= 服务端 avatarUpdatedAt，秒；GET/PUT /profile 回包维护）
  var avatarBust = 0;    // 无版本信息时的兜底击穿计数（每次成功上传 +1）
  async function avatarUrl(path, ver) {
    try {
      var headers = {}; var tok = storeGet('qf_access_token'); if (tok) headers['Authorization'] = 'Bearer ' + tok;
      var v = (ver != null && ver !== '') ? ver : avatarBust;
      var url = API + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(v);
      var res = await fetchTimeout(url, { headers: headers, cache: 'no-store' });
      if (!res.ok) return '';
      return URL.createObjectURL(await res.blob());
    } catch (e) { return ''; }
  }
  // 把头像图填进占位槽：取到新图才替换内容（失败保留占位/旧图不闪烁），旧 blob URL 及时回收。
  function showAvatar(slot, path, ver, size) {
    if (!slot) return Promise.resolve();
    return avatarUrl(path, ver).then(function (u) {
      if (!u) return;
      if (!slot.isConnected) { URL.revokeObjectURL(u); return; }
      var old = slot.getAttribute('data-obj-url');
      slot.innerHTML = '<img class="avatar" style="width:' + size + 'px;height:' + size + 'px;" alt="头像" src="' + u + '">';
      if (old) URL.revokeObjectURL(old);
      slot.setAttribute('data-obj-url', u);
    });
  }
  // 列表头像位（好友/申请/搜索/会话）：占位 HTML + 批量填充，数据源与各页一致，
  // 均为 GET /profile/:userId/avatar，版本取列表回包自带的 avatarUpdatedAt。
  function avatarSlotHtml(uid, ver, has, name, size) {
    return '<span data-avatar-uid="' + esc(uid) + '" data-avatar-ver="' + esc(ver == null ? '' : ver) + '" data-avatar-has="' + (has ? '1' : '0') + '" data-avatar-size="' + size + '"><span class="avatar-ph" style="width:' + size + 'px;height:' + size + 'px;">' + esc((name || 'Q').slice(0, 1)) + '</span></span>';
  }
  function fillAvatars(root) {
    (root || document).querySelectorAll('[data-avatar-uid]').forEach(function (slot) {
      if (slot.getAttribute('data-avatar-has') !== '1') return;
      showAvatar(slot, '/profile/' + encodeURIComponent(slot.getAttribute('data-avatar-uid')) + '/avatar', slot.getAttribute('data-avatar-ver') || '', Number(slot.getAttribute('data-avatar-size')) || 40);
    });
  }
  // 相对时间（会话/列表用）：刚刚/分钟前/小时前/日期
  function relTime(sec) {
    if (sec == null || sec === '') return '';
    var n = Number(sec); if (!isFinite(n)) return '';
    var ms = n < 1e12 ? n * 1000 : n;
    var diff = Date.now() - ms;
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 3600 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 7 * 86400 * 1000) return Math.floor(diff / 86400000) + ' 天前';
    return new Date(ms).toLocaleDateString('zh-CN');
  }
  // 是否站长（以 /owner/me 探测结果为准，probeOwner 维护；删除等敏感入口仅站长可见，
  // 服务端对全部 owner 接口另有角色校验，此处显隐只决定呈现）
  function isSiteOwner() { return ownerState === true; }

  // ---------- 维护状态（L-02）：与 App 同一清单；maintenance=true 显示维护页，恢复自动可用 ----------
  var maintenanceOn = false;
  async function checkMaintenance() {
    try {
      var res = await fetchTimeout(RELEASE_URL, { cache: 'no-store' });
      if (!res.ok) return;
      var j = await res.json();
      var on = !!(j && j.maintenance === true);
      if (on !== maintenanceOn) { maintenanceOn = on; render(); }
    } catch (e) { /* 清单拉取失败不阻断使用（与 App 离线口径一致） */ }
  }

  // ---------- 抽屉（硬规格：点菜单不收起；仅汉堡再点或点抽屉外区域收起；点外部收起不拦截该次点击） ----------
  var drawer = $('#drawer'), burger = $('#hamburger');
  function setDrawer(open) {
    drawer.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    // W-12：关闭态用 inert 把抽屉内链接/按钮移出键盘 Tab 序（与 aria-hidden 一致），
    // CSS 侧另有 visibility 兜底（不支持 inert 的浏览器）。
    if ('inert' in drawer) drawer.inert = !open;
  }
  if ('inert' in drawer) drawer.inert = true;
  function drawerOpen() { return drawer.classList.contains('open'); }
  burger.addEventListener('click', function () { setDrawer(!drawerOpen()); });
  document.addEventListener('pointerdown', function (ev) {
    if (!drawerOpen()) return;
    if (drawer.contains(ev.target) || burger.contains(ev.target)) return;
    setDrawer(false);
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') setDrawer(false); });

  // ---------- v2 交互层：顶栏滚动阴影 / 搜索层 / 底部发帖钮 ----------
  window.addEventListener('scroll', function () {
    var tb = document.querySelector('.topbar');
    if (tb) tb.classList.toggle('scrolled', window.scrollY > 6);
  }, { passive: true });
  var composeWanted = false; // 底部「发帖」钮：先到论坛首页，再自动打开发帖框
  var tabPostBtn = $('#tabPost');
  if (tabPostBtn) tabPostBtn.addEventListener('click', function () {
    composeWanted = true;
    // 发帖框只在论坛首页页签内：先切回该页签，保证标志必被 pageForum 消费。
    forumState.tab = 'home';
    // 已在论坛首页路由时点它，锚点 hash 不变、不会触发 hashchange 重渲染，
    // 标志无人消费＝死点击（且残留标志会让下次进论坛页迟到弹框）。同路由
    // 直接重渲染论坛页，由 pageForum 末尾消费标志打开发帖框并清标志；
    // 跨页时不干预，仍走锚点跳转＋hashchange 的原路径。
    var r = route();
    if (r.name === 'forum' && !r.arg) guardPage(pageForum(r));
  });
  // 搜索层：真实能力只有好友精确搜索（与好友页同一接口），另附快捷入口；
  // 不做无服务端支撑的假搜索。
  var searchOverlay = null;
  function closeSearch() { if (searchOverlay) { searchOverlay.remove(); searchOverlay = null; } }
  function openSearch() {
    if (searchOverlay) return;
    searchOverlay = document.createElement('div');
    searchOverlay.className = 'search-overlay';
    searchOverlay.innerHTML = '<div class="search-sheet" role="dialog" aria-label="搜索">' +
      '<form class="ss-head" id="ssForm"><input id="ssInput" type="search" placeholder="按账户 ID 或邮箱精确搜索好友" autocomplete="off"><button class="primary" type="submit">搜索</button><button class="ghost" type="button" id="ssClose">关闭</button></form>' +
      '<div id="ssOut"></div>' +
      '<h3>快捷入口</h3><div class="ss-links">' +
      '<a href="#/forum">' + ico('chat', 18) + '论坛首页</a>' +
      '<a href="#/friends">' + ico('users', 18) + '好友与会话</a>' +
      '<a href="#/support">' + ico('headset', 18) + '智能客服</a>' +
      '<a href="#/points">' + ico('star', 18) + '积分兑换</a></div></div>';
    document.body.appendChild(searchOverlay);
    searchOverlay.addEventListener('pointerdown', function (ev) { if (ev.target === searchOverlay) closeSearch(); });
    searchOverlay.querySelector('#ssClose').addEventListener('click', closeSearch);
    searchOverlay.querySelectorAll('.ss-links a').forEach(function (a) { a.addEventListener('click', closeSearch); });
    var input = searchOverlay.querySelector('#ssInput');
    if (input) input.focus();
    searchOverlay.querySelector('#ssForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var out = searchOverlay.querySelector('#ssOut');
      var q = String(input.value || '').trim(); if (!q) return;
      if (!loggedIn()) { out.innerHTML = '<p class="muted" style="margin-top:12px;">登录后可搜索并添加好友。</p>'; return; }
      out.innerHTML = '<p class="muted" style="margin-top:12px;">正在搜索…</p>';
      var r = await api('/friends/search', { method: 'POST', body: { query: q } });
      if (!searchOverlay) return;
      if (!r.ok) { out.innerHTML = '<p class="err" style="margin-top:12px;">' + esc(r.message) + '</p>'; return; }
      var users = (r.data && r.data.users) || [];
      out.innerHTML = '<h3>搜索结果</h3>' + (users.length ? users.map(function (u) {
        return '<div class="pane-item">' + avatarSlotHtml(u.userId, u.avatarUpdatedAt, u.hasAvatar, u.nickname, 40) + '<span class="grow"><span class="pname">' + esc(nameOrFallback(u.nickname, u.username)) + ownerBadgeHtml(u.userId, ownerFlagOf(u)) + '</span></span><button class="primary" data-ssadd="' + esc(u.userId) + '" type="button" style="padding:6px 13px;">添加好友</button></div>';
      }).join('') : '<p class="muted small">未找到对应用户。请确认账户 ID 或邮箱无误（仅支持精确搜索）。</p>');
      fillAvatars(out);
      out.querySelectorAll('[data-ssadd]').forEach(function (b) { b.addEventListener('click', async function () {
        var rr = await api('/friends/request', { method: 'POST', body: { userId: Number(b.getAttribute('data-ssadd')) } });
        b.textContent = rr.ok ? '已发送' : '失败'; b.disabled = true;
        if (!rr.ok) appToast(rr.message || '发送失败，请稍后重试。');
      }); });
    });
  }
  var topSearchBtn = $('#topSearchBtn');
  if (topSearchBtn) topSearchBtn.addEventListener('click', openSearch);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeSearch(); });

  function renderIdentity() {
    var box = $('#drawerIdentity');
    var btn = $('#logoutBtn');
    if (loggedIn()) {
      var me = meBasic();
      box.innerHTML = '<span id="drawerAvatar"><span class="avatar-ph">' + esc(myDisplayName().slice(0, 1)) + '</span></span>' +
        '<span class="who"><span class="nick">' + esc(myDisplayName()) + ownerBadgeHtml(myUserId()) + '</span><br><span class="uid">' + esc(me.username ? '账户 ID：' + me.username : '') + '</span></span>';
      showAvatar($('#drawerAvatar'), '/profile/avatar', myAvatarVer, 44);
      btn.hidden = false;
    } else {
      box.innerHTML = '<span class="login-entry">登录</span>';
      btn.hidden = true;
    }
  }
  $('#drawerIdentity').addEventListener('click', function () { location.hash = loggedIn() ? '#/me' : '#/login'; });
  $('#logoutBtn').addEventListener('click', async function () {
    try { await api('/auth/logout', { method: 'POST', body: {} }); } catch (e) { /* 退出以本地清理为准 */ }
    if (window.QFCrypto && QFCrypto.lock) QFCrypto.lock();
    clearSession(); renderIdentity(); location.hash = '#/home'; render();
  });

  // ---------- 路由 ----------
  var view = $('#view');
  function route() {
    var h = location.hash.replace(/^#\//, '') || 'home';
    var parts = h.split('/');
    return { name: parts[0], arg: parts[1] || '', sub: parts[2] || '' };
  }
  function markNav(name) {
    document.querySelectorAll('#drawerNav a, .topnav a, #tabbar a[data-route]').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-route') === name); });
  }
  function needLogin(title) {
    view.innerHTML = '<div class="card"><h2>' + esc(title) + '</h2><p class="muted">您尚未登录。登录后即可使用此功能，网页版与客户端共用同一账号。</p><p><a class="primary" href="#/login">前往登录</a></p></div>';
  }
  async function render() {
    var r = route(); markNav(r.name === 'chat' ? 'friends' : r.name);
    document.body.classList.toggle('in-chat', r.name === 'chat');
    if (r.name !== 'chat' && typeof chatTimer !== 'undefined' && chatTimer) { clearInterval(chatTimer); chatTimer = null; }
    if (r.name !== 'support') { supportSeq++; if (supportTimer) { clearInterval(supportTimer); supportTimer = null; } }
    probeOwner();
    window.scrollTo(0, 0);
    if (maintenanceOn) {
      view.innerHTML = '<div class="card" style="text-align:center;padding:44px 16px;"><h2>' + MAINTENANCE_TEXT + '</h2><p class="muted">维护结束后本页面将自动恢复使用，无需手动刷新。</p></div>';
      return;
    }
    if (r.name === 'home') return guardPage(pageHome());
    if (r.name === 'login') return guardPage(pageLogin());
    if (r.name === 'register') return guardPage(pageRegister());
    if (r.name === 'reset') return guardPage(pageReset());
    if (r.name === 'appeal') return guardPage(pageAppeal(r.arg));
    if (r.name === 'points') return guardPage(pagePoints());
    if (r.name === 'forum') return guardPage(pageForum(r));
    if (r.name === 'friends') return guardPage(pageFriends());
    if (r.name === 'chat') return guardPage(pageChat(r.arg));
    if (r.name === 'security') return guardPage(pageSecurity());
    if (r.name === 'support') return guardPage(pageSupport());
    if (r.name === 'feedback') return guardPage(pageFeedback());
    if (r.name === 'me') return guardPage(pageMe());
    if (r.name === 'owner') return guardPage(pageOwner(r));
    view.innerHTML = '<div class="card"><h2>页面不存在</h2><p class="muted">您访问的页面不存在。</p></div>';
  }
  // 全站防卡死兜底：页面渲染中任何未捕获异常都落到明确错误态＋重试入口，
  // 不许留下无限转圈的骨架屏/「正在加载…」（2026-10-24 全入口清扫立规）。
  function guardPage(p) {
    return Promise.resolve(p).catch(function (e) {
      if (window.console && console.error) console.error(e);
      view.innerHTML = '<div class="card"><h2>页面加载出错</h2><p class="muted">页面显示时发生错误，已停止加载。请重试；如多次失败，请通过意见反馈告知我们。</p><p><button class="primary" id="pageRetry" type="button">重新加载</button></p></div>';
      var b = $('#pageRetry');
      if (b) b.addEventListener('click', function () { render(); });
    });
  }
  window.addEventListener('hashchange', render);

  // ---------- 首页（v2 信息流：hero＋板块墙＋最新帖子流＋功能导航） ----------
  async function pageHome() {
    var me = meBasic();
    view.innerHTML =
      '<div class="hero"><div class="hero-in"><div class="hero-kicker">QFCLASH · 网页版</div>' +
      '<div class="hero-title">欢迎使用 QFClash 网页版</div>' +
      '<div class="hero-sub">与客户端共用同一账号，好友、聊天、论坛、营地、积分与客服三端同步；连接、节点与订阅功能请使用客户端。</div>' +
      (loggedIn()
        ? '<div class="hero-user"><span id="homeAvatar"><span class="avatar-ph">' + esc(myDisplayName().slice(0, 1)) + '</span></span><span><span class="hnick">' + esc(myDisplayName()) + ownerBadgeHtml(myUserId()) + '</span><br><span class="huid">' + (me.username ? '账户 ID：' + esc(me.username) : '') + '</span></span></div>' +
          '<div class="hero-cta"><a class="btn-white" href="#/forum">进入论坛</a><a class="btn-ghost-w" href="#/friends">好友与会话</a></div>'
        : '<div class="hero-cta"><a class="btn-white" href="#/login">登录</a><a class="btn-ghost-w" href="#/register">注册</a><a class="btn-ghost-w" href="#/forum">先逛论坛</a></div>') +
      '</div></div>' +
      '<div class="card"><h2 style="margin-bottom:12px;">逛板块</h2><div class="board-grid" id="homeBoards">' + sklCards(1) + '</div></div>' +
      '<div class="card"><div class="row"><h2 class="grow" style="margin:0;">最新帖子</h2><a class="ghost" href="#/forum" style="padding:6px 14px;">去论坛</a></div><div id="homeFeed" style="margin-top:14px;">' + sklCards(2) + '</div></div>' +
      '<div class="card"><h2>功能导航</h2><div class="list">' +
      [['#/points', '积分', '查看积分余额、进度与明细，在网页完成兑换；积分获取以客户端在线时长为准。', 'star', 'c-teal'],
       ['#/forum', '论坛', '综合讨论、使用求助、建议与反馈与公告，并可创建、加入主题社区「营地」。', 'chat', 'c-blue'],
       ['#/friends', '好友与会话', '管理好友与申请，进行端对端加密聊天。', 'users', 'c-violet'],
       ['#/support', '智能客服', '自动回复系统，全天候解答使用问题，可转人工。', 'headset', 'c-sky'],
       ['#/feedback', '意见反馈', '问题与建议直达维护者，与客户端意见反馈同一通道。', 'mail', 'c-deep'],
       ['#/security', '安全中心', '修改密码、换绑邮箱、登录设备、通行密钥与注销账号。', 'shield', 'c-slate']]
        .map(function (x) { return '<a class="item" href="' + x[0] + '"><span class="nav-ico ' + x[3 + 1] + '">' + ico(x[3], 21) + '</span><span class="grow"><strong>' + x[1] + '</strong><br><span class="muted small">' + x[2] + '</span></span><span aria-hidden="true" class="faint">›</span></a>'; }).join('') +
      '</div></div>';
    if (loggedIn()) showAvatar($('#homeAvatar'), '/profile/avatar', myAvatarVer, 48);
    var bBox = $('#homeBoards');
    var boardsR = await api('/forum/boards', { auth: false });
    if (bBox && boardsR.ok) {
      var boards = (boardsR.data && boardsR.data.boards) || [];
      bBox.innerHTML = boards.map(function (b) {
        var key = b.key || b.id; var bm = boardMeta(key);
        return '<a class="board-card" href="#/forum" data-board-link="' + esc(key) + '"><span class="bc-ico bc-' + bm.cls + '">' + ico(bm.ico, 23) + '</span><span><span class="bc-name">' + esc(b.name || b.title || key) + '</span><span class="bc-sub">' + esc(bm.sub) + '</span></span></a>';
      }).join('');
      bBox.querySelectorAll('[data-board-link]').forEach(function (a) { a.addEventListener('click', function () { forumState.board = a.getAttribute('data-board-link'); forumState.tab = 'home'; forumState.campId = ''; }); });
    } else if (bBox) { bBox.innerHTML = '<p class="muted small">板块加载失败，请稍后重试。</p>'; }
    var fBox = $('#homeFeed');
    var postsR = await api('/forum/posts?limit=6&offset=0', { auth: loggedIn() });
    if (fBox) {
      var posts = postsR.ok ? ((postsR.data && postsR.data.posts) || []) : null;
      fBox.innerHTML = posts === null ? '<p class="err">' + esc(postsR.message || '帖子加载失败，请稍后重试。') + '</p>'
        : (posts.length ? '<div class="feed">' + posts.map(postItemHtml).join('') + '</div>' : '<div class="empty-v2"><div class="ev-ico">' + ico('inbox', 30) + '</div><div class="ev-title">暂无帖子</div><div class="ev-sub">论坛还没有帖子，来发第一帖吧。</div></div>');
      fillAvatars(fBox);
    }
  }

  // ---------- 登录 / 注册 / 找回 / 申诉 ----------
  var stepUp = { token: '' }, completion = { token: '', email: '' };
  function authDeviceBody() { return { deviceHash: deviceId(), deviceName: 'Website', platform: 'website' }; }
  // 封禁申诉入口状态机（2026-10-24 用户定版）：未申诉→「去申诉 >>>>」；审核中→只显示状态；
  // 已驳回且剩余次数 >0→状态＋「再次申请 >>>>」；次数用完→定版文案、无入口；已通过即解封，不再出入口。
  // st = { loaded, appealStatus, remaining }（来自 POST /appeals/status 回包）；未查到状态时按未申诉出入口。
  function appealEntryHtml(st) {
    if (st && st.appealStatus === 'pending') return '<span>申诉状态：审核中</span>';
    if (st && st.appealStatus === 'rejected') {
      if (st.remaining != null && st.remaining <= 0) return '<span>申诉次数已用完，无法再次申诉。</span>';
      return '<span>申诉状态：已驳回</span> <a href="#/appeal/ban">再次申请 &gt;&gt;&gt;&gt;</a>';
    }
    if (st && st.appealStatus === 'approved') return '';
    if (st && st.loaded && !st.appealStatus && st.remaining != null && st.remaining <= 0) return '<span>申诉次数已用完，无法再次申诉。</span>';
    return '<a href="#/appeal/ban">去申诉 &gt;&gt;&gt;&gt;</a>';
  }
  // 登录被拒面与横幅共用：拿刚提交的账密查一次本人申诉状态，把入口换成当前状态形态。
  function refreshBanAppealEntry(creds) {
    if (!creds || !creds.identifier || !creds.password) return;
    api('/appeals/status', { method: 'POST', auth: false, body: { identifier: creds.identifier, password: creds.password } }).then(function (sr) {
      if (!sr.ok || !sr.data) return;
      var st = { loaded: true, appealStatus: sr.data.status || null, remaining: sr.data.remaining };
      var a = document.getElementById('banAppealEntry'); if (a) a.innerHTML = appealEntryHtml(st);
      var b = document.getElementById('banBannerEntry'); if (b) b.innerHTML = appealEntryHtml(st);
    });
  }
  // 已登录态被封禁时，任意带令牌请求都会回 ACCOUNT_BANNED 载荷：统一置顶红字横幅呈现，
  // 免得各页面只把封禁文案当普通报错红字显示、没有申诉入口。
  function showBanBanner(data) {
    var bar = document.getElementById('qfBanBanner');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'qfBanBanner'; bar.className = 'ban-banner'; bar.setAttribute('role', 'alert');
      document.body.appendChild(bar);
      document.body.classList.add('has-ban-banner');
    }
    var until = data && data.bannedUntil ? fmtTs(data.bannedUntil) : '';
    var perm = data && (data.permanent === true || !data.bannedUntil);
    bar.innerHTML = '<span>' + esc(perm ? '该用户已被永久封禁' : '该账户已被封禁，解除时间：' + until) + '</span> <span id="banBannerEntry">' + appealEntryHtml(null) + '</span>';
  }
  function hideBanBanner() {
    var bar = document.getElementById('qfBanBanner');
    if (bar) bar.remove();
    if (document.body) document.body.classList.remove('has-ban-banner');
  }
  // 冻结/封禁分流（照 App 弹窗口径）：冻结给「找回密码」「找回申诉」两条出路；
  // 封禁给「提交封禁申诉」出路（申诉页凭账号+密码核验身份，免登录可达）。
  function authBlockHtml(r) {
    if (r && r.code === 'ACCOUNT_FROZEN') {
      return '<div class="notice"><strong>该账户已被冻结</strong><br>请通过找回密码重置密码，或提交找回申诉，验证通过后即可恢复使用。<br>' +
        '<span class="row" style="margin-top:8px;"><a class="primary" href="#/reset">找回密码</a><a class="ghost" href="#/appeal/recovery">找回申诉</a></span></div>';
    }
    if (r && r.code === 'ACCOUNT_BANNED') {
      var until = r.data && r.data.bannedUntil ? fmtTs(r.data.bannedUntil) : '';
      var perm = r.data && (r.data.permanent === true || !r.data.bannedUntil);
      return '<div class="notice"><strong>' + (perm ? '该用户已被永久封禁' : '该账户已被封禁，解除时间：' + esc(until)) + '</strong> <span id="banAppealEntry">' + appealEntryHtml(null) + '</span>' +
        (r.data && r.data.reason ? '<br>原因：' + esc(r.data.reason) : '') +
        '<br>如需申诉，请提交封禁申诉，审核结果可在申诉状态查询中查看。<br>' +
        '<span class="row" style="margin-top:8px;"><a class="primary" href="#/appeal/ban">提交封禁申诉</a><a class="ghost" href="#/appeal/status">查询申诉状态</a></span></div>';
    }
    if (r && r.code === 'DEVICE_BANNED') {
      return '<div class="notice"><strong>当前设备已被限制使用</strong><br>' + esc(r.message || '') + '<br>如有疑问，请发送邮件至 a718983610@gmail.com 说明情况。</div>';
    }
    return '';
  }
  function pageLogin() {
    if (loggedIn()) { location.hash = '#/home'; return; }
    view.innerHTML =
      '<div class="card"><h2>登录</h2>' +
      '<form class="stack" id="loginForm">' +
      '<label>账户 ID 或邮箱<input name="identifier" autocomplete="username" required></label>' +
      '<label>密码<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<label class="row" style="flex-direction:row;align-items:center;"><input type="checkbox" name="remember" checked style="width:auto;"> 记住此设备</label>' +
      '<div class="err" id="loginErr" role="alert"></div><div id="loginBlock"></div>' +
      '<button class="primary" type="submit">登录</button></form>' +
      '<div id="stepUpBox"></div><div id="completionBox"></div>' +
      '<p class="muted small">使用谷歌账号？请通过下方按钮一键登录（与官网相同）。</p>' +
      '<div id="googleBtnHost"><p class="muted small">谷歌登录组件加载中…</p></div>' +
      '<p class="row wrap" style="margin-top:10px;"><a href="#/reset">忘记密码</a><a href="#/appeal/recovery">邮箱不可用？提交找回申诉</a></p>' +
      '<p class="muted small">尚未注册？<a href="#/register">立即注册</a>（与客户端共用同一账号）。</p></div>';
    $('#loginForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var unlock = lockSubmit(ev.target); if (!unlock) return;
      try {
        var fd = new FormData(ev.target);
        var body = Object.assign({ identifier: String(fd.get('identifier')).trim(), password: String(fd.get('password')) }, authDeviceBody());
        var r = await api('/auth/login', { method: 'POST', auth: false, body: body });
        handleAuthResult(r, !!fd.get('remember'), { identifier: body.identifier, password: body.password });
      } finally { unlock(); }
    });
    initGoogleButton();
  }
  function handleAuthResult(r, remember, creds) {
    var err = $('#loginErr'); var block = $('#loginBlock');
    if (block) block.innerHTML = authBlockHtml(r);
    if (r && r.code === 'ACCOUNT_BANNED') refreshBanAppealEntry(creds);
    if (r.ok && r.data && (r.data.needsStepUp || r.data.stepUpRequired)) {
      stepUp.token = r.data.stepUpToken || ''; if (err) err.textContent = ''; showStepUp(remember); return;
    }
    if (r.ok && r.data && r.data.needsCompletion) { completion.token = r.data.completionToken || ''; completion.email = r.data.email || ''; if (err) err.textContent = ''; showCompletion(remember); return; }
    if (r.ok && r.data && r.data.accessToken) { finishLogin(r.data, remember); return; }
    if (err) err.textContent = authBlockHtml(r) ? '' : (r.message || '登录失败，请稍后重试。');
  }
  async function finishLogin(data, remember) {
    saveSession(data, remember); renderIdentity();
    await syncMyProfile(true); // 回包无 nickname：补拉资料把生效昵称写进会话
    location.hash = '#/home'; render();
  }
  // 谷歌登录：GIS 官方库渲染按钮，凭据回调 POST /auth/google 换令牌（与官网 auth.js 同一流程/client_id）
  // W-22：index.html 已静态引入 GSI；动态注入只许发生一次，反复进出登录页
  // 不再叠加 script 标签，后到者排队等同一次加载结果。
  var gisState = 0, gisWaiters = [];
  function initGoogleButton() {
    function ready() {
      try {
        google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential, locale: 'zh_CN' });
        var host = $('#googleBtnHost'); if (!host) return;
        host.innerHTML = '';
        google.accounts.id.renderButton(host, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'left', width: 320 });
      } catch (e) { googleFallback(); }
    }
    function googleFallback() {
      var host = $('#googleBtnHost'); if (!host) return;
      host.innerHTML = '<p class="err small">谷歌登录组件加载失败，请检查网络后刷新重试，或先使用密码登录。</p>';
    }
    if (window.google && google.accounts && google.accounts.id) return ready();
    if (gisState === 2) return ready(); // 已注入并加载过：直接走 ready（内部自检 google 是否就绪），不再重复注入
    gisWaiters.push({ ready: ready, fallback: googleFallback });
    if (gisState === 1) return; // 已有注入在途，排队等待，不重复注入
    gisState = 1;
    var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    s.onload = function () {
      gisState = 2;
      var w = gisWaiters.splice(0); if (w.length) w[w.length - 1].ready();
    };
    s.onerror = function () {
      gisState = 0;
      var w = gisWaiters.splice(0); if (w.length) w[w.length - 1].fallback();
    };
    document.head.appendChild(s);
  }
  function onGoogleCredential(resp) {
    var err = $('#loginErr');
    if (!resp || !resp.credential) { if (err) err.textContent = '谷歌登录未完成，请重试。'; return; }
    var body = Object.assign({ idToken: resp.credential }, authDeviceBody());
    api('/auth/google', { method: 'POST', auth: false, body: body }).then(function (r) { handleAuthResult(r, true); });
  }
  function showStepUp(remember) {
    var box = $('#stepUpBox'); if (!box) return;
    box.innerHTML = '<div class="card" style="margin-top:12px;"><h3>安全验证</h3><p class="muted">系统检测到本次登录环境异常，已向您的绑定邮箱发送验证码。请输入验证码完成登录。</p>' +
      '<form class="stack" id="stepUpForm"><label>邮箱验证码<input name="code" inputmode="numeric" required></label><div class="err" id="stepUpErr"></div>' +
      '<span class="row"><button class="primary" type="submit">验证并登录</button><button class="ghost" type="button" id="stepUpResend">重新发送验证码</button></span></form></div>';
    $('#stepUpForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var unlock = lockSubmit(ev.target); if (!unlock) return;
      try {
        var code = String(new FormData(ev.target).get('code')).trim();
        var body = Object.assign({ stepUpToken: stepUp.token, code: code }, authDeviceBody());
        var r = await api('/auth/stepup/verify', { method: 'POST', auth: false, body: body });
        if (r.ok && r.data && r.data.accessToken) { stepUp.token = ''; finishLogin(r.data, remember); }
        else { $('#stepUpErr').textContent = r.message || '验证失败，请重新输入。'; var b = $('#loginBlock'); if (b) b.innerHTML = authBlockHtml(r); }
      } finally { unlock(); }
    });
    $('#stepUpResend').addEventListener('click', async function () {
      var btn = this; var errEl = $('#stepUpErr');
      var r = await api('/auth/stepup/resend', { method: 'POST', auth: false, body: { stepUpToken: stepUp.token } });
      if (r.ok) {
        if (errEl) { errEl.className = 'ok'; errEl.textContent = '验证码已重新发送至您的绑定邮箱，请查收。'; }
        armCodeCooldown(btn, 60);
      } else {
        if (errEl) { errEl.className = 'err'; errEl.textContent = r.message || '重新发送失败，请稍后重试。'; }
        if (r.status === 429) armCodeCooldown(btn, 60);
      }
    });
  }
  function showCompletion(remember) {
    var box = $('#completionBox'); if (!box) return;
    box.innerHTML = '<div class="card" style="margin-top:12px;"><h3>完善账号信息</h3><p class="muted">您的邮箱已通过 Google 验证' + (completion.email ? '（' + esc(completion.email) + '）' : '') + '。请设置账户 ID 与密码完成注册；账户 ID 须为 8 位以上、仅含字母与数字，且全网唯一，设置后不可修改。</p>' +
      '<form class="stack" id="compForm"><label>账户 ID<input name="username" required></label><label>设置密码<input name="password" type="password" required></label><label>确认密码<input name="password2" type="password" required></label>' +
      '<div class="err" id="compErr"></div><button class="primary" type="submit">完成并登录</button></form></div>';
    $('#compForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var unlock = lockSubmit(ev.target); if (!unlock) return;
      try {
        var fd = new FormData(ev.target);
        if (String(fd.get('password')) !== String(fd.get('password2'))) { $('#compErr').textContent = '两次输入的密码不一致，请重新输入。'; return; }
        var body = Object.assign({ completionToken: completion.token, username: String(fd.get('username')).trim(), password: String(fd.get('password')) }, authDeviceBody());
        var r = await api('/auth/google/complete', { method: 'POST', auth: false, body: body });
        if (r.ok && r.data && r.data.accessToken) { completion.token = ''; finishLogin(r.data, remember); }
        else if (r.ok && r.data && (r.data.needsStepUp || r.data.stepUpRequired)) { stepUp.token = r.data.stepUpToken || ''; showStepUp(remember); }
        else $('#compErr').textContent = r.message || '设置失败，请检查后重试。';
      } finally { unlock(); }
    });
  }
  // 注册（复用官网五栏口径：账户ID/邮箱/密码/确认密码/邮箱验证码，三步接口 request-code→verify→complete）
  function pageRegister() {
    if (loggedIn()) { location.hash = '#/home'; return; }
    // W-09：票据与签发它的邮箱＋验证码绑定；任一变化即作废重走 verify，
    // 不再拿旧票据顶着新邮箱/新验证码提交。
    var ticket = '', ticketEmail = '', ticketCode = '';
    view.innerHTML = '<div class="card"><h2>注册</h2><p class="muted">在本网站注册的账号与 QFClash 客户端通用，注册后可直接在客户端登录。</p>' +
      '<form class="stack" id="regForm">' +
      '<label>账户 ID<input name="username" autocomplete="username" required><span class="small muted">8 位以上、仅含字母与数字，设置后不可修改。</span></label>' +
      '<label>邮箱<input name="email" type="email" autocomplete="email" required></label>' +
      '<label>密码<input name="password" type="password" autocomplete="new-password" required></label>' +
      '<label>确认密码<input name="password2" type="password" autocomplete="new-password" required></label>' +
      '<label>邮箱验证码<span class="row"><input name="code" inputmode="numeric" required class="grow"><button class="ghost" type="button" id="regSendCode">发送验证码</button></span></label>' +
      '<div class="err" id="regErr" role="alert"></div><div class="ok" id="regOk" role="status"></div>' +
      '<button class="primary" type="submit">注册并登录</button></form>' +
      '<p class="muted small">已有账号？<a href="#/login">前往登录</a></p></div>';
    $('#regSendCode').addEventListener('click', async function () {
      var btn = this;
      var email = String(new FormData($('#regForm')).get('email')).trim();
      var err = $('#regErr'), ok = $('#regOk'); err.textContent = ''; ok.textContent = '';
      if (!email) { err.textContent = '请先填写邮箱。'; return; }
      var r = await api('/auth/register/request-code', { method: 'POST', auth: false, body: { email: email } });
      if (r.ok) { ticket = ''; ok.textContent = '验证码已发送到您的邮箱，请查收后填写。'; armCodeCooldown(btn, 60); }
      else { err.textContent = r.message || '验证码发送失败，请稍后重试。'; if (r.status === 429) armCodeCooldown(btn, 60); }
    });
    $('#regForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var unlock = lockSubmit(ev.target); if (!unlock) return;
      try {
        var fd = new FormData(ev.target);
        var err = $('#regErr'), ok = $('#regOk'); err.textContent = ''; ok.textContent = '';
        if (String(fd.get('password')) !== String(fd.get('password2'))) { err.textContent = '两次输入的密码不一致，请重新输入。'; return; }
        var email = String(fd.get('email')).trim(), code = String(fd.get('code')).trim();
        if (ticket && (ticketEmail !== email || ticketCode !== code)) ticket = '';
        if (!ticket) {
          var vr = await api('/auth/register/verify', { method: 'POST', auth: false, body: { email: email, code: code } });
          if (!vr.ok || !vr.data || !vr.data.ticket) { err.textContent = vr.message || '验证码不正确或已过期，请重新获取。'; return; }
          ticket = vr.data.ticket; ticketEmail = email; ticketCode = code;
        }
        var body = Object.assign({ ticket: ticket, username: String(fd.get('username')).trim(), password: String(fd.get('password')) }, authDeviceBody());
        var r = await api('/auth/register/complete', { method: 'POST', auth: false, body: body });
        if (r.ok && r.data && r.data.accessToken) { finishLogin(r.data, true); return; }
        // 票据已失效/过期时清掉本地票据，下次提交自动重新验证，不必刷新页面。
        if (r.message && r.message.indexOf('验证已经过期') >= 0) ticket = '';
        err.textContent = r.message || '注册失败，请稍后重试。';
      } finally { unlock(); }
    });
  }
  // 忘记密码（邮箱验证码重置；同时是冻结账户的第一条出路）
  function pageReset() {
    view.innerHTML = '<div class="card"><h2>找回密码</h2><p class="muted">请输入绑定邮箱，获取验证码后设置新密码。账户被冻结时，完成重置即可解除冻结。重置成功后，所有设备都需要重新登录。</p>' +
      '<form class="stack" id="resetForm">' +
      '<label>绑定邮箱<input name="email" type="email" autocomplete="email" required></label>' +
      '<label>邮箱验证码<span class="row"><input name="code" inputmode="numeric" required class="grow"><button class="ghost" type="button" id="resetSendCode">发送验证码</button></span></label>' +
      '<label>新密码<input name="newPassword" type="password" autocomplete="new-password" required></label>' +
      '<label>确认新密码<input name="newPassword2" type="password" autocomplete="new-password" required></label>' +
      '<div class="err" id="resetErr" role="alert"></div><div class="ok" id="resetOk" role="status"></div>' +
      '<button class="primary" type="submit">确认重置密码</button></form>' +
      '<p class="row wrap" style="margin-top:10px;"><a href="#/login">返回登录</a><a href="#/appeal/recovery">邮箱不可用？提交人工找回申诉</a></p></div>';
    $('#resetSendCode').addEventListener('click', async function () {
      var btn = this;
      var email = String(new FormData($('#resetForm')).get('email')).trim();
      var err = $('#resetErr'), ok = $('#resetOk'); err.textContent = ''; ok.textContent = '';
      if (!email) { err.textContent = '请先填写邮箱。'; return; }
      var r = await api('/auth/password/reset/request-code', { method: 'POST', auth: false, body: { email: email } });
      if (r.ok) { ok.textContent = '如果这个邮箱有账号，验证码已经发送，请查收。'; armCodeCooldown(btn, 60); }
      else { err.textContent = r.message || '发送失败，请稍后重试。'; if (r.status === 429) armCodeCooldown(btn, 60); }
    });
    $('#resetForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var unlock = lockSubmit(ev.target); if (!unlock) return;
      try {
        var fd = new FormData(ev.target);
        var err = $('#resetErr'), ok = $('#resetOk'); err.textContent = ''; ok.textContent = '';
        if (String(fd.get('newPassword')) !== String(fd.get('newPassword2'))) { err.textContent = '两次输入的新密码不一致，请重新输入。'; return; }
        var r = await api('/auth/password/reset/confirm', { method: 'POST', auth: false, body: { email: String(fd.get('email')).trim(), code: String(fd.get('code')).trim(), newPassword: String(fd.get('newPassword')) } });
        if (r.ok) { ok.textContent = '密码已重置，请使用新密码登录。'; setTimeout(function () { location.hash = '#/login'; }, 900); }
        else err.textContent = r.message || '重置失败，请稍后重试。';
      } finally { unlock(); }
    });
  }
  // 申诉：ban=封禁申诉（POST /appeals，账密核验）；recovery=找回申诉（POST /appeals/recovery）；status=封禁申诉状态（POST /appeals/status）
  function pageAppeal(kind) {
    if (kind === 'status') {
      view.innerHTML = '<div class="card"><h2>申诉状态查询</h2><p class="muted">输入提交申诉时使用的账户 ID 或邮箱与密码，查询最近一次封禁申诉的处理状态。</p>' +
        '<form class="stack" id="apStatusForm"><label>账户 ID 或邮箱<input name="identifier" required></label><label>密码<input name="password" type="password" required></label>' +
        '<div class="err" id="apStatusErr"></div><button class="primary" type="submit">查询</button></form><div id="apStatusOut" style="margin-top:12px;"></div>' +
        '<p style="margin-top:10px;"><a href="#/login">返回登录</a></p></div>';
      $('#apStatusForm').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var unlock = lockSubmit(ev.target); if (!unlock) return;
        try {
          var fd = new FormData(ev.target);
          var r = await api('/appeals/status', { method: 'POST', auth: false, body: { identifier: String(fd.get('identifier')).trim(), password: String(fd.get('password')) } });
          var out = $('#apStatusOut');
          if (!r.ok) { $('#apStatusErr').textContent = r.message || '查询失败，请核对后重试。'; return; }
          $('#apStatusErr').textContent = '';
          var a = r.data && r.data.appeal;
          out.innerHTML = a ? '<table class="kv"><tr><td>申诉状态</td><td>' + esc(zhCode(REVIEW_STATE, a.status, '处理中')) + '</td></tr>' +
            '<tr><td>提交时间</td><td>' + esc(fmtTs(a.createdAt)) + '</td></tr>' +
            (a.reviewedAt ? '<tr><td>审核时间</td><td>' + esc(fmtTs(a.reviewedAt)) + '</td></tr>' : '') +
            (a.reviewNote ? '<tr><td>审核说明</td><td>' + esc(a.reviewNote) + '</td></tr>' : '') + '</table>' +
            (r.data.remaining != null ? '<p class="muted small">本次封禁还可申诉 ' + esc(r.data.remaining) + ' 次。</p>' : '')
            : '<p class="muted">暂未查询到申诉记录。</p>';
        } finally { unlock(); }
      });
      return;
    }
    if (kind === 'recovery') {
      view.innerHTML = '<div class="card"><h2>找回申诉</h2><p class="muted">邮箱无法使用时，可提交人工找回申诉。请尽量准确填写以下信息，审核人员会据此核对账户归属；曾用密码只用于与现有密码比对，不会保存明文。</p>' +
        '<form class="stack" id="recForm"><label>账户 ID 或邮箱<input name="account" required></label>' +
        '<label>曾用密码（可填多个，用换行分隔）<textarea name="oldPasswords" rows="3"></textarea></label>' +
        '<label>曾用设备机型（多个用换行分隔）<textarea name="deviceModels" rows="2"></textarea></label>' +
        '<label>常用登录地点（多个用换行分隔）<textarea name="loginLocations" rows="2"></textarea></label>' +
        '<label>补充说明<textarea name="note" rows="3" maxlength="1000"></textarea></label>' +
        '<div class="err" id="recErr"></div><div class="ok" id="recOk"></div><button class="primary" type="submit">提交找回申诉</button></form>' +
        '<p style="margin-top:10px;"><a href="#/login">返回登录</a></p></div>';
      $('#recForm').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var unlock = lockSubmit(ev.target); if (!unlock) return;
        try {
          var fd = new FormData(ev.target);
          var split = function (v) { return String(v || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
          var r = await api('/appeals/recovery', { method: 'POST', auth: false, body: { account: String(fd.get('account')).trim(), oldPasswords: split(fd.get('oldPasswords')), deviceModels: split(fd.get('deviceModels')), loginLocations: split(fd.get('loginLocations')), note: String(fd.get('note') || '').trim() } });
          if (r.ok) { $('#recErr').textContent = ''; $('#recOk').textContent = '找回申诉已提交，请耐心等待审核。'; }
          else $('#recErr').textContent = r.message || '提交失败，请稍后重试。';
        } finally { unlock(); }
      });
      return;
    }
    view.innerHTML = '<div class="card"><h2>封禁申诉</h2><p class="muted">请输入被封禁账户的账户 ID 或邮箱与密码核验身份，再填写申诉内容。临时封禁与永久封禁的申诉次数有限，请认真填写。</p>' +
      '<form class="stack" id="banAppealForm"><label>账户 ID 或邮箱<input name="identifier" required></label><label>密码<input name="password" type="password" required></label>' +
      '<label>申诉内容<textarea name="content" rows="5" required maxlength="2000"></textarea></label>' +
      '<div class="err" id="banAppealErr"></div><div class="ok" id="banAppealOk"></div><button class="primary" type="submit">提交申诉</button></form>' +
      '<p class="row wrap" style="margin-top:10px;"><a href="#/appeal/status">查询申诉状态</a><a href="#/login">返回登录</a></p></div>';
    $('#banAppealForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var unlock = lockSubmit(ev.target); if (!unlock) return;
      try {
        var fd = new FormData(ev.target);
        var r = await api('/appeals', { method: 'POST', auth: false, body: { identifier: String(fd.get('identifier')).trim(), password: String(fd.get('password')), content: String(fd.get('content')).trim() } });
        if (r.ok) { $('#banAppealErr').textContent = ''; $('#banAppealOk').textContent = '申诉已提交，正在审核中。您可在「查询申诉状态」中查看处理结果。'; }
        else $('#banAppealErr').textContent = r.message || '提交失败，请稍后重试。';
      } finally { unlock(); }
    });
  }

  // ---------- 积分与兑换 ----------
  // 契约：/points/me {balance,...}；/redeem/products {products:[{id,name,pricePoints,fulfillment,stock,stockStatus,requiresReview}]}
  // /redeem/orders POST {productId,idempotencyKey,payoutMethod?,payoutAddress?,payoutEmail?} → {order}
  // /redeem/my {orders:[{id,productName,pricePoints,status,codeAvailable,payoutMethod,createdAt,...}]}
  // 看码双重核验：POST /redeem/orders/:id/code/request（发邮箱验证码）→ POST .../code/reveal {password,emailCode} → {code}
  // 积分流水：/points/ledger {entries:[{id,type,amount,balance_after,platform,note,created_at}]}（服务端原始列名）
  async function pagePoints() {
    if (!loggedIn()) return needLogin('积分');
    view.innerHTML = '<div class="card"><h2>积分</h2><p class="muted">正在加载…</p></div>';
    var me = await api('/points/me');
    if (!me.ok) { view.innerHTML = '<div class="card"><h2>积分</h2><p class="err">' + esc(me.message) + '</p></div>'; return; }
    var d = me.data || {}, balance = d.balance != null ? d.balance : 0;
    var prods = await api('/redeem/products');
    var tiers = prods.ok && prods.data && Array.isArray(prods.data.products) ? prods.data.products : [];
    var next = null;
    tiers.forEach(function (p) { if (p.pricePoints > balance && (!next || p.pricePoints < next.pricePoints)) next = p; });
    var pct = next ? Math.min(100, Math.floor(balance / next.pricePoints * 100)) : 100;
    view.innerHTML =
      '<div class="card"><h2>我的积分</h2><p style="font-size:30px;margin:4px 0;"><strong>' + esc(balance) + '</strong> 分</p>' +
      (next ? '<p class="muted">距「' + esc(next.name) + '」（' + next.pricePoints + ' 分）还差 ' + (next.pricePoints - balance) + ' 分</p><div class="progress"><i style="width:' + pct + '%"></i></div>'
            : '<p class="muted">当前积分已可兑换在售商品，请在下方查看。</p>') +
      '<p class="notice" style="margin-top:12px;">积分获取以客户端有效在线时长为准（每 3 小时 1 分，每日上限 8 分）；论坛每日积分与千赞奖励按官网积分规则计入。网页版仅提供积分查询与兑换服务。</p></div>' +
      '<div class="card"><h2>可兑换商品</h2><div id="tierList">' + (tiers.length ? '' : (prods.ok ? '<p class="muted">暂无在售商品。</p>' : '<p class="err">' + esc(prods.message || '商品加载失败，请稍后重试。') + '</p>')) + '</div><div id="redeemBox"></div></div>' +
      '<div class="card"><h2>我的兑换</h2><div id="myOrders"><p class="muted">正在加载…</p></div></div>' +
      '<div class="card"><h2>积分明细</h2><div id="ledger"><p class="muted">正在加载…</p></div></div>';
    if (tiers.length) {
      $('#tierList').innerHTML = tiers.map(function (p) {
        var stockTxt = p.fulfillment === 'usdt' ? '人工发放' : (p.stockStatus === 'out' || p.stock === 0 ? '暂时缺货' : (p.stock != null ? '库存 ' + p.stock : ''));
        var can = balance >= p.pricePoints && p.stockStatus !== 'out' && p.stock !== 0;
        return '<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);"><span class="grow"><strong>' + esc(p.name || '兑换商品') + '</strong><br><span class="muted small">' + esc(p.pricePoints) + ' 积分' + (p.description ? ' · ' + esc(p.description) : '') + (stockTxt ? ' · ' + esc(stockTxt) : '') + '</span></span>' +
          '<button class="ghost" data-redeem="' + esc(p.id) + '" ' + (can ? '' : 'disabled') + '>兑换</button></div>';
      }).join('');
      $('#tierList').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-redeem]'); if (!b) return;
        var p = tiers.filter(function (x) { return String(x.id) === b.getAttribute('data-redeem'); })[0]; if (!p) return;
        showRedeemConfirm(p, balance);
      });
    }
    loadMyOrders(); loadLedger();
  }
  function showRedeemConfirm(p, balance) {
    var box = $('#redeemBox'); if (!box) return;
    // 幂等键按单生成（W-05）：打开确认框时生成一次，本单（含失败重试）全程
    // 复用同一键；此前每次提交现造新键，双击即成两单、扣两次分。
    var redeemKey = 'web-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
    var needsPayout = p.fulfillment === 'usdt' || p.fulfillment === 'choice';
    box.innerHTML = '<div class="notice" style="margin-top:12px;"><strong>确认兑换</strong><br>商品：' + esc(p.name) + ' · 需 ' + esc(p.pricePoints) + ' 积分（当前余额 ' + esc(balance) + ' 分）' +
      (p.requiresReview ? '<br>该商品兑换后需人工审核，审核通过后发放。' : '') +
      '<form class="stack" id="redeemForm" style="margin-top:10px;">' +
      (p.fulfillment === 'choice' ? '<label>发放方式<select name="payoutMethod"><option value="usdt">USDT（TRC20）</option><option value="giftcard">美区礼品卡（邮件接收）</option></select></label>' : '') +
      (needsPayout ? '<label id="payoutAddrWrap">USDT（TRC20）收款地址<input name="payoutAddress"></label><label id="payoutEmailWrap" style="display:none;">接收礼品卡的邮箱<input name="payoutEmail" type="email"></label>' : '') +
      '<div class="err" id="redeemErr"></div>' +
      '<span class="row"><button class="primary" type="submit">确认兑换</button><button class="ghost" type="button" id="redeemCancel">取消</button></span></form></div>';
    var methodSel = box.querySelector('[name="payoutMethod"]');
    function syncPayout() {
      if (!needsPayout) return;
      var m = methodSel ? methodSel.value : 'usdt';
      $('#payoutAddrWrap').style.display = m === 'usdt' ? '' : 'none';
      $('#payoutEmailWrap').style.display = m === 'giftcard' ? '' : 'none';
    }
    if (methodSel) methodSel.addEventListener('change', syncPayout);
    syncPayout();
    $('#redeemCancel').addEventListener('click', function () { box.innerHTML = ''; });
    $('#redeemForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var unlock = lockSubmit(ev.target); if (!unlock) return;
      try {
        var fd = new FormData(ev.target);
        var body = { productId: p.id, idempotencyKey: redeemKey };
        if (p.fulfillment === 'usdt') { body.payoutMethod = 'usdt'; body.payoutAddress = String(fd.get('payoutAddress') || '').trim(); }
        if (p.fulfillment === 'choice') {
          body.payoutMethod = String(fd.get('payoutMethod'));
          if (body.payoutMethod === 'usdt') body.payoutAddress = String(fd.get('payoutAddress') || '').trim();
          else body.payoutEmail = String(fd.get('payoutEmail') || '').trim();
        }
        // W-19：发放信息前端校验——缺失或格式不对时定位报错、不下单，
        // 不再把无地址订单送进人工审核再驳回退分来回折腾。
        var rErr = $('#redeemErr');
        if (body.payoutMethod === 'usdt') {
          if (!body.payoutAddress) { rErr.textContent = '请填写 USDT（TRC20）收款地址后再确认兑换。'; return; }
          if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(body.payoutAddress)) { rErr.textContent = 'USDT（TRC20）收款地址格式不正确（应为 T 开头的 34 位地址），请核对后重试。'; return; }
        }
        if (body.payoutMethod === 'giftcard') {
          if (!body.payoutEmail) { rErr.textContent = '请填写接收礼品卡的邮箱后再确认兑换。'; return; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.payoutEmail)) { rErr.textContent = '接收礼品卡的邮箱格式不正确，请核对后重试。'; return; }
        }
        var r = await api('/redeem/orders', { method: 'POST', body: body });
        if (r.ok) { box.innerHTML = '<p class="ok" style="margin-top:12px;">兑换已提交' + (p.requiresReview ? '，等待人工审核' : '') + '。您可在「我的兑换」中查看进度。</p>'; loadMyOrders(); }
        else $('#redeemErr').textContent = r.message || '兑换失败，请稍后重试。';
      } finally { unlock(); }
    });
  }
  // 状态/类型码中文映射（W-04）：全站渲染一律走 zhCode，未知英文码不裸上屏，
  // 统一给大白话兜底，原始码只进控制台；已是中文的服务端文本原样保留。
  var POST_STATUS = { published: '已发布', pending: '审核中', rejected: '未通过', deleted: '已删除', hidden: '已隐藏' };
  var REVIEW_STATE = { pending: '审核中', approved: '已通过', rejected: '未通过' };
  var CAMP_STATUS = { active: '已上线', pending: '审核中', rejected: '未通过', closed: '已关闭' };
  var ACCOUNT_STATUS = { active: '正常', banned: '已封禁', frozen: '已冻结', deleting: '注销冷静期中', deleted: '已注销' };
  var BAN_LEVEL = { warn: '警告', timed: '限时封禁', permanent: '永久封禁' };
  var BAN_SOURCE = { admin: '站长操作', owner: '站长操作', auto: '系统自动', system: '系统自动', risk: '风控自动', report: '举报处置', appeal: '申诉处理' };
  var BAN_STATUS = { active: '生效中', lifted: '已解除', expired: '已到期' };
  function zhCode(map, code, fallback) {
    if (code == null || code === '') return fallback;
    if (map && map[code]) return map[code];
    var s = String(code);
    if (/[^\x00-\x7F]/.test(s)) return s;
    if (window.console && console.debug) console.debug('[zhCode] 未映射状态码：', s);
    return fallback;
  }
  var ORDER_STATUS = { pending_review: '待审核', pending_payout: '待发放', paid: '已发放', issued: '已发放', rejected: '未通过', cancelled: '已取消', refunded: '已退分' };
  async function loadMyOrders() {
    var box = $('#myOrders'); if (!box) return;
    var r = await api('/redeem/my?limit=30');
    if (!r.ok) { box.innerHTML = '<p class="err">' + esc(r.message) + '</p>'; return; }
    var orders = (r.data && r.data.orders) || [];
    box.innerHTML = orders.length ? '<div class="list">' + orders.map(function (o) {
      return '<div class="item"><span class="grow"><strong>' + esc(o.productName || '兑换商品') + '</strong><br><span class="muted small">' + esc(o.pricePoints) + ' 积分 · ' + esc(zhCode(ORDER_STATUS, o.status, '处理中')) + ' · ' + esc(fmtTs(o.createdAt)) + '</span></span>' +
        (o.codeAvailable ? '<button class="ghost" data-reveal="' + esc(o.id) + '">查看兑换码</button>' : '') + '</div>';
    }).join('') + '</div><div id="revealBox"></div>' : '<p class="muted">暂无兑换记录。</p>';
    box.querySelectorAll('[data-reveal]').forEach(function (b) { b.addEventListener('click', function () { showRevealForm(b.getAttribute('data-reveal')); }); });
  }
  function showRevealForm(orderId) {
    var box = $('#revealBox'); if (!box) return;
    box.innerHTML = '<div class="notice" style="margin-top:12px;"><strong>查看兑换码（双重核验）</strong><br>第一步：获取发送到账号绑定邮箱的验证码；第二步：输入账户密码与验证码查看。兑换码只显示一次提交结果，请及时保存。' +
      '<form class="stack" id="revealForm" style="margin-top:10px;"><span class="row"><button class="ghost" type="button" id="revealSend">获取邮箱验证码</button><span class="small" id="revealSendSt"></span></span>' +
      '<label>账户密码<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<label>邮箱验证码<input name="emailCode" inputmode="numeric" required></label>' +
      '<div class="err" id="revealErr"></div><div id="revealOut"></div>' +
      '<button class="primary" type="submit">验证并查看兑换码</button></form></div>';
    $('#revealSend').addEventListener('click', async function () {
      var btn = this;
      var r = await api('/redeem/orders/' + encodeURIComponent(orderId) + '/code/request', { method: 'POST', body: {} });
      $('#revealSendSt').textContent = r.ok ? '验证码已发送到账号绑定邮箱。' : (r.message || '发送失败。');
      $('#revealSendSt').className = 'small ' + (r.ok ? 'ok' : 'err');
      // W-20：与全站发码点统一冷却，防连点刷验证码。
      if (r.ok || r.status === 429) armCodeCooldown(btn, 60);
    });
    $('#revealForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var unlock = lockSubmit(ev.target); if (!unlock) return;
      try {
        var fd = new FormData(ev.target);
        var r = await api('/redeem/orders/' + encodeURIComponent(orderId) + '/code/reveal', { method: 'POST', body: { password: String(fd.get('password')), emailCode: String(fd.get('emailCode')).trim() } });
        if (r.ok && r.data && r.data.code) { $('#revealErr').textContent = ''; $('#revealOut').innerHTML = '<p class="notice">兑换码：<strong style="font-size:17px;">' + esc(r.data.code) + '</strong><br><span class="small muted">请及时保存；本页刷新后需重新核验才能再次查看。</span></p>'; }
        else $('#revealErr').textContent = r.message || '核验失败，请重试。';
      } finally { unlock(); }
    });
  }
  var LEDGER_TYPE = { earn: '使用计时', forum_daily: '论坛每日积分', forum_milestone: '千赞奖励', redeem: '兑换支出', refund: '兑换退分', admin: '管理员调整', revoke: '撤销' };
  async function loadLedger() {
    var box = $('#ledger'); if (!box) return;
    var led = await api('/points/ledger?limit=30');
    if (!led.ok) { box.innerHTML = '<p class="err">' + esc(led.message) + '</p>'; return; }
    var rows = (led.data && led.data.entries) || [];
    box.innerHTML = rows.length ? '<table class="kv">' + rows.map(function (x) {
      var amt = Number(x.amount);
      return '<tr><td>' + esc(fmtTs(x.created_at)) + '</td><td>' + esc(x.note || (x.type ? zhCode(LEDGER_TYPE, x.type, '其他') : '')) + '</td><td style="text-align:right;">' + esc(isFinite(amt) ? (amt > 0 ? '+' + amt : amt) : x.amount) + '</td></tr>';
    }).join('') + '</table>' : '<p class="muted">暂无积分记录。</p>';
  }

  // ---------- 论坛 ----------
  // 契约：帖子 postView {id,board,campId,title,content,author:{userId,name},status,replyCount,likeCount,shareCount,viewCount,likedByMe,reward?,createdAt}
  // 论坛主页 /forum/me/forum-home {user,posts,comments,rewardApplications}；分析 /forum/me/analytics {myStats,topTopics,frequentPosts,recommendedPosts,recommendedCamps}
  // 营地 /forum/camps {camps:[campView]}、/forum/camps/:id {camp,posts}、POST /forum/camps/:id/join {joined}
  // 个人主页 /forum/users/:userId/profile {user:{userId,name,joinedAt},stats:{posts,comments},posts,comments}
  // 千赞：帖子详情作者视角带 reward {eligible,state}；申请 POST /forum/posts/:id/reward-applications；我的申请 GET /forum/me/reward-applications
  var forumState = { tab: 'home', board: '', campId: '' };
  // v2 视觉助手：线性 SVG 图标（描边风格）与板块元数据（图标/渐变类/一句文案，
  // 文案为产品文案非数据）；帖子无配图数据，列表封面为「板块封面块」占位。
  var ICO_PATHS = {
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    reply: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
    chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    mega: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    headset: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'
  };
  function ico(name, size) {
    var s = size || 16;
    return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICO_PATHS[name] || '') + '</svg>';
  }
  var BOARD_META = {
    '': { name: '全部板块', sub: '所有板块的最新帖子', ico: 'grid', cls: 'all' },
    general: { name: '综合讨论', sub: '使用技巧与经验交流', ico: 'chat', cls: 'general' },
    help: { name: '使用求助', sub: '遇到问题来这里求助', ico: 'help', cls: 'help' },
    suggestions: { name: '建议与反馈', sub: '提建议、说想法', ico: 'pen', cls: 'suggestions' },
    announcements: { name: '公告', sub: '官方通知与版本动态', ico: 'mega', cls: 'announcements' }
  };
  function boardMeta(key) { return BOARD_META[key] || BOARD_META.general; }
  function boardCardHtml(key, name) {
    var bm = boardMeta(key);
    return '<button type="button" class="board-card' + (forumState.board === key ? ' on' : '') + '" data-board="' + esc(key) + '">' +
      '<span class="bc-ico bc-' + bm.cls + '">' + ico(bm.ico, 23) + '</span>' +
      '<span><span class="bc-name">' + esc(name || bm.name) + '</span><span class="bc-sub">' + esc(bm.sub) + '</span></span></button>';
  }
  function sklCards(n) {
    var one = '<div class="skl-card"><div class="skl-row"><div class="skl" style="width:38px;height:38px;border-radius:50%;"></div><div style="flex:1;"><div class="skl skl-line" style="width:34%;"></div><div class="skl skl-line" style="width:22%;"></div></div></div><div class="skl skl-line" style="width:78%;height:16px;margin-top:14px;"></div><div class="skl skl-line" style="width:92%;"></div><div class="skl skl-line" style="width:46%;"></div></div>';
    var out = ''; for (var i = 0; i < (n || 3); i++) out += one; return out;
  }
  function sklRows(n) {
    var one = '<div class="skl-row" style="padding:9px 0;"><div class="skl" style="width:44px;height:44px;border-radius:50%;flex:0 0 auto;"></div><div style="flex:1;"><div class="skl skl-line" style="width:42%;"></div><div class="skl skl-line" style="width:64%;"></div></div></div>';
    var out = ''; for (var i = 0; i < (n || 3); i++) out += one; return out;
  }
  function forumHeaderHtml() {
    if (!loggedIn()) {
      return '<div class="hero"><div class="hero-in"><div class="hero-kicker">社区 · FORUM</div>' +
        '<div class="hero-title">欢迎来到 QFClash 论坛</div>' +
        '<div class="hero-sub">综合讨论、使用求助、建议与反馈与官方公告都在这里，还可以创建、加入主题社区「营地」。游客可直接浏览，登录后即可发帖、回复与加入营地。</div>' +
        '<div class="hero-cta"><a class="btn-white" href="#/login">登录</a><a class="btn-ghost-w" href="#/register">注册账号</a></div></div></div>';
    }
    var me = meBasic();
    return '<div class="hero"><div class="hero-in"><div class="hero-kicker">社区 · FORUM</div>' +
      '<div class="hero-title">论坛</div>' +
      '<div class="hero-sub">聊使用、提问题、说想法，也可以创建自己的主题营地。</div>' +
      '<div class="hero-user"><span id="forumAvatar"><span class="avatar-ph">' + esc(myDisplayName().slice(0, 1)) + '</span></span>' +
      '<span><span class="hnick">' + esc(myDisplayName()) + ownerBadgeHtml(myUserId()) + '</span><br><span class="huid">账户 ID：' + esc(me.username || '—') + '</span></span></div>' +
      '<div class="hero-cta"><a class="btn-ghost-w" href="#/me">个人资料</a></div></div></div>';
  }
  function forumTabsHtml(active) {
    var tabs = [['home', '首页'], ['mine', '我的帖子'], ['reviews', '我的评价'], ['stats', '数据分析']];
    return '<div class="ftabs" role="tablist">' + tabs.map(function (t) {
      return '<button type="button" data-ftab="' + t[0] + '"' + (active === t[0] ? ' class="on"' : '') + '>' + t[1] + '</button>';
    }).join('') + '</div>';
  }
  function countsHtml(p) {
    return '<span class="muted small">点赞 ' + esc(p.likeCount || 0) + ' · 分享 ' + esc(p.shareCount || 0) + ' · 浏览 ' + esc(p.viewCount || 0) + ' · 回复 ' + esc(p.replyCount || 0) + '</span>';
  }
  function authorName(p) { return nameOrFallback(p.author && p.author.name, p.author && p.author.username); }
  function authorId(p) { return (p.author && p.author.userId) || ''; }
  function postStatusTag(p) {
    if (!p.status || p.status === 'published') return '';
    var label = zhCode(POST_STATUS, p.status, '处理中');
    return ' <span class="tag ' + (p.status === 'pending' ? 'blue' : 'red') + '">' + esc(label) + '</span>';
  }
  function postItemHtml(p, opts) {
    var excerpt = String(p.content || '').replace(/\s+/g, ' ').slice(0, 110);
    var aid = authorId(p), aname = authorName(p);
    var bm = boardMeta(p.board || '');
    var av = aid ? avatarSlotHtml(aid, '', true, aname, 38) : '<span class="avatar-ph" style="width:38px;height:38px;">' + esc(aname.slice(0, 1)) + '</span>';
    var hot = Number(p.likeCount || 0) >= 50 ? '<span class="tag hot">热门</span>' : '';
    var liked = !!p.likedByMe;
    return '<div class="post-row" data-post="' + esc(p.id) + '"><div class="post-main">' +
      '<div class="post-top">' + av + '<span class="post-who"><a class="post-name" href="#/forum/user/' + esc(aid) + '">' + esc(aname) + '</a>' + ownerBadgeHtml(aid, ownerFlagOf(p.author)) +
      '<span class="post-sub">' + esc(relTime(p.createdAt)) + ' · <a class="post-board" href="#/forum" data-card-board="' + esc(p.board || '') + '">' + esc(bm.name) + '</a></span></span>' + hot + '</div>' +
      '<a class="post-title" href="#/forum/post/' + esc(p.id) + '">' + esc(p.title || '(无标题)') + '</a>' + postStatusTag(p) +
      (excerpt ? '<div class="post-excerpt">' + esc(excerpt) + '</div>' : '') +
      '<div class="post-stats">' +
      '<button type="button" class="ps ps-act' + (liked ? ' liked' : '') + '" data-like-btn aria-pressed="' + (liked ? 'true' : 'false') + '" aria-label="点赞">' + ico('heart', 15) + '<span data-like-count>' + esc(p.likeCount || 0) + '</span></button>' +
      '<button type="button" class="ps ps-act" data-cmt-btn aria-label="评论">' + ico('reply', 15) + '<span data-reply-count>' + esc(p.replyCount || 0) + '</span></button>' +
      '<span class="ps">' + ico('eye', 15) + esc(p.viewCount || 0) + '</span>' +
      (opts && opts.mineActions ? '<button type="button" class="ps ps-act" data-delown-btn aria-label="删除" style="color:var(--danger);">删除</button>' : '') + '</div>' +
      '<div class="post-cmtbox" data-cmtbox hidden></div>' +
      '<div class="post-note" data-card-note role="status"></div>' +
      '</div><div class="post-cover bc-' + bm.cls + '" aria-hidden="true">' + ico(bm.ico, 30) + '</div></div>';
  }
  // ---------- 帖子卡交互（ui3）：整卡进详情＋列表内点赞/评论 ----------
  // 事件委托只挂一次（document 级），页面重渲染不丢绑定；卡片由 postItemHtml
  // 渲染（论坛流/首页流/营地帖/个人主页/数据分析共用），带 data-post 标记。
  // 卡内独立元素各自拦截：点赞钮、评论钮、评论区、板块标签、作者头像/昵称、
  // 标题链接与其余 a/button/表单控件保持原行为，不触发整卡跳转。
  function cardNote(card, msg, ok) {
    var n = card.querySelector('[data-card-note]');
    if (!n) return;
    n.textContent = msg || '';
    n.className = 'post-note ' + (ok ? 'ok' : 'err');
  }
  // 作者本人删帖（「我的帖子」卡片）：站内确认弹窗 → POST /forum/posts/:id/delete（仅作者，服务端校验）
  async function deleteOwnCardPost(card) {
    var id = card.getAttribute('data-post');
    if (!await appConfirmDlg('删除帖子', '确定删除这篇帖子吗？删除后帖子不可见，此操作不可恢复。', true)) return;
    var rr = await api('/forum/posts/' + encodeURIComponent(id) + '/delete', { method: 'POST', body: {} });
    if (rr.ok) { appToast('帖子已删除。'); pageForum(route()); }
    else cardNote(card, rr.message || '删除失败，请稍后重试。', false);
  }
  async function toggleCardLike(card, btn) {
    if (!loggedIn()) { location.hash = '#/login'; return; }
    if (btn.disabled) return;
    var cnt = btn.querySelector('[data-like-count]');
    var was = btn.classList.contains('liked');
    var prev = cnt ? parseInt(cnt.textContent, 10) : NaN;
    if (!isFinite(prev)) prev = 0;
    // 乐观更新；失败按服务端回包前状态回滚
    btn.disabled = true;
    btn.classList.toggle('liked', !was);
    btn.setAttribute('aria-pressed', String(!was));
    if (cnt) cnt.textContent = String(Math.max(0, prev + (was ? -1 : 1)));
    var rr = await api('/forum/posts/' + encodeURIComponent(card.getAttribute('data-post')) + '/like', { method: 'POST', body: { liked: !was } });
    btn.disabled = false;
    if (rr.ok && rr.data) {
      if (typeof rr.data.likeCount === 'number' && cnt) cnt.textContent = String(rr.data.likeCount);
      if (typeof rr.data.liked === 'boolean') { btn.classList.toggle('liked', rr.data.liked); btn.setAttribute('aria-pressed', String(rr.data.liked)); }
      cardNote(card, '', true);
    } else {
      btn.classList.toggle('liked', was);
      btn.setAttribute('aria-pressed', String(was));
      if (cnt) cnt.textContent = String(prev);
      cardNote(card, rr.message || '点赞失败，请稍后重试。', false);
    }
  }
  function toggleCardComment(card) {
    var box = card.querySelector('[data-cmtbox]');
    if (!box) return;
    if (!box.getAttribute('data-built')) {
      box.setAttribute('data-built', '1');
      if (loggedIn()) {
        box.innerHTML = '<form class="cmt-form" data-cmt-form>' +
          '<textarea rows="2" maxlength="2000" placeholder="写下你的评论…" aria-label="评论内容"></textarea>' +
          '<div class="cmt-bar"><span class="muted small grow">评论将公开展示，请友善发言。</span>' +
          '<button class="ghost" type="button" data-cmt-cancel>收起</button>' +
          '<button class="primary" type="submit">发送评论</button></div>' +
          '<div class="err small" data-cmt-err role="alert"></div></form>';
      } else {
        box.innerHTML = '<p class="muted small" style="margin:2px 0;">登录后即可评论。<a href="#/login">去登录</a></p>';
      }
    }
    box.hidden = !box.hidden;
    if (!box.hidden) { var ta = box.querySelector('textarea'); if (ta) ta.focus(); }
  }
  async function submitCardComment(card) {
    var box = card.querySelector('[data-cmtbox]');
    var form = box ? box.querySelector('[data-cmt-form]') : null;
    if (!form) return;
    var ta = form.querySelector('textarea');
    var err = form.querySelector('[data-cmt-err]');
    var content = String(ta.value || '').trim();
    if (!content) { err.textContent = '请先写下评论内容。'; ta.focus(); return; }
    var sendBtn = form.querySelector('button[type="submit"]');
    if (sendBtn.disabled) return;
    sendBtn.disabled = true; sendBtn.textContent = '发送中…';
    var rr = await api('/forum/posts/' + encodeURIComponent(card.getAttribute('data-post')) + '/replies', { method: 'POST', body: { content: content } });
    sendBtn.disabled = false; sendBtn.textContent = '发送评论';
    if (!rr.ok) { err.textContent = rr.message || '评论失败，请稍后重试。'; return; }
    var d = rr.data || {};
    if (d.status === 'rejected') { err.textContent = d.message || '评论未通过审核，请修改后重新发布。'; return; }
    ta.value = ''; err.textContent = '';
    box.hidden = true;
    // 列表回复数只统计已发布评论：pending 待审先不计数（与服务端回包口径一致）
    if (d.status === 'published' || !d.status) {
      var rc = card.querySelector('[data-reply-count]');
      if (rc) { var n = parseInt(rc.textContent, 10); rc.textContent = String((isFinite(n) ? n : 0) + 1); }
    }
    cardNote(card, d.message || '评论已发表。', true);
  }
  var postCardsBound = false;
  function bindPostCards() {
    if (postCardsBound) return;
    postCardsBound = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      // 外站精选卡：整卡打开原文（站内无点赞/评论接口）；标题链接自身行为不拦截
      var ext = t.closest('.post-row[data-ext]');
      if (ext) {
        if (!t.closest('a, button, input, textarea, select, label')) {
          window.open(ext.getAttribute('data-ext'), '_blank', 'noopener');
        }
        return;
      }
      var card = t.closest('.post-row[data-post]');
      if (!card) return;
      var box = t.closest('[data-cmtbox]');
      if (box && card.contains(box)) {
        if (t.closest('[data-cmt-cancel]')) box.hidden = true;
        return; // 评论区内点击一律不进详情
      }
      var likeBtn = t.closest('[data-like-btn]');
      if (likeBtn && card.contains(likeBtn)) { toggleCardLike(card, likeBtn); return; }
      var cmtBtn = t.closest('[data-cmt-btn]');
      if (cmtBtn && card.contains(cmtBtn)) { toggleCardComment(card); return; }
      var delOwnBtn = t.closest('[data-delown-btn]');
      if (delOwnBtn && card.contains(delOwnBtn)) { deleteOwnCardPost(card); return; }
      var boardLink = t.closest('[data-card-board]');
      if (boardLink && card.contains(boardLink)) {
        e.preventDefault();
        forumState.board = boardLink.getAttribute('data-card-board') || '';
        forumState.tab = 'home'; forumState.campId = '';
        var r = route();
        if (r.name === 'forum' && !r.arg) pageForum(r); else location.hash = '#/forum';
        return;
      }
      var av = t.closest('[data-avatar-uid]');
      if (av && card.contains(av)) { location.hash = '#/forum/user/' + encodeURIComponent(av.getAttribute('data-avatar-uid')); return; }
      if (t.closest('a, button, input, textarea, select, label, form')) return;
      location.hash = '#/forum/post/' + encodeURIComponent(card.getAttribute('data-post'));
    });
    document.addEventListener('submit', function (e) {
      var form = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-cmt-form]') : null;
      if (!form) return;
      e.preventDefault();
      var card = form.closest('.post-row[data-post]');
      if (card) submitCardComment(card);
    });
  }
  // ---------- ui5（C 版）：营地头像位 / 热门行 / 资讯流条目 / 营地榜单页 ----------
  // 营地头像走服务端 GET /forum/camps/:id/avatar（迁移 0043）：camp.avatarUrl
  // 是带 ?v= 版本戳的路径，与用户头像同一套 showAvatar 取图（blob URL）通道。
  var CAMP_GLYPH_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed'];
  function campGlyphColor(c) {
    var s = String((c && c.name) || '营'), n = 0;
    for (var i = 0; i < s.length; i++) n += s.charCodeAt(i);
    return CAMP_GLYPH_COLORS[n % CAMP_GLYPH_COLORS.length];
  }
  function campAvatarSlotHtml(c, size) {
    var ph = '<span class="camp-av-ph" style="width:' + size + 'px;height:' + size + 'px;background:' + campGlyphColor(c) + ';font-size:' + Math.max(10, Math.round(size * 0.45)) + 'px;">' + esc(((c && c.name) || '营').slice(0, 1)) + '</span>';
    if (!c || !c.avatarUrl) return ph;
    var q = String(c.avatarUrl).split('?');
    var ver = '';
    if (q[1]) q[1].split('&').forEach(function (kv) { var p = kv.split('='); if (p[0] === 'v') ver = p[1]; });
    return '<span data-campav-path="' + esc(q[0]) + '" data-campav-ver="' + esc(ver) + '" data-campav-size="' + size + '">' + ph + '</span>';
  }
  function fillCampAvatars(root) {
    (root || document).querySelectorAll('[data-campav-path]').forEach(function (slot) {
      showAvatar(slot, slot.getAttribute('data-campav-path'), slot.getAttribute('data-campav-ver') || '', Number(slot.getAttribute('data-campav-size')) || 26);
    });
  }
  // 热门营地行（首页展开区与榜单共用四要素：头像＋名字＋成员数＋帖子数）
  function campHotLineHtml(c, rank) {
    return '<div class="hot-line"><span class="rk' + (rank > 3 ? ' dim' : '') + '">' + rank + '</span>' +
      campAvatarSlotHtml(c, 24) +
      '<a class="nm" href="#/forum/camp/' + esc(c.id) + '">' + esc(c.name) + '</a>' +
      '<span class="mt">成员 ' + esc(c.memberCount || 0) + ' · 帖子 ' + esc(c.postCount || 0) + '</span></div>';
  }
  var EXT_PLATFORM_NAMES = { github: 'GitHub', v2ex: 'V2EX', juejin: '掘金', sspai: '少数派', hackernews: 'Hacker News', devto: 'DEV', telegram: 'Telegram', lobsters: 'Lobsters', nodeseek: 'NodeSeek' };
  // 资讯流·论坛帖条目：沿用 ui3 卡片钩子（data-post / data-like-btn /
  // data-cmt-btn / data-cmtbox / data-card-board / data-avatar-uid /
  // data-card-note），整卡点击与列表内点赞/评论行为与旧帖子卡完全一致。
  function feedPostHtml(p, pinned) {
    var excerpt = String(p.content || '').replace(/\s+/g, ' ').slice(0, 110);
    var aid = authorId(p), aname = authorName(p);
    var bm = boardMeta(p.board || '');
    var av = aid ? avatarSlotHtml(aid, '', true, aname, 20) : '<span class="avatar-ph" style="width:20px;height:20px;font-size:10px;">' + esc(aname.slice(0, 1)) + '</span>';
    var liked = !!p.likedByMe;
    var tags = (pinned ? '<span class="ctag pin">置顶</span>' : '') + '<span class="ctag frm">论坛 · ' + esc(bm.name) + '</span>' +
      (Number(p.likeCount || 0) >= 50 ? '<span class="ctag pin">热门</span>' : '');
    return '<div class="post-row cit" data-post="' + esc(p.id) + '"><div class="post-main">' +
      '<div class="cit-tags">' + tags + postStatusTag(p) + '</div>' +
      '<a class="cit-ti" href="#/forum/post/' + esc(p.id) + '">' + esc(p.title || '(无标题)') + '</a>' +
      (excerpt ? '<div class="cit-ex">' + esc(excerpt) + '</div>' : '') +
      '<div class="cit-au">' + av + '<a class="cit-an" href="#/forum/user/' + esc(aid) + '">' + esc(aname) + '</a>' + ownerBadgeHtml(aid, ownerFlagOf(p.author)) + '<span class="faint">' + esc(relTime(p.createdAt)) + '</span>' +
      '<a class="cit-board" href="#/forum" data-card-board="' + esc(p.board || '') + '">' + esc(bm.name) + '</a></div>' +
      '<div class="cit-mt">' +
      '<button type="button" class="ps ps-act' + (liked ? ' liked' : '') + '" data-like-btn aria-pressed="' + (liked ? 'true' : 'false') + '" aria-label="点赞">' + ico('heart', 13) + '<span data-like-count>' + esc(p.likeCount || 0) + '</span></button>' +
      '<button type="button" class="ps ps-act" data-cmt-btn aria-label="评论">' + ico('reply', 13) + '<span data-reply-count>' + esc(p.replyCount || 0) + '</span></button>' +
      '<span class="ps">' + ico('eye', 13) + esc(p.viewCount || 0) + '</span></div>' +
      '<div class="post-cmtbox" data-cmtbox hidden></div>' +
      '<div class="post-note" data-card-note role="status"></div>' +
      '</div></div>';
  }
  // 资讯流·外站精选条目：data-ext 沿用 ui3 委托（整卡开原文，标题链接自理）
  function feedExtHtml(x) {
    var src = EXT_PLATFORM_NAMES[x.platform] || x.platform || '外部平台';
    var url = x.url || '#';
    var when = x.published_at || x.released_at;
    return '<div class="post-row cit" data-ext="' + esc(url) + '"><div class="post-main">' +
      '<div class="cit-tags"><span class="ctag ext">精选 · ' + esc(src) + '</span></div>' +
      '<a class="cit-ti" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title || '(无标题)') + '</a>' +
      (x.summary ? '<div class="cit-ex">' + esc(x.summary) + '</div>' : '') +
      '<div class="cit-mt"><span class="ps">' + esc(x.author_name || '原作者') + '</span>' + (when ? '<span class="ps">' + esc(relTime(when)) + '</span>' : '') + '<span class="ps">查看原文 ›</span></div>' +
      '</div></div>';
  }
  // 热门营地榜单页（#/forum/camps）：个人营地按服务端热度序完整列出（服务
  // 端 listCamps 排序口径＝成员/帖子/活跃综合，前端不重排、顺序可解释），每
  // 行四要素（头像/名字/成员数/帖子数）＋加入钮，与首页展开区口径一致。
  async function forumCampsRankPage() {
    view.innerHTML = '<div class="card"><p style="margin-top:0;"><a href="#/forum">← 返回论坛</a></p><h2 style="margin-bottom:4px;">热门营地榜</h2><p class="muted small" style="margin:0 0 6px;">按热度从高到低排列（成员数、帖子数与活跃度综合）。</p><div id="campRankBox">' + sklRows(4) + '</div></div>';
    var r = await api('/forum/camps', { auth: loggedIn() });
    var box = $('#campRankBox'); if (!box) return;
    if (!r.ok) { box.innerHTML = '<p class="err">' + esc(r.message || '榜单加载失败，请稍后重试。') + '</p>'; return; }
    var camps = ((r.data && r.data.camps) || []).filter(function (c) { return c.creator && c.creator.userId != null; });
    if (!camps.length) { box.innerHTML = '<p class="empty">暂无个人营地。</p>'; return; }
    box.innerHTML = '<div class="rank-list">' + camps.map(function (c, i) {
      return '<div class="rank-row"><span class="rk' + (i >= 3 ? ' dim' : '') + '">' + (i + 1) + '</span>' + campAvatarSlotHtml(c, 34) +
        '<span class="rank-main"><a class="rank-name" href="#/forum/camp/' + esc(c.id) + '">' + esc(c.name) + '</a>' +
        '<span class="rank-meta">成员 ' + esc(c.memberCount || 0) + ' · 帖子 ' + esc(c.postCount || 0) + (c.creator && c.creator.displayName ? ' · ' + esc(c.creator.displayName) + ownerBadgeHtml(c.creator.userId, ownerFlagOf(c.creator)) + ' 创建' : '') + '</span></span>' +
        (loggedIn() ? '<button class="ghost rank-join" data-joincamp="' + esc(c.id) + '" data-joined="' + (c.joined ? '1' : '') + '" type="button">' + (c.joined ? '已加入' : '加入') + '</button>' : '') + '</div>';
    }).join('') + '</div>';
    fillCampAvatars(box);
    box.querySelectorAll('[data-joincamp]').forEach(function (b) { b.addEventListener('click', async function () {
      var joined = b.getAttribute('data-joined') === '1';
      var rr = await api('/forum/camps/' + encodeURIComponent(b.getAttribute('data-joincamp')) + '/join', { method: 'POST', body: { joined: !joined } });
      if (rr.ok) forumCampsRankPage(); else appToast(rr.message || '操作失败，请稍后重试。');
    }); });
  }
  async function pageForum(r) {
    if (r.arg === 'camps') return forumCampsRankPage();
    if (r.arg === 'user' && r.sub) return forumUserPage(r.sub);
    if (r.arg === 'post' && r.sub) return forumPostPage(r.sub);
    if (r.arg === 'camp' && r.sub) return forumCampPage(r.sub);
    view.innerHTML = forumHeaderHtml() + forumTabsHtml(forumState.tab) + '<div id="forumBody">' + sklCards(3) + '</div>';
    if (loggedIn()) showAvatar($('#forumAvatar'), '/profile/avatar', myAvatarVer, 48);
    view.querySelectorAll('[data-ftab]').forEach(function (b) { b.addEventListener('click', function () { forumState.tab = b.getAttribute('data-ftab'); pageForum(route()); }); });
    var body = $('#forumBody'); if (!body) return;
    if (forumState.tab === 'mine' || forumState.tab === 'reviews') {
      if (!loggedIn()) { body.innerHTML = '<div class="card"><p class="muted">登录后即可查看' + (forumState.tab === 'mine' ? '我的帖子' : '我的评价') + '。</p></div>'; return; }
      var home = await api('/forum/me/forum-home?limit=30');
      if (!home.ok) { body.innerHTML = '<div class="card"><p class="err">' + esc(home.message) + '</p></div>'; return; }
      var hd = home.data || {};
      if (forumState.tab === 'mine') {
        var apps = hd.rewardApplications || [];
        body.innerHTML = '<div class="card"><h2>我的帖子</h2><div class="list">' + ((hd.posts || []).length ? hd.posts.map(function (p) { return postItemHtml(p, { mineActions: true }); }).join('') : '<p class="muted">暂无帖子。</p>') + '</div></div>' +
          '<div class="card"><h2>千赞奖励申请</h2>' + (apps.length ? '<div class="list">' + apps.map(function (a) {
            return '<div class="item"><span class="grow"><strong>' + esc(a.postTitle || ('帖子 #' + a.postId)) + '</strong><br><span class="muted small">申请时获赞 ' + esc(a.likeCountAtApply) + ' · 状态：' + esc(zhCode(REVIEW_STATE, a.state, '处理中')) + ' · ' + esc(fmtTs(a.createdAt)) + (a.rejectReason ? ' · ' + esc(a.rejectReason) : '') + '</span></span></div>';
          }).join('') + '</div>' : '<p class="muted">暂无申请。帖子获赞达到 1000 后，可在帖子详情页提交千赞奖励申请。</p>') + '</div>';
      } else {
        body.innerHTML = '<div class="card"><h2>我的评价</h2><div class="list">' + ((hd.comments || []).length ? hd.comments.map(function (c) {
          return '<div class="item"><span class="grow"><a href="#/forum/post/' + esc(c.postId) + '"><strong>' + esc(c.postTitle || '帖子') + '</strong></a>' + (c.status && c.status !== 'published' ? ' <span class="chip">' + esc(zhCode(POST_STATUS, c.status, '处理中')) + '</span>' : '') + '<br><span class="muted">' + esc(c.content) + '</span><br><span class="muted small">' + esc(fmtTs(c.createdAt)) + '</span></span></div>';
        }).join('') : '<p class="muted">暂无评价。</p>') + '</div></div>';
      }
      fillAvatars(body);
      return;
    }
    if (forumState.tab === 'stats') {
      if (!loggedIn()) { body.innerHTML = '<div class="card"><p class="muted">登录后即可查看数据分析。</p></div>'; return; }
      var an = await api('/forum/me/analytics');
      if (!an.ok) { body.innerHTML = '<div class="card"><p class="err">' + esc(an.message) + '</p></div>'; return; }
      var ad = an.data || {}, ms = ad.myStats || {};
      body.innerHTML = '<div class="card"><h2>数据分析</h2><div class="stat-grid">' +
        [['发帖数', ms.posts || 0], ['评价数', ms.comments || 0], ['获赞数', ms.likesReceived || 0], ['总浏览', ms.viewsReceived || 0]].map(function (s) { return '<div class="stat-cell"><div class="lbl">' + s[0] + '</div><div class="num">' + esc(s[1]) + '</div></div>'; }).join('') +
        '</div></div>' +
        '<div class="card"><h2>我常关注的主题</h2>' + ((ad.topTopics || []).length ? '<div class="list">' + ad.topTopics.map(function (t) { return '<div class="item"><span class="grow"><strong>' + esc(t.name) + '</strong><br><span class="muted small">' + (t.type === 'camp' ? '营地' : '板块') + ' · 浏览 ' + esc(t.views) + ' · 评价 ' + esc(t.comments) + '</span></span></div>'; }).join('') + '</div>' : '<p class="muted">暂无足够数据。</p>') + '</div>' +
        '<div class="card"><h2>我常看的帖子</h2><div class="list">' + ((ad.frequentPosts || []).length ? ad.frequentPosts.map(postItemHtml).join('') : '<p class="muted">暂无记录。</p>') + '</div></div>' +
        '<div class="card"><h2>为你推荐</h2><div class="list">' + ((ad.recommendedPosts || []).length ? ad.recommendedPosts.map(postItemHtml).join('') : '<p class="muted">暂无推荐。</p>') + '</div></div>' +
        '<div class="card"><h2>推荐营地</h2><div class="list">' + ((ad.recommendedCamps || []).length ? ad.recommendedCamps.map(function (c) { return '<div class="item"><span class="grow"><a href="#/forum/camp/' + esc(c.id) + '"><strong>' + esc(c.name) + '</strong></a><br><span class="muted small">' + esc(c.description || '') + (c.joined ? ' · 已加入' : '') + '</span></span></div>'; }).join('') : '<p class="muted">暂无推荐。</p>') + '</div></div>';
      fillAvatars(body);
      return;
    }
    // 首页（ui5 · C 版极简资讯型，mockup-C 定版）：官方社区横滑块置外层、
    // 个人营地收进可展开区（热门前 5＋「全部」榜单页）、外站精选与论坛帖子
    // 合并为一条资讯流（来源标签区分），近无阴影、字阶克制。
    var boardsR = await api('/forum/boards', { auth: false });
    var boards = boardsR.ok ? ((boardsR.data && boardsR.data.boards) || []) : [];
    var campsR = await api('/forum/camps', { auth: loggedIn() });
    var camps = campsR.ok ? ((campsR.data && campsR.data.camps) || []) : [];
    var officialCamps = camps.filter(function (c) { return !(c.creator && c.creator.userId != null); });
    var personalCamps = camps.filter(function (c) { return c.creator && c.creator.userId != null; });
    var extR = await api('/forum/external?limit=10', { auth: false });
    var extItems = extR.ok ? ((extR.data && extR.data.posts) || []) : [];
    var postsUrl = '/forum/posts?limit=20&offset=0' + (forumState.board ? '&board=' + encodeURIComponent(forumState.board) : '') + (forumState.campId ? '&campId=' + encodeURIComponent(forumState.campId) : '');
    var postsR = await api(postsUrl, { auth: loggedIn() });
    var posts = postsR.ok ? ((postsR.data && postsR.data.posts) || []) : null;
    // 资讯流合并：公告帖置顶（「置顶」标签，最多 2 条），其余帖子与外站精选
    // 按各自时间倒序交织；按板块/营地筛选时不混精选、不置顶（口径单一）。
    var feedHtml = '';
    if (posts === null) {
      feedHtml = '<p class="err" style="padding:14px 0;">' + esc(postsR.message) + '</p>';
    } else {
      var filtering = !!(forumState.board || forumState.campId);
      var pinned = [], restPosts = [];
      posts.forEach(function (p) { if (!filtering && p.board === 'announcements' && pinned.length < 2) pinned.push(p); else restPosts.push(p); });
      var merged = restPosts.map(function (p) { return { t: Number(p.createdAt || 0), html: feedPostHtml(p, false) }; });
      if (!filtering) extItems.forEach(function (x) { merged.push({ t: Number(x.published_at || x.released_at || 0), html: feedExtHtml(x) }); });
      merged.sort(function (a, b) { return b.t - a.t; });
      feedHtml = pinned.map(function (p) { return feedPostHtml(p, true); }).join('') + merged.map(function (m) { return m.html; }).join('');
      if (!feedHtml) feedHtml = '<div class="empty-v2"><div class="ev-ico">' + ico('inbox', 30) + '</div><div class="ev-title">暂无内容</div><div class="ev-sub">这里还没有帖子，来发第一帖吧。</div></div>';
    }
    var railHtml = officialCamps.length ? officialCamps.map(function (c, i) {
      return '<a class="cchip" href="#/forum/camp/' + esc(c.id) + '"><span class="gly g' + (i % 5 + 1) + '">' + esc((c.name || '社').slice(0, 1)) + '</span><span class="nm">' + esc(c.name) + '</span><span class="mt">成员 ' + esc(c.memberCount || 0) + ' · 帖子 ' + esc(c.postCount || 0) + '</span></a>';
    }).join('') : '<p class="muted small" style="padding:2px;">暂无官方社区。</p>';
    var hotHtml = personalCamps.slice(0, 5).map(function (c, i) { return campHotLineHtml(c, i + 1); }).join('');
    body.innerHTML =
      '<section class="csec"><div class="csec-head"><h2>官方社区</h2><button type="button" class="csec-more" id="howToBtn" aria-expanded="false">使用方法 ›</button></div>' +
      '<div class="crail">' + railHtml + '</div><div id="howToBox"></div></section>' +
      '<section class="csec"><div class="csec-head"><h2>热门营地</h2><a class="csec-more" href="#/forum/camps">全部 ›</a></div>' +
      '<div class="cfold"><button type="button" class="cfold-head" id="campFoldHead" aria-expanded="false"><b>全部营地</b><span class="cfold-n">共 ' + personalCamps.length + ' 个 · 创建需自动审核</span><span class="cfold-chev" id="campFoldChev">展开 ⌄</span></button>' +
      '<div id="campFoldBody" hidden>' + (hotHtml || '<p class="muted small" style="padding:12px 14px;">暂无个人营地。</p>') +
      '<div class="hot-line" style="justify-content:center;"><a href="#/forum/camps">查看全部营地 ›</a></div></div></div>' +
      '<div id="campFormBox"></div>' +
      '<div class="camp-actions">' + (loggedIn() ? '<button class="ghost" id="createCampBtn" type="button">创建营地</button>' : '<a class="ghost" href="#/login">登录后创建营地</a>') + '</div>' +
      (loggedIn() ? '<div class="my-camps"><h3>我创建的营地</h3><div id="myCampsBox"><p class="muted small">正在加载…</p></div></div>' : '') + '</section>' +
      '<section class="csec"><div class="csec-head"><h2>资讯流</h2><span class="csec-note">精选与论坛帖子合并</span></div>' +
      '<div class="ctabs" role="tablist"><button type="button" data-btab=""' + (forumState.board === '' && !forumState.campId ? ' class="on"' : '') + '>推荐</button>' +
      boards.map(function (b) { var k = b.key || b.id; return '<button type="button" data-btab="' + esc(k) + '"' + (forumState.board === k ? ' class="on"' : '') + '>' + esc(b.name || b.title || k) + '</button>'; }).join('') + '</div>' +
      (boardsR.ok ? '' : '<p class="err small" style="margin:8px 2px 0;">' + esc(boardsR.message || '板块加载失败，请稍后重试。') + '</p>') +
      (forumState.campId ? '<p class="muted small" style="margin:8px 2px 0;">当前按营地筛选帖子。<button type="button" class="chip" id="clearCampFilter">清除营地筛选</button></p>' : '') +
      '<div class="row" style="margin:10px 2px 8px;">' + (loggedIn() ? '<button class="primary" id="newPostBtn" type="button">发布帖子</button>' : '<a class="primary" href="#/login">登录后发帖</a>') + '</div>' +
      '<div class="cfeed" id="postFeed">' + feedHtml + '</div>' +
      ((posts && posts.length >= 20) ? '<div class="load-more-wrap"><button class="ghost" id="morePostsBtn" type="button">加载更多</button></div>' : '') +
      '<div id="composeBox"></div></section>' +
      (loggedIn() ? '<button class="fab" id="fabPost" type="button" aria-label="发布帖子"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>发帖</button>' : '');
    fillAvatars(body);
    fillCampAvatars(body);
    loadMyCamps();
    var ccb = $('#createCampBtn');
    if (ccb) ccb.addEventListener('click', function () { showCampForm(null); });
    var htb = $('#howToBtn');
    if (htb) htb.addEventListener('click', function () {
      var box = $('#howToBox'); if (!box) return;
      var open = htb.getAttribute('aria-expanded') === 'true';
      htb.setAttribute('aria-expanded', String(!open));
      box.innerHTML = open ? '' : '<div class="howto"><strong>使用方法</strong><ul>' +
        '<li>游客可以直接浏览帖子与精选内容；登录后可以发帖、回复、点赞，也可以创建或加入营地。</li>' +
        '<li>「营地」是围绕主题的小社区：官方社区由平台维护；个人营地由用户创建，创建时先经自动审核，通过后上线。</li>' +
        '<li>营地创建者可以修改自己营地的名称、简介与头像，修改内容同样会经过审核后才生效。</li>' +
        '<li>热门营地按成员数、帖子数与活跃度综合排序；点「全部」可查看完整榜单。</li>' +
        '<li>发帖、回复与营地内容都会经过审核，违规内容将被驳回并显示原因大类。</li></ul></div>';
    });
    var cfh = $('#campFoldHead');
    if (cfh) cfh.addEventListener('click', function () {
      var fb = $('#campFoldBody'); if (!fb) return;
      var open = cfh.getAttribute('aria-expanded') === 'true';
      cfh.setAttribute('aria-expanded', String(!open));
      fb.hidden = open;
      var chev = $('#campFoldChev'); if (chev) chev.textContent = open ? '展开 ⌄' : '收起 ⌃';
    });
    body.querySelectorAll('[data-btab]').forEach(function (b) { b.addEventListener('click', function () { forumState.board = b.getAttribute('data-btab'); forumState.campId = ''; pageForum(route()); }); });
    var ccf = $('#clearCampFilter'); if (ccf) ccf.addEventListener('click', function () { forumState.campId = ''; pageForum(route()); });
    var np = $('#newPostBtn');
    if (np) np.addEventListener('click', function () {
      $('#composeBox').innerHTML = '<form class="stack" id="postForm" style="margin-top:10px;max-width:100%;"><label>板块<select name="board">' +
        boards.map(function (b) { return '<option value="' + esc(b.key || b.id) + '">' + esc(b.name || b.title || b.key) + '</option>'; }).join('') + '</select></label>' +
        '<label>营地（可选）<select name="campId"><option value="">不指定营地</option>' + camps.filter(function (c) { return c.joined; }).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
        '<label>标题<input name="title" required maxlength="80"></label><label>正文<textarea name="content" rows="5" required></textarea></label>' +
        '<div class="err" id="postErr"></div><span class="muted small">帖子发布后将进入审核，审核通过后公开显示。</span><button class="primary" type="submit">提交发布</button></form>';
      $('#postForm').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var unlock = lockSubmit(ev.target); if (!unlock) return;
        try {
          var fd = new FormData(ev.target);
          var bodyObj = { board: String(fd.get('board')), title: String(fd.get('title')).trim(), content: String(fd.get('content')).trim() };
          var campVal = String(fd.get('campId') || ''); if (campVal) bodyObj.campId = Number(campVal);
          var rr = await api('/forum/posts', { method: 'POST', body: bodyObj });
          if (rr.ok) { forumState.tab = 'home'; pageForum(route()); } else $('#postErr').textContent = rr.message || '发布失败，请稍后重试。';
        } finally { unlock(); }
      });
    });
    // 加载更多：仅帖子流续页（与首屏同一查询口径，offset 递进），追加为资讯流条目
    var moreBtn = $('#morePostsBtn');
    if (moreBtn) {
      var postOffset = 20;
      moreBtn.addEventListener('click', async function () {
        moreBtn.disabled = true; moreBtn.textContent = '正在加载…';
        var url = '/forum/posts?limit=20&offset=' + postOffset + (forumState.board ? '&board=' + encodeURIComponent(forumState.board) : '') + (forumState.campId ? '&campId=' + encodeURIComponent(forumState.campId) : '');
        var rr = await api(url, { auth: loggedIn() });
        var feed = $('#postFeed');
        if (rr.ok && feed) {
          var more = (rr.data && rr.data.posts) || [];
          feed.insertAdjacentHTML('beforeend', more.map(function (p) { return feedPostHtml(p, false); }).join(''));
          fillAvatars(feed);
          postOffset += more.length;
          if (more.length < 20) { moreBtn.parentElement.style.display = 'none'; }
          else { moreBtn.disabled = false; moreBtn.textContent = '加载更多'; }
        } else { moreBtn.disabled = false; moreBtn.textContent = '加载失败，点此重试'; }
      });
    }
    // 发帖 FAB 与底部发帖钮——打开发帖框并滚到其位置
    function openCompose() {
      var b = $('#newPostBtn'); if (!b) return;
      if (!$('#postForm')) b.click();
      var box = $('#composeBox'); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    var fab = $('#fabPost');
    if (fab) fab.addEventListener('click', openCompose);
    if (composeWanted) { composeWanted = false; setTimeout(openCompose, 60); }
  }
  // ---------- 营地创建 / 编辑 / 删除（与 App 同接口同规则） ----------
  // 创建 POST /forum/camps {name,description,avatar?}：提交即自动审核（过审上线 / 疑似进
  // 人工待审 / 违规驳回回大类）；名称全网唯一、每位用户上限由服务端参数控制
  // （站长不受上限约束，服务端判定）。我的营地 GET /forum/me/camps（含未上线态，
  // 创建者可见驳回大类）；编辑 POST /forum/camps/:id/edit（仅创建者，{name?,
  // description?, avatar?}，avatar 为 {mime,dataBase64} 换图或 null 移除——迁移
  // 0043；active 改动过审才生效、rejected 整体重提）；删除自建未上线营地
  // DELETE /forum/camps/:id。
  function campStatusTag(c) {
    if (c.status === 'active') return '<span class="tag green">已上线</span>';
    if (c.status === 'pending') return '<span class="tag blue">审核中</span>';
    if (c.status === 'rejected') return '<span class="tag red">未通过' + (c.modCategory ? '（' + esc(c.modCategory) + '）' : '') + '</span>';
    if (c.status === 'closed') return '<span class="tag red">已关闭</span>';
    return '<span class="tag">' + esc(zhCode(CAMP_STATUS, c.status, '处理中')) + '</span>';
  }
  // 营地头像客户端处理（迁移 0043 接口：{mime, dataBase64}，服务端上限
  // 200KB）：小图直传；大图 canvas 居中裁方＋JPEG 逐级压缩到 195KB 内。
  function bytesToB64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  async function processCampAvatarFile(file) {
    var okTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (okTypes.indexOf(file.type) < 0) throw new Error('营地头像只支持 PNG、JPG、WebP 或 GIF 图片。');
    var buf = new Uint8Array(await file.arrayBuffer());
    if (buf.length <= 190 * 1024) return { mime: file.type, dataBase64: bytesToB64(buf) };
    var url = URL.createObjectURL(file);
    try {
      var img = await new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = url; });
      var size = 256, q = 0.85, blob = null;
      for (var attempt = 0; attempt < 5; attempt++) {
        var cv = document.createElement('canvas'); cv.width = size; cv.height = size;
        var cx = cv.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, size, size);
        var sc = Math.max(size / img.width, size / img.height);
        var w = img.width * sc, h = img.height * sc;
        cx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        blob = await new Promise(function (res) { cv.toBlob(res, 'image/jpeg', q); });
        if (!blob || blob.size <= 195 * 1024) break;
        if (q > 0.55) q -= 0.15; else size = Math.round(size * 0.75);
      }
      if (!blob) throw new Error('图片处理失败，请换一张图片重试。');
      if (blob.size > 200 * 1024) throw new Error('图片压缩后仍超过 200KB，请换一张更小的图片。');
      return { mime: 'image/jpeg', dataBase64: bytesToB64(new Uint8Array(await blob.arrayBuffer())) };
    } finally { URL.revokeObjectURL(url); }
  }
  function showCampForm(camp) {
    var box = $('#campFormBox'); if (!box) return;
    var editing = !!camp;
    var campAvatarPayload; // undefined=不改动；{mime,dataBase64}=换图（移除走复选框）
    box.innerHTML = '<form class="stack wide" id="campForm" style="margin-top:14px;border-top:1px solid var(--line-soft);padding-top:14px;">' +
      '<strong>' + (editing ? (camp.status === 'rejected' ? '修改并重新提交' : '编辑营地') : '创建营地') + '</strong>' +
      '<label>营地名称（最多 30 字，全网唯一）<input name="name" required maxlength="30" value="' + esc(editing ? camp.name || '' : '') + '"></label>' +
      '<label>营地简介（最多 200 字）<textarea name="description" rows="3" maxlength="200">' + esc(editing ? camp.description || '' : '') + '</textarea></label>' +
      '<label>营地头像（可选，支持 PNG、JPG、WebP、GIF，大图自动压缩）<input type="file" id="campAvatarFile" accept="image/png,image/jpeg,image/webp,image/gif"></label>' +
      (editing && camp.avatarUrl ? '<label class="switch-row"><input type="checkbox" id="campAvatarRemove"> 移除当前头像</label>' : '') +
      '<div class="camp-form-avprev" id="campAvatarPrev">' + (editing && camp.avatarUrl ? '<span class="muted small">当前头像：</span>' + campAvatarSlotHtml(camp, 48) : '') + '</div>' +
      '<p class="muted small" style="margin:0;">提交后先经自动审核：通过即生效；疑似违规会进入人工审核；明显违规将被驳回并显示原因大类。头像修改与改名一起审核。每位用户最多创建 3 个营地（站长不受此限制）。</p>' +
      '<div class="err" id="campFormErr"></div><div class="ok" id="campFormOk"></div>' +
      '<span class="row"><button class="primary" type="submit">' + (editing ? '提交' : '创建营地') + '</button><button class="ghost" type="button" id="campFormCancel">取消</button></span></form>';
    fillCampAvatars(box);
    $('#campFormCancel').addEventListener('click', function () { box.innerHTML = ''; });
    var avFile = $('#campAvatarFile');
    if (avFile) avFile.addEventListener('change', async function () {
      var err = $('#campFormErr'); err.textContent = '';
      campAvatarPayload = undefined;
      var prev = $('#campAvatarPrev');
      if (!avFile.files || !avFile.files[0]) { if (prev) prev.innerHTML = ''; return; }
      try {
        campAvatarPayload = await processCampAvatarFile(avFile.files[0]);
        if (prev) prev.innerHTML = '<span class="muted small">新头像预览：</span><img alt="新头像预览" src="' + URL.createObjectURL(avFile.files[0]) + '">';
      } catch (e) {
        err.textContent = uiErrText(e, '头像处理失败，请换一张图片。');
        avFile.value = '';
      }
    });
    $('#campForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      var payload = { name: String(fd.get('name')).trim(), description: String(fd.get('description')).trim() };
      if (campAvatarPayload) payload.avatar = campAvatarPayload;
      else { var rm = $('#campAvatarRemove'); if (rm && rm.checked) payload.avatar = null; }
      var err = $('#campFormErr'), ok = $('#campFormOk'); err.textContent = ''; ok.textContent = '';
      var r = editing
        ? await api('/forum/camps/' + encodeURIComponent(camp.id) + '/edit', { method: 'POST', body: payload })
        : await api('/forum/camps', { method: 'POST', body: payload });
      if (!r.ok) { err.textContent = r.message || '提交失败，请稍后重试。'; return; }
      var d = r.data || {};
      ok.textContent = d.message || (d.status === 'active' || d.editStatus === 'applied' ? '已生效。' : '已提交。');
      loadMyCamps();
      var needRefresh = (!editing && d.status === 'active') || (editing && d.editStatus === 'applied');
      if (needRefresh) setTimeout(function () {
        var h = location.hash || '#/home';
        if (h === '#/forum' || h === '#/') pageForum(route()); // 仍停留在论坛首页才刷新，避免把已跳走的用户拽回来
      }, 900);
    });
  }
  async function loadMyCamps() {
    var box = $('#myCampsBox'); if (!box) return;
    if (!loggedIn()) { box.innerHTML = ''; return; }
    var r = await api('/forum/me/camps');
    if (!r.ok) { box.innerHTML = '<p class="err small">' + esc(r.message || '加载失败，请稍后重试。') + '</p>'; return; }
    var camps = (r.data && r.data.camps) || [];
    if (!camps.length) { box.innerHTML = '<p class="muted small">您还没有创建营地。点击右上角「创建营地」发起一个主题社区。</p>'; return; }
    box.innerHTML = '<div class="list">' + camps.map(function (c) {
      var acts = '';
      if (c.status === 'active' || c.status === 'rejected') acts += '<button class="mini-btn brand" type="button" data-campedit="' + esc(c.id) + '">' + (c.status === 'rejected' ? '修改并重新提交' : '编辑') + '</button>';
      if (c.status === 'pending' || c.status === 'rejected') acts += '<button class="mini-btn danger" type="button" data-campdel="' + esc(c.id) + '">删除</button>';
      return '<div class="item">' + campAvatarSlotHtml(c, 34) + '<span class="grow"><a href="#/forum/camp/' + esc(c.id) + '"><strong>' + esc(c.name) + '</strong></a> ' + campStatusTag(c) +
        (c.hasPendingEdit ? ' <span class="tag blue">有修改待审核</span>' : '') +
        (c.hasPendingAvatar ? ' <span class="tag blue">头像修改待审核</span>' : '') +
        '<br><span class="muted small">' + esc(c.description || '') + '<br>成员 ' + esc(c.memberCount || 0) + ' · 帖子 ' + esc(c.postCount || 0) + '</span></span>' +
        (acts ? '<span class="row" style="gap:2px;">' + acts + '</span>' : '') + '</div>';
    }).join('') + '</div>';
    fillCampAvatars(box);
    box.querySelectorAll('[data-campedit]').forEach(function (b) { b.addEventListener('click', function () {
      var c = camps.filter(function (x) { return String(x.id) === b.getAttribute('data-campedit'); })[0];
      var fb = $('#campFormBox'); if (fb && fb.scrollIntoView) fb.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showCampForm(c || null);
    }); });
    box.querySelectorAll('[data-campdel]').forEach(function (b) { b.addEventListener('click', async function () {
      if (!await appConfirmDlg('删除营地', '确定删除这个营地吗？该营地尚未上线，删除后不可恢复。', true)) return;
      var rr = await api('/forum/camps/' + encodeURIComponent(b.getAttribute('data-campdel')), { method: 'DELETE' });
      if (rr.ok) loadMyCamps(); else appToast(rr.message || '删除失败，请稍后重试。');
    }); });
  }

  async function forumCampPage(campId) {
    await probeOwner();
    view.innerHTML = '<div class="card"><p class="muted">正在加载…</p></div>';
    var r = await api('/forum/camps/' + encodeURIComponent(campId), { auth: loggedIn() });
    if (!r.ok) { view.innerHTML = '<div class="card"><h2>营地</h2><p class="err">' + esc(r.message) + '</p><p><a href="#/forum">返回论坛</a></p></div>'; return; }
    var c = (r.data && r.data.camp) || {};
    var posts = (r.data && r.data.posts) || [];
    var mine = loggedIn() && c.creator && c.creator.userId != null && Number(c.creator.userId) === Number(myUserId());
    view.innerHTML = '<div class="card"><p style="margin-top:0;"><a href="#/forum">← 返回论坛</a></p>' +
      '<div class="row"><span class="camp-head-av">' + (c.avatarUrl ? campAvatarSlotHtml(c, 44) : '<span class="brand-mark" style="width:44px;height:44px;border-radius:12px;font-size:16px;background:linear-gradient(120deg,#1d4ed8,#38bdf8);">营</span>') + '</span>' +
      '<span class="grow"><strong style="font-size:19px;">' + esc(c.name || '营地') + '</strong> ' + campStatusTag(c) + '<br>' +
      '<span class="muted small">成员 ' + esc(c.memberCount || 0) + ' · 帖子 ' + esc(c.postCount || 0) + (c.creator && c.creator.displayName ? ' · 创建者 ' + esc(c.creator.displayName) + ownerBadgeHtml(c.creator.userId, ownerFlagOf(c.creator)) : '') + '</span></span></div>' +
      (c.description ? '<p style="margin:12px 0 0;">' + esc(c.description) + '</p>' : '') +
      (r.data.closed ? '<p class="notice warnbox" style="margin-top:12px;">' + esc(r.data.message || '该营地已关闭。') + '</p>' : '') +
      '<p class="row wrap" style="margin:14px 0 0;">' +
      (loggedIn() && !r.data.closed ? '<button class="ghost" id="campJoinBtn" type="button">' + (c.joined ? '退出营地' : '加入营地') + '</button><button class="primary" id="campPostsBtn" type="button">只看营地帖子</button>' : '') +
      (mine && c.status === 'active' ? '<button class="ghost" id="campEditBtn" type="button">编辑营地</button>' : '') +
      (isSiteOwner() ? '<button class="ghost" id="campOwnerDelBtn" type="button" style="color:var(--danger);border-color:#f0c4c4;">删除营地（站长）</button>' : '') +
      '</p><div id="campFormBox"></div></div>' +
      '<div class="card"><h2>营地帖子</h2><div>' + (posts.length ? posts.map(postItemHtml).join('') : '<p class="empty">暂无帖子。</p>') + '</div></div>';
    fillAvatars(view);
    fillCampAvatars(view);
    var jb = $('#campJoinBtn');
    if (jb) jb.addEventListener('click', async function () {
      var rr = await api('/forum/camps/' + encodeURIComponent(campId) + '/join', { method: 'POST', body: { joined: !c.joined } });
      if (rr.ok) forumCampPage(campId); else appToast(rr.message || '操作失败，请稍后重试。');
    });
    var pb = $('#campPostsBtn');
    if (pb) pb.addEventListener('click', function () { forumState.campId = String(campId); forumState.tab = 'home'; location.hash = '#/forum'; pageForum(route()); });
    var eb = $('#campEditBtn');
    if (eb) eb.addEventListener('click', function () { showCampForm(c); });
    var odb = $('#campOwnerDelBtn');
    if (odb) odb.addEventListener('click', async function () {
      // 站长删除营地：POST /owner/reviews/camps/:id/delete（站长会话＋reauth 两步确认，
      // 与管理台其他敏感操作同一口径）。接口由服务端线新增；未上线时服务端回错误
      // 文案会原样提示，不做假成功。
      var f = await ownerConfirm({ title: '删除营地（站长）', danger: true, body: '您将以站长身份删除营地「' + (c.name || campId) + '」。删除后该营地将不可见，此操作记录在管理审计中。' });
      if (!f) return;
      var rr = await ownerDo('/owner/reviews/camps/' + encodeURIComponent(campId) + '/delete', f, '营地已删除。');
      if (rr) { location.hash = '#/forum'; }
    });
  }
  async function forumUserPage(userId) {
    view.innerHTML = '<div class="card"><h2>个人主页</h2><p class="muted">正在加载…</p></div>';
    var r = await api('/forum/users/' + encodeURIComponent(userId) + '/profile', { auth: loggedIn() });
    if (!r.ok) { view.innerHTML = '<div class="card"><h2>个人主页</h2><p class="err">' + esc(r.message) + '</p></div>'; return; }
    var d = r.data || {}, u = d.user || {}, st = d.stats || {};
    view.innerHTML = '<div class="profile-head"><div class="ph-cover"></div><div class="ph-body"><div class="ph-row"><span class="ph-avatar" id="fuAvatar"><span class="avatar-ph">' + esc((u.name || 'Q').slice(0, 1)) + '</span></span>' +
      '<span><span class="ph-name">' + esc(nameOrFallback(u.name, u.username)) + ownerBadgeHtml(userId, ownerFlagOf(u)) + '</span><br><span class="ph-sub">' + (u.joinedAt ? '加入于 ' + esc(fmtTs(u.joinedAt)) : '') + '</span></span></div>' +
      '<div class="ph-stats"><span><span class="n">' + esc(st.posts || 0) + '</span><br><span class="l">发帖</span></span><span><span class="n">' + esc(st.comments || 0) + '</span><br><span class="l">评价</span></span></div></div></div>' +
      '<div class="card"><h2>发布的帖子</h2><div class="list">' + ((d.posts || []).length ? d.posts.map(postItemHtml).join('') : '<p class="muted">暂无帖子。</p>') + '</div></div>' +
      '<div class="card"><h2>发表的评价</h2><div class="list">' + ((d.comments || []).length ? d.comments.map(function (c) {
        return '<div class="item"><span class="grow"><a href="#/forum/post/' + esc(c.postId) + '"><strong>' + esc(c.postTitle || '帖子') + '</strong></a><br><span class="muted">' + esc(c.content) + '</span><br><span class="muted small">' + esc(fmtTs(c.createdAt)) + '</span></span></div>';
      }).join('') : '<p class="muted">暂无评价。</p>') + '</div></div>';
    fillAvatars(view);
    showAvatar($('#fuAvatar'), '/profile/' + encodeURIComponent(userId) + '/avatar', (u && u.avatarUpdatedAt) || '', 76);
  }
  async function forumPostPage(id) {
    await probeOwner();
    view.innerHTML = '<div class="card"><p class="muted">正在加载…</p></div>';
    var r = await api('/forum/posts/' + encodeURIComponent(id), { auth: loggedIn() });
    if (!r.ok) { view.innerHTML = '<div class="card"><p class="err">' + esc(r.message) + '</p><p><a href="#/forum">返回论坛</a></p></div>'; return; }
    var p = (r.data && r.data.post) || {};
    var replies = (r.data && r.data.replies) || [];
    var reward = p.reward || null;
    var owner = isSiteOwner();
    var mine = loggedIn() && authorId(p) !== '' && Number(authorId(p)) === Number(myUserId());
    view.innerHTML = '<div class="card"><p style="margin-top:0;"><a href="#/forum">← 返回论坛</a></p>' +
      '<h2 style="font-size:23px;line-height:1.42;margin-bottom:12px;letter-spacing:.2px;">' + esc(p.title || '(无标题)') + postStatusTag(p) + '</h2>' +
      '<div class="post-author" style="font-size:13.5px;">' + avatarSlotHtml(authorId(p), '', true, authorName(p), 30) +
      '<a href="#/forum/user/' + esc(authorId(p)) + '"><strong style="color:var(--ink);">' + esc(authorName(p)) + '</strong></a>' + ownerBadgeHtml(authorId(p), ownerFlagOf(p.author)) + '<span class="faint">' + esc(fmtTs(p.createdAt)) + '</span></div>' +
      '<div style="white-space:pre-wrap;word-break:break-word;line-height:1.75;margin-top:10px;">' + esc(p.content || '') + '</div>' +
      '<div class="post-stats" style="margin-top:16px;font-size:13px;"><span class="ps">' + ico('heart', 16) + '点赞 ' + esc(p.likeCount || 0) + '</span><span class="ps">' + ico('reply', 16) + '回复 ' + esc(p.replyCount != null ? p.replyCount : replies.length) + '</span><span class="ps">' + ico('eye', 16) + '浏览 ' + esc(p.viewCount || 0) + '</span><span class="ps">分享 ' + esc(p.shareCount || 0) + '</span></div>' +
      '<p class="row wrap" style="margin-top:12px;">' +
      '<button class="ghost" id="likeBtn" type="button">' + (p.likedByMe ? '已点赞' : '点赞') + '（' + esc(p.likeCount || 0) + '）</button>' +
      '<button class="ghost" id="shareBtn" type="button">分享（' + esc(p.shareCount || 0) + '）</button>' +
      (loggedIn() ? '<button class="ghost" id="reportBtn" type="button">举报</button>' : '') +
      (mine ? '<button class="ghost" id="delOwnPostBtn" type="button" style="color:var(--danger);border-color:#f0c4c4;">删除</button>' : '') +
      (owner && !mine ? '<button class="ghost" id="ownerDelPostBtn" type="button" style="color:var(--danger);border-color:#f0c4c4;">删除帖子（站长）</button>' : '') +
      (reward && reward.eligible ? '<button class="primary" id="rewardBtn" type="button">申请千赞奖励</button>' : '') +
      (reward && reward.state && reward.state !== 'none' ? '<span class="muted small">千赞奖励申请状态：' + esc(zhCode(REVIEW_STATE, reward.state, '处理中')) + '</span>' : '') +
      '</p><p class="small" id="postActionSt" role="status"></p></div>' +
      '<div class="card"><h2>回复（' + esc(replies.length) + '）</h2><div>' +
      (replies.length ? replies.map(function (x) {
        var xname = nameOrFallback(x.author && x.author.name, x.author && x.author.username);
        var xid = (x.author && x.author.userId) || '';
        return '<div class="post-row">' + avatarSlotHtml(xid, '', true, xname, 36) +
          '<div class="post-main"><div class="post-author"><a href="#/forum/user/' + esc(xid) + '"><strong style="color:var(--ink);">' + esc(xname) + '</strong></a>' + ownerBadgeHtml(xid, ownerFlagOf(x.author)) + '<span class="faint">' + esc(relTime(x.createdAt)) + '</span>' +
          (x.status && x.status !== 'published' ? '<span class="tag ' + (x.status === 'pending' ? 'blue' : 'red') + '">' + esc(zhCode(POST_STATUS, x.status, '处理中')) + '</span>' : '') +
          (owner ? '<button class="mini-btn danger" type="button" data-owndelreply="' + esc(x.id) + '">删除</button>' : '') + '</div>' +
          '<div style="white-space:pre-wrap;word-break:break-word;">' + esc(x.content) + '</div></div></div>';
      }).join('') : '<p class="empty">暂无回复。</p>') + '</div>' +
      (loggedIn() ? '<form class="stack wide" id="replyForm" style="margin-top:14px;"><label>发表回复<textarea name="content" rows="3" required></textarea></label><div class="err" id="replyErr"></div><span><button class="primary" type="submit">提交回复</button></span></form>' : '<p class="muted small">登录后可参与回复。</p>') + '</div>';
    fillAvatars(view);
    var st = $('#postActionSt');
    var odp = $('#ownerDelPostBtn');
    if (odp) odp.addEventListener('click', async function () {
      var f = await ownerConfirm({ title: '删除帖子（站长）', danger: true, body: '您将以站长身份删除帖子「' + (p.title || '') + '」。删除后帖子不可见，此操作记录在管理审计中。' });
      if (!f) return;
      var rr = await ownerDo('/owner/forum/post/' + encodeURIComponent(id) + '/delete', f, '帖子已删除。');
      if (rr) location.hash = '#/forum';
    });
    var dop = $('#delOwnPostBtn');
    if (dop) dop.addEventListener('click', async function () {
      if (!await appConfirmDlg('删除帖子', '确定删除帖子「' + (p.title || '') + '」吗？删除后帖子不可见，此操作不可恢复。', true)) return;
      var rr = await api('/forum/posts/' + encodeURIComponent(id) + '/delete', { method: 'POST', body: {} });
      if (rr.ok) { appToast('帖子已删除。'); location.hash = '#/forum'; }
      else { st.textContent = rr.message || '删除失败，请稍后重试。'; st.className = 'small err'; }
    });
    view.querySelectorAll('[data-owndelreply]').forEach(function (b) { b.addEventListener('click', async function () {
      var f = await ownerConfirm({ title: '删除回复（站长）', danger: true, body: '您将以站长身份删除这条回复。删除后回复不可见，此操作记录在管理审计中。' });
      if (!f) return;
      var rr = await ownerDo('/owner/forum/reply/' + encodeURIComponent(b.getAttribute('data-owndelreply')) + '/delete', f, '回复已删除。');
      if (rr) forumPostPage(id);
    }); });
    var likeBtn = $('#likeBtn');
    if (likeBtn) likeBtn.addEventListener('click', async function () {
      if (!loggedIn()) { location.hash = '#/login'; return; }
      var rr = await api('/forum/posts/' + encodeURIComponent(id) + '/like', { method: 'POST', body: {} });
      if (rr.ok) forumPostPage(id); else st.textContent = rr.message || '操作失败。';
    });
    var shareBtn = $('#shareBtn');
    if (shareBtn) shareBtn.addEventListener('click', async function () {
      var url = location.origin + location.pathname + '#/forum/post/' + encodeURIComponent(id);
      // W-08：剪贴板失败不再假报「已复制」，改为把链接原文显示出来供手动复制。
      var copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch (e) { /* 剪贴板不可用：走手动复制提示 */ }
      var rr = await api('/forum/posts/' + encodeURIComponent(id) + '/share', { method: 'POST', body: {} });
      if (!copied) {
        st.textContent = '自动复制失败，请手动复制此链接：' + url;
        st.className = 'small err';
        return;
      }
      st.textContent = rr.ok ? '链接已复制，分享计数已更新。' : '链接已复制。';
      st.className = 'small ok';
      if (rr.ok) forumPostPage(id);
    });
    var reportBtn = $('#reportBtn');
    if (reportBtn) reportBtn.addEventListener('click', async function () {
      var reason = await appPromptDlg('举报帖子', '请填写举报原因，提交后将由管理员核查处理。', '例如：垃圾广告、人身攻击、违规内容…', '提交举报');
      if (!reason) return;
      var rr = await api('/forum/posts/' + encodeURIComponent(id) + '/report', { method: 'POST', body: { reason: reason } });
      st.textContent = rr.ok ? '举报已提交，感谢您的反馈。' : (rr.message || '举报失败，请稍后重试。');
      st.className = 'small ' + (rr.ok ? 'ok' : 'err');
    });
    var rewardBtn = $('#rewardBtn');
    if (rewardBtn) rewardBtn.addEventListener('click', async function () {
      var rr = await api('/forum/posts/' + encodeURIComponent(id) + '/reward-applications', { method: 'POST', body: {} });
      st.textContent = rr.ok ? '千赞奖励申请已提交，等待审核。' : (rr.message || '申请失败，请稍后重试。');
      st.className = 'small ' + (rr.ok ? 'ok' : 'err');
      if (rr.ok) forumPostPage(id);
    });
    var rf = $('#replyForm');
    if (rf) rf.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var unlock = lockSubmit(ev.target); if (!unlock) return;
      try {
        var content = String(new FormData(ev.target).get('content')).trim();
        var rr = await api('/forum/posts/' + encodeURIComponent(id) + '/replies', { method: 'POST', body: { content: content } });
        if (rr.ok) forumPostPage(id); else $('#replyErr').textContent = rr.message || '回复失败，请稍后重试。';
      } finally { unlock(); }
    });
  }

  // ---------- 好友 ----------
  // 契约：搜索 POST /friends/search {query} → {users:[publicView{userId,nickname,hasAvatar}]}
  // 申请 GET /friends/requests → {incoming:[{id,...,user:publicView}], outgoing:[...]}
  // 好友 GET /friends → {friends:[SUPPORT_BOT_ENTRY, friendView{userId,nickname,username,pubkey}...]}
  // SUPPORT_BOT_ENTRY {kind:'support_bot', userId:'support', displayName:'智能客服', pinned:true, undeletable:true}
  var chatActivePeer = '';
  async function pageFriends() {
    if (!loggedIn()) return needLogin('好友');
    chatActivePeer = '';
    view.innerHTML = '<div class="page-title">好友与会话</div><div class="chat-shell mode-list">' +
      '<div class="chat-side">' +
      '<div class="card"><h2>会话</h2><div id="convList">' + sklRows(3) + '</div></div>' +
      '<div class="card"><h2>找好友</h2>' +
      '<form class="row" id="friendSearch" style="margin-bottom:8px;"><input class="grow" name="q" placeholder="输入账户 ID 或邮箱精确搜索"><button class="ghost" type="submit">搜索</button></form>' +
      '<div id="searchOut"></div></div>' +
      '<div class="card"><h2>好友申请</h2><div id="reqBox"><p class="muted">正在加载申请…</p></div></div>' +
      '<div class="card"><h2>我的好友</h2><div id="friendList"><p class="muted">正在加载好友…</p></div></div>' +
      '</div>' +
      '<div class="chat-main"><div class="card" style="text-align:center;padding:56px 20px;">' +
      '<span class="brand-mark" style="width:52px;height:52px;border-radius:14px;font-size:19px;">QF</span>' +
      '<h2 style="margin-top:14px;">开始聊天</h2><p class="muted">从左侧选择一段会话或一位好友，即可开始端对端加密聊天。</p>' +
      '<p class="muted small">网页版聊天与客户端同为端对端加密；身份密钥仅保存在页面内存中，关闭页面即清除。</p></div></div>' +
      '</div>';
    $('#friendSearch').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var q = String(new FormData(ev.target).get('q')).trim(); if (!q) return;
      var r = await api('/friends/search', { method: 'POST', body: { query: q } });
      var out = $('#searchOut');
      if (!r.ok) { out.innerHTML = '<p class="err">' + esc(r.message) + '</p>'; return; }
      var users = (r.data && r.data.users) || [];
      out.innerHTML = users.length ? '<div>' + users.map(function (u) {
        return '<div class="pane-item">' + avatarSlotHtml(u.userId, u.avatarUpdatedAt, u.hasAvatar, u.nickname, 40) + '<span class="grow"><span class="pname">' + esc(nameOrFallback(u.nickname, u.username)) + ownerBadgeHtml(u.userId, ownerFlagOf(u)) + '</span></span><button class="primary" data-addfriend="' + esc(u.userId) + '" type="button" style="padding:6px 13px;">添加好友</button></div>';
      }).join('') + '</div>' : '<p class="muted small">未找到对应用户。请确认账户 ID 或邮箱无误（仅支持精确搜索）。</p>';
      fillAvatars(out);
      out.querySelectorAll('[data-addfriend]').forEach(function (b) { b.addEventListener('click', async function () {
        var rr = await api('/friends/request', { method: 'POST', body: { userId: Number(b.getAttribute('data-addfriend')) } });
        out.innerHTML = '<p class="' + (rr.ok ? 'ok' : 'err') + '">' + esc(rr.ok ? (rr.data && rr.data.status === 'accepted' ? '你们已经成为好友。' : '好友申请已发送。') : rr.message) + '</p>';
        loadRequests(); loadFriends();
      }); });
    });
    loadRequests(); loadFriends(); loadConversations();
  }
  var friendActionErr = '';
  async function loadRequests() {
    var box = $('#reqBox'); if (!box) return;
    var r = await api('/friends/requests');
    if (!r.ok) { box.innerHTML = '<p class="err">' + esc(r.message) + '</p>'; return; }
    var d = r.data || {};
    var incoming = d.incoming || [];
    var outgoing = d.outgoing || [];
    box.innerHTML =
      (friendActionErr ? '<p class="err">' + esc(friendActionErr) + '</p>' : '') +
      (!incoming.length && !outgoing.length ? '<p class="muted small">暂无待处理的好友申请。</p>' : '') +
      (incoming.length ? '<h3 style="margin-top:2px;">收到的申请</h3>' + incoming.map(function (x) {
        var u = x.user || {};
        return '<div class="pane-item">' + avatarSlotHtml(u.userId, u.avatarUpdatedAt, u.hasAvatar, u.nickname, 40) + '<span class="grow"><span class="pname">' + esc(nameOrFallback(u.nickname, u.username)) + ownerBadgeHtml(u.userId, ownerFlagOf(u)) + '</span></span>' +
          '<button class="primary" data-accept="' + esc(x.id) + '" style="padding:6px 13px;">同意</button><button class="ghost" data-reject="' + esc(x.id) + '" style="padding:6px 13px;">拒绝</button></div>';
      }).join('') : '') +
      (outgoing.length ? '<h3>我发出的申请</h3>' + outgoing.map(function (x) {
        var u = x.user || {};
        return '<div class="pane-item">' + avatarSlotHtml(u.userId, u.avatarUpdatedAt, u.hasAvatar, u.nickname, 40) + '<span class="grow"><span class="pname">' + esc(nameOrFallback(u.nickname, u.username)) + ownerBadgeHtml(u.userId, ownerFlagOf(u)) + '</span><br><span class="psub">等待对方处理</span></span></div>';
      }).join('') : '');
    fillAvatars(box);
    box.querySelectorAll('[data-accept]').forEach(function (b) { b.addEventListener('click', async function () { var rr = await api('/friends/request/' + encodeURIComponent(b.getAttribute('data-accept')) + '/accept', { method: 'POST', body: {} }); friendActionErr = rr.ok ? '' : (rr.message || '操作失败，请稍后重试。'); loadRequests(); loadFriends(); }); });
    box.querySelectorAll('[data-reject]').forEach(function (b) { b.addEventListener('click', async function () { var rr = await api('/friends/request/' + encodeURIComponent(b.getAttribute('data-reject')) + '/reject', { method: 'POST', body: {} }); friendActionErr = rr.ok ? '' : (rr.message || '操作失败，请稍后重试。'); loadRequests(); }); });
  }
  async function loadFriends() {
    var box = $('#friendList'); if (!box) return;
    var r = await api('/friends');
    if (!r.ok) { box.innerHTML = '<p class="err">' + esc(r.message) + '</p>'; return; }
    var list = (r.data && r.data.friends) || [];
    box.innerHTML = (friendActionErr ? '<p class="err">' + esc(friendActionErr) + '</p>' : '') + (list.length ? '<div>' + list.map(function (f) {
      if (f.kind === 'support_bot') {
        return '<a class="pane-item" href="#/support"><span class="brand-mark" style="width:44px;height:44px;border-radius:50%;font-size:14px;">客</span><span class="grow"><span class="pname">' + esc(f.displayName || '智能客服') + '</span> <span class="tag blue">系统 · 置顶</span><br><span class="psub">自动回复系统，点击进入智能客服</span></span></a>';
      }
      var uid = f.userId;
      return '<div class="pane-item">' + avatarSlotHtml(uid, f.avatarUpdatedAt, f.hasAvatar, f.nickname, 44) + '<span class="grow"><a href="#/chat/' + esc(uid) + '" style="color:var(--ink);"><span class="pname">' + esc(nameOrFallback(f.nickname, f.username)) + ownerBadgeHtml(uid, ownerFlagOf(f)) + '</span></a>' + (f.username ? '<br><span class="psub">账户 ID：' + esc(f.username) + '</span>' : '') + '</span>' +
        '<a class="ghost" href="#/chat/' + esc(uid) + '" style="padding:6px 13px;">聊天</a><button class="mini-btn danger" data-del="' + esc(uid) + '">删除</button></div>';
    }).join('') + '</div>' : '<p class="muted small">暂无好友。可通过上方搜索添加。</p>');
    fillAvatars(box);
    box.querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', async function () {
      if (!await appConfirmDlg('删除好友', '确定删除该好友吗？删除后将无法继续聊天。', true)) return;
      var rr = await api('/friends/' + encodeURIComponent(b.getAttribute('data-del')), { method: 'DELETE' }); friendActionErr = rr.ok ? '' : (rr.message || '删除失败，请稍后重试。'); loadFriends();
    }); });
  }
  // 会话列表契约：GET /chat/conversations → {conversations:[{user:{userId,nickname,username?},lastMessageId,lastMessageAt,unreadCount}]}
  async function loadConversations() {
    var box = $('#convList'); if (!box) return;
    var r = await api('/chat/conversations');
    if (!r.ok) { box.innerHTML = '<p class="err">' + esc(r.message) + '</p>'; return; }
    var list = (r.data && r.data.conversations) || [];
    box.innerHTML = list.length ? '<div>' + list.map(function (c) {
      var u = c.user || {};
      return '<a class="pane-item' + (chatActivePeer && String(u.userId) === String(chatActivePeer) ? ' on' : '') + '" href="#/chat/' + esc(u.userId) + '">' + avatarSlotHtml(u.userId, u.avatarUpdatedAt, u.hasAvatar, u.nickname, 44) + '<span class="grow"><span class="pname">' + esc(nameOrFallback(u.nickname, u.username)) + ownerBadgeHtml(u.userId, ownerFlagOf(u)) + '</span><br><span class="psub">最近消息 ' + esc(relTime(c.lastMessageAt)) + '</span></span>' + (c.unreadCount ? '<span class="badge">' + esc(c.unreadCount) + '</span>' : '') + '</a>';
    }).join('') + '</div>' : '<p class="muted small">暂无会话。可从好友列表进入聊天。</p>';
    fillAvatars(box);
  }

  // ---------- 聊天 ----------
  // 契约：GET /chat/messages?with=&after=&limit= → {messages:[{id,from,to,mine,ciphertext,nonce,msgId,createdAt,readAt}]}
  // POST /chat/send {to,ciphertext,nonce,msgId,blobId?}；POST /chat/read {with,upToId}
  // 载荷口径与 App QfChatPayload 一致：明文直发文本；结构化载荷以 'qf1:'+JSON 表示附件/表情/回应。
  var CHAT_DISCLOSURE = '安全提示：网页版聊天与客户端同为端对端加密，消息仅在会话双方的设备上解密。但浏览器运行环境的安全性弱于客户端应用，身份密钥仅保存在本页面内存中，页面关闭后即清除。请勿在公共或不受信任的设备上使用网页版聊天，使用完毕后请退出登录。';
  var QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];
  var EMOJI_PANEL = ['😀', '😁', '😂', '🤣', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '🥰', '🙂', '🤗', '🤩', '😴', '😷', '🥳', '👍', '👎', '🙏', '🔥', '🎉', '❤️', '💯', '✅', '⭐', '🚀', '☕', '🍜', '🎂', '🐱', '🐶', '🌸', '🌙', '⚡', '🎵'];
  var chatTimer = null;
  // 客服轮询（W-10）：定时器提升为模块级，render() 切页时统一清理，不再随
  // pageSupport 闭包泄漏；supportSeq 为页面代次，离开客服页即自增，使迟到的
  // 会话恢复回包失效（W-Q1）。
  var supportTimer = null, supportSeq = 0;
  function parsePayload(text) {
    if (!text || text.indexOf('qf1:') !== 0) return { kind: 'text', text: text };
    try {
      var j = JSON.parse(text.slice(4));
      if (j && j.type === 'attachment') return { kind: 'attachment', ref: j };
      if (j && j.type === 'sticker') return { kind: 'sticker', id: j.id };
      if (j && j.type === 'reaction') return { kind: 'reaction', targetLocalId: j.targetLocalId, emoji: j.emoji };
    } catch (e) { /* 非结构化载荷按文本呈现 */ }
    return { kind: 'text', text: text };
  }
  function stickerChar(id) {
    try { return String.fromCodePoint(parseInt(String(id), 16)); } catch (e) { return '🙂'; }
  }
  async function pageChat(peerId) {
    if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
    if (!loggedIn()) return needLogin('聊天');
    if (!peerId) { location.hash = '#/friends'; return; }
    if (String(peerId) === 'support') { location.hash = '#/support'; return; }
    chatActivePeer = String(peerId);
    view.innerHTML = '<div class="chat-shell mode-chat">' +
      '<div class="chat-side"><div class="card"><h2>会话</h2><div id="convList">' + sklRows(3) + '</div>' +
      '<p style="margin:12px 0 0;"><a class="ghost" href="#/friends" style="display:block;text-align:center;">管理好友与申请</a></p></div></div>' +
      '<div class="chat-main"><div class="card"><div class="row"><a class="ghost" href="#/friends">‹ 会话</a><span id="chatPeerAvatar"></span><strong id="chatPeerName" style="font-size:16.5px;">聊天</strong></div>' +
      '<p class="notice" style="margin-top:12px;">' + CHAT_DISCLOSURE + '</p>' +
      '<div id="vaultBox"></div>' +
      '<div class="chatlog" id="chatLog"><p class="bubble sys">消息经端对端加密传输，服务器仅中继密文。</p></div>' +
      '<div id="reactionBar"></div>' +
      '<div class="composer"><textarea id="chatInput" placeholder="输入消息" rows="2"></textarea><button class="primary" id="chatSend" type="button">发送</button></div>' +
      '<p class="row wrap" style="margin-top:8px;"><button class="ghost" id="emojiBtn" type="button">表情</button><button class="ghost" id="attachBtn" type="button">附件</button><input type="file" id="attachFile" hidden><span class="small" id="chatStatus" role="status"></span></p>' +
      '<div id="emojiPanel" hidden><div class="chips">' + EMOJI_PANEL.map(function (e) { return '<button type="button" class="chip" data-emoji="' + e + '">' + e + '</button>'; }).join('') + '</div>' +
      '<p class="muted small" style="margin-top:8px;">表情包（贴纸）：</p><div class="chips">' + EMOJI_PANEL.slice(0, 16).map(function (e) { return '<button type="button" class="chip" data-sticker="' + e.codePointAt(0).toString(16) + '">' + e + '</button>'; }).join('') + '</div></div></div></div></div>';
    loadConversations();
    var status = $('#chatStatus');
    var log = $('#chatLog');
    var reactions = {}; // serverMsgId -> {reactorKey: emoji}
    var lastSeenId = 0;
    // 对方昵称（会话列表/好友资料）
    api('/chat/conversations').then(function (r) {
      var list = (r.ok && r.data && r.data.conversations) || [];
      var hit = list.filter(function (c) { return c.user && String(c.user.userId) === String(peerId); })[0];
      var nameEl = $('#chatPeerName');
      if (nameEl && hit) {
        nameEl.textContent = '与 ' + nameOrFallback(hit.user.nickname, hit.user.username) + ' 的聊天';
        if (ownerFlagOf(hit.user) || Number(hit.user.userId) === 15) { var ob = document.createElement('span'); ob.className = 'owner-badge'; ob.textContent = '站长'; nameEl.appendChild(ob); }
      }
      if (hit && hit.user.hasAvatar) showAvatar($('#chatPeerAvatar'), '/profile/' + encodeURIComponent(peerId) + '/avatar', hit.user.avatarUpdatedAt || '', 40);
    });
    function renderReactions() {
      var bar = $('#reactionBar'); if (!bar) return;
      var parts = [];
      Object.keys(reactions).forEach(function (mid) {
        var counts = {};
        Object.keys(reactions[mid]).forEach(function (k) { var e = reactions[mid][k]; if (e) counts[e] = (counts[e] || 0) + 1; });
        Object.keys(counts).forEach(function (e) { parts.push('<span class="chip">' + e + ' × ' + counts[e] + '</span>'); });
      });
      bar.innerHTML = parts.length ? '<p class="row wrap">' + parts.join('') + '</p>' : '';
    }
    function bubbleFor(m, text) {
      var p = parsePayload(text);
      var div = document.createElement('div');
      div.className = 'bubble' + (m.mine ? ' mine' : '');
      if (p.kind === 'attachment') {
        div.innerHTML = '📎 ' + esc(p.ref.name || '附件') + ' <span class="muted small">(' + esc(p.ref.mime || '') + ')</span>';
        var btn = document.createElement('button'); btn.className = 'ghost'; btn.type = 'button'; btn.textContent = '打开附件'; btn.style.marginLeft = '8px';
        btn.addEventListener('click', async function () {
          try {
            var bytes = await QFCrypto.openBlob(p.ref);
            var blob = new Blob([bytes], { type: p.ref.mime || 'application/octet-stream' });
            var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = p.ref.name || '附件'; a.click();
          } catch (e) { status.className = 'small err'; status.textContent = uiErrText(e, '附件打开失败，请稍后重试。'); }
        });
        div.appendChild(btn);
      } else if (p.kind === 'sticker') {
        div.innerHTML = '<span style="font-size:30px;">' + esc(stickerChar(p.id)) + '</span>';
      } else {
        div.textContent = text;
      }
      var reactBtn = document.createElement('button'); reactBtn.className = 'ghost'; reactBtn.type = 'button'; reactBtn.textContent = '回应'; reactBtn.style.marginLeft = '8px'; reactBtn.style.padding = '2px 8px';
      reactBtn.addEventListener('click', function () {
        var bar2 = $('#reactionBar'); if (!bar2) return;
        bar2.innerHTML = '<p class="row wrap">' + QUICK_REACTIONS.map(function (e) { return '<button type="button" class="chip" data-react="' + e + '" data-target="' + esc(m.id) + '">' + e + '</button>'; }).join('') + '</p>';
        bar2.querySelectorAll('[data-react]').forEach(function (b) { b.addEventListener('click', function () { sendWire('qf1:' + JSON.stringify({ type: 'reaction', targetLocalId: String(b.getAttribute('data-target')), emoji: b.getAttribute('data-react') })); renderReactions(); }); });
      });
      div.appendChild(reactBtn);
      return div;
    }
    async function pullHistory() {
      var hist = await api('/chat/messages?with=' + encodeURIComponent(peerId) + '&after=' + lastSeenId + '&limit=200');
      if (!hist.ok) { if (lastSeenId === 0) { status.className = 'small err'; status.textContent = hist.message || '消息加载失败，请稍后重试。'; } return; }
      var msgs = (hist.data && hist.data.messages) || [];
      var maxId = lastSeenId;
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i]; if (m.id > maxId) maxId = m.id;
        try {
          var text = await QFCrypto.decryptMessage(peerId, m.ciphertext);
          var p = parsePayload(text);
          if (p.kind === 'reaction') {
            var key = (m.mine ? 'me' : 'peer') + ':' + m.from;
            reactions[p.targetLocalId] = reactions[p.targetLocalId] || {};
            if (p.emoji) reactions[p.targetLocalId][key] = p.emoji; else delete reactions[p.targetLocalId][key];
            continue;
          }
          log.appendChild(bubbleFor(m, text));
        } catch (e) {
          var fail = document.createElement('p'); fail.className = 'bubble sys';
          fail.textContent = '有一条消息无法在网页版解开（可能发送于本次会话协商之前），请在客户端查看。';
          log.appendChild(fail);
        }
      }
      if (maxId > lastSeenId) { lastSeenId = maxId; log.scrollTop = log.scrollHeight; renderReactions(); api('/chat/read', { method: 'POST', body: { with: Number(peerId), upToId: lastSeenId } }); }
    }
    async function sendWire(wireText) {
      status.className = 'small muted'; status.textContent = '正在加密…';
      try {
        var enc = await QFCrypto.encryptFor(peerId, wireText);
        status.textContent = '正在发送…';
        var body = { to: Number(peerId), ciphertext: enc.ciphertext, nonce: enc.nonce, msgId: enc.msgId };
        var r = await api('/chat/send', { method: 'POST', body: body });
        if (!r.ok) throw new Error(r.message || '发送失败。');
        status.textContent = '';
        pullHistory();
        return true;
      } catch (e) {
        status.className = 'small err';
        status.textContent = e && e.code === 'CRYPTO_NOT_READY' ? '聊天尚未解锁，消息未发送。' : ('发送失败：' + uiErrText(e, '请稍后重试。'));
        return false;
      }
    }
    // 保险库解锁（登录密码）→ 身份恢复 → 历史拉取
    var vaultBox = $('#vaultBox');
    if (window.QFCrypto && QFCrypto.isUnlocked && QFCrypto.isUnlocked()) {
      vaultBox.innerHTML = '';
      pullHistory();
      chatTimer = setInterval(pullHistory, 5000);
    } else {
      vaultBox.innerHTML = '<div class="notice"><strong>解锁聊天</strong><br>请输入登录密码，解锁聊天保险库并恢复您的聊天身份。密码只用于在本页内存中派生密钥，不会上传或保存。<br>' +
        '<form class="row" id="vaultForm" style="margin-top:8px;"><input type="password" id="vaultPwd" placeholder="登录密码" autocomplete="current-password" class="grow"><button class="primary" type="submit">解锁聊天</button></form>' +
        '<p class="small" id="vaultSt" role="status"></p></div>';
      $('#vaultForm').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var pwd = $('#vaultPwd').value; var st = $('#vaultSt');
        st.className = 'small muted'; st.textContent = '正在解锁（密钥派生约需数秒）…';
        try {
          var res = await QFCrypto.unlock(pwd);
          st.className = 'small ok'; st.textContent = res && res.restored ? '已从保险库恢复聊天身份。' : '已生成本页聊天身份并发布公钥。';
          if (res && res.note) st.textContent += ' ' + res.note;
          vaultBox.innerHTML = '';
          pullHistory();
          chatTimer = setInterval(pullHistory, 5000);
        } catch (e) {
          st.className = 'small err'; st.textContent = uiErrText(e, '解锁失败，请重试。');
        }
      });
    }
    $('#emojiBtn').addEventListener('click', function () { var p = $('#emojiPanel'); p.hidden = !p.hidden; });
    view.querySelectorAll('[data-emoji]').forEach(function (b) { b.addEventListener('click', function () { var ta = $('#chatInput'); ta.value += b.getAttribute('data-emoji'); ta.focus(); }); });
    view.querySelectorAll('[data-sticker]').forEach(function (b) { b.addEventListener('click', function () { sendWire('qf1:' + JSON.stringify({ type: 'sticker', packId: 'twemoji', id: b.getAttribute('data-sticker') })); }); });
    $('#attachBtn').addEventListener('click', function () { $('#attachFile').click(); });
    $('#attachFile').addEventListener('change', async function () {
      var f = $('#attachFile').files[0]; if (!f) return;
      this.value = ''; // W-11：复位选择框，否则同一文件第二次选择不再触发 change
      if (!QFCrypto.isUnlocked || !QFCrypto.isUnlocked()) { status.className = 'small err'; status.textContent = '请先解锁聊天后再发送附件。'; return; }
      status.className = 'small muted'; status.textContent = '正在加密并上传附件…';
      try {
        var sealed = await QFCrypto.sealAndUploadBlob(peerId, f);
        var enc = await QFCrypto.encryptFor(peerId, sealed.wireText);
        var r = await api('/chat/send', { method: 'POST', body: { to: Number(peerId), ciphertext: enc.ciphertext, nonce: enc.nonce, msgId: enc.msgId, blobId: sealed.ref.blobId } });
        if (!r.ok) throw new Error(r.message || '附件发送失败。');
        status.textContent = ''; pullHistory();
      } catch (e) { status.className = 'small err'; status.textContent = uiErrText(e, '附件发送失败，请稍后重试。'); }
    });
    $('#chatSend').addEventListener('click', async function () {
      var ta = $('#chatInput'); var text = ta.value.trim(); if (!text) return;
      if (!QFCrypto.isUnlocked || !QFCrypto.isUnlocked()) { status.className = 'small err'; status.textContent = '请先解锁聊天后再发送消息。'; return; }
      // W-11：发送成功后才清空输入框，失败时原文保留可改可重发，不再丢稿。
      var sentOk = await sendWire(text);
      if (sentOk && ta.value.trim() === text) ta.value = '';
    });
  }

  // ---------- 安全中心 ----------
  // 全套操作与客户端、官网安全中心同一组服务端端点（/security/*、/passkeys/*），
  // 网页版此前只有状态查看，本次补齐：修改密码（三选一验证）、换绑邮箱（双向
  // 验码）、安全设置开关、设备下线/取消信任、通行密钥登记与删除、注销账号
  // （7 天冷静期、可撤销）。请求体口径与官网 assets/security.js 已验证实现一致。
  function secSetMsg(id, text, ok) {
    var e = document.getElementById(id); if (!e) return;
    e.textContent = text || '';
    e.className = 'small ' + (text ? (ok ? 'ok' : 'err') : 'muted');
  }
  // WebAuthn 编解码（与 @simplewebauthn 服务端 JSON 口径对接，同官网实现）
  function waB64uToBuf(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }
  function waBufToB64u(buf) {
    var bytes = new Uint8Array(buf || new ArrayBuffer(0)), s = '';
    bytes.forEach(function (b) { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function waPrepCreation(opts) {
    opts.challenge = waB64uToBuf(opts.challenge);
    if (opts.user && typeof opts.user.id === 'string') opts.user.id = waB64uToBuf(opts.user.id);
    (opts.excludeCredentials || []).forEach(function (c) { if (typeof c.id === 'string') c.id = waB64uToBuf(c.id); });
    return opts;
  }
  function waPrepRequest(opts) {
    opts.challenge = waB64uToBuf(opts.challenge);
    (opts.allowCredentials || []).forEach(function (c) { if (typeof c.id === 'string') c.id = waB64uToBuf(c.id); });
    return opts;
  }
  function waCredToJson(cred, isCreate) {
    var r = cred.response, out = {
      id: cred.id, rawId: waBufToB64u(cred.rawId), type: cred.type,
      response: { clientDataJSON: waBufToB64u(r.clientDataJSON) },
      clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {}
    };
    if (isCreate) {
      out.response.attestationObject = waBufToB64u(r.attestationObject);
      if (r.getTransports) { try { out.response.transports = r.getTransports(); } catch (e) {} }
    } else {
      out.response.authenticatorData = waBufToB64u(r.authenticatorData);
      out.response.signature = waBufToB64u(r.signature);
      if (r.userHandle) out.response.userHandle = waBufToB64u(r.userHandle);
    }
    return out;
  }
  function waHas() { return !!(window.PublicKeyCredential && navigator.credentials); }
  var secReauthTokens = { pwd: '', pk: '', del: '' };
  async function secDoReauth(purpose, slot, stateId, msgId) {
    if (!waHas()) { secSetMsg(msgId, '当前浏览器不支持通行密钥。', false); return ''; }
    if (!pkDomainOk()) { secSetMsg(msgId, PK_DOMAIN_NOTE, false); return ''; }
    try {
      var r = await api('/passkeys/reauth/options', { method: 'POST', body: { purpose: purpose } });
      if (!r.ok) throw new Error(r.message || '操作失败，请稍后重试。');
      var cred = await navigator.credentials.get({ publicKey: waPrepRequest(r.data.options) });
      var vr = await api('/passkeys/reauth/verify', { method: 'POST', body: { purpose: purpose, response: waCredToJson(cred, false) } });
      if (!vr.ok || !vr.data.reauthToken) throw new Error(vr.message || '操作失败，请稍后重试。');
      secReauthTokens[slot] = vr.data.reauthToken;
      var st = document.getElementById(stateId); if (st) st.textContent = '通行密钥验证已完成。';
      secSetMsg(msgId, '', true);
      return vr.data.reauthToken;
    } catch (e) {
      secSetMsg(msgId, waErrText(e, '通行密钥验证未完成，请重试。'), false);
      return '';
    }
  }
  function secVerifyBody(slot, pwdVal) {
    if (secReauthTokens[slot]) return { reauthToken: secReauthTokens[slot] };
    if (pwdVal) return { password: pwdVal };
    return null;
  }

  async function pageSecurity() {
    if (!loggedIn()) return needLogin('安全中心');
    view.innerHTML = '<div class="page-title">安全中心</div><div class="card"><p class="muted">正在加载…</p></div>';
    var r = await api('/security/me');
    if (!r.ok) { view.innerHTML = '<div class="page-title">安全中心</div><div class="card"><p class="err">' + esc(r.message) + '</p></div>'; return; }
    var d = r.data || {};
    var setR = await api('/security/settings');
    var loginProtection = setR.ok && setR.data ? setR.data.loginProtection !== false : d.loginProtection !== false;
    var devR = await api('/security/devices');
    var devs = devR.ok ? ((devR.data && devR.data.devices) || []) : null;
    var pkR = await api('/passkeys');
    var pks = pkR.ok ? ((pkR.data && (pkR.data.passkeys || pkR.data.credentials)) || []) : null;
    var deleting = d.status === 'deleting';
    secReauthTokens = { pwd: '', pk: '', del: '' };
    var pkGate = pkDomainOk() ? '' : ' disabled'; // 非正式域名：通行密钥入口置灰（删除走密码验证，不受影响）
    view.innerHTML =
      '<div class="page-title">安全中心</div>' +
      '<div class="card"><h2>账号概览</h2><table class="kv">' +
      '<tr><td>绑定邮箱</td><td>' + esc(d.email || meBasic().email || '—') + '</td></tr>' +
      '<tr><td>账户 ID</td><td>' + esc(meBasic().username || '—') + '</td></tr>' +
      '<tr><td>账号状态</td><td>' + esc(deleting ? '注销冷静期中' : (d.status === 'active' || !d.status ? '正常' : d.status)) + '</td></tr>' +
      '<tr><td>我的积分</td><td>' + (d.points && d.points.balance != null ? esc(d.points.balance) + ' 分' : '—') + '</td></tr></table>' +
      (deleting ? '<div class="notice warnbox" style="margin-top:12px;"><strong>账号正处于注销冷静期</strong><br>生效时间：' + esc(fmtTs(d.deletionEffectiveAt)) + '。冷静期内可撤销注销；到期后账号数据将被删除且不可恢复。<br><button class="primary" id="secCancelDelete" type="button" style="margin-top:10px;">撤销注销</button><p class="small" id="secOverviewMsg" role="status"></p></div>' : '') +
      '</div>' +

      '<div class="card"><h2>修改密码</h2>' +
      '<p class="muted small">先完成身份验证（三选一）：输入当前密码、使用通行密钥，或获取邮箱验证码；再设置新密码。修改后其他设备将退出登录，本设备保持登录。</p>' +
      '<form class="stack" id="secPwdForm">' +
      '<label>当前密码<input type="password" id="secCurPwd" autocomplete="current-password" placeholder="使用当前密码验证时填写"></label>' +
      '<label>邮箱验证码<span class="row"><input id="secPwdCode" inputmode="numeric" class="grow" placeholder="使用邮箱验证码验证时填写"><button class="ghost" type="button" id="secPwdSendCode">发送验证码</button></span></label>' +
      '<span class="row"><button class="ghost" type="button" id="secPwdPasskey"' + pkGate + '>使用通行密钥验证</button><span class="small ok" id="secPwdReauthState"></span></span>' +
      '<label>新密码（8 至 72 位）<input type="password" id="secNewPwd" autocomplete="new-password"></label>' +
      '<label>确认新密码<input type="password" id="secNewPwd2" autocomplete="new-password"></label>' +
      '<p class="small" id="secPwdMsg" role="status"></p>' +
      '<span><button class="primary" type="submit">确认修改密码</button></span></form></div>' +

      '<div class="card"><h2>更换绑定邮箱</h2>' +
      '<p class="muted small">需同时验证当前邮箱与新邮箱的验证码。更换后其他设备将退出登录，系统会向新旧邮箱发送通知。</p>' +
      '<form class="stack" id="secEmailForm">' +
      '<label>新邮箱<input type="email" id="secNewEmail" autocomplete="email"></label>' +
      '<label>当前邮箱验证码<span class="row"><input id="secOldCode" inputmode="numeric" class="grow"><button class="ghost" type="button" id="secOldSend">向当前邮箱发送</button></span></label>' +
      '<label>新邮箱验证码<span class="row"><input id="secNewCode" inputmode="numeric" class="grow"><button class="ghost" type="button" id="secNewSend">向新邮箱发送</button></span></label>' +
      '<p class="small" id="secEmailMsg" role="status"></p>' +
      '<span><button class="primary" type="submit">确认更换邮箱</button></span></form></div>' +

      '<div class="card"><h2>安全设置</h2>' +
      '<label class="switch-row"><input type="checkbox" id="secLoginProtection" ' + (loginProtection ? 'checked' : '') + '> 开启环境异常双重验证</label>' +
      '<p class="muted small">开启后，在新设备或异常登录环境下登录时，需完成邮箱验证码校验后方可登录；登录国家与以往明显不同同样属于触发情形，出国旅行时触发属于正常现象。关闭此开关后，强制安全复核仍然有效：在刷新令牌被重用、短时间多次登录失败等高风险情形下，系统仍会要求重新验证身份，该复核不可关闭。</p>' +
      '<p class="small" id="secSettingsMsg" role="status"></p></div>' +

      '<div class="card"><h2>登录设备</h2><div id="secDevList">' +
      (devs === null ? '<p class="err">' + esc(devR.message || '设备加载失败，请稍后重试。') + '</p>' : (devs.length ? '<div class="list">' + devs.map(function (x) {
        var meta = [x.platform || '', x.region || '', '最近活跃 ' + fmtTs(x.lastActiveAt), x.online ? '在线' : '', x.trusted ? '已信任' : ''].filter(Boolean).join(' · ');
        return '<div class="item"><span class="grow"><strong>' + esc(x.name || x.deviceName || '设备') + '</strong><br><span class="muted small">' + esc(meta) + '</span></span>' +
          (x.isCurrent ? '<span class="tag blue">本设备</span>' : '<button class="ghost" data-devlogout="' + esc(x.id) + '" style="padding:6px 12px;">下线</button>' + (x.trusted ? '<button class="mini-btn" data-devuntrust="' + esc(x.id) + '">取消信任</button>' : '')) + '</div>';
      }).join('') + '</div>' : '<p class="muted">暂无设备记录。</p>')) + '</div><p class="small" id="secDevMsg" role="status"></p></div>' +

      '<div class="card"><h2>通行密钥</h2>' +
      (pkDomainOk() ? '' : '<p class="notice small" style="margin-bottom:10px;">' + PK_DOMAIN_NOTE + '</p>') +
      (pks === null ? '<p class="err">' + esc(pkR.message || '通行密钥加载失败，请稍后重试。') + '</p>' : (pks.length ? '<div class="list">' + pks.map(function (pk) {
        return '<div class="item"><span class="grow"><strong>' + esc(pk.name || '通行密钥') + '</strong><br><span class="muted small">创建于 ' + esc(fmtTs(pk.createdAt)) + '</span></span><button class="mini-btn danger" data-pkdel="' + esc(pk.id) + '">删除</button></div>';
      }).join('') + '</div>' : '<p class="muted">尚未创建通行密钥。</p>')) +
      '<form class="stack" id="secPkForm" style="margin-top:14px;">' +
      '<label>验证密码<input type="password" id="secPkPwd" autocomplete="current-password" placeholder="创建或删除通行密钥时验证"></label>' +
      '<span class="row"><button class="ghost" type="button" id="secPkPasskey"' + pkGate + '>使用通行密钥验证</button><span class="small ok" id="secPkReauthState"></span></span>' +
      '<label>新通行密钥名称<input type="text" id="secPkName" placeholder="例如：我的手机"></label>' +
      '<p class="small" id="secPkMsg" role="status"></p>' +
      '<span><button class="primary" type="button" id="secPkCreate"' + pkGate + '>创建通行密钥</button></span></form>' +
      (waHas() ? '' : '<p class="warn small">当前浏览器不支持通行密钥，无法在此创建或使用通行密钥验证。</p>') + '</div>' +

      '<div class="card"><h2>注销账号</h2>' +
      (deleting ? '<p class="muted">账号已在注销冷静期中（见上方账号概览），冷静期内可撤销。</p>' :
      '<p class="muted small">注销申请提交后有 7 天冷静期，冷静期内登录即可撤销；冷静期届满后，服务器账号数据将被删除且不可恢复。注销后账号积分将清零，未使用的兑换码将作废。提交注销前须完成身份复核。</p>' +
      '<form class="stack" id="secDelForm">' +
      '<label>账户密码<input type="password" id="secDelPwd" autocomplete="current-password" placeholder="使用密码验证时填写"></label>' +
      '<span class="row"><button class="ghost" type="button" id="secDelPasskey"' + pkGate + '>使用通行密钥验证</button><span class="small ok" id="secDelReauthState"></span></span>' +
      '<label class="switch-row"><input type="checkbox" id="secDelConfirm"> 我已了解上述后果，确认申请注销账号。</label>' +
      '<p class="small" id="secDelMsg" role="status"></p>' +
      '<span><button class="own-danger" type="button" id="secDelSubmit">提交注销申请</button></span></form>') + '</div>' +

      '<div class="card"><h2>账号异常处理</h2><p class="muted">账户被冻结或封禁时，可通过下方入口处理：<a href="#/appeal/status">查询申诉状态</a> · <a href="#/appeal/recovery">提交找回申诉</a> · <a href="#/appeal/ban">提交封禁申诉</a></p></div>';

    // ----- 概览：撤销注销 -----
    var cancelBtn = $('#secCancelDelete');
    if (cancelBtn) cancelBtn.addEventListener('click', async function () {
      var rr = await api('/security/delete-account/cancel', { method: 'POST', body: {} });
      secSetMsg('secOverviewMsg', rr.ok ? (rr.message || '注销已撤销。') : (rr.message || '撤销失败，请稍后重试。'), rr.ok);
      if (rr.ok) setTimeout(pageSecurity, 800);
    });

    // ----- 修改密码 -----
    $('#secPwdSendCode').addEventListener('click', async function () {
      var btn = this;
      var rr = await api('/security/password/code', { method: 'POST', body: {} });
      secSetMsg('secPwdMsg', rr.ok ? '验证码已发送至您的绑定邮箱，请查收。' : (rr.message || '发送失败，请稍后重试。'), rr.ok);
      if (rr.ok || rr.status === 429) armCodeCooldown(btn, 60);
    });
    $('#secPwdPasskey').addEventListener('click', function () { secDoReauth('change_password', 'pwd', 'secPwdReauthState', 'secPwdMsg'); });
    $('#secPwdForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var np = $('#secNewPwd').value, np2 = $('#secNewPwd2').value;
      if (np.length < 8 || np.length > 72) { secSetMsg('secPwdMsg', '密码长度需为 8 至 72 位，请重新输入。', false); return; }
      if (np !== np2) { secSetMsg('secPwdMsg', '两次输入的密码不一致，请重新核对。', false); return; }
      var body = { newPassword: np };
      var vb = secVerifyBody('pwd', '');
      if (vb && vb.reauthToken) body.reauthToken = vb.reauthToken;
      else if ($('#secCurPwd').value) body.currentPassword = $('#secCurPwd').value;
      else if ($('#secPwdCode').value.trim()) body.emailCode = $('#secPwdCode').value.trim();
      else { secSetMsg('secPwdMsg', '请先完成身份验证：输入当前密码、使用通行密钥，或输入邮箱验证码。', false); return; }
      var rr = await api('/security/password/change', { method: 'POST', body: body });
      secSetMsg('secPwdMsg', rr.ok ? (rr.message || '密码已修改。') : (rr.message || '修改失败，请稍后重试。'), rr.ok);
      if (rr.ok) { secReauthTokens.pwd = ''; $('#secCurPwd').value = ''; $('#secPwdCode').value = ''; $('#secNewPwd').value = ''; $('#secNewPwd2').value = ''; }
    });

    // ----- 换绑邮箱 -----
    $('#secOldSend').addEventListener('click', async function () {
      var btn = this;
      var rr = await api('/security/email/request-old-code', { method: 'POST', body: {} });
      secSetMsg('secEmailMsg', rr.ok ? '验证码已发送至当前绑定邮箱，请查收。' : (rr.message || '发送失败，请稍后重试。'), rr.ok);
      if (rr.ok || rr.status === 429) armCodeCooldown(btn, 60);
    });
    $('#secNewSend').addEventListener('click', async function () {
      var btn = this;
      var ne = $('#secNewEmail').value.trim();
      if (!ne) { secSetMsg('secEmailMsg', '请先填写新邮箱。', false); return; }
      var rr = await api('/security/email/request-new-code', { method: 'POST', body: { newEmail: ne } });
      secSetMsg('secEmailMsg', rr.ok ? '验证码已发送至新邮箱，请查收。' : (rr.message || '发送失败，请稍后重试。'), rr.ok);
      if (rr.ok || rr.status === 429) armCodeCooldown(btn, 60);
    });
    $('#secEmailForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var ne = $('#secNewEmail').value.trim(), oc = $('#secOldCode').value.trim(), nc = $('#secNewCode').value.trim();
      if (!ne || !oc || !nc) { secSetMsg('secEmailMsg', '请完整填写新邮箱与两处验证码。', false); return; }
      var rr = await api('/security/email/confirm', { method: 'POST', body: { newEmail: ne, oldCode: oc, newCode: nc } });
      if (rr.ok) {
        saveSession({ email: ne }, !!localStorage.getItem('qf_access_token'));
        secSetMsg('secEmailMsg', rr.message || '绑定邮箱已更换。', true);
        setTimeout(pageSecurity, 800);
      } else {
        secSetMsg('secEmailMsg', rr.code === 'EMAIL_TAKEN' ? '该邮箱已被其他账户绑定。' : (rr.message || '更换失败，请稍后重试。'), false);
      }
    });

    // ----- 安全设置开关 -----
    var lpToggle = $('#secLoginProtection');
    if (lpToggle) lpToggle.addEventListener('change', async function () {
      var rr = await api('/security/settings', { method: 'PUT', body: { loginProtection: !!lpToggle.checked } });
      secSetMsg('secSettingsMsg', rr.ok ? (rr.message || '设置已保存。') : (rr.message || '保存失败，请稍后重试。'), rr.ok);
      if (!rr.ok) lpToggle.checked = !lpToggle.checked;
    });

    // ----- 设备下线 / 取消信任 -----
    view.querySelectorAll('[data-devlogout]').forEach(function (b) { b.addEventListener('click', async function () {
      b.disabled = true;
      var rr = await api('/security/devices/' + encodeURIComponent(b.getAttribute('data-devlogout')) + '/logout', { method: 'POST', body: {} });
      if (rr.ok) { pageSecurity(); return; }
      b.disabled = false;
      secSetMsg('secDevMsg', rr.message || '退出该设备失败，请稍后重试。', false);
    }); });
    view.querySelectorAll('[data-devuntrust]').forEach(function (b) { b.addEventListener('click', async function () {
      b.disabled = true;
      var rr = await api('/security/devices/' + encodeURIComponent(b.getAttribute('data-devuntrust')) + '/untrust', { method: 'POST', body: {} });
      if (rr.ok) { pageSecurity(); return; }
      b.disabled = false;
      secSetMsg('secDevMsg', rr.message || '取消信任失败，请稍后重试。', false);
    }); });

    // ----- 通行密钥 -----
    var pkFormEl = $('#secPkForm'); if (pkFormEl) pkFormEl.addEventListener('submit', function (ev) { ev.preventDefault(); });
    var delFormEl = $('#secDelForm'); if (delFormEl) delFormEl.addEventListener('submit', function (ev) { ev.preventDefault(); });
    $('#secPkPasskey').addEventListener('click', function () { secDoReauth('passkey_manage', 'pk', 'secPkReauthState', 'secPkMsg'); });
    $('#secPkCreate').addEventListener('click', async function () {
      if (!waHas()) { secSetMsg('secPkMsg', '当前浏览器不支持通行密钥。', false); return; }
      if (!pkDomainOk()) { secSetMsg('secPkMsg', PK_DOMAIN_NOTE, false); return; }
      var vb = secVerifyBody('pk', $('#secPkPwd').value);
      if (!vb) { secSetMsg('secPkMsg', '请先完成身份验证：输入验证密码，或使用通行密钥验证。', false); return; }
      try {
        var rr = await api('/passkeys/register/options', { method: 'POST', body: vb });
        if (!rr.ok) throw new Error(rr.message || '操作失败，请稍后重试。');
        var cred = await navigator.credentials.create({ publicKey: waPrepCreation(rr.data.options) });
        var body = { response: waCredToJson(cred, true) };
        var nm = $('#secPkName').value.trim(); if (nm) body.name = nm;
        var vr = await api('/passkeys/register/verify', { method: 'POST', body: body });
        if (!vr.ok) throw new Error(vr.message || '操作失败，请稍后重试。');
        secReauthTokens.pk = '';
        secSetMsg('secPkMsg', vr.message || '通行密钥已创建。', true);
        setTimeout(pageSecurity, 800);
      } catch (e) { secSetMsg('secPkMsg', waErrText(e, '创建失败，请稍后重试。'), false); }
    });
    view.querySelectorAll('[data-pkdel]').forEach(function (b) { b.addEventListener('click', async function () {
      var vb = secVerifyBody('pk', $('#secPkPwd').value);
      if (!vb) { secSetMsg('secPkMsg', '请先完成身份验证：输入验证密码，或使用通行密钥验证。', false); return; }
      if (!await appConfirmDlg('删除通行密钥', '确定删除这个通行密钥吗？删除后将无法再用它登录或验证。', true)) return;
      var rr = await api('/passkeys/' + encodeURIComponent(b.getAttribute('data-pkdel')), { method: 'DELETE', body: vb });
      secSetMsg('secPkMsg', rr.ok ? (rr.message || '通行密钥已删除。') : (rr.message || '删除失败，请稍后重试。'), rr.ok);
      if (rr.ok) { secReauthTokens.pk = ''; setTimeout(pageSecurity, 800); }
    }); });

    // ----- 注销账号 -----
    var delPasskey = $('#secDelPasskey');
    if (delPasskey) delPasskey.addEventListener('click', function () { secDoReauth('delete_account', 'del', 'secDelReauthState', 'secDelMsg'); });
    var delSubmit = $('#secDelSubmit');
    if (delSubmit) delSubmit.addEventListener('click', async function () {
      if (!$('#secDelConfirm').checked) { secSetMsg('secDelMsg', '请先勾选确认注销。', false); return; }
      var body = { confirm: true };
      var vb = secVerifyBody('del', '');
      if (vb && vb.reauthToken) body.reauthToken = vb.reauthToken;
      else if ($('#secDelPwd').value) body.password = $('#secDelPwd').value;
      else { secSetMsg('secDelMsg', '请先完成身份验证：输入账户密码，或使用通行密钥验证。', false); return; }
      var rr = await api('/security/delete-account', { method: 'POST', body: body });
      secSetMsg('secDelMsg', rr.ok ? (rr.message || '注销申请已提交，进入 7 天冷静期。') : (rr.message || '提交失败，请稍后重试。'), rr.ok);
      if (rr.ok) { secReauthTokens.del = ''; setTimeout(pageSecurity, 900); }
    });
  }

  // ---------- 智能客服 ----------
  // 契约：POST /support/ask {text, sessionId?, kbId?, notThis?} → {action, text, sessionId, options?:[{kbId,label}], alternates?:[{kbId,label}], kbId?}
  // POST /support/handoff {sessionId?} → {notice, sessionId, supportConfigured}
  // GET /support/session?sessionId= → {sessionId, tone, status, messages:[{id,authorRole,displayName,kbId,body,createdAt}]}
  async function pageSupport() {
    if (!loggedIn()) return needLogin('智能客服');
    view.innerHTML = '<div class="card"><div class="row"><span class="brand-mark" style="width:44px;height:44px;border-radius:50%;font-size:15px;">客</span><span class="grow"><strong style="font-size:16.5px;">智能客服</strong><br><span class="muted small">自动回复系统 · 非人工坐席</span></span></div>' +
      '<p class="notice" style="margin-top:10px;">智能客服会话不使用端对端加密，会话内容将传输至服务器处理，以便为您提供帮助。请勿在会话中发送密码、验证码或其他敏感信息。</p>' +
      '<div class="chatlog" id="supLog"><div class="bubble">您好，我是智能客服（自动回复系统）。您可以向我咨询账号、积分、论坛与客户端使用方面的问题，我会尽力为您解答；如需人工处理，可点击下方「转人工」。</div></div>' +
      '<div class="chips">' + ['流量用完了怎么办', '积分如何获得', '账号被冻结了怎么办', '如何加入营地'].map(function (q) { return '<button type="button" class="chip" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<div id="supOptions"></div>' +
      '<div class="composer"><textarea id="supInput" placeholder="请输入您的问题" rows="2"></textarea><button class="primary" id="supSend" type="button">发送</button></div>' +
      '<p class="row" style="margin-top:8px;"><button class="ghost" id="humanBtn" type="button">转人工</button><span class="small" id="supStatus" role="status"></span></p></div>';
    var sessionId = null, lastMsgId = 0, handedOff = false, askBusy = false;
    var mySeq = ++supportSeq;
    if (supportTimer) { clearInterval(supportTimer); supportTimer = null; }
    var log = $('#supLog'), st = $('#supStatus');
    function addBubble(text, mine, name) {
      var b = el('<div class="bubble' + (mine ? ' mine' : '') + '"></div>');
      b.textContent = text;
      if (name && !mine) { var s = document.createElement('div'); s.className = 'muted small'; s.textContent = name; b.prepend(s); }
      log.appendChild(b); log.scrollTop = log.scrollHeight;
    }
    function showOptions(items) {
      var box = $('#supOptions'); if (!box) return;
      if (!items || !items.length) { box.innerHTML = ''; return; }
      box.innerHTML = '<p class="row wrap" style="margin-top:8px;">' + items.map(function (o) { return '<button type="button" class="chip" data-kb="' + esc(o.kbId) + '">' + esc(o.label) + '</button>'; }).join('') +
        '<button type="button" class="chip" data-notthis="1">不是这些</button></p>';
      box.querySelectorAll('[data-kb]').forEach(function (b) { b.addEventListener('click', function () { ask('', { kbId: b.getAttribute('data-kb') }); }); });
      var nb = box.querySelector('[data-notthis]');
      if (nb) nb.addEventListener('click', function () { ask('', { notThis: true }); });
    }
    async function ask(text, extra) {
      // 在飞守卫（W-05）：上一条未回时连点发送/快捷问题不再重复发问。
      if (askBusy) return;
      askBusy = true;
      var sendBtn = $('#supSend'); if (sendBtn) sendBtn.disabled = true;
      try {
        extra = extra || {};
        if (text) addBubble(text, true);
        var body = Object.assign({ text: text || '' }, extra);
        if (sessionId) body.sessionId = sessionId;
        var r = await api('/support/ask', { method: 'POST', body: body });
        if (!r.ok) { addBubble(r.message || '客服服务暂时不可用，请稍后重试。', false, '智能客服'); return; }
        var d = r.data || {};
        if (d.sessionId) sessionId = d.sessionId;
        if (d.text) addBubble(d.text, false, '智能客服');
        if (d.action === 'clarify' && d.options) showOptions(d.options);
        else if (d.alternates && d.alternates.length) showOptions(d.alternates);
        else showOptions(null);
        if (d.action === 'handoff_offer') { st.className = 'small warn'; st.textContent = '如需人工处理，请点击「转人工」。'; }
        if (d.action === 'handoff') handedOff = true;
      } finally {
        askBusy = false;
        var sb = $('#supSend'); if (sb) sb.disabled = false;
      }
    }
    async function pollSession() {
      if (!sessionId) return;
      var r = await api('/support/session' + (sessionId ? '?sessionId=' + encodeURIComponent(sessionId) : ''));
      if (!r.ok || !r.data) return;
      var msgs = r.data.messages || [];
      msgs.forEach(function (m) {
        if (m.id <= lastMsgId) return;
        lastMsgId = m.id;
        if (m.authorRole === 'agent') addBubble(m.body, false, m.displayName || '人工客服');
      });
    }
    // 进入时恢复既有会话消息流
    (async function () {
      var r = await api('/support/session');
      if (mySeq !== supportSeq) return; // 已离开客服页，迟到的恢复回包直接丢弃
      if (sessionId) return; // W-Q1：用户已先行发问并建立新会话，不再被旧会话覆盖
      if (r.ok && r.data && r.data.sessionId) {
        sessionId = r.data.sessionId;
        handedOff = r.data.status === 'open';
        (r.data.messages || []).forEach(function (m) { if (m.id > lastMsgId) lastMsgId = m.id; });
        if (handedOff) { st.className = 'small warn'; st.textContent = '本会话已转人工，人工客服的回复将显示在这里。'; if (!supportTimer) supportTimer = setInterval(pollSession, 6000); }
      }
    })();
    $('#supSend').addEventListener('click', function () { var t = $('#supInput').value.trim(); if (t) { $('#supInput').value = ''; ask(t); } });
    view.querySelectorAll('[data-q]').forEach(function (b) { b.addEventListener('click', function () { ask(b.getAttribute('data-q')); }); });
    $('#humanBtn').addEventListener('click', async function () {
      var body = {}; if (sessionId) body.sessionId = sessionId;
      var r = await api('/support/handoff', { method: 'POST', body: body });
      if (!r.ok) { st.className = 'small err'; st.textContent = r.message || '转人工失败，请稍后重试。'; return; }
      var d = r.data || {}; if (d.sessionId) sessionId = d.sessionId;
      handedOff = true;
      addBubble(d.notice || '已为您转接人工客服。', false, '智能客服');
      if (d.supportConfigured === false) {
        st.className = 'small warn';
        st.textContent = '工单已建立，但人工客服账号尚未完成配置，处理可能延迟；紧急事项请发送邮件至 a718983610@gmail.com。';
      } else { st.className = 'small ok'; st.textContent = '已转人工，人工客服的回复将显示在本会话中。'; }
      if (!supportTimer) supportTimer = setInterval(pollSession, 6000);
    });
  }

  // ---------- 意见反馈 ----------
  // 与 App 意见反馈、官网「联系我们」同一通道：POST /feedback {content,contact?,
  // platform:'website',source:'website',appVersion:'web',deviceHash}，内容 ≤2000 字。
  // 未登录也可提交（服务端按设备限频），登录时带令牌便于维护者定位账号。
  function pageFeedback() {
    view.innerHTML = '<div class="page-title">意见反馈</div>' +
      '<div class="card"><p class="muted">使用中遇到的问题、对产品功能的建议，都可以写在这里。反馈将直达维护者，与客户端「意见反馈」为同一通道；需要即时答疑可先咨询<a href="#/support">智能客服</a>。</p>' +
      '<form class="stack wide" id="fbForm">' +
      '<label>反馈内容（最多 2000 字）<textarea name="content" rows="6" required maxlength="2000" placeholder="请描述问题现象或您的建议，越具体越有助于处理。"></textarea></label>' +
      '<label>联系方式（选填）<input name="contact" maxlength="200" placeholder="邮箱或其他联系方式，便于回复您"></label>' +
      '<div class="err" id="fbErr"></div><div class="ok" id="fbOk"></div>' +
      '<span><button class="primary" type="submit" id="fbSubmit">提交反馈</button></span></form>' +
      (loggedIn() ? '' : '<p class="muted small" style="margin-top:10px;">您尚未登录，也可以直接提交反馈；登录后提交便于维护者定位您的账号。</p>') + '</div>';
    $('#fbForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      var content = String(fd.get('content') || '').trim();
      var contact = String(fd.get('contact') || '').trim();
      var err = $('#fbErr'), ok = $('#fbOk'); err.textContent = ''; ok.textContent = '';
      if (!content) { err.textContent = '请先写下您的意见或建议，再点提交。'; return; }
      var btn = $('#fbSubmit'); btn.disabled = true;
      var r = await api('/feedback', { method: 'POST', body: { content: content, contact: contact || undefined, platform: 'website', source: 'website', appVersion: 'web', deviceHash: deviceId() } });
      btn.disabled = false;
      if (r.ok) { ok.textContent = '反馈已提交，感谢您的意见。维护者会尽快查看处理。'; ev.target.reset(); }
      else err.textContent = r.message || '提交失败，请稍后重试。';
    });
  }

  // ---------- 我的 ----------
  // 契约：GET /profile → ownView {userId,email,username,nickname,effectiveNickname,hasAvatar,...}
  // PUT /profile {nickname} / {avatar:{mime,dataBase64}|null}；头像 ≤200KB（AVATAR_MAX_BYTES），超出先在本地压缩
  // 头像提示定版文案（正式口吻，超限与失败各一句，全站头像报错统一使用）：
  var AVATAR_TOO_LARGE_TEXT = '头像大小超过 200KB 上限，压缩后仍不符合要求，请更换较小的图片后重试。';
  var AVATAR_FAIL_TEXT = '头像上传失败，请检查网络连接后重试。';
  async function pageMe() {
    if (!loggedIn()) return needLogin('个人资料');
    view.innerHTML = '<div class="card"><h2>个人资料</h2><p class="muted">正在加载…</p></div>';
    var r = await api('/profile');
    var pts = await api('/points/me');
    if (!r.ok) { view.innerHTML = '<div class="card"><h2>个人资料</h2><p class="err">' + esc(r.message) + '</p></div>'; return; }
    var p = r.data || {};
    if (p.avatarUpdatedAt) myAvatarVer = p.avatarUpdatedAt;
    var nick = p.nickname || p.effectiveNickname || '';
    if (nick) saveSession({ nickname: nick, username: p.username || '', email: p.email || '', userId: p.userId }, !!localStorage.getItem('qf_access_token')), renderIdentity();
    var uid = p.userId != null ? p.userId : myUserId();
    view.innerHTML = '<div class="profile-head"><div class="ph-cover"></div><div class="ph-body"><div class="ph-row"><span class="ph-avatar" id="meAvatar"><span class="avatar-ph">' + esc((nick || 'Q').slice(0, 1)) + '</span></span>' +
      '<span><span class="ph-name">' + esc(nick || '未设置昵称') + '</span><br><span class="ph-sub">账户 ID：' + esc(p.username || '—') + '</span></span></div>' +
      '<table class="kv" style="margin-top:14px;"><tr><td>邮箱</td><td>' + esc(p.email || meBasic().email || '—') + '</td></tr>' +
      '<tr><td>我的积分</td><td>' + (pts.ok ? esc(pts.data && pts.data.balance != null ? pts.data.balance : '—') + ' 分（<a href="#/points">查看明细</a>）' : '加载失败') + '</td></tr></table></div></div>' +
      '<div class="card"><h2>编辑资料</h2><form class="stack" id="nickForm"><label>昵称<input name="nickname" value="' + esc(nick) + '" maxlength="32" required></label>' +
      '<div class="err" id="nickErr"></div><div class="ok" id="nickOk"></div><button class="primary" type="submit">保存昵称</button></form>' +
      '<h3>更换头像</h3><p class="row wrap"><input type="file" id="avatarFile" accept="image/png,image/jpeg,image/webp,image/gif"><button class="ghost" id="avatarUpload" type="button">上传头像</button></p>' +
      '<p class="muted small">头像大小上限 200KB；超出时将先在本地压缩（缩放为 JPEG）再上传。</p><p class="small" id="avatarSt" role="status"></p></div>' +
      '<div class="card"><h2>我的个人二维码</h2><div id="qrBox"><p class="muted">正在生成…</p></div><p class="muted small">二维码内容为您的账户 ID，好友可扫码后按账户 ID 精确搜索添加您。</p></div>' +
      '<div class="card"><h2>我的论坛主页</h2><p class="muted">查看公开个人主页：' + (uid ? '<a href="#/forum/user/' + esc(uid) + '">前往我的个人主页</a>' : '—') + '</p></div>' +
      '<div class="card"><h2>意见反馈</h2><p class="muted">问题与建议直达维护者：<a href="#/feedback">前往意见反馈</a>；即时答疑可咨询<a href="#/support">智能客服</a>。</p></div>';
    if (p.hasAvatar) showAvatar($('#meAvatar'), '/profile/avatar', myAvatarVer, 76);
    renderQr(uid);
    $('#nickForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var nickname = String(new FormData(ev.target).get('nickname')).trim();
      var rr = await api('/profile', { method: 'PUT', body: { nickname: nickname } });
      if (rr.ok) { $('#nickErr').textContent = ''; $('#nickOk').textContent = '昵称已保存。'; pageMe(); }
      else $('#nickErr').textContent = rr.message || '保存失败，请稍后重试。';
    });
    $('#avatarUpload').addEventListener('click', async function () {
      var f = $('#avatarFile').files[0]; var st = $('#avatarSt');
      if (!f) { st.className = 'small err'; st.textContent = '请先选择图片文件。'; return; }
      st.className = 'small muted'; st.textContent = '正在处理…';
      try {
        var payload = await prepareAvatar(f);
        var rr = await api('/profile', { method: 'PUT', body: { avatar: payload } });
        if (rr.ok && !(rr.data && rr.data.hasAvatar === false)) {
          // 回显以服务端回包为准：版本取 PUT 回包的 avatarUpdatedAt，就地刷新本页与抽屉头像位。
          // 此前成功后整页重渲 pageMe() 会把「头像已更新。」提示一并冲掉，且旧取图走
          // HTTP 缓存拿到旧图，用户看到的是“提示没了、头像也没变”。
          if (rr.data && rr.data.avatarUpdatedAt) myAvatarVer = rr.data.avatarUpdatedAt;
          else myAvatarVer = Math.floor(Date.now() / 1000);
          avatarBust++;
          showAvatar($('#meAvatar'), '/profile/avatar', myAvatarVer, 76);
          renderIdentity();
          st.className = 'small ok'; st.textContent = '头像已更新。';
        } else if (rr.code === 'AVATAR_TOO_LARGE') {
          st.className = 'small err'; st.textContent = AVATAR_TOO_LARGE_TEXT;
        } else {
          st.className = 'small err'; st.textContent = AVATAR_FAIL_TEXT;
        }
      } catch (e) {
        st.className = 'small err';
        st.textContent = (e && e.code === 'AVATAR_TOO_LARGE') ? AVATAR_TOO_LARGE_TEXT : AVATAR_FAIL_TEXT;
      }
    });
  }
  // 头像预处理：≤200KB 直接传；超出用 canvas 缩放到最长边 512 并以 JPEG 递减质量压缩到 ≤200KB
  async function prepareAvatar(file) {
    var MAX = 200 * 1024;
    var buf = new Uint8Array(await file.arrayBuffer());
    if (buf.length <= MAX && /image\/(png|jpeg|webp|gif)/.test(file.type)) return { mime: file.type, dataBase64: b64OfBytes(buf) };
    var url = URL.createObjectURL(file);
    try {
      var img = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = url; });
      var scale = Math.min(1, 512 / Math.max(img.width, img.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
      // W-21：与营地头像口径统一——先填白底再绘图，透明 PNG 转 JPEG 不再变黑底。
      var actx = canvas.getContext('2d');
      actx.fillStyle = '#ffffff'; actx.fillRect(0, 0, canvas.width, canvas.height);
      actx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var q = 0.85, blob = null;
      while (q >= 0.4) {
        blob = await new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', q); });
        if (blob && blob.size <= MAX) break;
        q -= 0.15;
      }
      if (!blob || blob.size > MAX) { var tooBig = new Error(AVATAR_TOO_LARGE_TEXT); tooBig.code = 'AVATAR_TOO_LARGE'; throw tooBig; }
      return { mime: 'image/jpeg', dataBase64: b64OfBytes(new Uint8Array(await blob.arrayBuffer())) };
    } finally { URL.revokeObjectURL(url); }
  }
  // 个人二维码：轻量 QR 生成（字节模式、纠错等级 M），内容为账户 ID 字符串
  function renderQr(uid) {
    var box = $('#qrBox'); if (!box) return;
    if (!uid) { box.innerHTML = '<p class="muted">账户信息不完整，暂无法生成二维码。</p>'; return; }
    var me = meBasic();
    var content = me.username || String(uid);
    try {
      var qr = makeQr(content);
      var size = qr.length, cell = 6, dim = size * cell + 16;
      var rects = '';
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (qr[y][x]) rects += '<rect x="' + (8 + x * cell) + '" y="' + (8 + y * cell) + '" width="' + cell + '" height="' + cell + '"/>';
      box.innerHTML = '<svg width="' + dim + '" height="' + dim + '" viewBox="0 0 ' + dim + ' ' + dim + '" style="background:#fff;border:1px solid var(--line);border-radius:8px;" role="img" aria-label="个人二维码">' + rects + '</svg><p class="muted small">内容：账户 ID ' + esc(content) + '</p>';
    } catch (e) { box.innerHTML = '<p class="muted">二维码生成失败。您的账户 ID 为：' + esc(content) + '</p>'; }
  }
  // 最小 QR 编码器（按 Nayuki QR generator 的标准构造重写：字节模式、纠错 M、
  // BCH 格式信息、掩码按四项惩罚规则选优；已用 jsQR 解码实测可扫，见测试记录）
  function makeQr(text) {
    var bytes = Array.prototype.slice.call(new TextEncoder().encode(text));
    var EXP = new Array(512), LOG = new Array(256);
    (function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (var i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
    function gfMul(a, b) { return a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0; }
    function rsEncode(data, ecLen) {
      // Nayuki 参考实现：先算除数多项式（根 α^0..α^(ecLen-1)），再做多项式除法取余数
      var divisor = new Array(ecLen - 1).fill(0); divisor.push(1);
      var root = 1;
      for (var i = 0; i < ecLen; i++) {
        for (var j = 0; j < divisor.length; j++) {
          divisor[j] = gfMul(divisor[j], root);
          if (j + 1 < divisor.length) divisor[j] ^= divisor[j + 1];
        }
        root = gfMul(root, 2);
      }
      var res = new Array(ecLen).fill(0);
      data.forEach(function (b) {
        var f = b ^ res.shift(); res.push(0);
        divisor.forEach(function (coef, i2) { res[i2] ^= gfMul(coef, f); });
      });
      return res;
    }
    var VT = { 1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]], 6: [16, [[2, 27], [2, 28]]], 7: [18, [[2, 31], [2, 32]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[2, 36], [2, 37], [2, 38]]], 10: [26, [[2, 43], [2, 44], [2, 45]]] };
    var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
    var version = 0;
    for (var v = 1; v <= 10; v++) {
      var td = VT[v][1].reduce(function (s, g) { return s + g[0] * g[1]; }, 0);
      if (4 + (v <= 9 ? 8 : 16) + bytes.length * 8 <= td * 8) { version = v; break; }
    }
    if (!version) throw new Error('内容过长');
    var totalData = VT[version][1].reduce(function (s, g) { return s + g[0] * g[1]; }, 0);
    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(0x4, 4); push(bytes.length, version <= 9 ? 8 : 16);
    bytes.forEach(function (b) { push(b, 8); });
    var capBits = totalData * 8;
    push(0, Math.min(4, capBits - bits.length));
    while (bits.length % 8) bits.push(0);
    var dataCw = [];
    for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; dataCw.push(b); }
    var pi = 0; while (dataCw.length < totalData) dataCw.push([0xec, 0x11][pi++ % 2]);
    var ecLen = VT[version][0], blocks = [], off = 0;
    VT[version][1].forEach(function (g) { for (var k = 0; k < g[0]; k++) { var d = dataCw.slice(off, off + g[1]); off += g[1]; blocks.push({ d: d, ec: rsEncode(d, ecLen) }); } });
    var allCw = [];
    var maxD = Math.max.apply(null, blocks.map(function (x) { return x.d.length; }));
    for (var i = 0; i < maxD; i++) blocks.forEach(function (x) { if (i < x.d.length) allCw.push(x.d[i]); });
    for (var i = 0; i < ecLen; i++) blocks.forEach(function (x) { allCw.push(x.ec[i]); });
    var dataBits = [];
    allCw.forEach(function (b) { for (var j = 7; j >= 0; j--) dataBits.push((b >>> j) & 1); });
    // ---- 矩阵 ----
    var size = version * 4 + 17;
    var mod = [], fn = [];
    for (var y = 0; y < size; y++) { mod.push(new Array(size).fill(0)); fn.push(new Array(size).fill(false)); }
    function setF(x, y, val, isFn) { if (x >= 0 && x < size && y >= 0 && y < size) { mod[y][x] = val ? 1 : 0; if (isFn) fn[y][x] = true; } }
    for (var i = 0; i < size; i++) { setF(i, 6, i % 2 === 0, true); setF(6, i, i % 2 === 0, true); }
    function finder(cx, cy) { for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) { var d = Math.max(Math.abs(dx), Math.abs(dy)); setF(cx + dx, cy + dy, d !== 2 && d !== 4, true); } }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var al = ALIGN[version];
    al.forEach(function (ax) { al.forEach(function (ay) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, true);
    }); });
    setF(8, size - 8, true, true);
    // 格式信息保留格
    for (var i = 0; i <= 8; i++) { fn[8][i] = true; fn[i][8] = true; }
    for (var i = 0; i < 8; i++) { fn[8][size - 1 - i] = true; fn[size - 1 - i][8] = true; }
    fn[8][6] = true; fn[6][8] = true;
    // 数据之字形填充（Nayuki 扫描序）
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!fn[y][x]) { mod[y][x] = idx < dataBits.length ? dataBits[idx++] : 0; }
        }
      }
    }
    // 掩码选优：逐掩码应用→写格式位→算惩罚→取最小
    function formatBits(mask) {
      var data = (0 << 3) | mask; // 纠错等级 M 的格式指示位为 00
      var rem = data;
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      return (((data << 10) | rem) ^ 0x5412) & 0x7fff;
    }
    function drawFormat(m, mask) {
      var fb = formatBits(mask);
      function getBit(i) { return (fb >>> i) & 1; }
      for (var i = 0; i <= 5; i++) m[8][i] = getBit(i);
      m[8][7] = getBit(6); m[8][8] = getBit(7); m[7][8] = getBit(8);
      for (var i = 9; i < 15; i++) m[14 - i][8] = getBit(i);
      for (var i = 0; i < 8; i++) m[8][size - 1 - i] = getBit(i);
      for (var i = 8; i < 15; i++) m[size - 15 + i][8] = getBit(i);
      m[size - 8][8] = 1;
    }
    function applyMask(m, mask) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        if (fn[y][x]) continue;
        var inv = false;
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          case 7: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
        }
        if (inv) m[y][x] ^= 1;
      }
    }
    function penalty(m) {
      var pen = 0;
      // RULE1 行列连续同色
      function rule1(line) { var p = 0, run = 1; for (var i = 1; i <= line.length; i++) { if (i < line.length && line[i] === line[i - 1]) run++; else { if (run >= 5) p += run - 2; run = 1; } } return p; }
      for (var y = 0; y < size; y++) pen += rule1(m[y]);
      for (var x = 0; x < size; x++) pen += rule1(m.map(function (r) { return r[x]; }));
      // RULE2 2x2 同色块
      for (var y = 0; y < size - 1; y++) for (var x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) pen += 3;
      // RULE3 类定位图模式
      function rule3(line) { var p = 0; for (var i = 0; i + 7 <= line.length; i++) { var s = line.slice(i, i + 7).join(''); if (s === '1011101') { var before = i >= 4 && line.slice(i - 4, i).join('') === '0000'; var after = i + 11 <= line.length && line.slice(i + 7, i + 11).join('') === '0000'; if (before || after) p += 40; } } return p; }
      for (var y = 0; y < size; y++) pen += rule3(m[y]);
      for (var x = 0; x < size; x++) pen += rule3(m.map(function (r) { return r[x]; }));
      // RULE4 黑白比例
      var dark = 0; m.forEach(function (r) { r.forEach(function (c) { dark += c; }); });
      var total = size * size, k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      if (k > 0) pen += k * 10;
      return pen;
    }
    var best = null, bestPen = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var cand = mod.map(function (r) { return r.slice(); });
      applyMask(cand, mask);
      drawFormat(cand, mask);
      var p = penalty(cand);
      if (p < bestPen) { bestPen = p; best = cand; }
    }
    return best;
  }


  // ---------- 站长管理台（#/owner） ----------
  // 入口显隐仅为体验：是否站长以服务端 GET /owner/me 为准，全部接口另有角色校验。
  var ownerState = null; var ownerProbedToken = '';
  function toggleOwnerNav(show) { var a = $('#ownerNavLink'); if (a) a.hidden = !show; }
  async function probeOwner() {
    var tk = storeGet('qf_access_token') || '';
    if (!tk) { ownerState = false; ownerProbedToken = ''; toggleOwnerNav(false); return; }
    if (ownerProbedToken === tk && ownerState !== null) return;
    ownerProbedToken = tk;
    var r = await api('/owner/me');
    ownerState = !!(r.ok && r.data && r.data.isOwner);
    toggleOwnerNav(ownerState);
  }
  function ownerDenied() {
    view.innerHTML = '<div class="card"><h2>站长管理台</h2><p class="muted">当前账号没有管理权限。如需协助，请通过智能客服联系维护者。</p></div>';
  }
  // ---------- 站内提示组件（替代浏览器原生 alert/confirm，全站统一） ----------
  function appToast(msg) {
    var t = el('<div class="app-toast" role="status">' + esc(msg) + '</div>');
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 3400);
  }
  function appNotice(title, text) {
    return new Promise(function (resolve) {
      var ov = el('<div class="own-overlay"><div class="own-dialog" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p style="white-space:pre-line;">' + esc(text) + '</p><div class="row-end"><button type="button" class="primary" data-act="ok">知道了</button></div></div></div>');
      document.body.appendChild(ov);
      function close() { ov.remove(); resolve(); }
      ov.addEventListener('click', function (ev) { if (ev.target === ov) close(); });
      ov.querySelector('[data-act="ok"]').addEventListener('click', close);
    });
  }
  function appConfirmDlg(title, body, danger) {
    return new Promise(function (resolve) {
      var ov = el('<div class="own-overlay"><div class="own-dialog" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p>' + esc(body) + '</p><div class="row-end"><button type="button" class="ghost" data-act="no">取消</button><button type="button" class="' + (danger ? 'own-danger' : 'primary') + '" data-act="yes">确定</button></div></div></div>');
      document.body.appendChild(ov);
      function close(v) { ov.remove(); resolve(v); }
      ov.addEventListener('click', function (ev) { if (ev.target === ov) close(false); });
      ov.querySelector('[data-act="no"]').addEventListener('click', function () { close(false); });
      ov.querySelector('[data-act="yes"]').addEventListener('click', function () { close(true); });
    });
  }
  // 带输入框的站内弹窗（W-01：替代浏览器原生 prompt）：点「提交」且内容
  // 非空时返回文本，取消/点遮罩返回 null；空内容在弹窗内提示、不关闭。
  function appPromptDlg(title, body, placeholder, okLabel) {
    return new Promise(function (resolve) {
      var ov = el('<div class="own-overlay"><div class="own-dialog" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3>' + (body ? '<p>' + esc(body) + '</p>' : '') + '<label>举报原因<textarea id="appPromptText" rows="3" maxlength="500" placeholder="' + esc(placeholder || '') + '"></textarea></label><p class="own-err" style="display:none"></p><div class="row-end"><button type="button" class="ghost" data-act="no">取消</button><button type="button" class="primary" data-act="yes">' + esc(okLabel || '提交') + '</button></div></div></div>');
      document.body.appendChild(ov);
      var ta = ov.querySelector('#appPromptText'); if (ta) ta.focus();
      function close(v) { ov.remove(); resolve(v); }
      ov.addEventListener('click', function (ev) { if (ev.target === ov) close(null); });
      ov.querySelector('[data-act="no"]').addEventListener('click', function () { close(null); });
      ov.querySelector('[data-act="yes"]').addEventListener('click', function () {
        var v = ta.value.trim();
        if (!v) { ownFieldErr(ov, '请填写举报原因。'); return; }
        close(v);
      });
    });
  }
  // ownerConfirm 弹窗内的表单校验提示位：collect() 校验不过时调用并 return null。
  function ownFieldErr(ov, msg) {
    var e = ov.querySelector('.own-err');
    if (e) { e.textContent = msg; e.style.display = ''; }
  }

  // 单步确认弹窗：讲清对象与后果，站长核对后点「确认无误」即执行，不再输
  // 登录密码复核（用户 2026-10-24 20:39 拍板；服务端站长闸已同步改为只验
  // body.confirm === true，审计留痕照旧）。返回业务字段 + { confirm:true }
  // 或 null（取消）。fieldsHtml 为附加业务表单，collect() 从表单读取业务字段。
  function ownerConfirm(opts) {
    return new Promise(function (resolve) {
      var ov = el('<div class="own-overlay"><div class="own-dialog" role="dialog" aria-modal="true">' +
        '<h3>' + esc(opts.title) + '</h3><p>' + esc(opts.body) + '</p>' +
        (opts.fieldsHtml || '') +
        '<p class="own-err" style="display:none"></p>' +
        '<p class="muted small">该操作将记录在管理审计中。请核对无误后再执行。</p>' +
        '<div class="row-end"><button type="button" class="ghost" data-act="cancel">取消</button>' +
        '<button type="button" class="' + (opts.danger ? 'own-danger' : 'primary') + '" data-act="go">确认无误</button></div></div></div>');
      document.body.appendChild(ov);
      if (opts.onShow) opts.onShow(ov);
      function close(v) { ov.remove(); resolve(v); }
      ov.addEventListener('click', function (ev) { if (ev.target === ov) close(null); });
      ov.querySelector('[data-act="cancel"]').addEventListener('click', function () { close(null); });
      ov.querySelector('[data-act="go"]').addEventListener('click', function () {
        var fields = opts.collect ? opts.collect(ov) : {};
        if (fields === null) return;
        fields.confirm = true;
        close(fields);
      });
    });
  }
  async function ownerDo(path, body, doneMsg) {
    var r = await api(path, { method: 'POST', body: body });
    if (!r.ok) { appToast(r.message || '操作失败，请稍后重试。'); return null; }
    if (doneMsg) appToast(doneMsg);
    return r.data;
  }
  function banBadge(u) {
    if (u.restricted && u.restricted.hasActiveBan) return ' <span class="own-badge warn">封禁中' + (u.restricted.banLevel === 'permanent' ? '（永久）' : '') + '</span>';
    if (u.restricted && u.restricted.passwordFrozen) return ' <span class="own-badge warn">密码冻结</span>';
    return '';
  }

  async function pageOwner(r) {
    if (!loggedIn()) return needLogin('站长管理台');
    await probeOwner();
    if (!ownerState) return ownerDenied();
    if (r.arg === 'user' && r.sub) return pageOwnerUser(Number(r.sub));
    if (r.arg === 'reviews') return pageOwnerReviews();
    if (r.arg === 'redeem') return pageOwnerRedeem();
    if (r.arg === 'audit') return pageOwnerAudit();
    return pageOwnerUsers(r);
  }

  async function pageOwnerUsers(r) {
    view.innerHTML = '<div class="card"><h2>站长管理台 · 用户管理</h2>' +
      '<p class="row wrap"><a class="ghost" href="#/owner/reviews">审核队列</a><a class="ghost" href="#/owner/redeem">兑换审核</a><a class="ghost" href="#/owner/audit">管理审计</a></p>' +
      '<form id="ownSearch" class="row wrap" style="margin-top:10px;"><select id="ownBy"><option value="username">按账户 ID</option><option value="email">按邮箱</option></select>' +
      '<input id="ownQ" type="text" placeholder="输入账户 ID 或邮箱（支持开头匹配）" style="flex:1;min-width:180px;padding:9px 10px;border:1px solid var(--line);border-radius:8px;">' +
      '<button class="primary" type="submit">搜索</button></form>' +
      '<p class="muted small">邮箱在列表中打码展示；完整邮箱仅可在用户详情中单条查看，查看将记录在管理审计中。</p>' +
      '<div id="ownList"><p class="muted">正在加载…</p></div></div>';
    $('#ownSearch').addEventListener('submit', function (ev) { ev.preventDefault(); loadOwnerUsers(); });
    loadOwnerUsers();
  }
  async function loadOwnerUsers(pageNum) {
    var q = ($('#ownQ') && $('#ownQ').value || '').trim();
    var by = ($('#ownBy') && $('#ownBy').value) || 'username';
    var box = $('#ownList'); if (!box) return;
    var path = '/owner/users?limit=20&offset=' + ((pageNum || 0) * 20) + (q ? '&q=' + encodeURIComponent(q) + '&by=' + by : '');
    var r = await api(path);
    if (!r.ok) { box.innerHTML = '<p class="muted">加载失败：' + esc(r.message || '') + '</p>'; return; }
    var users = (r.data && r.data.users) || [];
    if (!users.length) { box.innerHTML = '<p class="muted">没有符合条件的用户。</p>'; return; }
    box.innerHTML = '<div class="list">' + users.map(function (u) {
      var avVer = u.avatarUrl ? (String(u.avatarUrl).split('v=')[1] || '') : '';
      return '<a class="item" href="#/owner/user/' + u.id + '">' + avatarSlotHtml(u.id, avVer, !!u.avatarUrl, u.nickname || u.username, 40) +
        '<span class="grow"><strong>' + esc(u.nickname || u.username) + '</strong>' + ownerBadgeHtml(u.id, ownerFlagOf(u)) + banBadge(u) + '<br><span class="muted small">账户 ID：' + esc(u.username) + ' ｜ ' + esc(u.emailMasked) + ' ｜ 注册于 ' + esc(fmtTs(u.createdAt)) + '</span></span><span aria-hidden="true">›</span></a>';
    }).join('') + '</div>' +
      '<p class="row"><button class="ghost" id="ownPrev"' + ((pageNum || 0) === 0 ? ' disabled' : '') + '>上一页</button>' +
      '<button class="ghost" id="ownNext"' + (users.length < 20 ? ' disabled' : '') + '>下一页</button>' +
      '<span class="muted small">共 ' + (r.data.total || 0) + ' 个用户</span></p>';
    fillAvatars(box);
    var prev = $('#ownPrev'), next = $('#ownNext');
    if (prev) prev.addEventListener('click', function () { loadOwnerUsers((pageNum || 0) - 1); });
    if (next) next.addEventListener('click', function () { loadOwnerUsers((pageNum || 0) + 1); });
  }

  function kvTable(rows) {
    return '<table class="kv">' + rows.map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + x[1] + '</td></tr>'; }).join('') + '</table>';
  }
  async function pageOwnerUser(uid) {
    view.innerHTML = '<div class="card"><p><a href="#/owner">‹ 返回用户列表</a></p><h2>用户详情</h2><div id="ownBasic"><p class="muted">正在加载…</p></div></div>' +
      '<div class="card"><h3>管理操作</h3><div class="own-tabs" id="ownActions"></div><div id="ownActionMsg"></div></div>' +
      '<div class="card"><div class="own-tabs" id="ownTabs"></div><div id="ownTabBody"><p class="muted">请选择上方页签查看。</p></div></div>';
    var r = await api('/owner/users/' + uid + '/basic');
    var box = $('#ownBasic');
    if (!r.ok) { box.innerHTML = '<p class="muted">加载失败：' + esc(r.message || '') + '</p>'; return; }
    var b = r.data;
    box.innerHTML = kvTable([
      ['账户 ID', esc(b.username) + '（内部编号 ' + b.id + '）'],
      ['昵称', esc(b.nickname || '（未设置）') + ownerBadgeHtml(uid, ownerFlagOf(b))],
      ['邮箱', esc(b.emailMasked) + ' <button class="ghost" id="ownViewEmail" type="button">查看完整邮箱</button>'],
      ['账号状态', esc(zhCode(ACCOUNT_STATUS, b.status, '其他状态')) + ((b.passwordFrozen && b.passwordFrozen.frozen) ? ' ｜ 密码已冻结' : '') + ((b.deletion && b.deletion.requested) ? ' ｜ 已申请注销（生效时间 ' + esc(fmtTs(b.deletion.effectiveAt || 0)) + '）' : '')],
      ['密码', b.passwordSet.set ? '已设置' : '未设置（谷歌新账号待补设）'],
      ['谷歌登录', b.googleBound ? '已绑定' : '未绑定'],
      ['注册时间', esc(fmtTs(b.createdAt))],
      ['最近活跃', (b.lastActiveAt || b.lastLoginAt) ? esc(fmtTs(b.lastActiveAt || b.lastLoginAt)) : '—'],
    ]);
    fillAvatars(box);
    $('#ownViewEmail').addEventListener('click', async function () {
      var f = await ownerConfirm({ title: '查看完整邮箱', body: '您将查看该用户的完整邮箱地址。此操作将记录在管理审计中（记录不含邮箱本身）。' });
      if (!f) return;
      var vr = await api('/owner/users/' + uid + '/view-email', { method: 'POST', body: f });
      if (!vr.ok) { appToast(vr.message || '查看失败，请稍后重试。'); return; }
      appNotice('完整邮箱', '该用户的完整邮箱：' + vr.data.email);
    });
    renderOwnerActions(uid, b);
    renderOwnerTabs(uid);
  }
  function renderOwnerActions(uid, b) {
    var box = $('#ownActions'); if (!box) return;
    var acts = [
      ['setpw', '替用户设置新密码'], ['nickname', '修改昵称'], ['email', '更换绑定邮箱'],
      ['ban', '封禁'], ['unban', '解除封禁'], ['unfreeze', '解除密码冻结'], ['disconnect', '静默断开连接'],
    ];
    box.innerHTML = acts.map(function (a) { return '<button type="button" data-act="' + a[0] + '">' + a[1] + '</button>'; }).join('');
    box.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () { ownerAction(uid, btn.getAttribute('data-act')); });
    });
  }
  async function ownerAction(uid, act) {
    var msg = $('#ownActionMsg');
    function done(t) { if (msg) msg.innerHTML = '<p style="color:#137333;">' + esc(t) + '</p>'; pageOwnerUser(uid); }
    if (act === 'setpw') {
      var f1 = await ownerConfirm({
        title: '替用户设置新密码', danger: true,
        body: '您将为该用户设置一个新密码。执行后：该用户在所有设备上的登录状态将被退出；如其密码处于冻结状态将一并解除；系统会发邮件通知该用户。',
        // W-18：密码框改 password 类型默认不可见，另加「显示」开关供站长核对。
        fieldsHtml: '<label for="fNewPw">新密码（8 至 72 位）</label><input id="fNewPw" type="password" autocomplete="new-password"><label class="small" style="display:block;margin-top:6px;"><input type="checkbox" id="fNewPwShow"> 显示密码</label>',
        onShow: function (ov) {
          var pw = ov.querySelector('#fNewPw'), sw = ov.querySelector('#fNewPwShow');
          if (pw && sw) sw.addEventListener('change', function () { pw.type = sw.checked ? 'text' : 'password'; });
        },
        collect: function (ov) { var v = ov.querySelector('#fNewPw').value; if (v.length < 8 || v.length > 72) { ownFieldErr(ov, '新密码长度须为 8 至 72 位。'); return null; } return { newPassword: v }; },
      });
      if (!f1) return;
      var r1 = await ownerDo('/owner/users/' + uid + '/set-password', f1);
      if (r1) done(r1.message || '密码已重置。');
    } else if (act === 'nickname') {
      var f2 = await ownerConfirm({
        title: '修改昵称', body: '新昵称将即时生效并公开显示，须符合内容审核要求。',
        fieldsHtml: '<label for="fNick">新昵称</label><input id="fNick" type="text" maxlength="24">',
        collect: function (ov) { var v = ov.querySelector('#fNick').value.trim(); if (!v) { ownFieldErr(ov, '请填写新昵称。'); return null; } return { nickname: v }; },
      });
      if (!f2) return;
      var r2 = await ownerDo('/owner/users/' + uid + '/profile', f2);
      if (r2) done(r2.message || '资料已更新。');
    } else if (act === 'email') {
      var f3 = await ownerConfirm({
        title: '更换绑定邮箱', danger: true,
        body: '您将把该用户的绑定邮箱更换为新邮箱。执行后：该用户在所有设备上的登录状态将被退出；新邮箱与原邮箱都会收到通知邮件。',
        fieldsHtml: '<label for="fMail">新邮箱</label><input id="fMail" type="email" autocomplete="off">',
        collect: function (ov) { var v = ov.querySelector('#fMail').value.trim(); if (!v) { ownFieldErr(ov, '请填写新邮箱。'); return null; } return { newEmail: v }; },
      });
      if (!f3) return;
      var r3 = await ownerDo('/owner/users/' + uid + '/change-email', f3);
      if (r3) done(r3.message || '绑定邮箱已更换。');
    } else if (act === 'ban') {
      var f4 = await ownerConfirm({
        title: '封禁用户', danger: true,
        body: '封禁后该用户将无法登录（警告除外），其现有登录状态会被退出。封禁原因将按既定口径向该用户展示。',
        fieldsHtml: '<label for="fLevel">封禁级别</label><select id="fLevel"><option value="warn">警告（仅记录）</option><option value="timed">限时封禁</option><option value="permanent">永久封禁</option></select>' +
          '<div id="fDaysWrap" style="display:none;"><label for="fDays">限时封禁天数（必填）</label><input id="fDays" type="number" min="1" value="7"></div>' +
          '<label for="fReason">封禁原因（向用户展示）</label><input id="fReason" type="text" value="违反用户协议">' +
          '<label><input type="checkbox" id="fDev" style="width:auto;"> 同时封禁该用户名下设备</label>',
        onShow: function (ov) {
          var sel = ov.querySelector('#fLevel'), wrap = ov.querySelector('#fDaysWrap');
          function sync() { wrap.style.display = sel.value === 'timed' ? '' : 'none'; }
          sel.addEventListener('change', sync); sync();
        },
        collect: function (ov) {
          var out = { level: ov.querySelector('#fLevel').value, reasonText: ov.querySelector('#fReason').value.trim() || '违反用户协议', alsoBanDevices: ov.querySelector('#fDev').checked };
          if (out.level === 'timed') {
            var days = Number(ov.querySelector('#fDays').value);
            if (!days || days < 1) { ownFieldErr(ov, '限时封禁请填写封禁天数（至少 1 天）。'); return null; }
            out.durationDays = days;
          }
          return out;
        },
      });
      if (!f4) return;
      var r4 = await ownerDo('/owner/users/' + uid + '/ban', f4);
      if (r4) done('已执行封禁（级别：' + r4.level + '）。');
    } else if (act === 'unban') {
      var f5 = await ownerConfirm({
        title: '解除封禁', body: '将解除该用户当前全部生效中的封禁（含永久封禁）。站长人工处置优先于自动处置，解除后自动系统不会就同一事由立即再次处置。',
        fieldsHtml: '<label><input type="checkbox" id="fDevU" style="width:auto;"> 同时解除其名下设备的封禁</label>',
        collect: function (ov) { return { includeDevices: ov.querySelector('#fDevU').checked }; },
      });
      if (!f5) return;
      var r5 = await ownerDo('/owner/users/' + uid + '/unban', f5);
      if (r5) done('已解除封禁 ' + r5.lifted + ' 条。');
    } else if (act === 'unfreeze') {
      var f6 = await ownerConfirm({ title: '解除密码冻结', body: '将立即解除该用户的密码冻结并清零密码连错计数，该用户可重新登录。' });
      if (!f6) return;
      var r6 = await ownerDo('/owner/users/' + uid + '/unfreeze', f6);
      if (r6) done(r6.message || '已解除冻结。');
    } else if (act === 'disconnect') {
      var f7 = await ownerConfirm({
        title: '静默断开连接', danger: true,
        body: '将断开该用户当前的全部在线连接（仅断开本次连接，不封禁账号，其可重新连接）。对方不会收到任何提示。断开原因仅记录在管理审计中。',
        fieldsHtml: '<label for="fWhy">断开原因（仅审计留痕）</label><select id="fWhy"><option value="SECURITY_RISK">安全风险</option><option value="ABUSE_SUSPECTED">疑似滥用</option><option value="USER_REQUESTED">用户本人请求</option><option value="OTHER">其他</option></select>',
        collect: function (ov) { return { reasonCode: ov.querySelector('#fWhy').value }; },
      });
      if (!f7) return;
      var r7 = await ownerDo('/owner/users/' + uid + '/disconnect', f7);
      if (r7) done('断开指令已发送，将在对方下一次心跳时生效（已排队 ' + (r7.queuedDevices || 0) + ' 台设备）。');
    }
  }
  function renderOwnerTabs(uid) {
    var tabs = [['points', '积分与兑换'], ['devices', '设备与连接'], ['forum', '论坛'], ['risk', '风控与处置'], ['audit', '管理审计']];
    var box = $('#ownTabs'); if (!box) return;
    box.innerHTML = tabs.map(function (t, i) { return '<button type="button" data-tab="' + t[0] + '"' + (i === 0 ? ' class="active"' : '') + '>' + t[1] + '</button>'; }).join('');
    box.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        box.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        btn.classList.add('active');
        loadOwnerTabSafe(uid, btn.getAttribute('data-tab'));
      });
    });
    loadOwnerTabSafe(uid, 'points');
  }
  async function loadOwnerTabSafe(uid, tab) {
    try { await loadOwnerTab(uid, tab); } catch (e) {
      if (window.console && console.error) console.error(e);
      var body = $('#ownTabBody'); if (!body) return;
      body.innerHTML = '<p class="muted">本页签加载出错，请重试。</p><p><button class="ghost" id="ownTabRetry" type="button">重试</button></p>';
      var b = $('#ownTabRetry');
      if (b) b.addEventListener('click', function () { loadOwnerTabSafe(uid, tab); });
    }
  }
  async function loadOwnerTab(uid, tab) {
    var body = $('#ownTabBody'); if (!body) return;
    body.innerHTML = '<p class="muted">正在加载…</p>';
    var fail = function (r) { body.innerHTML = '<p class="muted">加载失败：' + esc((r && r.message) || '') + '</p>'; };
    if (tab === 'points') {
      var r = await api('/owner/users/' + uid + '/points'); if (!r.ok) return fail(r);
      var d = r.data;
      var orders = (d.orders || []).map(function (o) {
        return '<tr><td>#' + o.id + '</td><td>' + esc(o.productName || '') + '</td><td>' + o.pricePoints + ' 分</td><td>' + esc(zhCode(ORDER_STATUS, o.status, '处理中')) + '</td><td>' + esc(o.payoutAddressMasked || o.payoutEmailMasked || '—') + ((o.payoutAddressMasked || o.payoutEmailMasked) ? ' <button class="ghost" data-payout="' + o.id + '" type="button">查看完整发放信息</button>' : '') + '</td></tr>';
      }).join('');
      body.innerHTML = kvTable([['可用积分', String(d.pointsBalance)], ['冻结积分', String(d.frozenPoints)], ['累计获得', String(d.totalEarned)], ['累计消耗', String(d.totalSpent)], ['附件用量', (((d.attachmentUsage && d.attachmentUsage.bytes) || 0) / 1048576).toFixed(2) + ' MB（' + ((d.attachmentUsage && d.attachmentUsage.files) || 0) + ' 个文件）']]) +
        '<h3>兑换订单</h3>' + (orders ? '<table class="kv"><tr><td>订单</td><td>商品</td><td>积分</td><td>状态</td><td>发放信息</td></tr>' + orders + '</table>' : '<p class="muted">暂无兑换订单。</p>') +
        '<p><button class="ghost" id="ownLedger" type="button">查看积分流水</button></p><div id="ownLedgerBox"></div>';
      body.querySelectorAll('[data-payout]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var f = await ownerConfirm({ title: '查看完整发放信息', body: '您将查看该订单的完整发放信息（收款地址或接收邮箱）。此操作将记录在管理审计中（记录不含具体内容）。' });
          if (!f) return;
          var vr = await api('/owner/users/' + uid + '/view-payout', { method: 'POST', body: { orderId: Number(btn.getAttribute('data-payout')), confirm: true } });
          if (!vr.ok) { appToast(vr.message || '查看失败，请稍后重试。'); return; }
          appNotice('完整发放信息', '发放方式：' + (vr.data.payoutMethod || '') + '\n收款地址：' + (vr.data.payoutAddress || '—') + '\n接收邮箱：' + (vr.data.payoutEmail || '—'));
        });
      });
      var lb = $('#ownLedger');
      if (lb) lb.addEventListener('click', async function () {
        var lr = await api('/owner/users/' + uid + '/ledger?limit=50');
        var lbox = $('#ownLedgerBox');
        if (!lr.ok) { lbox.innerHTML = '<p class="muted">加载失败。</p>'; return; }
        var rows = (lr.data.ledger || []).map(function (x) { return '<tr><td>' + esc(fmtTs(x.createdAt)) + '</td><td>' + esc(zhCode(LEDGER_TYPE, x.type, '其他')) + '</td><td>' + (x.amount > 0 ? '+' : '') + x.amount + '</td><td>' + x.balanceAfter + '</td><td>' + esc(x.note || '') + '</td></tr>'; }).join('');
        lbox.innerHTML = rows ? '<table class="kv"><tr><td>时间</td><td>类型</td><td>变动</td><td>余额</td><td>备注</td></tr>' + rows + '</table>' : '<p class="muted">暂无积分流水。</p>';
      });
    } else if (tab === 'devices') {
      var rd = await api('/owner/users/' + uid + '/devices'); if (!rd.ok) return fail(rd);
      var rc = await api('/owner/users/' + uid + '/connection');
      var devs = (rd.data.devices || []).map(function (x) {
        return '<tr><td>' + esc(x.name || '（未知设备）') + '</td><td>' + esc(x.platform || '') + '</td><td>' + esc(x.region || '—') + '</td><td>' + (x.lastActiveAt ? esc(fmtTs(x.lastActiveAt)) : '—') + '</td><td>' + (x.trusted ? '已信任' : '未信任') + '</td></tr>';
      }).join('');
      var conn = rc.ok && rc.data.online ? '当前在线（连接数 ' + rc.data.devices.length + '，流量汇总 ' + rc.data.devices.reduce(function (s, x) { return s + (x.trafficBytes || 0); }, 0) + ' 字节）' : '当前不在线';
      body.innerHTML = '<p>连接状态：<strong>' + esc(conn) + '</strong></p>' +
        (devs ? '<table class="kv"><tr><td>设备</td><td>平台</td><td>地区</td><td>最近活跃</td><td>信任</td></tr>' + devs + '</table>' : '<p class="muted">暂无设备记录。</p>') +
        '<p class="muted small">通行密钥：' + ((rd.data.passkeys && rd.data.passkeys.enrolled) ? '已创建 ' + rd.data.passkeys.count + ' 个' : '未创建') + '。出于隐私保护，管理台不展示连接来源地址与访问目标。</p>';
    } else if (tab === 'forum') {
      var rf = await api('/owner/users/' + uid + '/forum'); if (!rf.ok) return fail(rf);
      var f = rf.data;
      body.innerHTML = kvTable([
        ['已发布帖子', String(f.stats.publishedPosts)], ['已发布回复', String(f.stats.publishedReplies)], ['累计获赞', String(f.stats.likesReceived)],
        ['创建的营地', (f.camps.created || []).map(function (c) { return esc(c.name) + '（' + esc(zhCode(CAMP_STATUS, c.status, '处理中')) + '）'; }).join('、') || '无'],
        ['加入营地数', String(f.camps.joinedCount)],
        ['被举报次数', String(f.reports.reportedTimes) + '（成立 ' + f.reports.upheldTimes + ' 次）'],
        ['千赞奖励申请', (f.rewardApplications || []).length + ' 条'],
      ]);
    } else if (tab === 'risk') {
      var rr2 = await api('/owner/users/' + uid + '/risk'); if (!rr2.ok) return fail(rr2);
      var bans = (rr2.data.bans || []).map(function (x) {
        return '<tr><td>' + (x.targetKind === 'user' ? '账号' : '设备') + '</td><td>' + esc(zhCode(BAN_LEVEL, x.level, '其他')) + '</td><td>' + esc(zhCode(BAN_SOURCE, x.source, '其他')) + '</td><td>' + esc(zhCode(BAN_STATUS, x.status, '其他')) + '</td><td>' + esc(fmtTs(x.createdAt)) + '</td><td>' + esc(x.reasonCode || '') + '</td></tr>';
      }).join('');
      body.innerHTML = bans ? '<table class="kv"><tr><td>对象</td><td>级别</td><td>来源</td><td>状态</td><td>时间</td><td>原因码</td></tr>' + bans + '</table>' : '<p class="muted">暂无封禁记录。</p>';
    } else if (tab === 'audit') {
      var ra = await api('/owner/users/' + uid + '/audit?limit=50'); if (!ra.ok) return fail(ra);
      var rows2 = (ra.data.audit || []).map(function (x) { return '<tr><td>' + esc(fmtTs(x.createdAt)) + '</td><td>' + esc(x.operator) + '</td><td>' + esc(x.action) + '</td><td>' + esc(x.detail || '') + '</td></tr>'; }).join('');
      body.innerHTML = rows2 ? '<table class="kv"><tr><td>时间</td><td>操作者</td><td>动作</td><td>摘要</td></tr>' + rows2 + '</table>' : '<p class="muted">暂无针对该用户的管理记录。</p>';
    }
  }

  async function pageOwnerReviews() {
    view.innerHTML = '<div class="card"><p><a href="#/owner">‹ 返回用户列表</a></p><h2>审核队列</h2>' +
      '<div class="own-tabs" id="ownQ">' +
      [['forum', '论坛待审'], ['appeals', '封号申诉'], ['recovery', '找回申诉'], ['rewards', '千赞奖励'], ['orders', '兑换订单']].map(function (t, i) { return '<button type="button" data-q="' + t[0] + '"' + (i === 0 ? ' class="active"' : '') + '>' + t[1] + '</button>'; }).join('') +
      '</div><div id="ownQBody"><p class="muted">正在加载…</p></div></div>';
    $('#ownQ').querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $('#ownQ').querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        btn.classList.add('active');
        loadOwnerQueueSafe(btn.getAttribute('data-q'));
      });
    });
    loadOwnerQueueSafe('forum');
  }
  async function loadOwnerQueueSafe(kind) {
    try { await loadOwnerQueue(kind); } catch (e) {
      if (window.console && console.error) console.error(e);
      var body = $('#ownQBody'); if (!body) return;
      body.innerHTML = '<p class="muted">本队列加载出错，请重试。</p><p><button class="ghost" id="ownQRetry" type="button">重试</button></p>';
      var b = $('#ownQRetry');
      if (b) b.addEventListener('click', function () { loadOwnerQueueSafe(kind); });
    }
  }
  function reviewButtons(html) { return '<span class="row" style="margin-top:6px;">' + html + '</span>'; }
  // 驳回理由表单片段（站长 2026-10-24 21:06 令）：字段名按服务端 handler 口径
  // ——封号申诉为 note（必填），其余审核为 reason；前端一律必填才可提交。
  function rejectReasonForm(field) {
    var isNote = field === 'note';
    var word = isNote ? '备注' : '原因';
    return {
      fieldsHtml: '<label for="fReviewReason">驳回' + word + '（必填' + (isNote ? '' : '，将告知提交人') + '）</label><textarea id="fReviewReason" rows="3" maxlength="500" placeholder="请填写驳回' + word + '"></textarea>',
      collect: function (ov) {
        var v = ov.querySelector('#fReviewReason').value.trim();
        if (!v) { ownFieldErr(ov, '驳回必须填写' + word + '。'); return null; }
        var out = {}; out[field] = v; return out;
      }
    };
  }
  // 手填兑换码表单片段（站长 2026-10-24 21:07 令）：礼品卡类订单通过时填码
  // 即时发放，字段 code 与服务端 adminReviewOrder 口径一致；长度口径同服务端
  //（4–200、无控制字符），前端先拦明显错误。
  function giftCodeForm() {
    return {
      fieldsHtml: '<label for="fGiftCode">兑换码（必填，通过后立即发放给该用户）</label><input id="fGiftCode" type="text" autocomplete="off" maxlength="200" placeholder="输入要发放的兑换码">',
      collect: function (ov) {
        var v = ov.querySelector('#fGiftCode').value.trim();
        if (!v) { ownFieldErr(ov, '请填写兑换码。'); return null; }
        if (v.length < 4) { ownFieldErr(ov, '兑换码长度不对（至少 4 个字符）。'); return null; }
        return { code: v };
      }
    };
  }
  async function loadOwnerQueue(kind) {
    var body = $('#ownQBody'); if (!body) return;
    body.innerHTML = '<p class="muted">正在加载…</p>';
    // opts.reasonField：驳回时的理由字段名（'reason' 默认；封号申诉为 'note'）。
    // opts.codeField：通过时附手填兑换码表单（礼品卡类订单用，字段 code）。
    function decide(path, extra, title, danger, opts) {
      opts = opts || {};
      return async function () {
        var o = { title: title, body: '请确认对该条目执行此处理。处理结果将记录在管理审计中。', danger: danger };
        if (extra.decision === 'reject') {
          var rf = rejectReasonForm(opts.reasonField || 'reason');
          o.fieldsHtml = rf.fieldsHtml; o.collect = rf.collect;
          o.body = '驳回必须填写' + ((opts.reasonField === 'note') ? '备注' : '原因') + '。处理结果将记录在管理审计中。';
        } else if (opts.codeField) {
          var cf = giftCodeForm();
          o.fieldsHtml = cf.fieldsHtml; o.collect = cf.collect;
          o.body = '请填写要发放给该用户的兑换码：通过后立即绑定该码并发放，不再依赖预先导入的兑换码。';
        }
        var f = await ownerConfirm(o);
        if (!f) return;
        Object.keys(extra).forEach(function (k) { f[k] = extra[k]; });
        var r = await ownerDo(path, f);
        if (r) loadOwnerQueueSafe(kind);
      };
    }
    if (kind === 'forum') {
      var r = await api('/owner/reviews/forum-pending'); if (!r.ok) { body.innerHTML = '<p class="muted">加载失败。</p>'; return; }
      var d = r.data || {}; var html = '';
      var pendPosts = (d.pending || []).filter(function (x) { return x.type === 'post'; });
      var pendReplies = (d.pending || []).filter(function (x) { return x.type === 'reply'; });
      pendPosts.forEach(function (p) {
        html += '<div class="item"><span class="grow"><strong>[待审帖子]</strong> ' + esc(p.title || '') + '<br><span class="muted small">' + esc(String(p.content || '').slice(0, 120)) + '</span></span></div>' +
          reviewButtons('<button class="primary" data-a="' + p.id + '">通过</button><button class="ghost" data-r="' + p.id + '">驳回</button><button class="ghost" data-d="' + p.id + '">删除</button>');
      });
      pendReplies.forEach(function (p) { html += '<div class="item"><span class="grow"><strong>[待审回复]</strong><br><span class="muted small">' + esc(String(p.content || '').slice(0, 120)) + '</span></span></div>' + reviewButtons('<button class="primary" data-ar="' + p.id + '">通过</button><button class="ghost" data-rr="' + p.id + '">驳回</button><button class="ghost" data-dr="' + p.id + '">删除</button>'); });
      (d.camps || []).forEach(function (c) { html += '<div class="item"><span class="grow"><strong>[待审营地]</strong> ' + esc(c.name) + '<br><span class="muted small">' + esc(String(c.description || '').slice(0, 120)) + '</span></span></div>' + reviewButtons('<button class="primary" data-ac="' + c.id + '">通过</button><button class="ghost" data-rc="' + c.id + '">驳回</button>'); });
      (d.campEdits || []).forEach(function (c) { html += '<div class="item"><span class="grow"><strong>[营地改名]</strong> ' + esc(c.current_name) + ' → ' + esc(c.pending_name) + (c.has_pending_avatar ? '<br><span class="muted small">含头像变更' + (c.pending_avatar_remove ? '（移除头像）' : '') + '</span>' : '') + '</span></div>' + reviewButtons('<button class="primary" data-an="' + c.camp_id + '">通过</button><button class="ghost" data-rn="' + c.camp_id + '">驳回</button>'); });
      (d.campFlags || []).forEach(function (c) { html += '<div class="item"><span class="grow"><strong>[营地复核]</strong> ' + esc(c.camp_name || '') + '</span></div>' + reviewButtons('<button class="primary" data-rp="' + c.camp_id + '">复开营地</button>'); });
      body.innerHTML = html || '<p class="muted">暂无待审内容。</p>';
      body.querySelectorAll('[data-a]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/post/' + b.getAttribute('data-a') + '/review', { decision: 'approve' }, '通过该帖子')); });
      body.querySelectorAll('[data-r]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/post/' + b.getAttribute('data-r') + '/review', { decision: 'reject' }, '驳回该帖子', true)); });
      body.querySelectorAll('[data-d]').forEach(function (b) { b.addEventListener('click', decide('/owner/forum/post/' + b.getAttribute('data-d') + '/delete', {}, '删除该帖子', true)); });
      body.querySelectorAll('[data-ar]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/reply/' + b.getAttribute('data-ar') + '/review', { decision: 'approve' }, '通过该回复')); });
      body.querySelectorAll('[data-rr]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/reply/' + b.getAttribute('data-rr') + '/review', { decision: 'reject' }, '驳回该回复', true)); });
      body.querySelectorAll('[data-dr]').forEach(function (b) { b.addEventListener('click', decide('/owner/forum/reply/' + b.getAttribute('data-dr') + '/delete', {}, '删除该回复', true)); });
      body.querySelectorAll('[data-ac]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/camp/' + b.getAttribute('data-ac') + '/review', { decision: 'approve' }, '通过该营地')); });
      body.querySelectorAll('[data-rc]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/camp/' + b.getAttribute('data-rc') + '/review', { decision: 'reject' }, '驳回该营地', true)); });
      body.querySelectorAll('[data-an]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/camp_edit/' + b.getAttribute('data-an') + '/review', { decision: 'approve' }, '通过该改名')); });
      body.querySelectorAll('[data-rn]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/camp_edit/' + b.getAttribute('data-rn') + '/review', { decision: 'reject' }, '驳回该改名', true)); });
      body.querySelectorAll('[data-rp]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/camps/' + b.getAttribute('data-rp') + '/reopen', {}, '复开该营地')); });
    } else if (kind === 'appeals') {
      var ra = await api('/owner/reviews/appeals?status=pending'); if (!ra.ok) { body.innerHTML = '<p class="muted">加载失败。</p>'; return; }
      var list = (ra.data && ra.data.appeals) || [];
      body.innerHTML = list.length ? list.map(function (a) {
        return '<div class="item"><span class="grow"><strong>封号申诉 #' + a.id + '</strong>（用户 ' + a.user_id + (a.user_username ? ' · ' + esc(a.user_username) : '') + '）' + ownerBadgeHtml(a.user_id) + '<br><span class="muted small">' + esc(a.content || '') + '</span></span></div>' +
          reviewButtons('<button class="primary" data-ap="' + a.id + '">批准（解封）</button><button class="ghost" data-rj="' + a.id + '">驳回</button>');
      }).join('') : '<p class="muted">暂无待审申诉。</p>';
      body.querySelectorAll('[data-ap]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/appeals/' + b.getAttribute('data-ap') + '/review', { decision: 'approve' }, '批准该申诉')); });
      body.querySelectorAll('[data-rj]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/appeals/' + b.getAttribute('data-rj') + '/review', { decision: 'reject' }, '驳回该申诉', true, { reasonField: 'note' })); });
    } else if (kind === 'recovery') {
      var rr3 = await api('/owner/reviews/recovery?status=pending'); if (!rr3.ok) { body.innerHTML = '<p class="muted">加载失败。</p>'; return; }
      var list3 = (rr3.data && rr3.data.appeals) || [];
      body.innerHTML = list3.length ? list3.map(function (a) {
        return '<div class="item"><span class="grow"><strong>找回申诉 #' + a.id + '</strong>（账号 ' + esc(a.account_ref || a.user_username || '') + '）<br><span class="muted small">旧密码命中 ' + (a.old_pw_matches || 0) + ' 个 ｜ 机型 ' + esc((a.device_models || []).join('、') || '—') + ' ｜ 地点 ' + esc((a.login_locations || []).join('、') || '—') + ' ｜ 好友验证 ' + (a.friend_verified ? '已通过' : '未完成') + '</span></span></div>' +
          reviewButtons('<button class="primary" data-ap3="' + a.id + '">批准（发重置凭证）</button><button class="ghost" data-rj3="' + a.id + '">驳回</button>');
      }).join('') : '<p class="muted">暂无待审申诉。</p>';
      body.querySelectorAll('[data-ap3]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/recovery/' + b.getAttribute('data-ap3') + '/decide', { decision: 'approve' }, '批准该找回申诉')); });
      body.querySelectorAll('[data-rj3]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/recovery/' + b.getAttribute('data-rj3') + '/decide', { decision: 'reject' }, '驳回该找回申诉', true)); });
    } else if (kind === 'rewards') {
      var rw = await api('/owner/reviews/rewards?state=pending'); if (!rw.ok) { body.innerHTML = '<p class="muted">加载失败。</p>'; return; }
      var list4 = (rw.data && rw.data.applications) || [];
      body.innerHTML = list4.length ? list4.map(function (a) {
        return '<div class="item"><span class="grow"><strong>千赞奖励 #' + a.id + '</strong>（帖子 ' + a.postId + '，作者 ' + a.authorUserId + '）<br><span class="muted small">点赞数 ' + (a.likeCountAtApply || 0) + ' ｜ <a href="#/owner/reviews/likes/' + a.postId + '" data-likes="' + a.postId + '">查看点赞构成（脱敏）</a></span></span></div>' +
          reviewButtons('<button class="primary" data-ap4="' + a.id + '">批准（发 5 积分）</button><button class="ghost" data-rj4="' + a.id + '">驳回</button>');
      }).join('') : '<p class="muted">暂无待审申请。</p>';
      body.querySelectorAll('[data-ap4]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/rewards/' + b.getAttribute('data-ap4') + '/review', { decision: 'approve' }, '批准该奖励申请')); });
      body.querySelectorAll('[data-rj4]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/rewards/' + b.getAttribute('data-rj4') + '/review', { decision: 'reject' }, '驳回该奖励申请', true)); });
      body.querySelectorAll('[data-likes]').forEach(function (b) {
        b.addEventListener('click', async function (ev) {
          ev.preventDefault();
          var lr = await api('/owner/reviews/like-composition/' + b.getAttribute('data-likes'));
          if (!lr.ok) { appToast(lr.message || '加载失败。'); return; }
          var d = lr.data;
          appNotice('点赞构成（脱敏聚合）', '总赞 ' + d.total + ' ｜ 独立设备 ' + d.distinctDevices + ' ｜ 独立来源 ' + d.distinctIpHashes + '\n单设备最高占比 ' + Math.round(d.topDeviceShare * 100) + '% ｜ 单来源最高占比 ' + Math.round(d.topIpShare * 100) + '%');
        });
      });
    } else if (kind === 'orders') {
      var ro = await api('/owner/reviews/orders'); if (!ro.ok) { body.innerHTML = '<p class="muted">加载失败。</p>'; return; }
      var list5 = ((ro.data && ro.data.orders) || []).filter(function (o) { return o.status === 'pending_review' || o.status === 'pending_payout'; });
      var byId5 = {}; list5.forEach(function (o) { byId5[o.id] = o; });
      body.innerHTML = list5.length ? list5.map(function (o) {
        var st = o.status === 'pending_payout' ? '待发放' : '待审核';
        var acts = o.status === 'pending_payout'
          ? '<button class="primary" data-paid5="' + o.id + '">标记已发放</button>'
          : '<button class="primary" data-rv="' + o.id + '">审核通过</button><button class="ghost" data-rjo="' + o.id + '">审核驳回</button>';
        return '<div class="item"><span class="grow"><strong>兑换订单 #' + o.id + '</strong>（用户 ' + o.user_id + '，' + esc(o.product_name || '') + '，' + o.price_points + ' 分，状态 ' + st + '）</span></div>' +
          reviewButtons(acts);
      }).join('') : '<p class="muted">暂无待处理订单。</p>';
      body.querySelectorAll('[data-rv]').forEach(function (b) { b.addEventListener('click', function () {
        var o = byId5[b.getAttribute('data-rv')]; if (!o) return;
        var isUsdt = String(o.payout_method || '').toLowerCase() === 'usdt';
        decide('/owner/reviews/orders/' + o.id + '/review', { decision: 'approve' }, '审核通过该订单', false, { codeField: !isUsdt })();
      }); });
      body.querySelectorAll('[data-rjo]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/orders/' + b.getAttribute('data-rjo') + '/review', { decision: 'reject' }, '驳回该订单', true)); });
      body.querySelectorAll('[data-paid5]').forEach(function (b) { b.addEventListener('click', async function () {
        var o = byId5[b.getAttribute('data-paid5')]; if (!o) return;
        var f = await ownerConfirm({ title: '标记订单 #' + o.id + ' 已发放', body: '请确认您已实际完成打款/发放。标记已发放必须留下可核对的凭证或说明。',
          fieldsHtml: '<label for="fPaidNote">打款凭证（交易哈希）或说明（必填）</label><input id="fPaidNote" type="text" maxlength="300" placeholder="填写交易哈希或发放说明">',
          collect: function (ov) { var v = ov.querySelector('#fPaidNote').value.trim(); if (!v) { ownFieldErr(ov, '请填写打款凭证或说明。'); return null; } return { note: v }; } });
        if (!f) return;
        var r = await ownerDo('/owner/reviews/orders/' + o.id + '/paid', f, '已标记为已发放。');
        if (r) loadOwnerQueueSafe(kind);
      }); });
    }
  }

  async function pageOwnerAudit() {
    view.innerHTML = '<div class="card"><p><a href="#/owner">‹ 返回用户列表</a></p><h2>管理审计（我的操作）</h2><div id="ownAuditBox"><p class="muted">正在加载…</p></div></div>';
    var box = $('#ownAuditBox');
    var r = await api('/owner/audit?limit=50');
    if (!r.ok) { box.innerHTML = '<p class="muted">加载失败。</p>'; return; }
    var rows = (r.data.audit || []).map(function (x) { return '<tr><td>' + esc(fmtTs(x.createdAt)) + '</td><td>' + esc(x.action) + '</td><td>' + esc(x.targetType || '') + ' ' + esc(x.targetId || '') + '</td><td>' + esc(x.detail || '') + '</td></tr>'; }).join('');
    box.innerHTML = rows ? '<table class="kv"><tr><td>时间</td><td>动作</td><td>对象</td><td>摘要</td></tr>' + rows + '</table>' : '<p class="muted">暂无管理操作记录。</p>';
  }

  // ---------- 兑换审核（站长发奖，2026-10-24 用户亲定新页） ----------
  // 契约（服务端线提供，前端按此对接）：
  //   GET  /owner/reviews/redeem            队列，前端按状态分「待审核」「待发放」两组
  //   POST /owner/reviews/redeem/:id/review { decision:'approve'|'reject', reason?, code?, confirm:true }
  //   （礼品卡类 approve 必带站长手填 code 即时绑码发放，服务端 adminReviewOrder 口径）
  //   POST /owner/reviews/redeem/:id/paid   { confirm:true }（实际发放完成后标记）
  // 状态文案与用户端「我的兑换」共用 ORDER_STATUS，不另造词；确认弹窗一律走
  // ownerConfirm（单步「确认无误」、不输密码）。驳回须填原因，退分由服务端按
  // 既有口径处理。字段名对回包做驼峰/下划线双口径兜底，待服务端联调时对齐。
  var PAYOUT_METHOD_LABEL = { usdt: 'USDT', USDT: 'USDT', gift_card: '兑换码', giftcard: '兑换码', code: '兑换码', redeem_code: '兑换码', choice: '自选', custom: '自选' };
  function redeemField(o, keys) { for (var i = 0; i < keys.length; i++) { if (o[keys[i]] != null && o[keys[i]] !== '') return o[keys[i]]; } return ''; }
  function redeemOrderView(o) {
    return {
      id: o.id,
      nickname: redeemField(o, ['nickname', 'userNickname', 'user_nickname']),
      username: redeemField(o, ['username', 'userName', 'user_username', 'accountId']),
      userId: redeemField(o, ['userId', 'user_id']),
      product: redeemField(o, ['productName', 'product_name']) || '兑换商品',
      points: redeemField(o, ['pricePoints', 'price_points']),
      methodRaw: redeemField(o, ['payoutMethod', 'payout_method', 'method', 'choice']),
      address: redeemField(o, ['payoutAddress', 'payout_address', 'payoutAddressMasked']),
      email: redeemField(o, ['payoutEmail', 'payout_email', 'payoutEmailMasked']),
      status: o.status || '',
      createdAt: redeemField(o, ['createdAt', 'created_at']),
      reason: redeemField(o, ['rejectReason', 'reject_reason', 'reason']),
      note: redeemField(o, ['note', 'remark'])
    };
  }
  function payoutMethodLabel(v) { return PAYOUT_METHOD_LABEL[v.methodRaw] || v.methodRaw || '—'; }
  function redeemTargetText(v) {
    if (v.address && v.email) return v.address + ' / ' + v.email;
    return v.address || v.email || '—';
  }
  function redeemTimeText(v) {
    var t = v.createdAt;
    if (typeof t === 'string' && isNaN(Number(t))) { var ms = Date.parse(t); return isNaN(ms) ? t : fmtTs(ms / 1000); }
    return fmtTs(t);
  }
  function redeemDetailHtml(v) {
    var rows = [
      ['订单号', '#' + esc(v.id)],
      ['下单人', esc(v.nickname || '—') + ownerBadgeHtml(v.userId) + (v.username ? '（' + esc(v.username) + '）' : '') + (v.userId ? ' · 用户 ' + esc(v.userId) : '')],
      ['商品', esc(v.product)],
      ['积分', esc(v.points) + ' 分'],
      ['发放方式', esc(payoutMethodLabel(v))],
      ['USDT 地址', esc(v.address || '—')],
      ['接收邮箱', esc(v.email || '—')],
      ['状态', esc(zhCode(ORDER_STATUS, v.status, '处理中'))],
      ['下单时间', esc(redeemTimeText(v))]
    ];
    if (v.reason) rows.push(['驳回原因', esc(v.reason)]);
    if (v.note) rows.push(['备注', esc(v.note)]);
    return kvTable(rows);
  }
  function showRedeemDetail(v) {
    var ov = el('<div class="own-overlay"><div class="own-dialog" role="dialog" aria-modal="true"><h3>兑换订单 #' + esc(v.id) + ' 详情</h3>' + redeemDetailHtml(v) + '<div class="row-end"><button type="button" class="primary" data-act="close">关闭</button></div></div></div>');
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.addEventListener('click', function (ev) { if (ev.target === ov) close(); });
    ov.querySelector('[data-act="close"]').addEventListener('click', close);
  }
  async function pageOwnerRedeem() {
    view.innerHTML = '<div class="card"><p><a href="#/owner">‹ 返回用户列表</a> · <a href="#/owner/reviews">审核队列</a> · <a href="#/owner/audit">管理审计</a></p><h2>兑换审核</h2>' +
      '<p class="muted small">在此审核积分兑换订单并发放奖励：USDT 订单审核通过后进入「待发放」，实际打款完成后点「标记已发放」；兑换码订单在审核通过时填写兑换码即时发放。驳回须填写原因，积分将退回用户账户。处理结果记录在管理审计中。</p>' +
      '<div id="ownRedeemBody"><p class="muted">正在加载…</p></div></div>';
    loadOwnerRedeemSafe();
  }
  async function loadOwnerRedeemSafe() {
    try { await loadOwnerRedeem(); } catch (e) {
      if (window.console && console.error) console.error(e);
      var body = $('#ownRedeemBody'); if (!body) return;
      body.innerHTML = '<p class="muted">兑换队列加载出错，请重试。</p><p><button class="ghost" id="ownRedeemRetry" type="button">重试</button></p>';
      var b = $('#ownRedeemRetry');
      if (b) b.addEventListener('click', loadOwnerRedeemSafe);
    }
  }
  async function loadOwnerRedeem() {
    var body = $('#ownRedeemBody'); if (!body) return;
    body.innerHTML = '<p class="muted">正在加载…</p>';
    var r = await api('/owner/reviews/redeem');
    if (!r.ok) {
      body.innerHTML = '<p class="muted">加载失败' + (r.message ? '：' + esc(r.message) : '') + '。</p><p><button class="ghost" id="ownRedeemRetry" type="button">重试</button></p>';
      var rb = $('#ownRedeemRetry'); if (rb) rb.addEventListener('click', loadOwnerRedeemSafe);
      return;
    }
    var raw = Array.isArray(r.data) ? r.data : ((r.data && (r.data.orders || r.data.items || r.data.redeem)) || []);
    var list = raw.map(redeemOrderView);
    var pending = list.filter(function (v) { return v.status === 'pending_review'; });
    var payout = list.filter(function (v) { return v.status === 'pending_payout'; });
    function rowHtml(v, acts) {
      return '<div class="item"><span class="grow"><strong>' + esc(v.product) + '</strong>（#' + esc(v.id) + '，' + esc(v.points) + ' 积分）<br>' +
        '<span class="muted small">' + esc(v.nickname || '—') + ownerBadgeHtml(v.userId) + (v.username ? '（' + esc(v.username) + '）' : '') + ' · ' + esc(payoutMethodLabel(v)) + ' · ' + esc(redeemTargetText(v)) + ' · ' + esc(zhCode(ORDER_STATUS, v.status, '处理中')) + ' · ' + esc(redeemTimeText(v)) + '</span></span></div>' +
        reviewButtons(acts);
    }
    body.innerHTML = '<h3>待审核（' + pending.length + '）</h3>' + (pending.length ? pending.map(function (v) {
      return rowHtml(v, '<button class="ghost" data-rdetail="' + esc(v.id) + '">详情</button><button class="primary" data-rapprove="' + esc(v.id) + '">通过</button><button class="ghost" data-rreject="' + esc(v.id) + '">驳回</button>');
    }).join('') : '<p class="muted">暂无待审核订单。</p>') +
    '<h3>待发放（' + payout.length + '）</h3>' + (payout.length ? payout.map(function (v) {
      return rowHtml(v, '<button class="ghost" data-rdetail="' + esc(v.id) + '">详情</button><button class="primary" data-rpaid="' + esc(v.id) + '">标记已发放</button>');
    }).join('') : '<p class="muted">暂无待发放订单。</p>');
    var byId = {}; list.forEach(function (v) { byId[v.id] = v; });
    body.querySelectorAll('[data-rdetail]').forEach(function (b) { b.addEventListener('click', function () { var v = byId[b.getAttribute('data-rdetail')]; if (v) showRedeemDetail(v); }); });
    body.querySelectorAll('[data-rapprove]').forEach(function (b) { b.addEventListener('click', async function () {
      var v = byId[b.getAttribute('data-rapprove')]; if (!v) return;
      var isUsdt = String(v.methodRaw || '').toLowerCase() === 'usdt';
      var oc = { title: '通过兑换订单 #' + v.id, body: '' };
      if (isUsdt) {
        oc.body = '您将通过该兑换订单：' + v.product + '（' + v.points + ' 积分），下单人 ' + (v.nickname || v.username || v.userId) + '。通过后订单进入「待发放」，实际打款后请点「标记已发放」。';
      } else {
        oc.body = '您将通过该兑换订单：' + v.product + '（' + v.points + ' 积分），下单人 ' + (v.nickname || v.username || v.userId) + '。请填写要发放的兑换码，通过后立即绑定该码并发放。';
        var cf2 = giftCodeForm(); oc.fieldsHtml = cf2.fieldsHtml; oc.collect = cf2.collect;
      }
      var f = await ownerConfirm(oc);
      if (!f) return;
      f.decision = 'approve';
      var rr = await ownerDo('/owner/reviews/redeem/' + encodeURIComponent(v.id) + '/review', f, isUsdt ? '已通过，订单进入待发放。' : '已通过，兑换码已发放。');
      if (rr) loadOwnerRedeemSafe();
    }); });
    body.querySelectorAll('[data-rreject]').forEach(function (b) { b.addEventListener('click', async function () {
      var v = byId[b.getAttribute('data-rreject')]; if (!v) return;
      var f = await ownerConfirm({ title: '驳回兑换订单 #' + v.id, danger: true, body: '您将驳回该兑换订单：' + v.product + '（' + v.points + ' 积分），下单人 ' + (v.nickname || v.username || v.userId) + '。驳回后积分将退回该用户账户。',
        fieldsHtml: '<label for="fRejectReason">驳回原因（将向用户展示）</label><input id="fRejectReason" type="text" maxlength="200">',
        collect: function (ov) { var reason = ov.querySelector('#fRejectReason').value.trim(); if (!reason) { ownFieldErr(ov, '请填写驳回原因。'); return null; } return { reason: reason }; } });
      if (!f) return;
      f.decision = 'reject';
      var rr = await ownerDo('/owner/reviews/redeem/' + encodeURIComponent(v.id) + '/review', f, '已驳回，积分将退回用户账户。');
      if (rr) loadOwnerRedeemSafe();
    }); });
    body.querySelectorAll('[data-rpaid]').forEach(function (b) { b.addEventListener('click', async function () {
      var v = byId[b.getAttribute('data-rpaid')]; if (!v) return;
      var f = await ownerConfirm({ title: '标记已发放 #' + v.id, body: '请确认您已实际完成发放：' + v.product + '，发放方式 ' + payoutMethodLabel(v) + '，' + redeemTargetText(v) + '。标记后订单状态变为「已发放」。' });
      if (!f) return;
      var rr = await ownerDo('/owner/reviews/redeem/' + encodeURIComponent(v.id) + '/paid', f, '已标记为已发放。');
      if (rr) loadOwnerRedeemSafe();
    }); });
  }

  // ---------- 启动 ----------
  bindPostCards(); // ui3：帖子卡整卡点击/列表点赞评论的 document 级事件委托（只挂一次）
  renderIdentity();
  probeOwner();
  render();
  // 存量会话（修复前登录的）昵称未入库：启动补拉一次资料，补上后重渲染当前页
  if (loggedIn()) syncMyProfile().then(function (filled) { if (filled) render(); });
  checkMaintenance();
  setInterval(checkMaintenance, 60000);
})();
