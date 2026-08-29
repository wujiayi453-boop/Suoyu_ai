#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""AI百科完整详情爬虫，输出统一新闻 JSON 字段。

安装：pip install requests beautifulsoup4
运行：python ai_encyclopedia_news_spider.py
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
from bs4 import BeautifulSoup


CATEGORY_URL = "https://ai-bot.cn/ai-encyclopedia/"
CATEGORY_NAME = "AI百科"
DEFAULT_OUTPUT = "ai_encyclopedia_news.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://ai-bot.cn/",
}
session = requests.Session()
session.headers.update(HEADERS)


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def absolute(url, base=CATEGORY_URL):
    return urldefrag(urljoin(base, url))[0]


def key_url(url):
    return absolute(url).rstrip("/") + "/"


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


def discover_last_page(html):
    soup = BeautifulSoup(html, "html.parser")
    base_path = urlparse(CATEGORY_URL).path.rstrip("/")
    pages = [1]
    for link in soup.find_all("a", href=True):
        path = urlparse(absolute(link["href"])).path.rstrip("/")
        match = re.fullmatch(re.escape(base_path) + r"/page/(\d+)", path)
        if match:
            pages.append(int(match.group(1)))
    return max(pages)


def is_article_url(url):
    if urlparse(url).netloc.lower() not in {"", "ai-bot.cn", "www.ai-bot.cn"}:
        return False
    path = urlparse(url).path.rstrip("/")
    blocked = (
        "/ai-encyclopedia", "/category", "/tag", "/author", "/page", "/about",
        "/daily-ai-news", "/ai-tools", "/ai-column", "/ai-question-and-answer",
        "/wp-admin", "/feed",
    )
    return bool(path) and not any(path.startswith(prefix) for prefix in blocked)


def parse_list_page(html, page_url):
    soup = BeautifulSoup(html, "html.parser")
    items, seen = [], set()
    for heading in soup.find_all("h2"):
        link = heading.find("a", href=True)
        if not link:
            continue
        title = clean(link.get_text(" ", strip=True))
        url = absolute(link["href"], page_url)
        key = key_url(url)
        if title and is_article_url(url) and key not in seen:
            seen.add(key)
            items.append({"title": title, "url": url})
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


STOP_MARKERS = ("版权声明", "上一篇", "下一篇", "相关文章", "相关推荐", "猜你喜欢", "暂无评论", "发表评论")


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
    """返回完整纯文本和保留结构的清理后 HTML，不按字数截断。"""
    body = clean_copy(scope)
    blocks = []
    tags = {"h2", "h3", "h4", "h5", "p", "blockquote", "pre", "li", "dt", "dd", "table", "div", "section"}
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
    # HTML 同样截断在正文结束标记之前。
    stop_node = None
    for node in body.find_all(list(tags)):
        if node.name in {"div", "section"} and node.find(list(tags)):
            continue
        text = clean(node.get_text(" ", strip=True))
        if text and any(marker in text for marker in STOP_MARKERS):
            stop_node = node
            break
    if stop_node is not None:
        sibling = stop_node.find_next_sibling()
        while sibling is not None:
            next_sibling = sibling.find_next_sibling()
            sibling.decompose()
            sibling = next_sibling
        stop_node.decompose()
    if not blocks:
        blocks = [clean(body.get_text(" ", strip=True))]
    output = []
    for text in blocks:
        if not text:
            continue
        if any(marker in text for marker in STOP_MARKERS):
            break
        if not output or output[-1] != text:
            output.append(text)
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


def source_name(soup, content):
    value = meta(soup, "meta[property='article:author']", "meta[name='author']", "meta[property='og:site_name']")
    if value:
        return value
    match = re.search(r"([^\n|]{2,30})\s*\|\s*(?:公众号|微信)", content)
    return clean(match.group(1)) if match else "ai-bot.cn"


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


def parse_detail(html, item, crawled_at, previous=None):
    soup = BeautifulSoup(html, "html.parser")
    scope = find_scope(soup)
    h1 = soup.find("h1")
    title = meta(soup, "meta[property='og:title']") or clean(h1.get_text(" ", strip=True) if h1 else item["title"])
    content, content_html = extract_content(scope)
    published = parse_datetime(meta(soup, "time[datetime]", "meta[property='article:published_time']", ".published", ".post-date"))
    if not published:
        published = parse_datetime(content)
    tags = list(dict.fromkeys(clean(tag.get_text(" ", strip=True)) for tag in soup.select(".tags a, .post-tags a, a[rel='tag']")))
    tags = [tag for tag in tags if tag]
    now = crawled_at
    old = previous or {}
    data = {
        "news_id": hashlib.sha256(item["url"].encode("utf-8")).hexdigest(),
        "title": title,
        "source": source_name(soup, content),
        "source_url": item["url"],
        "published_at": published,
        "crawled_at": now,
        "first_seen_at": old.get("first_seen_at", now),
        "last_seen_at": now,
        "status": "active",
        "category": CATEGORY_NAME,
        "news_category": CATEGORY_NAME,
        "summary": meta(soup, "meta[name='description']", "meta[property='og:description']") or content,
        "content": content,
        "content_html": content_html,
        "cover": absolute(meta(soup, "meta[property='og:image']", "meta[name='twitter:image']")) if meta(soup, "meta[property='og:image']", "meta[name='twitter:image']") else (absolute(soup.find("img", src=True)["src"]) if soup.find("img", src=True) else ""),
        "tags": tags,
    }
    data.update(taxonomy(title, content, tags))
    return data


def failure_record(item, now, previous, error):
    return {
        "news_id": hashlib.sha256(item["url"].encode("utf-8")).hexdigest(), "title": item["title"], "source": "ai-bot.cn",
        "source_url": item["url"], "published_at": "", "crawled_at": now,
        "first_seen_at": (previous or {}).get("first_seen_at", now), "last_seen_at": now, "status": "active",
        "category": CATEGORY_NAME, "news_category": CATEGORY_NAME, "ai_domains": [], "companies": [],
        "models": [], "technologies": [], "keywords": [], "summary": "", "content": "", "content_html": "", "cover": "", "tags": [], "error": str(error),
    }


def main():
    parser = argparse.ArgumentParser(description="抓取 AI百科完整新闻 JSON")
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

    first_html = fetch(CATEGORY_URL)
    last_page = discover_last_page(first_html)
    article_map = {}
    for page in range(1, last_page + 1):
        page_url = CATEGORY_URL if page == 1 else f"{CATEGORY_URL}page/{page}/"
        html = first_html if page == 1 else fetch(page_url)
        for item in parse_list_page(html, page_url):
            article_map[key_url(item["url"])] = item
        print(f"第 {page}/{last_page} 页，累计 {len(article_map)} 篇")
        time.sleep(args.delay)

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    output = []
    for index, item in enumerate(article_map.values(), 1):
        print(f"[{index}/{len(article_map)}] {item['title']}")
        try:
            output.append(parse_detail(fetch(item["url"]), item, now, existing.get(item["url"])))
        except Exception as exc:
            output.append(failure_record(item, now, existing.get(item["url"]), exc))
        time.sleep(args.delay)
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"完成，共 {len(output)} 条，保存到 {path}")


if __name__ == "__main__":
    main()
