"""COMPETITOR_VS_COMPETITOR sports poster proof generator.

Native 600x900 SVG output with companion JSON proof metadata. This generator is
for person-vs-person sports only; motorsport/session posters and team fixtures
belong to separate families.
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import re
from pathlib import Path
from urllib.parse import urlparse


W, H = 600, 900
LAYOUT_FAMILY = "COMPETITOR_VS_COMPETITOR"

PLACEHOLDER_RE = re.compile(r"^(?:tba|tbd|unknown|undefined|null|home|away|team|sports?|event|player|competitor)$", re.I)

LABEL_RULES = [
    (re.compile(r"\b(?:ufc|ultimate fighting championship)\b", re.I), "UFC", "MMA"),
    (re.compile(r"\b(?:mma|pfl|bellator|one championship)\b", re.I), "MMA", "MMA"),
    (re.compile(r"\b(?:boxing|matchroom|queensberry|bkfc|heavyweight|welterweight|lightweight)\b", re.I), "BOXING", "BOXING"),
    (re.compile(r"\b(?:pdc|darts?|world matchplay|premier league darts)\b", re.I), "DARTS", "DARTS"),
    (re.compile(r"\b(?:atp|wimbledon|australian open|roland garros|french open|us open tennis)\b", re.I), "ATP", "TENNIS"),
    (re.compile(r"\bwta\b", re.I), "WTA", "TENNIS"),
    (re.compile(r"\btennis\b", re.I), "TENNIS", "TENNIS"),
    (re.compile(r"\b(?:wc|world championship|crucible|snooker|billiards|pool)\b", re.I), "SNOOKER", "SNOOKER"),
    (re.compile(r"\b(?:wwe|aew|nxt|raw|smackdown|wrestling)\b", re.I), "WRESTLING", "WRESTLING"),
]

TRAILING_LABEL_RE = re.compile(
    r"\s+\b(?:WC|World\s+Championship|ATP|WTA|UFC|MMA|PFL|Bellator|Darts?|PDC|Boxing|WWE|AEW|Tennis|Snooker)\b\s*$",
    re.I,
)

PALETTES = {
    "SNOOKER": ("#113d2e", "#0b1614", "#d6b36a", "#f7f0dc"),
    "TENNIS": ("#174f2a", "#09140d", "#d7ff4f", "#f5f7eb"),
    "ATP": ("#103d67", "#071626", "#79d6ff", "#f2fbff"),
    "WTA": ("#682155", "#160715", "#ff8bd8", "#fff0fa"),
    "UFC": ("#8f1616", "#130707", "#f7d046", "#fff4dd"),
    "MMA": ("#7a1b1b", "#100708", "#f7d046", "#fff4dd"),
    "BOXING": ("#79351b", "#120907", "#f0c173", "#fff1dc"),
    "DARTS": ("#123b58", "#071019", "#ffcf4d", "#eef8ff"),
    "WRESTLING": ("#50307b", "#10091a", "#d5b3ff", "#f8f1ff"),
}

FIXTURES = {
    "snooker-higgins-murphy": {
        "title": "John Higgins vs Shaun Murphy WC",
        "sport": "Snooker",
        "league": "World Championship",
        "league_code": "SNOOKER",
        "competitor_one": "John Higgins",
        "competitor_two": "Shaun Murphy",
        "date": "2026-04-30",
    },
    "tennis-djokovic-alcaraz": {
        "title": "Novak Djokovic vs Carlos Alcaraz ATP",
        "sport": "Tennis",
        "league": "ATP",
        "league_code": "ATP",
        "competitor_one": "Novak Djokovic",
        "competitor_two": "Carlos Alcaraz",
        "date": "2026-04-30",
    },
    "ufc-makhachev-oliveira": {
        "title": "Islam Makhachev vs Charles Oliveira UFC",
        "sport": "MMA",
        "league": "UFC",
        "league_code": "UFC",
        "competitor_one": "Islam Makhachev",
        "competitor_two": "Charles Oliveira",
        "date": "2026-04-30",
    },
    "darts-littler-van-gerwen": {
        "title": "Luke Littler vs Michael van Gerwen Darts",
        "sport": "Darts",
        "league": "Darts",
        "league_code": "DARTS",
        "competitor_one": "Luke Littler",
        "competitor_two": "Michael van Gerwen",
        "date": "2026-04-30",
    },
}


def normalize_space(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def escape_xml(value: object) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize_space(value).lower()).strip("-")


def is_placeholder(value: str) -> bool:
    return bool(PLACEHOLDER_RE.fullmatch(normalize_space(value)))


def is_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"}


def image_href(path_value: str) -> str:
    value = normalize_space(path_value)
    if not value:
        return ""
    if is_url(value):
        return value
    path = Path(value)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    if not path.is_file():
        return ""
    mime = mimetypes.guess_type(str(path))[0] or "image/png"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def label_for(event: dict) -> tuple[str, str]:
    explicit = normalize_space(event.get("league_code", ""))
    sport = normalize_space(event.get("sport", ""))
    text = normalize_space(
        " ".join(
            str(event.get(key, ""))
            for key in ("league_code", "league", "sport", "title", "competitor_one", "competitor_two")
        )
    )
    for pattern, label, sport_label in LABEL_RULES:
        if pattern.search(text):
            if explicit and explicit.upper() in {"ATP", "WTA", "UFC", "MMA", "PDC"}:
                label = explicit.upper()
            return label, sport_label
    if explicit and re.fullmatch(r"[A-Z0-9]{2,12}", explicit):
        return explicit.upper(), sport.upper() or explicit.upper()
    return sport.upper() or "SPORT", sport.upper() or "SPORT"


def palette_for(label: str, sport_label: str) -> tuple[str, str, str, str]:
    return PALETTES.get(label) or PALETTES.get(sport_label) or ("#19324a", "#07111b", "#e7b85d", "#f7f0dc")


def parse_title_matchup(title: str) -> tuple[str, str]:
    match = re.search(r"(.+?)\s+(?:vs\.?|v\.?|against)\s+(.+)", normalize_space(title), re.I)
    if not match:
        return "", ""
    one = normalize_space(match.group(1))
    two = normalize_space(TRAILING_LABEL_RE.sub("", match.group(2)))
    return one, two


def build_event_from_args(args: argparse.Namespace) -> dict:
    if args.fixture and args.fixture != "all":
        return dict(FIXTURES[args.fixture])
    one = normalize_space(args.competitor_one)
    two = normalize_space(args.competitor_two)
    if (not one or not two) and args.title:
        parsed_one, parsed_two = parse_title_matchup(args.title)
        one = one or parsed_one
        two = two or parsed_two
    return {
        "title": normalize_space(args.title) or f"{one} vs {two}",
        "sport": normalize_space(args.sport),
        "league": normalize_space(args.league),
        "league_code": normalize_space(args.league_code),
        "competitor_one": one,
        "competitor_two": two,
        "date": normalize_space(args.date),
        "source": normalize_space(args.source),
        "is_live": bool(args.live),
        "event_logo": normalize_space(args.event_logo),
        "league_logo": normalize_space(args.league_logo),
    }


def estimate_width(text: str, font_size: int) -> float:
    return len(normalize_space(text)) * font_size * 0.56


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
        if len(lines) == max_lines - 1:
            break
    used = len(" ".join(lines + ([current] if current else [])).split())
    remaining = words[used:]
    if remaining:
        lines.append(" ".join([current] + remaining).strip())
    elif current:
        lines.append(current)
    return lines[:max_lines]


def fit_competitor_name(name: str, max_width: int, base_size: int = 66, min_size: int = 38) -> dict:
    clean = normalize_space(name)
    font_size = base_size
    lines = [clean]
    while font_size > min_size and estimate_width(clean, font_size) > max_width:
        font_size -= 1
    if estimate_width(clean, font_size) > max_width:
        max_chars = max(8, int(max_width / (font_size * 0.56)))
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


def render_name_lines(fit: dict, x: int, y: int, anchor: str, role: str, side: str) -> str:
    rendered = []
    font_size = fit["fontSize"]
    for index, line in enumerate(fit["lines"]):
        attrs = [
            f'data-role="{role}"',
            f'data-competitor-side="{side}"',
            f'data-competitor-name="{escape_xml(fit["text"])}"',
            f'data-fit-status="{fit["status"]}"',
            f'x="{x}"',
            f'y="{y + index * int(font_size * 1.0)}"',
            f'font-size="{font_size}"',
            f'text-anchor="{anchor}"',
            'font-family="Bebas Neue, Impact, Arial, sans-serif"',
            'font-weight="900"',
            'letter-spacing="0"',
            'fill="#fff8dc"',
        ]
        if estimate_width(line, font_size) > fit["maxWidth"]:
            attrs.append(f'textLength="{fit["maxWidth"]}"')
            attrs.append('lengthAdjust="spacingAndGlyphs"')
        rendered.append(f"<text {' '.join(attrs)}>{escape_xml(line)}</text>")
    return "\n    ".join(rendered)


def identity_image(event: dict) -> tuple[str, str]:
    for source, kind in (
        (normalize_space(event.get("event_logo", "")), "event-logo"),
        (normalize_space(event.get("league_logo", "")), "league-logo"),
    ):
        href = image_href(source)
        if href:
            return href, kind
    return "", "text-label"


def build_svg(event: dict) -> tuple[str, dict]:
    one = normalize_space(event.get("competitor_one", ""))
    two = normalize_space(event.get("competitor_two", ""))
    if not one or not two or is_placeholder(one) or is_placeholder(two) or one.lower() == two.lower():
        raise ValueError("COMPETITOR_VS_COMPETITOR requires two named competitors")

    label, sport_label = label_for(event)
    primary, secondary, accent, paper = palette_for(label, sport_label)
    league = normalize_space(event.get("league", "")) or label
    date = normalize_space(event.get("date", ""))
    source = normalize_space(event.get("source", ""))
    logo_href, used_identity = identity_image(event)

    competitor_one_box = {"x": 50, "y": 198, "width": 430, "height": 156}
    competitor_two_box = {"x": 120, "y": 546, "width": 430, "height": 156}
    versus_box = {"x": 252, "y": 402, "width": 96, "height": 96}
    logo_box = {"x": 456, "y": 44, "width": 88, "height": 88}
    one_fit = fit_competitor_name(one, 430)
    two_fit = fit_competitor_name(two, 430)
    live = bool(event.get("is_live"))

    logo_markup = ""
    if logo_href:
        logo_markup = (
            f'<g data-role="event-logo" data-box-x="{logo_box["x"]}" data-box-y="{logo_box["y"]}" '
            f'data-box-width="{logo_box["width"]}" data-box-height="{logo_box["height"]}">'
            f'<rect x="{logo_box["x"]}" y="{logo_box["y"]}" width="{logo_box["width"]}" height="{logo_box["height"]}" '
            f'rx="8" fill="rgba(255,248,220,0.08)" stroke="rgba(255,248,220,0.44)"/>'
            f'<image href="{escape_xml(logo_href)}" x="{logo_box["x"] + 9}" y="{logo_box["y"] + 9}" '
            f'width="{logo_box["width"] - 18}" height="{logo_box["height"] - 18}" preserveAspectRatio="xMidYMid meet"/></g>'
        )

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img"
  data-layout-family="{LAYOUT_FAMILY}" data-league-label="{escape_xml(label)}" data-sport-label="{escape_xml(sport_label)}"
  data-competitor-one="{escape_xml(one)}" data-competitor-two="{escape_xml(two)}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{primary}"/>
      <stop offset="56%" stop-color="{secondary}"/>
      <stop offset="100%" stop-color="#050608"/>
    </linearGradient>
    <radialGradient id="spotOne" cx="16%" cy="25%" r="70%">
      <stop offset="0%" stop-color="{accent}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="{accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="spotTwo" cx="85%" cy="72%" r="66%">
      <stop offset="0%" stop-color="{paper}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="{paper}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="scoreGrid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M 34 0 L 0 0 0 34" fill="none" stroke="rgba(255,248,220,0.048)" stroke-width="1"/>
    </pattern>
    <filter id="softShadow"><feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#000000" flood-opacity="0.34"/></filter>
  </defs>
  <rect width="{W}" height="{H}" fill="url(#bg)"/>
  <rect width="{W}" height="{H}" fill="url(#spotOne)"/>
  <rect width="{W}" height="{H}" fill="url(#spotTwo)"/>
  <rect width="{W}" height="{H}" fill="url(#scoreGrid)"/>
  <path d="M42 164 H558" stroke="rgba(255,248,220,0.22)" stroke-width="2"/>
  <path d="M42 734 H558" stroke="rgba(255,248,220,0.22)" stroke-width="2"/>
  <path d="M58 176 C150 122 254 118 354 154" fill="none" stroke="{accent}" stroke-opacity="0.42" stroke-width="5"/>
  <path d="M542 724 C450 780 346 784 246 748" fill="none" stroke="{accent}" stroke-opacity="0.42" stroke-width="5"/>

  <g data-role="event-identity" data-league-label="{escape_xml(label)}" data-sport-label="{escape_xml(sport_label)}" transform="translate(44 44)">
    <rect x="0" y="0" width="226" height="64" rx="8" fill="rgba(5,6,8,0.62)" stroke="rgba(255,248,220,0.36)"/>
    <text data-role="league-label" data-league-label="{escape_xml(label)}" x="20" y="30" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="900" fill="{paper}" letter-spacing="1.2">{escape_xml(label)}</text>
    <text data-role="sport-label" data-sport-label="{escape_xml(sport_label)}" x="20" y="50" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="rgba(255,248,220,0.70)" letter-spacing="3">{escape_xml(sport_label)}</text>
  </g>
  {logo_markup}
  {f'<g data-role="live-status" transform="translate(462 48)"><circle cx="0" cy="0" r="6" fill="#ff2d2d"/><text x="18" y="6" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="900" fill="#fff8dc" letter-spacing="2">LIVE</text></g>' if live else ''}

  <g data-role="competitor-one" data-competitor-side="one" data-competitor-name="{escape_xml(one)}"
     data-box-x="{competitor_one_box["x"]}" data-box-y="{competitor_one_box["y"]}" data-box-width="{competitor_one_box["width"]}" data-box-height="{competitor_one_box["height"]}" filter="url(#softShadow)">
    <text x="{competitor_one_box["x"]}" y="{competitor_one_box["y"] - 20}" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="900" fill="{accent}" letter-spacing="4">COMPETITOR ONE</text>
    {render_name_lines(one_fit, competitor_one_box["x"], competitor_one_box["y"] + 62, "start", "competitor-one-name", "one")}
  </g>

  <g data-role="versus" data-box-x="{versus_box["x"]}" data-box-y="{versus_box["y"]}" data-box-width="{versus_box["width"]}" data-box-height="{versus_box["height"]}"
     transform="translate({versus_box["x"] + versus_box["width"] / 2} {versus_box["y"] + versus_box["height"] / 2})">
    <circle cx="0" cy="0" r="42" fill="rgba(5,6,8,0.78)" stroke="{accent}" stroke-width="3"/>
    <text data-role="matchup-vs" x="0" y="13" text-anchor="middle" font-family="Bebas Neue, Impact, Arial, sans-serif" font-size="42" font-weight="900" fill="{paper}" letter-spacing="0">VS</text>
  </g>

  <g data-role="competitor-two" data-competitor-side="two" data-competitor-name="{escape_xml(two)}"
     data-box-x="{competitor_two_box["x"]}" data-box-y="{competitor_two_box["y"]}" data-box-width="{competitor_two_box["width"]}" data-box-height="{competitor_two_box["height"]}" filter="url(#softShadow)">
    <text x="{competitor_two_box["x"] + competitor_two_box["width"]}" y="{competitor_two_box["y"] - 20}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="900" fill="{accent}" letter-spacing="4">COMPETITOR TWO</text>
    {render_name_lines(two_fit, competitor_two_box["x"] + competitor_two_box["width"], competitor_two_box["y"] + 62, "end", "competitor-two-name", "two")}
  </g>

  <text data-role="footer-league" x="44" y="830" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="rgba(255,248,220,0.72)" letter-spacing="3">{escape_xml(league.upper())}</text>
  {f'<text data-role="footer-date" x="556" y="830" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="rgba(255,248,220,0.72)" letter-spacing="2">{escape_xml(date)}</text>' if date else ''}
  {f'<text data-role="footer-source" x="44" y="858" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="rgba(255,248,220,0.52)" letter-spacing="2">{escape_xml(source.upper())}</text>' if source else ''}
</svg>'''

    proof = {
        "layoutFamily": LAYOUT_FAMILY,
        "sport": sport_label.title() if sport_label not in {"MMA", "UFC"} else sport_label,
        "leagueLabel": label,
        "competitorOne": one,
        "competitorTwo": two,
        "competitorOneBox": competitor_one_box,
        "competitorTwoBox": competitor_two_box,
        "versusBox": versus_box,
        "titleFitStatus": {
            "competitorOne": one_fit,
            "competitorTwo": two_fit,
        },
        "usedLogoOrLabel": used_identity,
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
    parser.add_argument("--fixture", choices=["all", *FIXTURES.keys()], default="all")
    parser.add_argument("--title", default="")
    parser.add_argument("--sport", default="")
    parser.add_argument("--league", default="")
    parser.add_argument("--league-code", default="")
    parser.add_argument("--date", default="")
    parser.add_argument("--source", default="")
    parser.add_argument("--competitor-one", default="")
    parser.add_argument("--competitor-two", default="")
    parser.add_argument("--event-logo", default="")
    parser.add_argument("--league-logo", default="")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.out)
    if args.fixture == "all" and not (args.title or args.competitor_one or args.competitor_two):
        results = [write_event(slug, dict(event), out_dir) for slug, event in FIXTURES.items()]
    else:
        event = build_event_from_args(args)
        slug = args.fixture if args.fixture != "all" else slugify(
            f"{event['league']} {event['competitor_one']} {event['competitor_two']}"
        )
        results = [write_event(slug, event, out_dir)]
    print(json.dumps({"ok": True, "out": str(out_dir), "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
