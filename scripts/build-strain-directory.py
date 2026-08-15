#!/usr/bin/env python3
"""Build src/data/strain-directory.json from Leafly listings + detail pages,
with Weedmaps medical tags when available. Run from the repo root."""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
TARGET = 150
LIST_PAGES = 12
OUT = Path("src/data/strain-directory.json")

USE_MAP = {
    "anxiety": "Anxiety",
    "depression": "Depression",
    "stress": "Stress",
    "pain": "Chronic pain",
    "chronic pain": "Chronic pain",
    "insomnia": "Insomnia",
    "ptsd": "PTSD",
    "arthritis": "Arthritis",
    "migraines": "Migraine",
    "migraine": "Migraine",
    "headaches": "Migraine",
    "fatigue": "Fatigue",
    "lack of appetite": "Nausea & appetite",
    "nausea": "Nausea & appetite",
    "muscle spasms": "Muscle spasm",
    "muscle spasm": "Muscle spasm",
    "cramps": "Muscle spasm",
    "inflammation": "Inflammation",
    "add/adhd": "ADHD",
    "adhd": "ADHD",
    "add": "ADHD",
    "ocd": "OCD",
}


def fetch(url: str, accept: str = "text/html") -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": accept},
    )
    with urllib.request.urlopen(req, timeout=25) as res:
        return res.read()


def next_data(html: str) -> dict | None:
    m = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">([\s\S]*?)</script>',
        html,
    )
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def type_from(raw: str | None) -> str:
    c = (raw or "").lower()
    if "indica" in c:
        return "indica"
    if "sativa" in c:
        return "sativa"
    return "hybrid"


def thc_from(value: object) -> str:
    if isinstance(value, (int, float)) and value > 0:
        return f"~{int(round(value))}%"
    if isinstance(value, str) and value.strip():
        return value.strip()
    return ""


def top_scored(obj: object, limit: int = 12) -> list[tuple[str, float]]:
    if not isinstance(obj, dict):
        return []
    items: list[tuple[str, float]] = []
    for v in obj.values():
        if not isinstance(v, dict):
            continue
        name = v.get("name")
        score = v.get("score")
        if isinstance(name, str) and name and isinstance(score, (int, float)):
            items.append((name, float(score)))
    items.sort(key=lambda x: -x[1])
    return items[:limit]


def mapped_uses(*objs: object) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    scored: list[tuple[str, float]] = []
    for obj in objs:
        scored.extend(top_scored(obj, 20))
    scored.sort(key=lambda x: -x[1])
    for name, score in scored:
        if score <= 0:
            continue
        label = USE_MAP.get(name.strip().lower())
        if not label or label.lower() in seen:
            continue
        seen.add(label.lower())
        out.append(label)
        if len(out) >= 6:
            break
    return out


def list_page(page: int) -> list[dict]:
    html = fetch(f"https://www.leafly.com/strains?page={page}").decode("utf-8", "ignore")
    data = next_data(html)
    strains = (
        (data or {}).get("props", {}).get("pageProps", {}).get("data", {}).get("strains")
    )
    if not isinstance(strains, list):
        return []
    out = []
    for raw in strains:
        name = raw.get("name")
        slug = raw.get("slug")
        if not isinstance(name, str) or not name or not isinstance(slug, str):
            continue
        out.append(
            {
                "name": name,
                "slug": slug,
                "type": type_from(raw.get("category") or raw.get("phenotype")),
                "thc": thc_from(raw.get("thc")),
                "imageUrl": raw.get("nugImage") if isinstance(raw.get("nugImage"), str) else "",
            }
        )
    return out


def leafly_detail(slug: str) -> list[str]:
    try:
        html = fetch(f"https://www.leafly.com/strains/{slug}").decode("utf-8", "ignore")
    except urllib.error.HTTPError:
        return []
    data = next_data(html)
    raw = (data or {}).get("props", {}).get("pageProps", {}).get("strain") or {}
    return mapped_uses(raw.get("conditions"), raw.get("symptoms"))


def weedmaps_uses(name: str) -> tuple[list[str], str]:
    q = urllib.parse.quote(name)
    url = f"https://api-g.weedmaps.com/wm/v1/strains?filter[name]={q}&page_size=5"
    try:
        raw = json.loads(fetch(url, "application/json"))
    except Exception:
        return [], ""
    items = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        return [], ""
    target = name.strip().lower()
    hit = None
    for item in items:
        attrs = item.get("attributes") if isinstance(item, dict) else None
        if not isinstance(attrs, dict):
            continue
        if str(attrs.get("name") or "").strip().lower() == target:
            hit = attrs
            break
    if hit is None and items:
        attrs = items[0].get("attributes")
        hit = attrs if isinstance(attrs, dict) else None
    if not hit:
        return [], ""
    conds = hit.get("medical_conditions")
    uses: list[str] = []
    seen: set[str] = set()
    if isinstance(conds, list):
        ranked = []
        for c in conds:
            if not isinstance(c, dict):
                continue
            n = c.get("name")
            votes = c.get("votes")
            if isinstance(n, str) and isinstance(votes, (int, float)) and votes > 0:
                ranked.append((n, float(votes)))
        ranked.sort(key=lambda x: -x[1])
        for n, _ in ranked:
            label = USE_MAP.get(n.strip().lower())
            if not label or label.lower() in seen:
                continue
            seen.add(label.lower())
            uses.append(label)
    image = hit.get("avatar_image_url")
    return uses, image if isinstance(image, str) else ""


def enrich(entry: dict) -> dict:
    uses = leafly_detail(entry["slug"])
    wm_uses, wm_image = weedmaps_uses(entry["name"])
    merged: list[str] = []
    seen: set[str] = set()
    for use in uses + wm_uses:
        key = use.lower()
        if key in seen:
            continue
        seen.add(key)
        merged.append(use)
    if not entry.get("imageUrl") and wm_image:
        entry["imageUrl"] = wm_image
    entry["uses"] = merged[:6]
    entry.pop("slug", None)
    return entry


def main() -> None:
    listed: list[dict] = []
    seen: set[str] = set()
    for page in range(1, LIST_PAGES + 1):
        print(f"list page {page}", flush=True)
        try:
            rows = list_page(page)
        except Exception as exc:
            print(f"  fail {exc}", flush=True)
            time.sleep(1)
            continue
        for row in rows:
            key = row["name"].strip().lower()
            if key in seen:
                continue
            seen.add(key)
            listed.append(row)
        if len(listed) >= TARGET + 10:
            break
        time.sleep(0.4)

    listed = listed[:TARGET]
    print(f"enriching {len(listed)} strains", flush=True)
    done: list[dict] = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        futs = {pool.submit(enrich, dict(row)): row["name"] for row in listed}
        for i, fut in enumerate(as_completed(futs), 1):
            name = futs[fut]
            try:
                done.append(fut.result())
            except Exception as exc:
                print(f"  skip {name}: {exc}", flush=True)
            if i % 10 == 0:
                print(f"  {i}/{len(listed)}", flush=True)

    done.sort(key=lambda r: r["name"].lower())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(done, indent=2) + "\n")
    print(f"wrote {len(done)} -> {OUT}")


if __name__ == "__main__":
    main()
