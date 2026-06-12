#!/usr/bin/env python3
"""Capture screenshots of the tf9 web UI for the README."""

import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080"
OUT = Path(__file__).parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)


def shot(page, name: str, url: str, *, wait_for=None, action=None, delay=600):
    page.goto(url, wait_until="networkidle")
    if wait_for:
        page.wait_for_selector(wait_for)
    if action:
        action(page)
    page.wait_for_timeout(delay)
    path = str(OUT / f"{name}.png")
    page.screenshot(path=path, full_page=False)
    print(f"  saved {name}.png")


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 1440, "height": 900},
            color_scheme="dark",
        )
        page = ctx.new_page()

        # 1 — Overview
        shot(page, "01-overview", f"{BASE}/#overview")

        # 2 — Runs list (empty or populated)
        shot(page, "02-runs", f"{BASE}/#runs", wait_for="table.runs-tbl")

        # 3 — Runs detail panel (click first row if present)
        def open_detail(p):
            row = p.query_selector("table.runs-tbl tbody tr")
            if row:
                row.click()
                p.wait_for_timeout(900)

        shot(page, "03-runs-detail", f"{BASE}/#runs",
             wait_for="table.runs-tbl", action=open_detail)

        # 4 — New Run modal
        def open_modal(p):
            p.wait_for_selector("button.btn-primary")
            p.click("button.btn-primary")
            p.wait_for_selector(".run-modal", state="visible")

        shot(page, "04-new-run-modal", f"{BASE}/#runs", action=open_modal)

        # 5 — Repositories
        shot(page, "05-repositories", f"{BASE}/#repos")

        # 6 — Config YAML editor
        shot(page, "06-config-yaml", f"{BASE}/#config")

        # 7 — Reports
        shot(page, "07-reports", f"{BASE}/#reports")

        # 8 — Sidebar collapsed
        def collapse_nav(p):
            p.wait_for_selector("button.nav-toggle-btn")
            p.click("button.nav-toggle-btn")
            p.wait_for_timeout(300)

        shot(page, "08-sidebar-collapsed", f"{BASE}/#runs",
             wait_for="table.runs-tbl", action=collapse_nav)

        browser.close()

    print(f"\nAll screenshots saved to {OUT}")


if __name__ == "__main__":
    main()
