# 索yu · AI 数据搜索平台

## 从 GitHub 下载完整项目

原始数据通过 Git LFS 保存，请先安装 Git LFS，然后运行：

```bash
git lfs install
git clone https://github.com/wujiayi453-boop/Suoyu_ai.git
cd Suoyu_ai
git lfs pull
npm start
```

使用 Node.js 18 或更高版本。打开 http://127.0.0.1:4173/ 。运行服务无需安装第三方依赖；浏览器验证脚本另需 puppeteer-core 和 Chrome。不要仅下载不含 LFS 数据的源码压缩包，否则全文详情无法正常读取。
# AI 数据搜索台（离线完整包）

岗位 / 公司 / 论文 / 模型 / 资讯五类内容的本地检索台。零第三方依赖，只用 Node 内置模块。

## 启动

```bash
npm start          # 等价于 node src/server.js
```

或者直接双击 `启动.bat`（会自动打开 http://127.0.0.1:4173 ）。

端口可用环境变量覆盖：`PORT=5000 npm start`。

## 目录结构

```
public/     前端静态资源（index.html、css/、js/），由服务直接对外提供
src/        后端代码（config / utils / services / app.js / server.js）
database/   raw/ 原始 JSONL、generated/ 构建产物、mapping/ ES 映射
scripts/    数据构建、ES 导入、冒烟测试、ES Mock
docs/       产品说明、使用说明、架构与重构记录
logs/       运行与验证日志
```

## 数据流

1. 未配置 Elasticsearch 时：服务启动加载 `database/generated/data-full.js` 全量摘要索引，
   详情页按 `database/generated/*-offsets.json` 的字节偏移，从 `database/raw/*.jsonl` 直读正文。
2. 配置了 `.env`（`ES_URL` + `ES_API_KEY`）时：走 Elasticsearch 实时查询，失败自动回退本地索引。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm start` | 启动服务（http://127.0.0.1:4173） |
| `npm run build-data` | 从 `database/raw/` 重建 `public/js/data.js`、`database/generated/data-full.js` 与两个偏移索引 |
| `npm run import:es` | 把原始 JSONL 导入本机 Elasticsearch（需要 `ES_ADMIN_PASSWORD`） |
| `npm run smoke` | 冒烟测试，抓取 API 与静态资源快照 |
| `npm run mock:es` | 启动 Elasticsearch Mock（离线验证 ES 模式用） |

## 文档

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：后端分层、模块职责与请求生命周期
- [docs/REFACTOR.md](docs/REFACTOR.md)：本次企业级目录重构的完整记录（移动清单、引用改动、风险）
- [docs/README.md](docs/README.md)：功能说明
- [docs/PRODUCT.md](docs/PRODUCT.md)：产品定义
- [docs/打开与配置说明.md](docs/打开与配置说明.md)：面向使用者的打开与配置指南

## 注意

- `.env` 不入库（已在 `.gitignore`），不要把 API Key 写进前端文件。
- `database/raw/` 约 1.3 GB，请勿移动或改名。
- 前端新增 CSS/JS 必须放进 `public/css/`、`public/js/`，并在 `public/index.html` 里用 `css/…`、`js/…` 前缀引用。

