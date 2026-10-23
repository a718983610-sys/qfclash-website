// QFClash 论坛前端：板块 / 帖子列表 / 详情 / 发帖 / 回复 / 昵称，中英双语。
// 登录态由 assets/auth.js（window.QFAuth）统一管理，与官网、App 同一账号体系。
// 接口：账号服务器 /forum/*（约定契约）。
const API = "https://qfclash-account.a718983610.workers.dev";

const I18N = {
  zh: {
    nav_about: "产品介绍", nav_download: "下载", nav_points: "积分规则", nav_forum: "论坛",
    nav_agreement: "用户协议", nav_privacy: "隐私说明", nav_home: "首页",
    forum_title: "QFClash 论坛",
    forum_sub: "本论坛为 QFClash 用户交流与互助社区。发言请友善文明，并遵守法律法规与社区规范。",
    new_post: "发布帖子", prev: "上一页", next: "下一页",
    replies: "回复", reply_ph: "请在此填写回复内容", reply_submit: "发表回复",
    login_to_reply: "登录后即可参与回复。", back_list: "← 返回帖子列表",
    compose_title: "发布新帖", f_board: "选择板块", f_title: "标题", f_content: "正文",
    title_ph: "请输入帖子标题", content_ph: "请输入帖子内容", publish: "发布", cancel: "取消",
    profile_title: "设置昵称", nick_ph: "请输入昵称", save: "保存",
    set_nick: "设置昵称",
    board_all: "全部", loading: "正在加载……",
    forum_soon: "论坛功能即将开放，敬请期待。",
    load_fail: "内容加载失败，请稍后重试。",
    empty_posts: "本板块暂无帖子。", empty_replies: "暂无回复。",
    need_login_post: "发布帖子前请先登录。",
    need_login: "请先登录后再操作。",
    fill_both: "请填写标题与正文内容。",
    fill_reply: "请先填写回复内容。",
    fill_nick: "请先填写昵称。",
    post_ok: "发布成功。",
    reply_ok: "回复发表成功。",
    nick_ok: "昵称已保存。",
    generic_fail: "操作失败，请稍后重试。",
    badge_review: "审核中",
    post_pending: "提交成功，帖子审核中，通过后将公开展示。",
    reply_pending: "提交成功，回复审核中，通过后将公开展示。",
    mod_post: "您的帖子未通过内容审核。审核结果：{x}。请修改内容后重新提交。",
    mod_reply: "您的回复未通过内容审核。审核结果：{x}。请修改内容后重新提交。",
    reply_count: "{n} 条回复",
    report_btn: "举报",
    report_ok: "举报已提交，感谢您的反馈。",
    report_already: "您已举报过该帖子，无需重复举报。",
    mute_perm: "您的论坛发言已被永久限制。如有疑问，请发送邮件至 a718983610@gmail.com 申诉。",
    mute_timed: "您的论坛发言已被限制，解除时间：{x}。如有疑问，请发送邮件至 a718983610@gmail.com 申诉。",
    announce_admin_only: "公告板块仅管理员可发布帖子。",
    footer_lic: "QFClash 基于开源项目 FlClash 与 mihomo 内核开发，源代码以 GNU 通用公共许可证第三版（GPL-3.0）发布。FlClash、mihomo 等开源组件的权利归各自作者所有，并适用其随附许可证。"
  },
  en: {
    nav_about: "About", nav_download: "Download", nav_points: "Points Rules", nav_forum: "Forum",
    nav_agreement: "User Agreement", nav_privacy: "Privacy Notice", nav_home: "Home",
    forum_title: "QFClash Forum",
    forum_sub: "This forum is the community for QFClash users to exchange experience and help one another. Please keep posts courteous and lawful, and observe the community rules.",
    new_post: "New Post", prev: "Previous", next: "Next",
    replies: "Replies", reply_ph: "Write your reply here", reply_submit: "Post Reply",
    login_to_reply: "Please sign in to join the discussion.", back_list: "← Back to post list",
    compose_title: "Create a New Post", f_board: "Board", f_title: "Title", f_content: "Content",
    title_ph: "Enter the post title", content_ph: "Enter the post content", publish: "Publish", cancel: "Cancel",
    profile_title: "Set Nickname", nick_ph: "Enter a nickname", save: "Save",
    set_nick: "Set Nickname",
    board_all: "All", loading: "Loading…",
    forum_soon: "The forum is coming soon. Stay tuned.",
    load_fail: "Failed to load. Please try again later.",
    empty_posts: "There are no posts in this board yet.", empty_replies: "No replies yet.",
    need_login_post: "Please sign in before posting.",
    need_login: "Please sign in first.",
    fill_both: "Please enter both a title and content.",
    fill_reply: "Please write your reply first.",
    fill_nick: "Please enter a nickname first.",
    post_ok: "Published successfully.",
    reply_ok: "Reply posted successfully.",
    nick_ok: "Nickname saved.",
    generic_fail: "The operation failed. Please try again later.",
    badge_review: "Under review",
    post_pending: "Submitted. Your post is under review and will be displayed once approved.",
    reply_pending: "Submitted. Your reply is under review and will be displayed once approved.",
    mod_post: "Your post did not pass content review. Review result: {x}. Please revise the content and submit again.",
    mod_reply: "Your reply did not pass content review. Review result: {x}. Please revise the content and submit again.",
    reply_count: "{n} replies",
    report_btn: "Report",
    report_ok: "Your report has been submitted. Thank you for your feedback.",
    report_already: "You have already reported this post.",
    mute_perm: "Your forum posting privileges have been permanently restricted. If you wish to appeal, please email a718983610@gmail.com.",
    mute_timed: "Your forum posting privileges are restricted until {x}. If you wish to appeal, please email a718983610@gmail.com.",
    announce_admin_only: "Only administrators can post in the Announcements board.",
    footer_lic: "QFClash is developed from the open-source FlClash project and the mihomo core, and its source code is released under the GNU General Public License v3.0 (GPL-3.0). FlClash, mihomo, and other open-source components remain the property of their respective authors and are subject to their accompanying licenses."
  }
};

