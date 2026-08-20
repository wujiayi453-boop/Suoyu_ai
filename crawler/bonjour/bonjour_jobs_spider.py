import json
import re
import time
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://bonjour.bio"
LIST_URL = "https://bonjour.bio/jobs-mapping/jobs"
OUTPUT_FILE = "bonjour_jobs.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/151.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
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
            time.sleep(2 * (i + 1))

    return None


def get_job_urls():
    """
    获取职位列表页中的全部职位详情链接
    """

    html = request_page(LIST_URL)

    if not html:
        raise RuntimeError("无法获取职位列表页面")

    soup = BeautifulSoup(html, "lxml")

    jobs = {}

    for a in soup.find_all("a", href=True):
        href = a.get("href", "").strip()

        # 单个职位 URL 格式：
        # /jobs-mapping/jobs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        if not href.startswith("/jobs-mapping/jobs/"):
            continue

        # 排除职位列表页自己
        if href.rstrip("/") == "/jobs-mapping/jobs":
            continue

        full_url = urljoin(BASE_URL, href)

        job_id = href.rstrip("/").split("/")[-1]

        if full_url not in jobs:
            jobs[full_url] = {
                "job_id": job_id,
                "detail_url": full_url
            }

    result = list(jobs.values())

    print()
    print("=" * 50)
    print(f"发现职位：{len(result)} 个")
    print("=" * 50)

    return result


def extract_sections(soup):
    """
    提取职位详情中的标题区块，例如：
    职责
    能力要求
    加分项
    我们在找谁
    我们提供
    """

    sections = {}

    headings = soup.find_all(
        ["h1", "h2", "h3", "h4"]
    )

    for heading in headings:
        title = clean_text(
            heading.get_text(" ", strip=True)
        )

        if not title:
            continue

        content = []

        node = heading.find_next_sibling()

        while node:
            if node.name in [
                "h1",
                "h2",
                "h3",
                "h4"
            ]:
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


