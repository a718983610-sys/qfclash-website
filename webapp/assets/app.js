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
    if (data.accessToken) store.setItem('qf_access_token', data.accessToken);
    if (data.refreshToken) store.setItem('qf_refresh_token', data.refreshToken);
    if (data.nickname) store.setItem('qf_nickname', data.nickname);
    if (data.email) store.setItem('qf_email', data.email);
    if (data.username) store.setItem('qf_username', data.username);
    if (data.userId != null) { other.removeItem('qf_user_id'); store.setItem('qf_user_id', String(data.userId)); }
  }
  function clearSession() { KEYS.concat(['qf_user_id']).forEach(function (k) { localStorage.removeItem(k); sessionStorage.removeItem(k); }); }
  function loggedIn() { return !!storeGet('qf_access_token'); }
  function myUserId() { var v = storeGet('qf_user_id'); return v ? Number(v) : null; }
  function meBasic() { return { nickname: storeGet('qf_nickname') || '', email: storeGet('qf_email') || '', username: storeGet('qf_username') || '' }; }

  // ---------- API ----------
  async function api(path, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.bodyRaw === undefined) headers['Content-Type'] = 'application/json';
    if (opts.headers) Object.keys(opts.headers).forEach(function (k) { headers[k] = opts.headers[k]; });
    if (opts.auth !== false && storeGet('qf_access_token')) headers['Authorization'] = 'Bearer ' + storeGet('qf_access_token');
    var res;
    try {
      res = await fetch(API + path, { method: opts.method || 'GET', headers: headers, body: opts.bodyRaw !== undefined ? opts.bodyRaw : (opts.body ? JSON.stringify(opts.body) : undefined) });
    } catch (e) {
      return { ok: false, network: true, message: '网络连接失败，请检查网络后重试。' };
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
    }
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
      var res = await fetch(url, { headers: headers, cache: 'no-store' });
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

  // ---------- 维护状态（L-02）：与 App 同一清单；maintenance=true 显示维护页，恢复自动可用 ----------
  var maintenanceOn = false;
  async function checkMaintenance() {
    try {
      var res = await fetch(RELEASE_URL, { cache: 'no-store' });
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
  }
  function drawerOpen() { return drawer.classList.contains('open'); }
  burger.addEventListener('click', function () { setDrawer(!drawerOpen()); });
  document.addEventListener('pointerdown', function (ev) {
    if (!drawerOpen()) return;
    if (drawer.contains(ev.target) || burger.contains(ev.target)) return;
    setDrawer(false);
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') setDrawer(false); });

  function renderIdentity() {
    var box = $('#drawerIdentity');
    var btn = $('#logoutBtn');
    if (loggedIn()) {
      var me = meBasic();
      box.innerHTML = '<span id="drawerAvatar"><span class="avatar-ph">' + esc((me.nickname || 'Q').slice(0, 1)) + '</span></span>' +
        '<span class="who"><span class="nick">' + esc(me.nickname || '用户') + '</span><br><span class="uid">' + esc(me.username ? '账户 ID：' + me.username : '') + '</span></span>';
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
    document.querySelectorAll('#drawerNav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-route') === name); });
  }
  function needLogin(title) {
    view.innerHTML = '<div class="card"><h2>' + esc(title) + '</h2><p class="muted">您尚未登录。登录后即可使用此功能，网页版与客户端共用同一账号。</p><p><a class="primary" href="#/login">前往登录</a></p></div>';
  }
  async function render() {
    var r = route(); markNav(r.name === 'chat' ? 'friends' : r.name);
    probeOwner();
    window.scrollTo(0, 0);
    if (maintenanceOn) {
      view.innerHTML = '<div class="card" style="text-align:center;padding:44px 16px;"><h2>' + MAINTENANCE_TEXT + '</h2><p class="muted">维护结束后本页面将自动恢复使用，无需手动刷新。</p></div>';
      return;
    }
    if (r.name === 'home') return pageHome();
    if (r.name === 'login') return pageLogin();
    if (r.name === 'register') return pageRegister();
    if (r.name === 'reset') return pageReset();
    if (r.name === 'appeal') return pageAppeal(r.arg);
    if (r.name === 'points') return pagePoints();
    if (r.name === 'forum') return pageForum(r);
    if (r.name === 'friends') return pageFriends();
    if (r.name === 'chat') return pageChat(r.arg);
    if (r.name === 'security') return pageSecurity();
    if (r.name === 'support') return pageSupport();
    if (r.name === 'me') return pageMe();
    if (r.name === 'owner') return pageOwner(r);
    view.innerHTML = '<div class="card"><h2>页面不存在</h2><p class="muted">您访问的页面不存在。</p></div>';
  }
  window.addEventListener('hashchange', render);

  // ---------- 首页 ----------
  function pageHome() {
    var me = meBasic();
    view.innerHTML =
      '<div class="card"><h2>欢迎使用 QFClash 网页版</h2>' +
      '<p>网页版与客户端共用同一账号，好友、聊天、论坛、积分与智能客服保持同步。连接、节点与订阅功能请使用客户端。</p>' +
      (loggedIn() ? '<p>当前登录：<strong>' + esc(me.nickname || '用户') + '</strong>' + (me.username ? '（账户 ID：' + esc(me.username) + '）' : '') + '</p>'
                  : '<p><a class="primary" href="#/login">登录</a> <a class="ghost" href="#/register">注册</a> <a class="ghost" href="#/forum">先逛论坛</a></p>') + '</div>' +
      '<div class="card"><h2>功能导航</h2><div class="list">' +
      [['#/points', '积分', '查看积分余额、进度与明细；积分获取以客户端在线时长为准。'],
       ['#/forum', '论坛', '综合讨论、使用求助、建议与反馈与公告，并可加入主题社区「营地」。'],
       ['#/friends', '好友', '管理好友与申请，进入聊天。'],
       ['#/support', '智能客服', '自动回复系统，全天候解答使用问题，可转人工。'],
       ['#/security', '安全中心', '登录设备、通行密钥与账号安全设置。']]
        .map(function (x) { return '<a class="item" href="' + x[0] + '"><span class="grow"><strong>' + x[1] + '</strong><br><span class="muted small">' + x[2] + '</span></span><span aria-hidden="true">›</span></a>'; }).join('') +
      '</div></div>';
  }

  // ---------- 登录 / 注册 / 找回 / 申诉 ----------
  var stepUp = { token: '' }, completion = { token: '', email: '' };
  function authDeviceBody() { return { deviceHash: deviceId(), deviceName: 'Website', platform: 'website' }; }
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
      return '<div class="notice"><strong>' + (perm ? '该用户已被永久封禁' : '该账户已被封禁，解除时间：' + esc(until)) + '</strong>' +
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
      var fd = new FormData(ev.target);
      var body = Object.assign({ identifier: String(fd.get('identifier')).trim(), password: String(fd.get('password')) }, authDeviceBody());
      var r = await api('/auth/login', { method: 'POST', auth: false, body: body });
      handleAuthResult(r, !!fd.get('remember'));
    });
    initGoogleButton();
  }
  function handleAuthResult(r, remember) {
    var err = $('#loginErr'); var block = $('#loginBlock');
    if (block) block.innerHTML = authBlockHtml(r);
    if (r.ok && r.data && (r.data.needsStepUp || r.data.stepUpRequired)) {
      stepUp.token = r.data.stepUpToken || ''; if (err) err.textContent = ''; showStepUp(remember); return;
    }
    if (r.ok && r.data && r.data.needsCompletion) { completion.token = r.data.completionToken || ''; completion.email = r.data.email || ''; if (err) err.textContent = ''; showCompletion(remember); return; }
    if (r.ok && r.data && r.data.accessToken) { finishLogin(r.data, remember); return; }
    if (err) err.textContent = authBlockHtml(r) ? '' : (r.message || '登录失败，请稍后重试。');
  }
  function finishLogin(data, remember) {
    saveSession(data, remember); renderIdentity(); location.hash = '#/home'; render();
  }
  // 谷歌登录：GIS 官方库渲染按钮，凭据回调 POST /auth/google 换令牌（与官网 auth.js 同一流程/client_id）
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
    var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    s.onload = ready; s.onerror = googleFallback; document.head.appendChild(s);
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
      var code = String(new FormData(ev.target).get('code')).trim();
      var body = Object.assign({ stepUpToken: stepUp.token, code: code }, authDeviceBody());
      var r = await api('/auth/stepup/verify', { method: 'POST', auth: false, body: body });
      if (r.ok && r.data && r.data.accessToken) { stepUp.token = ''; finishLogin(r.data, remember); }
      else { $('#stepUpErr').textContent = r.message || '验证失败，请重新输入。'; var b = $('#loginBlock'); if (b) b.innerHTML = authBlockHtml(r); }
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
      var fd = new FormData(ev.target);
      if (String(fd.get('password')) !== String(fd.get('password2'))) { $('#compErr').textContent = '两次输入的密码不一致，请重新输入。'; return; }
      var body = Object.assign({ completionToken: completion.token, username: String(fd.get('username')).trim(), password: String(fd.get('password')) }, authDeviceBody());
      var r = await api('/auth/google/complete', { method: 'POST', auth: false, body: body });
      if (r.ok && r.data && r.data.accessToken) { completion.token = ''; finishLogin(r.data, remember); }
      else if (r.ok && r.data && (r.data.needsStepUp || r.data.stepUpRequired)) { stepUp.token = r.data.stepUpToken || ''; showStepUp(remember); }
      else $('#compErr').textContent = r.message || '设置失败，请检查后重试。';
    });
  }
  // 注册（复用官网五栏口径：账户ID/邮箱/密码/确认密码/邮箱验证码，三步接口 request-code→verify→complete）
  function pageRegister() {
    if (loggedIn()) { location.hash = '#/home'; return; }
    var ticket = '';
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
      if (r.ok) { ok.textContent = '验证码已发送到您的邮箱，请查收后填写。'; armCodeCooldown(btn, 60); }
      else { err.textContent = r.message || '验证码发送失败，请稍后重试。'; if (r.status === 429) armCodeCooldown(btn, 60); }
    });
    $('#regForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      var err = $('#regErr'), ok = $('#regOk'); err.textContent = ''; ok.textContent = '';
      if (String(fd.get('password')) !== String(fd.get('password2'))) { err.textContent = '两次输入的密码不一致，请重新输入。'; return; }
      var email = String(fd.get('email')).trim(), code = String(fd.get('code')).trim();
      if (!ticket) {
        var vr = await api('/auth/register/verify', { method: 'POST', auth: false, body: { email: email, code: code } });
        if (!vr.ok || !vr.data || !vr.data.ticket) { err.textContent = vr.message || '验证码不正确或已过期，请重新获取。'; return; }
        ticket = vr.data.ticket;
      }
      var body = Object.assign({ ticket: ticket, username: String(fd.get('username')).trim(), password: String(fd.get('password')) }, authDeviceBody());
      var r = await api('/auth/register/complete', { method: 'POST', auth: false, body: body });
      if (r.ok && r.data && r.data.accessToken) { finishLogin(r.data, true); return; }
      err.textContent = r.message || '注册失败，请稍后重试。';
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
      var fd = new FormData(ev.target);
      var err = $('#resetErr'), ok = $('#resetOk'); err.textContent = ''; ok.textContent = '';
      if (String(fd.get('newPassword')) !== String(fd.get('newPassword2'))) { err.textContent = '两次输入的新密码不一致，请重新输入。'; return; }
      var r = await api('/auth/password/reset/confirm', { method: 'POST', auth: false, body: { email: String(fd.get('email')).trim(), code: String(fd.get('code')).trim(), newPassword: String(fd.get('newPassword')) } });
      if (r.ok) { ok.textContent = '密码已重置，请使用新密码登录。'; setTimeout(function () { location.hash = '#/login'; }, 900); }
      else err.textContent = r.message || '重置失败，请稍后重试。';
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
        ev.preventDefault(); var fd = new FormData(ev.target);
        var r = await api('/appeals/status', { method: 'POST', auth: false, body: { identifier: String(fd.get('identifier')).trim(), password: String(fd.get('password')) } });
        var out = $('#apStatusOut');
        if (!r.ok) { $('#apStatusErr').textContent = r.message || '查询失败，请核对后重试。'; return; }
        $('#apStatusErr').textContent = '';
        var a = r.data && r.data.appeal;
        out.innerHTML = a ? '<table class="kv"><tr><td>申诉状态</td><td>' + esc(a.status === 'pending' ? '审核中' : a.status === 'approved' ? '已通过' : a.status === 'rejected' ? '未通过' : a.status) + '</td></tr>' +
          '<tr><td>提交时间</td><td>' + esc(fmtTs(a.createdAt)) + '</td></tr>' +
          (a.reviewedAt ? '<tr><td>审核时间</td><td>' + esc(fmtTs(a.reviewedAt)) + '</td></tr>' : '') +
          (a.reviewNote ? '<tr><td>审核说明</td><td>' + esc(a.reviewNote) + '</td></tr>' : '') + '</table>' +
          (r.data.quota && r.data.quota.remaining != null ? '<p class="muted small">本次封禁还可申诉 ' + esc(r.data.quota.remaining) + ' 次。</p>' : '')
          : '<p class="muted">暂未查询到申诉记录。</p>';
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
        ev.preventDefault(); var fd = new FormData(ev.target);
        var split = function (v) { return String(v || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
        var r = await api('/appeals/recovery', { method: 'POST', auth: false, body: { account: String(fd.get('account')).trim(), oldPasswords: split(fd.get('oldPasswords')), deviceModels: split(fd.get('deviceModels')), loginLocations: split(fd.get('loginLocations')), note: String(fd.get('note') || '').trim() } });
        if (r.ok) { $('#recErr').textContent = ''; $('#recOk').textContent = '找回申诉已提交，请耐心等待审核。'; }
        else $('#recErr').textContent = r.message || '提交失败，请稍后重试。';
      });
      return;
    }
    view.innerHTML = '<div class="card"><h2>封禁申诉</h2><p class="muted">请输入被封禁账户的账户 ID 或邮箱与密码核验身份，再填写申诉内容。临时封禁与永久封禁的申诉次数有限，请认真填写。</p>' +
      '<form class="stack" id="banAppealForm"><label>账户 ID 或邮箱<input name="identifier" required></label><label>密码<input name="password" type="password" required></label>' +
      '<label>申诉内容<textarea name="content" rows="5" required maxlength="2000"></textarea></label>' +
      '<div class="err" id="banAppealErr"></div><div class="ok" id="banAppealOk"></div><button class="primary" type="submit">提交申诉</button></form>' +
      '<p class="row wrap" style="margin-top:10px;"><a href="#/appeal/status">查询申诉状态</a><a href="#/login">返回登录</a></p></div>';
    $('#banAppealForm').addEventListener('submit', async function (ev) {
      ev.preventDefault(); var fd = new FormData(ev.target);
      var r = await api('/appeals', { method: 'POST', auth: false, body: { identifier: String(fd.get('identifier')).trim(), password: String(fd.get('password')), content: String(fd.get('content')).trim() } });
      if (r.ok) { $('#banAppealErr').textContent = ''; $('#banAppealOk').textContent = '申诉已提交，正在审核中。您可在「查询申诉状态」中查看处理结果。'; }
      else $('#banAppealErr').textContent = r.message || '提交失败，请稍后重试。';
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
      var fd = new FormData(ev.target);
      var body = { productId: p.id, idempotencyKey: 'web-' + Date.now() + '-' + Math.floor(Math.random() * 1e9) };
      if (p.fulfillment === 'usdt') { body.payoutMethod = 'usdt'; body.payoutAddress = String(fd.get('payoutAddress') || '').trim(); }
      if (p.fulfillment === 'choice') {
        body.payoutMethod = String(fd.get('payoutMethod'));
        if (body.payoutMethod === 'usdt') body.payoutAddress = String(fd.get('payoutAddress') || '').trim();
        else body.payoutEmail = String(fd.get('payoutEmail') || '').trim();
      }
      var r = await api('/redeem/orders', { method: 'POST', body: body });
      if (r.ok) { box.innerHTML = '<p class="ok" style="margin-top:12px;">兑换已提交' + (p.requiresReview ? '，等待人工审核' : '') + '。您可在「我的兑换」中查看进度。</p>'; loadMyOrders(); }
      else $('#redeemErr').textContent = r.message || '兑换失败，请稍后重试。';
    });
  }
  var ORDER_STATUS = { pending_review: '待审核', pending_payout: '待发放', paid: '已发放', issued: '已发放', rejected: '未通过', cancelled: '已取消', refunded: '已退分' };
  async function loadMyOrders() {
    var box = $('#myOrders'); if (!box) return;
    var r = await api('/redeem/my?limit=30');
    if (!r.ok) { box.innerHTML = '<p class="err">' + esc(r.message) + '</p>'; return; }
    var orders = (r.data && r.data.orders) || [];
    box.innerHTML = orders.length ? '<div class="list">' + orders.map(function (o) {
      return '<div class="item"><span class="grow"><strong>' + esc(o.productName || '兑换商品') + '</strong><br><span class="muted small">' + esc(o.pricePoints) + ' 积分 · ' + esc(ORDER_STATUS[o.status] || o.status) + ' · ' + esc(fmtTs(o.createdAt)) + '</span></span>' +
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
      var r = await api('/redeem/orders/' + encodeURIComponent(orderId) + '/code/request', { method: 'POST', body: {} });
      $('#revealSendSt').textContent = r.ok ? '验证码已发送到账号绑定邮箱。' : (r.message || '发送失败。');
      $('#revealSendSt').className = 'small ' + (r.ok ? 'ok' : 'err');
    });
    $('#revealForm').addEventListener('submit', async function (ev) {
      ev.preventDefault(); var fd = new FormData(ev.target);
      var r = await api('/redeem/orders/' + encodeURIComponent(orderId) + '/code/reveal', { method: 'POST', body: { password: String(fd.get('password')), emailCode: String(fd.get('emailCode')).trim() } });
      if (r.ok && r.data && r.data.code) { $('#revealErr').textContent = ''; $('#revealOut').innerHTML = '<p class="notice">兑换码：<strong style="font-size:17px;">' + esc(r.data.code) + '</strong><br><span class="small muted">请及时保存；本页刷新后需重新核验才能再次查看。</span></p>'; }
      else $('#revealErr').textContent = r.message || '核验失败，请重试。';
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
      return '<tr><td>' + esc(fmtTs(x.created_at)) + '</td><td>' + esc(x.note || LEDGER_TYPE[x.type] || x.type || '') + '</td><td style="text-align:right;">' + esc(isFinite(amt) ? (amt > 0 ? '+' + amt : amt) : x.amount) + '</td></tr>';
    }).join('') + '</table>' : '<p class="muted">暂无积分记录。</p>';
  }

  // ---------- 论坛 ----------
  // 契约：帖子 postView {id,board,campId,title,content,author:{userId,name},status,replyCount,likeCount,shareCount,viewCount,likedByMe,reward?,createdAt}
  // 论坛主页 /forum/me/forum-home {user,posts,comments,rewardApplications}；分析 /forum/me/analytics {myStats,topTopics,frequentPosts,recommendedPosts,recommendedCamps}
  // 营地 /forum/camps {camps:[campView]}、/forum/camps/:id {camp,posts}、POST /forum/camps/:id/join {joined}
  // 个人主页 /forum/users/:userId/profile {user:{userId,name,joinedAt},stats:{posts,comments},posts,comments}
  // 千赞：帖子详情作者视角带 reward {eligible,state}；申请 POST /forum/posts/:id/reward-applications；我的申请 GET /forum/me/reward-applications
  var forumState = { tab: 'home', board: '', campId: '' };
  function forumHeaderHtml() {
    if (!loggedIn()) {
      return '<div class="card"><div class="row"><span class="avatar-ph">未</span><span class="grow"><strong>未登录</strong><br><span class="muted small">登录后可发帖、回复与加入营地。</span></span><a class="primary" href="#/login">登录</a></div></div>';
    }
    var me = meBasic();
    return '<div class="card"><div class="row"><span id="forumAvatar"><span class="avatar-ph">' + esc((me.nickname || 'Q').slice(0, 1)) + '</span></span>' +
      '<span class="grow"><strong>' + esc(me.nickname || '用户') + '</strong><br><span class="muted small">账户 ID：' + esc(me.username || '—') + '</span></span>' +
      '<a class="ghost" href="#/me">个人资料</a></div></div>';
  }
  function forumTabsHtml(active) {
    var tabs = [['home', '首页'], ['mine', '我的帖子'], ['reviews', '我的评价'], ['stats', '数据分析']];
    return '<div class="row wrap" role="tablist" style="margin-bottom:12px;">' + tabs.map(function (t) {
      return '<button type="button" class="chip" data-ftab="' + t[0] + '" style="' + (active === t[0] ? 'background:#eef3fe;color:var(--brand);border-color:var(--brand);font-weight:600;' : '') + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  }
  function countsHtml(p) {
    return '<span class="muted small">点赞 ' + esc(p.likeCount || 0) + ' · 分享 ' + esc(p.shareCount || 0) + ' · 浏览 ' + esc(p.viewCount || 0) + ' · 回复 ' + esc(p.replyCount || 0) + '</span>';
  }
  function authorName(p) { return (p.author && p.author.name) || '用户'; }
  function authorId(p) { return (p.author && p.author.userId) || ''; }
  function postItemHtml(p) {
    return '<div class="item"><span class="grow"><a href="#/forum/post/' + esc(p.id) + '"><strong>' + esc(p.title || '(无标题)') + '</strong></a>' +
      (p.status && p.status !== 'published' ? ' <span class="chip">' + esc(p.status === 'pending' ? '审核中' : p.status) + '</span>' : '') + '<br>' +
      '<span class="muted small">作者：<a href="#/forum/user/' + esc(authorId(p)) + '">' + esc(authorName(p)) + '</a> · ' + esc(fmtTs(p.createdAt)) + '</span><br>' + countsHtml(p) + '</span></div>';
  }
  async function pageForum(r) {
    if (r.arg === 'user' && r.sub) return forumUserPage(r.sub);
    if (r.arg === 'post' && r.sub) return forumPostPage(r.sub);
    if (r.arg === 'camp' && r.sub) return forumCampPage(r.sub);
    view.innerHTML = forumHeaderHtml() + forumTabsHtml(forumState.tab) + '<div id="forumBody"><p class="muted">正在加载…</p></div>';
    if (loggedIn()) showAvatar($('#forumAvatar'), '/profile/avatar', myAvatarVer, 44);
    view.querySelectorAll('[data-ftab]').forEach(function (b) { b.addEventListener('click', function () { forumState.tab = b.getAttribute('data-ftab'); pageForum(route()); }); });
    var body = $('#forumBody'); if (!body) return;
    if (forumState.tab === 'mine' || forumState.tab === 'reviews') {
      if (!loggedIn()) { body.innerHTML = '<div class="card"><p class="muted">登录后即可查看' + (forumState.tab === 'mine' ? '我的帖子' : '我的评价') + '。</p></div>'; return; }
      var home = await api('/forum/me/forum-home?limit=30');
      if (!home.ok) { body.innerHTML = '<div class="card"><p class="err">' + esc(home.message) + '</p></div>'; return; }
      var hd = home.data || {};
      if (forumState.tab === 'mine') {
        var apps = hd.rewardApplications || [];
        body.innerHTML = '<div class="card"><h2>我的帖子</h2><div class="list">' + ((hd.posts || []).length ? hd.posts.map(postItemHtml).join('') : '<p class="muted">暂无帖子。</p>') + '</div></div>' +
          '<div class="card"><h2>千赞奖励申请</h2>' + (apps.length ? '<div class="list">' + apps.map(function (a) {
            return '<div class="item"><span class="grow"><strong>' + esc(a.postTitle || ('帖子 #' + a.postId)) + '</strong><br><span class="muted small">申请时获赞 ' + esc(a.likeCountAtApply) + ' · 状态：' + esc(a.state === 'pending' ? '审核中' : a.state === 'approved' ? '已通过' : a.state === 'rejected' ? '未通过' : a.state) + ' · ' + esc(fmtTs(a.createdAt)) + (a.rejectReason ? ' · ' + esc(a.rejectReason) : '') + '</span></span></div>';
          }).join('') + '</div>' : '<p class="muted">暂无申请。帖子获赞达到 1000 后，可在帖子详情页提交千赞奖励申请。</p>') + '</div>';
      } else {
        body.innerHTML = '<div class="card"><h2>我的评价</h2><div class="list">' + ((hd.comments || []).length ? hd.comments.map(function (c) {
          return '<div class="item"><span class="grow"><a href="#/forum/post/' + esc(c.postId) + '"><strong>' + esc(c.postTitle || '帖子') + '</strong></a>' + (c.status && c.status !== 'published' ? ' <span class="chip">' + esc(c.status === 'pending' ? '审核中' : c.status) + '</span>' : '') + '<br><span class="muted">' + esc(c.content) + '</span><br><span class="muted small">' + esc(fmtTs(c.createdAt)) + '</span></span></div>';
        }).join('') : '<p class="muted">暂无评价。</p>') + '</div></div>';
      }
      return;
    }
    if (forumState.tab === 'stats') {
      if (!loggedIn()) { body.innerHTML = '<div class="card"><p class="muted">登录后即可查看数据分析。</p></div>'; return; }
      var an = await api('/forum/me/analytics');
      if (!an.ok) { body.innerHTML = '<div class="card"><p class="err">' + esc(an.message) + '</p></div>'; return; }
      var ad = an.data || {}, ms = ad.myStats || {};
      body.innerHTML = '<div class="card"><h2>数据分析</h2><div class="row wrap">' +
        [['发帖数', ms.posts || 0], ['评价数', ms.comments || 0], ['获赞数', ms.likesReceived || 0], ['总浏览', ms.viewsReceived || 0]].map(function (s) { return '<span class="card" style="margin:0;min-width:130px;"><span class="muted small">' + s[0] + '</span><br><strong style="font-size:22px;">' + esc(s[1]) + '</strong></span>'; }).join('') +
        '</div></div>' +
        '<div class="card"><h2>我常关注的主题</h2>' + ((ad.topTopics || []).length ? '<div class="list">' + ad.topTopics.map(function (t) { return '<div class="item"><span class="grow"><strong>' + esc(t.name) + '</strong><br><span class="muted small">' + (t.type === 'camp' ? '营地' : '板块') + ' · 浏览 ' + esc(t.views) + ' · 评价 ' + esc(t.comments) + '</span></span></div>'; }).join('') + '</div>' : '<p class="muted">暂无足够数据。</p>') + '</div>' +
        '<div class="card"><h2>我常看的帖子</h2><div class="list">' + ((ad.frequentPosts || []).length ? ad.frequentPosts.map(postItemHtml).join('') : '<p class="muted">暂无记录。</p>') + '</div></div>' +
        '<div class="card"><h2>为你推荐</h2><div class="list">' + ((ad.recommendedPosts || []).length ? ad.recommendedPosts.map(postItemHtml).join('') : '<p class="muted">暂无推荐。</p>') + '</div></div>' +
        '<div class="card"><h2>推荐营地</h2><div class="list">' + ((ad.recommendedCamps || []).length ? ad.recommendedCamps.map(function (c) { return '<div class="item"><span class="grow"><a href="#/forum/camp/' + esc(c.id) + '"><strong>' + esc(c.name) + '</strong></a><br><span class="muted small">' + esc(c.description || '') + (c.joined ? ' · 已加入' : '') + '</span></span></div>'; }).join('') : '<p class="muted">暂无推荐。</p>') + '</div></div>';
      return;
    }
    // 首页：板块 + 帖子列表（真接口） + 营地 + 外站精选
    var boardsR = await api('/forum/boards', { auth: false });
    var boards = boardsR.ok ? ((boardsR.data && boardsR.data.boards) || []) : [];
    var campsR = await api('/forum/camps', { auth: loggedIn() });
    var camps = campsR.ok ? ((campsR.data && campsR.data.camps) || []) : [];
    var postsUrl = '/forum/posts?limit=20&offset=0' + (forumState.board ? '&board=' + encodeURIComponent(forumState.board) : '') + (forumState.campId ? '&campId=' + encodeURIComponent(forumState.campId) : '');
    var postsR = await api(postsUrl, { auth: loggedIn() });
    var posts = postsR.ok ? ((postsR.data && postsR.data.posts) || []) : null;
    body.innerHTML =
      '<div class="card"><h2>论坛</h2><div class="chips" style="margin:0 0 10px;">' +
      '<button type="button" class="chip" data-board="" style="' + (!forumState.board ? 'background:#eef3fe;color:var(--brand);' : '') + '">全部板块</button>' +
      boards.map(function (b) { return '<button type="button" class="chip" data-board="' + esc(b.key || b.id) + '" style="' + (forumState.board === (b.key || b.id) ? 'background:#eef3fe;color:var(--brand);' : '') + '">' + esc(b.name || b.title || b.key) + '</button>'; }).join('') + '</div>' +
      (boardsR.ok ? '' : '<p class="err small">' + esc(boardsR.message || '板块加载失败，请稍后重试。') + '</p>') +
      (forumState.campId ? '<p class="muted small">当前按营地筛选帖子。<button type="button" class="chip" id="clearCampFilter">清除营地筛选</button></p>' : '') +
      '<div class="list">' + (posts === null ? '<p class="err">' + esc(postsR.message) + '</p>' : (posts.length ? posts.map(postItemHtml).join('') : '<p class="muted">暂无帖子。</p>')) + '</div>' +
      (loggedIn() ? '<p style="margin-top:10px;"><button class="primary" id="newPostBtn" type="button">发布帖子</button></p><div id="composeBox"></div>' : '<p class="muted small">登录后可发布帖子。</p>') + '</div>' +
      '<div class="card"><h2>主题社区 · 营地</h2><p class="muted">围绕具体主题的讨论社区。加入营地后，可在营地内发帖讨论。</p><div class="list">' +
      (camps.length ? camps.map(function (c) {
        return '<div class="item"><span class="grow"><a href="#/forum/camp/' + esc(c.id) + '"><strong>' + esc(c.name) + '</strong></a><br><span class="muted small">' + esc(c.description || '') + '<br>成员 ' + esc(c.memberCount || 0) + ' · 帖子 ' + esc(c.postCount || 0) + (c.creator && c.creator.name ? ' · 创建者 ' + esc(c.creator.name) : '') + '</span></span>' +
          (loggedIn() ? '<button class="ghost" data-joincamp="' + esc(c.id) + '" data-joined="' + (c.joined ? '1' : '') + '">' + (c.joined ? '已加入' : '加入营地') + '</button>' : '') + '</div>';
      }).join('') : (campsR.ok ? '<p class="muted">暂无营地。</p>' : '<p class="err">' + esc(campsR.message || '营地加载失败，请稍后重试。') + '</p>')) + '</div></div>' +
      '<div class="card"><h2>外站精选</h2><p class="muted small">来自外部平台的精选内容摘要，版权归原作者所有；点击可查看原文。</p><div id="extHighlights"><p class="muted">正在加载…</p></div></div>';
    body.querySelectorAll('[data-board]').forEach(function (b) { b.addEventListener('click', function () { forumState.board = b.getAttribute('data-board'); pageForum(route()); }); });
    var ccf = $('#clearCampFilter'); if (ccf) ccf.addEventListener('click', function () { forumState.campId = ''; pageForum(route()); });
    body.querySelectorAll('[data-joincamp]').forEach(function (b) { b.addEventListener('click', async function () {
      var joined = b.getAttribute('data-joined') === '1';
      var r = await api('/forum/camps/' + encodeURIComponent(b.getAttribute('data-joincamp')) + '/join', { method: 'POST', body: { joined: !joined } });
      if (r.ok) pageForum(route()); else alert(r.message || '操作失败，请稍后重试。');
    }); });
    loadExternalHighlights();
    var np = $('#newPostBtn');
    if (np) np.addEventListener('click', function () {
      $('#composeBox').innerHTML = '<form class="stack" id="postForm" style="margin-top:10px;max-width:100%;"><label>板块<select name="board">' +
        boards.map(function (b) { return '<option value="' + esc(b.key || b.id) + '">' + esc(b.name || b.title || b.key) + '</option>'; }).join('') + '</select></label>' +
        '<label>营地（可选）<select name="campId"><option value="">不指定营地</option>' + camps.filter(function (c) { return c.joined; }).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
        '<label>标题<input name="title" required maxlength="80"></label><label>正文<textarea name="content" rows="5" required></textarea></label>' +
        '<div class="err" id="postErr"></div><span class="muted small">帖子发布后将进入审核，审核通过后公开显示。</span><button class="primary" type="submit">提交发布</button></form>';
      $('#postForm').addEventListener('submit', async function (ev) {
        ev.preventDefault(); var fd = new FormData(ev.target);
        var bodyObj = { board: String(fd.get('board')), title: String(fd.get('title')).trim(), content: String(fd.get('content')).trim() };
        var campVal = String(fd.get('campId') || ''); if (campVal) bodyObj.campId = Number(campVal);
        var rr = await api('/forum/posts', { method: 'POST', body: bodyObj });
        if (rr.ok) { forumState.tab = 'home'; pageForum(route()); } else $('#postErr').textContent = rr.message || '发布失败，请稍后重试。';
      });
    });
  }
  // 外站精选：GET /forum/external {posts:[{id,platform,title,summary,url,authorName,publishedAt...}]}（以服务端 external.js 回包为准）
  async function loadExternalHighlights() {
    var box = $('#extHighlights'); if (!box) return;
    var r = await api('/forum/external?limit=10', { auth: false });
    var items = r.ok ? ((r.data && (r.data.posts || r.data.items)) || []) : [];
    if (!r.ok) { box.innerHTML = '<p class="err">' + esc(r.message || '精选内容加载失败，请稍后重试。') + '</p>'; return; }
    if (!Array.isArray(items) || !items.length) { box.innerHTML = '<p class="muted">暂无精选内容。</p>'; return; }
    box.innerHTML = items.map(function (x) {
      var src = x.platform || x.source || '外部平台';
      var url = x.url || x.originalUrl || '#';
      return '<div class="item"><span class="grow"><span class="chip" style="margin-bottom:4px;">' + esc(src) + '</span><br>' +
        '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"><strong>' + esc(x.title || '(无标题)') + '</strong></a><br>' +
        '<span class="muted">' + esc(x.summary || x.excerpt || '') + '</span><br>' +
        '<span class="muted small">来源：' + esc(src) + (x.author_name || x.authorName || x.author ? ' · 作者 ' + esc(x.author_name || x.authorName || x.author) : '') + (x.released_at || x.publishedAt ? ' · ' + esc(fmtTs(x.released_at || x.publishedAt)) : '') + ' · <a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">查看原文</a></span></span></div>';
    }).join('');
  }
  async function forumCampPage(campId) {
    view.innerHTML = '<div class="card"><p class="muted">正在加载…</p></div>';
    var r = await api('/forum/camps/' + encodeURIComponent(campId), { auth: loggedIn() });
    if (!r.ok) { view.innerHTML = '<div class="card"><h2>营地</h2><p class="err">' + esc(r.message) + '</p><p><a href="#/forum">返回论坛</a></p></div>'; return; }
    var c = (r.data && r.data.camp) || {};
    var posts = (r.data && r.data.posts) || [];
    view.innerHTML = '<div class="card"><p><a href="#/forum">← 返回论坛</a></p><h2>' + esc(c.name || '营地') + '</h2>' +
      '<p class="muted">' + esc(c.description || '') + '</p>' +
      '<p class="muted small">成员 ' + esc(c.memberCount || 0) + ' · 帖子 ' + esc(c.postCount || 0) + (c.creator && c.creator.name ? ' · 创建者 ' + esc(c.creator.name) : '') + '</p>' +
      (r.data.closed ? '<p class="notice">' + esc(r.data.message || '该营地已关闭。') + '</p>' : (loggedIn() ? '<p><button class="ghost" id="campJoinBtn" type="button">' + (c.joined ? '退出营地' : '加入营地') + '</button> <button class="primary" id="campPostsBtn" type="button">只看营地帖子</button></p>' : '')) + '</div>' +
      '<div class="card"><h2>营地帖子</h2><div class="list">' + (posts.length ? posts.map(postItemHtml).join('') : '<p class="muted">暂无帖子。</p>') + '</div></div>';
    var jb = $('#campJoinBtn');
    if (jb) jb.addEventListener('click', async function () {
      var rr = await api('/forum/camps/' + encodeURIComponent(campId) + '/join', { method: 'POST', body: { joined: !c.joined } });
      if (rr.ok) forumCampPage(campId); else alert(rr.message || '操作失败，请稍后重试。');
    });
    var pb = $('#campPostsBtn');
    if (pb) pb.addEventListener('click', function () { forumState.campId = String(campId); forumState.tab = 'home'; location.hash = '#/forum'; pageForum(route()); });
  }
  async function forumUserPage(userId) {
    view.innerHTML = '<div class="card"><h2>个人主页</h2><p class="muted">正在加载…</p></div>';
    var r = await api('/forum/users/' + encodeURIComponent(userId) + '/profile', { auth: loggedIn() });
    if (!r.ok) { view.innerHTML = '<div class="card"><h2>个人主页</h2><p class="err">' + esc(r.message) + '</p></div>'; return; }
    var d = r.data || {}, u = d.user || {}, st = d.stats || {};
    view.innerHTML = '<div class="card"><div class="row"><span id="fuAvatar"><span class="avatar-ph">' + esc((u.name || 'Q').slice(0, 1)) + '</span></span>' +
      '<span class="grow"><strong style="font-size:17px;">' + esc(u.name || '用户') + '</strong><br><span class="muted small">' + (u.joinedAt ? '加入于 ' + esc(fmtTs(u.joinedAt)) + ' · ' : '') + '发帖 ' + esc(st.posts || 0) + ' · 评价 ' + esc(st.comments || 0) + '</span></span></div></div>' +
      '<div class="card"><h2>发布的帖子</h2><div class="list">' + ((d.posts || []).length ? d.posts.map(postItemHtml).join('') : '<p class="muted">暂无帖子。</p>') + '</div></div>' +
      '<div class="card"><h2>发表的评价</h2><div class="list">' + ((d.comments || []).length ? d.comments.map(function (c) {
        return '<div class="item"><span class="grow"><a href="#/forum/post/' + esc(c.postId) + '"><strong>' + esc(c.postTitle || '帖子') + '</strong></a><br><span class="muted">' + esc(c.content) + '</span><br><span class="muted small">' + esc(fmtTs(c.createdAt)) + '</span></span></div>';
      }).join('') : '<p class="muted">暂无评价。</p>') + '</div></div>';
    showAvatar($('#fuAvatar'), '/profile/' + encodeURIComponent(userId) + '/avatar', (u && u.avatarUpdatedAt) || '', 44);
  }
  async function forumPostPage(id) {
    view.innerHTML = '<div class="card"><p class="muted">正在加载…</p></div>';
    var r = await api('/forum/posts/' + encodeURIComponent(id), { auth: loggedIn() });
    if (!r.ok) { view.innerHTML = '<div class="card"><p class="err">' + esc(r.message) + '</p><p><a href="#/forum">返回论坛</a></p></div>'; return; }
    var p = (r.data && r.data.post) || {};
    var replies = (r.data && r.data.replies) || [];
    var reward = p.reward || null;
    view.innerHTML = '<div class="card"><p><a href="#/forum">← 返回论坛</a></p><h2>' + esc(p.title || '(无标题)') + '</h2>' +
      '<p class="muted small">作者：<a href="#/forum/user/' + esc(authorId(p)) + '">' + esc(authorName(p)) + '</a> · ' + esc(fmtTs(p.createdAt)) + ' · ' + countsHtml(p) + '</p>' +
      '<div style="white-space:pre-wrap;word-break:break-word;">' + esc(p.content || '') + '</div>' +
      '<p class="row wrap" style="margin-top:12px;">' +
      '<button class="ghost" id="likeBtn" type="button">' + (p.likedByMe ? '已点赞' : '点赞') + '（' + esc(p.likeCount || 0) + '）</button>' +
      '<button class="ghost" id="shareBtn" type="button">分享（' + esc(p.shareCount || 0) + '）</button>' +
      (loggedIn() ? '<button class="ghost" id="reportBtn" type="button">举报</button>' : '') +
      (reward && reward.eligible ? '<button class="primary" id="rewardBtn" type="button">申请千赞奖励</button>' : '') +
      (reward && reward.state && reward.state !== 'none' ? '<span class="muted small">千赞奖励申请状态：' + esc(reward.state === 'pending' ? '审核中' : reward.state === 'approved' ? '已通过' : reward.state) + '</span>' : '') +
      '</p><p class="small" id="postActionSt" role="status"></p></div>' +
      '<div class="card"><h2>回复（' + esc(replies.length) + '）</h2><div class="list">' +
      (replies.length ? replies.map(function (x) {
        return '<div class="item"><span class="grow"><strong>' + esc((x.author && x.author.name) || '用户') + '</strong> <span class="muted small">' + esc(fmtTs(x.createdAt)) + '</span><br><span style="white-space:pre-wrap;">' + esc(x.content) + '</span></div>';
      }).join('') : '<p class="muted">暂无回复。</p>') + '</div>' +
      (loggedIn() ? '<form class="stack" id="replyForm" style="margin-top:12px;max-width:100%;"><label>发表回复<textarea name="content" rows="3" required></textarea></label><div class="err" id="replyErr"></div><button class="primary" type="submit">提交回复</button></form>' : '<p class="muted small">登录后可参与回复。</p>') + '</div>';
    var st = $('#postActionSt');
    var likeBtn = $('#likeBtn');
    if (likeBtn) likeBtn.addEventListener('click', async function () {
      if (!loggedIn()) { location.hash = '#/login'; return; }
      var rr = await api('/forum/posts/' + encodeURIComponent(id) + '/like', { method: 'POST', body: {} });
      if (rr.ok) forumPostPage(id); else st.textContent = rr.message || '操作失败。';
    });
    var shareBtn = $('#shareBtn');
    if (shareBtn) shareBtn.addEventListener('click', async function () {
      var url = location.origin + location.pathname + '#/forum/post/' + encodeURIComponent(id);
      try { await navigator.clipboard.writeText(url); } catch (e) { /* 剪贴板不可用时仍计数 */ }
      var rr = await api('/forum/posts/' + encodeURIComponent(id) + '/share', { method: 'POST', body: {} });
      st.textContent = rr.ok ? '链接已复制，分享计数已更新。' : '链接已复制。';
      if (rr.ok) forumPostPage(id);
    });
    var reportBtn = $('#reportBtn');
    if (reportBtn) reportBtn.addEventListener('click', async function () {
      var reason = prompt('请填写举报原因：'); if (!reason) return;
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
      var content = String(new FormData(ev.target).get('content')).trim();
      var rr = await api('/forum/posts/' + encodeURIComponent(id) + '/replies', { method: 'POST', body: { content: content } });
      if (rr.ok) forumPostPage(id); else $('#replyErr').textContent = rr.message || '回复失败，请稍后重试。';
    });
  }

  // ---------- 好友 ----------
  // 契约：搜索 POST /friends/search {query} → {users:[publicView{userId,nickname,hasAvatar}]}
  // 申请 GET /friends/requests → {incoming:[{id,...,user:publicView}], outgoing:[...]}
  // 好友 GET /friends → {friends:[SUPPORT_BOT_ENTRY, friendView{userId,nickname,username,pubkey}...]}
  // SUPPORT_BOT_ENTRY {kind:'support_bot', userId:'support', displayName:'智能客服', pinned:true, undeletable:true}
  async function pageFriends() {
    if (!loggedIn()) return needLogin('好友');
    view.innerHTML = '<div class="card"><h2>好友</h2>' +
      '<form class="row" id="friendSearch" style="margin-bottom:8px;"><input class="grow" name="q" placeholder="输入账户 ID 或邮箱精确搜索"><button class="ghost" type="submit">搜索</button></form>' +
      '<div id="searchOut"></div><div id="reqBox"><p class="muted">正在加载申请…</p></div><div id="friendList"><p class="muted">正在加载好友…</p></div></div>' +
      '<div class="card"><h2>会话</h2><div id="convList"><p class="muted">正在加载…</p></div></div>';
    $('#friendSearch').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var q = String(new FormData(ev.target).get('q')).trim(); if (!q) return;
      var r = await api('/friends/search', { method: 'POST', body: { query: q } });
      var out = $('#searchOut');
      if (!r.ok) { out.innerHTML = '<p class="err">' + esc(r.message) + '</p>'; return; }
      var users = (r.data && r.data.users) || [];
      out.innerHTML = users.length ? '<div class="list">' + users.map(function (u) {
        return '<div class="item">' + avatarSlotHtml(u.userId, u.avatarUpdatedAt, u.hasAvatar, u.nickname, 40) + '<span class="grow"><strong>' + esc(u.nickname || '用户') + '</strong></span><button class="primary" data-addfriend="' + esc(u.userId) + '" type="button">添加好友</button></div>';
      }).join('') + '</div>' : '<p class="muted">未找到对应用户。请确认账户 ID 或邮箱无误（仅支持精确搜索）。</p>';
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
      (incoming.length ? '<h3>收到的申请</h3>' + incoming.map(function (x) {
        var u = x.user || {};
        return '<div class="item">' + avatarSlotHtml(u.userId, u.avatarUpdatedAt, u.hasAvatar, u.nickname, 40) + '<span class="grow"><strong>' + esc(u.nickname || '用户') + '</strong></span>' +
          '<button class="ghost" data-accept="' + esc(x.id) + '">同意</button><button class="ghost" data-reject="' + esc(x.id) + '">拒绝</button></div>';
      }).join('') : '') +
      (outgoing.length ? '<h3>我发出的申请</h3>' + outgoing.map(function (x) {
        var u = x.user || {};
        return '<div class="item">' + avatarSlotHtml(u.userId, u.avatarUpdatedAt, u.hasAvatar, u.nickname, 40) + '<span class="grow"><strong>' + esc(u.nickname || '用户') + '</strong><br><span class="muted small">等待对方处理</span></span></div>';
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
    box.innerHTML = (friendActionErr ? '<p class="err">' + esc(friendActionErr) + '</p>' : '') + '<h3>我的好友</h3>' + (list.length ? '<div class="list">' + list.map(function (f) {
      if (f.kind === 'support_bot') {
        return '<div class="item"><span class="grow"><a href="#/support"><strong>' + esc(f.displayName || '智能客服') + '</strong></a> <span class="chip">系统联系人 · 置顶</span><br><span class="muted small">自动回复系统，点击进入智能客服。</span></span><a class="ghost" href="#/support">联系客服</a></div>';
      }
      var uid = f.userId;
      return '<div class="item">' + avatarSlotHtml(uid, f.avatarUpdatedAt, f.hasAvatar, f.nickname, 40) + '<span class="grow"><a href="#/chat/' + esc(uid) + '"><strong>' + esc(f.nickname || '用户') + '</strong></a>' + (f.username ? '<br><span class="muted small">账户 ID：' + esc(f.username) + '</span>' : '') + '</span>' +
        '<a class="ghost" href="#/chat/' + esc(uid) + '">聊天</a><button class="ghost" data-del="' + esc(uid) + '">删除</button></div>';
    }).join('') + '</div>' : '<p class="muted">暂无好友。可通过上方搜索添加。</p>');
    fillAvatars(box);
    box.querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', async function () {
      if (!confirm('确定删除该好友吗？删除后将无法继续聊天。')) return;
      var rr = await api('/friends/' + encodeURIComponent(b.getAttribute('data-del')), { method: 'DELETE' }); friendActionErr = rr.ok ? '' : (rr.message || '删除失败，请稍后重试。'); loadFriends();
    }); });
  }
  // 会话列表契约：GET /chat/conversations → {conversations:[{user:{userId,nickname,username?},lastMessageId,lastMessageAt,unreadCount}]}
  async function loadConversations() {
    var box = $('#convList'); if (!box) return;
    var r = await api('/chat/conversations');
    if (!r.ok) { box.innerHTML = '<p class="err">' + esc(r.message) + '</p>'; return; }
    var list = (r.data && r.data.conversations) || [];
    box.innerHTML = list.length ? '<div class="list">' + list.map(function (c) {
      var u = c.user || {};
      return '<a class="item" href="#/chat/' + esc(u.userId) + '">' + avatarSlotHtml(u.userId, u.avatarUpdatedAt, u.hasAvatar, u.nickname, 40) + '<span class="grow"><strong>' + esc(u.nickname || '用户') + '</strong><br><span class="muted small">最近消息 ' + esc(fmtTs(c.lastMessageAt)) + '</span></span>' + (c.unreadCount ? '<span class="chip" style="background:#eef3fe;color:var(--brand);">' + esc(c.unreadCount) + ' 条未读</span>' : '') + '<span aria-hidden="true">›</span></a>';
    }).join('') + '</div>' : '<p class="muted">暂无会话。可从好友列表进入聊天。</p>';
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
    view.innerHTML = '<div class="card"><div class="row"><a class="ghost" href="#/friends">返回好友</a><span id="chatPeerAvatar"></span><strong id="chatPeerName">聊天</strong></div>' +
      '<p class="notice" style="margin-top:10px;">' + CHAT_DISCLOSURE + '</p>' +
      '<div id="vaultBox"></div>' +
      '<div class="chatlog" id="chatLog"><p class="bubble sys">消息经端对端加密传输，服务器仅中继密文。</p></div>' +
      '<div id="reactionBar"></div>' +
      '<div class="composer"><textarea id="chatInput" placeholder="输入消息" rows="2"></textarea><button class="primary" id="chatSend" type="button">发送</button></div>' +
      '<p class="row wrap" style="margin-top:8px;"><button class="ghost" id="emojiBtn" type="button">表情</button><button class="ghost" id="attachBtn" type="button">附件</button><input type="file" id="attachFile" hidden><span class="small" id="chatStatus" role="status"></span></p>' +
      '<div id="emojiPanel" hidden><div class="chips">' + EMOJI_PANEL.map(function (e) { return '<button type="button" class="chip" data-emoji="' + e + '">' + e + '</button>'; }).join('') + '</div>' +
      '<p class="muted small" style="margin-top:8px;">表情包（贴纸）：</p><div class="chips">' + EMOJI_PANEL.slice(0, 16).map(function (e) { return '<button type="button" class="chip" data-sticker="' + e.codePointAt(0).toString(16) + '">' + e + '</button>'; }).join('') + '</div></div></div>';
    var status = $('#chatStatus');
    var log = $('#chatLog');
    var reactions = {}; // serverMsgId -> {reactorKey: emoji}
    var lastSeenId = 0;
    // 对方昵称（会话列表/好友资料）
    api('/chat/conversations').then(function (r) {
      var list = (r.ok && r.data && r.data.conversations) || [];
      var hit = list.filter(function (c) { return c.user && String(c.user.userId) === String(peerId); })[0];
      var nameEl = $('#chatPeerName'); if (nameEl && hit) nameEl.textContent = '与 ' + (hit.user.nickname || '好友') + ' 的聊天';
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
          } catch (e) { status.className = 'small err'; status.textContent = e.message || '附件打开失败。'; }
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
      } catch (e) {
        status.className = 'small err';
        status.textContent = e && e.code === 'CRYPTO_NOT_READY' ? '聊天尚未解锁，消息未发送。' : ('发送失败：' + (e.message || e));
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
          st.className = 'small err'; st.textContent = e.message || '解锁失败，请重试。';
        }
      });
    }
    $('#emojiBtn').addEventListener('click', function () { var p = $('#emojiPanel'); p.hidden = !p.hidden; });
    view.querySelectorAll('[data-emoji]').forEach(function (b) { b.addEventListener('click', function () { var ta = $('#chatInput'); ta.value += b.getAttribute('data-emoji'); ta.focus(); }); });
    view.querySelectorAll('[data-sticker]').forEach(function (b) { b.addEventListener('click', function () { sendWire('qf1:' + JSON.stringify({ type: 'sticker', packId: 'twemoji', id: b.getAttribute('data-sticker') })); }); });
    $('#attachBtn').addEventListener('click', function () { $('#attachFile').click(); });
    $('#attachFile').addEventListener('change', async function () {
      var f = $('#attachFile').files[0]; if (!f) return;
      if (!QFCrypto.isUnlocked || !QFCrypto.isUnlocked()) { status.className = 'small err'; status.textContent = '请先解锁聊天后再发送附件。'; return; }
      status.className = 'small muted'; status.textContent = '正在加密并上传附件…';
      try {
        var sealed = await QFCrypto.sealAndUploadBlob(peerId, f);
        var enc = await QFCrypto.encryptFor(peerId, sealed.wireText);
        var r = await api('/chat/send', { method: 'POST', body: { to: Number(peerId), ciphertext: enc.ciphertext, nonce: enc.nonce, msgId: enc.msgId, blobId: sealed.ref.blobId } });
        if (!r.ok) throw new Error(r.message || '附件发送失败。');
        status.textContent = ''; pullHistory();
      } catch (e) { status.className = 'small err'; status.textContent = e.message || '附件发送失败。'; }
    });
    $('#chatSend').addEventListener('click', async function () {
      var ta = $('#chatInput'); var text = ta.value.trim(); if (!text) return;
      if (!QFCrypto.isUnlocked || !QFCrypto.isUnlocked()) { status.className = 'small err'; status.textContent = '请先解锁聊天后再发送消息。'; return; }
      ta.value = '';
      await sendWire(text);
    });
  }

  // ---------- 安全中心 ----------
  // 契约：/security/devices {devices:[{id,name,platform,lastActiveAt,isCurrent,...}]}（字段为 lastActiveAt/isCurrent）
  async function pageSecurity() {
    if (!loggedIn()) return needLogin('安全中心');
    view.innerHTML = '<div class="card"><h2>安全中心</h2><p class="muted">正在加载…</p></div>';
    var r = await api('/security/me');
    if (!r.ok) { view.innerHTML = '<div class="card"><h2>安全中心</h2><p class="err">' + esc(r.message) + '</p></div>'; return; }
    var d = r.data || {};
    var devR = await api('/security/devices');
    var devs = devR.ok ? ((devR.data && devR.data.devices) || []) : [];
    var pkR = await api('/passkeys');
    var pks = pkR.ok ? ((pkR.data && (pkR.data.passkeys || pkR.data.credentials)) || []) : [];
    view.innerHTML = '<div class="card"><h2>安全中心</h2><table class="kv">' +
      '<tr><td>登录保护</td><td>' + (d.loginProtection === false ? '未开启' : '已开启（环境异常时需邮箱验证码）') + '</td></tr>' +
      '<tr><td>通行密钥</td><td>' + (pkR.ok ? ('已登记 ' + (Array.isArray(pks) ? pks.length : 0) + ' 个') : '加载失败') + '</td></tr>' +
      '<tr><td>账号状态</td><td>' + esc(d.status || '正常') + '</td></tr></table>' +
      '<p class="muted small" style="margin-top:8px;">修改密码、换绑邮箱、通行密钥登记与注销账号等操作，请在客户端内完成；网页版提供状态查看。账户异常？可前往<a href="#/appeal/status">申诉状态查询</a>。</p></div>' +
      '<div class="card"><h2>登录设备</h2>' + (Array.isArray(devs) && devs.length ? '<div class="list">' + devs.map(function (x) {
        return '<div class="item"><span class="grow"><strong>' + esc(x.name || x.deviceName || '设备') + '</strong><br><span class="muted small">' + esc(x.platform || '') + ' · 最近活跃 ' + esc(fmtTs(x.lastActiveAt)) + '</span></span>' +
          (x.isCurrent ? '<span class="muted small">本设备</span>' : '<button class="ghost" data-devlogout="' + esc(x.id) + '">退出该设备</button>') + '</div>';
      }).join('') + '</div>' : (devR.ok ? '<p class="muted">暂无设备记录。</p>' : '<p class="err">' + esc(devR.message || '设备加载失败，请稍后重试。') + '</p>')) + '</div>';
    view.querySelectorAll('[data-devlogout]').forEach(function (b) { b.addEventListener('click', async function () {
      b.disabled = true;
      var r = await api('/security/devices/' + encodeURIComponent(b.getAttribute('data-devlogout')) + '/logout', { method: 'POST', body: {} });
      if (r.ok) { pageSecurity(); return; }
      b.disabled = false;
      var e = document.createElement('p'); e.className = 'err small'; e.textContent = r.message || '退出该设备失败，请稍后重试。';
      b.parentNode.appendChild(e);
    }); });
  }

  // ---------- 智能客服 ----------
  // 契约：POST /support/ask {text, sessionId?, kbId?, notThis?} → {action, text, sessionId, options?:[{kbId,label}], alternates?:[{kbId,label}], kbId?}
  // POST /support/handoff {sessionId?} → {notice, sessionId, supportConfigured}
  // GET /support/session?sessionId= → {sessionId, tone, status, messages:[{id,authorRole,displayName,kbId,body,createdAt}]}
  async function pageSupport() {
    if (!loggedIn()) return needLogin('智能客服');
    view.innerHTML = '<div class="card"><div class="row"><span class="avatar-ph">客</span><span class="grow"><strong>智能客服</strong><br><span class="muted small">自动回复系统 · 非人工坐席</span></span></div>' +
      '<p class="notice" style="margin-top:10px;">智能客服会话不使用端对端加密，会话内容将传输至服务器处理，以便为您提供帮助。请勿在会话中发送密码、验证码或其他敏感信息。</p>' +
      '<div class="chatlog" id="supLog"><div class="bubble">您好，我是智能客服（自动回复系统）。您可以向我咨询账号、积分、论坛与客户端使用方面的问题，我会尽力为您解答；如需人工处理，可点击下方「转人工」。</div></div>' +
      '<div class="chips">' + ['流量用完了怎么办', '积分如何获得', '账号被冻结了怎么办', '如何加入营地'].map(function (q) { return '<button type="button" class="chip" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<div id="supOptions"></div>' +
      '<div class="composer"><textarea id="supInput" placeholder="请输入您的问题" rows="2"></textarea><button class="primary" id="supSend" type="button">发送</button></div>' +
      '<p class="row" style="margin-top:8px;"><button class="ghost" id="humanBtn" type="button">转人工</button><span class="small" id="supStatus" role="status"></span></p></div>';
    var sessionId = null, pollTimer = null, lastMsgId = 0, handedOff = false;
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
      if (r.ok && r.data && r.data.sessionId) {
        sessionId = r.data.sessionId;
        handedOff = r.data.status === 'open';
        (r.data.messages || []).forEach(function (m) { if (m.id > lastMsgId) lastMsgId = m.id; });
        if (handedOff) { st.className = 'small warn'; st.textContent = '本会话已转人工，人工客服的回复将显示在这里。'; pollTimer = setInterval(pollSession, 6000); }
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
      if (!pollTimer) pollTimer = setInterval(pollSession, 6000);
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
    view.innerHTML = '<div class="card"><div class="row"><span id="meAvatar"><span class="avatar-ph">' + esc((nick || 'Q').slice(0, 1)) + '</span></span>' +
      '<span class="grow"><strong style="font-size:17px;">' + esc(nick || '用户') + '</strong><br><span class="muted small">账户 ID：' + esc(p.username || '—') + '</span></span></div>' +
      '<table class="kv" style="margin-top:10px;"><tr><td>邮箱</td><td>' + esc(p.email || meBasic().email || '—') + '</td></tr>' +
      '<tr><td>我的积分</td><td>' + (pts.ok ? esc(pts.data && pts.data.balance != null ? pts.data.balance : '—') + ' 分（<a href="#/points">查看明细</a>）' : '加载失败') + '</td></tr></table></div>' +
      '<div class="card"><h2>编辑资料</h2><form class="stack" id="nickForm"><label>昵称<input name="nickname" value="' + esc(nick) + '" maxlength="32" required></label>' +
      '<div class="err" id="nickErr"></div><div class="ok" id="nickOk"></div><button class="primary" type="submit">保存昵称</button></form>' +
      '<h3>更换头像</h3><p class="row wrap"><input type="file" id="avatarFile" accept="image/png,image/jpeg,image/webp,image/gif"><button class="ghost" id="avatarUpload" type="button">上传头像</button></p>' +
      '<p class="muted small">头像大小上限 200KB；超出时将先在本地压缩（缩放为 JPEG）再上传。</p><p class="small" id="avatarSt" role="status"></p></div>' +
      '<div class="card"><h2>我的个人二维码</h2><div id="qrBox"><p class="muted">正在生成…</p></div><p class="muted small">二维码内容为您的账户 ID，好友可扫码后按账户 ID 精确搜索添加您。</p></div>' +
      '<div class="card"><h2>我的论坛主页</h2><p class="muted">查看公开个人主页：' + (uid ? '<a href="#/forum/user/' + esc(uid) + '">前往我的个人主页</a>' : '—') + '</p></div>';
    if (p.hasAvatar) showAvatar($('#meAvatar'), '/profile/avatar', myAvatarVer, 44);
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
          showAvatar($('#meAvatar'), '/profile/avatar', myAvatarVer, 44);
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
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
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
  // 两步弹窗：第一步讲清对象与后果并确认，第二步输入登录密码完成身份核验（reauth）。
  // 返回 { confirmed:true, password } 或 null（取消）。fieldsHtml 为第一步的附加表单，
  // collect() 从第一步表单读取业务字段。
  function ownerConfirm(opts) {
    return new Promise(function (resolve) {
      var ov = el('<div class="own-overlay"><div class="own-dialog" role="dialog" aria-modal="true">' +
        '<h3>' + esc(opts.title) + '</h3><p>' + esc(opts.body) + '</p>' +
        (opts.fieldsHtml || '') +
        '<p class="muted small">该操作将记录在管理审计中。此为第一步确认，请核对无误后再继续。</p>' +
        '<div class="row-end"><button type="button" class="ghost" data-act="cancel">取消</button>' +
        '<button type="button" class="' + (opts.danger ? 'own-danger' : 'primary') + '" data-act="next">确认无误，继续</button></div></div></div>');
      document.body.appendChild(ov);
      function close(v) { ov.remove(); resolve(v); }
      ov.addEventListener('click', function (ev) { if (ev.target === ov) close(null); });
      ov.querySelector('[data-act="cancel"]').addEventListener('click', function () { close(null); });
      ov.querySelector('[data-act="next"]').addEventListener('click', function () {
        var fields = opts.collect ? opts.collect(ov) : {};
        if (fields === null) return;
        ov.querySelector('.own-dialog').innerHTML =
          '<h3>身份核验</h3><p class="muted">为防止账号被他人冒用执行敏感操作，请输入您的登录密码完成核验。核验通过后操作将立即执行。</p>' +
          '<label for="ownPw">登录密码</label><input id="ownPw" type="password" autocomplete="current-password">' +
          '<p class="own-err muted small" style="color:#a50e0e;"></p>' +
          '<div class="row-end"><button type="button" class="ghost" data-act="cancel2">取消</button>' +
          '<button type="button" class="primary" data-act="go">确认执行</button></div>';
        var pw = ov.querySelector('#ownPw'); pw.focus();
        ov.querySelector('[data-act="cancel2"]').addEventListener('click', function () { close(null); });
        ov.querySelector('[data-act="go"]').addEventListener('click', function () {
          if (!pw.value) { ov.querySelector('.own-err').textContent = '请输入登录密码。'; return; }
          fields.password = pw.value; fields.confirm = true;
          close(fields);
        });
      });
    });
  }
  async function ownerDo(path, body, doneMsg) {
    var r = await api(path, { method: 'POST', body: body });
    if (!r.ok) { alert(r.message || '操作失败，请稍后重试。'); return null; }
    if (doneMsg) alert(doneMsg);
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
    if (r.arg === 'audit') return pageOwnerAudit();
    return pageOwnerUsers(r);
  }

  async function pageOwnerUsers(r) {
    view.innerHTML = '<div class="card"><h2>站长管理台 · 用户管理</h2>' +
      '<p class="row wrap"><a class="ghost" href="#/owner/reviews">审核队列</a><a class="ghost" href="#/owner/audit">管理审计</a></p>' +
      '<form id="ownSearch" class="row wrap" style="margin-top:10px;"><select id="ownBy"><option value="username">按账户 ID</option><option value="email">按邮箱</option></select>' +
      '<input id="ownQ" type="text" placeholder="输入账户 ID 或邮箱（支持开头匹配）" style="flex:1;min-width:180px;padding:9px 10px;border:1px solid var(--line);border-radius:8px;">' +
      '<button class="primary" type="submit">搜索</button></form>' +
      '<p class="muted small">邮箱在列表中打码展示；完整邮箱仅可在用户详情中经身份核验后单条查看。</p>' +
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
      return '<a class="item" href="#/owner/user/' + u.id + '">' + avatarSlotHtml(u.id, u.avatarVersion, u.hasAvatar, u.nickname || u.username, 40) +
        '<span class="grow"><strong>' + esc(u.nickname || u.username) + '</strong>' + banBadge(u) + '<br><span class="muted small">账户 ID：' + esc(u.username) + ' ｜ ' + esc(u.emailMasked) + ' ｜ 注册于 ' + esc(fmtTs(u.createdAt)) + '</span></span><span aria-hidden="true">›</span></a>';
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
      ['昵称', esc(b.nickname || '（未设置）')],
      ['邮箱', esc(b.emailMasked) + ' <button class="ghost" id="ownViewEmail" type="button">查看完整邮箱</button>'],
      ['账号状态', esc(b.status) + (b.passwordFrozen ? ' ｜ 密码已冻结' : '') + (b.deletion ? ' ｜ 已申请注销（生效时间 ' + esc(fmtTs(b.deletion.effectiveAt || 0)) + '）' : '')],
      ['密码', b.passwordSet.set ? '已设置' : '未设置（谷歌新账号待补设）'],
      ['谷歌登录', b.googleBound ? '已绑定' : '未绑定'],
      ['注册时间', esc(fmtTs(b.createdAt))],
      ['最近活跃', b.lastActiveAt ? esc(fmtTs(b.lastActiveAt)) : '—'],
    ]);
    fillAvatars(box);
    $('#ownViewEmail').addEventListener('click', async function () {
      var f = await ownerConfirm({ title: '查看完整邮箱', body: '您将查看该用户的完整邮箱地址。此操作将记录在管理审计中（记录不含邮箱本身）。' });
      if (!f) return;
      var vr = await api('/owner/users/' + uid + '/view-email', { method: 'POST', body: f });
      if (!vr.ok) return alert(vr.message || '核验未通过。');
      alert('该用户的完整邮箱：' + vr.data.email);
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
        fieldsHtml: '<label for="fNewPw">新密码（8 至 72 位）</label><input id="fNewPw" type="text" autocomplete="off">',
        collect: function (ov) { var v = ov.querySelector('#fNewPw').value; if (v.length < 8 || v.length > 72) { alert('新密码长度须为 8 至 72 位。'); return null; } return { newPassword: v }; },
      });
      if (!f1) return;
      var r1 = await ownerDo('/owner/users/' + uid + '/set-password', f1);
      if (r1) done(r1.message || '密码已重置。');
    } else if (act === 'nickname') {
      var f2 = await ownerConfirm({
        title: '修改昵称', body: '新昵称将即时生效并公开显示，须通过内容审核口径。',
        fieldsHtml: '<label for="fNick">新昵称</label><input id="fNick" type="text" maxlength="24">',
        collect: function (ov) { var v = ov.querySelector('#fNick').value.trim(); if (!v) { alert('请填写新昵称。'); return null; } return { nickname: v }; },
      });
      if (!f2) return;
      var r2 = await ownerDo('/owner/users/' + uid + '/profile', f2);
      if (r2) done(r2.message || '资料已更新。');
    } else if (act === 'email') {
      var f3 = await ownerConfirm({
        title: '更换绑定邮箱', danger: true,
        body: '您将把该用户的绑定邮箱更换为新邮箱。执行后：该用户在所有设备上的登录状态将被退出；新邮箱与原邮箱都会收到通知邮件。',
        fieldsHtml: '<label for="fMail">新邮箱</label><input id="fMail" type="email" autocomplete="off">',
        collect: function (ov) { var v = ov.querySelector('#fMail').value.trim(); if (!v) { alert('请填写新邮箱。'); return null; } return { newEmail: v }; },
      });
      if (!f3) return;
      var r3 = await ownerDo('/owner/users/' + uid + '/change-email', f3);
      if (r3) done(r3.message || '绑定邮箱已更换。');
    } else if (act === 'ban') {
      var f4 = await ownerConfirm({
        title: '封禁用户', danger: true,
        body: '封禁后该用户将无法登录（警告除外），其现有登录状态会被退出。封禁原因将按既定口径向该用户展示。',
        fieldsHtml: '<label for="fLevel">封禁级别</label><select id="fLevel"><option value="warn">警告（仅记录）</option><option value="timed">限时封禁</option><option value="permanent">永久封禁</option></select>' +
          '<label for="fDays">限时封禁天数（限时时填写）</label><input id="fDays" type="number" min="1" value="7">' +
          '<label for="fReason">封禁原因（向用户展示）</label><input id="fReason" type="text" value="违反用户协议">' +
          '<label><input type="checkbox" id="fDev" style="width:auto;"> 同时封禁该用户名下设备</label>',
        collect: function (ov) {
          var out = { level: ov.querySelector('#fLevel').value, reasonText: ov.querySelector('#fReason').value.trim() || '违反用户协议', alsoBanDevices: ov.querySelector('#fDev').checked };
          if (out.level === 'timed') out.durationDays = Number(ov.querySelector('#fDays').value) || 7;
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
      if (r7) done('已静默断开 ' + r7.disconnected + ' 条连接。');
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
        loadOwnerTab(uid, btn.getAttribute('data-tab'));
      });
    });
    loadOwnerTab(uid, 'points');
  }
  async function loadOwnerTab(uid, tab) {
    var body = $('#ownTabBody'); if (!body) return;
    body.innerHTML = '<p class="muted">正在加载…</p>';
    var fail = function (r) { body.innerHTML = '<p class="muted">加载失败：' + esc((r && r.message) || '') + '</p>'; };
    if (tab === 'points') {
      var r = await api('/owner/users/' + uid + '/points'); if (!r.ok) return fail(r);
      var d = r.data;
      var orders = (d.orders || []).map(function (o) {
        return '<tr><td>#' + o.id + '</td><td>' + esc(o.productName || '') + '</td><td>' + o.pricePoints + ' 分</td><td>' + esc(o.status) + '</td><td>' + esc(o.payoutAddressMasked || o.payoutEmailMasked || '—') + (o.payoutAddressMasked ? ' <button class="ghost" data-payout="' + o.id + '" type="button">查看完整发放信息</button>' : '') + '</td></tr>';
      }).join('');
      body.innerHTML = kvTable([['可用积分', String(d.points.balance)], ['冻结积分', String(d.points.frozen)], ['累计获得', String(d.points.totalEarned)], ['累计消耗', String(d.points.totalSpent)], ['附件用量', (d.attachmentUsageBytes / 1048576).toFixed(2) + ' MB']]) +
        '<h3>兑换订单</h3>' + (orders ? '<table class="kv"><tr><td>订单</td><td>商品</td><td>积分</td><td>状态</td><td>发放信息</td></tr>' + orders + '</table>' : '<p class="muted">暂无兑换订单。</p>') +
        '<p><button class="ghost" id="ownLedger" type="button">查看积分流水</button></p><div id="ownLedgerBox"></div>';
      body.querySelectorAll('[data-payout]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var f = await ownerConfirm({ title: '查看完整发放信息', body: '您将查看该订单的完整发放信息（收款地址或接收邮箱）。此操作将记录在管理审计中（记录不含具体内容）。' });
          if (!f) return;
          var vr = await api('/owner/users/' + uid + '/view-payout', { method: 'POST', body: { orderId: Number(btn.getAttribute('data-payout')), password: f.password } });
          if (!vr.ok) return alert(vr.message || '核验未通过。');
          alert('发放方式：' + (vr.data.payoutMethod || '') + '\n收款地址：' + (vr.data.payoutAddress || '—') + '\n接收邮箱：' + (vr.data.payoutEmail || '—'));
        });
      });
      var lb = $('#ownLedger');
      if (lb) lb.addEventListener('click', async function () {
        var lr = await api('/owner/users/' + uid + '/ledger?limit=50');
        var lbox = $('#ownLedgerBox');
        if (!lr.ok) { lbox.innerHTML = '<p class="muted">加载失败。</p>'; return; }
        var rows = (lr.data.ledger || []).map(function (x) { return '<tr><td>' + esc(fmtTs(x.createdAt)) + '</td><td>' + esc(x.type) + '</td><td>' + (x.amount > 0 ? '+' : '') + x.amount + '</td><td>' + x.balanceAfter + '</td><td>' + esc(x.note || '') + '</td></tr>'; }).join('');
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
        '<p class="muted small">通行密钥：' + (rd.data.passkeyStatus.hasPasskey ? '已创建 ' + rd.data.passkeyStatus.count + ' 个' : '未创建') + '。出于隐私保护，管理台不展示连接来源地址与访问目标。</p>';
    } else if (tab === 'forum') {
      var rf = await api('/owner/users/' + uid + '/forum'); if (!rf.ok) return fail(rf);
      var f = rf.data;
      body.innerHTML = kvTable([
        ['已发布帖子', String(f.stats.publishedPosts)], ['已发布回复', String(f.stats.publishedReplies)], ['累计获赞', String(f.stats.likesReceived)],
        ['创建的营地', (f.camps.created || []).map(function (c) { return esc(c.name) + '（' + esc(c.status) + '）'; }).join('、') || '无'],
        ['加入营地数', String(f.camps.joinedCount)],
        ['被举报次数', String(f.reports.reportedTimes) + '（成立 ' + f.reports.upheldTimes + ' 次）'],
        ['千赞奖励申请', (f.rewardApplications || []).length + ' 条'],
      ]);
    } else if (tab === 'risk') {
      var rr2 = await api('/owner/users/' + uid + '/risk'); if (!rr2.ok) return fail(rr2);
      var bans = (rr2.data.bans || []).map(function (x) {
        return '<tr><td>' + (x.targetKind === 'user' ? '账号' : '设备') + '</td><td>' + esc(x.level) + '</td><td>' + esc(x.source || '') + '</td><td>' + esc(x.status) + '</td><td>' + esc(fmtTs(x.createdAt)) + '</td><td>' + esc(x.reasonCode || '') + '</td></tr>';
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
        loadOwnerQueue(btn.getAttribute('data-q'));
      });
    });
    loadOwnerQueue('forum');
  }
  function reviewButtons(html) { return '<span class="row" style="margin-top:6px;">' + html + '</span>'; }
  async function loadOwnerQueue(kind) {
    var body = $('#ownQBody'); if (!body) return;
    body.innerHTML = '<p class="muted">正在加载…</p>';
    function decide(path, extra, title, danger) {
      return async function () {
        var f = await ownerConfirm({ title: title, body: '请确认对该条目执行此处理。处理结果将记录在管理审计中。', danger: danger });
        if (!f) return;
        Object.keys(extra).forEach(function (k) { f[k] = extra[k]; });
        var r = await ownerDo(path, f);
        if (r) loadOwnerQueue(kind);
      };
    }
    if (kind === 'forum') {
      var r = await api('/owner/reviews/forum-pending'); if (!r.ok) { body.innerHTML = '<p class="muted">加载失败。</p>'; return; }
      var d = r.data || {}; var html = '';
      (d.posts || []).forEach(function (p) {
        html += '<div class="item"><span class="grow"><strong>[待审帖子]</strong> ' + esc(p.title) + '<br><span class="muted small">' + esc(p.contentPreview || '') + '</span></span></div>' +
          reviewButtons('<button class="primary" data-a="' + p.id + '">通过</button><button class="ghost" data-r="' + p.id + '">驳回</button><button class="ghost" data-d="' + p.id + '">删除</button>');
        setTimeout(function () {}, 0);
      });
      (d.replies || []).forEach(function (p) { html += '<div class="item"><span class="grow"><strong>[待审回复]</strong><br><span class="muted small">' + esc(p.contentPreview || '') + '</span></span></div>' + reviewButtons('<button class="primary" data-ar="' + p.id + '">通过</button><button class="ghost" data-rr="' + p.id + '">驳回</button><button class="ghost" data-dr="' + p.id + '">删除</button>'); });
      (d.camps || []).forEach(function (c) { html += '<div class="item"><span class="grow"><strong>[待审营地]</strong> ' + esc(c.name) + '<br><span class="muted small">' + esc(c.introPreview || '') + '</span></span></div>' + reviewButtons('<button class="primary" data-ac="' + c.id + '">通过</button><button class="ghost" data-rc="' + c.id + '">驳回</button>'); });
      (d.campRenames || []).forEach(function (c) { html += '<div class="item"><span class="grow"><strong>[营地改名]</strong> ' + esc(c.name) + ' → ' + esc(c.pendingName) + '</span></div>' + reviewButtons('<button class="primary" data-an="' + c.id + '">通过</button><button class="ghost" data-rn="' + c.id + '">驳回</button>'); });
      (d.campFlags || []).forEach(function (c) { html += '<div class="item"><span class="grow"><strong>[营地复核]</strong> ' + esc(c.name) + '</span></div>' + reviewButtons('<button class="primary" data-rp="' + c.id + '">复开营地</button>'); });
      body.innerHTML = html || '<p class="muted">暂无待审内容。</p>';
      body.querySelectorAll('[data-a]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/post/' + b.getAttribute('data-a') + '/review', { decision: 'approve' }, '通过该帖子')); });
      body.querySelectorAll('[data-r]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/post/' + b.getAttribute('data-r') + '/review', { decision: 'reject' }, '驳回该帖子', true)); });
      body.querySelectorAll('[data-d]').forEach(function (b) { b.addEventListener('click', decide('/owner/forum/post/' + b.getAttribute('data-d') + '/delete', {}, '删除该帖子', true)); });
      body.querySelectorAll('[data-ar]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/reply/' + b.getAttribute('data-ar') + '/review', { decision: 'approve' }, '通过该回复')); });
      body.querySelectorAll('[data-rr]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/reply/' + b.getAttribute('data-rr') + '/review', { decision: 'reject' }, '驳回该回复', true)); });
      body.querySelectorAll('[data-dr]').forEach(function (b) { b.addEventListener('click', decide('/owner/forum/reply/' + b.getAttribute('data-dr') + '/delete', {}, '删除该回复', true)); });
      body.querySelectorAll('[data-ac]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/camp/' + b.getAttribute('data-ac') + '/review', { decision: 'approve' }, '通过该营地')); });
      body.querySelectorAll('[data-rc]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/camp/' + b.getAttribute('data-rc') + '/review', { decision: 'reject' }, '驳回该营地', true)); });
      body.querySelectorAll('[data-an]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/campRename/' + b.getAttribute('data-an') + '/review', { decision: 'approve' }, '通过该改名')); });
      body.querySelectorAll('[data-rn]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/forum/campRename/' + b.getAttribute('data-rn') + '/review', { decision: 'reject' }, '驳回该改名', true)); });
      body.querySelectorAll('[data-rp]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/camps/' + b.getAttribute('data-rp') + '/reopen', {}, '复开该营地')); });
    } else if (kind === 'appeals') {
      var ra = await api('/owner/reviews/appeals?status=pending'); if (!ra.ok) { body.innerHTML = '<p class="muted">加载失败。</p>'; return; }
      var list = (ra.data && ra.data.appeals) || [];
      body.innerHTML = list.length ? list.map(function (a) {
        return '<div class="item"><span class="grow"><strong>封号申诉 #' + a.id + '</strong>（用户 ' + a.userId + '）<br><span class="muted small">' + esc(a.content || '') + '</span></span></div>' +
          reviewButtons('<button class="primary" data-ap="' + a.id + '">批准（解封）</button><button class="ghost" data-rj="' + a.id + '">驳回</button>');
      }).join('') : '<p class="muted">暂无待审申诉。</p>';
      body.querySelectorAll('[data-ap]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/appeals/' + b.getAttribute('data-ap') + '/review', { decision: 'approve' }, '批准该申诉')); });
      body.querySelectorAll('[data-rj]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/appeals/' + b.getAttribute('data-rj') + '/review', { decision: 'reject' }, '驳回该申诉', true)); });
    } else if (kind === 'recovery') {
      var rr3 = await api('/owner/reviews/recovery?status=pending'); if (!rr3.ok) { body.innerHTML = '<p class="muted">加载失败。</p>'; return; }
      var list3 = (rr3.data && rr3.data.appeals) || [];
      body.innerHTML = list3.length ? list3.map(function (a) {
        return '<div class="item"><span class="grow"><strong>找回申诉 #' + a.id + '</strong>（账号 ' + esc(a.account || '') + '）<br><span class="muted small">旧密码命中 ' + (a.oldPasswordHits || 0) + ' 个 ｜ 机型 ' + esc(a.deviceModel || '—') + ' ｜ 地点 ' + esc(a.locationText || '—') + ' ｜ 好友验证 ' + (a.friendVerified ? '已通过' : '未完成') + '</span></span></div>' +
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
          if (!lr.ok) return alert(lr.message || '加载失败。');
          var d = lr.data;
          alert('点赞构成（脱敏聚合）：\n总赞 ' + d.total + ' ｜ 独立设备 ' + d.distinctDevices + ' ｜ 独立来源 ' + d.distinctIpHashes + '\n单设备最高占比 ' + Math.round(d.topDeviceShare * 100) + '% ｜ 单来源最高占比 ' + Math.round(d.topIpShare * 100) + '%');
        });
      });
    } else if (kind === 'orders') {
      var ro = await api('/owner/reviews/orders'); if (!ro.ok) { body.innerHTML = '<p class="muted">加载失败。</p>'; return; }
      var list5 = ((ro.data && ro.data.orders) || []).filter(function (o) { return o.status === 'pending_review' || o.status === 'pending_payout'; });
      body.innerHTML = list5.length ? list5.map(function (o) {
        return '<div class="item"><span class="grow"><strong>兑换订单 #' + o.id + '</strong>（用户 ' + o.userId + '，' + o.pricePoints + ' 分，状态 ' + esc(o.status) + '）</span></div>' +
          reviewButtons('<button class="primary" data-rv="' + o.id + '">审核通过</button><button class="ghost" data-rjo="' + o.id + '">审核驳回</button>');
      }).join('') : '<p class="muted">暂无待处理订单。</p>';
      body.querySelectorAll('[data-rv]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/orders/' + b.getAttribute('data-rv') + '/review', { decision: 'approve' }, '审核通过该订单')); });
      body.querySelectorAll('[data-rjo]').forEach(function (b) { b.addEventListener('click', decide('/owner/reviews/orders/' + b.getAttribute('data-rjo') + '/review', { decision: 'reject' }, '驳回该订单', true)); });
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

  // ---------- 启动 ----------
  renderIdentity();
  probeOwner();
  render();
  checkMaintenance();
  setInterval(checkMaintenance, 60000);
})();
