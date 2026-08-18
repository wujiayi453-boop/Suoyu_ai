import json
import re
import time
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://bonjour.bio"
LIST_URL = "https://bonjour.bio/jobs-mapping"
OUTPUT_FILE = "bonjour_companies.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/151.0.0.0 Safari/537.36"
    )
}

session = requests.Session()
session.headers.update(HEADERS)


def clean_text(text):
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def request_page(url, retry=3):
    for i in range(retry):
        try:
            print(f"请求：{url}")

            response = session.get(url, timeout=30)
            response.raise_for_status()

            response.encoding = response.apparent_encoding

            return response.text

        except Exception as e:
            print(f"请求失败 {i + 1}/{retry}：{e}")
            time.sleep(2)

    return None


def get_company_urls():
    """
    获取 jobs-mapping 页面中的所有公司详情页
    """

    html = request_page(LIST_URL)

    if not html:
        raise RuntimeError("无法获取公司列表页面")

    soup = BeautifulSoup(html, "lxml")

    company_urls = {}

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()

        if "/jobs-mapping/team/" not in href:
            continue

        url = urljoin(BASE_URL, href)

        if url not in company_urls:
            company_urls[url] = {
                "url": url,
                "slug": href.rstrip("/").split("/")[-1]
            }

    result = list(company_urls.values())

    print(f"\n发现公司：{len(result)} 家")

    return result


def extract_links(soup):
    links = []

    seen = set()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()

        if not href:
            continue

        url = urljoin(BASE_URL, href)

        if url in seen:
            continue

        seen.add(url)

        links.append({
            "text": clean_text(a.get_text(" ", strip=True)),
            "url": url
        })

    return links


def extract_images(soup):
    images = []

    seen = set()

    for img in soup.find_all("img"):
        src = img.get("src")

        if not src:
            continue

        url = urljoin(BASE_URL, src)

        if url in seen:
            continue

        seen.add(url)

        images.append({
            "alt": img.get("alt", ""),
            "url": url
        })

    return images


def extract_json_ld(soup):
    result = []

    for script in soup.find_all(
        "script",
        attrs={"type": "application/ld+json"}
    ):
        try:
            text = script.string

            if text:
                result.append(json.loads(text))

        except Exception:
            pass

    return result


def extract_embedded_json(soup):
    """
    尝试获取网页中直接存在的 JSON 数据
    """

    result = []

    for script in soup.find_all("script"):
        text = script.string

        if not text:
            continue

        script_id = (script.get("id") or "").lower()
        script_type = (script.get("type") or "").lower()

        text = text.strip()

        if script_id == "__next_data__":
            try:
                result.append({
                    "type": "__NEXT_DATA__",
                    "data": json.loads(text)
                })
            except Exception:
                pass

        elif script_type == "application/json":
            try:
                result.append({
                    "type": "application/json",
                    "data": json.loads(text)
                })
            except Exception:
                pass

    return result


def extract_sections(soup):
    """
    获取页面里的各个标题模块
    """

    sections = {}

    for heading in soup.find_all(["h1", "h2", "h3", "h4"]):
        title = clean_text(
            heading.get_text(" ", strip=True)
        )

        if not title:
            continue

        content = []

        node = heading.find_next_sibling()

        while node:
            if node.name in ["h1", "h2", "h3", "h4"]:
                break

            text = clean_text(
                node.get_text(" ", strip=True)
            )

            if text:
                content.append(text)

            node = node.find_next_sibling()

        if content:
            sections[title] = content

    return sections


def parse_company(company):
    url = company["url"]

    html = request_page(url)

    if not html:
        return None

    soup = BeautifulSoup(html, "lxml")

    # 公司名
    h1 = soup.find("h1")

    company_name = (
        clean_text(h1.get_text(" ", strip=True))
        if h1
        else company["slug"]
    )

    print(f"解析：{company_name}")

    # 页面所有文字
    full_text = clean_text(
        soup.get_text("\n", strip=True)
    )

    # 简介
    description = ""

    if h1:
        for node in h1.find_all_next("p"):
            text = clean_text(
                node.get_text(" ", strip=True)
            )

            if text:
                description = text
                break

    links = extract_links(soup)

    # 官网
    website = ""

    exclude_domains = [
        "bonjour.bio",
        "linkedin.com",
        "twitter.com",
        "x.com",
        "zhihu.com",
        "bilibili.com",
        "xiaohongshu.com",
        "weixin.qq.com",
        "36kr.com"
    ]

    for link in links:
        url_temp = link["url"]

        if not url_temp.startswith("http"):
            continue

        if any(x in url_temp for x in exclude_domains):
            continue

        website = url_temp
        break

    return {
        "company_name": company_name,
        "slug": company["slug"],
        "detail_url": url,
        "description": description,
        "website": website,

        "sections": extract_sections(soup),

        "links": links,

        "images": extract_images(soup),

        "json_ld": extract_json_ld(soup),

        "embedded_json": extract_embedded_json(soup),

        # 保留整个页面文字，避免字段漏掉
        "full_text": full_text
    }


def main():

    company_urls = get_company_urls()

    all_companies = []

    total = len(company_urls)

    for index, company in enumerate(company_urls, 1):

        print(
            f"\n[{index}/{total}] "
            f"{company['url']}"
        )

        try:
            data = parse_company(company)

            if data:
                all_companies.append(data)

                # 每爬完一家就保存
                # 即使中途断了也不会全部丢失
                with open(
                    OUTPUT_FILE,
                    "w",
                    encoding="utf-8"
                ) as f:
                    json.dump(
                        all_companies,
                        f,
                        ensure_ascii=False,
                        indent=2
                    )

        except Exception as e:
            print(f"失败：{e}")

        # 不要请求太快
        time.sleep(1)

    print("\n============================")
    print("爬取完成")
    print(f"公司数量：{len(all_companies)}")
    print(f"文件：{OUTPUT_FILE}")
    print("============================")


if __name__ == "__main__":
    main()