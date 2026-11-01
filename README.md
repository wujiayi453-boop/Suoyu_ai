# 索yu

找机会，读新知。岗位、公司、论文、模型与资讯，在这里一起探索。

## 已经有完整项目？直接打开，不用重新下载

只需要安装 [Node.js LTS](https://nodejs.org/)（最低版本 18）。**不需要 GitHub Desktop，不需要安装数据库，也无需 npm install。**

| 打开方式 | 怎么操作 | 怎么停止 |
| --- | --- | --- |
| 双击启动（Windows） | 在项目文件夹双击 `启动.bat`，浏览器自动打开 | 关闭启动窗口 |
| VS Code 一键运行 | 文件 → 打开文件夹，选择包含 package.json 的项目根目录；按 F5，选择“索yu：一键启动” | 按 Shift+F5 |
| VS Code 任务 | 终端 → 运行任务 → 索yu：启动网站 | 终止该任务 |
| 终端启动 | 在项目根目录运行 `npm run open` | 按 Ctrl+C |
| 固定端口启动 | 运行 `npm start`，浏览器打开 http://127.0.0.1:4173/ | 按 Ctrl+C |

前四种方式会检查完整数据、自动选择空闲端口；Windows 上会自动打开浏览器，其他系统请打开终端显示的网址。固定端口方式适合已确认数据齐全的使用者。

VS Code 如果询问是否信任文件夹，请在确认来源可信后选择信任。不需要 Live Server；不要直接打开 public/index.html，否则搜索和详情接口无法正常工作。

## 首次下载（无需 GitHub Desktop）

已有完整文件夹的用户跳过本节。首次获取完整项目需要 [Git](https://git-scm.com/downloads) 和 [Git LFS](https://git-lfs.com/)。Git for Windows 通常包含 Git LFS。

在 VS Code 的“终端 → 新建终端”中依次运行：

```bash
git lfs install
git clone --depth 1 https://github.com/wujiayi453-boop/Suoyu_ai.git
cd Suoyu_ai
git lfs pull
npm run open
```

`--depth 1` 只获取最新版本，避免下载旧提交历史。完整原始数据约 1.3 GB，本地完整运行仍需保存这些数据；Git/LFS 还会保留缓存，请预留至少 4 GB 空间。首次下载完成后，平时启动不会重复下载已有完整数据。

也可以使用 VS Code 的“Git: Clone”命令克隆仓库，再打开下载好的文件夹；这种方式同样需要 Git 和 Git LFS，并可能获取更多历史。

不推荐只用 **Download ZIP**：源码压缩包可能只有 LFS 占位符，无法保证完整正文。启动器会识别此情况并提示，不会把占位数据当成完整数据运行。

## 更新项目

关闭正在运行的网站。在项目根目录的终端依次运行 `git pull --ff-only` 和 `git lfs pull`，然后重新启动。有自己修改的代码时，先保存或提交更改；遇到冲突不要直接覆盖文件。

## 常见问题

- **没有 Node.js**：双击启动会打开官网；安装 LTS 后重新启动。
- **数据未下载完整**：在克隆的项目里，启动器会尝试执行 Git LFS 下载；失败时检查 Git/LFS 和网络，再重试。
- **网页没有自动打开**：复制终端显示的网址。自动启动使用空闲端口，每次可能不同。
- **固定端口被占用**：使用 `npm run open` 或 F5 启动。
- **关闭终端后打不开网页**：重新启动网站，运行期间保留启动窗口。

内容、搜索和关联功能使用完整本地数据。外部封面图片和来源链接仍需要网络。启动器不会自动安装软件或修改系统设置。

---
## 开发与维护

以下内容面向需要修改代码的人；普通使用者无需操作。
# AI 数据搜索台（离线完整包）

岗位 / 公司 / 论文 / 模型 / 资讯五类内容的本地检索台。零第三方依赖，只用 Node 内置模块。

## 启动

```bash
npm start          # 等价于 node src/server.js
```

或者直接双击 `启动.bat`（检查数据后使用空闲端口并自动打开浏览器）。

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



