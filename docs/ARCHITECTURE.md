# 架构说明（ARCHITECTURE）

本项目是一个**零第三方依赖**的 Node 检索服务：只用 Node 内置模块（`http`/`https`/`fs`/`path`/`vm`）。
后端支持两种数据源——**本地全量索引**（默认）与**可选的 Elasticsearch**，两者对上层暴露统一的 API。
前端是 `public/` 下的单页应用，只加载轻量预览数据 `public/js/data.js`。

## 分层结构

```
                 ┌──────────────────────────────┐
   HTTP 请求 ──▶ │ src/server.js  (进程引导)      │  http.createServer().listen(PORT,127.0.0.1)
                 └───────────────┬──────────────┘
                                 ▼
                 ┌──────────────────────────────┐
                 │ src/app.js  (路由 + 静态服务)  │  /api/* 分发；其余走 public/ 静态文件
                 └───────────────┬──────────────┘
                                 ▼
        ┌────────────────────────────────────────────────┐
        │ src/services/*  (门面层 facade)                  │
        │  search / detail / facets / index-status /       │  esEnabled ? ES : 本地；ES 抛错自动回退本地
        │  overview                                        │
        └───────┬───────────────────────────┬────────────┘
                ▼                           ▼
   ┌────────────────────────┐   ┌──────────────────────────┐
   │ services/local/*        │   │ services/elasticsearch/*  │
   │  data-index (启动载入)   │   │  client/query/search/     │
   │  search (内存过滤)       │   │  detail/facets/overview/  │
   │  detail (关联装配)       │   │  index-status/aggregations│
   └───────────┬────────────┘   │  /normalize/sort          │
               ▼                └────────────┬─────────────┘
   ┌────────────────────────┐               ▼
   │ services/fulltext/      │        Elasticsearch 集群
   │  offset-reader          │        (articles/companies/
   │  按字节偏移直读 raw JSONL │         jobs/models/news _v2)
   └───────────┬────────────┘
               ▼
   database/raw/*.jsonl (≈1.3 GB)

   横向支撑： src/config/{paths,env,constants}   src/utils/{http,text}
```

## 模块职责

每个 `src/` 文件头部都注明了它对应旧版单体 `server.js` 的行号，便于逐行对照。

### 引导与路由
| 文件 | 职责 | 旧版行号 |
| --- | --- | --- |
| `src/server.js` | 进程引导：`http.createServer(requestHandler).listen(PORT,'127.0.0.1')` | L840 |
| `src/app.js` | HTTP 路由器 + 静态文件服务；5 条 API 路由 + `public/` 兜底 | L823–L839 |

### 配置（`src/config/`）
| 文件 | 职责 | 旧版行号 |
| --- | --- | --- |
| `paths.js` | 磁盘路径唯一真相源（root/public/database/raw/generated/mapping/各数据文件） | 新增（重构抽取） |
| `env.js` | `.env` 解析 + 运行期配置（esUrl/esApiKey/esCa/serverPort/esIndices/esEnabled）；优先级 `process.env` > `.env` | L9–L18, L20–L34 |
| `constants.js` | 字段映射（idFields/sourceFields/searchFields）、静态 facet 选项、排序权重 | L174–L210 |

### 工具（`src/utils/`）
| 文件 | 职责 | 旧版行号 |
| --- | --- | --- |
| `http.js` | `contentType` 扩展名映射 + `json(res,value,status)` 响应写入器 | L43, L818–L821 |
| `text.js` | 文本归一化：`asText` / `asList` / `unique` / `firstText` | L215–L232 |

### 门面层（`src/services/*.js`）
统一模式：**未配置 ES 直接走本地；配置了 ES 则优先 ES，`catch` 到任何异常自动回退本地**。
| 文件 | 职责 | 旧版行号 |
| --- | --- | --- |
| `search.js` | 搜索入口，附 `backend:'local'` 标记 | L559–L566 |
| `detail.js` | 详情入口（按 type/id） | L645–L652 |
| `facets.js` | 筛选面板聚合入口 | L720–L724 |
| `index-status.js` | 索引状态入口（各源计数） | L666–L673 |
| `overview.js` | 运营总览入口 + 本地聚合（`localBucket`/`localMonthly`/`overviewLocal`） | L726–L739, L760–L785, L812–L816 |
| `facet-defaults.js` | ES 不可用时的静态 facet 兜底值 | L685–L690 |

### 本地实现（`src/services/local/`）
| 文件 | 职责 | 旧版行号 |
| --- | --- | --- |
| `data-index.js` | 启动时用 `vm` 载入 `database/generated/data-full.js`，构建 `records[]` 与 `byTypeAndId` Map，载入两个偏移索引；`slim()` 去 detail | L35–L42, L45–L48 |
| `search.js` | 内存过滤（`matchingRecords`）+ 分页/分组（`localSearch`） | L54–L84 |
| `detail.js` | 本地详情装配：公司→关联岗位、岗位→公司、资讯/论文→全文 | L158–L172 |