// ---------- 基础状态 ----------
let lang = "zh";
try { lang = localStorage.getItem("qf_lang") || "zh"; } catch (e) {}
let boards = [];
let currentBoard = "";
let page = 1;
let lastPageSize = 0;
let currentPostId = null;
const PAGE_SIZE = 20;
const PENDING_STATES = ["pending", "reviewing", "pending_review", "under_review", "in_review", "审核中"];

function t(key, vars) {
  let s = (I18N[lang] || I18N.zh)[key] || key;
  if (vars) Object.keys(vars).forEach(function (k) { s = s.replace("{" + k + "}", vars[k]); });
  return s;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function fmtTime(v) {
  if (v == null || v === "") return "";
  let ms;
  if (typeof v === "number") ms = v < 1e12 ? v * 1000 : v;
  else { const p = Date.parse(v); ms = isNaN(p) ? Number(v) * 1000 : p; }
  if (isNaN(ms)) return "";
  return new Date(ms).toLocaleString(lang === "en" ? "en-US" : "zh-CN", { hour12: false });
}
function getToken() { return window.QFAuth ? QFAuth.token() : ""; }
function getNick() {
  try { return localStorage.getItem("qf_nickname") || sessionStorage.getItem("qf_nickname") || ""; } catch (e) { return ""; }
}
// 作者名统一读服务端嵌套 author:{userId,name}（A-30）。
function authorOf(obj) {
  if (!obj) return "";
  if (obj.author && typeof obj.author === "object" && obj.author.name) return obj.author.name;
  return obj.authorName || obj.nickname || "";
}
function errCode(data) { return data && (data.code || data.error) ? (data.code || data.error) : ""; }
// 提交被拒分支（B-27）：按错误码分流——禁言出全文、公告板块出专属提示，其余才走审核大类模板。
function submitErrorText(data, kind) {
  const code = errCode(data);
  if (code === "FORUM_MUTED") return serverMsg(data);
  if (code === "FORUM_BOARD_FORBIDDEN") return t("announce_admin_only");
  if (code === "FORUM_TOO_NEW") return serverMsg(data);
  return t(kind === "reply" ? "mod_reply" : "mod_post", { x: violationText(data) });
}
function isPending(obj) {
  if (!obj) return false;
  const s = obj.status || obj.state || obj.reviewStatus || "";
  return obj.pending === true || PENDING_STATES.indexOf(String(s).toLowerCase()) !== -1 || PENDING_STATES.indexOf(String(s)) !== -1;
}
function reviewBadge(obj) {
  return isPending(obj) ? '<span class="badge-review">' + esc(t("badge_review")) + "</span>" : "";
}

// ---------- API（走 QFAuth：自动带令牌与 401 续期） ----------
function api(path, opts) {
  if (window.QFAuth) return QFAuth.api(path, opts || {});
  return fetch(API + path).then(function (r) { return { ok: false, status: r.status, data: {} }; });
}
function pickArr(data) {
  if (Array.isArray(data)) return data;
  const keys = ["boards", "posts", "replies", "items", "list"];
  for (const k of keys) {
    if (Array.isArray(data && data[k])) return data[k];
    if (data && data.data && Array.isArray(data.data[k])) return data.data[k];
  }
  if (data && Array.isArray(data.data)) return data.data;
  return null;
}
function serverMsg(data, fallbackKey) {
  if (data && typeof data.message === "string" && data.message) return data.message;
  return t(fallbackKey || "generic_fail");
}
function violationText(data) {
  if (!data) return "";
  const c = data.category || data.violationCategory || data.violation || (data.detail && data.detail.category) || "";
  const m = typeof data.message === "string" ? data.message : "";
  if (c && m && m.indexOf(c) === -1) return c + "（" + m + "）";
  return c || m || t("generic_fail");
}

// ---------- 语言 ----------
function applyLang() {
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    const key = el.getAttribute("data-i18n");
    const dict = I18N[lang] || I18N.zh;
    if (dict[key]) el.textContent = dict[key];
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
    const key = el.getAttribute("data-i18n-ph");
    const dict = I18N[lang] || I18N.zh;
    if (dict[key]) el.setAttribute("placeholder", dict[key]);
  });
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document.title = lang === "en" ? "QFClash Forum" : "QFClash 论坛";
  document.getElementById("langToggle").textContent = lang === "en" ? "中文" : "EN";
  const rb2 = document.getElementById("reportBtn");
  if (rb2) rb2.textContent = t("report_btn");
  if (window.QFAuth) QFAuth.setLang(lang);
}

