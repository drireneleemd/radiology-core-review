"""
RSNA ABR Core Exam Study Guide Scraper
=======================================
Install: pip install curl-cffi beautifulsoup4 lxml
Run:     python3 rsna_scraper.py
"""

import os
import re
import time
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from curl_cffi import requests

Session = requests.Session  
# ── CONFIG — paste your full cookie string below ──────────────────────────────
COOKIE = "JSESSIONID=B5D0D92B3597B53C8FC04B2D784E6422; MAID=rDKZSzAed5lmTsDkochSCw==; MACHINE_LAST_SEEN=2026-05-07T05%3A53%3A23.748-07%3A00; JSESSIONID=B5D0D92B3597B53C8FC04B2D784E6422; _gid=GA1.2.1990678537.1778158404; _gcl_au=1.1.1577340450.1778158404; sa-user-id=s%253A0-9ebf2b91-b82c-5e6d-497b-30596b431343.W2aA0c8Rh6yEh8shgOB49ivfmvRLDVo%252FLtmsi97wFm8; sa-user-id-v2=s%253Anr8rkbgsXm1JezBZa0MTQxhjFhM.rGy7xyVQ1SrXXYqAXUVuSK1O13OfIXWFFX3N9%252BKQw7c; sa-user-id-v3=s%253AAQAKIMOAbbC5puzJR-yFfYLFV5UYzyAJ2txapDXrlKiR28wIEAEYAyDElvLPBjABOgQfK-WDQgRhdQkk.gFGvoH36HGNVOBbPqOl2YbMH5yT5n90ikL95y1iXIsg; sa-user-id-v4=s%253A.o6W7wkJsHSTU4%252BLlDruZ%252FwNjVcUZZMvakQpSatDoAgo; feathr_session_id=69fc8b448d84a2b52a1e0b73; corpRollup_ga_EQ32SZ84M3=GS2.1.s1778158403$o5$g1$t1778158404$j59$l0$h0; corpRollup_ga=GA1.1.87536568.1778158404; _fbp=fb.1.1778158404612.797696517112743889; _clck=1rbhl09%5E2%5Eg5u%5E0%5E2318; _ga_ZB5CZ6ET2D=GS2.1.s1778158404$o5$g1$t1778158404$j60$l0$h0; _ga=GA1.1.87536568.1778158404; _clsk=1kij9rw%5E1778158404821%5E1%5E1%5Ej.clarity.ms%2Fcollect; FCCDCF=%5Bnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2C%5B%5B32%2C%22%5B%5C%22341e9b94-f555-497a-ba5e-06c199b30347%5C%22%2C%5B1778158404%2C942000000%5D%5D%22%5D%5D%5D; __hstc=229304707.b96fca3b5957de8c19009ebe70d2527c.1778158405477.1778158405477.1778158405477.1; hubspotutk=b96fca3b5957de8c19009ebe70d2527c; __hssrc=1; __hssc=229304707.1.1778158405477; cf_clearance=phvM59aPuBQ9mt5wZFm6ir1qyHDL_IvYtU.rM2FOFLo-1778158405-1.2.1.1-k.19mMWIR001OmAJ.UUipbA0XHJBK.Tns8y8z6xcAjwQETB5K_3bfHKGqlv9bMdmxopQSQ64HQ1nbSXV3H3a_6uYBRBUJCb5povDtM6nr09dccMd51DJ5dCmMBfEsOqPYKJJE.k2kxlmt.uoXFz753FtYeusXAAuKWO8GCyKj7qRjOeI_Lx.ZzCMmAFMpLfkT_F__yaA15jIjkUXlry7LRBYP.M3ozD.7eTvPho2Ay0aDwsGKeSbIFMDhAsXZR8t7RsNgb5VTAGWad11fZTXBTxKkZv7cT5Y30nnfmI0x3WyRENnpkzf8eVj5XJloUxMsn97jXJTLYOljhYkkJ4lkQ; FCNEC=%5B%5B%22AKsRol_SD3q_yGkbsVT3cVCskQHv28FbeWoTzIJA1u-YdY2Y1m1sJ1t4Aj96GwNM7Jezeev12aorLAY3RMO9epEXvUaMYwyTbGhj988fmyzmy9Cqp-IX3kXdL8F-PERioeWRIMB47u3LHxCX9p-An9jVJnP1YqvKHQ%3D%3D%22%5D%5D; _ga_4699REKRC5=GS2.1.s1778158405$o1$g0$t1778158405$j60$l0$h0"

