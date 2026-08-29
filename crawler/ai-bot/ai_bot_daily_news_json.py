#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""每日 AI 资讯完整详情爬虫，输出统一新闻 JSON 字段。

安装：pip install requests beautifulsoup4
运行：python ai_bot_daily_news_json.py
"""

import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urldefrag, urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag


URL = "https://ai-bot.cn/daily-ai-news/"
CATEGORY = "每日AI资讯"
DEFAULT_OUTPUT = "daily_ai_news.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://ai-bot.cn/",
}
DATE_RE = re.compile(r"^\s*(\d{1,2})月(\d{1,2})(?:日)?[·\s]*周[一二三四五六日天]\s*$")
session = requests.Session()
session.headers.update(HEADERS)


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def absolute(url, base=URL):
    return urldefrag(urljoin(base, url))[0]


def fetch(url, retries=3, timeout=30):
    error = None
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=timeout)
            response.raise_for_status()
            if not response.encoding or response.encoding.lower() == "iso-8859-1":
                response.encoding = response.apparent_encoding or "utf-8"
            return response.text
        except requests.RequestException as exc:
            error = exc
            if attempt < retries:
                time.sleep(1.5 * attempt)
    raise RuntimeError(f"请求失败: {url}\n{error}")


def date_before(heading):
    node = heading
    for _ in range(100):
        node = node.find_previous(["p", "div", "span", "section", "h3", "h4"])
        if not node:
            return ""
        text = clean(node.get_text(" ", strip=True))
        if DATE_RE.fullmatch(text):
            return text
    return ""


def normalize_date(value):
    match = DATE_RE.fullmatch(value or "")
    if not match:
        return ""
    try:
        return datetime(datetime.now().year, int(match.group(1)), int(match.group(2))).strftime("%Y-%m-%d")
    except ValueError:
        return ""


def list_summary(heading):
    parts = []
    sibling = heading.next_sibling
    while sibling:
        if isinstance(sibling, Tag):
            if sibling.name == "h2":
                break
            text = clean(sibling.get_text(" ", strip=True))
            if text and DATE_RE.fullmatch(text):
                break
            if sibling.name in {"p", "div", "section", "ul", "ol"} and text:
                parts.append(text)
        sibling = sibling.next_sibling
    return clean(" ".join(parts))


def parse_list(html):
    soup = BeautifulSoup(html, "html.parser")
    items, seen = [], set()
    for heading in soup.find_all("h2"):
        title = clean(heading.get_text(" ", strip=True))
        if not title or "每日AI快讯热闻" in title:
            continue
        date_text = date_before(heading)
        if not date_text:
            continue
        link = heading.find("a", href=True)
        source_url = absolute(link["href"]) if link else ""
        key = (date_text, title, source_url)
        if key in seen:
            continue
        seen.add(key)
        items.append({
            "date_text": date_text,
            "date": normalize_date(date_text),
            "title": title,
            "url": source_url,
            "summary": list_summary(heading),
        })
    return items


def find_scope(soup):
    for selector in (".entry-content", ".post-content", ".article-content", ".article-body", ".single-content", "article .content"):
        node = soup.select_one(selector)
        if node and len(node.get_text(" ", strip=True)) >= 80:
            return node
    for node in soup.find_all("article"):
        if len(node.get_text(" ", strip=True)) >= 80:
            return node
    return soup.find("main") or soup.body or soup


def clean_copy(scope):
    fragment = BeautifulSoup(str(scope), "html.parser")
    for selector in (
        "script", "style", "noscript", "svg", "nav", "header", "footer", ".share", ".social-share",
        ".post-navigation", ".related-posts", ".recommend", ".comments", ".comment-area", ".breadcrumb",
        ".entry-meta", ".post-meta", ".adsbygoogle", ".advertisement",
    ):
        for node in fragment.select(selector):
            node.decompose()
    return fragment.find() or fragment


def table_text(table):
    lines = []
    for row in table.find_all("tr"):
        cells = [clean(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"])]
        if cells:
            lines.append(" | ".join(cell for cell in cells if cell))
    return lines


def extract_content(scope):
    body = clean_copy(scope)
    tags = {"h2", "h3", "h4", "h5", "p", "blockquote", "pre", "li", "dt", "dd", "table", "div", "section"}
    blocks = []
    for node in body.find_all(list(tags)):
        if node.name in {"div", "section"}:
            if node.find(list(tags)):
                continue
            text = clean(node.get_text(" ", strip=True))
            if text:
                blocks.append(text)
            continue
        if node.name == "li" and node.find(["p", "ul", "ol"]):
            continue
        if node.name == "table":
            blocks.extend(table_text(node))
            continue
        text = clean(node.get_text(" ", strip=True))
        if text:
            blocks.append(text)
    if not blocks:
        blocks = [clean(body.get_text(" ", strip=True))]
    output = []
    stop_markers = ("版权声明", "上一篇", "下一篇", "相关文章", "相关推荐", "猜你喜欢", "暂无评论", "发表评论")
    for text in blocks:
        if not text:
            continue
        if any(marker in text for marker in stop_markers):
            break
        if not output or output[-1] != text:
            output.append(text)

    stop_node = None
    for node in body.find_all(list(tags)):
        if node.name in {"div", "section"} and node.find(list(tags)):
            continue
        text = clean(node.get_text(" ", strip=True))
        if text and any(marker in text for marker in stop_markers):
            stop_node = node
            break
    if stop_node is not None:
        sibling = stop_node.find_next_sibling()
        while sibling is not None:
            next_sibling = sibling.find_next_sibling()
            sibling.decompose()
            sibling = next_sibling
        stop_node.decompose()
    return "\n".join(output), body.decode_contents().strip()


def meta(soup, *selectors):
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            value = node.get("content") or node.get("datetime") or node.get_text(" ", strip=True)
            if clean(value):
                return clean(value)
    return ""


def parse_datetime(value):
    value = clean(value)
    match = re.search(r"(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?", value)
    if not match:
        return value
    year, month, day, hour, minute, second = match.groups()
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d} {int(hour or 0):02d}:{int(minute or 0):02d}:{int(second or 0):02d}"


def taxonomy(title, content, tags):
    text = f"{title}\n{content}".lower()
    groups = {
        "ai_domains": {"NLP": ("nlp", "自然语言", "语言模型"), "CV": ("cv", "计算机视觉", "视觉"), "大模型": ("大模型", "llm", "gpt")},
        "companies": {name: (name.lower(),) for name in ("OpenAI", "Google", "微软", "Meta", "百度", "阿里巴巴", "腾讯")},
        "models": {name: (name.lower(),) for name in ("GPT", "BERT", "ViT", "Transformer", "LLaMA", "Claude")},
        "technologies": {name: (name.lower(),) for name in ("Transformer", "PyTorch", "TensorFlow", "深度学习", "机器学习", "强化学习")},
    }
    result = {key: [] for key in ("ai_domains", "companies", "models", "technologies")}
    for key, values in groups.items():
        result[key] = [label for label, words in values.items() if any(word in text for word in words)]
    result["keywords"] = list(dict.fromkeys(tags))
    return result


def source_name(soup, content):
    value = meta(soup, "meta[property='article:author']", "meta[name='author']", "meta[property='og:site_name']")
    if value:
        return value
    match = re.search(r"([^\n|]{2,30})\s*\|\s*(?:公众号|微信)", content)
    return clean(match.group(1)) if match else "ai-bot.cn"


def parse_detail(html, item, now, previous=None):
    soup = BeautifulSoup(html, "html.parser")
    scope = find_scope(soup)
    h1 = soup.find("h1")
    title = meta(soup, "meta[property='og:title']") or clean(h1.get_text(" ", strip=True) if h1 else item["title"])
    content, content_html = extract_content(scope)
    published = parse_datetime(meta(soup, "time[datetime]", "meta[property='article:published_time']", ".published", ".post-date")) or f"{item['date']} 00:00:00"
    tags = list(dict.fromkeys(clean(tag.get_text(" ", strip=True)) for tag in soup.select(".tags a, .post-tags a, a[rel='tag']")))
    tags = [tag for tag in tags if tag]
    old = previous or {}
    image = meta(soup, "meta[property='og:image']", "meta[name='twitter:image']")
    if not image and soup.find("img", src=True):
        image = soup.find("img", src=True)["src"]
    data = {
        "news_id": hashlib.sha256(item["url"].encode("utf-8")).hexdigest(),
        "title": title, "source": source_name(soup, content), "source_url": item["url"],
        "published_at": published, "crawled_at": now, "first_seen_at": old.get("first_seen_at", now),
        "last_seen_at": now, "status": "active", "category": CATEGORY, "news_category": "AI资讯",
        "summary": item.get("summary") or meta(soup, "meta[name='description']", "meta[property='og:description']") or content,
        "content": content, "content_html": content_html, "cover": absolute(image) if image else "", "tags": tags,
    }
    data.update(taxonomy(title, content, tags))
    return data


def failure(item, now, previous, error):
    return {
        "news_id": hashlib.sha256(item["url"].encode("utf-8")).hexdigest(), "title": item["title"], "source": "ai-bot.cn", "source_url": item["url"],
        "published_at": f"{item['date']} 00:00:00", "crawled_at": now, "first_seen_at": (previous or {}).get("first_seen_at", now), "last_seen_at": now,
        "status": "active", "category": CATEGORY, "news_category": "AI资讯", "ai_domains": [], "companies": [], "models": [], "technologies": [], "keywords": [],
        "summary": item.get("summary", ""), "content": "", "content_html": "", "cover": "", "tags": [], "error": str(error),
    }


def main():
    parser = argparse.ArgumentParser(description="抓取每日 AI 资讯完整新闻 JSON")
    parser.add_argument("-o", "--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--delay", type=float, default=0.8)
    args = parser.parse_args()
    path = Path(args.output)
    existing = {}
    if path.exists():
        try:
            existing = {row.get("source_url"): row for row in json.loads(path.read_text(encoding="utf-8")) if row.get("source_url")}
        except (OSError, ValueError, TypeError):
            pass
    html = fetch(URL)
    items = parse_list(html)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    output = []
    for index, item in enumerate(items, 1):
        print(f"[{index}/{len(items)}] {item['title']}")
        try:
            if not item["url"]:
                raise RuntimeError("列表项没有详情页链接")
            output.append(parse_detail(fetch(item["url"]), item, now, existing.get(item["url"])))
        except Exception as exc:
            output.append(failure(item, now, existing.get(item["url"]), exc))
        time.sleep(args.delay)
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"完成，共 {len(output)} 条，保存到 {path}")


if __name__ == "__main__":
    main()
