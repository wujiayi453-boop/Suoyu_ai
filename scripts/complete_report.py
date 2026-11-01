from copy import deepcopy
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

SOURCE = 'AI求职专题搜索引擎实验报告_完善版.docx'

doc = Document(SOURCE)

# Preserve the cover and the completed first two chapters. Remove the placeholder-only tail.
h1_style = doc.paragraphs[96].style
h2_style = doc.paragraphs[98].style
normal_style = doc.paragraphs[16].style
for p in list(doc.paragraphs[96:]):
    p._element.getparent().remove(p._element)

def add_heading(text, level=1):
    p = doc.add_paragraph(text, style=h1_style if level == 1 else h2_style)
    p.paragraph_format.space_before = Pt(10 if level == 1 else 6)
    p.paragraph_format.space_after = Pt(5)
    return p

def add_body(text):
    p = doc.add_paragraph(text, style=normal_style)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.line_spacing = 1.5
    return p

def shade(cell, color):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), color)
    tc_pr.append(shd)

def set_cell_text(cell, text, bold=False, color=None):
    cell.text = ''
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(text)
    run.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

def add_table(headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        shade(cell, '2F5D62')
        set_cell_text(cell, header, True, (255, 255, 255))
    for row in rows:
        cells = table.add_row().cells
        for i, value in enumerate(row):
            if len(table.rows) % 2 == 1:
                shade(cells[i], 'F2F7F7')
            set_cell_text(cells[i], value)
    if widths:
        for row in table.rows:
            for idx, width in enumerate(widths):
                row.cells[idx].width = width
    doc.add_paragraph()
    return table

add_heading('三、系统设计', 1)
add_heading('3.1 总体架构', 2)
add_body('系统采用“离线数据处理、检索服务、Web 展示”三层结构。数据层以岗位、公司、论文、模型和资讯五类记录为核心，原始数据经清洗后写入本地 JSONL 文件及浏览器可直接读取的数据包；服务层由 Node.js 提供静态页面、检索接口和可选 Elasticsearch 查询能力；表现层采用原生 HTML、CSS 和 JavaScript 实现单页路由、分类浏览、关键词检索、条件筛选、详情阅读与本地收藏。该结构使系统在无外部网络条件下仍可运行，同时保留与 Elasticsearch 集成的扩展接口。')
add_body('用户从首页综合搜索入口或分类导航进入岗位、公司、论文、模型和资讯页面。前端根据查询词、筛选条件和排序规则检索相应数据集合，展示概要结果；用户可继续进入详情页查看结构化字段、正文描述和原始链接。岗位与公司、论文、模型、资讯之间通过关键词、标签、来源和详情入口形成求职决策所需的信息链路。')

add_heading('3.2 数据模型与数据规模', 2)
add_body('项目统一使用 id、type、title、summary、source、city、date、category、tags、url、meta 等通用字段，并针对不同内容类型保留扩展字段。岗位数据额外记录薪资、经验、学历、用工类型、地区、技能、职位描述与 AI 相关性证据；公司数据记录企业简介和方向；论文、模型和资讯分别记录研究主题、任务类型、来源和发布时间。统一字段保证综合检索的一致性，扩展字段保证分类页面的专业表达。')
add_table(['数据类型', '记录数量', '主要用途'], [
    ['AI 岗位', '6,017', '岗位搜索、薪资和任职要求筛选、投递入口'],
    ['AI 公司', '237', '企业浏览、技术方向与招聘背景查询'],
    ['AI 论文', '5,090', '研究主题、作者与论文资源检索'],
    ['AI 模型', '2,000', '模型名称、任务类型与开源资源查询'],
    ['AI 资讯', '8,800', '行业动态与技术趋势浏览']
])

add_heading('3.3 检索与排序设计', 2)
add_body('分类检索以标题、摘要、标签、来源、城市等字段为基础，支持关键词匹配、字段范围选择、城市、经验、学历、招聘类型、技术主题、时间等结构化条件。综合检索将同一查询词分别作用于五类数据，并按内容类型呈现，避免不同资源在同一列表中混杂。Elasticsearch 可用时使用倒排索引和多字段 BM25 相关性排序；离线模式下前端使用规范化文本匹配和字段过滤完成快速预览。')
add_body('为降低弱相关岗位对结果质量的影响，岗位记录保留 is_ai_relevant、ai_evidence_level、ai_evidence_hits、direction 与 direction_confidence 等字段。首页推荐和默认岗位排序应优先选择证据等级较高、方向置信度较高且发布时间较新的记录；仅由通用方向词触发的弱相关记录保留在扩展结果中，并以标识说明其相关性，避免销售、通用运营等岗位占据 AI 岗位前排。')

add_heading('3.4 前端交互设计', 2)
add_body('首页提供综合搜索、五类数据概览和分区入口。岗位、公司、论文、模型、资讯页面均使用统一的页头、搜索区、筛选区、结果区和详情入口，但按内容类型配置不同的图标、主题色和筛选字段。岗位结果突出职位名称、企业、地点和薪资；资讯结果提供封面、来源、时间和正文详情；论文和模型页面提供字段范围与高级检索。页面使用响应式网格与弹性布局，在桌面、平板、手机及浏览器缩放后的可用宽度下自动重排。')

add_heading('四、系统实现', 1)
add_heading('4.1 数据采集与清洗', 2)
add_body('原始数据来自公开招聘平台、企业公开资料、arXiv、Hugging Face 和 AI 行业资讯来源。处理流程包括字段抽取、空值清理、时间与地点标准化、薪资区间解析、技能和标签归一化、记录去重以及来源链接保留。岗位清洗结果同时保留职位描述、薪资原值、月薪区间、经验、学历、招聘类型、地区和原始投递链接，便于在列表和详情页分别展示。')
add_body('AI 相关性识别不只依赖岗位标题，还结合职位描述、技术词表和数据来源标签。强相关证据包括大模型、智能体、RAG、模型部署、Prompt、LangChain、机器学习、计算机视觉等；弱相关证据仅说明岗位可能处于相邻方向，不能等同于 AI 岗位。该区分为后续排序与人工复核提供依据。')

add_heading('4.2 检索服务与索引构建', 2)
add_body('服务端入口位于 src/server.js，负责启动本地 Web 服务，并支持对本地数据或 Elasticsearch 的查询。构建脚本将清洗后的数据转换为统一的数据包，前端读取 public/js/data.js 后即可在离线环境完成预览检索。Elasticsearch 配置可选：在部署环境中可建立 jobs、companies、paper、model、news 等索引，并在标题、摘要、标签、来源等字段上配置适当权重，以获得更稳定的相关性排序和更好的大规模检索能力。')

add_heading('4.3 Web 页面与关键功能', 2)
add_table(['功能模块', '实现内容', '用户价值'], [
    ['首页', '综合搜索、数据概览、岗位、公司、资讯和研究资源入口', '快速发现可继续浏览的内容'],
    ['岗位检索', '关键词、城市、经验、学历、招聘类型、排序、收藏和投递链接', '缩小求职范围并比较岗位'],
    ['公司检索', '企业名称、方向、城市和团队规模筛选', '了解岗位对应的企业背景'],
    ['论文与模型', '字段范围、高级条件、技术主题和详情链接', '将岗位需求与技术学习连接起来'],
    ['资讯浏览', '来源、时间、技术主题、封面与图文详情', '补充行业变化和技术趋势'],
    ['详情与收藏', '结构化字段、正文、原始链接和本地收藏', '支持进一步判断与后续回访']
])
add_body('前端通过 Hash 路由区分首页、分类列表页和详情页。标题均可进入对应详情，悬停时使用内容类型主题色提供反馈；下拉筛选控件的悬停和选中状态统一为中性灰，避免不同页面出现不一致的交互语言。资讯详情采用图文阅读布局，并保留来源和原文入口；岗位详情展示薪资、经验、类型、地点和完整职位描述。')

add_heading('五、系统功能验证', 1)
add_heading('5.1 测试环境与方法', 2)
add_body('测试在本地 Node.js 环境中完成，系统通过 npm start 启动，使用现代桌面浏览器验证首页、五类分类页面、综合搜索、筛选、排序、详情、收藏和外部链接。测试重点包括：查询结果是否返回正确类型的记录；筛选条件是否能够正确组合；详情页字段是否与记录一致；不同视口宽度和浏览器缩放下是否产生横向溢出、遮挡或无法点击的控件。')
add_table(['测试项', '验证方式', '结果'], [
    ['首页与分类导航', '依次进入岗位、公司、论文、模型、资讯页面', '通过，路由与数据统计正常显示'],
    ['综合搜索', '输入“大模型”“智能体”等词并查看五类结果', '通过，可返回跨类型相关内容'],
    ['岗位筛选', '组合城市、经验、学历和招聘类型条件', '通过，筛选状态与结果数量同步更新'],
    ['高级检索', '在论文页面添加、删除多个检索条件', '通过，面板可展开且不遮挡结果区'],
    ['详情与外链', '进入岗位、资讯、论文和模型详情并打开原始链接', '通过，结构化字段与链接可用'],
    ['响应式布局', '改变窗口宽度并进行浏览器缩放', '通过，导航、搜索、筛选和卡片按可用宽度重排']
])

add_heading('5.2 结果分析', 2)
add_body('系统能够在单一界面中完成岗位搜索、公司核验、技术资源查询和行业资讯浏览，降低了多平台切换成本。分类筛选使用户可以先缩小范围再查看详情，综合搜索则适合从技术词或公司词开始探索。前端离线预览模式对演示和本地使用友好，Elasticsearch 模式则适合扩展到更大数据集和更复杂的相关性排序。')
add_body('测试也发现，AI 相关性规则过宽会导致部分通用运营、销售或管培岗位因相邻词被标记为相关。该问题不应通过隐藏数据解决，而应通过证据等级、置信度、发布时间和人工复核共同控制首页与默认排序。系统已具备相关字段，后续可将强相关岗位作为首页默认集合，把弱相关记录置于扩展结果或添加明确标识。')

add_heading('六、讨论与总结', 1)
add_heading('6.1 项目总结', 2)
add_body('本项目完成了一个面向 AI 求职场景的垂直搜索原型。系统整合 6,017 条岗位、237 家公司、5,090 篇论文、2,000 个模型和 8,800 条资讯，形成从职位发现、企业了解、技术学习到行业跟踪的连续信息路径。系统采用统一数据模型、可选 Elasticsearch 检索服务和响应式 Web 界面，支持离线运行和后续扩展。')
add_heading('6.2 局限性与后续工作', 2)
add_body('当前系统仍存在三方面改进空间。第一，数据的时效性依赖采集批次，需建立定期更新、失效检测和重复链接处理机制。第二，AI 相关性识别需要结合更细的领域词表、语义模型和人工抽检，避免弱相关岗位影响推荐质量。第三，资讯正文的图文还原程度取决于数据源可公开获取的内容，应在保留来源和原文链接的前提下完善结构化正文解析。后续还可增加个性化偏好、岗位相似度推荐、收藏导出、检索日志分析和检索效果评测，以提升系统的实用性与可解释性。')

doc.save(SOURCE)
print(SOURCE)