// ---------- 视图 ----------
function showView(name) {
  document.getElementById("viewMain").classList.toggle("hidden", name !== "list");
  document.getElementById("viewDetail").classList.toggle("hidden", name !== "detail");
  document.getElementById("viewCompose").classList.toggle("hidden", name !== "compose");
}
function showAlert(boxId, msg, ok) {
  const box = document.getElementById(boxId);
  box.textContent = msg;
  box.className = "alert show " + (ok ? "ok" : "err");
}
function hideAlert(boxId) { document.getElementById(boxId).className = "alert"; }
function openLogin() { if (window.QFAuth) QFAuth.open("login"); }

// ---------- 用户区（论坛页内：昵称与设置；登录/退出在顶栏） ----------
function renderUserbar() {
  const bar = document.getElementById("userbar");
  if (!getToken()) {
    bar.innerHTML = "";
  } else {
    const nick = getNick();
    bar.innerHTML =
      (nick ? '<span class="nick">' + esc(nick) + "</span>" : "") +
      '<button class="small-btn" id="nickBtn">' + esc(t("set_nick")) + "</button>";
    document.getElementById("nickBtn").addEventListener("click", function () {
      document.getElementById("nickInput").value = getNick();
      hideAlert("profileAlert");
      document.getElementById("profileModal").classList.add("show");
    });
  }
  syncReplyBox();
}
function syncReplyBox() {
  const box = document.getElementById("replyBox");
  const hint = document.getElementById("replyLoginHint");
  if (!box) return;
  const logged = !!getToken();
  box.classList.toggle("hidden", !logged);
  hint.classList.toggle("hidden", logged);
}

