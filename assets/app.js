// QFClash 官网中英文切换：默认中文，点击右上角按钮即时切换，不刷新页面。
const I18N = {
  zh: {
    nav_about: "产品介绍", nav_features: "功能介绍", nav_download: "下载",
    nav_points: "积分规则", nav_agreement: "用户协议", nav_privacy: "隐私说明", nav_contact: "联系我们", nav_forum: "论坛", nav_webapp: "网页版",
    fb_title: "在线留言",
    fb_intro: "您也可以直接在此留言，提交后将自动发送至官方邮箱，我们将认真阅读并处理。",
    fb_content_ph: "请填写您的意见或建议（必填，最多 2000 字）",
    fb_contact_ph: "联系方式（选填，方便我们与您联系）",
    fb_submit: "提交留言",
    fb_sending: "正在提交，请稍候……",
    fb_success: "提交成功，感谢您的反馈，我们将认真阅读并处理。",
    fb_fail: "提交失败，请稍后重试，或直接发送邮件至 a718983610@gmail.com。",
    fb_empty: "请先填写留言内容后再提交。",
    forum_banner_t: "官方论坛 · 用户社区",
    forum_banner_p: "欢迎来到 QFClash 官方论坛。这里是用户交流使用经验、反馈问题与提出建议的社区，官方公告亦在此发布。登录后即可发帖与回复，欢迎参与交流。",
    forum_banner_btn: "进入论坛",
    hero_tagline: "简洁、强大、全中文的网络代理客户端",
    hero_sub: "QFClash 基于 mihomo 内核开发，支持 Android 与 Windows 双平台。导入订阅即可使用，节点选择灵活，功能完整不删减。",
    hero_dl_android: "下载 Android 版", hero_dl_windows: "下载 Windows 版",
    hero_note: "请仅通过本页面与官方仓库下载 QFClash，以确保安装包完整可靠。",
    about_title: "产品介绍",
    about_p1: "QFClash 是一款基于开源项目 FlClash 与 mihomo 内核二次开发的网络代理工具软件，提供 Android 与 Windows 两个平台版本。软件界面布局清晰，全部功能均以简体中文呈现，复杂功能旁设有说明图标，点开即可查看详细介绍与使用示例。",
    about_p2: "QFClash 仅提供工具软件本身，不运营服务器，不提供、不销售任何节点、线路、流量或订阅。用户可将自行取得的订阅导入软件后使用，软件支持节点手动选择、订阅管理、连通性测试与流量统计等完整功能。",
    about_p3: "QFClash 在 Android 与 Windows 上提供一致的核心体验：同一订阅、同一账号、同一积分账户，跨设备使用无缝衔接。界面遵循各平台的操作习惯，常用功能一步可达，力求让每一位用户都能轻松上手。",
    steps_title: "使用流程",
    st1t: "导入订阅", st1p: "粘贴订阅链接，或导入本地配置文件",
    st2t: "选择节点", st2p: "手动挑选节点，或开启自动选最快",
    st3t: "一键连接", st3p: "开启代理，连接状态一目了然",
    st4t: "按规则分流", st4p: "规则、全局、直连模式灵活切换",
    feat_title: "功能介绍",
    feat_sub: "以下为 QFClash 的主要功能介绍，各功能在 Android 与 Windows 双平台均可使用。",
    sub_t: "订阅管理", sub_p: "支持通过订阅链接导入，也可导入本地配置文件；可保存多个订阅并一键更新。订阅的流量用量与到期时间在界面内清晰展示，方便随时掌握使用情况。",
    node_t: "节点选择与测速", node_p: "节点按订阅分组展示，可手动选择任意节点连接；内置连通性测试与延迟测速，节点状态直观呈现。设置中可开启「自动选最快节点」，连接时自动挑选延迟最低的节点。",
    mode_t: "规则与全局模式", mode_p: "提供规则模式、全局模式与直连模式：规则模式依据配置规则智能分流；全局模式让全部流量经由代理节点；直连模式则暂停代理。三种模式可按需一键切换。",
    plat_t: "双平台一致体验", plat_p: "Android 与 Windows 双平台同步发布，界面布局兼顾各平台的操作习惯。同一账号、同一订阅、同一积分账户，跨设备使用无缝衔接。",
    acct_t: "账号与积分", acct_p: "登录用户不受限制：不限使用时长，全部功能完整开放，并可按规则累计积分、兑换美元奖励（规则见下方积分规则）；访客模式每日可免费使用 2 小时，时长与功能均受限制。账号提供设备管理与远程下线功能，登录安全可控。",
    lang_t: "全中文与功能说明", lang_p: "界面文案全部为简体中文。复杂功能旁设有说明图标，点开即可查看该功能的用途、适用场景以及开启与关闭的区别，新手也能快速上手。",
    theme_t: "双主题设计", theme_p: "提供浅色与深色两套主题。深色主题采用深灰配色而非纯黑，白天与夜间使用都舒适；主题可手动切换，也可跟随系统设置。",
    upd_t: "应用内更新", upd_p: "在应用内即可检查并下载新版本，下载进度清晰可见，无需跳转浏览器逐页查找。历史版本安装包保留在官方仓库，可随时下载。",
    ads_t: "纯净无第三方广告", ads_p: "不集成任何第三方广告与行为追踪组件，不弹窗、不打扰。官方介绍仅出现在「关于」页等固定位置，专注于工具本身的使用体验。",
    dl_title: "下载 QFClash",
    dl_sub: "请选择与您的设备对应的平台版本进行下载。应用内「检查更新」同样指向官方仓库的对应平台发布。",
    dl_android_t: "Android 版", dl_android_p: "适用于 Android 手机与平板设备，下载 APK 安装包后直接安装。",
    dl_windows_t: "Windows 版", dl_windows_p: "适用于 Windows 电脑，提供安装版与便携版两种形式，可按需选择。",
    dl_btn_android: "下载最新版", dl_btn_windows: "下载最新版", dl_zip_alt: "或下载 ZIP 压缩包（免安装）",
    dl_safe: "每个安装包均附有 SHA-256 校验值，下载后可对照校验，确保文件完整无误。",
    dl_region: "本软件仅面向允许使用该类服务的国家或地区提供服务。您所在地区如不允许使用该类服务，请勿下载或使用。",
    points_title: "积分规则",
    points_sub: "登录用户在使用 QFClash 期间可累计积分，积分可用于兑换美元奖励。现行规则公示如下：",
    r1: "积分按有效使用时长累计：连接使用每满 3 小时得 1 分，未满 3 小时的部分按分钟累计不清零，进度在应用内随时可见。",
    r2: "积分在 Android 与 Windows 双平台互通，同一账号共用一个积分账户；同一时段在两台设备同时使用，仅按一份时长计算。",
    r3: "每日积分获取上限为 8 分；每台设备每日最多获得 8 分，账号上限与设备上限同时适用，任一达到上限即当日不再计分。",
    r4: "兑换标准：1000 分可兑换 $5 美元奖励；1600 分可兑换 $10 美元奖励。商品以应用内实际上架为准。",
    r5: "兑换前需二次确认；奖品经人工审核后发放，兑换记录可在应用内「我的兑换」中查看。",
    r6: "登录状态不受限制：登录用户不限使用时长，全部功能完整开放，并可累计积分；访客每日可免费使用 2 小时，且不累计积分。",
    r7: "积分规则如有调整，将在应用内与本页面提前公示。",
    r8: "积分累计不受所在地区影响；如您所在地区暂不支持福利兑换，积分仍可正常累计并保留。",
    r9: "论坛每日积分：在官方论坛每天发布 1 条帖子或 1 条评论可得 1 分，每天限 1 次；该积分单独计算，不占用每日 8 分的连接积分上限。灌水、刷分内容被驳回或删除的，当日积分取消。",
    r10: "千赞奖励：您在论坛发布的帖子获赞达到 1000 时，可申请千赞奖励；审核通过后发放 5 分，每个帖子限申请一次。",
    contact_title: "联系与反馈",
    contact_p1: "意见反馈：QFClash 应用内「关于」页设有意见反馈窗口，填写并提交后将自动发送至官方邮箱，无需另行撰写邮件。",
    contact_p2: "联系邮箱：", contact_p3: "官方仓库：",
    footer_repo: "官方仓库",
    footer_lic: "QFClash 基于开源项目 FlClash 与 mihomo 内核开发，源代码以 GNU 通用公共许可证第三版（GPL-3.0）发布。FlClash、mihomo 等开源组件的权利归各自作者所有，并适用其随附许可证。"
  },
  en: {
    nav_about: "About", nav_features: "Features", nav_download: "Download",
    nav_points: "Points Rules", nav_agreement: "User Agreement", nav_privacy: "Privacy Notice", nav_contact: "Contact", nav_forum: "Forum", nav_webapp: "Web App",
    fb_title: "Leave a Message",
    fb_intro: "You may also leave a message here. Submissions are sent automatically to the official email address and will be read and handled with care.",
    fb_content_ph: "Please enter your comments or suggestions (required, up to 2,000 characters)",
    fb_contact_ph: "Contact information (optional, so we can reach you)",
    fb_submit: "Submit",
    fb_sending: "Submitting, please wait…",
    fb_success: "Submitted successfully. Thank you for your feedback; we will read and handle it with care.",
    fb_fail: "Submission failed. Please try again later, or email us directly at a718983610@gmail.com.",
    fb_empty: "Please enter your message before submitting.",
    forum_banner_t: "Official Forum · Community",
    forum_banner_p: "Welcome to the QFClash official forum — the community for sharing experience, reporting issues, and making suggestions. Official announcements are also published here. Sign in to post and reply.",
    forum_banner_btn: "Visit the Forum",
    hero_tagline: "A clean, powerful network proxy client for Android and Windows",
    hero_sub: "QFClash is built on the mihomo core and available for both Android and Windows. Import your subscription and connect — with flexible node selection and a complete, unabridged feature set.",
    hero_dl_android: "Download for Android", hero_dl_windows: "Download for Windows",
    hero_note: "Please download QFClash only from this page and the official repository to ensure the integrity of the installation packages.",
    about_title: "About QFClash",
    about_p1: "QFClash is a network proxy tool developed from the open-source FlClash project and the mihomo core, available for Android and Windows. Its interface is clearly laid out and fully presented in Simplified Chinese, with information icons next to advanced features that open detailed explanations and usage examples.",
    about_p2: "QFClash provides the software tool only. It does not operate any servers, and does not provide or sell any nodes, routes, traffic, or subscriptions. Users may import subscriptions obtained on their own; the software supports manual node selection, subscription management, connectivity testing, traffic statistics, and the full range of related features.",
    about_p3: "QFClash delivers a consistent core experience on Android and Windows: the same subscription, the same account, and the same points balance, seamlessly across devices. The interface follows each platform's conventions, with everyday features one step away.",
    steps_title: "How It Works",
    st1t: "Import a Subscription", st1p: "Paste a subscription link, or import a local configuration file",
    st2t: "Select a Node", st2p: "Pick a node manually, or enable auto-select fastest",
    st3t: "Connect in One Tap", st3p: "Turn on the proxy and see connection status at a glance",
    st4t: "Route by Rules", st4p: "Switch freely among rule, global, and direct modes",
    feat_title: "Feature Overview",
    feat_sub: "The following are QFClash's principal features, available on both Android and Windows.",
    sub_t: "Subscription Management", sub_p: "Import by subscription link or from a local configuration file; keep multiple subscriptions and update them in one tap. Traffic usage and expiry dates are displayed clearly in the app, so you always know where you stand.",
    node_t: "Node Selection & Speed Tests", node_p: "Nodes are grouped by subscription and any node can be selected manually. Built-in connectivity tests and latency measurements show node status at a glance. An optional \u201CAuto-select Fastest Node\u201D setting picks the lowest-latency node when connecting.",
    mode_t: "Rule & Global Modes", mode_p: "Three modes are provided: rule mode routes traffic intelligently according to the configuration rules; global mode sends all traffic through the proxy node; direct mode suspends the proxy. Switch among them in one tap as needed.",
    plat_t: "Consistent on Two Platforms", plat_p: "Released in step for Android and Windows, with layouts adapted to each platform's conventions — the same account, the same subscription, and the same points balance, seamlessly across devices.",
    acct_t: "Accounts & Points", acct_p: "Signed-in users are unrestricted: no time limits, full access to all features, and points earned from usage time that can be redeemed for USD rewards (see the Points Rules below). Guest mode, by contrast, is limited to 2 free hours per day, with restricted features. Accounts include device management and remote sign-out for controlled, secure access.",
    lang_t: "Fully Localized, with Explanations", lang_p: "All interface text is in Simplified Chinese. Information icons beside advanced features explain what each feature does, when to use it, and how its settings differ, so new users can get started quickly.",
    theme_t: "Light & Dark Themes", theme_p: "Two themes are provided. The dark theme uses a deep-gray palette rather than pure black, staying comfortable day and night; themes can be switched manually or follow the system setting.",
    upd_t: "In-App Updates", upd_p: "Check for and download new versions right in the app, with clear download progress — no need to hunt through browser pages. Historical packages remain available in the official repository for download at any time.",
    ads_t: "No Third-Party Ads", ads_p: "QFClash integrates no third-party advertising and no behavioral tracking components — no pop-ups and no interruptions. Official introductions appear only in fixed locations such as the About page.",
    dl_title: "Download QFClash",
    dl_sub: "Please choose the version that matches your device. The in-app update check likewise points to the corresponding platform releases in the official repository.",
    dl_android_t: "Android", dl_android_p: "For Android phones and tablets. Download the APK package and install it directly.",
    dl_windows_t: "Windows", dl_windows_p: "For Windows PCs, available as both an installer and a portable package.",
    dl_btn_android: "Download Latest", dl_btn_windows: "Download Latest", dl_zip_alt: "Or download the ZIP package (portable)",
    dl_safe: "Every package is published together with its SHA-256 checksum, which you may verify after downloading to confirm the file is complete and unmodified.",
    dl_region: "This software is offered only in countries and regions where the use of such services is permitted. If the use of such services is not permitted in your region, please do not download or use this software.",
    points_title: "Points Rules",
    points_sub: "Signed-in users earn points while using QFClash, and points can be redeemed for USD rewards. The current rules are published below:",
    r1: "Points accrue by effective usage time: 1 point for every full 3 hours of connected use. Partial time is accumulated by the minute and never reset; progress is visible in the app at any time.",
    r2: "Points are shared between the Android and Windows versions under a single account. Simultaneous use on two devices during the same period counts once only.",
    r3: "A maximum of 8 points may be earned per day; each device may also earn at most 8 points per day. Both the account cap and the device cap apply, and accrual stops for the day once either cap is reached.",
    r4: "Redemption: 1,000 points for a $5 reward; 1,600 points for a $10 reward. Products are subject to actual availability in the app.",
    r5: "Redemption requires a second confirmation. Rewards are issued after manual review, and redemption history can be viewed under \u201CMy Redemptions\u201D in the app.",
    r6: "Signed-in status is unrestricted: signed-in users have no time limit, full access to all features, and earn points. Guests may use QFClash free of charge for 2 hours per day and do not earn points.",
    r7: "Any changes to these rules will be announced in advance in the app and on this page.",
    r8: "Points accrue regardless of your region. If welfare redemption is not yet available in your region, your points will continue to accrue and remain in your account.",
    r9: "Daily forum points: publishing one post or one comment in the official forum earns 1 point per day (once per day). Forum points are counted separately and do not use up the daily 8-point cap for connection time. If a post or comment is rejected or removed for spam or farming, that day's forum point is cancelled.",
    r10: "1,000-likes reward: when a forum post you published reaches 1,000 likes, you may apply for the milestone reward. After approval, 5 points are granted. Each post may be rewarded once only.",
    contact_title: "Contact & Feedback",
    contact_p1: "Feedback: the \u201CAbout\u201D page in QFClash includes a feedback form. Submissions are sent automatically to the official email address — no separate email is required.",
    contact_p2: "Email: ", contact_p3: "Official repository: ",
    footer_repo: "Official Repository",
    footer_lic: "QFClash is developed from the open-source FlClash project and the mihomo core, and its source code is released under the GNU General Public License v3.0 (GPL-3.0). FlClash, mihomo, and other open-source components remain the property of their respective authors and are subject to their accompanying licenses."
  }
};

