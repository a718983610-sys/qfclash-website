// QFClash 官网中英文切换：默认中文，点击右上角按钮即时切换，不刷新页面。
const I18N = {
  zh: {
    nav_about: "产品介绍", nav_features: "功能亮点", nav_download: "下载",
    nav_points: "积分规则", nav_agreement: "用户协议", nav_contact: "联系我们",
    hero_tagline: "简洁、强大、全中文的网络代理客户端",
    hero_sub: "QFClash 基于 mihomo 内核开发，支持 Android 与 Windows 双平台。导入订阅即可使用，节点选择灵活，功能完整不删减。",
    hero_dl_android: "下载 Android 版", hero_dl_windows: "下载 Windows 版",
    hero_note: "请仅通过本页面与官方仓库下载 QFClash，以确保安装包完整可靠。",
    about_title: "产品介绍",
    about_p1: "QFClash 是一款基于开源项目 FlClash 与 mihomo 内核二次开发的网络代理工具软件，提供 Android 与 Windows 两个平台版本。软件界面布局清晰，全部功能均以简体中文呈现，复杂功能旁设有说明图标，点开即可查看详细介绍与使用示例。",
    about_p2: "QFClash 仅提供工具软件本身，不运营服务器，不提供、不销售任何节点、线路、流量或订阅。用户可将自行取得的订阅导入软件后使用，软件支持节点手动选择、订阅管理、连通性测试与流量统计等完整功能。",
    feat_title: "功能亮点",
    feat_sub: "功能全面，操作简洁，两个平台保持一致的使用体验。",
    f1t: "双平台支持", f1p: "同时提供 Android 版与 Windows 版，界面布局兼顾各平台的操作习惯，账号与积分双平台互通。",
    f2t: "导入订阅即可使用", f2p: "导入订阅后即可连接使用。节点默认手动选择，也可在设置中开启「自动选最快节点」，按需切换。",
    f3t: "全中文界面", f3p: "界面文案全部为简体中文，复杂功能旁设有说明图标，功能用途、开启与关闭的区别均有详细介绍。",
    f4t: "功能完整不删减", f4p: "规则模式、全局模式、节点分组、连通性测试、流量统计、覆写配置等功能一应俱全，满足进阶使用需求。",
    f5t: "双主题设计", f5p: "提供浅色与深色两套主题，深色主题采用深灰配色，长时间使用更加舒适护眼。",
    f6t: "纯净无第三方广告", f6p: "软件不集成任何第三方广告，不弹窗、不打扰，专注于工具本身的使用体验。",
    dl_title: "下载 QFClash",
    dl_sub: "请选择与您的设备对应的平台版本进行下载。应用内「检查更新」同样指向官方仓库的对应平台发布。",
    dl_android_t: "Android 版", dl_android_p: "适用于 Android 手机与平板设备，下载 APK 安装包后直接安装。",
    dl_windows_t: "Windows 版", dl_windows_p: "适用于 Windows 电脑，提供安装版与便携版两种形式，可按需选择。",
    dl_btn_android: "下载最新版", dl_btn_windows: "下载最新版",
    dl_safe: "每个安装包均附有 SHA-256 校验值，下载后可对照校验，确保文件完整无误。",
    points_title: "积分规则",
    points_sub: "登录用户在使用 QFClash 期间可累计积分，积分可用于兑换订阅好礼。现行规则公示如下：",
    r1: "积分按有效使用时长累计：连接使用每满 3 小时得 1 分，未满 3 小时的部分按分钟累计不清零，进度在应用内随时可见。",
    r2: "积分在 Android 与 Windows 双平台互通，同一账号共用一个积分账户；同一时段在两台设备同时使用，仅按一份时长计算。",
    r3: "每日积分获取上限为 8 分。",
    r4: "兑换标准：1000 分可兑换魔戒订阅 19.9 元档；1600 分可兑换魔戒订阅 29.9 元档。商品以应用内实际上架为准。",
    r5: "兑换前需二次确认；奖品经人工审核后发放，兑换记录可在应用内「我的兑换」中查看。",
    r6: "访客模式下不累计积分。访客每日可免费使用 2 小时，登录后不限时长。",
    r7: "积分规则如有调整，将在应用内与本页面提前公示。",
    contact_title: "联系与反馈",
    contact_p1: "意见反馈：QFClash 应用内「关于」页设有意见反馈窗口，填写并提交后将自动发送至官方邮箱，无需另行撰写邮件。",
    contact_p2: "联系邮箱：", contact_p3: "官方仓库：",
    footer_repo: "官方仓库",
    footer_lic: "QFClash 基于开源项目 FlClash 与 mihomo 内核开发，源代码以 GNU 通用公共许可证第三版（GPL-3.0）发布。FlClash、mihomo 等开源组件的权利归各自作者所有，并适用其随附许可证。"
  },
  en: {
    nav_about: "About", nav_features: "Features", nav_download: "Download",
    nav_points: "Points Rules", nav_agreement: "User Agreement", nav_contact: "Contact",
    hero_tagline: "A clean, powerful network proxy client for Android and Windows",
    hero_sub: "QFClash is built on the mihomo core and available for both Android and Windows. Import your subscription and connect — with flexible node selection and a complete, unabridged feature set.",
    hero_dl_android: "Download for Android", hero_dl_windows: "Download for Windows",
    hero_note: "Please download QFClash only from this page and the official repository to ensure the integrity of the installation packages.",
    about_title: "About QFClash",
    about_p1: "QFClash is a network proxy tool developed from the open-source FlClash project and the mihomo core, available for Android and Windows. Its interface is clearly laid out and fully presented in Simplified Chinese, with information icons next to advanced features that open detailed explanations and usage examples.",
    about_p2: "QFClash provides the software tool only. It does not operate any servers, and does not provide or sell any nodes, routes, traffic, or subscriptions. Users may import subscriptions obtained on their own; the software supports manual node selection, subscription management, connectivity testing, traffic statistics, and the full range of related features.",
    feat_title: "Features",
    feat_sub: "A complete feature set with a clean workflow, consistent across both platforms.",
    f1t: "Two Platforms", f1p: "Available for both Android and Windows, with layouts adapted to each platform's conventions. Accounts and points are shared across platforms.",
    f2t: "Import and Connect", f2p: "Import a subscription and connect right away. Nodes are selected manually by default; an optional \u201CAuto-select Fastest Node\u201D setting can be enabled as needed.",
    f3t: "Fully Localized Interface", f3p: "All interface text is in Simplified Chinese, with information icons beside advanced features explaining what each feature does and how its settings differ.",
    f4t: "Complete Feature Set", f4p: "Rule mode, global mode, proxy groups, connectivity tests, traffic statistics, override configurations and more — nothing is left out.",
    f5t: "Light and Dark Themes", f5p: "Two themes are provided; the dark theme uses a deep-gray palette that stays comfortable during extended use.",
    f6t: "No Third-Party Ads", f6p: "QFClash integrates no third-party advertising — no pop-ups and no interruptions, keeping the focus on the tool itself.",
    dl_title: "Download QFClash",
    dl_sub: "Please choose the version that matches your device. The in-app update check likewise points to the corresponding platform releases in the official repository.",
    dl_android_t: "Android", dl_android_p: "For Android phones and tablets. Download the APK package and install it directly.",
    dl_windows_t: "Windows", dl_windows_p: "For Windows PCs, available as both an installer and a portable package.",
    dl_btn_android: "Download Latest", dl_btn_windows: "Download Latest",
    dl_safe: "Every package is published together with its SHA-256 checksum, which you may verify after downloading to confirm the file is complete and unmodified.",
    points_title: "Points Rules",
    points_sub: "Signed-in users earn points while using QFClash, and points can be redeemed for subscription rewards. The current rules are published below:",
    r1: "Points accrue by effective usage time: 1 point for every full 3 hours of connected use. Partial time is accumulated by the minute and never reset; progress is visible in the app at any time.",
    r2: "Points are shared between the Android and Windows versions under a single account. Simultaneous use on two devices during the same period counts once only.",
    r3: "A maximum of 8 points may be earned per day.",
    r4: "Redemption rates: 1,000 points redeem the Modai subscription CNY 19.9 tier; 1,600 points redeem the Modai subscription CNY 29.9 tier. Items are subject to actual availability in the app.",
    r5: "Redemption requires a second confirmation. Rewards are issued after manual review, and redemption history can be viewed under \u201CMy Redemptions\u201D in the app.",
    r6: "Points are not earned in guest mode. Guests may use QFClash free of charge for 2 hours per day; signed-in users have no time limit.",
    r7: "Any changes to these rules will be announced in advance in the app and on this page.",
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
