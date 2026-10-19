"""Create responsive WebP derivatives without changing source images/catalog.

Run with the bundled Python runtime (Pillow is required). The manifest is a
dictionary keyed by the original root-relative web path. Every variant retains
the complete image, its aspect ratio, transparency, and any animation frames.
"""

from __future__ import annotations

import concurrent.futures
import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
OUTPUT = DIST / "assets" / "responsive"
MANIFEST = ROOT / "data" / "responsive-images.json"
THUMBNAIL_OUTPUT = DIST / "assets" / "thumbnails"
THUMBNAIL_MANIFEST = ROOT / "data" / "gallery-thumbnails.json"
IMAGE_METADATA = ROOT / "data" / "image-metadata.json"
THUMBNAIL_SIZE = 128
QUALITY = 78
WORKERS = 4


def read_source(web_path: str) -> Path:
    path = (DIST / web_path.lstrip("/")).resolve()
    if not path.is_relative_to(DIST.resolve()) or not path.is_file():
        raise ValueError(f"Source image must exist inside dist: {web_path}")
    return path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rgba_or_rgb(image: Image.Image) -> Image.Image:
    if image.mode in {"RGBA", "LA"} or image.info.get("transparency") is not None:
        return image.convert("RGBA")
    return image.convert("RGB")


def process_image(task):
    web_path, widths, output_stem = task
    source = read_source(web_path)
    source_bytes = source.stat().st_size
    source_digest = digest(source)
    with Image.open(source) as original:
        animated = getattr(original, "n_frames", 1) > 1
        durations = []
        frames = []
        for frame in ImageSequence.Iterator(original):
            durations.append(frame.info.get("duration", original.info.get("duration", 100)))
            frames.append(rgba_or_rgb(ImageOps.exif_transpose(frame.copy())))
        width, height = frames[0].size
        target_widths = sorted({target for target in widths if target <= width} | {width})
        icc_profile = original.info.get("icc_profile")
        loop = original.info.get("loop", 0)
    variants = []
    for target_width in target_widths:
        target_height = max(1, round(height * target_width / width))
        resized_frames = [frame.resize((target_width, target_height), Image.Resampling.LANCZOS) if target_width != width else frame.copy() for frame in frames]
        filename = f"{output_stem}-w{target_width}.webp"
        target = OUTPUT / filename
        temporary = OUTPUT / (filename + ".tmp")
        parameters = {"quality": QUALITY, "method": 6, "exact": True}
        if icc_profile:
            parameters["icc_profile"] = icc_profile
        if animated:
            parameters.update(save_all=True, append_images=resized_frames[1:], duration=durations, loop=loop)
        resized_frames[0].save(temporary, "WEBP", **parameters)
        temporary.replace(target)
        with Image.open(target) as check:
            if check.size != (target_width, target_height):
                raise ValueError(f"Incorrect output dimensions for {target}")
            if animated and getattr(check, "n_frames", 1) != len(frames):
                raise ValueError(f"Animation frames were not retained for {target}")
            check.verify()
        variants.append({"src": "/assets/responsive/" + filename, "width": target_width, "height": target_height, "bytes": target.stat().st_size})
    if digest(source) != source_digest:
        raise ValueError(f"Source unexpectedly changed: {source}")
    same_width_variant = next(item for item in variants if item["width"] == width)
    return web_path, variants, {"originalBytes": source_bytes, "sameWidthBytes": same_width_variant["bytes"], "smallestBytes": variants[0]["bytes"], "originalWidth": width, "originalHeight": height, "animated": animated}


def process_thumbnail(web_path: str):
    source = read_source(web_path)
    source_digest = digest(source)
    with Image.open(source) as original:
        frames = [rgba_or_rgb(ImageOps.exif_transpose(frame.copy())) for frame in ImageSequence.Iterator(original)]
        width, height = frames[0].size
        scale = min(1, THUMBNAIL_SIZE / width, THUMBNAIL_SIZE / height)
        size = (max(1, round(width * scale)), max(1, round(height * scale)))
        resized = [frame.resize(size, Image.Resampling.LANCZOS) if frame.size != size else frame.copy() for frame in frames]
        filename = f"{source.stem}-{hashlib.sha256(web_path.encode()).hexdigest()[:8]}-thumb128.webp"
        target = THUMBNAIL_OUTPUT / filename
        temporary = target.with_suffix(".webp.tmp")
        parameters = {"quality": QUALITY, "method": 6, "exact": True}
        if original.info.get("icc_profile"):
            parameters["icc_profile"] = original.info["icc_profile"]
        if len(frames) > 1:
            durations = [frame.info.get("duration", original.info.get("duration", 100)) for frame in ImageSequence.Iterator(original)]
            parameters.update(save_all=True, append_images=resized[1:], duration=durations, loop=original.info.get("loop", 0))
        resized[0].save(temporary, "WEBP", **parameters)
        temporary.replace(target)
    with Image.open(target) as check:
        if check.size != size or max(check.size) > THUMBNAIL_SIZE:
            raise ValueError(f"Incorrect thumbnail dimensions: {target}")
        if getattr(check, "n_frames", 1) != len(frames):
            raise ValueError(f"Thumbnail animation frames were not retained: {target}")
        check.verify()
    if digest(source) != source_digest:
        raise ValueError(f"Source unexpectedly changed: {source}")
    return web_path, {"src": "/assets/thumbnails/" + filename, "width": size[0], "height": size[1], "bytes": target.stat().st_size, "sourceBytes": source.stat().st_size, "sourceWidth": width, "sourceHeight": height, "sourceSHA256": source_digest}