function applyLang(lang) {
  const dict = I18N[lang] || I18N.zh;
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
    const key = el.getAttribute("data-i18n-ph");
    if (dict[key]) el.setAttribute("placeholder", dict[key]);
  });
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document.title = lang === "en" ? "QFClash — Official Website" : "QFClash 官方网站";
  document.getElementById("langToggle").textContent = lang === "en" ? "中文" : "EN";
  try { localStorage.setItem("qf_lang", lang); } catch (e) {}
}

(function init() {
  let lang = "zh";
  try { lang = localStorage.getItem("qf_lang") || "zh"; } catch (e) {}
  applyLang(lang);
  document.getElementById("langToggle").addEventListener("click", function () {
    const cur = document.documentElement.lang === "en" ? "en" : "zh";
    applyLang(cur === "en" ? "zh" : "en");
  });
})();

// ===== 在线留言：与 App 意见反馈同一通道（POST /feedback） =====
(function () {
  var form = document.getElementById("feedbackForm");
  if (!form) return;
  var API = "https://qfclash-account.a718983610.workers.dev";
  function lang() { return document.documentElement.lang === "en" ? "en" : "zh"; }
  function t(key) { return (I18N[lang()] || I18N.zh)[key] || key; }
  function webDeviceId() {
    // 与 auth.js 共用同一持久设备标识（A-09），避免两处生成口径不一致。
    if (window.QFAuth && QFAuth.deviceId) return QFAuth.deviceId();
    try {
      var id = localStorage.getItem("qf_web_id");
      if (!id) {
        id = "web-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
        localStorage.setItem("qf_web_id", id);
      }
      return id;
    } catch (e) { return "web-anonymous"; }
  }
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var status = document.getElementById("fbStatus");
    var btn = document.getElementById("fbSubmit");
    var content = document.getElementById("fbContent").value.trim();
    var contact = document.getElementById("fbContact").value.trim();
    status.className = "fb-status";
    if (!content) { status.textContent = t("fb_empty"); status.classList.add("err"); return; }
    btn.disabled = true;
    status.textContent = t("fb_sending");
    fetch(API + "/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: content,
        contact: contact || undefined,
        platform: "website",
        source: "website",
        appVersion: "web",
        deviceHash: webDeviceId()
      })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok && data && data.ok !== false) {
          status.textContent = t("fb_success");
          status.classList.add("ok");
          form.reset();
        } else {
          status.textContent = (data && data.message) ? data.message : t("fb_fail");
          status.classList.add("err");
        }
      });
    }).catch(function () {
      status.textContent = t("fb_fail");
      status.classList.add("err");
    }).finally(function () { btn.disabled = false; });
  });
})();

