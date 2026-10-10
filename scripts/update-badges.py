#!/usr/bin/env python3
"""Build the badge markup from LeetCode's GraphQL API and inline it into index.html.

Full resolution badge artwork is hotlinked from assets.leetcode.com instead of
using the downscaled 48x48 copies embedded in the showcase SVG.
"""

import html
import json
import sys
import urllib.request
from pathlib import Path

USERNAME = "Gogo200202"
GRAPHQL = "https://leetcode.com/graphql"
QUERY = """
query userBadges($username: String!) {
  matchedUser(username: $username) {
    badges {
      shortName
      displayName
      icon
      creationDate
      category
      medal { config { iconGif } }
    }
  }
}
"""
CATEGORY_LABELS = {
    "DCC": "Daily Medals",
    "STUDY_PLAN": "Study Plan Medals",
    "COMPETITION": "Competition Medals",
    "ANNUAL": "Annual Medals",
    "SUBMISSION": "Submission Days",
}
CATEGORY_ORDER = list(CATEGORY_LABELS)

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
START = "<!--BADGES:START-->"
END = "<!--BADGES:END-->"


def fetch_badges() -> list[dict]:
    body = json.dumps({"query": QUERY, "variables": {"username": USERNAME}}).encode()
    req = urllib.request.Request(
        GRAPHQL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) badges-page",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        data = json.load(res)

    if data.get("errors"):
        raise RuntimeError(data["errors"])
    matched = (data.get("data") or {}).get("matchedUser")
    if not matched:
        raise RuntimeError("user not found")
    return matched.get("badges") or []


def render(badges: list[dict]) -> str:
    grouped: dict[str, list[dict]] = {}
    for badge in badges:
        grouped.setdefault(badge.get("category") or "OTHER", []).append(badge)

    order = [c for c in CATEGORY_ORDER if c in grouped]
    order += [c for c in grouped if c not in order]

    parts = [
        '<div class="showCase" style="background-color:#000;border:none">',
        "<div>",
        '<span class="header" style="color:#efefef">',
        '<img src="logo.webp" alt="LeetCode Logo" title="LeetCode Logo" width="36" height="36"/>',
        f"<span>{html.escape(USERNAME)} LeetCode Badges</span>",
        "</span>",
        '<hr style="background-color:#fff"/>',
        "</div>",
    ]

    for category in order:
        items = sorted(
            grouped[category], key=lambda b: b.get("creationDate") or "", reverse=True
        )
        label = CATEGORY_LABELS.get(category, category)
        parts += [
            '<div class="category">',
            f'<p id="title" style="color:#fff">{html.escape(label)}</p>',
            '<div class="grid">',
        ]
        for badge in items:
            config = ((badge.get("medal") or {}).get("config")) or {}
            image = config.get("iconGif") or badge.get("icon") or ""
            name = badge.get("displayName") or badge.get("shortName") or badge.get("name") or ""
            date = badge.get("creationDate") or ""
            parts += [
                '<div class="badge">',
                f'<img src="{html.escape(image, quote=True)}" alt="{html.escape(name, quote=True)}" title="{html.escape(name, quote=True)}"/>',
                f'<p style="color:#efefef">{html.escape(name)}</p>',
                f'<h6 style="color:#fff">{html.escape(date)}</h6>',
                "</div>",
            ]
        parts += ["</div>", "</div>"]

    parts.append("</div>")
    return "".join(parts)


def main() -> int:
    document = INDEX.read_text(encoding="utf-8")
    if START not in document or END not in document:
        print(f"markers missing in {INDEX}", file=sys.stderr)
        return 1

    try:
        payload = render(fetch_badges())
    except Exception as exc:  # keep the previously deployed markup on failure
        print(f"warning: leaving existing badges in place ({exc})", file=sys.stderr)
        return 0

    head, rest = document.split(START, 1)
    _, tail = rest.split(END, 1)
    INDEX.write_text(f"{head}{START}\n{payload}\n{END}{tail}", encoding="utf-8")
    print(f"inlined {len(payload)} bytes of badge markup into {INDEX.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