// ---------- 板块与列表 ----------
async function loadBoards() {
  try {
    const r = await api("/forum/boards");
    const list = pickArr(r.data);
    if (!r.ok || !list) throw new Error("bad");
    boards = list;
  } catch (e) {
    boards = [];
    document.getElementById("postArea").innerHTML = '<div class="empty-box">' + esc(t("load_fail")) + "</div>";
    document.getElementById("pager").classList.add("hidden");
    return;
  }
  renderBoards();
  loadPosts();
}
function boardId(b) { return b && (b.id !== undefined ? b.id : (b.slug || b.key || b.name)); }
function boardName(b) {
  if (!b) return "";
  if (lang === "en" && b.nameEn) return b.nameEn;
  return b.name || b.title || String(boardId(b));
}
function renderBoards() {
  const wrap = document.getElementById("boards");
  let html = '<button class="chip' + (currentBoard === "" ? " active" : "") + '" data-board="">' + esc(t("board_all")) + "</button>";
  boards.forEach(function (b) {
    const id = String(boardId(b));
    html += '<button class="chip' + (currentBoard === id ? " active" : "") + '" data-board="' + esc(id) + '">' + esc(boardName(b)) + "</button>";
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      currentBoard = chip.getAttribute("data-board");
      page = 1;
      renderBoards();
      loadPosts();
    });
  });
  const sel = document.getElementById("postBoard");
  const prev = sel.value;
  // B-27：发帖板块下拉剔除 announcements（公告仅管理员可发），列表筛选仍保留该板块。
  sel.innerHTML = boards.filter(function (b) { return String(boardId(b)) !== "announcements"; }).map(function (b) {
    return '<option value="' + esc(String(boardId(b))) + '">' + esc(boardName(b)) + "</option>";
  }).join("");
  if (prev && prev !== "announcements" && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
  if (prev === "announcements") showAlert("composeAlert", t("announce_admin_only"), false);
}
async function loadPosts() {
  const area = document.getElementById("postArea");
  area.innerHTML = '<div class="empty-box">' + esc(t("loading")) + "</div>";
  try {
    const q = new URLSearchParams();
    if (currentBoard) q.set("board", currentBoard);
    // B-28：服务端只认 limit/offset，按页换算偏移。
    q.set("limit", String(PAGE_SIZE));
    q.set("offset", String((page - 1) * PAGE_SIZE));
    const headers = getToken() ? { auth: true } : {};
    const r = await api("/forum/posts?" + q.toString(), headers);
    const list = pickArr(r.data);
    if (!r.ok || !list) throw new Error("bad");
    lastPageSize = list.length;
    if (!list.length) {
      area.innerHTML = '<div class="empty-box">' + esc(t("empty_posts")) + "</div>";
    } else {
      area.innerHTML = '<div class="post-list">' + list.map(function (p) {
        const author = authorOf(p);
        const rc = p.replyCount !== undefined ? p.replyCount : (p.replies ? p.replies.length : 0);
        return '<div class="post-row" data-id="' + esc(String(p.id)) + '">' +
          '<span class="ttl">' + esc(p.title || "") + reviewBadge(p) + "</span>" +
          '<span class="meta hide-s">' + esc(author) + "</span>" +
          '<span class="meta">' + esc(fmtTime(p.createdAt || p.created_at)) + "</span>" +
          '<span class="meta">' + esc(t("reply_count", { n: rc })) + "</span></div>";
      }).join("") + "</div>";
      area.querySelectorAll(".post-row").forEach(function (row) {
        row.addEventListener("click", function () { openPost(row.getAttribute("data-id")); });
      });
    }
  } catch (e) {
    area.innerHTML = '<div class="empty-box">' + esc(t("load_fail")) + "</div>";
  }
  document.getElementById("prevPage").disabled = page <= 1;
  document.getElementById("nextPage").disabled = lastPageSize < PAGE_SIZE;
}

// ---------- 详情 ----------
async function openPost(id) {
  currentPostId = id;
  showView("detail");
  const card = document.getElementById("detailCard");
  card.innerHTML = '<p style="color:var(--gray)">' + esc(t("loading")) + "</p>";
  document.getElementById("replyList").innerHTML = "";
  hideAlert("replyAlert");
  try {
    const r = await api("/forum/posts/" + encodeURIComponent(id), getToken() ? { auth: true } : {});
    if (!r.ok) throw new Error("bad");
    const post = r.data.post || r.data.data || r.data;
    const replies = Array.isArray(r.data.replies) ? r.data.replies : (post.replies || []);
    const author = authorOf(post);
    card.innerHTML =
      "<h2>" + esc(post.title || "") + reviewBadge(post) + "</h2>" +
      '<p class="meta">' + esc(author) + " · " + esc(fmtTime(post.createdAt || post.created_at)) + "</p>" +
      '<div class="body">' + esc(post.content || post.body || "") + "</div>";
    const rl = document.getElementById("replyList");
    if (!replies.length) {
      rl.innerHTML = '<p style="color:var(--gray);font-size:14.5px">' + esc(t("empty_replies")) + "</p>";
    } else {
      rl.innerHTML = replies.map(function (rp) {
        const a = authorOf(rp);
        return '<div class="reply"><p class="meta">' + esc(a) + " · " + esc(fmtTime(rp.createdAt || rp.created_at)) + reviewBadge(rp) + '</p><div class="body">' + esc(rp.content || rp.body || "") + "</div></div>";
      }).join("");
    }
  } catch (e) {
    card.innerHTML = '<p style="color:var(--gray)">' + esc(t("load_fail")) + "</p>";
  }
  syncReplyBox();
}

