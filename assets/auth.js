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
      resend_in: "{n} 秒后重发",
      reg_ok: "注册成功，已为您自动登录。",
      login_ok: "登录成功。",
      generic_fail: "操作失败，请稍后重试。",
      login_fail: "登录失败，请核对邮箱或 ID 与密码后重试。",
      working: "正在处理，请稍候……",
      remember_device: "记住此设备",
      forgot_pwd: "忘记密码",
      id_note: "账户ID一经设置不可更改，请谨慎填写。",
      manual_hint: "邮箱无法接收验证码？请发送邮件至 a718983610@gmail.com 申请人工核验，并附上您的账户ID或绑定邮箱。",
      ban_perm: "该用户已被永久封禁",
      ban_appeal_guide: "如需申诉，请前往安全中心提交封禁申诉。",
      reset_recovery_link: "邮箱不可用？提交人工找回申诉",
      ban_timed: "该账户已被封禁，解除时间：{x}",
      email_bound: "该邮箱已被其他账户绑定。",
      complete_title: "设置账户ID与登录密码",
      complete_note: "您的邮箱已通过 Google 验证。请设置账户ID与登录密码以完成注册；设置完成后，可使用账户ID或邮箱加密码登录。",
      complete_email: "账号邮箱：",
      complete_submit: "完成设置并登录",
      complete_expired: "本次设置已失效，请重新使用 Google 登录。",
      stepup_title: "安全验证",
      stepup_submit: "验证并登录",
      stepup_resend: "重新发送验证码",
      stepup_code_ph: "请输入邮箱验证码",
      reset_title: "找回密码",
      reset_note: "请输入您的绑定邮箱，获取验证码后设置新密码。",
      reset_submit: "确认重置密码",
      reset_ok: "密码已重置，请使用新密码登录。",
      back_login: "返回登录",
      security_center: "安全中心"
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
      resend_in: "Resend in {n}s",
      reg_ok: "Registration completed. You are now signed in.",
      login_ok: "Signed in successfully.",
      generic_fail: "The operation failed. Please try again later.",
      login_fail: "Sign-in failed. Please check your email or ID and password and try again.",
      working: "Processing, please wait…",
      remember_device: "Remember this device",
      forgot_pwd: "Forgot password",
      id_note: "Your account ID cannot be changed once set. Please choose carefully.",
      manual_hint: "Cannot receive the verification code by email? Please email a718983610@gmail.com to request manual verification, and include your account ID or bound email address.",
      ban_perm: "This user has been permanently banned.",
      ban_appeal_guide: "To appeal, please visit the Security Center to submit a ban appeal.",
      reset_recovery_link: "Email unavailable? Submit a manual account recovery appeal",
      ban_timed: "This account has been banned. Ban lifts: {x}",
      email_bound: "This email address is already bound to another account.",
      complete_title: "Set Your Account ID and Password",
      complete_note: "Your email address has been verified by Google. Please set an account ID and password to complete registration; afterwards you can sign in with your account ID or email plus password.",
      complete_email: "Account email: ",
      complete_submit: "Complete Setup and Sign In",
      complete_expired: "This setup session has expired. Please sign in with Google again.",
      stepup_title: "Security Verification",
      stepup_submit: "Verify and Sign In",
      stepup_resend: "Resend Code",
      stepup_code_ph: "Enter the email verification code",
      reset_title: "Reset Password",
      reset_note: "Enter your bound email address, request a verification code, then set a new password.",
      reset_submit: "Reset Password",
      reset_ok: "Your password has been reset. Please sign in with the new password.",
      back_login: "Back to Sign In",
      security_center: "Security Center"
    }
  };

  var lang = "zh";
  try { lang = localStorage.getItem("qf_lang") || "zh"; } catch (e) {}
  function t(k) { return (STR[lang] || STR.zh)[k] || k; }

  // ---------- 存储 ----------
  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  // 会话键统一读写：记住此设备时存 localStorage，否则只存 sessionStorage（关标签即失效）。
  var SESSION_KEYS = ["qf_access_token", "qf_refresh_token", "qf_nickname", "qf_email"];
  function sessGet(k) { return lsGet(k) || ssGet(k); }
  function sessSet(k, v, remember) {
    if (remember) { lsSet(k, v); ssDel(k); } else { ssSet(k, v); lsDel(k); }
  }
  function sessDel(k) { lsDel(k); ssDel(k); }
  function rememberChoice() {
    var box = document.getElementById("liRemember");
    return box ? !!box.checked : true;
  }
  // A-09：设备标识＝持久随机数＋浏览器特征组合哈希，生成后存 localStorage，不再每次轮换；
  // 清数据/无痕仍会变化（官网端诚实边界），服务端另有校验与限频兜底。
  function featureHash() {
    var parts = [];
    try {
      parts.push(navigator.userAgent || "");
      parts.push(navigator.language || "");
      parts.push((navigator.languages || []).join(","));
      parts.push(navigator.platform || "");
      parts.push(String(navigator.hardwareConcurrency || ""));
      parts.push(String(navigator.deviceMemory || ""));
      parts.push(screen ? screen.width + "x" + screen.height + "x" + screen.colorDepth : "");
      parts.push(String(new Date().getTimezoneOffset()));
      parts.push(Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone || "" : "");
    } catch (e) {}
    var s = parts.join("|");
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }
  function randomHex(n) {
    try {
      var buf = new Uint8Array(n);
      crypto.getRandomValues(buf);
      return Array.prototype.map.call(buf, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    } catch (e) {
      var out = "";
      while (out.length < n * 2) out += Math.random().toString(16).slice(2);
      return out.slice(0, n * 2);
    }
  }
  function deviceId() {
    var id = lsGet("qf_web_id");
    if (!id) {
      id = "web-" + featureHash() + "-" + randomHex(16);
      lsSet("qf_web_id", id);
    }
    return id;
  }
  function token() { return sessGet("qf_access_token"); }
  function label() { return sessGet("qf_nickname") || sessGet("qf_email") || ""; }
  function saveSession(data, remember) {
    if (typeof remember !== "boolean") remember = rememberChoice();
    if (data.accessToken) sessSet("qf_access_token", data.accessToken, remember);
    if (data.refreshToken) sessSet("qf_refresh_token", data.refreshToken, remember);
    if (data.user && data.user.email) sessSet("qf_email", data.user.email, remember);
    if (data.email) sessSet("qf_email", data.email, remember);
  }
  function clearSession() {
    SESSION_KEYS.forEach(sessDel);
  }
  // 封禁定版文案（A-14）：本地拼装，bannedUntil 本地格式化，不直显服务端原文与 ISO 串。
  function fmtBanTime(v) {
    if (v == null || v === "") return "";
    var ms;
    if (typeof v === "number") ms = v < 1e12 ? v * 1000 : v;
    else { var p = Date.parse(v); ms = isNaN(p) ? Number(v) * (Number(v) < 1e12 ? 1000 : 1) : p; }
    if (isNaN(ms)) return String(v);
    return new Date(ms).toLocaleString(lang === "en" ? "en-US" : "zh-CN", { hour12: false });
  }
  function isBanData(data) {
    return !!(data && (data.code === "ACCOUNT_BANNED" || data.code === "DEVICE_BANNED"));
  }
  function banBase(data) {
    if (data && data.code === "DEVICE_BANNED") return serverMsg(data, "generic_fail");
    if (data && (data.permanent === true || data.bannedUntil == null)) return t("ban_perm");
    return t("ban_timed").replace("{x}", fmtBanTime(data && data.bannedUntil));
  }
  function banNotice(data) {
    var base = banBase(data);
    // 账号封禁提示末尾加申诉路标（纯文本场景）；可点击链接由 showFailAlert 渲染。
    if (data && data.code === "ACCOUNT_BANNED") return base + "\n" + t("ban_appeal_guide");
    return base;
  }
  function failNotice(data, fallbackKey) {
    if (isBanData(data)) return banNotice(data);
    if (data && (data.code === "EMAIL_TAKEN" || data.code === "EMAIL_BOUND")) return t("email_bound");
    return serverMsg(data, fallbackKey);
  }
  // 登录失败提示：账号封禁时渲染为「封禁文案＋一行可点击申诉指引」，
  // 未登录态即可直达安全中心封禁申诉区块（security.html#appeal）。
  function showFailAlert(data, fallbackKey) {
    if (data && data.code === "ACCOUNT_BANNED") {
      var box = document.getElementById("authAlert");
      if (box) {
        box.textContent = "";
        box.className = "alert show err";
        box.appendChild(document.createTextNode(banBase(data)));
        box.appendChild(document.createElement("br"));
        var a = document.createElement("a");
        a.href = "security.html#appeal";
        a.textContent = t("ban_appeal_guide");
        box.appendChild(a);
        return;
      }
    }
    showAlert(failNotice(data, fallbackKey), false);
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
    var rt = sessGet("qf_refresh_token");
    if (!rt) return Promise.resolve(false);
    var remember = !!lsGet("qf_refresh_token");
    return post("/auth/refresh", { refreshToken: rt }).then(function (r) {
      if (r.ok && r.data.accessToken) {
        sessSet("qf_access_token", r.data.accessToken, remember);
        if (r.data.refreshToken) sessSet("qf_refresh_token", r.data.refreshToken, remember);
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
  // 谷歌补设凭证与 step-up 凭证只存内存，绝不落盘（契约要求）。
  var completionState = { token: "", email: "" };
  var stepUpState = { token: "" };
  function onGoogleCredential(resp) {
    if (!resp || !resp.credential) { showAlert(t("google_fail"), false); return; }
    post("/auth/google", {
      idToken: resp.credential,
      deviceHash: deviceId(), deviceName: "Website", platform: "website"
    }).then(function (r) {
      if (r.ok && r.data.needsCompletion) {
        completionState.token = r.data.completionToken || "";
        completionState.email = r.data.email || "";
        showCompletePane(r.data.message || "");
      } else if (r.ok && (r.data.needsStepUp || r.data.stepUpRequired)) {
        beginStepUp(r.data);
      } else if (r.ok && r.data.accessToken) {
        saveSession(r.data);
        finishAuth(t("login_ok"));
      } else {
        showFailAlert(r.data, "google_fail");
      }
    }).catch(function () { showAlert(t("generic_fail"), false); });
  }
  function showCompletePane(msg) {
    switchPane("complete");
    var em = document.getElementById("gcEmail");
    if (em) em.textContent = t("complete_email") + (completionState.email || "");
    if (msg) showAlert(msg, true);
  }
  function doGoogleComplete() {
    var username = document.getElementById("gcId").value.trim();
    var p1 = document.getElementById("gcPwd").value;
    var p2 = document.getElementById("gcPwd2").value;
    clearErr("gcId", "gcIdErr"); clearErr("gcPwd", "gcPwdErr"); clearErr("gcPwd2", "gcPwd2Err");
    if (!validUsername(username)) { fieldErr("gcId", "gcIdErr", t("v_id")); return; }
    if (!p1 || p1.length < 8 || p1.length > 72) { fieldErr("gcPwd", "gcPwdErr", t("v_pwd_len")); return; }
    if (p1 !== p2) { fieldErr("gcPwd2", "gcPwd2Err", t("v_pwd_match")); return; }
    if (!completionState.token) { showAlert(t("complete_expired"), false); switchPane("login"); return; }
    var btn = document.getElementById("gcSubmit");
    btn.disabled = true;
    post("/auth/google/complete", {
      completionToken: completionState.token, username: username, password: p1,
      deviceHash: deviceId(), deviceName: "Website", platform: "website"
    }).then(function (r) {
      btn.disabled = false;
      if (r.ok && r.data.accessToken) {
        completionState.token = "";
        saveSession(r.data);
        finishAuth(t("reg_ok"));
      } else if (r.data && r.data.code === "USERNAME_TAKEN") {
        fieldErr("gcId", "gcIdErr", t("id_taken"));
      } else if (r.data && r.data.code === "GOOGLE_COMPLETION_INVALID") {
        completionState.token = "";
        switchPane("login");
        showAlert(t("complete_expired"), false);
      } else if (r.data && (r.data.code === "EMAIL_TAKEN" || r.data.code === "EMAIL_BOUND")) {
        showAlert(t("email_bound"), false);
      } else {
        showFailAlert(r.data);
      }
    }).catch(function () { btn.disabled = false; showAlert(t("generic_fail"), false); });
  }
  function beginStepUp(data) {
    stepUpState.token = data.stepUpToken || "";
    var box = document.getElementById("liStepUp");
    if (box) box.classList.remove("hidden");
    var hint = document.getElementById("liStepUpHint");
    if (hint) hint.textContent = (data.message || t("dual_hint")) + (data.maskedEmail ? "（" + data.maskedEmail + "）" : "");
    switchPane("login");
    showAlert(data.message || t("dual_hint"), false);
    var codeEl = document.getElementById("liStepUpCode");
    if (codeEl) codeEl.focus();
  }
  function doStepUpVerify() {
    var code = document.getElementById("liStepUpCode").value.trim();
    if (!code) { showAlert(t("v_code"), false); return; }
    if (!stepUpState.token) { showAlert(t("generic_fail"), false); return; }
    var btn = document.getElementById("liStepUpSubmit");
    btn.disabled = true;
    post("/auth/stepup/verify", {
      stepUpToken: stepUpState.token, code: code,
      deviceHash: deviceId(), deviceName: "Website", platform: "website"
    }).then(function (r) {
      btn.disabled = false;
      if (r.ok && r.data.accessToken) {
        stepUpState.token = "";
        saveSession(r.data);
        finishAuth(t("login_ok"));
      } else {
        showFailAlert(r.data);
      }
    }).catch(function () { btn.disabled = false; showAlert(t("generic_fail"), false); });
  }
  function doStepUpResend() {
    if (!stepUpState.token) return;
    var btn = document.getElementById("liStepUpResend");
    post("/auth/stepup/resend", { stepUpToken: stepUpState.token }).then(function (r) {
      showAlert(r.ok ? t("code_sent") : failNotice(r.data), r.ok);
      if (r.ok || r.status === 429) armCodeBtn(btn, 60);
    }).catch(function () { showAlert(t("generic_fail"), false); });
  }
  function doResetRequest() {
    var email = document.getElementById("rsEmail").value.trim();
    clearErr("rsEmail", "rsEmailErr");
    if (!validEmail(email)) { fieldErr("rsEmail", "rsEmailErr", t("v_email")); return; }
    post("/auth/password/reset/request-code", { email: email }).then(function (r) {
      showAlert(r.ok ? t("code_sent") : failNotice(r.data), r.ok);
      if (r.ok || r.status === 429) armCodeBtn(document.getElementById("rsSendCode"), 60);
    }).catch(function () { showAlert(t("generic_fail"), false); });
  }
  function doResetConfirm() {
    var email = document.getElementById("rsEmail").value.trim();
    var code = document.getElementById("rsCode").value.trim();
    var p1 = document.getElementById("rsPwd").value;
    var p2 = document.getElementById("rsPwd2").value;
    clearErr("rsEmail", "rsEmailErr"); clearErr("rsCode", "rsCodeErr"); clearErr("rsPwd", "rsPwdErr"); clearErr("rsPwd2", "rsPwd2Err");
    if (!validEmail(email)) { fieldErr("rsEmail", "rsEmailErr", t("v_email")); return; }
    if (!code) { fieldErr("rsCode", "rsCodeErr", t("v_code")); return; }
    if (!p1 || p1.length < 8 || p1.length > 72) { fieldErr("rsPwd", "rsPwdErr", t("v_pwd_len")); return; }
    if (p1 !== p2) { fieldErr("rsPwd2", "rsPwd2Err", t("v_pwd_match")); return; }
    var btn = document.getElementById("rsSubmit");
    btn.disabled = true;
    post("/auth/password/reset/confirm", { email: email, code: code, newPassword: p1 }).then(function (r) {
      btn.disabled = false;
      if (r.ok) {
        switchPane("login");
        showAlert(serverMsg(r.data) || t("reset_ok"), true);
      } else {
        showFailAlert(r.data);
      }
    }).catch(function () { btn.disabled = false; showAlert(t("generic_fail"), false); });
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
      '<p class="hint" id="liManualHint"></p>' +
      "</div>" +
      '<div id="liStepUp" class="hidden">' +
      '<p class="step-note" id="liStepUpTitle"></p>' +
      '<div class="row"><input id="liStepUpCode" type="text"><button class="small-btn" id="liStepUpResend" type="button"></button></div>' +
      '<p class="hint" id="liStepUpHint"></p>' +
      '<p class="hint" id="liStepUpManual"></p>' +
      '<button type="button" class="btn-blue" id="liStepUpSubmit" style="width:100%;margin-bottom:10px"></button>' +
      "</div>" +
      '<label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:12px;cursor:pointer"><input id="liRemember" type="checkbox" checked style="width:auto;margin:0"><span id="liRememberTxt"></span></label>' +
      '<div style="display:flex;gap:10px;align-items:center"><button type="button" class="btn-blue" id="liSubmit"></button>' +
      '<button type="button" class="small-btn" data-close></button>' +
      '<button type="button" class="small-btn" id="liForgot" style="margin-left:auto"></button></div>' +
      "</div>" +
      // 谷歌补设（账户ID → 密码 → 重复密码，无邮箱/验证码栏）
      '<div id="paneComplete" class="hidden">' +
      '<h3 id="gcTitle" style="font-size:18px;margin-bottom:10px"></h3>' +
      '<p class="step-note" id="gcNote"></p>' +
      '<p class="step-note" id="gcEmail"></p>' +
      '<input id="gcId" type="text" autocomplete="username">' +
      '<p class="hint" id="gcIdNote"></p>' +
      '<p class="field-err" id="gcIdErr"></p>' +
      '<input id="gcPwd" type="password" autocomplete="new-password">' +
      '<p class="field-err" id="gcPwdErr"></p>' +
      '<input id="gcPwd2" type="password" autocomplete="new-password">' +
      '<p class="field-err" id="gcPwd2Err"></p>' +
      '<div style="display:flex;gap:10px"><button type="button" class="btn-blue" id="gcSubmit"></button>' +
      '<button type="button" class="small-btn" data-close></button></div>' +
      "</div>" +
      // 忘记密码（邮箱 → 验证码 → 新密码）
      '<div id="paneReset" class="hidden">' +
      '<h3 id="rsTitle" style="font-size:18px;margin-bottom:10px"></h3>' +
      '<p class="step-note" id="rsNote"></p>' +
      '<input id="rsEmail" type="email" autocomplete="email">' +
      '<p class="field-err" id="rsEmailErr"></p>' +
      '<div class="row"><input id="rsCode" type="text"><button class="small-btn" id="rsSendCode" type="button"></button></div>' +
      '<p class="field-err" id="rsCodeErr"></p>' +
      '<input id="rsPwd" type="password" autocomplete="new-password">' +
      '<p class="field-err" id="rsPwdErr"></p>' +
      '<input id="rsPwd2" type="password" autocomplete="new-password">' +
      '<p class="field-err" id="rsPwd2Err"></p>' +
      '<div style="display:flex;gap:10px"><button type="button" class="btn-blue" id="rsSubmit"></button>' +
      '<button type="button" class="small-btn" id="rsBack"></button></div>' +
      '<p class="hint" style="margin-top:12px"><a id="rsRecoveryLink" href="security.html#recovery"></a></p>' +
      "</div>" +
      // 注册（一步式五栏：ID、邮箱、密码、重复密码、验证码同屏，一次提交完成）
      '<div id="paneRegister" class="hidden">' +
      '<p class="step-note" id="regNote"></p>' +
      '<p class="step-note" id="regFormNote"></p>' +
      '<input id="rgId" type="text" autocomplete="username">' +
      '<p class="hint" id="rgIdNote"></p>' +
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
      // A-20：放行账户 ID 输入——服务端按 identifier 查绑定邮箱发码，此处不再用 validEmail 硬拦。
      var identifier = document.getElementById("liEmail").value.trim();
      clearErr("liEmail", "liEmailErr");
      if (!identifier) { fieldErr("liEmail", "liEmailErr", t("v_identifier")); return; }
      post("/auth/login/request-code", { email: identifier, identifier: identifier }).then(function (r) {
        showAlert(r.ok ? t("code_sent") : failNotice(r.data), r.ok);
        if (r.ok || r.status === 429) armCodeBtn(document.getElementById("liGetCode"), 60);
      }).catch(function () { showAlert(t("generic_fail"), false); });
    });
    document.getElementById("liStepUpSubmit").addEventListener("click", doStepUpVerify);
    document.getElementById("liStepUpResend").addEventListener("click", doStepUpResend);
    document.getElementById("gcSubmit").addEventListener("click", doGoogleComplete);
    document.getElementById("liForgot").addEventListener("click", function () { switchPane("reset"); });
    document.getElementById("rsBack").addEventListener("click", function () { switchPane("login"); });
    document.getElementById("rsSendCode").addEventListener("click", doResetRequest);
    document.getElementById("rsSubmit").addEventListener("click", doResetConfirm);
    document.getElementById("rgSendCode").addEventListener("click", function () {
      var email = document.getElementById("rgEmail").value.trim();
      clearErr("rgEmail", "rgEmailErr");
      if (!validEmail(email)) { fieldErr("rgEmail", "rgEmailErr", t("v_email")); return; }
      post("/auth/register/request-code", { email: email }).then(function (r) {
        if (r.ok) { regState.email = email; showAlert(t("code_sent"), true); armCodeBtn(document.getElementById("rgSendCode"), 60); }
        else { showAlert(serverMsg(r.data), false); if (r.status === 429) armCodeBtn(document.getElementById("rgSendCode"), 60); }
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
    set("liManualHint", t("manual_hint")); set("liStepUpManual", t("manual_hint"));
    set("liRememberTxt", t("remember_device")); set("liForgot", t("forgot_pwd"));
    set("liStepUpTitle", t("stepup_title")); set("liStepUpSubmit", t("stepup_submit")); set("liStepUpResend", t("stepup_resend"));
    set("gcTitle", t("complete_title")); set("gcNote", t("complete_note")); set("gcIdNote", t("id_note")); set("gcSubmit", t("complete_submit"));
    set("rsTitle", t("reset_title")); set("rsNote", t("reset_note")); set("rsSendCode", t("send_code")); set("rsSubmit", t("reset_submit")); set("rsBack", t("back_login"));
    set("rsRecoveryLink", t("reset_recovery_link"));
    set("regNote", t("reg_note")); set("regFormNote", t("reg_form_note"));
    set("rgIdNote", t("id_note"));
    set("rgSendCode", t("send_code"));
    set("rgComplete", t("complete_reg"));
    ph("liEmail", t("login_id_ph")); ph("liPassword", t("password_ph")); ph("liCode", t("code_ph"));
    ph("liStepUpCode", t("stepup_code_ph"));
    ph("gcId", t("id_ph")); ph("gcPwd", t("pwd_set_ph")); ph("gcPwd2", t("pwd_confirm_ph"));
    ph("rsEmail", t("email_ph")); ph("rsCode", t("code_ph")); ph("rsPwd", t("pwd_set_ph")); ph("rsPwd2", t("pwd_confirm_ph"));
    ph("rgId", t("id_ph"));
    ph("rgEmail", t("email_ph")); ph("rgCode", t("code_ph"));
    ph("rgPwd", t("pwd_set_ph")); ph("rgPwd2", t("pwd_confirm_ph"));
    document.querySelectorAll("#authModal [data-close]").forEach(function (b) {
      b.textContent = lang === "en" ? "Cancel" : "取消";
    });
    renderGoogleButton();
  }
  function switchPane(which) {
    document.getElementById("tabLogin").classList.toggle("active", which === "login");
    document.getElementById("tabRegister").classList.toggle("active", which === "register");
    document.getElementById("paneLogin").classList.toggle("hidden", which !== "login");
    document.getElementById("paneRegister").classList.toggle("hidden", which !== "register");
    var pc = document.getElementById("paneComplete");
    if (pc) pc.classList.toggle("hidden", which !== "complete");
    var pr = document.getElementById("paneReset");
    if (pr) pr.classList.toggle("hidden", which !== "reset");
    hideAlert();
  }
  function switchTab(which) { switchPane(which); }
  function showAlert(msg, ok) {
    var box = document.getElementById("authAlert");
    if (!box) return;
    box.textContent = msg;
    box.className = "alert show " + (ok ? "ok" : "err");
  }
  function hideAlert() { var box = document.getElementById("authAlert"); if (box) box.className = "alert"; }
  // 发码成功（或被服务端冷却拦下）后给按钮挂倒计时：与服务端 60 秒发码冷却一致，
  // 期间禁用并显示剩余秒数，避免连点必吃 429 且用户无预期。
  function armCodeBtn(btn, seconds) {
    if (!btn || btn.getAttribute("data-cooling") === "1") return;
    var left = seconds || 60;
    if (!btn.getAttribute("data-label")) btn.setAttribute("data-label", btn.textContent);
    btn.setAttribute("data-cooling", "1");
    btn.disabled = true;
    btn.textContent = t("resend_in").replace("{n}", left);
    var timer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        btn.removeAttribute("data-cooling");
        btn.disabled = false;
        btn.textContent = btn.getAttribute("data-label");
        return;
      }
      btn.textContent = t("resend_in").replace("{n}", left);
    }, 1000);
  }
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
        if (r.data && (r.data.code === "EMAIL_TAKEN" || r.data.code === "EMAIL_BOUND")) {
          fieldErr("rgEmail", "rgEmailErr", t("email_bound"));
          done();
          return;
        }
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
    var body = { identifier: identifier, password: password, deviceHash: deviceId(), deviceName: "Website", platform: "website" };
    if (validEmail(identifier)) body.email = identifier;
    if (code) body.emailCode = code;
    post("/auth/login", body).then(function (r) {
      if (r.ok && (r.data.needsStepUp || r.data.stepUpRequired)) {
        beginStepUp(r.data);
      } else if (r.ok && r.data.dualVerifyRequired) {
        document.getElementById("liDual").classList.remove("hidden");
        showAlert(r.data.message || t("dual_hint"), false);
      } else if (r.ok && r.data.accessToken) {
        saveSession(r.data);
        if (validEmail(identifier)) sessSet("qf_email", identifier, rememberChoice());
        finishAuth(t("login_ok"));
      } else {
        showFailAlert(r.data, "login_fail");
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
        '<a class="small-btn" href="security.html" style="text-decoration:none;display:inline-block">' + t("security_center") + "</a>" +
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
    setNickname: function (n) { sessSet("qf_nickname", n || "", !!lsGet("qf_access_token")); renderNav(); },
    renderNav: renderNav, setLang: setLang
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderNav);
  } else {
    renderNav();
  }
})();
