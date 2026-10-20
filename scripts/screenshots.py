#!/usr/bin/env python3
"""Render README screenshots from the trees claude-dracula actually draws.

Input: the output of `claude plugin test` run with scripts/dump.test.tsx,
which prints one `DRACULA_DUMP {json}` line per drawn site.
Output: PNGs in docs/ (desktop and terminal previews, plus an accent strip).

The claude-dracula parts are drawn exactly from the mod's trees. The window,
prompt box and fonts around them are a neutral stand-in for the app.

Usage: python3 scripts/screenshots.py <test-output.txt> <out-dir>
"""
import html
import json
import sys
from pathlib import Path

import markdown
from playwright.sync_api import sync_playwright

DUMP = "DRACULA_DUMP "


def load(path):
    trees = {}
    for line in Path(path).read_text().splitlines():
        if DUMP in line:
            d = json.loads(line.split(DUMP, 1)[1])
            trees[(d["accent"], d["surface"], d["id"])] = d["tree"]
    return trees


def space(v, unit):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return f"{v * unit}px"
    return {"xs": f"{unit // 2}px", "sm": f"{unit}px", "md": f"{unit * 2}px", "lg": f"{unit * 3}px", "xl": f"{unit * 4}px"}[v]


def render(node, unit):
    if isinstance(node, str):
        return html.escape(node)
    t, p, kids = node["type"], node.get("props", {}), node.get("children", [])
    inner = "".join(render(k, unit) for k in kids)
    if t == "Box":
        s = ["display:flex", f"flex-direction:{p.get('flexDirection', 'row')}"]
        for key, css in [("justifyContent", "justify-content"), ("alignItems", "align-items")]:
            if key in p:
                s.append(f"{css}:{p[key]}")
        if "flexGrow" in p:
            s.append(f"flex-grow:{p['flexGrow']};min-width:0")
        if "gap" in p:
            s.append(f"gap:{space(p['gap'], unit)}")
        if "width" in p and isinstance(p["width"], (int, float)):
            # Desktop widths are pixels; terminal widths are cells.
            s.append(f"width:{p['width']}px;flex-shrink:0" if unit == 8 else f"width:{p['width']}ch;flex-shrink:0")
        if "paddingX" in p:
            s.append(f"padding-left:{space(p['paddingX'], unit)};padding-right:{space(p['paddingX'], unit)}")
        if "paddingY" in p:
            s.append(f"padding-top:{space(p['paddingY'], unit)};padding-bottom:{space(p['paddingY'], unit)}")
        if "marginY" in p:
            s.append(f"margin-top:{space(p['marginY'], unit)};margin-bottom:{space(p['marginY'], unit)}")
        if "borderStyle" in p:
            w = "3px" if p["borderStyle"] == "bold" else "1.5px"
            r = "10px" if p["borderStyle"] == "round" else "0"
            s.append(f"border:{w} solid {p.get('borderColor', 'currentColor')};border-radius:{r};padding-top:{unit // 2}px;padding-bottom:{unit // 2}px")
        if "backgroundColor" in p:
            s.append(f"background:{p['backgroundColor']}")
        return f'<div style="{";".join(s)}">{inner}</div>'
    if t == "Text":
        s = []
        if "color" in p:
            s.append(f"color:{p['color']}")
        if p.get("bold"):
            s.append("font-weight:700")
        if p.get("dimColor"):
            s.append("opacity:.7")
        if p.get("wrap", "").startswith("truncate"):
            s.append("white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0")
        return f'<span style="{";".join(s)}">{inner}</span>'
    if t == "Markdown":
        return '<div class="md">' + markdown.markdown(p["text"], extensions=["fenced_code"]) + "</div>"
    if t == "Svg":
        w, h = p.get("width", 24), p.get("height", 24)
        src = p["source"].replace("<svg ", f'<svg width="{w}" height="{h}" ', 1)
        return f'<span role="img" aria-label="{html.escape(p["alt"])}" style="display:inline-flex;flex-shrink:0">{src}</span>'
    return inner


