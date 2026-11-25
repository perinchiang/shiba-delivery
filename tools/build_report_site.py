"""
Shiba Delivery — GitHub Pages Mobile-First HTML Progress & Visual QA Report Portal Generator
============================================================================================
Reads every `reports/<slug>/report.json`, builds:
  - `dist/index.html`                 (Latest report front-and-center + archive switcher)
  - `dist/reports/<slug>/index.html`  (Permanent permalink for every milestone report)
  - `dist/reports/<slug>/imgs/*`      (Optimized crisp WebP/PNG screenshots)

Zero external Python packages required (pure Python 3 stdlib, runs cleanly in GitHub Actions!).

Usage:
  python3 tools/build_report_site.py --out dist
"""
import argparse
import html
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = ROOT / "reports"


def esc(s: str) -> str:
    return html.escape(str(s), quote=True)


def render_page(report: dict, all_reports: list, is_root: bool) -> str:
    slug = report["slug"]
    prefix = f"reports/{slug}/" if is_root else ""
    root_link = "./" if is_root else "../../"

    # Archive nav chips
    archive_items = []
    for r in all_reports:
        href = f"{root_link}reports/{r['slug']}/"
        active = " active" if r["slug"] == slug else ""
        archive_items.append(
            f'<a class="arch-chip{active}" href="{href}">'
            f'<span class="arch-date">{esc(r.get("date", ""))}</span>'
            f'<span class="arch-title">{esc(r.get("short_title", r["title"]))}</span></a>'
        )
    archive_html = "\n".join(archive_items)

    # Metrics pills
    metric_pills = []
    for m in report.get("metrics", []):
        metric_pills.append(
            f'<div class="metric-pill">'
            f'<div class="m-val">{esc(m["value"])}</div>'
            f'<div class="m-lbl">{esc(m["label"])}</div></div>'
        )
    metrics_html = f'<div class="metrics-grid">{"".join(metric_pills)}</div>' if metric_pills else ""

    # Bullet sections helper
    def render_list(items: list) -> str:
        if not items:
            return ""
        lis = []
        for it in items:
            if isinstance(it, dict):
                lis.append(f'<li><b>{esc(it["head"])}</b>：{esc(it["body"])}</li>')
            else:
                lis.append(f'<li>{esc(it)}</li>')
        return f'<ul class="clean-list">{"".join(lis)}</ul>'

    # Interactive In-Place Comparison Switchers (great on iPhone screens!)
    compare_blocks = []
    for ci, grp in enumerate(report.get("comparisons", [])):
        tabs_html = []
        panels_html = []
        for ti, item in enumerate(grp["items"]):
            act = " active" if ti == 0 else ""
            src = prefix + item["src"]
            tabs_html.append(
                f'<button class="tab-btn{act}" data-grp="{ci}" data-idx="{ti}" '
                f'onclick="switchTab({ci},{ti})">{esc(item["tab"])}</button>'
            )
            panels_html.append(
                f'<figure class="cmp-panel{act}" data-grp="{ci}" data-idx="{ti}" '
                f'onclick="openModal(\'{esc(src)}\', `{esc(item["caption"])}`)">'
                f'<img src="{esc(src)}" alt="{esc(item["caption"])}" loading="lazy" />'
                f'<figcaption><span class="cap-main">{esc(item["caption"])}</span>'
                f'<span class="cap-sub">{esc(item.get("meta", ""))}</span></figcaption></figure>'
            )
        compare_blocks.append(f"""
        <div class="cmp-card">
          <div class="cmp-head">
            <h3>{esc(grp["title"])}</h3>
            <p class="cmp-note">{esc(grp.get("note", ""))}</p>
            <div class="tab-bar">{"".join(tabs_html)}</div>
          </div>
          <div class="cmp-stage">{"".join(panels_html)}</div>
        </div>""")

    compare_section = ""
    if compare_blocks:
        compare_section = f"""
        <section class="sec">
          <h2>同机位多端切换对比 <span class="hint">点上方标签原位切换 · 点图全屏放大</span></h2>
          <div class="cmp-list">{"".join(compare_blocks)}</div>
        </section>"""

    # Screenshot Gallery
    gallery_cards = []
    for shot in report.get("gallery", []):
        src = prefix + shot["src"]
        gallery_cards.append(f"""
        <figure class="shot-card" onclick="openModal('{esc(src)}', `{esc(shot['title'])}`)">
          <img src="{esc(src)}" alt="{esc(shot['title'])}" loading="lazy" />
          <figcaption>
            <div class="shot-title">{esc(shot["title"])}</div>
            <div class="shot-meta">{esc(shot.get("meta", ""))}</div>
          </figcaption>
        </figure>""")
    gallery_section = ""
    if gallery_cards:
        gallery_section = f"""
        <section class="sec">
          <h2>实机运行截图 <span class="hint">点击任意图片放大细看</span></h2>
          <div class="shot-grid">{"".join(gallery_cards)}</div>
        </section>"""

    own_calls_html = ""
    if report.get("own_calls"):
        own_calls_html = f"""
        <section class="sec card-box">
          <h2>AI 自主拍板（Own Calls）</h2>
          {render_list(report["own_calls"])}
        </section>"""

    decisions_html = ""
    if report.get("next_steps"):
        decisions_html = f"""
        <section class="sec card-box accent-box">
          <h2>待你确认 &amp; 下一步计划</h2>
          {render_list(report["next_steps"])}
        </section>"""

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>{esc(report["title"])}｜阿柴快送进度报告</title>
<style>
  :root {{
    --bg:#0e1419; --surface:#162029; --surface2:#1d2a36; --border:#2a3b49;
    --ink:#f4efe4; --muted:#9bb0be; --gold:#f3c86b; --teal:#55c4ae;
  }}
  * {{ box-sizing:border-box; }}
  body {{
    margin:0; padding:16px 14px 56px; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans SC","Helvetica Neue",sans-serif;
    line-height:1.6; -webkit-font-smoothing:antialiased;
  }}
  .wrap {{ max-width:1120px; margin:0 auto; }}
  .hero {{
    background:linear-gradient(135deg,#172834 0%,#1d2530 100%);
    border:1px solid var(--border); border-radius:18px; padding:20px 20px 18px;
    margin-bottom:18px;
  }}
  .eyebrow {{
    display:inline-flex; gap:8px; align-items:center; font-size:12px; font-weight:600;
    color:var(--gold); background:rgba(243,200,107,.12); padding:4px 10px;
    border-radius:999px; margin-bottom:10px;
  }}
  h1 {{ margin:0 0 8px; font-size:22px; line-height:1.35; }}
  .summary {{ margin:0; color:#d7e1e8; font-size:14.5px; }}
  .metrics-grid {{
    display:grid; grid-template-columns:repeat(auto-fit,minmax(135px,1fr));
    gap:10px; margin-top:16px;
  }}
  .metric-pill {{
    background:rgba(10,16,22,.48); border:1px solid rgba(255,255,255,.08);
    border-radius:12px; padding:10px 12px;
  }}
  .m-val {{ font-size:16px; font-weight:700; color:var(--teal); }}
  .m-lbl {{ font-size:11.5px; color:var(--muted); margin-top:2px; }}

  .sec {{ margin-bottom:22px; }}
  .sec h2 {{
    margin:0 0 10px; font-size:17px; color:var(--gold);
    display:flex; flex-wrap:wrap; align-items:baseline; gap:8px;
  }}
  .hint {{ font-size:12px; font-weight:400; color:var(--muted); }}
  .card-box {{
    background:var(--surface); border:1px solid var(--border);
    border-radius:16px; padding:16px 18px;
  }}
  .accent-box {{ border-color:rgba(243,200,107,.45); background:linear-gradient(180deg,#1a242d,#162028); }}
  .clean-list {{ margin:0; padding-left:18px; font-size:14px; color:#e4e9ed; }}
  .clean-list li {{ margin-bottom:8px; }}
  .clean-list li:last-child {{ margin-bottom:0; }}

  .cmp-list {{ display:grid; gap:16px; }}
  .cmp-card {{
    background:var(--surface); border:1px solid var(--border);
    border-radius:16px; overflow:hidden;
  }}
  .cmp-head {{ padding:14px 16px 10px; }}
  .cmp-head h3 {{ margin:0 0 4px; font-size:15.5px; }}
  .cmp-note {{ margin:0 0 10px; font-size:12.5px; color:var(--muted); }}
  .tab-bar {{ display:flex; flex-wrap:wrap; gap:6px; }}
  .tab-btn {{
    appearance:none; border:1px solid var(--border); background:var(--surface2);
    color:var(--ink); font-size:12.5px; font-weight:600; padding:6px 12px;
    border-radius:999px; cursor:pointer; transition:all .15s ease;
  }}
  .tab-btn.active {{ background:var(--gold); color:#12181d; border-color:var(--gold); }}
  .cmp-panel {{ display:none; margin:0; cursor:zoom-in; }}
  .cmp-panel.active {{ display:block; }}
  .cmp-panel img {{ display:block; width:100%; height:auto; background:#090d11; }}
  .cmp-panel figcaption {{
    padding:10px 14px; display:flex; flex-wrap:wrap; justify-content:space-between; gap:6px;
    background:#121a22; font-size:12.5px;
  }}
  .cap-main {{ font-weight:600; color:var(--ink); }}
  .cap-sub {{ color:var(--muted); }}

  .shot-grid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }}
  @media (max-width:740px) {{ .shot-grid {{ grid-template-columns:1fr; }} h1 {{ font-size:19px; }} }}
  .shot-card {{
    margin:0; background:var(--surface); border:1px solid var(--border);
    border-radius:14px; overflow:hidden; cursor:zoom-in;
  }}
  .shot-card img {{ display:block; width:100%; height:auto; aspect-ratio:16/10; object-fit:cover; }}
  .shot-card figcaption {{ padding:10px 12px; }}
  .shot-title {{ font-size:13.5px; font-weight:600; }}
  .shot-meta {{ font-size:12px; color:var(--muted); margin-top:2px; }}

  .archive {{
    margin-top:28px; padding-top:18px; border-top:1px solid var(--border);
  }}
  .archive h2 {{ font-size:15px; color:var(--muted); margin:0 0 10px; }}
  .arch-list {{ display:flex; flex-wrap:wrap; gap:8px; }}
  .arch-chip {{
    display:inline-flex; gap:8px; align-items:center; text-decoration:none;
    background:var(--surface); border:1px solid var(--border); color:var(--ink);
    padding:7px 12px; border-radius:10px; font-size:12.5px;
  }}
  .arch-chip.active {{ border-color:var(--teal); background:rgba(85,196,174,.14); }}
  .arch-date {{ color:var(--gold); font-weight:600; }}

  #modal {{
    display:none; position:fixed; inset:0; background:rgba(5,9,13,.94); z-index:999;
    align-items:center; justify-content:center; flex-direction:column; padding:12px;
  }}
  #modal.open {{ display:flex; }}
  #modal img {{ max-width:98vw; max-height:84vh; border-radius:8px; object-fit:contain; }}
  #modal .mcap {{ margin-top:10px; color:#f2eee4; font-size:13.5px; text-align:center; }}
</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div class="eyebrow">
        <span>阿柴快送 · Godot 4.7 Steam 桌面版进度报告</span>
        <span>·</span>
        <span>{esc(report.get("date", ""))}</span>
      </div>
      <h1>{esc(report["title"])}</h1>
      <p class="summary">{esc(report.get("summary", ""))}</p>
      {metrics_html}
    </header>

    <section class="sec card-box">
      <h2>本次做了什么</h2>
      {render_list(report.get("changes", []))}
    </section>

    {compare_section}
    {gallery_section}
    {own_calls_html}
    {decisions_html}

    <footer class="archive">
      <h2>历史进度报告归档</h2>
      <div class="arch-list">{archive_html}</div>
    </footer>
  </div>

  <div id="modal" onclick="this.classList.remove('open')">
    <img id="mimg" src="" alt="" />
    <div id="mcap" class="mcap"></div>
  </div>

  <script>
    function switchTab(grp, idx) {{
      document.querySelectorAll('.tab-btn[data-grp="' + grp + '"]').forEach(function(b) {{
        b.classList.toggle('active', Number(b.dataset.idx) === idx);
      }});
      document.querySelectorAll('.cmp-panel[data-grp="' + grp + '"]').forEach(function(p) {{
        p.classList.toggle('active', Number(p.dataset.idx) === idx);
      }});
    }}
    function openModal(src, cap) {{
      document.getElementById('mimg').src = src;
      document.getElementById('mcap').textContent = cap + '（轻点任意处关闭）';
      document.getElementById('modal').classList.add('open');
    }}
  </script>
</body>
</html>"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="dist", help="Output static site directory")
    args = parser.parse_args()

    out_dir = (ROOT / args.out).resolve()
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    reports = []
    if REPORTS_DIR.exists():
        for rdir in sorted(REPORTS_DIR.iterdir(), reverse=True):
            meta_file = rdir / "report.json"
            if rdir.is_dir() and meta_file.exists():
                data = json.loads(meta_file.read_text(encoding="utf-8"))
                data["slug"] = rdir.name
                data["_dir"] = rdir
                reports.append(data)

    if not reports:
        raise SystemExit("No reports found in reports/*/report.json")

    for r in reports:
        dest = out_dir / "reports" / r["slug"]
        dest.mkdir(parents=True, exist_ok=True)
        imgs_src = r["_dir"] / "imgs"
        if imgs_src.exists():
            shutil.copytree(imgs_src, dest / "imgs", dirs_exist_ok=True)
        (dest / "index.html").write_text(render_page(r, reports, is_root=False), encoding="utf-8")

    # Root index.html always opens straight into the latest milestone report!
    latest = reports[0]
    (out_dir / "index.html").write_text(render_page(latest, reports, is_root=True), encoding="utf-8")
    (out_dir / ".nojekyll").write_text("", encoding="utf-8")
    print(f"[ReportSite] Built {len(reports)} report(s) into {out_dir} (latest: {latest['slug']})")


if __name__ == "__main__":
    main()
