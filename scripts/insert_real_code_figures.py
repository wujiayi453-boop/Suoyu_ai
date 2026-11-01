from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

REPORT = Path('AI求职专题搜索引擎实验报告_项目完善版.docx')
OUTPUT = Path('AI求职专题搜索引擎实验报告_真实代码截图版.docx')
ASSET_DIR = Path('docs/real-code')
ASSET_DIR.mkdir(parents=True, exist_ok=True)
ROOT = Path('.')
CODE_FONT = r'C:\Windows\Fonts\CascadiaMono.ttf'
TITLE_FONT = r'C:\Windows\Fonts\msyhbd.ttc'

def lines_from(path, start, end):
    lines = (ROOT / path).read_text(encoding='utf-8').splitlines()
    return lines[start - 1:end]

def render_code(filename, source, start, end, title):
    lines = lines_from(source, start, end)
    code_font = ImageFont.truetype(CODE_FONT, 21)
    title_font = ImageFont.truetype(TITLE_FONT, 25)
    number_font = ImageFont.truetype(CODE_FONT, 18)
    width, header, left, line_height = 1600, 80, 52, 35
    height = header + 38 + len(lines) * line_height + 34
    image = Image.new('RGB', (width, height), '#111b1f')
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width, header), fill='#20363b')
    draw.text((left, 22), title, font=title_font, fill='#7ddbd5')
    y = header + 28
    for offset, text in enumerate(lines):
        line_number = start + offset
        draw.text((left, y), str(line_number), font=number_font, fill='#7d9295')
        draw.text((left + 92, y - 2), text, font=code_font, fill='#dcebea')
        y += line_height
    image.save(ASSET_DIR / filename)

specs = [
    ('data-cleaning.png', 'scripts/build-data.js', 20, 29, '实际代码  scripts/build-data.js  文本清洗与字段标准化辅助函数'),
    ('index-import.png', 'scripts/import-elasticsearch.js', 113, 117, '实际代码  scripts/import-elasticsearch.js  Elasticsearch 批量写入'),
    ('search-fallback.png', 'src/services/search.js', 1, 17, '实际代码  src/services/search.js  Elasticsearch 检索与本地回退'),
    ('frontend-routing.png', 'public/js/app.js', 26, 42, '实际代码  public/js/app.js  Hash 路由与搜索状态管理'),
]
for item in specs:
    render_code(*item)

doc = Document(REPORT)
body_style = doc.paragraphs[16].style

# 关键代码图应位于“系统实施”各小节，移除功能验证中此前的重复代码图。
paragraphs = list(doc.paragraphs)
old_start = next((i for i, p in enumerate(paragraphs) if p.text.strip().startswith('5.4关键实现代码说明')), None)
old_end = next((i for i, p in enumerate(paragraphs) if p.text.strip().startswith('5.5功能测试结果')), None)
if old_start is not None and old_end is not None:
    for p in paragraphs[old_start:old_end]:
        p._element.getparent().remove(p._element)

def find_paragraph(prefix):
    for p in doc.paragraphs:
        if p.text.strip().replace(' ', '').startswith(prefix.replace(' ', '')):
            return p
    raise RuntimeError(f'未找到段落: {prefix}')

def insert_figure_after(anchor, filename, caption):
    image_p = doc.add_paragraph()
    image_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    image_p.paragraph_format.space_before = Pt(8)
    image_p.paragraph_format.space_after = Pt(2)
    image_p.add_run().add_picture(str(ASSET_DIR / filename), width=Inches(6.15))
    caption_p = doc.add_paragraph(style=body_style)
    caption_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption_p.paragraph_format.space_after = Pt(8)
    run = caption_p.add_run(caption)
    run.italic = True
    run.font.size = Pt(9.5)
    anchor._p.addnext(image_p._p)
    image_p._p.addnext(caption_p._p)

insert_figure_after(find_paragraph('4.2数据清洗与处理'), 'data-cleaning.png', '图4-1 数据标准化关键代码（实际项目文件：scripts/build-data.js）')
insert_figure_after(find_paragraph('4.3搜索索引构建'), 'index-import.png', '图4-2 Elasticsearch 批量写入关键代码（实际项目文件：scripts/import-elasticsearch.js）')
insert_figure_after(find_paragraph('4.4后端检索服务'), 'search-fallback.png', '图4-3 检索服务与本地回退关键代码（实际项目文件：src/services/search.js）')
insert_figure_after(find_paragraph('4.5前端交互系统'), 'frontend-routing.png', '图4-4 Hash 路由与搜索状态关键代码（实际项目文件：public/js/app.js）')
doc.save(OUTPUT)
print(OUTPUT)
