"""Import the public vitamin25.co.kr catalog without board/review data.

Requires the bundled Python runtime's lxml and Pillow. This importer never runs
source JavaScript and never stores complete product-page HTML or customer boards.
Only public menu categories, product facts, merchant detail content, and images
are persisted. Run --discover to audit scope first, or without flags to import.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import copy
import hashlib
import io
import json
import math
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from lxml import etree, html
from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ASSETS = ROOT / "dist" / "assets" / "catalog"
SOURCES = ROOT / "source-assets" / "catalog-originals"
BASE = "https://vitamin25.co.kr"
WORKERS = 5
CHECKED_AT = datetime.now(ZoneInfo("Asia/Seoul")).isoformat(timespec="seconds")
CHECKED_DATE = CHECKED_AT[:10]
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VitaminCatalogImport/1.0)", "Referer": BASE + "/"}
LOCK = threading.Lock()
FETCH_LOG: list[dict] = []
FAILURES: list[dict] = []
Image.MAX_IMAGE_PIXELS = 300_000_000


def log(*args):
    print(*args, flush=True)


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def absolute(value: str, base: str = BASE + "/") -> str:
    value = (value or "").strip()
    if value.startswith("data:"):
        return value
    return urllib.parse.urljoin(base, value)


def normalize_url(value: str, base: str = BASE + "/") -> str:
    value = absolute(value, base)
    parts = urllib.parse.urlsplit(value)
    if parts.scheme not in ("http", "https"):
        return ""
    # Korean paths must be encoded before passing to urllib.
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, urllib.parse.quote(urllib.parse.unquote(parts.path), safe="/:@+"), parts.query, ""))


def fetch(url: str, kind: str = "html") -> bytes:
    url = normalize_url(url)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as response:
                data = response.read(40 * 1024 * 1024 + 1)
                if len(data) > 40 * 1024 * 1024:
                    raise ValueError("Public asset exceeds 40 MiB read limit")
                with LOCK:
                    FETCH_LOG.append({"url": url, "kind": kind, "status": response.status, "bytes": len(data), "attempt": attempt + 1})
                return data
        except Exception as exc:
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
            else:
                with LOCK:
                    FAILURES.append({"url": url, "kind": kind, "error": str(exc), "attempts": 3})
                raise
    raise RuntimeError("Unreachable")


def document(raw: bytes):
    return html.fromstring(raw.decode("utf-8", errors="replace"), base_url=BASE + "/")


def class_xpath(name: str) -> str:
    return 'contains(concat(" ",normalize-space(@class)," ")," ' + name + ' ")'


def cleaned_text(node) -> str:
    if node is None:
        return ""
    node = copy.deepcopy(node)
    for unwanted in node.xpath('.//script | .//style | .//noscript | .//input | .//button | .//select | .//textarea | .//comment()'):
        unwanted.getparent().remove(unwanted)
    for br in node.xpath('.//br'):
        br.tail = "\n" + (br.tail or "")
    for child in node.iterdescendants():
        if child.tag in {"p", "div", "li", "tr", "h1", "h2", "h3", "h4", "section"}:
            child.tail = "\n" + (child.tail or "")
    lines = [re.sub(r"[\t\r\f\v \xa0]+", " ", line).strip() for line in node.text_content().splitlines()]
    return "\n".join(line for line in lines if line)


def inline_text(node) -> str:
    return re.sub(r"\s+", " ", cleaned_text(node)).strip()


def first(nodes):
    return nodes[0] if nodes else None


def hidden(node) -> bool:
    return any("displaynone" in a.get("class", "").split() or re.search(r"display\s*:\s*none", a.get("style", ""), re.I) or a.get("hidden") is not None for a in [node, *node.iterancestors()])


def parse_money(value: str):
    match = re.fullmatch(r"\s*([\d,]+)(?:\.0+)?\s*원?\s*", value or "")
    return int(match.group(1).replace(",", "")) if match else None


def category_id(href: str):
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(href).query)
    if "cate_no" in query:
        return int(query["cate_no"][0])
    match = re.search(r"/category/[^/]+/(\d+)/?", href)
    return int(match.group(1)) if match else None


def parse_listing(doc):
    containers = doc.xpath('//*[' + class_xpath("xans-product-listnormal") + ']')
    listing_nodes = []
    for container in containers:
        listing_nodes.extend(container.xpath('.//li[starts-with(@id,"anchorBoxId_")]'))
    if not containers:
        listing_nodes = doc.xpath('//li[starts-with(@id,"anchorBoxId_")]')
    products = {}
    for node in listing_nodes:
        pid = int(node.get("id").removeprefix("anchorBoxId_"))
        name_anchor = first(node.xpath('.//*[' + class_xpath("name") + ']//a'))
        if name_anchor is None:
            continue
        name = re.sub(r"^상품명\s*:\s*", "", inline_text(name_anchor)).strip()
        image_node = first(node.xpath('.//img[starts-with(@id,"eListPrdImage")]'))
        specs = {}
        for row in node.xpath('.//ul[' + class_xpath("spec") + ']/li'):
            label_node = first(row.xpath('./strong'))
            label = inline_text(label_node).strip(" :")
            row_text = inline_text(row)
            value = re.sub(r"^" + re.escape(label) + r"\s*:\s*", "", row_text) if label else row_text
            if label:
                specs[label] = value
        price_text = specs.get("판매가", "")
        products[pid] = {"id": pid, "name": name, "url": normalize_url(name_anchor.get("href", "")).split("?")[0], "priceText": price_text, "price": parse_money(price_text), "image": normalize_url(image_node.get("src", "")) if image_node is not None else "", "summary": specs.get("상품간략설명", ""), "listingSpecs": specs}
    expected_node = first(doc.xpath('//*[' + class_xpath("prdCount") + ']//strong'))
    expected_text = inline_text(expected_node)
    expected = int(re.sub(r"\D", "", expected_text)) if re.search(r"\d", expected_text) else None
    page_links = []
    for anchor in doc.xpath('//*[' + class_xpath("xans-product-normalpaging") + ']//a[@href]'):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(anchor.get("href")).query)
        if "page" in query:
            page_links.append(int(query["page"][0]))
    return products, expected, sorted(set(page_links)), bool(containers)


def crawl_category(category):
    cid = category["id"]
    pending = {1}
    seen_pages = set()
    products = {}
    pages = []
    expected = None
    while pending:
        number = min(pending)
        pending.remove(number)
        if number in seen_pages:
            continue
        if number > 200:
            raise ValueError(f"Unexpected category pagination > 200: {cid}")
        seen_pages.add(number)
        url = f"{BASE}/product/list.html?cate_no={cid}&page={number}"
        doc = document(fetch(url, "category"))
        found, page_expected, linked, normal = parse_listing(doc)
        if page_expected is not None:
            expected = page_expected
        for pid, product in found.items():
            products.setdefault(pid, product)
        if linked:
            pending.update(range(1, max(linked) + 1))
        pending.difference_update(seen_pages)
        pages.append({"page": number, "url": url, "productIds": list(found), "count": len(found), "advertisedCount": page_expected, "paginationPages": linked, "usedNormalListing": normal})
    audit = {"id": cid, "name": category["name"], "url": category["url"], "advertisedCount": expected, "discoveredCount": len(products), "countMatches": expected == len(products) if expected is not None else None, "pages": sorted(pages, key=lambda x: x["page"])}
    log("CATEGORY", cid, category["name"], len(products), "advertised", expected, "pages", len(pages))
    return products, audit


def discover():
    home = document(fetch(BASE + "/", "home"))
    api = json.loads(fetch(BASE + "/exec/front/Product/SubCategory", "category-api").decode("utf-8"))
    menu_ids = {}
    for anchor in home.xpath('//a[contains(@href,"/category/")]'):
        cid = category_id(anchor.get("href"))
        if cid is not None:
            menu_ids[cid] = {"name": inline_text(anchor), "url": normalize_url(anchor.get("href"))}
    api_by_id = {int(c["cate_no"]): c for c in api}
    included_ids = set(menu_ids)
    # Include children of actual public menu categories when the public category
    # endpoint exposes them, but exclude disconnected sample/demo categories.
    changed = True
    while changed:
        changed = False
        for cid, row in api_by_id.items():
            if int(row.get("parent_cate_no", 0)) in included_ids and cid not in included_ids:
                included_ids.add(cid)
                changed = True
    categories = []
    for cid in sorted(included_ids):
        row = api_by_id.get(cid, {})
        menu = menu_ids.get(cid, {})
        categories.append({"id": cid, "name": row.get("name") or menu.get("name", ""), "url": normalize_url(row.get("link_product_list") or menu.get("url") or f"/product/list.html?cate_no={cid}"), "parentId": int(row.get("parent_cate_no", 1)), "visibleInHomeMenu": cid in menu_ids})
    excluded = [{"id": int(c["cate_no"]), "name": c["name"], "parentId": int(c.get("parent_cate_no", 0)), "reason": "Not linked from the public homepage menu or its category descendants"} for c in api if int(c["cate_no"]) not in included_ids]
    products = {}
    memberships = {}
    audits = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(crawl_category, c): c for c in categories}
        for future in concurrent.futures.as_completed(futures):
            category = futures[future]
            try:
                found, audit = future.result()
            except Exception as exc:
                audits.append({"id": category["id"], "name": category["name"], "error": str(exc), "countMatches": False})
                continue
            audits.append(audit)
            for pid, item in found.items():
                products.setdefault(pid, item)
                memberships.setdefault(pid, []).append(category["id"])
    # Items featured on the homepage are public even if currently absent from a
    # category list. No unpublished product IDs are scanned or enumerated.
    home_products, _, _, _ = parse_listing(home)
    for pid, item in home_products.items():
        products.setdefault(pid, item)
        memberships.setdefault(pid, [])
    for pid, item in products.items():
        item["categoryIds"] = sorted(memberships[pid])
        item["featuredOnHome"] = pid in home_products
    result = {"source": BASE + "/", "sourceCheckedAt": CHECKED_AT, "categories": categories, "excludedApiCategories": excluded, "categoryAudits": sorted(audits, key=lambda x: x["id"]), "products": [products[p] for p in sorted(products)], "homeProductIds": sorted(home_products)}
    write_json(DATA / "catalog-discovery.json", result)
    write_json(DATA / "import-report.json", {"phase": "discovered", "sourceCheckedAt": CHECKED_AT, "publicCategoryCount": len(categories), "discoveredProductCount": len(products), "categoryAudits": result["categoryAudits"], "excludedApiCategories": excluded, "failures": FAILURES})
    return result


def img_source(node):
    for attribute in ("ec-data-src", "data-src", "src"):
        value = node.get(attribute, "")
        if value and not value.startswith("data:"):
            return normalize_url(value)
    return ""


def images_in(node):
    if node is None:
        return []
    result = []
    for image in node.xpath('.//img'):
        src = img_source(image)
        if src:
            result.append({"src": src, "alt": image.get("alt", ""), "sourceWidth": image.get("width"), "sourceHeight": image.get("height")})
    return result


def content_blocks(node):
    """Keep source text/image order without source HTML or executable code."""
    blocks = []
    buffer = []

    def flush():
        text = " ".join("".join(buffer).split())
        if text:
            blocks.append({"type": "text", "text": text})
        buffer.clear()

    def walk(element):
        if not isinstance(element.tag, str) or element.tag in {"script", "style", "noscript", "iframe", "object", "embed", "input", "button", "textarea"}:
            return
        if element.tag == "img":
            flush()
            src = img_source(element)
            if src:
                blocks.append({"type": "image", "src": src, "alt": element.get("alt", "")})
            return
        if element.tag in {"p", "div", "li", "tr", "br", "h1", "h2", "h3", "h4"}:
            flush()
        if element.text:
            buffer.append(element.text)
        for child in element:
            walk(child)
            if child.tail:
                buffer.append(child.tail)
        if element.tag in {"p", "div", "li", "tr", "br", "h1", "h2", "h3", "h4"}:
            flush()

    if node is not None:
        walk(node)
    flush()
    return blocks


def parse_product(listing, categories):
    pid = listing["id"]
    source_url = f"{BASE}/product/detail.html?product_no={pid}"
    doc = document(fetch(source_url, "product"))
    warnings = []
    info = first(doc.xpath('//*[' + class_xpath("infoArea") + ']'))
    if info is None:
        raise ValueError(f"Product {pid} missing product infoArea; not replaced with invented facts")
    specs = []
    fields = {}
    for row in info.xpath('.//*[' + class_xpath("xans-product-detaildesign") + ']//tr'):
        label = inline_text(first(row.xpath('./th')))
        value = inline_text(first(row.xpath('./td')))
        if label and value and label not in {"수량", "QR코드"}:
            specs.append({"label": label, "value": value})
            fields[label] = value
    name = fields.get("상품명") or inline_text(first(info.xpath('.//h1'))) or listing["name"]
    price_text = fields.get("판매가", listing["priceText"])
    price = parse_money(price_text)
    if "품절" in price_text or "SOLD OUT" in price_text.upper():
        status, evidence = "soldout", "Visible main selling-price field says " + price_text
    elif "준비" in price_text:
        status, evidence = "preparing", "Visible main selling-price field says " + price_text
    elif any(word in price_text for word in ("문의", "상담", "전화")):
        status, evidence = "inquiry", "Visible main selling-price field says " + price_text
    else:
        visible_buy = [node for node in info.xpath('.//*[@id="actionBuy"]') if not hidden(node)]
        visible_sold = [node for node in info.xpath('.//*[' + class_xpath("sub_sold") + ']') if not hidden(node)]
        if visible_sold:
            status, evidence = "soldout", "Visible sold-out indicator; hidden template words ignored"
        elif price is not None and visible_buy:
            status, evidence = "available", "Numeric main selling price and visible purchase action; no stock quantity inferred"
        else:
            status, evidence = "unknown", "No conclusive visible purchase status"
            warnings.append("Purchase availability not inferred from hidden template text")
    options = []
    seen_controls = set()
    for select in info.xpath('.//*[' + class_xpath("xans-product-option") + ']//select'):
        key = select.get("id") or select.get("name")
        if key in seen_controls:
            continue
        seen_controls.add(key)
        row = first(select.xpath('ancestor::tr[1]'))
        label = select.get("option_title") or (inline_text(first(row.xpath('./th'))) if row is not None else "") or select.get("name", "상품 옵션")
        required_attr = select.get("is_require") or select.get("required")
        required = required_attr in {"T", "true", "required", "1", ""} if required_attr is not None else None
        values = []
        placeholders = []
        for option in select.xpath('.//option'):
            value = option.get("value", "")
            choice = {"label": inline_text(option), "value": value, "disabled": option.get("disabled") is not None}
            if value in {"", "*", "**"}:
                placeholders.append(choice)
            else:
                values.append(choice)
        options.append({"name": label, "required": required, "id": key, "values": values, "placeholders": placeholders})
    for input_node in info.xpath('.//*[' + class_xpath("xans-product-option") + ']//input[not(@type="hidden")]'):
        if input_node.get("type") in {"button", "submit", "image"}:
            continue
        row = first(input_node.xpath('ancestor::tr[1]'))
        options.append({"name": inline_text(first(row.xpath('./th'))) if row is not None else input_node.get("name", "추가 옵션"), "required": None, "id": input_node.get("id") or input_node.get("name"), "type": input_node.get("type", "text"), "values": [{"label": input_node.get("value", ""), "value": input_node.get("value", "")} ] if input_node.get("type") in {"radio", "checkbox"} else [], "maxLength": input_node.get("maxlength")})
    detail = first(doc.xpath('//*[@id="prdDetail"]'))
    blocks = content_blocks(detail)
    detail_images = images_in(detail)
    detail_text = cleaned_text(detail)
    gallery_nodes = doc.xpath('//*[' + class_xpath("xans-product-image") + ']//img[contains(@class,"BigImage") or contains(@src,"/big/")]')
    gallery = []
    seen_gallery = set()
    for node in gallery_nodes:
        src = img_source(node)
        if src and src not in seen_gallery:
            gallery.append({"src": src, "alt": node.get("alt", "")})
            seen_gallery.add(src)
    if not gallery and listing.get("image"):
        gallery = [{"src": listing["image"], "alt": name}]
    guide = first(doc.xpath('//*[@id="prdInfo"]'))
    guide_content = {}
    if guide is not None:
        for fold in guide.xpath('.//*[' + class_xpath("ec-base-fold") + ']'):
            heading = inline_text(first(fold.xpath('.//h2'))).upper()
            contents = first(fold.xpath('.//*[' + class_xpath("contents") + ']'))
            guide_content[heading] = {"text": cleaned_text(contents), "images": images_in(contents), "blocks": content_blocks(contents)}
    canonical = first(doc.xpath('//link[@rel="canonical"]/@href'))
    item = {"id": pid, "name": name, "url": normalize_url(canonical) if canonical else listing["url"] or source_url, "sourceUrl": source_url, "price": price, "priceText": price_text, "listPrice": parse_money(fields.get("소비자가", "")), "listPriceText": fields.get("소비자가", ""), "currency": "KRW", "status": status, "statusEvidence": evidence, "categories": [categories[c] for c in listing["categoryIds"] if c in categories], "featuredOnHome": listing.get("featuredOnHome", False), "image": gallery[0]["src"] if gallery else "", "localImage": None, "imageWidth": None, "imageHeight": None, "summary": fields.get("상품간략설명") or fields.get("상품요약정보") or listing.get("summary", ""), "detailText": detail_text, "detailImages": detail_images, "detailBlocks": blocks, "specs": specs, "options": options, "galleryImages": gallery, "shippingText": guide_content.get("DELIVERY INFO", {}).get("text", ""), "paymentText": guide_content.get("PAYMENT INFO", {}).get("text", ""), "exchangeText": guide_content.get("EXCHANGE INFO", {}).get("text", ""), "exchangeImages": guide_content.get("EXCHANGE INFO", {}).get("images", []), "serviceText": guide_content.get("SERVICE INFO", {}).get("text", ""), "sourceCheckedDate": CHECKED_DATE, "warnings": warnings}
    if "3,000원" in item["shippingText"] and "4,000원" in item["shippingText"]:
        item["warnings"].append("Source shipping table says 3,000 KRW while its prose says 4,000 KRW; both preserved without choosing a fee")
    if not detail_images and not detail_text:
        item["warnings"].append("Source product detail container has no text or images")
    return item


def media_urls(products):
    urls = set()
    for item in products:
        for field in ("detailImages", "galleryImages", "exchangeImages"):
            urls.update(image["src"] for image in item[field] if image.get("src"))
    return sorted(urls)


def download_media(url, cache):
    previous = cache.get(url)
    if previous and all((ROOT / "dist" / segment["localSrc"].lstrip("/")).exists() for segment in previous.get("segments", [])) and previous.get("segments"):
        return url, previous
    try:
        raw = fetch(url, "image")
        digest = hashlib.sha256(raw).hexdigest()
        picture = Image.open(io.BytesIO(raw))
        picture.load()
        original_width, original_height = picture.size
        extension = "." + (picture.format or "bin").lower().replace("jpeg", "jpg")
        original_path = SOURCES / (digest + extension)
        if not original_path.exists():
            original_path.write_bytes(raw)
        segments = []
        # Do not downscale merchant text graphics. WebP's dimension ceiling is
        # handled by lossless spatial segmentation of very tall source images.
        tile_height = 12000
        frame_count = getattr(picture, "n_frames", 1)
        if frame_count > 1 and original_width <= 16383 and original_height <= 16383:
            name = f"{digest[:24]}.webp"
            target = ASSETS / name
            if not target.exists():
                frames, durations = [], []
                for frame in ImageSequence.Iterator(picture):
                    frames.append(frame.convert("RGBA"))
                    durations.append(frame.info.get("duration", 100))
                frames[0].save(target, "WEBP", save_all=True, append_images=frames[1:], duration=durations, loop=picture.info.get("loop", 0), quality=90, method=4)
            segments.append({"localSrc": "/assets/catalog/" + name, "width": original_width, "height": original_height, "bytes": target.stat().st_size})
        else:
            if original_width > 16383:
                raise ValueError(f"Image wider than WebP ceiling: {original_width}")
            count = math.ceil(original_height / tile_height)
            for index in range(count):
                top = index * tile_height
                tile = picture.crop((0, top, original_width, min(top + tile_height, original_height)))
                if tile.mode not in {"RGB", "RGBA"}:
                    tile = tile.convert("RGBA" if "transparency" in picture.info else "RGB")
                name = f"{digest[:24]}" + (f"-{index+1}" if count > 1 else "") + ".webp"
                target = ASSETS / name
                if not target.exists():
                    tile.save(target, "WEBP", quality=90, method=4)
                segments.append({"localSrc": "/assets/catalog/" + name, "width": tile.width, "height": tile.height, "bytes": target.stat().st_size, **({"segmentIndex": index + 1, "segmentCount": count, "sourceTop": top} if count > 1 else {})})
        return url, {"sha256": digest, "sourceBytes": len(raw), "sourceWidth": original_width, "sourceHeight": original_height, "originalFile": str(original_path.relative_to(ROOT)).replace("\\", "/"), "frameCount": frame_count, "segments": segments}
    except Exception as exc:
        return url, {"error": str(exc), "segments": []}


def apply_media(item, media):
    for field in ("detailImages", "galleryImages", "exchangeImages"):
        resolved = []
        for index, image in enumerate(item[field], 1):
            source_alt = image.get("sourceAlt", image.get("alt", ""))
            label = "상세 안내" if field == "detailImages" else "상품 이미지" if field == "galleryImages" else "교환 반품 안내"
            image = {**image, "sourceAlt": source_alt, "alt": f"{item['name']} {label} {index}"}
            asset = media.get(image["src"], {})
            if asset.get("segments"):
                for segment in asset["segments"]:
                    resolved.append({**image, **segment, "sha256": asset["sha256"], "sourceWidth": asset["sourceWidth"], "sourceHeight": asset["sourceHeight"]})
            else:
                error = asset.get("error", "Missing media record")
                resolved.append({**image, "localSrc": None, "width": None, "height": None, "error": error})
                warning = f"Source {field} image unavailable: {image['src']} ({error})"
                if warning not in item["warnings"]:
                    item["warnings"].append(warning)
        item[field] = resolved
    if item["galleryImages"]:
        main = item["galleryImages"][0]
        item.update({"localImage": main.get("localSrc"), "imageWidth": main.get("width"), "imageHeight": main.get("height")})
    blocks = []
    image_index = 0
    for block in item["detailBlocks"]:
        if block["type"] == "image":
            image_index += 1
            block = {**block, "sourceAlt": block.get("sourceAlt", block.get("alt", "")), "alt": f"{item['name']} 상세 안내 {image_index}"}
            asset = media.get(block["src"], {})
            if asset.get("segments"):
                blocks.extend([{**block, **segment} for segment in asset["segments"]])
            else:
                blocks.append({**block, "localSrc": None, "error": asset.get("error", "Missing media record")})
        else:
            blocks.append(block)
    item["detailBlocks"] = blocks


def remove_legacy_decorations(item):
    ignored = []
    for field in ("detailImages", "galleryImages", "exchangeImages", "detailBlocks"):
        kept = []
        for entry in item[field]:
            if urllib.parse.urlsplit(entry.get("src", "")).hostname == "static.naver.com":
                ignored.append(entry["src"])
            else:
                kept.append(entry)
        item[field] = kept
    if ignored:
        item["excludedDecorativeImages"] = sorted(set(ignored))
        item["warnings"].append("Legacy static.naver.com decorative recipe headings omitted: source TLS hostname mismatch; certificate validation was not disabled")


def repair_content():
    """Refresh option groups and remap cached media without downloading it again."""
    raw_path = DATA / "catalog-products-source.json"
    source = json.loads(raw_path.read_text(encoding="utf-8"))
    categories = {c["id"]: c for c in source["categories"]}
    discovery = json.loads((DATA / "catalog-discovery.json").read_text(encoding="utf-8"))
    listing_by_id = {p["id"]: p for p in discovery["products"]}
    option_products = [p for p in source["products"] if p["options"]]
    refreshed_options = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(parse_product, listing_by_id[p["id"]], categories): p["id"] for p in option_products}
        for future in concurrent.futures.as_completed(futures):
            item = future.result()
            refreshed_options[item["id"]] = item["options"]
            log("OPTIONS", item["id"], sum(len(o["values"]) for o in item["options"]), "choices")
    excluded_decorations = set()
    for item in source["products"]:
        if item["id"] in refreshed_options:
            item["options"] = refreshed_options[item["id"]]
        remove_legacy_decorations(item)
        excluded_decorations.update(item.get("excludedDecorativeImages", []))
    write_json(raw_path, source)
    media = json.loads((DATA / "catalog-media-index.json").read_text(encoding="utf-8"))
    catalog = copy.deepcopy(source)
    for item in catalog["products"]:
        apply_media(item, media)
    catalog["source"] = BASE + "/"
    write_json(DATA / "catalog.json", catalog)
    report_path = DATA / "import-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["excludedDecorativeImages"] = [{"src": src, "reason": "Legacy non-product Naver recipe heading; source TLS hostname mismatch, validation kept enabled"} for src in sorted(excluded_decorations)]
    report["missingImages"] = [image for image in report.get("missingImages", []) if image["src"] not in excluded_decorations]
    report["sourceImageUrlCount"] = len(media_urls(source["products"]))
    report["downloadedImageUrlCount"] = report["sourceImageUrlCount"] - len(report["missingImages"])
    report["optionProductCount"] = len(option_products)
    report["optionChoiceCount"] = sum(len(o["values"]) for p in catalog["products"] for o in p["options"])
    report["altText"] = "Source image pixels unchanged; misleading source alt retained as sourceAlt, final alt uses the exact product name and descriptive image order."
    write_json(report_path, report)
    log("CONTENT_REPAIRED", len(catalog["products"]), "products", report["optionChoiceCount"], "option choices", len(report["missingImages"]), "unavailable source image URLs")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--discover", action="store_true")
    parser.add_argument("--reuse-discovery", action="store_true")
    parser.add_argument("--repair-content", action="store_true", help="Refresh grouped option values, remove unusable legacy decorations, and remap cached media")
    parser.add_argument("--limit", type=int, help="Only for schema inspection; report marks the import partial")
    args = parser.parse_args()
    if args.repair_content:
        repair_content()
        return
    for directory in (DATA, ASSETS, SOURCES):
        directory.mkdir(parents=True, exist_ok=True)
    if args.reuse_discovery and (DATA / "catalog-discovery.json").exists():
        discovery = json.loads((DATA / "catalog-discovery.json").read_text(encoding="utf-8"))
    else:
        discovery = discover()
    log("DISCOVERED", len(discovery["categories"]), "categories", len(discovery["products"]), "products")
    if args.discover:
        return
    categories = {c["id"]: c for c in discovery["categories"]}
    listings = discovery["products"][:args.limit] if args.limit else discovery["products"]
    products, product_errors = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(parse_product, item, categories): item["id"] for item in listings}
        for future in concurrent.futures.as_completed(futures):
            pid = futures[future]
            try:
                item = future.result()
                products.append(item)
                log("PRODUCT", pid, item["status"], len(item["detailImages"]), "detail images", len(item["options"]), "options")
            except Exception as exc:
                product_errors.append({"id": pid, "error": str(exc)})
                log("PRODUCT_ERROR", pid, str(exc))
    products.sort(key=lambda item: item["id"])
    for item in products:
        remove_legacy_decorations(item)
    write_json(DATA / "catalog-products-source.json", {"products": products, "categories": discovery["categories"], "sourceCheckedAt": CHECKED_AT})
    media_path = DATA / "catalog-media-index.json"
    previous_media = json.loads(media_path.read_text(encoding="utf-8")) if media_path.exists() else {}
    urls = media_urls(products)
    media = {}
    log("MEDIA_URLS", len(urls))
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(download_media, url, previous_media): url for url in urls}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            url, result = future.result()
            media[url] = result
            if index % 25 == 0 or result.get("error"):
                log("MEDIA", index, "/", len(urls), "ERROR" if result.get("error") else "ok", result.get("error", ""))
            if index % 50 == 0:
                write_json(media_path, {**previous_media, **media})
    write_json(media_path, {**previous_media, **media})
    for item in products:
        apply_media(item, media)
    catalog = {"products": products, "categories": discovery["categories"], "sourceCheckedAt": CHECKED_AT, "source": BASE + "/"}
    write_json(DATA / "catalog.json", catalog)
    unique_files = {segment["localSrc"]: segment["bytes"] for asset in media.values() for segment in asset.get("segments", [])}
    missing_media = [{"src": url, "error": asset["error"]} for url, asset in media.items() if asset.get("error")]
    status_counts = {status: sum(item["status"] == status for item in products) for status in sorted({item["status"] for item in products})}
    report = {"phase": "complete" if not product_errors and not args.limit and all(a.get("countMatches") is not False for a in discovery["categoryAudits"]) else "partial", "sourceCheckedAt": CHECKED_AT, "discoveryCheckedAt": discovery["sourceCheckedAt"], "source": BASE + "/", "scope": "Products linked from actual homepage menu categories (including their public subcategories and every advertised pagination page), plus homepage featured products. No unpublished ID scan; disconnected API sample categories excluded.", "publicCategoryCount": len(categories), "discoveredProductCount": len(discovery["products"]), "importedProductCount": len(products), "statusCounts": status_counts, "categoryAudits": discovery["categoryAudits"], "excludedApiCategories": discovery["excludedApiCategories"], "homeFeaturedProductIds": discovery["homeProductIds"], "productErrors": product_errors, "sourceImageUrlCount": len(urls), "downloadedImageUrlCount": len(urls) - len(missing_media), "deduplicatedImageFileCount": len(unique_files), "compressedImageBytes": sum(unique_files.values()), "missingImages": missing_media, "failures": FAILURES, "privacy": {"productBoardsRequested": False, "customerReviewRowsStored": False, "completeSourcePageHtmlStored": False, "merchantDetailImagesPreserved": True}, "imageProcessing": "Merchant image contents retained. WebP quality 90, no upscaling or width downscaling. Very tall source images split into contiguous pieces to respect WebP's size limit; SHA-256 deduplication across URLs. Original bytes stored outside dist.", "shippingFee": "Source product shipping-table/prose conflicts are preserved; no fee chosen or invented.", "availability": "Status derives from the visible main price field and non-hidden purchase/sold-out actions; actual stock counts are not inferred.", "fetchAudit": FETCH_LOG}
    report["optionProductCount"] = sum(bool(item["options"]) for item in products)
    report["optionChoiceCount"] = sum(len(option["values"]) for item in products for option in item["options"])
    report["excludedDecorativeImages"] = [{"src": src, "reason": "Legacy non-product Naver recipe heading; source TLS hostname mismatch, validation kept enabled"} for src in sorted({src for item in products for src in item.get("excludedDecorativeImages", [])})]
    report["altText"] = "Source image pixels unchanged; misleading source alt retained as sourceAlt, final alt uses the exact product name and descriptive image order."
    write_json(DATA / "import-report.json", report)
    log("DONE", len(products), "products", status_counts, "images", len(unique_files), "bytes", sum(unique_files.values()), "missing", len(missing_media))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
