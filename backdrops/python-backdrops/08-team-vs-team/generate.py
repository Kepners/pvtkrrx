"""TEAM_VS_TEAM sports poster proof generator.

Native 600x900 SVG output with companion JSON proof metadata. This generator
is intentionally fixture/event specific and must not be used for the sport-only
4K backdrop family in the sibling folders.
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
from pathlib import Path


W, H = 600, 900
LAYOUT_FAMILY = "TEAM_VS_TEAM"

TEAM_CODES = {
    "arsenal": "ARS",
    "manchester city": "MCI",
    "houston rockets": "HOU",
    "los angeles lakers": "LAL",
    "cleveland cavaliers": "CLE",
    "toronto raptors": "TOR",
    "philadelphia flyers": "PHI",
    "pittsburgh penguins": "PIT",
}

TEAM_COLORS = {
    "arsenal": ("#EF0107", "#063672", "#FFFFFF"),
    "manchester city": ("#6CABDD", "#1C2C5B", "#FFFFFF"),
    "houston rockets": ("#CE1141", "#000000", "#FFFFFF"),
    "los angeles lakers": ("#552583", "#FDB927", "#FFFFFF"),
    "cleveland cavaliers": ("#6F263D", "#FFB81C", "#FFFFFF"),
    "toronto raptors": ("#CE1141", "#000000", "#FFFFFF"),
    "philadelphia flyers": ("#F74902", "#000000", "#FFFFFF"),
    "pittsburgh penguins": ("#000000", "#FCB514", "#FFFFFF"),
}

LEAGUE_LABEL_RULES = [
    (re.compile(r"\b(?:english premier league|premier league|epl)\b", re.I), "EPL"),
    (re.compile(r"\b(?:uefa champions league|champions league|ucl)\b", re.I), "UCL"),
    (re.compile(r"\b(?:nba|national basketball)\b", re.I), "NBA"),
    (re.compile(r"\b(?:nhl|national hockey)\b", re.I), "NHL"),
    (re.compile(r"\b(?:mlb|major league baseball)\b", re.I), "MLB"),
    (re.compile(r"\b(?:nfl|national football league|american football)\b", re.I), "NFL"),
    (re.compile(r"\b(?:ipl|indian premier league|cricket)\b", re.I), "CRICKET"),
    (re.compile(r"\brugby\b", re.I), "RUGBY"),
    (re.compile(r"\bbasketball\b", re.I), "BASKETBALL"),
    (re.compile(r"\b(?:hockey|ice hockey)\b", re.I), "HOCKEY"),
    (re.compile(r"\b(?:football|soccer|fa cup|mls|la liga|serie a|bundesliga)\b", re.I), "FOOTBALL"),
]

TEAM_FIXTURES = {
    "epl-manchester-city-arsenal": {
        "title": "Manchester City vs Arsenal EPL",
        "sport": "Football",
        "league": "English Premier League",
        "league_code": "EPL",
        "home": "Manchester City",
        "away": "Arsenal",
        "date": "2026-04-30",
    },
    "nba-houston-rockets-lakers": {
        "title": "Houston Rockets vs Los Angeles Lakers",
        "sport": "Basketball",
        "league": "NBA",
        "league_code": "NBA",
        "home": "Houston Rockets",
        "away": "Los Angeles Lakers",
        "date": "2026-04-30",
    },
    "nba-cavaliers-raptors": {
        "title": "Cleveland Cavaliers vs Toronto Raptors",
        "sport": "Basketball",
        "league": "NBA",
        "league_code": "NBA",
        "home": "Cleveland Cavaliers",
        "away": "Toronto Raptors",
        "date": "2026-04-30",
    },
    "nhl-flyers-penguins": {
        "title": "Philadelphia Flyers vs Pittsburgh Penguins",
        "sport": "Hockey",
        "league": "NHL",
        "league_code": "NHL",
        "home": "Philadelphia Flyers",
        "away": "Pittsburgh Penguins",
        "date": "2026-04-30",
    },
}


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def escape_xml(value: str) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize_space(value).lower()).strip("-")


def team_key(value: str) -> str:
    return normalize_space(value).lower()


def team_code(value: str) -> str:
    key = team_key(value)
    if key in TEAM_CODES:
        return TEAM_CODES[key]
    words = [
        word
        for word in re.sub(r"[^a-z0-9 ]+", " ", key).split()
        if word not in {"the", "of", "fc", "cf", "sc", "club", "team"}
    ]
    if not words:
        return "TM"
    if len(words) == 1:
        return words[0][:3].upper()
    code = "".join(word[0] for word in words[:3]).upper()
    return code[:3]


def colors_for_team(value: str, fallback: tuple[str, str, str]) -> tuple[str, str, str]:
    return TEAM_COLORS.get(team_key(value), fallback)


def league_label_for(event: dict) -> str:
    explicit = normalize_space(event.get("league_code", ""))
    if explicit:
        return explicit
    text = normalize_space(
        " ".join(
            str(event.get(key, ""))
            for key in ("league", "sport", "title", "home", "away")
        )
    )
    for pattern, label in LEAGUE_LABEL_RULES:
        if pattern.search(text):
            return label
    sport = normalize_space(event.get("sport", ""))
    if re.search(r"basketball", sport, re.I):
        return "BASKETBALL"
    if re.search(r"hockey", sport, re.I):
        return "HOCKEY"
    if re.search(r"baseball", sport, re.I):
        return "BASEBALL"
    if re.search(r"rugby", sport, re.I):
        return "RUGBY"
    if re.search(r"cricket", sport, re.I):
        return "CRICKET"
    if re.search(r"football|soccer", sport, re.I):
        return "FOOTBALL"
    return "SPORTS"


def image_href(path_value: str) -> str:
    path = Path(normalize_space(path_value))
    if not path.is_file():
        return ""
    mime = mimetypes.guess_type(str(path))[0] or "image/png"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def estimate_width(text: str, font_size: int) -> float:
    return len(normalize_space(text)) * font_size * 0.58


def wrap_words(text: str, max_chars: int, max_lines: int = 2) -> list[str]:
    words = normalize_space(text).split()
    if not words:
        return []
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if not current or len(candidate) <= max_chars:
            current = candidate
            continue
        lines.append(current)
        current = word
        if len(lines) >= max_lines - 1:
            break
    remaining_words = words[len(" ".join(lines + ([current] if current else [])).split()):]
    if remaining_words:
        tail = " ".join([current] + remaining_words).strip()
        if tail:
            lines.append(tail)
    elif current:
        lines.append(current)
    return lines[:max_lines]


def fit_team_name(name: str, max_width: int, base_size: int = 42, min_size: int = 26) -> dict:
    clean = normalize_space(name)
    font_size = base_size
    lines = [clean]
    while font_size > min_size and estimate_width(clean, font_size) > max_width:
        font_size -= 1
    if estimate_width(clean, font_size) > max_width:
        max_chars = max(8, int(max_width / (font_size * 0.58)))
        lines = wrap_words(clean, max_chars, 2)
        while font_size > min_size and any(estimate_width(line, font_size) > max_width for line in lines):
            font_size -= 1
    fitted = bool(lines) and all(estimate_width(line, font_size) <= max_width for line in lines)
    return {
        "text": clean,
        "lines": lines,
        "fontSize": font_size,
        "maxWidth": max_width,
        "status": "fit" if fitted else "fit-with-textLength",
    }


def render_name_lines(fit: dict, x: int, y: int, anchor: str, role: str) -> str:
    lines = fit["lines"]
    font_size = fit["fontSize"]
    max_width = fit["maxWidth"]
    rendered = []
    for index, line in enumerate(lines):
        attrs = [
            f'data-role="{role}"',
            f'data-fit-status="{fit["status"]}"',
            f'x="{x}"',
            f'y="{y + index * int(font_size * 1.06)}"',
            f'font-size="{font_size}"',
            f'text-anchor="{anchor}"',
            'font-family="Bebas Neue, Impact, Arial, sans-serif"',
            'font-weight="800"',
            'letter-spacing="0"',
            'fill="#fff8dc"',
        ]
        if estimate_width(line, font_size) > max_width:
            attrs.append(f'textLength="{max_width}"')
            attrs.append('lengthAdjust="spacingAndGlyphs"')
        rendered.append(f"<text {' '.join(attrs)}>{escape_xml(line)}</text>")
    return "\n    ".join(rendered)


def parse_title_matchup(title: str) -> tuple[str, str]:
    match = re.search(r"(.+?)\s+(?:vs\.?|v|@)\s+(.+)", normalize_space(title), re.I)
    if not match:
        return "", ""
    return normalize_space(match.group(1)), normalize_space(match.group(2))


def build_event_from_args(args: argparse.Namespace) -> dict:
    if args.fixture and args.fixture != "all":
        return dict(TEAM_FIXTURES[args.fixture])
    home = normalize_space(args.home)
    away = normalize_space(args.away)
    if (not home or not away) and args.title:
        parsed_home, parsed_away = parse_title_matchup(args.title)
        home = home or parsed_home
        away = away or parsed_away
    return {
        "title": normalize_space(args.title) or f"{home} vs {away}",
        "sport": normalize_space(args.sport),
        "league": normalize_space(args.league),
        "league_code": normalize_space(args.league_code),
        "home": home,
        "away": away,
        "date": normalize_space(args.date),
        "is_live": bool(args.live),
        "home_logo": normalize_space(args.home_logo),
        "away_logo": normalize_space(args.away_logo),
    }


def team_visual(event: dict, side: str, box: dict, colors: tuple[str, str, str]) -> tuple[str, str]:
    name = event["home"] if side == "home" else event["away"]
    logo_path = event.get(f"{side}_logo", "")
    href = image_href(logo_path)
    cx = box["x"] + box["width"] / 2
    cy = box["y"] + box["height"] / 2
    primary, secondary, accent = colors
    if href:
        return (
            f'<image href="{href}" x="{box["x"]}" y="{box["y"]}" '
            f'width="{box["width"]}" height="{box["height"]}" preserveAspectRatio="xMidYMid meet"/>',
            "logo",
        )
    code = team_code(name)
    font_size = 70 if len(code) <= 2 else 58
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{box["width"] / 2}" fill="{primary}" '
        f'stroke="{accent}" stroke-width="7"/>\n'
        f'      <circle cx="{cx}" cy="{cy}" r="{box["width"] / 2 - 18}" fill="{secondary}" opacity="0.42" '
        f'stroke="rgba(255,255,255,0.44)" stroke-width="2"/>\n'
        f'      <text data-role="fallback-team-initials" x="{cx}" y="{cy + font_size * 0.35}" '
        f'text-anchor="middle" font-family="Bebas Neue, Impact, Arial, sans-serif" '
        f'font-size="{font_size}" font-weight="900" fill="{accent}" letter-spacing="0">{escape_xml(code)}</text>',
        "initials",
    )


def build_svg(event: dict) -> tuple[str, dict]:
    home = normalize_space(event.get("home", ""))
    away = normalize_space(event.get("away", ""))
    if not home or not away:
        raise ValueError("TEAM_VS_TEAM requires home and away teams")

    label = league_label_for(event)
    sport = normalize_space(event.get("sport", "Sports"))
    league = normalize_space(event.get("league", "")) or label
    date = normalize_space(event.get("date", ""))
    home_colors = colors_for_team(home, ("#0B5C36", "#1C2C5B", "#FFFFFF"))
    away_colors = colors_for_team(away, ("#7F1D1D", "#111827", "#FFFFFF"))
    home_box = {"x": 58, "y": 172, "width": 210, "height": 210}
    away_box = {"x": 332, "y": 520, "width": 210, "height": 210}
    versus_box = {"x": 252, "y": 402, "width": 96, "height": 96}
    home_fit = fit_team_name(home, 254)
    away_fit = fit_team_name(away, 254)
    home_visual, home_used = team_visual(event, "home", home_box, home_colors)
    away_visual, away_used = team_visual(event, "away", away_box, away_colors)
    live = bool(event.get("is_live"))

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img"
  data-layout-family="{LAYOUT_FAMILY}" data-league-label="{escape_xml(label)}"
  data-home-team="{escape_xml(home)}" data-away-team="{escape_xml(away)}">
  <defs>
    <linearGradient id="bgHome" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{home_colors[0]}"/>
      <stop offset="68%" stop-color="{home_colors[1]}"/>
      <stop offset="100%" stop-color="#07070a"/>
    </linearGradient>
    <linearGradient id="bgAway" x1="100%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="{away_colors[0]}"/>
      <stop offset="68%" stop-color="{away_colors[1]}"/>
      <stop offset="100%" stop-color="#07070a"/>
    </linearGradient>
    <pattern id="fineGrid" width="26" height="26" patternUnits="userSpaceOnUse">
      <path d="M 26 0 L 0 0 0 26" fill="none" stroke="rgba(255,255,255,0.055)" stroke-width="1"/>
    </pattern>
    <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity="0.38"/></filter>
  </defs>
  <rect width="{W}" height="{H}" fill="#07070a"/>
  <polygon points="0,0 600,0 0,708" fill="url(#bgHome)"/>
  <polygon points="600,192 600,900 0,900" fill="url(#bgAway)"/>
  <rect width="{W}" height="{H}" fill="url(#fineGrid)"/>
  <path d="M0 712 L600 190" stroke="rgba(255,248,220,0.62)" stroke-width="5"/>
  <path d="M0 728 L600 206" stroke="rgba(0,0,0,0.38)" stroke-width="12"/>

  <g data-role="league-label" transform="translate(38 42)">
    <rect x="0" y="0" width="126" height="42" rx="0" fill="rgba(7,7,10,0.62)" stroke="rgba(255,248,220,0.6)"/>
    <text x="18" y="28" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="900" fill="#fff8dc" letter-spacing="1.6">{escape_xml(label)}</text>
  </g>
  <text data-role="sport-label" x="38" y="112" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="800" fill="rgba(255,248,220,0.78)" letter-spacing="4">{escape_xml(sport.upper())}</text>
  {f'<g data-role="live-status" transform="translate(472 48)"><circle cx="0" cy="0" r="6" fill="#ff2d2d"/><text x="18" y="6" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="900" fill="#fff8dc" letter-spacing="2">LIVE</text></g>' if live else ''}

  <g data-role="home-team-visual" data-team-side="home" data-team-name="{escape_xml(home)}"
     data-box-x="{home_box["x"]}" data-box-y="{home_box["y"]}" data-box-width="{home_box["width"]}" data-box-height="{home_box["height"]}" filter="url(#shadow)">
      {home_visual}
  </g>

  <g data-role="versus" data-box-x="{versus_box["x"]}" data-box-y="{versus_box["y"]}" data-box-width="{versus_box["width"]}" data-box-height="{versus_box["height"]}"
     transform="translate({versus_box["x"] + versus_box["width"] / 2} {versus_box["y"] + versus_box["height"] / 2})">
    <circle cx="0" cy="0" r="48" fill="#fff8dc" stroke="#111111" stroke-width="8"/>
    <text x="0" y="17" text-anchor="middle" font-family="Bebas Neue, Impact, Arial, sans-serif" font-size="58" font-weight="900" fill="#111111" letter-spacing="0">VS</text>
  </g>

  <g data-role="away-team-visual" data-team-side="away" data-team-name="{escape_xml(away)}"
     data-box-x="{away_box["x"]}" data-box-y="{away_box["y"]}" data-box-width="{away_box["width"]}" data-box-height="{away_box["height"]}" filter="url(#shadow)">
      {away_visual}
  </g>

  <g data-role="home-team-text" data-team-side="home" data-team-name="{escape_xml(home)}">
    {render_name_lines(home_fit, 40, 432, "start", "home-team-name")}
  </g>
  <g data-role="away-team-text" data-team-side="away" data-team-name="{escape_xml(away)}">
    {render_name_lines(away_fit, 560, 770, "end", "away-team-name")}
  </g>
  <text data-role="footer-league" x="38" y="852" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="rgba(255,248,220,0.78)" letter-spacing="3">{escape_xml(league.upper())}</text>
  {f'<text data-role="footer-date" x="562" y="852" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="rgba(255,248,220,0.78)" letter-spacing="2">{escape_xml(date)}</text>' if date else ''}
</svg>'''

    proof = {
        "layoutFamily": LAYOUT_FAMILY,
        "homeTeam": home,
        "awayTeam": away,
        "leagueLabel": label,
        "homeVisualBox": home_box,
        "awayVisualBox": away_box,
        "versusBox": versus_box,
        "titleFitStatus": {
            "home": home_fit,
            "away": away_fit,
        },
        "usedLogoOrInitials": {
            "home": home_used,
            "away": away_used,
        },
        "warnings": [],
    }
    return svg, proof


def write_event(slug: str, event: dict, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    svg, proof = build_svg(event)
    svg_path = out_dir / f"{slug}.svg"
    json_path = out_dir / f"{slug}.json"
    svg_path.write_text(svg, encoding="utf-8")
    json_path.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    return {
        "slug": slug,
        "svg": str(svg_path),
        "json": str(json_path),
        **proof,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="out")
    parser.add_argument("--fixture", choices=["all", *TEAM_FIXTURES.keys()], default="all")
    parser.add_argument("--title", default="")
    parser.add_argument("--sport", default="")
    parser.add_argument("--league", default="")
    parser.add_argument("--league-code", default="")
    parser.add_argument("--date", default="")
    parser.add_argument("--home", default="")
    parser.add_argument("--away", default="")
    parser.add_argument("--home-logo", default="")
    parser.add_argument("--away-logo", default="")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.out)
    if args.fixture == "all" and not (args.title or args.home or args.away):
        results = [write_event(slug, dict(event), out_dir) for slug, event in TEAM_FIXTURES.items()]
    else:
        event = build_event_from_args(args)
        slug = args.fixture if args.fixture != "all" else slugify(f"{event['league']} {event['home']} {event['away']}")
        results = [write_event(slug, event, out_dir)]
    print(json.dumps({"ok": True, "out": str(out_dir), "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
