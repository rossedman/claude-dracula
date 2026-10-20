#!/usr/bin/env python3
"""Render README screenshots from the trees claude-dracula actually draws.

Input: the output of `claude plugin test` run with scripts/dump.test.tsx,
which prints one `DRACULA_DUMP {json}` line per drawn site.
Output: PNGs in docs/ (desktop, terminal and Alucard previews, plus an accent strip).

The claude-dracula parts are drawn exactly from the mod's trees. The window,
prompt box and fonts around them are a neutral stand-in for the app.

Usage: python3 scripts/screenshots.py <test-output.txt> <out-dir> [--html]
--html writes the pages as .html beside where the PNGs would go, with no browser.
PNGs use Playwright when installed, else a local Chrome or Chromium in headless mode.
"""
import html
import json
import sys
from pathlib import Path


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
        if "paddingLeft" in p:
            s.append(f"padding-left:{space(p['paddingLeft'], unit)}")
        if "flexShrink" in p:
            s.append(f"flex-shrink:{p['flexShrink']};min-width:0")
        if "backgroundColor" in p:
            s.append(f"background:{p['backgroundColor']}")
        return f'<div style="{";".join(s)}">{inner}</div>'
    if t == "Link":
        return f'<a href="{html.escape(p.get("href", ""))}" style="color:inherit;text-decoration:none">{inner}</a>'
    if t == "Text":
        s = ["white-space:pre-wrap"]
        if "color" in p:
            s.append(f"color:{p['color']}")
        if "backgroundColor" in p:
            s.append(f"background:{p['backgroundColor']}")
        if p.get("bold") or p.get("weight") in ("semibold", "bold"):
            s.append("font-weight:700")
        if p.get("italic"):
            s.append("font-style:italic")
        if p.get("underline"):
            s.append("text-decoration:underline")
        if p.get("strikethrough"):
            s.append("text-decoration:line-through")
        if p.get("mono") and unit == 8:
            s.append(f"font-family:{MONO};font-size:13px")
        if unit == 8 and p.get("size") in ("title", "heading"):
            s.append("font-size:" + ("20px" if p["size"] == "title" else "17px"))
        if unit == 8 and p.get("size") == "footnote":
            s.append("font-size:12px")
        if p.get("dimColor"):
            s.append("opacity:.7")
        if p.get("wrap", "").startswith("truncate"):
            s.append("white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0")
        return f'<span style="{";".join(s)}">{inner}</span>'
    if t == "Markdown":
        import markdown

        return '<div class="md">' + markdown.markdown(p["text"], extensions=["fenced_code"]) + "</div>"
    if t == "Svg":
        w, h = p.get("width", 24), p.get("height", 24)
        src = p["source"].replace("<svg ", f'<svg width="{w}" height="{h}" ', 1)
        return f'<span role="img" aria-label="{html.escape(p["alt"])}" style="display:inline-flex;flex-shrink:0">{src}</span>'
    return inner


MONO = "'SF Mono','JetBrains Mono','DejaVu Sans Mono',Menlo,'Apple Color Emoji','Noto Color Emoji',monospace"
SANS = "-apple-system,BlinkMacSystemFont,'Inter','DejaVu Sans','Apple Color Emoji','Noto Color Emoji',system-ui,sans-serif"

BASE_CSS = f"""
*{{box-sizing:border-box}}
body{{margin:0;background:#0E0E0D;color:#E8E6DF;-webkit-font-smoothing:antialiased}}
.md p{{margin:.4em 0}}
.md pre{{background:rgba(0,0,0,.22);border:1px solid rgba(98,114,164,.35);border-radius:6px;padding:10px 12px;overflow:hidden;margin:.6em 0;font-size:13px;line-height:1.45}}
.md code{{font-family:{MONO}}}
.row{{margin:10px 0}}
.lights{{display:flex;gap:8px}}
.lights i{{width:12px;height:12px;border-radius:50%;display:block}}
"""

LIGHTS = '<span class="lights"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></span>'


def doc(body):
    return f"<!doctype html><html><head><meta charset=utf-8><style>{BASE_CSS}</style></head><body>{body}</body></html>"


