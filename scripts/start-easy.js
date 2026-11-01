'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync, execFile } = require('child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
function fail(message) { console.error('\n' + message); process.exit(1); }
if (Number(process.versions.node.split('.')[0]) < 18) fail('请安装 Node.js 18 或更高版本后重试：https://nodejs.org/');
const { rawDir, dataFullFile, newsOffsetsFile, paperOffsetsFile } = require('../src/config/paths');
const files = ['ai_news_merged.jsonl', 'arxiv_papers_fulltext_clean.jsonl', 'companies_clean.jsonl', 'jobs_clean.jsonl', 'models_merged.jsonl'].map(name => path.join(rawDir, name));
function ready(file) {
  if (!fs.existsSync(file)) return false;
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(150);
    const size = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return size > 0 && !buffer.toString('utf8', 0, size).startsWith('version https://git-lfs.github.com/spec/v1');
  } finally { fs.closeSync(fd); }
}
console.log('索yu · 正在检查启动环境…');
if (!files.every(ready)) {
  if (!fs.existsSync(path.join(root, '.git'))) fail('数据尚未下载完整。请按照 README 使用 Git 和 Git LFS 克隆完整仓库，再双击启动或在 VS Code 中按 F5。具体步骤见 README.md；请勿只下载源码 ZIP。');
  console.log('首次使用需要下载约 1.3 GB 数据，请保持联网并等待。可能需要登录 GitHub。');
  const result = spawnSync('git', ['lfs', 'pull'], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0 || !files.every(ready)) fail('数据下载未完成。请确认 Git 和 Git LFS 已安装、GitHub 账号有仓库访问权限，然后重新双击启动。已下载的数据会保留。');
}
if (![dataFullFile, newsOffsetsFile, paperOffsetsFile].every(ready)) fail('项目索引文件缺失，请重新下载完整项目，不要移动 database 文件夹。');
if (process.argv.includes('--check')) { console.log('环境和数据检查通过。'); process.exit(0); }
const { requestHandler } = require('../src/app');
const server = http.createServer(requestHandler);
server.on('error', error => fail('启动失败：' + error.message));
server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`\n索yu已启动：${url}\n请保持此窗口打开。关闭此窗口即可停止网站。\n网页未自动打开时，可复制上面的地址到浏览器。`);
  if (process.platform === 'win32') execFile('explorer.exe', [url], () => {});
});

