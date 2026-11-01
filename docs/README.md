# AI 数据搜索台

运行 `npm start`（等价于 `node src/server.js`），然后访问 `http://127.0.0.1:4173`。

页面提供五个独立搜索页：岗位、公司、论文知识、模型和资讯，以及一个跨全部内容的统一搜索页。统一搜索会按类型分区，分类页不会混排其他类型。详情页和浏览器本地收藏也包含在内。

浏览器只加载 `public/js/data.js` 中的轻量预览数据。本机服务如配置了 Elasticsearch，会实时查询五类索引；未配置时则使用 `database/generated/data-full.js` 的全量摘要索引。当前 Elasticsearch 配置放在未提交的 `.env` 文件中：`ES_URL`、`ES_API_KEY`、`ES_CA_CERT`，不要把 API Key 写进前端文件或提交到版本库。

岗位页支持方向、来源、城市、经验、学历、类型的交集筛选和三种排序：相关度、来源、时间；公司页支持招聘方向、城市、规模、阶段的交集筛选；资讯页支持分类、来源、技术主题、日期范围或“时间未注明”。论文和资讯页均支持“必须包含 / 任一包含 / 排除”的布尔检索；论文高级检索可添加多条条件，每条可单独限定在标题、作者、摘要、关键词或全文。公司详情包含方向分布、关联岗位与薪资技能聚合；资讯详情按需从原始 JSONL 读取完整正文，论文详情在数据提供全文时显示原文内容。

原始 JSONL 更新后，运行 `npm run build-data`（等价于 `node scripts/build-data.js`）重新生成索引文件。

本项目已将该离线摘要索引接入「AI 求职搜索」的统一 API：从项目根目录运行
`python api_server.py` 后，论文、模型、资讯会出现在原有前端中；执行
`node "AI数据搜索台-离线完整包/scripts/build-data.js"` 即可按本包 `database/raw/` 下的原始
JSONL 重建 `public/js/data.js` 与 `database/generated/data-full.js`，无需修改任何绝对路径。