def transcript(g, surface):
    """The sample conversation, top to bottom, as the app stacks it."""
    turn = f'<div class="row">{g("turn")}</div>' if surface == "terminal" else ""
    return f"""
  <div class="row">{g('user')}</div>
  <div class="row">{g('group')}</div>
  <div class="row">{g('reply')}</div>
  <div class="row">{g('tool2')}</div>
  <div style="margin:-4px 0 10px 4px">{g('result')}</div>
  <div class="row">{g('edit')}</div>
  <div style="margin:-4px 0 10px 4px">{g('diff')}</div>
  {turn}
  <div class="row" style="margin-top:14px">{g('spinner')}</div>"""


def desktop_page(trees, accent, light=False):
    """The desktop app: a window with the conversation and the crypt docked on the right."""
    g = lambda i: render(trees[(accent, "desktop", i)], 8)
    win, chrome, line, field, hint = (
        ("#FAF9F5", "#F0EEE6", "#E3E0D6", "#FFFFFF", "#8A877E") if light else ("#262624", "#1F1E1C", "#33322E", "#30302E", "#8D8A82")
    )
    title_color = "#3D3929" if light else "#C2C0B6"
    body = f"""
<div style="width:1240px;padding:28px;background:{'#E9E6DC' if light else '#0E0E0D'}">
 <div style="border-radius:12px;overflow:hidden;border:1px solid {line};box-shadow:0 24px 60px rgba(0,0,0,.45);background:{win};font-family:{SANS};font-size:15px;line-height:1.55">
  <div style="height:44px;display:flex;align-items:center;gap:18px;padding:0 16px;background:{chrome};border-bottom:1px solid {line}">
    {LIGHTS}
    <span style="font-size:13px;color:{title_color};font-weight:600">Retry with backoff</span>
    <span style="font-size:12px;color:{hint}">~/code/retry · feat/retry-jitter</span>
  </div>
  <div style="display:flex">
   <div style="flex:1;min-width:0;padding:22px 34px 22px">
    {transcript(g, 'desktop')}
    <div style="margin-top:22px;white-space:nowrap">{g('band')}</div>
    <div style="margin-top:8px;border:1px solid {line};border-radius:14px;padding:14px 16px 12px;color:{hint};background:{field}">
      Reply to Claude…<div style="margin-top:14px;display:flex;justify-content:space-between;font-size:12px"><span>＋ &nbsp;⌘ &nbsp;@</span><span>Opus 5.5 &nbsp;↑</span></div>
    </div>
    <div style="margin-top:8px">{g('mode')}</div>
   </div>
   <div style="width:384px;flex-shrink:0;border-left:1px solid {line};background:{chrome}">
    <div style="height:40px;display:flex;align-items:center;padding:0 16px;font-size:12px;color:{hint};border-bottom:1px solid {line}">Crypt <span style="margin-left:auto">✕</span></div>
    <div style="padding:14px 16px;font-family:{MONO};font-size:13px;white-space:nowrap">{g('pane')}</div>
   </div>
  </div>
 </div>
</div>"""
    return doc(body)


def terminal_page(trees, accent):
    """A terminal window in the Dracula scheme, with the crypt docked beside the conversation."""
    g = lambda i: render(trees[(accent, "terminal", i)], 9)
    body = f"""
<div style="width:1240px;padding:28px;background:#0E0E0D">
 <div style="border-radius:10px;overflow:hidden;border:1px solid #44475A;box-shadow:0 24px 60px rgba(0,0,0,.5);background:#282A36;color:#F8F8F2;font-family:{MONO};font-size:14px;line-height:1.5">
  <div style="height:34px;display:flex;align-items:center;padding:0 14px;background:#21222C;border-bottom:1px solid #191A21;font-family:{SANS};font-size:12px;color:#6272A4">
    {LIGHTS}<span style="flex:1;text-align:center;margin-right:52px">claude — ~/code/retry — 132×44</span>
  </div>
  <div style="display:flex">
   <div style="flex:1;min-width:0;padding:16px 22px 18px">
    {transcript(g, 'terminal')}
    <div style="margin-top:16px;white-space:nowrap">{g('band')}</div>
    <div style="margin-top:6px;border:1px solid #44475A;border-radius:6px;padding:6px 10px;color:#6272A4">&gt; <span style="background:#F8F8F2;color:#282A36">&nbsp;</span></div>
    <div style="margin-top:6px">{g('mode')}</div>
   </div>
   <div style="width:410px;flex-shrink:0;border-left:1px solid #44475A;padding:16px 18px;white-space:nowrap">{g('pane')}</div>
  </div>
 </div>
</div>"""
    return doc(body)


