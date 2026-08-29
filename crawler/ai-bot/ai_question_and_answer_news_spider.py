#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""AI 问答详情页爬虫。

输出字段与新闻库示例一致，正文只来自详情页，不使用列表页短摘要。
依赖：pip install requests beautifulsoup4
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


CATEGORY_URL = "https://ai-bot.cn/ai-question-and-answer/"
CATEGORY_NAME = "AI问答"
DEFAULT_OUTPUT = "ai_question_and_answer_news.json"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36"
    )
}

session = requests.Session()
session.headers.update(HEADERS)


def clean_text(value):
    return re.sub(r"\s+", " ", value or "").strip()


def absolute_url(url, base=CATEGORY_URL):
    return urldefrag(urljoin(base, url))[0]


def dedupe_url(url):
    return absolute_url(url).rstrip("/") + "/"


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


def same_site(url):
    return urlparse(url).netloc.lower() in {"", "ai-bot.cn", "www.ai-bot.cn"}


def discover_last_page(html):
    soup = BeautifulSoup(html, "html.parser")
    category_path = urlparse(CATEGORY_URL).path.rstrip("/")
    pages = [1]
    for link in soup.find_all("a", href=True):
        path = urlparse(absolute_url(link["href"])).path.rstrip("/")
        match = re.fullmatch(re.escape(category_path) + r"/page/(\d+)", path)
        if match:
            pages.append(int(match.group(1)))
    return max(pages)


def is_detail_url(url):
    if not same_site(url):
        return False
    path = urlparse(url).path.rstrip("/")
    category_path = urlparse(CATEGORY_URL).path.rstrip("/")
    if not path or path == category_path or path.startswith(category_path + "/page/"):
        return False
    blocked = (
        "/category/", "/tag/", "/author/", "/page/", "/about",
        "/daily-ai-news", "/ai-tools", "/wp-admin", "/feed",
    )
    return not any(path.startswith(prefix) for prefix in blocked)


def parse_list_page(html, page_url):
    soup = BeautifulSoup(html, "html.parser")
    items, seen = [], set()
    for heading in soup.find_all("h2"):
        link = heading.find("a", href=True)
        if not link:
            continue
        title = clean_text(link.get_text(" ", strip=True))
        url = absolute_url(link["href"], page_url)
        key = dedupe_url(url)
        if title and is_detail_url(url) and key not in seen:
            seen.add(key)
            items.append({"title": title, "url": url})
    return items


def find_article_scope(soup):
    selectors = (
        ".entry-content", ".post-content", ".article-content", ".article-body",
        ".single-content", ".td-post-content", "article .content",
    )
    for selector in selectors:
        candidate = soup.select_one(selector)
        if candidate and len(candidate.get_text(" ", strip=True)) >= 100:
            return candidate
    for candidate in soup.find_all("article"):
        if len(candidate.get_text(" ", strip=True)) >= 100:
            return candidate
    return soup.find("main") or soup.body or soup


def clean_scope(scope):
    """复制并清理正文容器，副本同时用于纯文本和 HTML 输出。"""
    fragment = BeautifulSoup(str(scope), "html.parser")
    for selector in (
        "script", "style", "noscript", "svg", "nav", "header", "footer",
        ".share", ".social-share", ".post-navigation", ".related-posts",
        ".recommend", ".adsbygoogle", ".advertisement", ".comments",
        ".comment-area", ".breadcrumb", ".entry-meta", ".post-meta",
    ):
        for node in fragment.select(selector):
            node.decompose()
    return fragment.find() or fragment