BASE_CSS = """
*{box-sizing:border-box}
body{margin:0;background:#141413;color:#E8E6DF;-webkit-font-smoothing:antialiased}
.md p{margin:.4em 0}
.md pre{background:rgba(0,0,0,.22);border:1px solid rgba(98,114,164,.35);border-radius:6px;padding:10px 12px;overflow:hidden;margin:.6em 0;font-size:13px;line-height:1.45}
.md code{font-family:'DejaVu Sans Mono','Noto Color Emoji',ui-monospace,monospace}
.row{margin:10px 0}
"""


def desktop_page(trees, accent):
    g = lambda i: render(trees[(accent, "desktop", i)], 8)
    body = f"""
<div style="width:880px;padding:28px 36px 24px;font-family:'DejaVu Sans','Noto Color Emoji',system-ui,sans-serif;font-size:15px;line-height:1.55;background:#1F1E1C">
  <div class="row">{g('user')}</div>
  <div class="row">{g('tool1')}</div>
  <div class="row">{g('reply')}</div>
  <div class="row">{g('tool2')}</div>
  <div style="margin:-4px 0 10px 4px">{g('result')}</div>
  <div class="row" style="margin-top:14px">{g('spinner')}</div>
  <div style="margin-top:22px">{g('band')}</div>
  <div style="margin-top:8px;border:1px solid #3a3833;border-radius:14px;padding:14px 16px;color:#8d8a82;background:#2A2926">Reply to Claude…</div>
</div>"""
    return f"<!doctype html><html><head><meta charset=utf-8><style>{BASE_CSS}</style></head><body>{body}</body></html>"


def terminal_page(trees, accent):
    g = lambda i: render(trees[(accent, "terminal", i)], 9)
    body = f"""
<div style="width:880px;padding:22px 26px;font-family:'DejaVu Sans Mono','Noto Color Emoji',ui-monospace,monospace;font-size:14px;line-height:1.5;background:#282A36;color:#F8F8F2">
  <div class="row">{g('user')}</div>
  <div class="row">{g('tool1')}</div>
  <div class="row">{g('reply')}</div>
  <div class="row">{g('tool2')}</div>
  <div style="margin:-4px 0 10px 4px">{g('result')}</div>
  <div class="row">{g('turn')}</div>
  <div class="row" style="margin-top:14px">{g('spinner')}</div>
  <div style="margin-top:16px">{g('band')}</div>
  <div style="margin-top:6px;border:1px solid #44475A;padding:6px 10px;color:#6272A4">&gt; </div>
</div>"""
    return f"<!doctype html><html><head><meta charset=utf-8><style>{BASE_CSS}</style></head><body>{body}</body></html>"


def accents_page(trees):
    cells = ""
    for accent in ["purple", "pink", "cyan", "green"]:
        g = lambda i: render(trees[(accent, "desktop", i)], 8)
        cells += f"""<div style="flex:1;min-width:0;padding:14px 16px;background:#1F1E1C;border:1px solid #2f2d29">
          <div style="font-size:12px;color:#8d8a82;margin-bottom:10px;font-family:'DejaVu Sans Mono',monospace">/dracula accent {accent}</div>
          <div style="margin-bottom:10px">{g('spinner')}</div>{g('band')}</div>"""
    body = f'<div style="width:880px;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px;font-family:\'DejaVu Sans\',sans-serif;font-size:14px;background:#141413">{cells}</div>'
    return f"<!doctype html><html><head><meta charset=utf-8><style>{BASE_CSS}</style></head><body>{body}</body></html>"


def main():
    trees = load(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    pages = {
        "desktop.png": desktop_page(trees, "purple"),
        "terminal.png": terminal_page(trees, "purple"),
        "accents.png": accents_page(trees),
    }
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(device_scale_factor=2)
        for name, doc in pages.items():
            page.set_content(doc)
            page.locator("body > div").first.screenshot(path=str(out / name))
            print("wrote", out / name)
        browser.close()


if __name__ == "__main__":
    main()
