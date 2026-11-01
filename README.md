# 索yu

找机会，读新知。岗位、公司、论文、模型与资讯，在这里一起探索。

### 第一次使用（只做一次）

1. 安装 [Node.js](https://nodejs.org/)：选择 **LTS** 版本，安装时保持默认选项。已经安装 18 或更高版本可跳过。
2. 安装并登录 [GitHub Desktop](https://desktop.github.com/)。本仓库已公开，任何人都可以查看和下载。
3. 在本仓库网页点击绿色 **Code → Open with GitHub Desktop**，选择保存位置，再点 **Clone**。也可在 Desktop 中点 **File → Clone repository → URL**，填写 `https://github.com/wujiayi453-boop/Suoyu_ai`。
4. 等待下载结束。完整数据约 **1.3 GB**，请预留至少 **4 GB** 磁盘空间。
5. 在 Desktop 中点 **Repository → Show in Explorer**，找到并双击 **启动.bat**（隐藏扩展名时显示为“启动”）。

网页会在服务准备好后自动打开。**请保留启动窗口；关闭窗口即可停止网站。** 不要双击 public/index.html，也不要移动 database 文件夹。

### 以后怎么打开？

直接双击文件夹里的 **启动.bat** 即可，不用每次打开 GitHub Desktop。可以右键启动文件，创建快捷方式放在桌面；不要把启动文件本身移出去。

### 怎么更新？

先关闭启动窗口。在 GitHub Desktop 中选择此仓库，点 **Fetch origin**，有更新时再点 **Pull origin**。下载完成后重新双击启动。

### 打不开时

| 看到的情况 | 怎么处理 |
| --- | --- |
| 打开了 Node.js 官网 | 安装 LTS 版本，安装结束后重新双击启动 |
| 提示数据未下载完整 | 保持联网；启动器会尝试下载。若提示找不到 Git，请安装 Git for Windows（含 Git LFS），再重试 |
| 提示没有权限或找不到仓库 | 本仓库已公开；检查网址和网络连接，必要时重新登录 GitHub Desktop |
| 网页没有自动弹出 | 复制启动窗口里显示的网址到浏览器，端口每次可能不同 |
| 下载的是 ZIP，提示数据缺失 | 改用上面的 GitHub Desktop 下载方式；源码 ZIP 可能只有大文件占位符 |
| 关闭窗口后网页无法访问 | 再次双击启动；这是本地运行的网站 |

启动器不会自动安装软件或修改系统设置。数据齐全后无需联网下载即可启动；外部图片和来源链接仍需要网络。

[GitHub Desktop 官方下载说明](https://docs.github.com/en/desktop/adding-and-cloning-repositories/cloning-and-forking-repositories-from-github-desktop)

---

## 开发与维护

以下内容面向需要修改代码的人；普通使用者无需操作。
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


