// QFClash 官网安全中心（B-37 最小可用版）：改密 / 换绑邮箱 / 设备列表与下线 /
// 通行密钥管理 / 注销（带密码或通行密钥再认证复核）/ 封禁直达申诉。
// 全部共用既有服务端端点（/security/*、/passkeys/*、/appeals），登录态由 auth.js 管理。
(function () {
  var I18N = {
    zh: {
      nav_about: "产品介绍", nav_download: "下载", nav_points: "积分规则", nav_forum: "论坛",
      nav_agreement: "用户协议", nav_privacy: "隐私说明", nav_home: "首页",
      sec_title: "安全中心",
      sec_sub: "在此管理您的账号安全：修改密码、更换绑定邮箱、查看并下线登录设备、管理通行密钥，以及申请注销账号。",
      need_login: "请先登录后再使用安全中心。",
      acct_title: "账号概览", cancel_delete: "撤销注销",
      pwd_title: "修改密码", verify_way: "身份验证（任选其一）",
      cur_pwd_ph: "当前密码", code_ph: "邮箱验证码", send_code: "发送验证码",
      use_passkey: "使用通行密钥验证", reauth_ok: "通行密钥验证已完成。",
      new_pwd: "新密码", new_pwd_ph: "请设置新密码（8 至 72 位）", new_pwd2_ph: "请再次输入新密码",
      pwd_submit: "确认修改密码",
      email_title: "更换绑定邮箱", new_email: "新邮箱", new_email_ph: "请输入新邮箱地址",
      old_code_ph: "当前邮箱验证码", new_code_ph: "新邮箱验证码",
      send_old_code: "向当前邮箱发送", send_new_code: "向新邮箱发送",
      email_submit: "确认更换邮箱", email_bound: "该邮箱已被其他账户绑定。",
      protect_title: "环境异常双重验证",
      protect_hint: "开启后，在新设备或异常登录环境下登录时，需完成邮箱验证码校验后方可登录。登录国家与以往明显不同（登录国家突变）同样属于触发情形，出国旅行时触发此验证属于正常现象。已经通过验证的设备不会因同一环境因素被反复拦截。关闭此开关后，强制安全复核仍然有效：在刷新令牌被重用、短时间多次登录失败等高风险情形下，系统仍会要求重新验证身份，该复核不可关闭。",
      email_ph: "邮箱地址",
      username_setup: "补设账户 ID",
      username_ph: "账户 ID（至少 8 位，字母与数字，且必须包含字母）",
      username_note: "账户ID一经设置不可更改，请谨慎填写。",
      username_submit: "确认设置",
      username_invalid: "账户 ID 至少 8 位，只能包含英文字母与数字，且必须包含字母。",
      username_taken: "该账户ID已被注册。",
      username_ok: "账户ID已设置成功。",
      rec_title: "找回申诉（邮箱不可用时）",
      rec_hint: "如您的绑定邮箱已无法使用、无法接收验证码，可在此提交人工找回申诉。提交后请妥善保存申诉编号，可凭申诉编号与账户标识查询处理状态。",
      rec_account: "账户 ID 或邮箱",
      rec_email: "绑定邮箱（用于核对身份）",
      rec_devices_hint: "填写账户标识与绑定邮箱并核对一致后，可查看该账户的登录设备，辅助您填写曾用机型与常用登录地点。",
      rec_devices_btn: "查看我的登录设备",
      rec_devices_empty: "该账户暂无设备记录。",
      rec_oldpw: "曾经设置过的密码（最多 3 个）",
      rec_oldpw_ph: "曾经设置过的密码",
      rec_models: "曾用设备机型（每行一个，最多 5 个）",
      rec_models_ph: "例如：小米 14 / iPhone 15",
      rec_locations: "常用登录地点（每行一个，最多 5 个）",
      rec_locations_ph: "例如：中国 广东 深圳",
      rec_friend: "好友验证（可选）",
      rec_friend_skip: "不选择（跳过好友验证）",
      rec_friend_none: "未选择好友验证时，申诉将直接提交审核，好友验证环节自动跳过。",
      rec_friend_has: "可选择一位好友协助验证：选定后，该好友将在与您的聊天界面收到验证请求；不选择也可直接提交，申诉照常进入审核。",
      rec_friend_unavail: "当前无法读取您的好友名单，本次申诉将跳过好友验证环节，照常提交审核。",
      rec_friend_load: "加载好友候选",
      rec_friend_need_both: "请先填写账户标识与绑定邮箱，核对一致后方可加载好友候选。",
      rec_friend_loading: "正在加载好友候选，请稍候。",
      rec_friend_empty: "该账户暂无可选择的好友，本次申诉将跳过好友验证环节，照常提交审核。",
      rec_note: "补充说明（可选）",
      rec_submit: "提交找回申诉",
      rec_ok: "申诉已提交，申诉编号：{id}。请妥善保存编号，以便查询处理状态。",
      rec_fill_account: "请填写账户 ID 或邮箱。",
      rec_status_title: "查询申诉状态",
      rec_status_id: "申诉编号",
      rec_status_btn: "查询状态",
      rec_status_fill: "请填写申诉编号与账户 ID 或邮箱。",
      rec_status_pending: "审核中", rec_status_approved: "已批准",
      rec_status_rejected: "未通过", rec_status_superseded: "已被更新的申诉替代",
      rec_status_line: "申诉状态：{s}",
      rec_reject_reason: "未通过原因：{x}",
      rec_friend_done: "好友验证：已完成。", rec_friend_todo: "好友验证：待完成。",
      rec_grant_issued: "重置凭证此前已签发且仍在有效期内；如已遗失，请待其过期后重新查询以获取新凭证。",
      rec_grant_used: "该申诉的密码重置凭证已使用。",
      rec_reset_submit: "凭批准凭证设置新密码",
      protect_on: "开启环境异常双重验证",
      devices_title: "登录设备", dev_logout: "下线", dev_current: "当前设备", dev_online: "在线", dev_offline: "离线",
      dev_empty: "暂无设备记录。",
      passkey_title: "通行密钥", pk_name: "新通行密钥名称", pk_name_ph: "例如：我的手机",
      pk_create: "创建通行密钥", pk_delete: "删除", pk_empty: "尚未创建通行密钥。",
      pk_unsupported: "当前浏览器不支持通行密钥。",
      pk_domain_note: "通行密钥将在正式域名上线后可用。",
      pk_err_mismatch: "当前访问地址与通行密钥不匹配，无法使用通行密钥。请通过正式网址访问后再试。",
      pk_err_timeout: "通行密钥操作超时，请重试。",
      pk_err_incomplete: "通行密钥操作未完成（可能已取消或超时），请重试；也可以改用密码或邮箱验证码。",
      pk_err_aborted: "通行密钥操作已取消。",
      pk_err_exists: "此设备已创建过通行密钥，无需重复创建。",
      pk_err_constraint: "当前设备不满足创建通行密钥的条件。",
      pk_err_unsupported_op: "当前浏览器或设备不支持通行密钥。",
      delete_title: "注销账号",
      delete_warn: "注销申请提交后有 7 天冷静期，冷静期内登录即可撤销；冷静期届满后，服务器账号数据将被删除且不可恢复。注销后账号积分将清零，未使用的兑换码将作废。提交注销前须完成身份复核。",
      delete_confirm: "我已了解上述后果，确认申请注销账号。",
      delete_submit: "提交注销申请",
      appeal_title: "封禁申诉",
      appeal_hint: "如您的账号被封禁，可在此提交申诉。提交前请填写账户 ID 或绑定邮箱与登录密码以核验身份。",
      appeal_id: "账户 ID 或邮箱", appeal_pwd: "登录密码", appeal_content: "申诉内容",
      appeal_quota: "查询剩余申诉次数", appeal_submit: "提交申诉", appeal_ok: "申诉已提交，我们将人工复核并答复。",
      ban_perm: "该用户已被永久封禁",
      ban_timed: "该账户已被封禁，解除时间：{x}",
      generic_fail: "操作失败，请稍后重试。",
      code_sent: "验证码已发送至您的邮箱，请查收。",
      fill_all: "请完整填写所需信息。",
      pwd_match: "两次输入的密码不一致，请重新核对。",
      pwd_len: "密码长度需为 8 至 72 位，请重新输入。",
      verify_first: "请先完成身份验证：输入当前密码、使用通行密钥，或输入邮箱验证码。",
      deleting_now: "账号正处于注销冷静期，生效时间：{x}。冷静期内可撤销注销。",
      quota_left: "剩余申诉次数：{n} 次。",
      footer_lic: "QFClash 基于开源项目 FlClash 与 mihomo 内核开发，源代码以 GNU 通用公共许可证第三版（GPL-3.0）发布。FlClash、mihomo 等开源组件的权利归各自作者所有，并适用其随附许可证。"
    },
    en: {
      nav_about: "About", nav_download: "Download", nav_points: "Points Rules", nav_forum: "Forum",
      nav_agreement: "User Agreement", nav_privacy: "Privacy Notice", nav_home: "Home",
      sec_title: "Security Center",
      sec_sub: "Manage your account security here: change your password, change your bound email, review and sign out devices, manage passkeys, and request account deletion.",
      need_login: "Please sign in before using the Security Center.",
      acct_title: "Account Overview", cancel_delete: "Cancel Deletion",
      pwd_title: "Change Password", verify_way: "Verify your identity (choose one)",
      cur_pwd_ph: "Current password", code_ph: "Email verification code", send_code: "Send Code",
      use_passkey: "Verify with a Passkey", reauth_ok: "Passkey verification completed.",
      new_pwd: "New Password", new_pwd_ph: "Set a new password (8 to 72 characters)", new_pwd2_ph: "Re-enter the new password",
      pwd_submit: "Change Password",
      email_title: "Change Bound Email", new_email: "New Email", new_email_ph: "Enter the new email address",
      old_code_ph: "Code sent to current email", new_code_ph: "Code sent to new email",
      send_old_code: "Send to Current Email", send_new_code: "Send to New Email",
      email_submit: "Confirm Email Change", email_bound: "This email address is already bound to another account.",
      protect_title: "Unusual-Environment Verification",
      protect_hint: "When enabled, signing in on a new device or in an unusual environment requires an email verification code. A sudden change in sign-in country compared with your usual sign-in countries (an abrupt country change) is also a trigger, and being asked to verify while travelling abroad is normal. Devices that have already passed verification will not be repeatedly challenged for the same environmental factor. Turning this switch off does not disable mandatory security review: in high-risk situations such as refresh-token reuse or repeated sign-in failures within a short period, the system will still require identity re-verification, and that review cannot be turned off.",
      email_ph: "Email address",
      username_setup: "Set Account ID",
      username_ph: "Account ID (min. 8 characters, letters and numbers, must include a letter)",
      username_note: "Your account ID cannot be changed once set. Please choose carefully.",
      username_submit: "Confirm",
      username_invalid: "The account ID must be at least 8 characters, contain only letters and numbers, and include at least one letter.",
      username_taken: "This account ID has already been registered.",
      username_ok: "Your account ID has been set.",
      rec_title: "Account Recovery Appeal (When Email Is Unavailable)",
      rec_hint: "If your bound email address is no longer accessible and cannot receive verification codes, you may submit a manual account recovery appeal here. Please keep your appeal number safe; you can check the processing status with the appeal number and your account identifier.",
      rec_account: "Account ID or Email",
      rec_email: "Bound Email (used to verify your identity)",
      rec_devices_hint: "After entering your account identifier and bound email and passing the match check, you can view the account's signed-in devices to help you fill in device models and usual sign-in locations.",
      rec_devices_btn: "View My Signed-In Devices",
      rec_devices_empty: "No device records for this account.",
      rec_oldpw: "Passwords You Previously Set (up to 3)",
      rec_oldpw_ph: "A password you used before",
      rec_models: "Device Models You Have Used (one per line, up to 5)",
      rec_models_ph: "e.g. Xiaomi 14 / iPhone 15",
      rec_locations: "Places You Usually Sign In From (one per line, up to 5)",
      rec_locations_ph: "e.g. Shenzhen, Guangdong, China",
      rec_friend: "Friend Verification (Optional)",
      rec_friend_skip: "Do not select (skip friend verification)",
      rec_friend_none: "If no friend is selected, the appeal is submitted for review directly and the friend-verification step is skipped.",
      rec_friend_has: "You may select one friend to assist with verification: once selected, that friend will receive a verification request in their chat with you. You may also submit without selecting anyone; the appeal will proceed to review as normal.",
      rec_friend_unavail: "Your friend list cannot be loaded right now. This appeal will skip the friend-verification step and be submitted for review as normal.",
      rec_friend_load: "Load Friend Options",
      rec_friend_need_both: "Please enter your account identifier and bound email address first. Friend options can be loaded once the two match the same account.",
      rec_friend_loading: "Loading friend options, please wait.",
      rec_friend_empty: "This account has no friends available to select. This appeal will skip the friend-verification step and be submitted for review as normal.",
      rec_note: "Additional Notes (Optional)",
      rec_submit: "Submit Recovery Appeal",
      rec_ok: "Your appeal has been submitted. Appeal number: {id}. Please keep this number safe so you can check the processing status.",
      rec_fill_account: "Please enter your account ID or email address.",
      rec_status_title: "Check Appeal Status",
      rec_status_id: "Appeal Number",
      rec_status_btn: "Check Status",
      rec_status_fill: "Please enter the appeal number and your account ID or email address.",
      rec_status_pending: "Under review", rec_status_approved: "Approved",
      rec_status_rejected: "Not approved", rec_status_superseded: "Superseded by a newer appeal",
      rec_status_line: "Appeal status: {s}",
      rec_reject_reason: "Reason: {x}",
      rec_friend_done: "Friend verification: completed.", rec_friend_todo: "Friend verification: pending.",
      rec_grant_issued: "A reset grant was issued earlier and is still valid. If you have lost it, please wait until it expires and check the status again to obtain a new one.",
      rec_grant_used: "The password reset grant for this appeal has already been used.",
      rec_reset_submit: "Set a New Password with the Approval Grant",
      protect_on: "Enable unusual-environment verification",
      devices_title: "Signed-In Devices", dev_logout: "Sign Out", dev_current: "Current device", dev_online: "Online", dev_offline: "Offline",
      dev_empty: "No device records yet.",
      passkey_title: "Passkeys", pk_name: "Name for the new passkey", pk_name_ph: "e.g. My phone",
      pk_create: "Create Passkey", pk_delete: "Delete", pk_empty: "No passkeys yet.",
      pk_unsupported: "This browser does not support passkeys.",
      pk_domain_note: "Passkeys will become available after the official domain launches.",
      pk_err_mismatch: "The current address does not match this passkey, so it cannot be used. Please visit through the official address and try again.",
      pk_err_timeout: "The passkey operation timed out. Please try again.",
      pk_err_incomplete: "The passkey operation was not completed (it may have been cancelled or timed out). Please try again, or use your password or an email code instead.",
      pk_err_aborted: "The passkey operation was cancelled.",
      pk_err_exists: "A passkey has already been created on this device.",
      pk_err_constraint: "This device does not meet the requirements for creating a passkey.",
      pk_err_unsupported_op: "This browser or device does not support passkeys.",
      delete_title: "Delete Account",
      delete_warn: "Deletion requests enter a 7-day cooling-off period, during which signing in cancels the request. After the period ends, your server-side account data will be deleted and cannot be recovered. Your points balance will be cleared and unused redemption codes will be voided. Identity re-verification is required before submitting.",
      delete_confirm: "I understand the consequences above and confirm the deletion request.",
      delete_submit: "Submit Deletion Request",
      appeal_title: "Ban Appeal",
      appeal_hint: "If your account has been banned, you may submit an appeal here. Enter your account ID or bound email and password to verify your identity first.",
      appeal_id: "Account ID or Email", appeal_pwd: "Password", appeal_content: "Appeal Details",
      appeal_quota: "Check Remaining Appeals", appeal_submit: "Submit Appeal", appeal_ok: "Your appeal has been submitted. We will review it manually and reply.",
      ban_perm: "This user has been permanently banned.",
      ban_timed: "This account has been banned. Ban lifts: {x}",
      generic_fail: "The operation failed. Please try again later.",
      code_sent: "A verification code has been sent to your email. Please check your inbox.",
      fill_all: "Please complete all required fields.",
      pwd_match: "The two passwords do not match. Please check and try again.",
      pwd_len: "The password must be 8 to 72 characters. Please try again.",
      verify_first: "Please verify your identity first: enter your current password, use a passkey, or enter an email verification code.",
      deleting_now: "This account is in the deletion cooling-off period, effective at: {x}. You may cancel the deletion during this period.",
      quota_left: "Remaining appeals: {n}.",
      footer_lic: "QFClash is developed from the open-source FlClash project and the mihomo core, and its source code is released under the GNU General Public License v3.0 (GPL-3.0). FlClash, mihomo, and other open-source components remain the property of their respective authors and are subject to their accompanying licenses."
    }
  };

  var lang = "zh";
  try { lang = localStorage.getItem("qf_lang") || "zh"; } catch (e) {}
  function t(k, vars) {
    var s = (I18N[lang] || I18N.zh)[k] || k;
    if (vars) Object.keys(vars).forEach(function (key) { s = s.replace("{" + key + "}", vars[key]); });
    return s;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtTime(v) {
    if (v == null || v === "") return "";
    var ms;
    if (typeof v === "number") ms = v < 1e12 ? v * 1000 : v;
    else { var p = Date.parse(v); ms = isNaN(p) ? Number(v) * (Number(v) < 1e12 ? 1000 : 1) : p; }
    if (isNaN(ms)) return String(v);
    return new Date(ms).toLocaleString(lang === "en" ? "en-US" : "zh-CN", { hour12: false });
  }
  function api(path, opts) { return QFAuth.api(path, opts || {}); }
  function serverMsg(data, fb) {
    if (data && data.code === "EMAIL_TAKEN") return t("email_bound");
    if (data && typeof data.message === "string" && data.message) return data.message;
    return fb || t("generic_fail");
  }
  function showAlert(id, msg, ok) {
    var box = document.getElementById(id);
    if (!box) return;
    box.textContent = msg;
    box.className = "alert show " + (ok ? "ok" : "err");
  }
  function val(id) { return document.getElementById(id).value.trim(); }

  // ---------- WebAuthn 基础编解码（与 @simplewebauthn 服务端 JSON 口径对接） ----------
  function b64uToBuf(s) {
    s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s), buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }
  function bufToB64u(buf) {
    var bytes = new Uint8Array(buf || new ArrayBuffer(0)), s = "";
    bytes.forEach(function (b) { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function prepCreation(opts) {
    opts.challenge = b64uToBuf(opts.challenge);
    if (opts.user && typeof opts.user.id === "string") opts.user.id = b64uToBuf(opts.user.id);
    (opts.excludeCredentials || []).forEach(function (c) { if (typeof c.id === "string") c.id = b64uToBuf(c.id); });
    return opts;
  }
  function prepRequest(opts) {
    opts.challenge = b64uToBuf(opts.challenge);
    (opts.allowCredentials || []).forEach(function (c) { if (typeof c.id === "string") c.id = b64uToBuf(c.id); });
    return opts;
  }
  function credToJson(cred, isCreate) {
    var r = cred.response, out = {
      id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
      response: { clientDataJSON: bufToB64u(r.clientDataJSON) },
      clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {}
    };
    if (isCreate) {
      out.response.attestationObject = bufToB64u(r.attestationObject);
      if (r.getTransports) { try { out.response.transports = r.getTransports(); } catch (e) {} }
    } else {
      out.response.authenticatorData = bufToB64u(r.authenticatorData);
      out.response.signature = bufToB64u(r.signature);
      if (r.userHandle) out.response.userHandle = bufToB64u(r.userHandle);
    }
    return out;
  }
  function hasWebAuthn() { return !!(window.PublicKeyCredential && navigator.credentials); }

  // 通行密钥域名闸：服务端 WebAuthn 的 RP ID 固定为正式域名 qfclash.eu.org，
  // 临时域名（如 github.io）下浏览器不许创建/使用通行密钥。此前在临时域名
  // 点「创建通行密钥」，浏览器英文原话（RP ID 不匹配）会被原样弹给用户。
  // 现：非正式域名时入口先置灰并给出中文说明（init 处）；万一仍走到调用
  // 层，doReauth / 创建流程先拦，waErrText 再把浏览器错误逐类翻成中文兜底。
  function pkDomainOk() { return /(^|\.)qfclash\.eu\.org$/i.test(location.hostname || ""); }
  function waErrText(e) {
    var name = (e && e.name) || "", msg = (e && e.message) || "";
    if (msg && /[一-鿿]/.test(msg)) return msg; // 服务端中文提示（自抛 Error）原样保留
    if (name === "SecurityError" || /RP ID|not authorized|origin/i.test(msg)) {
      return pkDomainOk() ? t("pk_err_mismatch") : t("pk_domain_note");
    }
    switch (name) {
      case "NotAllowedError": return t("pk_err_incomplete");
      case "AbortError": return t("pk_err_aborted");
      case "InvalidStateError": return t("pk_err_exists");
      case "ConstraintError": return t("pk_err_constraint");
      case "NotSupportedError": return t("pk_err_unsupported_op");
      case "TimeoutError": return t("pk_err_timeout");
    }
    if (/timed out|timeout/i.test(msg)) return t("pk_err_timeout");
    return t("generic_fail");
  }

  // 再认证：拿 reauthToken（用途见服务端 reauth 说明；delete_account 为注销复核用途）。
  var reauthTokens = { pwd: "", pk: "", del: "" };
  function doReauth(purpose, slot, stateEl) {
    var alertId = slot === "del" ? "delAlert" : slot === "pk" ? "pkAlert" : "pwdAlert";
    if (!pkDomainOk()) { showAlert(alertId, t("pk_domain_note"), false); return Promise.resolve(""); }
    if (!hasWebAuthn()) { showAlert(alertId, t("pk_unsupported"), false); return Promise.resolve(""); }
    return api("/passkeys/reauth/options", { method: "POST", auth: true, body: { purpose: purpose } }).then(function (r) {
      if (!r.ok) throw new Error(serverMsg(r.data));
      return navigator.credentials.get({ publicKey: prepRequest(r.data.options) });
    }).then(function (cred) {
      return api("/passkeys/reauth/verify", { method: "POST", auth: true, body: { purpose: purpose, response: credToJson(cred, false) } });
    }).then(function (r) {
      if (!r.ok || !r.data.reauthToken) throw new Error(serverMsg(r.data));
      reauthTokens[slot] = r.data.reauthToken;
      var el = document.getElementById(stateEl);
      if (el) el.textContent = t("reauth_ok");
      return r.data.reauthToken;
    }).catch(function (e) {
      showAlert(alertId, waErrText(e), false);
      return "";
    });
  }

  // ---------- 各区块 ----------
  function loadMe() {
    return api("/security/me", { auth: true }).then(function (r) {
      if (!r.ok) { var ai0 = document.getElementById("acctInfo"); if (ai0) ai0.textContent = t("generic_fail"); return; }
      var d = r.data;
      document.getElementById("acctInfo").textContent =
        (d.email || "") + (d.id ? " · ID " + d.id : "") + (d.points ? " · " + d.points.balance : "");
      if (d.status === "deleting" && d.deletionEffectiveAt) {
        var info = document.getElementById("deletingInfo");
        info.textContent = t("deleting_now", { x: fmtTime(d.deletionEffectiveAt) });
        info.classList.remove("hidden");
        document.getElementById("cancelDeleteBtn").classList.remove("hidden");
      }
      var sw = document.getElementById("loginProtection");
      if (sw && typeof d.loginProtection === "boolean") sw.checked = d.loginProtection;
    }).catch(function () { var ai = document.getElementById("acctInfo"); if (ai && !ai.textContent) ai.textContent = t("generic_fail"); });
  }
  // 存量号补设账户 ID：是否呈现以 GET /profile 回包的 username 为准
  // （/security/me 回包不含 username 字段，故判定走 /profile；提交走 PUT /profile，
  // 服务端只许未设时设置一次，USERNAME_TAKEN 回定版文案）。
  function loadUsername() {
    var wrap = document.getElementById("usernameSetup");
    if (!wrap) return;
    api("/profile", { auth: true }).then(function (r) {
      if (r.ok && r.data && !r.data.username) wrap.classList.remove("hidden");
      else wrap.classList.add("hidden");
    });
  }
  function loadDevices() {
    api("/security/devices", { auth: true }).then(function (r) {
      var host = document.getElementById("deviceList");
      if (!r.ok || !Array.isArray(r.data.devices)) { host.innerHTML = '<p class="hint">' + esc(t("generic_fail")) + "</p>"; return; }
      if (!r.data.devices.length) { host.innerHTML = '<p class="hint">' + esc(t("dev_empty")) + "</p>"; return; }
      host.innerHTML = r.data.devices.map(function (d) {
        var meta = [d.platform || "", d.region || "", fmtTime(d.lastActiveAt), d.online ? t("dev_online") : t("dev_offline"), d.isCurrent ? t("dev_current") : ""].filter(Boolean).join(" · ");
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line)">' +
          '<span style="flex:1"><strong>' + esc(d.name || "") + '</strong><br><span class="hint">' + esc(meta) + "</span></span>" +
          (d.isCurrent ? "" : '<button class="small-btn" data-dev-logout="' + esc(String(d.id)) + '">' + esc(t("dev_logout")) + "</button>") + "</div>";
      }).join("");
      host.querySelectorAll("[data-dev-logout]").forEach(function (b) {
        b.addEventListener("click", function () {
          api("/security/devices/" + encodeURIComponent(b.getAttribute("data-dev-logout")) + "/logout", { method: "POST", auth: true, body: {} }).then(function (r2) {
            showAlert("devAlert", serverMsg(r2.data), r2.ok);
            if (r2.ok) loadDevices();
          });
        });
      });
    });
  }
  function loadPasskeys() {
    api("/passkeys", { auth: true }).then(function (r) {
      var host = document.getElementById("passkeyList");
      if (!r.ok || !Array.isArray(r.data.passkeys)) { host.innerHTML = '<p class="hint">' + esc(t("generic_fail")) + "</p>"; return; }
      if (!r.data.passkeys.length) { host.innerHTML = '<p class="hint">' + esc(t("pk_empty")) + "</p>"; return; }
      host.innerHTML = r.data.passkeys.map(function (p) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line)">' +
          '<span style="flex:1"><strong>' + esc(p.name || "") + '</strong><br><span class="hint">' + esc(fmtTime(p.createdAt)) + "</span></span>" +
          '<button class="small-btn" data-pk-del="' + esc(String(p.id)) + '">' + esc(t("pk_delete")) + "</button></div>";
      }).join("");
      host.querySelectorAll("[data-pk-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          var body = {};
          if (reauthTokens.pk) body.reauthToken = reauthTokens.pk;
          else {
            var pw = val("pkPwd");
            if (!pw) { showAlert("pkAlert", t("verify_first"), false); return; }
            body.password = pw;
          }
          // DELETE 带 body 走 fetch 封装：api() 以 opts.body 序列化。
          api("/passkeys/" + encodeURIComponent(b.getAttribute("data-pk-del")), { method: "DELETE", auth: true, body: body }).then(function (r2) {
            showAlert("pkAlert", serverMsg(r2.data), r2.ok);
            if (r2.ok) { reauthTokens.pk = ""; loadPasskeys(); }
          });
        });
      });
    });
  }

  // 找回申诉好友选择：申诉为免登录通道，好友名单端点（GET /friends）需登录态。
  // 已登录且名单可读时填充下拉；未登录、无好友或读取失败时按下单契约降级——
  // 不下发 selectedFriendUserId，服务端跳过好友验证环节，申诉照常提交审核。
  // 好友下拉复位到降级态：只有"不选择"一项 + 正式说明（hintKey 指定说明文案）。
  function resetRecoveryFriends(hintKey) {
    var sel = document.getElementById("rcFriend");
    var hint = document.getElementById("rcFriendHint");
    if (!sel) return null;
    sel.innerHTML = "";
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = t("rec_friend_skip");
    sel.appendChild(opt0);
    if (hint) hint.textContent = t(hintKey || "rec_friend_none");
    return sel;
  }
  function loadRecoveryFriends() {
    var sel = document.getElementById("rcFriend");
    var hint = document.getElementById("rcFriendHint");
    if (!sel) return;
    resetRecoveryFriends("rec_friend_none");
    if (!(window.QFAuth && QFAuth.token())) return;
    api("/friends", { auth: true }).then(function (r) {
      var list = r.ok && r.data && Array.isArray(r.data.friends) ? r.data.friends : null;
      if (!list) { if (hint) hint.textContent = t("rec_friend_unavail"); return; }
      if (!list.length) return;
      list.forEach(function (f) {
        if (f.userId == null) return;
        var o = document.createElement("option");
        o.value = String(f.userId);
        o.textContent = f.nickname || String(f.userId);
        sel.appendChild(o);
      });
      if (hint) hint.textContent = t("rec_friend_has");
    }).catch(function () { if (hint) hint.textContent = t("rec_friend_unavail"); });
  }
  // 免登录找回通道的好友候选加载：用表单已填的账户标识 + 绑定邮箱调
  // POST /appeals/recovery/friends（双因子，账户标识与绑定邮箱同属一账户才返回名单）。
  // 成功填充下拉（显示 nickname（username）、value=userId）；身份不符
  // （RECOVERY_IDENTITY_MISMATCH）或任何失败/异常一律维持降级态——只有"不选择"
  // 一项 + 正式说明，不弹错误提示。已登录的 /friends 填充路径（loadRecoveryFriends）不变。
  function loadRecoveryFriendsByIdentity() {
    var sel = document.getElementById("rcFriend");
    var hint = document.getElementById("rcFriendHint");
    if (!sel) return;
    var account = val("rcAccount"), email = val("rcEmail");
    if (!account || !email) { resetRecoveryFriends("rec_friend_need_both"); return; }
    var btn = document.getElementById("rcLoadFriends");
    if (btn) btn.disabled = true;
    resetRecoveryFriends("rec_friend_loading");
    QFAuth.post("/appeals/recovery/friends", { account: account, email: email }).then(function (r) {
      if (btn) btn.disabled = false;
      var list = null;
      if (r.ok && r.data) {
        if (Array.isArray(r.data)) list = r.data;
        else if (Array.isArray(r.data.friends)) list = r.data.friends;
        else if (Array.isArray(r.data.candidates)) list = r.data.candidates;
      }
      if (!list) { resetRecoveryFriends("rec_friend_unavail"); return; }
      var target = resetRecoveryFriends("rec_friend_none");
      if (!target) return;
      if (!list.length) { if (hint) hint.textContent = t("rec_friend_empty"); return; }
      list.forEach(function (f) {
        if (!f || f.userId == null) return;
        var o = document.createElement("option");
        o.value = String(f.userId);
        o.textContent = f.nickname && f.username ? f.nickname + "（" + f.username + "）" : (f.nickname || f.username || String(f.userId));
        target.appendChild(o);
      });
      if (target.options.length > 1) { if (hint) hint.textContent = t("rec_friend_has"); }
      else if (hint) hint.textContent = t("rec_friend_empty");
    }).catch(function () {
      if (btn) btn.disabled = false;
      resetRecoveryFriends("rec_friend_unavail");
    });
  }
  function linesOf(id) {
    return val(id).split(/[\n,，]/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5);
  }
  var recoveryGrant = { appealId: 0, grant: "" };

  var wired = false;
  function init() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      if ((I18N[lang] || {})[k]) el.textContent = I18N[lang][k];
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-ph");
      if ((I18N[lang] || {})[k]) el.setAttribute("placeholder", I18N[lang][k]);
    });
    document.getElementById("langToggle").textContent = lang === "en" ? "中文" : "EN";
    if (window.QFAuth) QFAuth.setLang(lang);

    var logged = !!(window.QFAuth && QFAuth.token());
    document.getElementById("needLogin").classList.toggle("hidden", logged);
    document.getElementById("secMain").classList.toggle("hidden", !logged);
    // 非正式域名：通行密钥全部入口置灰，卡内给出中文说明（删除走密码，不受影响）。
    if (!pkDomainOk()) {
      ["pwdPasskey", "pkPasskey", "delPasskey", "pkCreate"].forEach(function (id) {
        var b = document.getElementById(id);
        if (b) b.disabled = true;
      });
      var pkNote = document.getElementById("pkDomainNote");
      if (pkNote) { pkNote.textContent = t("pk_domain_note"); pkNote.classList.remove("hidden"); }
    }
    if (logged) { loadMe(); loadUsername(); loadDevices(); loadPasskeys(); }
    loadRecoveryFriends();

    if (wired) return;
    wired = true;
    document.getElementById("langToggle").addEventListener("click", function () {
      lang = lang === "en" ? "zh" : "en";
      try { localStorage.setItem("qf_lang", lang); } catch (e) {}
      window.dispatchEvent(new CustomEvent("qf-lang-change", { detail: { lang: lang } }));
      init();
      if (window.QFAuth && QFAuth.token()) { loadDevices(); loadPasskeys(); }
    });
    window.addEventListener("qf-auth-change", function () { init(); });

    document.getElementById("pwdSendCode").addEventListener("click", function () {
      api("/security/password/code", { method: "POST", auth: true, body: {} }).then(function (r) {
        showAlert("pwdAlert", r.ok ? t("code_sent") : serverMsg(r.data), r.ok);
      });
    });
    document.getElementById("pwdPasskey").addEventListener("click", function () { doReauth("change_password", "pwd", "pwdReauthState"); });
    document.getElementById("pkPasskey").addEventListener("click", function () { doReauth("passkey_manage", "pk", "pkReauthState"); });
    document.getElementById("delPasskey").addEventListener("click", function () { doReauth("delete_account", "del", "delReauthState"); });

    document.getElementById("pwdSubmit").addEventListener("click", function () {
      var np = document.getElementById("newPwd").value, np2 = document.getElementById("newPwd2").value;
      if (np.length < 8 || np.length > 72) { showAlert("pwdAlert", t("pwd_len"), false); return; }
      if (np !== np2) { showAlert("pwdAlert", t("pwd_match"), false); return; }
      var body = { newPassword: np };
      if (reauthTokens.pwd) body.reauthToken = reauthTokens.pwd;
      else if (val("curPwd")) body.currentPassword = document.getElementById("curPwd").value;
      else if (val("pwdCode")) body.emailCode = val("pwdCode");
      else { showAlert("pwdAlert", t("verify_first"), false); return; }
      api("/security/password/change", { method: "POST", auth: true, body: body }).then(function (r) {
        showAlert("pwdAlert", serverMsg(r.data), r.ok);
        if (r.ok) reauthTokens.pwd = "";
      });
    });

    document.getElementById("oldCodeBtn").addEventListener("click", function () {
      api("/security/email/request-old-code", { method: "POST", auth: true, body: {} }).then(function (r) {
        showAlert("emailAlert", r.ok ? t("code_sent") : serverMsg(r.data), r.ok);
      });
    });
    document.getElementById("newCodeBtn").addEventListener("click", function () {
      var ne = val("newEmail");
      if (!ne) { showAlert("emailAlert", t("fill_all"), false); return; }
      api("/security/email/request-new-code", { method: "POST", auth: true, body: { newEmail: ne } }).then(function (r) {
        showAlert("emailAlert", r.ok ? t("code_sent") : serverMsg(r.data), r.ok);
      });
    });
    document.getElementById("emailSubmit").addEventListener("click", function () {
      var ne = val("newEmail"), oc = val("oldCode"), nc = val("newCode");
      if (!ne || !oc || !nc) { showAlert("emailAlert", t("fill_all"), false); return; }
      api("/security/email/confirm", { method: "POST", auth: true, body: { newEmail: ne, oldCode: oc, newCode: nc } }).then(function (r) {
        showAlert("emailAlert", serverMsg(r.data), r.ok);
        if (r.ok) loadMe();
      });
    });

    document.getElementById("loginProtection").addEventListener("change", function (ev) {
      api("/security/settings", { method: "PUT", auth: true, body: { loginProtection: !!ev.target.checked } }).then(function (r) {
        showAlert("secAlert", serverMsg(r.data), r.ok);
        if (!r.ok) ev.target.checked = !ev.target.checked;
      });
    });

    document.getElementById("pkCreate").addEventListener("click", function () {
      if (!pkDomainOk()) { showAlert("pkAlert", t("pk_domain_note"), false); return; }
      if (!hasWebAuthn()) { showAlert("pkAlert", t("pk_unsupported"), false); return; }
      var body = {};
      if (reauthTokens.pk) body.reauthToken = reauthTokens.pk;
      else if (val("pkPwd")) body.password = document.getElementById("pkPwd").value;
      else { showAlert("pkAlert", t("verify_first"), false); return; }
      api("/passkeys/register/options", { method: "POST", auth: true, body: body }).then(function (r) {
        if (!r.ok) throw new Error(serverMsg(r.data));
        return navigator.credentials.create({ publicKey: prepCreation(r.data.options) });
      }).then(function (cred) {
        return api("/passkeys/register/verify", { method: "POST", auth: true, body: { response: credToJson(cred, true), name: val("pkName") || undefined } });
      }).then(function (r) {
        showAlert("pkAlert", serverMsg(r.data), r.ok);
        if (r.ok) { reauthTokens.pk = ""; loadPasskeys(); }
      }).catch(function (e) { showAlert("pkAlert", waErrText(e), false); });
    });

    document.getElementById("delSubmit").addEventListener("click", function () {
      if (!document.getElementById("delConfirm").checked) { showAlert("delAlert", t("fill_all"), false); return; }
      var body = { confirm: true };
      if (reauthTokens.del) body.reauthToken = reauthTokens.del;
      else if (val("delPwd")) body.password = document.getElementById("delPwd").value;
      else { showAlert("delAlert", t("verify_first"), false); return; }
      api("/security/delete-account", { method: "POST", auth: true, body: body }).then(function (r) {
        showAlert("delAlert", serverMsg(r.data), r.ok);
        if (r.ok) { reauthTokens.del = ""; loadMe(); }
      });
    });
    document.getElementById("cancelDeleteBtn").addEventListener("click", function () {
      api("/security/delete-account/cancel", { method: "POST", auth: true, body: {} }).then(function (r) {
        showAlert("secAlert", serverMsg(r.data), r.ok);
        if (r.ok) init();
      });
    });

    document.getElementById("apQuota").addEventListener("click", function () {
      var id = val("apId"), pw = document.getElementById("apPwd").value;
      if (!id || !pw) { showAlert("appealAlert", t("fill_all"), false); return; }
      QFAuth.post("/appeals/quota", { identifier: id, password: pw }).then(function (r) {
        if (r.ok) showAlert("appealAlert", t("quota_left", { n: r.data.remaining }), true);
        else if (r.data && r.data.code === "ACCOUNT_BANNED") showAlert("appealAlert", r.data.permanent ? t("ban_perm") : t("ban_timed", { x: fmtTime(r.data.bannedUntil) }), false);
        else showAlert("appealAlert", serverMsg(r.data), false);
      });
    });
    document.getElementById("usernameSubmit").addEventListener("click", function () {
      var u = val("newUsername");
      if (!/^(?=.*[A-Za-z])[A-Za-z0-9]{8,32}$/.test(u)) { showAlert("usernameAlert", t("username_invalid"), false); return; }
      api("/profile", { method: "PUT", auth: true, body: { username: u } }).then(function (r) {
        if (r.ok) {
          showAlert("usernameAlert", t("username_ok"), true);
          document.getElementById("usernameSetup").classList.add("hidden");
          loadMe();
        } else if (r.data && r.data.code === "USERNAME_TAKEN") {
          showAlert("usernameAlert", t("username_taken"), false);
        } else {
          showAlert("usernameAlert", serverMsg(r.data), false);
        }
      });
    });

    var rcLoadFriendsBtn = document.getElementById("rcLoadFriends");
    if (rcLoadFriendsBtn) rcLoadFriendsBtn.addEventListener("click", loadRecoveryFriendsByIdentity);
    document.getElementById("rcViewDevices").addEventListener("click", function () {
      var account = val("rcAccount"), email = val("rcEmail");
      if (!account || !email) { showAlert("recAlert", t("rec_fill_account"), false); return; }
      QFAuth.post("/appeals/recovery/devices", { account: account, email: email }).then(function (r) {
        var host = document.getElementById("rcDevices");
        if (!r.ok) { showAlert("recAlert", serverMsg(r.data), false); host.innerHTML = ""; return; }
        var list = Array.isArray(r.data.devices) ? r.data.devices : [];
        if (!list.length) { host.innerHTML = '<p class="hint">' + esc(t("rec_devices_empty")) + "</p>"; return; }
        host.innerHTML = list.map(function (d) {
          var meta = [d.platform || "", d.region || "", fmtTime(d.lastActiveAt)].filter(Boolean).join(" · ");
          return '<div style="padding:8px 0;border-top:1px solid var(--line)"><strong>' + esc(d.name || "") + '</strong><br><span class="hint">' + esc(meta) + "</span></div>";
        }).join("");
      }).catch(function () { showAlert("recAlert", t("generic_fail"), false); });
    });
    document.getElementById("rcSubmit").addEventListener("click", function () {
      var account = val("rcAccount");
      if (!account) { showAlert("recAlert", t("rec_fill_account"), false); return; }
      var oldPasswords = ["rcOldPw1", "rcOldPw2", "rcOldPw3"].map(function (id) {
        return document.getElementById(id).value;
      }).filter(function (x) { return x.length > 0; });
      var body = {
        account: account,
        oldPasswords: oldPasswords,
        deviceModels: linesOf("rcModels"),
        loginLocations: linesOf("rcLocations")
      };
      var note = val("rcNote");
      if (note) body.note = note;
      var fid = val("rcFriend");
      if (fid) body.selectedFriendUserId = Number(fid);
      QFAuth.post("/appeals/recovery", body).then(function (r) {
        if (!r.ok) { showAlert("recAlert", serverMsg(r.data), false); return; }
        var msg = t("rec_ok", { id: r.data.appealId });
        if (r.data.friendVerification && r.data.friendVerification.message) msg += " " + r.data.friendVerification.message;
        else if (r.data.message) msg += " " + r.data.message;
        showAlert("recAlert", msg, true);
        document.getElementById("rcStatusId").value = r.data.appealId;
        document.getElementById("rcStatusAccount").value = account;
      }).catch(function () { showAlert("recAlert", t("generic_fail"), false); });
    });
    document.getElementById("rcStatusBtn").addEventListener("click", function () {
      var id = val("rcStatusId"), account = val("rcStatusAccount");
      var out = document.getElementById("rcStatusResult");
      if (!id || !account) { showAlert("recStatusAlert", t("rec_status_fill"), false); return; }
      QFAuth.api("/appeals/recovery/status?appealId=" + encodeURIComponent(id) + "&account=" + encodeURIComponent(account), {}).then(function (r) {
        document.getElementById("rcResetWrap").classList.add("hidden");
        recoveryGrant = { appealId: 0, grant: "" };
        if (!r.ok) { showAlert("recStatusAlert", serverMsg(r.data), false); out.textContent = ""; return; }
        var key = { pending: "rec_status_pending", approved: "rec_status_approved", rejected: "rec_status_rejected", superseded: "rec_status_superseded" }[r.data.status] || null;
        var parts = [t("rec_status_line", { s: key ? t(key) : String(r.data.status || "") })];
        parts.push(r.data.friendVerified ? t("rec_friend_done") : t("rec_friend_todo"));
        if (r.data.status === "rejected" && r.data.rejectReason) parts.push(t("rec_reject_reason", { x: r.data.rejectReason }));
        if (r.data.status === "approved") {
          if (r.data.resetGrant) {
            recoveryGrant = { appealId: Number(id), grant: r.data.resetGrant };
            document.getElementById("rcResetWrap").classList.remove("hidden");
          } else if (r.data.resetUsed) parts.push(t("rec_grant_used"));
          else if (r.data.grantIssued) parts.push(t("rec_grant_issued"));
        }
        out.textContent = parts.join(" ");
        showAlert("recStatusAlert", "", true);
        document.getElementById("recStatusAlert").className = "alert";
      }).catch(function () { showAlert("recStatusAlert", t("generic_fail"), false); });
    });
    document.getElementById("rcResetBtn").addEventListener("click", function () {
      var np = document.getElementById("rcNewPwd").value, np2 = document.getElementById("rcNewPwd2").value;
      if (!recoveryGrant.grant) { showAlert("recStatusAlert", t("generic_fail"), false); return; }
      if (np.length < 8 || np.length > 72) { showAlert("recStatusAlert", t("pwd_len"), false); return; }
      if (np !== np2) { showAlert("recStatusAlert", t("pwd_match"), false); return; }
      QFAuth.post("/appeals/recovery/reset", { appealId: recoveryGrant.appealId, resetGrant: recoveryGrant.grant, newPassword: np }).then(function (r) {
        showAlert("recStatusAlert", serverMsg(r.data), r.ok);
        if (r.ok) {
          recoveryGrant = { appealId: 0, grant: "" };
          document.getElementById("rcResetWrap").classList.add("hidden");
        }
      }).catch(function () { showAlert("recStatusAlert", t("generic_fail"), false); });
    });

    document.getElementById("apSubmit").addEventListener("click", function () {
      var id = val("apId"), pw = document.getElementById("apPwd").value, content = val("apContent");
      if (!id || !pw || !content) { showAlert("appealAlert", t("fill_all"), false); return; }
      QFAuth.post("/appeals", { identifier: id, password: pw, content: content }).then(function (r) {
        showAlert("appealAlert", r.ok ? t("appeal_ok") : serverMsg(r.data), r.ok);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
