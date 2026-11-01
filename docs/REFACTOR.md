# 重构记录（REFACTOR）— 2026-09-16

将平铺式离线包重组为企业级 Node 项目结构。**原则：保留所有功能、不改业务逻辑、逐行等价迁移、启动方式向后兼容。**

## 一、修改前后目录对比

### 重构前（平铺在根目录，共 32 个业务文件，无 package.json）

```
AI数据搜索台-离线完整包/
├─ index.html                     前端单页
├─ app.js / data.js               前端逻辑 / 浏览器预览数据
├─ calm-polish.css  filters-top.css  home-clean.css  job-search-ui.css
│  jobs-clean.css  news-feed.css  news-simple.css  satisfied-version.css
│  tech-layout.css  topic-themes.css          （10 个 CSS，平铺在根）
├─ server.js                      后端单体（49,870 B，782 行有效代码）
├─ data-full.js                   全量摘要索引（39 MB）
├─ news-offsets.json / paper-offsets.json     正文字节偏移索引
├─ build-data.js / import-elasticsearch.js    构建 / ES 导入脚本
├─ README.md / PRODUCT.md / 打开与配置说明.md  文档
├─ data/                          5 个原始 JSONL（≈1.3 GB）
│  ├─ ai_news_merged.jsonl            (221 MB)
│  ├─ arxiv_papers_fulltext_clean.jsonl (1.02 GB)
│  ├─ companies_clean.jsonl / jobs_clean.jsonl / models_merged.jsonl
├─ mapping/                       5 个 ES 索引映射 JSON
├─ .env / .env.example / .gitignore
└─ 启动.bat                       （内容：node server.js）
```

### 重构后（企业级分层）

```
AI数据搜索台-离线完整包/
├─ package.json                   ★新增：npm start / build-data / import:es / smoke / mock:es
├─ README.md                      ★新增：项目级说明（原 README.md 移入 docs/）
├─ 启动.bat                       改为 node src/server.js（双击行为不变）
├─ .env / .env.example / .gitignore（追加 .refactor/）
├─ public/                        前端静态资源（服务静态根）
│  ├─ index.html
│  ├─ css/  11 个 CSS（原 10 个 + home-studio.css†）
│  └─ js/   app.js  data.js
├─ src/                           后端（27 个模块，由 server.js 逐行等价拆分）
│  ├─ server.js                   进程引导（http.createServer().listen）
│  ├─ app.js                      路由 + 静态服务
│  ├─ config/   paths.js  env.js  constants.js
│  ├─ utils/    http.js  text.js
│  └─ services/ search|detail|facets|index-status|overview|facet-defaults（门面）
│     ├─ local/         data-index.js  search.js  detail.js
│     ├─ fulltext/      offset-reader.js
│     └─ elasticsearch/ client|query|search|detail|facets|overview|
│                       index-status|aggregations|normalize|sort（10 个）
├─ database/
│  ├─ raw/        5 个原始 JSONL（原 data/，未改动）
│  ├─ generated/  data-full.js  news-offsets.json  paper-offsets.json
│  └─ mapping/    5 个 ES 映射（原 mapping/，未改动）
├─ scripts/       build-data.js  import-elasticsearch.js
│                 ★smoke-test.js（冒烟对比）  ★mock-elasticsearch.js（离线 ES Mock）
├─ docs/          README.md  PRODUCT.md  打开与配置说明.md
│                 ★ARCHITECTURE.md（架构说明）  ★REFACTOR.md（本文）
├─ logs/          ★运行与验证日志（已 gitignore）
└─ .refactor/     ★重构辅助脚本 + legacy/server.js 存档（已 gitignore）

† home-studio.css 为当日另一并行前端任务（首页重设计）新增，非本次重构产物。
★ = 重构新增
```

## 二、每个移动文件说明（32 项）

### 前端 → `public/`（13 项）
| 原路径 | 新路径 | 说明 |
| --- | --- | --- |
| `index.html` | `public/index.html` | 内容改动：12 处资源引用加 `css/`、`js/` 相对前缀（10 link + 2 script），其余逐字节保留 |
| `app.js` | `public/js/app.js` | 重构未改内容（当日并行前端任务改写过首页逻辑，与重构无关） |
| `data.js` | `public/js/data.js` | 未改动（199,916 B，浏览器预览数据） |
| `calm-polish.css` | `public/css/calm-polish.css` | 未改动 |
| `filters-top.css` | `public/css/filters-top.css` | 未改动 |
| `home-clean.css` | `public/css/home-clean.css` | 未改动；首页重设计后已无引用，保留在包内供回退 |
| `job-search-ui.css` | `public/css/job-search-ui.css` | 未改动 |
| `jobs-clean.css` | `public/css/jobs-clean.css` | 未改动 |
| `news-feed.css` | `public/css/news-feed.css` | 未改动 |
| `news-simple.css` | `public/css/news-simple.css` | 未改动 |
| `satisfied-version.css` | `public/css/satisfied-version.css` | 未改动 |
| `tech-layout.css` | `public/css/tech-layout.css` | 未改动 |
| `topic-themes.css` | `public/css/topic-themes.css` | 未改动 |

