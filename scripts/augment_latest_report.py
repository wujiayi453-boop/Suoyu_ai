from pathlib import Path
from copy import deepcopy
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

SOURCE = Path('AI求职专题搜索引擎实验报告_项目完善版.docx')
ASSETS = Path('docs')
doc = Document(SOURCE)

# 从“系统功能验证”起重建，使截图、验证和结论形成完整闭环。
start = next(i for i, p in enumerate(doc.paragraphs) if p.text.strip() == '系统功能验证')
h1_style = doc.paragraphs[86].style
h2_style = doc.paragraphs[87].style
body_style = doc.paragraphs[16].style
for p in list(doc.paragraphs[start:]):
    p._element.getparent().remove(p._element)

def add_heading(text, level=1):
    p = doc.add_paragraph(style=h1_style if level == 1 else h2_style)
    p.add_run(text)
    return p

def add_body(text):
    p = doc.add_paragraph(style=body_style)
    p.paragraph_format.space_after = Pt(6)
    p.add_run(text)
    return p

def shade(cell, color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), color)
    tcPr.append(shd)

def set_cell_text(cell, text, bold=False, color=None):
    cell.text = ''
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(text)
    r.bold = bold
    r.font.size = Pt(9.5)
    if color:
        r.font.color.rgb = RGBColor.from_string(color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

def add_table(headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, head in enumerate(headers):
        set_cell_text(table.rows[0].cells[i], head, bold=True, color='FFFFFF')
        shade(table.rows[0].cells[i], '2F5D62')
    for r_i, row in enumerate(rows):
        cells = table.add_row().cells
        for i, value in enumerate(row):
            set_cell_text(cells[i], value)
            if r_i % 2 == 1:
                shade(cells[i], 'F1F6F6')
    if widths:
        for row in table.rows:
            for i, width in enumerate(widths):
                row.cells[i].width = Inches(width)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return table

def add_figure(filename, caption, width=6.1):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    p.add_run().add_picture(str(ASSETS / filename), width=Inches(width))
    cap = doc.add_paragraph(style=body_style)
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(8)
    run = cap.add_run(caption)
    run.italic = True
    run.font.size = Pt(9.5)

add_heading('五、系统功能验证', 1)
add_body('系统以本地静态预览数据为演示基础，并在检索服务可用时调用后端接口返回真实检索结果。功能验证围绕统一入口、分类检索、条件筛选、详情浏览和离线回退五个环节开展，重点确认页面状态、数据字段与交互反馈能够保持一致。')

add_heading('5.1 首页与数据总览展示', 2)
add_body('首页提供岗位、公司、论文、模型和资讯的统一搜索入口，并通过数据概览组件展示当前已接入资源规模。首页下方同时呈现最新岗位、重点公司、资讯和论文模型预览，使用户可以从概览直接进入相应分类页面。')
add_figure('home-feature.png', '图5-1 系统首页与五类资源数据概览')

add_heading('5.2 岗位检索与结构化筛选', 2)
add_body('岗位页面支持关键词查询，并通过城市、经验、学历、薪资及岗位方向等条件缩小结果范围。岗位卡片突出岗位名称、企业、地点和薪资；进入详情页后可查看职位描述、任职要求与原始投递入口。对于AI关联度较弱的岗位，数据处理层保留AI相关证据字段，便于后续结合证据等级进一步优化首页推荐排序。')
add_figure('jobs-feature.png', '图5-2 岗位列表、薪资信息与筛选交互')

add_heading('5.3 论文检索与高级条件', 2)
add_body('论文页面支持标题、作者、摘要、关键词和全文等字段检索；高级检索可组合“必须包含”“任一包含”和“排除”条件。页面将条件与查询状态同步到URL参数，用户刷新页面或使用浏览器前进、后退时仍可恢复当前检索上下文。')
add_figure('papers-feature.png', '图5-3 论文检索页面与高级检索入口')

add_heading('5.4 关键实现代码说明', 2)
add_body('前端采用原生HTML、CSS和JavaScript实现。以下代码分别对应Hash路由解析，以及五类资源统一检索的请求、渲染和离线回退逻辑。代码截图与当前项目中的public/js/app.js保持一致，体现页面状态管理与离线完整包的实现方式。')
add_figure('code-routing.png', '图5-4 Hash路由与查询状态解析关键代码', width=6.15)
add_figure('code-search.png', '图5-5 五类资源统一检索与离线回退关键代码', width=6.15)

add_heading('5.5 功能测试结果', 2)
add_table(['测试项', '操作方法', '预期与实际结果'], [
    ['统一检索', '在首页输入“Transformer”或“大模型”并提交', '按岗位、公司、论文、模型、资讯分组返回结果；服务不可用时使用本地预览数据。'],
    ['岗位筛选', '选择城市、经验或薪资条件并翻页', '结果随条件变化；查询参数写入URL，可恢复当前筛选状态。'],
    ['论文高级检索', '添加必须包含、任一包含或排除条件', '条件组合生效，页面保持展开状态与输入内容。'],
    ['详情与外链', '从结果卡片进入详情并点击来源入口', '展示对应字段；原始来源链接保留，便于信息溯源。'],
    ['响应式展示', '改变浏览器宽度并访问首页、列表与详情', '导航、搜索区、卡片与数据概览在断点处重排，不遮挡主要内容。'],
], widths=[1.0, 2.3, 3.1])
add_body('测试结果表明，系统已完成面向AI求职场景的核心信息检索与浏览流程。当前检索相关性主要依赖BM25、多字段权重和结构化过滤；对于“相邻方向”岗位，应在后续版本将AI证据等级、岗位方向和发布时间纳入首页推荐排序，以降低泛岗位进入首屏的概率。')

add_heading('六、讨论与总结', 1)
add_body('本项目完成了一个面向AI求职场景的垂直搜索原型，将岗位、公司、论文、模型和资讯五类异构资源汇集到统一入口。项目既支持基于Elasticsearch的多字段检索和结构化过滤，也保留本地预览数据，使离线完整包在演示环境中能够稳定展示主要功能。')
add_body('从实现结果看，系统已覆盖数据采集、清洗、索引、检索、前端展示和详情溯源等环节。当前数据规模包括6,017条岗位、237家企业、5,090篇论文、2,000个模型和8,800条资讯。前端通过Hash路由管理页面状态，用户可在不同资源类型间连续检索、筛选、查看详情和访问原始来源。')
add_body('后续可引入AI证据等级和更新时间排序，持续提升结果相关性与时效性。')

doc.save(SOURCE)
print(SOURCE)
