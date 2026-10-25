// QFClash 网页版发布压缩（2026-10-25 性能批引入）
// 把 assets/app.js → assets/app.min.js、assets/app.css → assets/app.min.css。
// 源码保持可读、永不改动；线上 webapp/index.html 只引用 .min 版（带 ?v= 缓存
// 标记）。改完 app.js / app.css 后发布前必须重跑本脚本并连同产物一起提交。
//
// 用法：
//   npm --prefix webapp/tools install   # 首次（装 terser / clean-css）
//   node webapp/tools/minify.mjs
// 工具包解析顺序：webapp/tools/node_modules → 环境变量 MINIFY_TOOLS_DIR
// 指向的包目录 → ~/workspace/tools/minify（本机常驻副本）。
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', 'assets');
const roots = [here, process.env.MINIFY_TOOLS_DIR, join(homedir(), 'workspace/tools/minify')].filter(Boolean);
let Terser = null, CleanCSS = null;
for (const root of roots) {
  try {
    const req = createRequire(join(root, 'noop.js'));
    if (!Terser) Terser = req('terser');
    if (!CleanCSS) CleanCSS = req('clean-css');
  } catch (e) { /* 试下一个位置 */ }
  if (Terser && CleanCSS) break;
}
if (!Terser || !CleanCSS) {
  console.error('缺少 terser / clean-css：先执行 npm --prefix webapp/tools install');
  process.exit(1);
}

const banner = '/* QFClash 网页版发布压缩产物，由 webapp/tools/minify.mjs 生成，勿手改；源码见同目录非 .min 文件。 */\n';

const jsSrc = readFileSync(join(assets, 'app.js'), 'utf8');
const jsOut = await Terser.minify(jsSrc, { module: false });
if (jsOut.error) { console.error(jsOut.error); process.exit(1); }
writeFileSync(join(assets, 'app.min.js'), banner + jsOut.code + '\n');

const cssSrc = readFileSync(join(assets, 'app.css'), 'utf8');
const cssOut = new CleanCSS({ level: 1 }).minify(cssSrc);
if (cssOut.errors && cssOut.errors.length) { console.error(cssOut.errors); process.exit(1); }
writeFileSync(join(assets, 'app.min.css'), banner + cssOut.styles + '\n');

for (const f of ['app.js', 'app.min.js', 'app.css', 'app.min.css']) {
  console.log(f, statSync(join(assets, f)).size, 'bytes');
}
