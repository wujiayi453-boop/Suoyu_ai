from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path('docs')
OUT.mkdir(exist_ok=True)

FONT = r'C:\Windows\Fonts\consola.ttf'
TITLE_FONT = r'C:\Windows\Fonts\msyhbd.ttc'
TEXT_FONT = r'C:\Windows\Fonts\msyh.ttc'

def font(path, size):
    return ImageFont.truetype(path, size)

def draw_code(filename, title, lines):
    width, pad, line_h = 1560, 58, 44
    height = 110 + len(lines) * line_h + 56
    image = Image.new('RGB', (width, height), '#10191d')
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=22, fill='#172428', outline='#28545a', width=2)
    draw.rectangle((0, 0, width, 88), fill='#1e3035')
    draw.text((pad, 27), title, font=font(TITLE_FONT, 30), fill='#78d8d0')
    num_font = font(FONT, 24)
    code_font = font(FONT, 27)
    y = 112
    for number, text in enumerate(lines, 1):
        draw.text((pad, y), f'{number:>2}', font=num_font, fill='#74878a')
        color = '#e6f0ef'
        if text.strip().startswith('//'):
            color = '#8da7a1'
        elif text.strip().startswith(('function', 'const', 'if', 'return')):
            color = '#b8dcff'
        draw.text((pad + 70, y - 2), text, font=code_font, fill=color)
        y += line_h
    image.save(OUT / filename)

draw_code('code-routing.png', '关键代码 1  Hash 路由与查询状态解析  public/js/app.js', [
    "function routeInfo() {",
    "  const raw = location.hash.slice(1) || '/';",
    "  const [path, query = ''] = raw.split('?');",
    "  return { path: path || '/', params: new URLSearchParams(query) };",
    "}",
    "// 筛选与分页条件随 URL 保存，支持刷新和浏览器前进/后退恢复。",
])

draw_code('code-search.png', '关键代码 2  五类资源统一检索与离线回退  public/js/app.js', [
    "function runGlobalSearch(query) {",
    "  const renderId = ++state.renderId;",
    "  const fallback = groupedFallback(query);",
    "  if (!isServer()) return renderGrouped(query, fallback, renderId);",
    "  api(`/api/search?group=1&q=${encodeURIComponent(query)}`).then(data => {",
    "    if (renderId !== state.renderId) return;",
    "    renderGrouped(query, data.groups, renderId, data.total);",
    "  }).catch(() => renderGrouped(query, fallback, renderId));",
    "}",
])