### 后端 → `src/`（1 项，拆分为 27 个模块）
| 原路径 | 新路径 | 说明 |
| --- | --- | --- |
| `server.js`（49,870 B） | `src/`（27 个文件） | 782 行有效代码逐行等价拆分；773 行逐字保留，仅 9 行因路径/引导必然调整（见第三节）。**原件完整存档于 `.refactor/legacy/server.js`**，`src/` 各文件头注释标注其对应旧行号 |

### 数据 → `database/`（13 项）
| 原路径 | 新路径 | 说明 |
| --- | --- | --- |
| `data-full.js` | `database/generated/data-full.js` | 未改动（39,735,777 B） |
| `news-offsets.json` | `database/generated/news-offsets.json` | 仅改 `source` 字段：原为指向本机兄弟项目《AI求职类搜索引擎》`data\` 的**绝对路径**，改为可移植相对路径 `database/raw/ai_news_merged.jsonl`；8,799 条偏移逐字节保留 |
| `paper-offsets.json` | `database/generated/paper-offsets.json` | 同上，`source` → `database/raw/arxiv_papers_fulltext_clean.jsonl`；5,090 条偏移保留 |
| `data/ai_news_merged.jsonl` | `database/raw/ai_news_merged.jsonl` | 未改动（221,498,930 B） |
| `data/arxiv_papers_fulltext_clean.jsonl` | `database/raw/arxiv_papers_fulltext_clean.jsonl` | 未改动（1,022,182,592 B） |
| `data/companies_clean.jsonl` | `database/raw/companies_clean.jsonl` | 未改动 |
| `data/jobs_clean.jsonl` | `database/raw/jobs_clean.jsonl` | 未改动（24,793,517 B） |
| `data/models_merged.jsonl` | `database/raw/models_merged.jsonl` | 未改动 |
| `mapping/articles.json` | `database/mapping/articles.json` | 未改动 |
| `mapping/companies.json` | `database/mapping/companies.json` | 未改动 |
| `mapping/jobs.json` | `database/mapping/jobs.json` | 未改动 |
| `mapping/models.json` | `database/mapping/models.json` | 未改动 |
| `mapping/news.json` | `database/mapping/news.json` | 未改动 |

### 脚本 → `scripts/`（2 项）
| 原路径 | 新路径 | 说明 |
| --- | --- | --- |
| `build-data.js` | `scripts/build-data.js` | 路径改动：输入 `database/raw/`，输出 `database/generated/` 与 `public/js/data.js`；偏移索引 `source` 记录为相对路径（保证可移植） |
| `import-elasticsearch.js` | `scripts/import-elasticsearch.js` | 路径改动：root 解析到项目根，映射读 `database/mapping/`，数据读 `database/raw/`；用法注释同步更新 |

### 文档 → `docs/`（3 项）
| 原路径 | 新路径 | 说明 |
| --- | --- | --- |
| `README.md` | `docs/README.md` | 文内 7 处路径/命令更新（`npm start`、`public/js/data.js`、`database/generated/data-full.js`、`npm run build-data`、兄弟项目集成命令等）；根目录另建项目级 README |
| `PRODUCT.md` | `docs/PRODUCT.md` | 文内 2 处更新（服务入口、数据位置） |
| `打开与配置说明.md` | `docs/打开与配置说明.md` | 文内 3 处更新（目录保持要求、访问地址说明、目录职责表） |

### 原地保留（4 项）
`.env`（未动，仍被 `src/config/env.js` 读取）、`.env.example`、`.gitignore`（追加 `node_modules/`、`logs/`、`.refactor/`）、`启动.bat`（仅 `node server.js` → `node src/server.js`，GBK 编码按字节保留）。

## 三、后端拆分的 9 处必然改动（其余 773 行逐字保留）

| 旧行号 | 旧代码 | 新位置/新代码 | 原因 |
| --- | --- | --- | --- |
| L7 | `const root = __dirname;` | `src/config/paths.js`：`path.resolve(__dirname,'..','..')` | 代码下沉两级目录，根路径需重算 |
| L20 | 读 `path.join(root,'.env')` | `src/config/env.js`：读 `envFile` 常量 | 统一走 paths.js |
| L37 | 读 `path.join(root,'data-full.js')` | `local/data-index.js`：读 `dataFullFile` | 数据移至 database/generated/ |
| L41 | 读 `path.join(root,'news-offsets.json')` | 读 `newsOffsetsFile` | 同上 |
| L42 | 读 `path.join(root,'paper-offsets.json')` | 读 `paperOffsetsFile` | 同上 |
| L823 | `http.createServer(async (req,res)=>{…})` 内联处理器 | `src/server.js`：`require('./app').requestHandler` | 路由抽为独立模块 |
| L835 | `path.resolve(root, requested)` | `src/app.js`：`path.resolve(publicDir, requested)` | 静态根改为 public/ |
| L837 | `file.startsWith(root)` | `file.startsWith(publicDir)` | 同上（穿越防护边界同步收紧） |
| L840 | `.listen(…)` | `src/server.js`：`.listen(serverPort,'127.0.0.1',…)` | 引导独立成文件 |

## 四、引用路径改动汇总

1. **`public/index.html`**：10 处 `<link href="X.css">` → `href="css/X.css"`；2 处 `<script src="X.js">` → `src="js/X.js"`（均为相对路径，`file://` 直开与 http 服务两用）。
2. **`database/generated/*-offsets.json`**：`source` 绝对路径 → 相对路径（见上表）。`src/services/fulltext/offset-reader.js` 的 `sourcePath()` 本就同时支持绝对/相对（旧 L50-52 逐字保留），因此读取逻辑零改动。
3. **`scripts/build-data.js`**（8 处）、**`scripts/import-elasticsearch.js`**（4 处）：输入输出路径全部改为以项目根解析。
4. **`启动.bat`**：`node server.js` → `node src/server.js`。
5. **docs 三份文档**：共 12 处文内路径/命令更新。
6. **`.gitignore`**：追加 `node_modules/`、`logs/`、`.refactor/`。

