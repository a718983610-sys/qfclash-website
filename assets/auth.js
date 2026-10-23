// QFClash 官网账号模块：与 App 同一账号体系（同服务器 /auth/*）。
// 提供：导航登录状态、登录/注册弹窗（注册一步式五栏：ID、邮箱、密码、
// 重复密码、验证码同屏，提交时前端依次验码换票据、带 username 完成注册；
// 登录支持邮箱或 ID＋密码）、双令牌本地保存、
// 401 自动续期、谷歌一键登录（GIS 官方库，令牌走 /auth/google，落同一套
// 会话）。论坛页通过 window.QFAuth 复用同一登录态。
(function () {
  var API = "https://qfclash-account.a718983610.workers.dev";

  var STR = {
    zh: {
      nav_login: "登录 / 注册", logout: "退出登录",
      tab_login: "登录", tab_register: "注册",
      email_ph: "邮箱地址", password_ph: "密码", code_ph: "邮箱验证码",
      id_ph: "账户 ID（至少 8 位，字母与数字）", login_id_ph: "邮箱或 ID",
      pwd_set_ph: "请设置登录密码（8 至 72 位）", pwd_confirm_ph: "请再次输入密码",
      google_btn: "使用 Google 账号登录", or: "或",
      google_fail: "谷歌登录失败，请稍后重试。",
      google_load_fail: "谷歌登录组件加载失败，请检查网络连接后重试。",
      do_login: "登录", send_code: "发送验证码",
      complete_reg: "完成注册",
      dual_hint: "为保障账号安全，本次登录需完成邮箱验证码校验。",
      get_code: "获取验证码",
      reg_note: "在本网站注册的账号与 QFClash 应用通用，注册完成后可直接使用同一账号在应用内登录。",
      reg_form_note: "请填写以下信息完成注册：设置账户 ID 与登录密码（密码需填写两次，两次输入须一致），最后获取并填写邮箱验证码。",
      v_email: "请输入有效的邮箱地址。",
      v_id: "账户 ID 至少 8 位，只能包含英文字母与数字，且必须包含字母。",
      id_taken: "该账户ID已被注册。",
      v_identifier: "请输入邮箱或账户 ID。",
      v_pwd_empty: "请输入密码。",
      v_pwd_len: "密码长度需为 8 至 72 位，请重新输入。",
      v_pwd_match: "两次输入的密码不一致，请重新核对。",
      v_code: "请输入邮箱验证码。",
      code_sent: "验证码已发送至您的邮箱，请查收。",
      reg_ok: "注册成功，已为您自动登录。",
      login_ok: "登录成功。",
      generic_fail: "操作失败，请稍后重试。",
      login_fail: "登录失败，请核对邮箱或 ID 与密码后重试。",
      working: "正在处理，请稍候……"
    },
    en: {
      nav_login: "Sign In / Register", logout: "Sign Out",
      tab_login: "Sign In", tab_register: "Register",
      email_ph: "Email address", password_ph: "Password", code_ph: "Email verification code",
      id_ph: "Account ID (min. 8 characters, letters and numbers)", login_id_ph: "Email or ID",
      pwd_set_ph: "Set a password (8 to 72 characters)", pwd_confirm_ph: "Re-enter the password",
      google_btn: "Continue with Google", or: "or",
      google_fail: "Google sign-in failed. Please try again later.",
      google_load_fail: "The Google sign-in component failed to load. Please check your connection and try again.",
      do_login: "Sign In", send_code: "Send Code",
      complete_reg: "Complete Registration",
      dual_hint: "To keep your account secure, this sign-in requires an email verification code.",
      get_code: "Get Code",
      reg_note: "Accounts registered on this website work across QFClash: once registered, you can sign in to the app directly with the same account.",
      reg_form_note: "Complete the fields below to register: choose an account ID, set a sign-in password (entered twice; both entries must match), then request and enter the email verification code.",
      v_email: "Please enter a valid email address.",
      v_id: "The account ID must be at least 8 characters, contain only letters and numbers, and include at least one letter.",
      id_taken: "This account ID has already been registered.",
      v_identifier: "Please enter your email address or account ID.",
      v_pwd_empty: "Please enter your password.",
      v_pwd_len: "The password must be 8 to 72 characters. Please try again.",
      v_pwd_match: "The two passwords do not match. Please check and try again.",
      v_code: "Please enter the email verification code.",
      code_sent: "A verification code has been sent to your email. Please check your inbox.",
      reg_ok: "Registration completed. You are now signed in.",
      login_ok: "Signed in successfully.",
      generic_fail: "The operation failed. Please try again later.",
      login_fail: "Sign-in failed. Please check your email or ID and password and try again.",
      working: "Processing, please wait…"
    }
  };

  var lang = "zh";
  try { lang = localStorage.getItem("qf_lang") || "zh"; } catch (e) {}
  function t(k) { return (STR[lang] || STR.zh)[k] || k; }

  // ---------- 存储 ----------
  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function deviceId() {
    var id = lsGet("qf_web_id");
    if (!id) {
      id = "web-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
      lsSet("qf_web_id", id);
    }
    return id;
  }
  function token() { return lsGet("qf_access_token"); }
  function label() { return lsGet("qf_nickname") || lsGet("qf_email") || ""; }
  function saveSession(data) {
    if (data.accessToken) lsSet("qf_access_token", data.accessToken);
    if (data.refreshToken) lsSet("qf_refresh_token", data.refreshToken);
    if (data.user && data.user.email) lsSet("qf_email", data.user.email);
    if (data.email) lsSet("qf_email", data.email);
  }
  function clearSession() {
    lsDel("qf_access_token"); lsDel("qf_refresh_token"); lsDel("qf_nickname"); lsDel("qf_email");
  }

  // ---------- API ----------
  function post(path, body, auth) {
    var headers = { "content-type": "application/json" };
    if (auth && token()) headers["authorization"] = "Bearer " + token();
    return fetch(API + path, { method: "POST", headers: headers, body: JSON.stringify(body || {}) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, ok: res.ok && data.ok !== false, data: data };
        });
      });
  }
  function refresh() {
    var rt = lsGet("qf_refresh_token");
    if (!rt) return Promise.resolve(false);
    return post("/auth/refresh", { refreshToken: rt }).then(function (r) {
      if (r.ok && r.data.accessToken) {
        lsSet("qf_access_token", r.data.accessToken);
        if (r.data.refreshToken) lsSet("qf_refresh_token", r.data.refreshToken);
        return true;
      }
      clearSession(); renderNav(); fireChange();
      return false;
    }).catch(function () { return false; });
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = { "content-type": "application/json" };
    if (opts.auth && token()) headers["authorization"] = "Bearer " + token();
    return fetch(API + path, {
      method: opts.method || "GET", headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401 && opts.auth && !opts._retried) {
          return refresh().then(function (okR) {
            if (okR) { opts._retried = true; return api(path, opts); }
            return { status: res.status, ok: false, data: data };
          });
        }
        return { status: res.status, ok: res.ok && data.ok !== false, data: data };
      });
    });
  }
  function serverMsg(data, fallbackKey) {
    if (data && typeof data.message === "string" && data.message) return data.message;
    return t(fallbackKey || "generic_fail");
  }
  function fireChange() { window.dispatchEvent(new CustomEvent("qf-auth-change")); }

  // ---------- 谷歌一键登录（Google Identity Services 官方库） ----------
  var GOOGLE_CLIENT_ID = "340614194006-7a7anda3p473qjlhr67k6hn3o6aaqu9o.apps.googleusercontent.com";
  var gisState = "idle"; // idle | loading | ready | failed
  function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      gisState = "ready";
      return;
    }
    if (gisState === "loading" || gisState === "failed") return;
    gisState = "loading";
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = function () { gisState = "ready"; renderGoogleButton(); };
    s.onerror = function () { gisState = "failed"; renderGoogleButton(); };
    document.head.appendChild(s);
  }
  function onGoogleCredential(resp) {
    if (!resp || !resp.credential) { showAlert(t("google_fail"), false); return; }
    post("/auth/google", {
      idToken: resp.credential,
      deviceHash: deviceId(), deviceName: "Website", platform: "website"
    }).then(function (r) {
      if (r.ok && r.data.accessToken) {
        saveSession(r.data);
        finishAuth(t("login_ok"));
      } else {
        showAlert(serverMsg(r.data, "google_fail"), false);
      }
    }).catch(function () { showAlert(t("generic_fail"), false); });
  }
  function renderGoogleButton() {
    var host = document.getElementById("googleBtnHost");
    if (!host) return;
    if (!(window.google && window.google.accounts && window.google.accounts.id)) {
      // GIS 库未就绪：加载中先留空；加载失败给一只回退按钮，点击给真实错误。
      if (gisState === "failed" && !host.firstChild) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "google-btn";
        b.textContent = t("google_btn");
        b.addEventListener("click", function () { showAlert(t("google_load_fail"), false); });
        host.appendChild(b);
      }
      return;
    }
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      locale: lang === "en" ? "en" : "zh_CN"
    });
    host.innerHTML = "";
    var w = host.clientWidth || 364;
    if (w > 364) w = 364;
    if (w < 200) w = 200;
    google.accounts.id.renderButton(host, {
      type: "standard", theme: "outline", size: "large",
      text: "continue_with", shape: "rectangular",
      logo_alignment: "left", width: w
    });
  }

  // ---------- 弹窗 ----------
  var regState = { email: "" };
  function buildModal() {
    if (document.getElementById("authModal")) return;
    var mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.id = "authModal";
    mask.innerHTML =
      '<div class="modal">' +
      '<div class="auth-tabs">' +
      '<button type="button" class="auth-tab active" id="tabLogin"></button>' +
      '<button type="button" class="auth-tab" id="tabRegister"></button>' +
      "</div>" +
      '<div class="alert" id="authAlert"></div>' +
      // 登录
      '<div id="paneLogin">' +
      '<div id="googleBtnHost" style="display:flex;justify-content:center;margin-bottom:6px;min-height:44px"></div>' +
      '<div class="divider" id="orDiv"></div>' +
      '<input id="liEmail" type="text" autocomplete="username">' +
      '<p class="field-err" id="liEmailErr"></p>' +
      '<input id="liPassword" type="password" autocomplete="current-password">' +
      '<p class="field-err" id="liPwdErr"></p>' +
      '<div id="liDual" class="hidden">' +
      '<div class="row"><input id="liCode" type="text"><button class="small-btn" id="liGetCode" type="button"></button></div>' +
      '<p class="hint" id="liDualHint"></p>' +
      "</div>" +
      '<div style="display:flex;gap:10px"><button type="button" class="btn-blue" id="liSubmit"></button>' +
      '<button type="button" class="small-btn" data-close></button></div>' +
      "</div>" +
      // 注册（一步式五栏：ID、邮箱、密码、重复密码、验证码同屏，一次提交完成）
      '<div id="paneRegister" class="hidden">' +
      '<p class="step-note" id="regNote"></p>' +
      '<p class="step-note" id="regFormNote"></p>' +
      '<input id="rgId" type="text" autocomplete="username">' +
      '<p class="field-err" id="rgIdErr"></p>' +
      '<input id="rgEmail" type="email" autocomplete="email">' +
      '<p class="field-err" id="rgEmailErr"></p>' +
      '<input id="rgPwd" type="password" autocomplete="new-password">' +
      '<p class="field-err" id="rgPwdErr"></p>' +
      '<input id="rgPwd2" type="password" autocomplete="new-password">' +
      '<p class="field-err" id="rgPwd2Err"></p>' +
      '<div class="row"><input id="rgCode" type="text"><button class="small-btn" id="rgSendCode" type="button"></button></div>' +
      '<p class="field-err" id="rgCodeErr"></p>' +
      '<div style="display:flex;gap:10px"><button type="button" class="btn-blue" id="rgComplete"></button>' +
      '<button type="button" class="small-btn" data-close></button></div>' +
      "</div>" +
      "</div>";
    document.body.appendChild(mask);
    mask.addEventListener("click", function (ev) { if (ev.target === mask) close(); });
    mask.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", close);
    });
    document.getElementById("tabLogin").addEventListener("click", function () { switchTab("login"); });
    document.getElementById("tabRegister").addEventListener("click", function () { switchTab("register"); });
    document.getElementById("liSubmit").addEventListener("click", doLogin);
    document.getElementById("liGetCode").addEventListener("click", function () {
      var email = document.getElementById("liEmail").value.trim();
      if (!validEmail(email)) { fieldErr("liEmail", "liEmailErr", t("v_email")); return; }
      post("/auth/login/request-code", { email: email }).then(function (r) {
        showAlert(r.ok ? t("code_sent") : serverMsg(r.data), r.ok);
      }).catch(function () { showAlert(t("generic_fail"), false); });
    });
    document.getElementById("rgSendCode").addEventListener("click", function () {
      var email = document.getElementById("rgEmail").value.trim();
      clearErr("rgEmail", "rgEmailErr");
      if (!validEmail(email)) { fieldErr("rgEmail", "rgEmailErr", t("v_email")); return; }
      post("/auth/register/request-code", { email: email }).then(function (r) {
        if (r.ok) { regState.email = email; showAlert(t("code_sent"), true); }
        else showAlert(serverMsg(r.data), false);
      }).catch(function () { showAlert(t("generic_fail"), false); });
    });
    document.getElementById("rgComplete").addEventListener("click", doRegister);
    applyTexts();
    loadGis();
  }
  function applyTexts() {
    var set = function (id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };
    var ph = function (id, txt) { var el = document.getElementById(id); if (el) el.setAttribute("placeholder", txt); };
    set("tabLogin", t("tab_login")); set("tabRegister", t("tab_register"));
    set("orDiv", t("or"));
    set("liSubmit", t("do_login")); set("liGetCode", t("get_code")); set("liDualHint", t("dual_hint"));
    set("regNote", t("reg_note")); set("regFormNote", t("reg_form_note"));
    set("rgSendCode", t("send_code"));
    set("rgComplete", t("complete_reg"));
    ph("liEmail", t("login_id_ph")); ph("liPassword", t("password_ph")); ph("liCode", t("code_ph"));
    ph("rgId", t("id_ph"));
    ph("rgEmail", t("email_ph")); ph("rgCode", t("code_ph"));
    ph("rgPwd", t("pwd_set_ph")); ph("rgPwd2", t("pwd_confirm_ph"));
    document.querySelectorAll("#authModal [data-close]").forEach(function (b) {
      b.textContent = lang === "en" ? "Cancel" : "取消";
    });
    renderGoogleButton();
  }
  function switchTab(which) {
    document.getElementById("tabLogin").classList.toggle("active", which === "login");
    document.getElementById("tabRegister").classList.toggle("active", which === "register");
    document.getElementById("paneLogin").classList.toggle("hidden", which !== "login");
    document.getElementById("paneRegister").classList.toggle("hidden", which !== "register");
    hideAlert();
  }
  function showAlert(msg, ok) {
    var box = document.getElementById("authAlert");
    if (!box) return;
    box.textContent = msg;
    box.className = "alert show " + (ok ? "ok" : "err");
  }
  function hideAlert() { var box = document.getElementById("authAlert"); if (box) box.className = "alert"; }
  function fieldErr(inputId, errId, msg) {
    var i = document.getElementById(inputId), e = document.getElementById(errId);
    if (i) i.classList.add("invalid");
    if (e) { e.textContent = msg; e.classList.add("show"); }
  }
  function clearErr(inputId, errId) {
    var i = document.getElementById(inputId), e = document.getElementById(errId);
    if (i) i.classList.remove("invalid");
    if (e) e.classList.remove("show");
  }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || ""); }
  // 账户 ID：至少 8 位、只许英文字母与数字、必须包含字母。
  function validUsername(v) { return /^(?=.*[A-Za-z])[A-Za-z0-9]{8,}$/.test(v || ""); }

  // 注册一步式提交：前端依次验码换 ticket → 用 ticket 带 username 设密码完成注册，
  // 对用户呈现为一次提交；任一步出错都在对应字段下标错，已填内容不清空。
  function doRegister() {
    var username = document.getElementById("rgId").value.trim();
    var email = document.getElementById("rgEmail").value.trim();
    var code = document.getElementById("rgCode").value.trim();
    var p1 = document.getElementById("rgPwd").value;
    var p2 = document.getElementById("rgPwd2").value;
    clearErr("rgId", "rgIdErr");
    clearErr("rgEmail", "rgEmailErr"); clearErr("rgCode", "rgCodeErr");
    clearErr("rgPwd", "rgPwdErr"); clearErr("rgPwd2", "rgPwd2Err");
    if (!validUsername(username)) { fieldErr("rgId", "rgIdErr", t("v_id")); return; }
    if (!validEmail(email)) { fieldErr("rgEmail", "rgEmailErr", t("v_email")); return; }
    if (!p1 || p1.length < 8 || p1.length > 72) { fieldErr("rgPwd", "rgPwdErr", t("v_pwd_len")); return; }
    if (p1 !== p2) { fieldErr("rgPwd2", "rgPwd2Err", t("v_pwd_match")); return; }
    if (!code) { fieldErr("rgCode", "rgCodeErr", t("v_code")); return; }
    var btn = document.getElementById("rgComplete");
    btn.disabled = true;
    var done = function () { btn.disabled = false; };
    post("/auth/register/verify", { email: email, code: code }).then(function (r) {
      if (!r.ok || !r.data.ticket) {
        var msg = serverMsg(r.data);
        if (/邮箱|email/i.test(msg)) fieldErr("rgEmail", "rgEmailErr", msg);
        else fieldErr("rgCode", "rgCodeErr", msg);
        done();
        return;
      }
      regState.email = email;
      post("/auth/register/complete", {
        ticket: r.data.ticket, password: p1, username: username,
        deviceHash: deviceId(), deviceName: "Website", platform: "website"
      }).then(function (r2) {
        done();
        if (r2.ok && r2.data.accessToken) {
          saveSession(r2.data);
          finishAuth(t("reg_ok"));
        } else if (r2.data && (r2.data.code === "USERNAME_TAKEN" || r2.data.error === "USERNAME_TAKEN")) {
          fieldErr("rgId", "rgIdErr", t("id_taken"));
        } else {
          var msg2 = serverMsg(r2.data);
          if (/已被注册|already (been )?registered/i.test(msg2)) fieldErr("rgId", "rgIdErr", t("id_taken"));
          else if (/密码|password/i.test(msg2)) fieldErr("rgPwd", "rgPwdErr", msg2);
          else if (/验证|过期|ticket|code/i.test(msg2)) fieldErr("rgCode", "rgCodeErr", msg2);
          else showAlert(msg2, false);
        }
      }).catch(function () { done(); showAlert(t("generic_fail"), false); });
    }).catch(function () { done(); showAlert(t("generic_fail"), false); });
  }

  function doLogin() {
    var identifier = document.getElementById("liEmail").value.trim();
    var password = document.getElementById("liPassword").value;
    var code = document.getElementById("liCode").value.trim();
    clearErr("liEmail", "liEmailErr"); clearErr("liPassword", "liPwdErr");
    if (!identifier) { fieldErr("liEmail", "liEmailErr", t("v_identifier")); return; }
    if (identifier.indexOf("@") >= 0 && !validEmail(identifier)) { fieldErr("liEmail", "liEmailErr", t("v_email")); return; }
    if (!password) { fieldErr("liPassword", "liPwdErr", t("v_pwd_empty")); return; }
    var body = { identifier: identifier, password: password, deviceHash: deviceId() };
    if (validEmail(identifier)) body.email = identifier;
    if (code) body.emailCode = code;
    post("/auth/login", body).then(function (r) {
      if (r.ok && r.data.dualVerifyRequired) {
        document.getElementById("liDual").classList.remove("hidden");
        showAlert(r.data.message || t("dual_hint"), false);
      } else if (r.ok && r.data.accessToken) {
        saveSession(r.data);
        if (validEmail(identifier)) lsSet("qf_email", identifier);
        finishAuth(t("login_ok"));
      } else {
        showAlert(serverMsg(r.data, "login_fail"), false);
      }
    }).catch(function () { showAlert(t("generic_fail"), false); });
  }
  function finishAuth(msg) {
    renderNav();
    fireChange();
    close();
    var nav = document.getElementById("navAuth");
    if (nav) nav.title = msg;
  }
  function open(mode) {
    buildModal();
    applyTexts();
    switchTab(mode === "register" ? "register" : "login");
    document.getElementById("authModal").classList.add("show");
    renderGoogleButton();
  }
  function close() {
    var m = document.getElementById("authModal");
    if (m) m.classList.remove("show");
  }

  // ---------- 导航登录态 ----------
  function renderNav() {
    var host = document.getElementById("navAuth");
    if (!host) return;
    if (token()) {
      host.innerHTML =
        '<span class="who">' + label().replace(/[<>&"]/g, "") + "</span>" +
        '<button type="button" class="small-btn" id="navLogout">' + t("logout") + "</button>";
      document.getElementById("navLogout").addEventListener("click", function () {
        post("/auth/logout", {}, true).catch(function () {});
        clearSession();
        renderNav();
        fireChange();
      });
    } else {
      host.innerHTML = '<button type="button" class="btn-blue" id="navLogin" style="padding:7px 16px;font-size:14px">' + t("nav_login") + "</button>";
      document.getElementById("navLogin").addEventListener("click", function () { open("login"); });
    }
  }

  function setLang(l) {
    lang = l === "en" ? "en" : "zh";
    renderNav();
    if (document.getElementById("authModal")) applyTexts();
  }
  window.addEventListener("qf-lang-change", function (ev) {
    if (ev.detail && ev.detail.lang) setLang(ev.detail.lang);
  });

  window.QFAuth = {
    open: open, close: close, token: token, label: label,
    deviceId: deviceId, api: api, post: post, refresh: refresh,
    clear: function () { clearSession(); renderNav(); fireChange(); },
    setNickname: function (n) { lsSet("qf_nickname", n || ""); renderNav(); },
    renderNav: renderNav, setLang: setLang
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderNav);
  } else {
    renderNav();
  }
})();
