// QFClash 官网账号模块：与 App 同一账号体系（同服务器 /auth/*）。
// 提供：导航登录状态、登录/注册弹窗（注册三步：发码→验码→设密码）、双令牌本地保存、
// 401 自动续期、谷歌登录占位。论坛页通过 window.QFAuth 复用同一登录态。
(function () {
  var API = "https://qfclash-account.a718983610.workers.dev";

  var STR = {
    zh: {
      nav_login: "登录 / 注册", logout: "退出登录",
      tab_login: "登录", tab_register: "注册",
      email_ph: "邮箱地址", password_ph: "密码", code_ph: "邮箱验证码",
      pwd_set_ph: "请设置登录密码（8 至 72 位）", pwd_confirm_ph: "请再次输入密码",
      google_btn: "使用 Google 账号登录", or: "或",
      google_soon: "谷歌登录即将上线，敬请期待。",
      do_login: "登录", send_code: "发送验证码", verify_next: "验证并继续",
      complete_reg: "完成注册", back: "返回上一步",
      dual_hint: "为保障账号安全，本次登录需完成邮箱验证码校验。",
      get_code: "获取验证码",
      reg_note: "在本网站注册的账号与 QFClash 应用通用，注册完成后可直接使用同一账号在应用内登录。",
      reg_step1_note: "请输入邮箱并获取验证码，验证码将发送至您的邮箱。",
      reg_step2_note: "邮箱验证已完成，请设置登录密码以完成注册。",
      v_email: "请输入有效的邮箱地址。",
      v_pwd_empty: "请输入密码。",
      v_pwd_len: "密码长度需为 8 至 72 位，请重新输入。",
      v_pwd_match: "两次输入的密码不一致，请重新核对。",
      v_code: "请输入邮箱验证码。",
      code_sent: "验证码已发送至您的邮箱，请查收。",
      reg_ok: "注册成功，已为您自动登录。",
      login_ok: "登录成功。",
      generic_fail: "操作失败，请稍后重试。",
      login_fail: "登录失败，请核对邮箱与密码后重试。",
      working: "正在处理，请稍候……"
    },
    en: {
      nav_login: "Sign In / Register", logout: "Sign Out",
      tab_login: "Sign In", tab_register: "Register",
      email_ph: "Email address", password_ph: "Password", code_ph: "Email verification code",
      pwd_set_ph: "Set a password (8 to 72 characters)", pwd_confirm_ph: "Re-enter the password",
      google_btn: "Continue with Google", or: "or",
      google_soon: "Google sign-in is coming soon. Stay tuned.",
      do_login: "Sign In", send_code: "Send Code", verify_next: "Verify and Continue",
      complete_reg: "Complete Registration", back: "Back",
      dual_hint: "To keep your account secure, this sign-in requires an email verification code.",
      get_code: "Get Code",
      reg_note: "Accounts registered on this website work across QFClash: once registered, you can sign in to the app directly with the same account.",
      reg_step1_note: "Enter your email address and request a verification code; the code will be sent to your email.",
      reg_step2_note: "Email verified. Please set a password to complete registration.",
      v_email: "Please enter a valid email address.",
      v_pwd_empty: "Please enter your password.",
      v_pwd_len: "The password must be 8 to 72 characters. Please try again.",
      v_pwd_match: "The two passwords do not match. Please check and try again.",
      v_code: "Please enter the email verification code.",
      code_sent: "A verification code has been sent to your email. Please check your inbox.",
      reg_ok: "Registration completed. You are now signed in.",
      login_ok: "Signed in successfully.",
      generic_fail: "The operation failed. Please try again later.",
      login_fail: "Sign-in failed. Please check your email and password and try again.",
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

  // ---------- 弹窗 ----------
  var regState = { email: "", ticket: "" };
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
      '<button type="button" class="google-btn" id="googleBtn"><span class="g">G</span><span id="googleBtnTxt"></span></button>' +
      '<div class="divider" id="orDiv"></div>' +
      '<input id="liEmail" type="email" autocomplete="username">' +
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
      // 注册
      '<div id="paneRegister" class="hidden">' +
      '<p class="step-note" id="regNote"></p>' +
      '<div id="regStep1">' +
      '<p class="step-note" id="regStep1Note"></p>' +
      '<input id="rgEmail" type="email" autocomplete="email">' +
      '<p class="field-err" id="rgEmailErr"></p>' +
      '<div class="row"><input id="rgCode" type="text"><button class="small-btn" id="rgSendCode" type="button"></button></div>' +
      '<p class="field-err" id="rgCodeErr"></p>' +
      '<div style="display:flex;gap:10px"><button type="button" class="btn-blue" id="rgVerify"></button>' +
      '<button type="button" class="small-btn" data-close></button></div>' +
      "</div>" +
      '<div id="regStep2" class="hidden">' +
      '<p class="step-note" id="regStep2Note"></p>' +
      '<input id="rgPwd" type="password" autocomplete="new-password">' +
      '<p class="field-err" id="rgPwdErr"></p>' +
      '<input id="rgPwd2" type="password" autocomplete="new-password">' +
      '<p class="field-err" id="rgPwd2Err"></p>' +
      '<div style="display:flex;gap:10px"><button type="button" class="btn-blue" id="rgComplete"></button>' +
      '<button type="button" class="small-btn" id="rgBack"></button></div>' +
      "</div>" +
      "</div>" +
      "</div>";
    document.body.appendChild(mask);
    mask.addEventListener("click", function (ev) { if (ev.target === mask) close(); });
    mask.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", close);
    });
    document.getElementById("tabLogin").addEventListener("click", function () { switchTab("login"); });
    document.getElementById("tabRegister").addEventListener("click", function () { switchTab("register"); });
    document.getElementById("googleBtn").addEventListener("click", function () {
      showAlert(t("google_soon"), false);
    });
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
    document.getElementById("rgVerify").addEventListener("click", function () {
      var email = document.getElementById("rgEmail").value.trim();
      var code = document.getElementById("rgCode").value.trim();
      clearErr("rgEmail", "rgEmailErr"); clearErr("rgCode", "rgCodeErr");
      if (!validEmail(email)) { fieldErr("rgEmail", "rgEmailErr", t("v_email")); return; }
      if (!code) { fieldErr("rgCode", "rgCodeErr", t("v_code")); return; }
      post("/auth/register/verify", { email: email, code: code }).then(function (r) {
        if (r.ok && r.data.ticket) {
          regState.email = email; regState.ticket = r.data.ticket;
          document.getElementById("regStep1").classList.add("hidden");
          document.getElementById("regStep2").classList.remove("hidden");
          hideAlert();
        } else {
          showAlert(serverMsg(r.data), false);
        }
      }).catch(function () { showAlert(t("generic_fail"), false); });
    });
    document.getElementById("rgBack").addEventListener("click", function () {
      document.getElementById("regStep2").classList.add("hidden");
      document.getElementById("regStep1").classList.remove("hidden");
    });
    document.getElementById("rgComplete").addEventListener("click", function () {
      var p1 = document.getElementById("rgPwd").value;
      var p2 = document.getElementById("rgPwd2").value;
      clearErr("rgPwd", "rgPwdErr"); clearErr("rgPwd2", "rgPwd2Err");
      if (!p1 || p1.length < 8 || p1.length > 72) { fieldErr("rgPwd", "rgPwdErr", t("v_pwd_len")); return; }
      if (p1 !== p2) { fieldErr("rgPwd2", "rgPwd2Err", t("v_pwd_match")); return; }
      post("/auth/register/complete", {
        ticket: regState.ticket, password: p1,
        deviceHash: deviceId(), deviceName: "Website", platform: "website"
      }).then(function (r) {
        if (r.ok && r.data.accessToken) {
          saveSession(r.data);
          finishAuth(t("reg_ok"));
        } else {
          showAlert(serverMsg(r.data), false);
        }
      }).catch(function () { showAlert(t("generic_fail"), false); });
    });
    applyTexts();
  }
  function applyTexts() {
    var set = function (id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };
    var ph = function (id, txt) { var el = document.getElementById(id); if (el) el.setAttribute("placeholder", txt); };
    set("tabLogin", t("tab_login")); set("tabRegister", t("tab_register"));
    set("googleBtnTxt", t("google_btn")); set("orDiv", t("or"));
    set("liSubmit", t("do_login")); set("liGetCode", t("get_code")); set("liDualHint", t("dual_hint"));
    set("regNote", t("reg_note")); set("regStep1Note", t("reg_step1_note")); set("regStep2Note", t("reg_step2_note"));
    set("rgSendCode", t("send_code")); set("rgVerify", t("verify_next"));
    set("rgComplete", t("complete_reg")); set("rgBack", t("back"));
    ph("liEmail", t("email_ph")); ph("liPassword", t("password_ph")); ph("liCode", t("code_ph"));
    ph("rgEmail", t("email_ph")); ph("rgCode", t("code_ph"));
    ph("rgPwd", t("pwd_set_ph")); ph("rgPwd2", t("pwd_confirm_ph"));
    document.querySelectorAll("#authModal [data-close]").forEach(function (b) {
      b.textContent = lang === "en" ? "Cancel" : "取消";
    });
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

  function doLogin() {
    var email = document.getElementById("liEmail").value.trim();
    var password = document.getElementById("liPassword").value;
    var code = document.getElementById("liCode").value.trim();
    clearErr("liEmail", "liEmailErr"); clearErr("liPassword", "liPwdErr");
    if (!validEmail(email)) { fieldErr("liEmail", "liEmailErr", t("v_email")); return; }
    if (!password) { fieldErr("liPassword", "liPwdErr", t("v_pwd_empty")); return; }
    var body = { email: email, password: password, deviceHash: deviceId() };
    if (code) body.emailCode = code;
    post("/auth/login", body).then(function (r) {
      if (r.ok && r.data.dualVerifyRequired) {
        document.getElementById("liDual").classList.remove("hidden");
        showAlert(r.data.message || t("dual_hint"), false);
      } else if (r.ok && r.data.accessToken) {
        saveSession(r.data);
        if (email) lsSet("qf_email", email);
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
