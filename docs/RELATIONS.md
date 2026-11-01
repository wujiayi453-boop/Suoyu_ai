# 内容关联规则

运行 `npm run audit:relations` 生成 `database/quality/relations-report.json` 和 `entity-aliases.json`。检查遍历全量索引，可能耗时数分钟。

实体别名来自公司/模型标题、有有效 companyId 的岗位公司名，以及公司源文件的 aliases、name_legal、name_normalized、company_key 字段。只进行 Unicode NFKC、大小写和空白标准化，不猜测简称，不移除公司后缀。每条别名保留来源字段及记录 ID。同一名称对应多个实体时，不自动选择；报告 ambiguous 列出这些情况。源文件别名属于数据集原有归并口径，不代表独立核验的法律实体等同性。

岗位与公司通过 ID 双向关联。资讯 companies/models 字段通过唯一名称或别名匹配实体；公司、模型详情也可回到提及它们的资讯。其他跨类别内容至少共享两个非通用标签才建立“共同主题”关系，这不代表引用、使用或合作事实。

覆盖率以展示截断前的完整关系为准：linked 为有任何关联的记录数，factual 为有 ID/提及关系的记录数，topicalOnly 为只有共同标签的记录数。页面按类型最多显示三条，总数最多十二条，因此反向关系存在不保证在热门实体的首屏出现。

unlinked 为未关联记录；unresolved 为无法匹配的资讯实体提及；invalidReferences 为不存在的公司 ID。所有这些项目均保留，不删除源数据，也不通过模糊匹配提高覆盖率。
