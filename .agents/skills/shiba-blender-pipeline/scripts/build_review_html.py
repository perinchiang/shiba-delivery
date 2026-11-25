#!/usr/bin/env /usr/local/bin/python3
"""Build a self-contained mobile-friendly HTML Cycles QA review gallery (inline CSS/JS + embedded JPEG data URIs)."""
import argparse
import base64
import io
from pathlib import Path
from PIL import Image


def build_gallery(img_dir, out_html, title="Gate 1 审图图册", summary="", max_w=1120, quality=85):
    img_dir = Path(img_dir)
    out_html = Path(out_html)
    pngs = sorted([p for p in img_dir.glob("*.png") if not p.name.startswith("_")])
    if not pngs:
        raise SystemExit(f"No PNG images found in {img_dir}")

    cards = []
    for p in pngs:
        im = Image.open(p).convert("RGB")
        im.thumbnail((max_w, int(max_w * 0.72)), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=quality, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        label = p.stem
        cards.append(
            f'<figure class="card"><figcaption>{label}</figcaption>'
            f'<img src="data:image/jpeg;base64,{b64}" alt="{label}" onclick="openZoom(this.src,this.alt)" loading="lazy"></figure>'
        )

    html = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title}</title>
<style>
  :root {{ color-scheme: dark; }} * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; background: #12171d; color: #f2f4f7; padding: 14px; }}
  header {{ max-width: 960px; margin: 0 auto 14px; padding: 14px 16px; background: #1b232c; border-radius: 14px; border: 1px solid #2b3846; }}
  h1 {{ margin: 0 0 6px; font-size: 18px; }} .summary {{ margin: 0; font-size: 13.5px; line-height: 1.6; color: #c7d2de; }}
  main {{ max-width: 960px; margin: 0 auto; display: grid; gap: 14px; }}
  .card {{ margin: 0; background: #182028; border-radius: 14px; overflow: hidden; border: 1px solid #293543; }}
  .card figcaption {{ padding: 10px 14px; font-size: 13.5px; font-weight: 600; color: #e7eef5; border-bottom: 1px solid #24303d; }}
  .card img {{ display: block; width: 100%; height: auto; cursor: zoom-in; }}
  #zoom {{ position: fixed; inset: 0; background: rgba(6,10,14,.94); display: none; flex-direction: column; align-items: center; justify-content: center; padding: 12px; z-index: 99; }}
  #zoom.open {{ display: flex; }} #zoom img {{ max-width: 100%; max-height: 86vh; border-radius: 8px; object-fit: contain; }}
  #zoom p {{ margin: 10px 0 0; font-size: 13px; color: #d8e1ea; text-align: center; }}
</style></head><body>
<header><h1>{title}</h1><p class="summary">{summary or "点击任意图片可全屏放大。"}</p></header>
<main>{"".join(cards)}</main>
<div id="zoom" onclick="this.classList.remove('open')"><img id="zI" src="" alt=""><p id="zC"></p></div>
<script>function openZoom(s,c){{document.getElementById('zI').src=s;document.getElementById('zC').textContent=c;document.getElementById('zoom').classList.add('open');}}</script>
</body></html>"""
    out_html.write_text(html, encoding="utf-8")
    print(f"Built self-contained gallery: {out_html} ({out_html.stat().st_size / 1024:.1f} KB, {len(pngs)} images)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--title", default="Gate 1 审图图册")
    ap.add_argument("--summary", default="")
    args = ap.parse_args()
    build_gallery(args.dir, args.out, args.title, args.summary)
