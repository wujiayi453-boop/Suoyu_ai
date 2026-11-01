# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

正在求职或准备进入 AI 行业的从业者与应届生。他们需要在短时间内判断哪些岗位、公司与技能方向值得投入，并将职位搜索与学习研究放在同一条工作流中。

## Product Purpose

AI 数据搜索台汇集 AI 岗位、公司、论文、模型与行业资讯，提供统一搜索、分类检索、筛选、详情阅读和本地收藏，帮助用户完成从发现机会到理解要求的连续探索。

## Positioning

以岗位搜索为入口，将职位供给与对应的公司、研究知识、模型和行业动态连在一起的本地可运行 AI 求职搜索引擎。

## Operating Context

用户通常在电脑浏览器中进行多轮关键词搜索、筛选和比较；会从岗位进入公司或相关知识内容，并保存值得后续申请或研究的条目。

## Capabilities and Constraints

- 保留岗位、公司、论文知识、模型、资讯和全局搜索的既有数据与路由能力。
- 保留离线本地索引、可选 Elasticsearch 查询、本地收藏、详情页与现有筛选逻辑。
- 当前项目为原生 HTML、CSS 与 JavaScript；服务入口为 `npm start`（`node src/server.js`）。
- 前端重设计以用户提供的 AI 求职搜索参考项目为交互与视觉依据，不复制其数据或外部资源。

## Brand Commitments

产品中文名称为“AI 数据搜索台”。此次前端定位应明确服务于 AI 求职者与应届生，语言应直接、可信、克制。

## Evidence on Hand

现有离线数据及索引位于 `database/raw/`、`public/js/data.js`、`database/generated/data-full.js`；已有真实岗位、公司、论文、模型和资讯记录。参考界面文件由用户提供，位于 `D:\download\桌面\AI求职类搜索引擎\handoff-search-rebuild\frontend-reference\`。不虚构雇主、岗位数量、薪资或求职成果。

## Product Principles

1. 岗位发现优先，学习和行业信息为求职决策服务。
2. 搜索、筛选和收藏应保持快速、可预期、低认知负担。
3. 数据状态和内容来源应清楚可见，不夸大数据实时性。
4. 在窄屏上保留完整的检索与浏览路径。