## 五、新增文件

| 文件 | 用途 |
| --- | --- |
| `package.json` | npm 入口与脚本（原包无此文件；`npm start` = `node src/server.js`） |
| `README.md`（根） | 项目级快速上手 |
| `scripts/smoke-test.js` | 冒烟测试：抓取 API/静态资源/负例快照并对比（验证工具，不参与业务） |
| `scripts/mock-elasticsearch.js` | 离线 ES Mock（验证工具，不参与业务） |
| `docs/ARCHITECTURE.md` | 架构说明 |
| `docs/REFACTOR.md` | 本文 |
| `logs/` | 运行日志与验证快照（gitignore） |
| `.refactor/` | 重构辅助脚本 + `legacy/server.js` 存档（gitignore） |

## 六、修改后的启动方式

```bash
npm start                 # 推荐；等价于 node src/server.js
node src/server.js        # 直接运行
双击 启动.bat              # 行为与重构前一致：自动打开 http://127.0.0.1:4173
PORT=5000 npm start       # 覆盖端口（.env 的 PORT 亦可）
```

辅助命令：`npm run build-data`（重建索引）、`npm run import:es`（导入 ES）、`npm run smoke`（冒烟）、`npm run mock:es`（ES Mock）。

> 说明：原包没有 package.json，启动方式是双击 `启动.bat`（内部 `node server.js`）。重构后 `启动.bat` 双击体验完全不变，同时补齐了 npm 标准入口。

## 七、验证结果（证据存于 `logs/smoke/`）

1. **本地模式冒烟**（before: 原 server.js @4173；after: src/server.js @4173）：
   94 个用例 **68 项完全一致 / 26 项预期差异**。**全部 54 个 API 用例逐字节一致**——含 200 KB 论文详情与 22 KB 资讯详情正文，证明字节偏移直读 1.3 GB 原始 JSONL 在新路径下分毫不差。
   26 项差异均为预期：index.html 尺寸（38,383→38,402 B，见第八节）、12 个新资源键（`/css/…`、`/js/…`）、13 个旧根级资源键移除、`/server.js` 200→404。
2. **ES 模式冒烟**（重构后服务 @4174 + Mock ES @9911，对照重构前基线）：同样 68/26，`/api/index` 正确返回 `backend:"elasticsearch"`。
3. **ES 请求日志对比**：94 → 94 条请求；第 6–94 条按序逐字节一致；前 5 条为并发 `_count`（到达顺序天然不定，多重集一致）。
4. **静态资源**：index.html 引用的 12 个资源全部 200，sha256 与磁盘文件一致，MIME 正确。
5. **负例/安全**：目录穿越（`/../.env`、`/%2e%2e/.env`）、`.env`、`data-full.js`、偏移索引、未知路由全部 404；`/server.js` 从旧版 200 变为 404（源码不再位于静态根，属安全增强）。
6. **行覆盖审计**：旧版 782 行有效代码中 773 行逐字进入 `src/`，其余 9 行即第三节所列。