def generate_gallery_thumbnails(catalog):
    """Match productPage's actual gallery thumbnail list, excluding detail images."""
    THUMBNAIL_OUTPUT.mkdir(parents=True, exist_ok=True)
    paths = set()
    instances = 0
    products_with_gallery = 0
    products = catalog["products"]
    if len({product["id"] for product in products}) != len(products):
        raise ValueError("Product numbers must be unique")
    for product in products:
        primary = product.get("localImage")
        gallery = [image for image in product.get("galleryImages", []) if (image.get("localSrc") or image.get("localImage")) and image.get("localSrc") != primary]
        if not gallery:
            continue
        products_with_gallery += 1
        sources = [primary, *(image.get("localSrc") or image.get("localImage") for image in gallery)]
        if any(not source for source in sources):
            raise ValueError(f"Missing gallery image for product {product['id']}")
        paths.update(sources)
        instances += len(sources)
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        manifest = dict(pool.map(process_thumbnail, sorted(paths)))
    temporary = THUMBNAIL_MANIFEST.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(THUMBNAIL_MANIFEST)
    metadata = json.loads(IMAGE_METADATA.read_text(encoding="utf-8")) if IMAGE_METADATA.exists() else {}
    for image in manifest.values():
        metadata[image["src"]] = {"width": image["width"], "height": image["height"], "type": "image/webp"}
    temporary_metadata = IMAGE_METADATA.with_suffix(".json.tmp")
    temporary_metadata.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_metadata.replace(IMAGE_METADATA)
    source_bytes = sum(image["sourceBytes"] for image in manifest.values())
    thumbnail_bytes = sum(image["bytes"] for image in manifest.values())
    return {"productsChecked": len(products), "productIds": sorted(product["id"] for product in products), "productsWithGallery": products_with_gallery, "thumbnailInstances": instances, "uniqueThumbnails": len(manifest), "maximumEdge": THUMBNAIL_SIZE, "sourceBytes": source_bytes, "thumbnailBytes": thumbnail_bytes, "savedBytes": source_bytes - thumbnail_bytes, "savedPercent": round((source_bytes - thumbnail_bytes) / source_bytes * 100, 2) if source_bytes else 0, "sourceFilesUnchanged": True, "manifest": str(THUMBNAIL_MANIFEST)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--thumbnails-only", action="store_true", help="Only generate gallery thumbnails and their metadata; preserve all existing responsive, hero, and source images")
    args = parser.parse_args()
    catalog_path = ROOT / "data" / "catalog.json"
    catalog_digest = digest(catalog_path)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    if args.thumbnails_only:
        report = generate_gallery_thumbnails(catalog)
        if digest(catalog_path) != catalog_digest:
            raise ValueError("catalog.json changed while generating thumbnails")
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
        return
    OUTPUT.mkdir(parents=True, exist_ok=True)
    # Phone art direction: retain the same center pixels that object-fit:cover
    # displays at widths <=480px, without transferring the invisible edges.
    with Image.open(DIST / 'assets/hero-food.webp') as hero:
        crop_width = min(447, hero.width)
        crop_left = (hero.width - crop_width) // 2
        phone = hero.crop((crop_left, 0, crop_left + crop_width, hero.height))
        phone.save(DIST / 'assets/hero-phone.webp', 'WEBP', quality=65, method=6)
        phone.save(DIST / 'assets/hero-phone.avif', 'AVIF', quality=42, speed=6)
    targets = {}
    for product in catalog["products"]:
        if product.get("localImage"):
            targets[product["localImage"]] = [240, 480, 720]
    targets["/assets/hero-food.webp"] = [320, 480]
    targets["/assets/story-drying.webp"] = [480, 800, 1200]
    stem_sources = {}
    tasks = []
    for path, widths in sorted(targets.items()):
        stem = Path(path).stem
        if stem in stem_sources and stem_sources[stem] != path:
            stem += "-" + hashlib.sha256(path.encode()).hexdigest()[:8]
        stem_sources[stem] = path
        tasks.append((path, widths, stem))
    manifest, statistics = {}, {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for path, variants, stats in pool.map(process_image, tasks):
            manifest[path] = variants
            statistics[path] = stats
    if digest(catalog_path) != catalog_digest:
        raise ValueError("catalog.json changed while generating responsive images")
    temporary = MANIFEST.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(MANIFEST)
    source_bytes = sum(s["originalBytes"] for s in statistics.values())
    same_width_bytes = sum(s["sameWidthBytes"] for s in statistics.values())
    smallest_bytes = sum(s["smallestBytes"] for s in statistics.values())
    smaller_count = sum(s["sameWidthBytes"] < s["originalBytes"] for s in statistics.values())
    report = {"products": len(catalog["products"]), "uniqueProductPrimaryImages": len(targets) - 2, "sourceImagesIncludingHeroAndStory": len(targets), "generatedVariants": sum(len(v) for v in manifest.values()), "originalBytes": source_bytes, "sameWidthVariantBytes": same_width_bytes, "sameWidthSmallerImageCount": smaller_count, "sameWidthSavedBytes": source_bytes - same_width_bytes, "sameWidthSavedPercent": round((source_bytes - same_width_bytes) / source_bytes * 100, 2), "smallestVariantBytes": smallest_bytes, "smallestVariantSavedPercent": round((source_bytes - smallest_bytes) / source_bytes * 100, 2), "allVariantBytes": sum(v["bytes"] for variants in manifest.values() for v in variants), "animatedSourceCount": sum(s["animated"] for s in statistics.values()), "sourceFilesUnchanged": True, "catalogUnchanged": True, "manifest": str(MANIFEST)}
    report["galleryThumbnails"] = generate_gallery_thumbnails(catalog)
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