### 全文直读（`src/services/fulltext/`）
| 文件 | 职责 | 旧版行号 |
| --- | --- | --- |
| `offset-reader.js` | 依据偏移索引从 `database/raw/*.jsonl` **按字节偏移精确读取**单条正文（`loadNewsArticle`/`loadPaperArticle`/`readOffsetRecord`/`sourcePath`） | L50–L52, L86–L156 |

### Elasticsearch 实现（`src/services/elasticsearch/`）
| 文件 | 职责 |
| --- | --- |
| `client.js` | 原生 `http/https` 客户端，`ApiKey` 认证，8s 超时，非 2xx 抛错（L234–L270） |
| `query.js` | 查询 DSL 构建（多字段加权、布尔检索、过滤） |
| `search.js` / `detail.js` | ES 搜索 / 详情 |
| `facets.js` | facet 聚合（60s 内存缓存 `facetCache`） |
| `overview.js` | 总览聚合（60s 内存缓存 `overviewCache`） |
| `index-status.js` | 各索引文档计数（30s 内存缓存 `esSourceCache`） |
| `aggregations.js` | 聚合 DSL 构建器 |
| `normalize.js` | ES 命中结果 → 统一记录结构 |
| `sort.js` | 相关度/来源/时间等排序映射 |

## 请求生命周期（以 `GET /api/search?q=x&type=job` 为例）

1. `server.js` 的 http server 收到请求 → `app.js` 的 `requestHandler`。
2. `url.pathname === '/api/search'` → 调 `services/search.js` 的 `search(params)`。
3. 判断 `esEnabled`：
   - 否 → `local/search.js` 的 `localSearch(params)`（对内存 `records[]` 过滤 + 分页），返回 `{code:200,...,backend:'local'}`。
   - 是 → `try` `elasticsearch/search.js`（client→query→ES→normalize）；`catch` 到任何异常 → 回退 `localSearch` 并标 `backend:'local'`。
4. `utils/http.js` 的 `json(res, ...)` 以 `application/json; charset=utf-8` + `Cache-Control:no-store` 写出。

静态请求（非 `/api/`）：`app.js` 在 `publicDir` 下解析文件，命中则按扩展名给 `Content-Type` 并 `no-store` 流式返回，否则 404。

## 缓存策略

| 缓存 | 位置 | TTL | 说明 |
| --- | --- | --- | --- |
| `facetCache`（按 type） | `elasticsearch/facets.js` | 60s | 仅 ES 模式 |
| `overviewCache` | `elasticsearch/overview.js` | 60s | 仅 ES 模式 |
| `esSourceCache` | `elasticsearch/index-status.js` | 30s | 仅 ES 模式 |
| 全量索引 `records[]` | `local/data-index.js` | 进程生命周期 | 启动时 `vm` 载入一次，常驻内存 |

本地全文**不缓存**：每次详情请求按字节偏移直接读磁盘，避免把 1.3 GB 原文载入内存。

## 数据流

- **构建**：`scripts/build-data.js` 从 `database/raw/*.jsonl` 生成三样产物——
  `public/js/data.js`（浏览器轻量预览）、`database/generated/data-full.js`（服务端全量摘要索引，39 MB）、
  `database/generated/{news,paper}-offsets.json`（正文在 raw JSONL 中的字节偏移）。
- **本地检索**：启动载入 `data-full.js` → 内存 `records[]`（22,144 条）；详情按偏移索引从 raw JSONL 直读正文。
- **ES 检索**：`scripts/import-elasticsearch.js` 先把 raw JSONL 批量导入 5 个索引；运行时配置 `.env`（`ES_URL`+`ES_API_KEY`）后走实时查询。

## 配置项（`.env`）

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `PORT` | `4173` | 监听端口 |
| `ES_URL` | 空 | ES 地址；与 `ES_API_KEY` 同时存在才启用 ES |
| `ES_API_KEY` | 空 | ES ApiKey |
| `ES_CA_CERT` | 空 | HTTPS CA 证书路径（存在才读取） |
| `ES_ARTICLES_INDEX` 等 5 个 | `articles_v2`/`companies_v2`/`jobs_v2`/`models_v2`/`news_v2` | 各类型索引名 |

## 静态服务与安全

- 只服务 `public/` 下的文件；`app.js` 用 `file.startsWith(publicDir)` 防目录穿越。
- 拒绝点开头文件（`.env` 等）与显式黑名单 `data-full.js`/`news-offsets.json`/`paper-offsets.json`（服务端数据绝不外泄）。
- 重构后静态根仅为 `public/`，因此 `GET /server.js` 由旧版的 200 变为 404（源码不再位于静态根下，属安全增强）。