## 八、index.html 尺寸差异说明（38,383 → 38,402 B）

冒烟基线抓取（13:57）之后、引用打补丁（15:02）之前，**另一个并行前端任务**对首页做了重设计（新增 `home-studio.css`、移除 `home-clean.css` 引用、品牌文案改为「AI 求职搜索」，记录见 `.workbuddy/memory/2026-09-16.md`）：其改动约 −27 B，本次重构的 12 处路径前缀约 +46 B，合计 +19 B。该差异与重构质量无关。

## 九、可能出现的问题（风险评估）

1. **本地总览趋势为空（原有 bug，按“行为不变”原则原样保留）**：`src/services/overview.js` 的 `localMonthly` 正则 `/(\d{4}-\d{2})/` 双重转义（旧版 L737 逐字一致），本地模式 `/api/overview` 的 trend 恒为空数组。修复只需改一处正则，但会改变 API 输出，故本次未动，留待业务决策。
2. **偏移索引 `source` 语义变化**：旧值是指向兄弟项目目录的绝对路径（包外依赖，目录不在则详情 404 风险）；新值是包内相对路径，离线包自此自包含。若有外部工具直接消费这两个 JSON 的 `source` 字段，需适配。
3. **兄弟项目《AI求职类搜索引擎》集成方式**：原先执行 `node "AI数据搜索台-离线完整包/build-data.js"` 的调用需改为 `node "AI数据搜索台-离线完整包/scripts/build-data.js"`（docs/README.md 已更新示例）。
4. **ES 模式仅对 Mock 验证**：本机没有运行真实 Elasticsearch（`.env` 指向 localhost:9200 未启动，服务自动回退本地，属设计内行为）。真机 ES 上线后建议跑一次 `npm run smoke`。
5. **`GET /server.js` 由 200 变 404**：静态根收紧为 `public/`，后端源码不再可被下载（安全增强）。若有脚本依赖该 URL 取源码，需改从磁盘读取。
6. **`home-clean.css` 已废弃但仍随包**：无引用、仅供回退；后续前端清理时可删除。
7. **启动仍需 `vm` 载入 39 MB `data-full.js`**：启动耗时与内存占用与重构前完全一致（未优化，属行为等价约束）。
8. **并行前端开发约定**：新资源必须放 `public/css/`、`public/js/`，并在 `public/index.html` 用 `css/…`、`js/…` 相对前缀引用（根相对 `/css/…` 在 `file://` 直开时会失效）。
9. **旧单体存档位置**：`.refactor/legacy/server.js`。`src/` 文件头注释中的 “legacy server.js L###” 均指该文件行号；`.refactor/` 已 gitignore，克隆仓库者无此存档。
10. **端口占用**：服务固定绑定 `127.0.0.1`；4173 被占时用 `PORT=…` 覆盖，或先结束占用进程。

## 十、回滚方式

项目无 git 仓库。如需回滚：将 `public/` 下前端文件移回根目录并还原 index.html 的 12 处前缀、`database/raw|generated|mapping` 移回 `data/`+根目录、`scripts/` 两脚本移回根、`docs/` 三文档移回根、`启动.bat` 改回 `node server.js`，或直接以 `.refactor/legacy/server.js` 为准恢复旧单体（该文件从未被修改）。

## 十一、附注：验证后前端资源状态变化（2026-09-16 15:45 复核）

本次重构的验证快照（`logs/smoke/after-local.json`）采集于 15:18，当时 `public/index.html` 引用 12 个资源、全部 200 且 sha256 与磁盘一致。

其后**并行前端任务**继续改动了首页样式（非本次重构范围），截至 15:45 复核：

- `public/css/home-studio.css` 已被该任务删除，`index.html` 亦不再引用它；
- `index.html` 现引用 **13 个资源**（11 个 CSS + `js/data.js` + `js/app.js`），逐个 HTTP 探测**全部 200**，无 404；
- `css/home-clean.css`(15:32)、`css/news-detail.css`(15:38) 等文件被该任务改写，因此第九节第 6 条「home-clean.css 已废弃」的结论已过时——它重新被引用，**不可删除**。

结论：本次重构未触碰 `public/` 下任何文件内容（除 index.html 的 12 处路径前缀），上述变化全部来自并行前端任务；重构后的静态服务与目录约定运转正常。