def table_lines(table):
    lines = []
    for row in table.find_all("tr"):
        cells = [clean_text(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"])]
        cells = [cell for cell in cells if cell]
        if cells:
            lines.append(" | ".join(cells))
    return lines


def extract_body(scope):
    cleaned = clean_scope(scope)
    blocks = []
    block_tags = {
        "h2", "h3", "h4", "h5", "p", "blockquote", "pre", "li", "dt", "dd", "table",
        "div", "section",
    }
    for node in cleaned.find_all(list(block_tags)):
        if node.name in {"div", "section"}:
            if node.find(list(block_tags)):
                continue
            text = clean_text(node.get_text(" ", strip=True))
            if text:
                blocks.append(text)
            continue
        if node.name == "li" and node.find(["p", "ul", "ol"]):
            continue
        if node.name == "table":
            blocks.extend(table_lines(node))
            continue
        text = clean_text(node.get_text(" ", strip=True))
        if text:
            blocks.append(text)

    if not blocks:
        blocks = [clean_text(cleaned.get_text(" ", strip=True))]
    filtered = []
    for text in blocks:
        if not text or any(word in text for word in ("版权声明", "免责声明", "相关推荐")):
            continue
        if not filtered or filtered[-1] != text:
            filtered.append(text)
    html = cleaned.decode_contents().strip()
    return "\n".join(filtered), html


def first_meta(soup, *selectors):
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            value = node.get("content") or node.get("datetime") or node.get_text(" ", strip=True)
            if clean_text(value):
                return clean_text(value)
    return ""


def parse_published(value):
    value = clean_text(value)
    if not value:
        return ""
    match = re.search(
        r"(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?"
        r"(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?",
        value,
    )
    if not match:
        return value
    year, month, day, hour, minute, second = match.groups()
    return (
        f"{int(year):04d}-{int(month):02d}-{int(day):02d} "
        f"{int(hour or 0):02d}:{int(minute or 0):02d}:{int(second or 0):02d}"
    )


def source_name(soup, content):
    value = first_meta(soup, "meta[property='article:author']", "meta[name='author']", "meta[property='og:site_name']")
    if value:
        return value
    match = re.search(r"([^\n|]{2,30})\s*\|\s*(?:公众号|微信)", content)
    return clean_text(match.group(1)) if match else urlparse(CATEGORY_URL).netloc


def find_cover(soup):
    cover = first_meta(soup, "meta[property='og:image']", "meta[name='twitter:image']")
    if cover:
        return absolute_url(cover)
    image = soup.find("img", src=True)
    return absolute_url(image["src"]) if image else ""


def taxonomy(title, content, tags):
    text = f"{title}\n{content}".lower()
    groups = {
        "ai_domains": {"NLP": ("nlp", "自然语言", "语言模型"), "CV": ("cv", "计算机视觉", "视觉"), "大模型": ("大模型", "llm", "gpt")},
        "companies": {name: (name.lower(),) for name in ("OpenAI", "Google", "微软", "Meta", "百度", "阿里巴巴", "腾讯")},
        "models": {name: (name.lower(),) for name in ("GPT", "BERT", "BERT", "ViT", "Transformer", "LLaMA", "Claude")},
        "technologies": {name: (name.lower(),) for name in ("Transformer", "PyTorch", "TensorFlow", "深度学习", "机器学习", "强化学习")},
    }
    result = {key: list(tags) if key == "keywords" else [] for key in ("ai_domains", "companies", "models", "technologies", "keywords")}
    for key, values in groups.items():
        result[key] = [label for label, needles in values.items() if any(needle in text for needle in needles)]
    result["keywords"] = list(dict.fromkeys(tags))
    return result


def parse_detail_page(html, item, crawled_at, previous=None):
    soup = BeautifulSoup(html, "html.parser")
    scope = find_article_scope(soup)
    title = first_meta(soup, "meta[property='og:title']") or clean_text((soup.find("h1") or {}).get_text(" ", strip=True) if soup.find("h1") else item["title"])
    content, content_html = extract_body(scope)
    published = parse_published(first_meta(soup, "time[datetime]", "meta[property='article:published_time']", ".published", ".post-date"))
    if not published:
        published = parse_published(content)
    tags = [clean_text(tag.get_text(" ", strip=True)) for tag in soup.select(".tags a, .post-tags a, a[rel='tag']")]
    tags = list(dict.fromkeys(tag for tag in tags if tag))
    summary = first_meta(soup, "meta[name='description']", "meta[property='og:description']") or content
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
        "summary": summary,
        "content": content,
        "content_html": content_html,
        "cover": find_cover(soup),
        "tags": tags,
    }
    data.update(taxonomy(title, content, tags))
    return data


def main():
    parser = argparse.ArgumentParser(description="抓取 AI 问答完整新闻 JSON")
    parser.add_argument("-o", "--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--delay", type=float, default=0.8)
    args = parser.parse_args()
    output_path = Path(args.output)
    existing = {}
    if output_path.exists():
        try:
            existing = {row.get("source_url"): row for row in json.loads(output_path.read_text(encoding="utf-8")) if row.get("source_url")}
        except (OSError, ValueError, TypeError):
            existing = {}

    first_html = fetch(CATEGORY_URL)
    last_page = discover_last_page(first_html)
    articles = {}
    for page in range(1, last_page + 1):
        page_url = CATEGORY_URL if page == 1 else f"{CATEGORY_URL}page/{page}/"
        html = first_html if page == 1 else fetch(page_url)
        for item in parse_list_page(html, page_url):
            articles[dedupe_url(item["url"])] = item
        print(f"第 {page}/{last_page} 页，累计 {len(articles)} 篇")
        time.sleep(args.delay)

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    output = []
    for index, item in enumerate(articles.values(), 1):
        print(f"[{index}/{len(articles)}] {item['title']}")
        try:
            output.append(parse_detail_page(fetch(item["url"]), item, now, existing.get(item["url"])))
        except Exception as exc:
            output.append({
                "news_id": hashlib.sha256(item["url"].encode("utf-8")).hexdigest(),
                "title": item["title"], "source": urlparse(CATEGORY_URL).netloc,
                "source_url": item["url"], "published_at": "", "crawled_at": now,
                "first_seen_at": existing.get(item["url"], {}).get("first_seen_at", now),
                "last_seen_at": now, "status": "active", "category": CATEGORY_NAME,
                "news_category": CATEGORY_NAME, "ai_domains": [], "companies": [],
                "models": [], "technologies": [], "keywords": [], "summary": "",
                "content": "", "content_html": "", "cover": "", "tags": [], "error": str(exc),
            })
        time.sleep(args.delay)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"完成，共 {len(output)} 条，保存到 {output_path}")


if __name__ == "__main__":
    main()
