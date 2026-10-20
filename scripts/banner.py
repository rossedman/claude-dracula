#!/usr/bin/env python3
"""Render the repository banner from scripts/banner.html.

Output: docs/banner.png (2x, for the README and the site) and
docs/social-preview.png (1280x640, under GitHub's 1 MB limit for the
repository's social preview image).

Usage: python3 scripts/banner.py [out-dir]
Set CHROMIUM to a browser binary to use one Playwright did not install.
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

SOURCE = Path(__file__).with_name("banner.html")


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "docs")
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get("CHROMIUM") or None)
        for name, scale in [("banner.png", 2), ("social-preview.png", 1)]:
            page = browser.new_page(device_scale_factor=scale)
            page.goto(SOURCE.resolve().as_uri())
            page.evaluate("document.fonts.ready")
            page.locator("#banner").screenshot(path=str(out / name))
            print("wrote", out / name)
            page.close()
        browser.close()


if __name__ == "__main__":
    main()