BASE_URL   = "https://pubs.rsna.org"
START_URL  = f"{BASE_URL}/page/radiographics/abr-core-exam-study-guide"
OUTPUT_DIR = "./rsna_pdfs"
DELAY      = 1.5

# ── Session (impersonates real Chrome at TLS level) ───────────────────────────
session = Session(impersonate="chrome124")
session.headers.update({
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cookie":          COOKIE,
})

# ── Helpers ───────────────────────────────────────────────────────────────────

def safe_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "_", name).strip()


def get_soup(url):
    resp = session.get(url, timeout=30)
    print(f"    HTTP {resp.status_code}  {url}")
    resp.raise_for_status()
    time.sleep(DELAY)
    return BeautifulSoup(resp.text, "lxml")


def download_pdf(url, dest_path):
    if os.path.exists(dest_path):
        print(f"    [skip] {os.path.basename(dest_path)}")
        return True
    try:
        resp = session.get(url, timeout=60)
        resp.raise_for_status()
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(resp.content)
        time.sleep(DELAY)
        print(f"    [ok]   {os.path.basename(dest_path)}")
        return True
    except Exception as e:
        print(f"    [err]  {url} -> {e}")
        return False


# ── Step 1: subspecialty links from main page ─────────────────────────────────

def get_subspecialty_links(soup):
    items = []
    for li in soup.select("li.mb-24.accordion-item"):
        a = li.find("a", class_="accordion-button")
        if not a:
            continue
        href = a.get("href", "")
        if not href:
            continue
        span = a.find("span")
        name = span.get_text(strip=True) if span else a.get_text(strip=True)
        if not name:
            continue
        items.append({"name": name, "url": urljoin(BASE_URL, href)})
    return items


# ── Step 2: article links from a subspecialty page ───────────────────────────

def get_articles(soup):
    results = []
    for li in soup.select("li.mb-24.accordion-item"):
        collapse = li.find("div", class_=lambda c: c and "accordion-collapse" in c)
        if not collapse:
            continue
        for h3 in collapse.find_all("h3"):
            a = h3.find("a", href=True)
            if not a:
                continue
            href  = a["href"]
            title = a.get_text(strip=True)
            article_url = urljoin(BASE_URL, href)
            pdf_url = urljoin(BASE_URL, href.replace("/doi/", "/doi/pdf/", 1)) if "/doi/" in href else None
            results.append({"title": title, "article_url": article_url, "pdf_url": pdf_url})
    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("RSNA ABR Core Exam Study Guide -- PDF Scraper")
    print("=" * 60)

    if "PASTE_YOUR" in COOKIE:
        print("\nERROR: Please replace COOKIE with your actual cookie string.")
        return

    print(f"\n[1] Fetching main page...")
    main_soup = get_soup(START_URL)

    subspecialties = get_subspecialty_links(main_soup)
    if not subspecialties:
        print("ERROR: No subspecialty links found -- page structure may have changed.")
        return

    print(f"\nFound {len(subspecialties)} subspecialties:")
    for s in subspecialties:
        print(f"  * {s['name']}")

    total, failed = 0, 0

    for idx, subspec in enumerate(subspecialties, 1):
        name   = subspec["name"]
        url    = subspec["url"]
        folder = os.path.join(OUTPUT_DIR, safe_filename(name))
        os.makedirs(folder, exist_ok=True)

        print(f"\n[{idx}/{len(subspecialties)}] {name}")

        try:
            subspec_soup = get_soup(url)
        except Exception as e:
            print(f"    [err] {e}")
            continue

        articles = get_articles(subspec_soup)
        print(f"    {len(articles)} articles found")

        for art in articles:
            pdf_url = art["pdf_url"]
            if not pdf_url:
                failed += 1
                continue

            doi_match = re.search(r"rg\.(\w+)", pdf_url)
            fname = f"rg_{doi_match.group(1)}.pdf" if doi_match else safe_filename(art["title"])[:80] + ".pdf"
            dest  = os.path.join(folder, fname)

            if download_pdf(pdf_url, dest):
                total += 1
            else:
                failed += 1

    print("\n" + "=" * 60)
    print(f"Done.  Downloaded: {total}  |  Failed/Skipped: {failed}")
    print(f"Saved to: {os.path.abspath(OUTPUT_DIR)}")
    print("=" * 60)


if __name__ == "__main__":
    main()