// ---------- 发帖 / 回复 ----------
async function submitPost() {
  if (!getToken()) { showAlert("composeAlert", t("need_login"), false); openLogin(); return; }
  const board = document.getElementById("postBoard").value;
  if (board === "announcements") { showAlert("composeAlert", t("announce_admin_only"), false); return; }
  const title = document.getElementById("postTitle").value.trim();
  const content = document.getElementById("postContent").value.trim();
  if (!title || !content) { showAlert("composeAlert", t("fill_both"), false); return; }
  const btn = document.getElementById("postSubmit");
  btn.disabled = true;
  try {
    const r = await api("/forum/posts", { method: "POST", auth: true, body: { board: board, title: title, content: content } });
    if (r.ok) {
      // A-32：先看 data.status——rejected 显示大类提示且不清空表单；pending 显示待审提示。
      const status = String((r.data && r.data.status) || (r.data.post && r.data.post.status) || "");
      if (status === "rejected") {
        showAlert("composeAlert", t("mod_post", { x: violationText(r.data) }), false);
      } else if (status === "pending" || isPending(r.data) || isPending(r.data.post || {})) {
        showAlert("composeAlert", t("post_pending"), true);
        document.getElementById("postTitle").value = "";
        document.getElementById("postContent").value = "";
        if (board) currentBoard = String(board);
        page = 1;
        renderBoards();
        setTimeout(function () { showView("list"); loadPosts(); }, 700);
      } else {
        showAlert("composeAlert", t("post_ok"), true);
        document.getElementById("postTitle").value = "";
        document.getElementById("postContent").value = "";
        if (board) currentBoard = String(board);
        page = 1;
        renderBoards();
        setTimeout(function () { showView("list"); loadPosts(); }, 700);
      }
    } else if (r.status === 400 || r.status === 403 || r.status === 422) {
      showAlert("composeAlert", submitErrorText(r.data, "post"), false);
    } else if (r.status === 401) {
      showAlert("composeAlert", t("need_login"), false);
      openLogin();
    } else {
      showAlert("composeAlert", serverMsg(r.data), false);
    }
  } catch (e) {
    showAlert("composeAlert", t("generic_fail"), false);
  }
  btn.disabled = false;
}
async function submitReply() {
  if (!getToken()) { openLogin(); return; }
  const content = document.getElementById("replyContent").value.trim();
  if (!content) { showAlert("replyAlert", t("fill_reply"), false); return; }
  const btn = document.getElementById("replySubmit");
  btn.disabled = true;
  try {
    const r = await api("/forum/posts/" + encodeURIComponent(currentPostId) + "/replies", { method: "POST", auth: true, body: { content: content } });
    if (r.ok) {
      // A-32：先看 data.status——rejected 显示大类提示且不清空表单；pending 显示待审提示。
      const status = String((r.data && r.data.status) || (r.data.reply && r.data.reply.status) || "");
      if (status === "rejected") {
        showAlert("replyAlert", t("mod_reply", { x: violationText(r.data) }), false);
      } else if (status === "pending" || isPending(r.data) || isPending(r.data.reply || {})) {
        document.getElementById("replyContent").value = "";
        showAlert("replyAlert", t("reply_pending"), true);
      } else {
        document.getElementById("replyContent").value = "";
        showAlert("replyAlert", t("reply_ok"), true);
        openPost(currentPostId);
      }
    } else if (r.status === 400 || r.status === 403 || r.status === 422) {
      showAlert("replyAlert", submitErrorText(r.data, "reply"), false);
    } else if (r.status === 401) {
      openLogin();
    } else {
      showAlert("replyAlert", serverMsg(r.data), false);
    }
  } catch (e) {
    showAlert("replyAlert", t("generic_fail"), false);
  }
  btn.disabled = false;
}