def accents_page(trees):
    cells = ""
    for accent in ["purple", "pink", "cyan", "green"]:
        g = lambda i: render(trees[(accent, "desktop", i)], 8)
        cells += f"""<div style="flex:1;min-width:0;padding:14px 16px;background:#262624;border:1px solid #33322E;border-radius:10px">
          <div style="font-size:12px;color:#8d8a82;margin-bottom:10px;font-family:{MONO}">/dracula accent {accent}</div>
          <div style="margin-bottom:10px">{g('spinner')}</div><div style="white-space:nowrap">{g('band')}</div></div>"""
    body = f'<div style="width:840px;display:grid;grid-template-columns:1fr;gap:12px;padding:20px;font-family:{SANS};font-size:14px;background:#0E0E0D">{cells}</div>'
    return doc(body)


def capture(pages, out):
    """PNGs at 2x, with Playwright when it is installed, else the local Chrome."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return chrome_capture(pages, out)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(device_scale_factor=2)
        for name, page_doc in pages.items():
            page.set_content(page_doc)
            page.locator("body > div").first.screenshot(path=str(out / name))
            print("wrote", out / name)
        browser.close()


CHROMES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
]

SENTINEL = "#FF00FE"


def chrome_capture(pages, out):
    """Headless Chrome on a tall window over a sentinel backdrop, cropped to the page with Pillow."""
    import shutil
    import subprocess
    import tempfile
    import time

    from PIL import Image, ImageChops

    chrome = next((c for c in CHROMES if Path(c).exists() or shutil.which(c)), None)
    if not chrome:
        sys.exit("no Playwright and no Chrome: pip install playwright && playwright install chromium")
    with tempfile.TemporaryDirectory() as tmp:
        for name, page_doc in pages.items():
            src = Path(tmp) / name.replace(".png", ".html")
            src.write_text(page_doc.replace("body{margin:0;background:", f"body{{margin:0;background:{SENTINEL};--was:"))
            shot = Path(tmp) / name
            # A profile of its own, so a Chrome already open doesn't take the job. Some managed
            # Chromes write the shot and then never exit, so wait for the file and stop it.
            argv = [chrome, "--headless", f"--user-data-dir={tmp}/profile", "--hide-scrollbars", "--no-first-run",
                    "--window-size=1400,3200", "--force-device-scale-factor=2", f"--screenshot={shot}", src.as_uri()]
            child = subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            deadline = time.time() + 60
            while time.time() < deadline and child.poll() is None and not (shot.exists() and shot.stat().st_size):
                time.sleep(0.25)
            time.sleep(0.5)
            if child.poll() is None:
                child.kill()
            image = Image.open(shot).convert("RGB")
            # Color management shifts the sentinel a little, so crop to what is far from magenta.
            r, g, b = (band.point(lambda v, t=t: 255 if t(v) else 0) for band, t in zip(image.split(), (lambda v: v > 200, lambda v: v < 80, lambda v: v > 200)))
            magenta = ImageChops.multiply(ImageChops.multiply(r, g), b)
            box = ImageChops.invert(magenta).getbbox()
            # The page's last row and column blend into the backdrop; leave them out.
            box = (box[0], box[1], box[2] - 2, box[3] - 2)
            image.crop(box).save(out / name)
            print("wrote", out / name, f"{box[2] - box[0]}x{box[3] - box[1]}")


def main():
    trees = load(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    pages = {
        "desktop.png": desktop_page(trees, "purple"),
        "terminal.png": terminal_page(trees, "purple"),
        "alucard.png": desktop_page(trees, "alucard", light=True),
        "accents.png": accents_page(trees),
    }
    if "--html" in sys.argv:
        for name, page_doc in pages.items():
            (out / name.replace(".png", ".html")).write_text(page_doc)
            print("wrote", out / name.replace(".png", ".html"))
        return
    capture(pages, out)


if __name__ == "__main__":
    main()