def extract_links(soup):
    links = []

    seen = set()

    for a in soup.find_all("a", href=True):
        href = a.get("href", "").strip()

        if not href:
            continue

        url = urljoin(BASE_URL, href)

        if url in seen:
            continue

        seen.add(url)

        links.append({
            "text": clean_text(
                a.get_text(" ", strip=True)
            ),
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
                result.append(
                    json.loads(text)
                )

        except Exception:
            pass

    return result


def extract_embedded_json(soup):
    """
    尝试获取页面里内嵌的 JSON 数据
    """

    result = []

    for script in soup.find_all("script"):
        text = script.string

        if not text:
            continue

        script_id = (
            script.get("id") or ""
        ).lower()

        script_type = (
            script.get("type") or ""
        ).lower()

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


def extract_job_meta(soup):
    """
    尝试从职位标题附近提取薪资、地点、
    职位类型、发布时间等基础信息
    """

    result = {
        "salary": "",
        "location": "",
        "employment_type": "",
        "experience_level": "",
        "published_time": ""
    }

    h1 = soup.find("h1")

    if not h1:
        return result

    # 取 H1 后面一段文本作为岗位元数据候选
    texts = []

    for node in h1.find_all_next(
        ["div", "span", "p"],
        limit=20
    ):
        text = clean_text(
            node.get_text(" ", strip=True)
        )

        if text and text not in texts:
            texts.append(text)

    candidate_text = " ".join(texts)

    # 薪资
    salary_patterns = [
        r"¥\s*\d+\s*[kK]\s*[–\-~至]\s*¥?\s*\d+\s*[kK]\s*/?\s*月",
        r"\d+\s*[kK]\s*[–\-~至]\s*\d+\s*[kK]",
        r"薪资面议",
        r"\d+\s*[–\-~至]\s*\d+\s*元/日"
    ]

    for pattern in salary_patterns:
        match = re.search(
            pattern,
            candidate_text
        )

        if match:
            result["salary"] = clean_text(
                match.group()
            )
            break

    # 工作性质
    types = [
        "全职",
        "兼职",
        "实习",
        "实习 / Junior",
        "Junior",
        "Senior"
    ]

    found_types = []

    for t in types:
        if t in candidate_text:
            found_types.append(t)

    if found_types:
        result["employment_type"] = " / ".join(
            dict.fromkeys(found_types)
        )

    # 发布时间
    time_patterns = [
        r"\d+\s*天前",
        r"\d+\s*个月前",
        r"\d+\s*小时前",
        r"\d+\s*周前"
    ]

    for pattern in time_patterns:
        match = re.search(
            pattern,
            candidate_text
        )

        if match:
            result["published_time"] = (
                match.group()
            )
            break

    return result


def extract_company_name(soup, job_title):
    """
    尽量从页面标题或正文中识别公司名称
    """

    title = soup.find("title")

    if title:
        title_text = clean_text(
            title.get_text()
        )

        # 例如：
        # Taku 正在招聘 AI Development Engineer（海外远程）
        if "正在招聘" in title_text:
            company = title_text.split(
                "正在招聘",
                1
            )[0]

            return clean_text(company)

        if "正在招" in title_text:
            company = title_text.split(
                "正在招",
                1
            )[0]

            return clean_text(company)

    return ""


def extract_company_detail_url(soup):
    """
    找对应公司详情页
    """

    for a in soup.find_all("a", href=True):
        href = a.get("href", "")

        if "/jobs-mapping/team/" in href:
            return urljoin(
                BASE_URL,
                href
            )

    return ""


def parse_job(job):
    url = job["detail_url"]

    html = request_page(url)

    if not html:
        return None

    soup = BeautifulSoup(
        html,
        "lxml"
    )

    h1 = soup.find("h1")

    job_title = (
        clean_text(
            h1.get_text(
                " ",
                strip=True
            )
        )
        if h1
        else ""
    )

    print(f"解析职位：{job_title}")

    company_name = extract_company_name(
        soup,
        job_title
    )

    company_detail_url = (
        extract_company_detail_url(
            soup
        )
    )

    meta = extract_job_meta(soup)

    full_text = clean_text(
        soup.get_text(
            "\n",
            strip=True
        )
    )

    sections = extract_sections(soup)

    return {
        "job_id": job["job_id"],

        "job_title": job_title,

        "company_name": company_name,

        "detail_url": url,

        "company_detail_url":
            company_detail_url,

        "salary":
            meta["salary"],

        "location":
            meta["location"],

        "employment_type":
            meta["employment_type"],

        "experience_level":
            meta["experience_level"],

        "published_time":
            meta["published_time"],

        "sections":
            sections,

        "links":
            extract_links(soup),

        "images":
            extract_images(soup),

        "json_ld":
            extract_json_ld(soup),

        "embedded_json":
            extract_embedded_json(soup),

        # 保留完整职位页面文字
        # 之后发现字段缺失时还能重新解析
        "full_text":
            full_text
    }


def main():
    job_urls = get_job_urls()

    all_jobs = []

    total = len(job_urls)

    for index, job in enumerate(
        job_urls,
        start=1
    ):
        print()
        print(
            f"[{index}/{total}] "
            f"{job['detail_url']}"
        )

        try:
            data = parse_job(job)

            if data:
                all_jobs.append(data)

                # 每爬完一个职位马上保存
                with open(
                    OUTPUT_FILE,
                    "w",
                    encoding="utf-8"
                ) as f:
                    json.dump(
                        all_jobs,
                        f,
                        ensure_ascii=False,
                        indent=2
                    )

        except Exception as e:
            print(
                f"职位解析失败："
                f"{job['detail_url']}"
            )
            print(e)

        # 请求间隔
        time.sleep(1)

    print()
    print("=" * 50)
    print("职位爬取完成")
    print(f"职位数量：{len(all_jobs)}")
    print(f"保存文件：{OUTPUT_FILE}")
    print("=" * 50)


if __name__ == "__main__":
    main()