// ---------- 举报（B-29） ----------
async function reportCurrentPost() {
  if (!currentPostId) return;
  if (!getToken()) { openLogin(); return; }
  const btn = document.getElementById("reportBtn");
  if (btn) btn.disabled = true;
  try {
    const r = await api("/forum/posts/" + encodeURIComponent(currentPostId) + "/report", { method: "POST", auth: true, body: {} });
    if (r.ok && r.data && r.data.alreadyReported) {
      showAlert("detailAlert", t("report_already"), true);
    } else if (r.ok) {
      showAlert("detailAlert", t("report_ok"), true);
    } else if (r.status === 401) {
      openLogin();
    } else {
      showAlert("detailAlert", serverMsg(r.data), false);
    }
  } catch (e) {
    showAlert("detailAlert", t("generic_fail"), false);
  }
  if (btn) btn.disabled = false;
}

// ---------- 禁言状态常驻展示（B-27：加载即调 /forum/profile） ----------
async function loadForumProfile() {
  const banner = document.getElementById("muteBanner");
  if (!banner) return;
  if (!getToken()) { banner.className = "alert"; banner.textContent = ""; return; }
  try {
    const r = await api("/forum/profile", { auth: true });
    if (!r.ok || !r.data) { banner.className = "alert"; return; }
    const d = r.data.data || r.data;
    if (d.mutePermanent) {
      banner.textContent = t("mute_perm");
      banner.className = "alert show err";
    } else if (d.muted && d.muteUntil) {
      banner.textContent = t("mute_timed", { x: fmtTime(d.muteUntil) });
      banner.className = "alert show err";
    } else {
      banner.className = "alert";
      banner.textContent = "";
    }
  } catch (e) { banner.className = "alert"; }
}

// ---------- 初始化 ----------
(function init() {
  applyLang();
  renderUserbar();
  loadForumProfile();
  const rb = document.getElementById("reportBtn");
  if (rb) { rb.textContent = t("report_btn"); rb.addEventListener("click", reportCurrentPost); }
  window.addEventListener("qf-auth-change", function () {
    renderUserbar();
    loadForumProfile();
    if (!document.getElementById("viewMain").classList.contains("hidden")) loadPosts();
  });
  document.getElementById("langToggle").addEventListener("click", function () {
    lang = lang === "en" ? "zh" : "en";
    try { localStorage.setItem("qf_lang", lang); } catch (e) {}
    window.dispatchEvent(new CustomEvent("qf-lang-change", { detail: { lang: lang } }));
    applyLang();
    renderUserbar();
    if (boards.length) renderBoards();
    if (!document.getElementById("viewDetail").classList.contains("hidden") && currentPostId) openPost(currentPostId);
    else if (!document.getElementById("viewMain").classList.contains("hidden")) loadPosts();
  });
  document.getElementById("prevPage").addEventListener("click", function () { if (page > 1) { page--; loadPosts(); } });
  document.getElementById("nextPage").addEventListener("click", function () { page++; loadPosts(); });
  document.getElementById("newPostBtn").addEventListener("click", function () {
    if (!getToken()) { openLogin(); showAlert("alertBox", t("need_login_post"), false); return; }
    hideAlert("composeAlert");
    showView("compose");
  });
  document.getElementById("postCancel").addEventListener("click", function () { showView("list"); });
  document.getElementById("postSubmit").addEventListener("click", submitPost);
  document.getElementById("backBtn").addEventListener("click", function () { showView("list"); loadPosts(); });
  document.getElementById("replySubmit").addEventListener("click", submitReply);
  document.getElementById("profileCancel").addEventListener("click", function () {
    document.getElementById("profileModal").classList.remove("show");
  });
  document.getElementById("nickSave").addEventListener("click", async function () {
    const nick = document.getElementById("nickInput").value.trim();
    if (!nick) { showAlert("profileAlert", t("fill_nick"), false); return; }
    try {
      const r = await api("/forum/profile", { method: "PUT", auth: true, body: { nickname: nick } });
      if (r.ok) {
        if (window.QFAuth) QFAuth.setNickname(nick);
        try { localStorage.setItem("qf_nickname", nick); } catch (e) {}
        showAlert("profileAlert", t("nick_ok"), true);
        renderUserbar();
        setTimeout(function () { document.getElementById("profileModal").classList.remove("show"); }, 600);
      } else {
        showAlert("profileAlert", serverMsg(r.data), false);
      }
    } catch (e) {
      showAlert("profileAlert", t("generic_fail"), false);
    }
  });
  document.querySelectorAll(".modal-mask").forEach(function (m) {
    m.addEventListener("click", function (ev) { if (ev.target === m) m.classList.remove("show"); });
  });
  loadBoards();
})();
