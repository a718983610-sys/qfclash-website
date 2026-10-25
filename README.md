# QFClash 官方网站

QFClash 官方网站源码（纯静态 HTML/CSS/JS，无构建依赖），通过 GitHub Pages 发布。

- 临时网址：https://a718983610-sys.github.io/qfclash-website/
- 正式域名 qfclash.eu.org 审批通过后，在仓库 Settings → Pages 绑定自定义域名即可切换，站点内容无需改动。
- 页面内容中英文双语，右上角按钮切换；下载按钮指向官方仓库
  https://github.com/a718983610-sys/FlClash 的 Releases（按平台过滤），不写死版本号。
- **资源版本参数规矩（必守）**：三页 HTML 对本站 CSS/JS 的引用一律带版本
  查询参数（如 `assets/auth.js?v=20261023e`、`assets/style.css?v=20261023d`），
  防止用户浏览器缓存住旧文件。每次改动任何被引用的 CSS/JS，必须在同一次
  提交里把三页中该资源的 `?v=` 参数同步递增（日期＋字母递增，如
  20261023e → 20261023f），不许只改文件不改参数。
- **网页版压缩构建（2026-10-25 起）**：`webapp/index.html` 引用的是压缩产物
  `webapp/assets/app.min.js` / `app.min.css`，源码 `app.js` / `app.css` 保持
  可读不直接引用。改完网页版源码后，发布前必须重跑
  `node webapp/tools/minify.mjs`（首次先 `npm --prefix webapp/tools install`
  装 terser 与 clean-css），把新产物与 `?v=` 标记递增同一次提交，缺一不可。