// ===== 动效：滚动渐入 + 顶栏滚动阴影 + 语言变更广播 =====
(function () {
  var header = document.querySelector("header");
  function onScroll() { if (header) header.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  var els = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add("in"); });
  }
  var origToggle = document.getElementById("langToggle");
  if (origToggle) {
    origToggle.addEventListener("click", function () {
      setTimeout(function () {
        var l = document.documentElement.lang === "en" ? "en" : "zh";
        window.dispatchEvent(new CustomEvent("qf-lang-change", { detail: { lang: l } }));
        if (window.QFAuth) QFAuth.setLang(l);
      }, 0);
    });
  }
})();

// ===== 下载按钮直链：页面加载时向 GitHub API 解析各平台最新正式版安装包，点按直接下载 =====
// 只取正式版（跳过 draft 与 prerelease 预发布）；解析成功后把按钮 href 换成资产直链
// （browser_download_url）并去掉新窗口打开，让下载在当前页直接开始；
// 拉取失败则保留 HTML 中的当前正式版直链作为兜底，按钮始终直达下载。
(function () {
  var btns = document.querySelectorAll("[data-dl]");
  if (!btns.length) return;
  fetch("https://api.github.com/repos/a718983610-sys/FlClash/releases?per_page=30", {
    headers: { "Accept": "application/vnd.github+json" }
  }).then(function (res) {
    if (!res.ok) throw new Error("github api " + res.status);
    return res.json();
  }).then(function (list) {
    function pick(prefix, exts) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.draft || r.prerelease) continue;
        if (!r.tag_name || r.tag_name.indexOf(prefix) !== 0) continue;
        for (var e = 0; e < exts.length; e++) {
          for (var a = 0; a < (r.assets || []).length; a++) {
            var name = (r.assets[a].name || "").toLowerCase();
            if (name.slice(-exts[e].length) === exts[e]) return r.assets[a].browser_download_url;
          }
        }
      }
      return null;
    }
    var map = {
      android: pick("android-v", [".apk"]),
      windows: pick("windows-v", [".exe", ".zip"]),
      "windows-zip": pick("windows-v", [".zip"])
    };
    btns.forEach(function (b) {
      var url = map[b.getAttribute("data-dl")];
      if (url) { b.href = url; b.removeAttribute("target"); }
    });
  }).catch(function () { /* 保留兜底链接 */ });
})();
