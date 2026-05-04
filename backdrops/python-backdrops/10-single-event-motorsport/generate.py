"""SINGLE_EVENT_MOTORSPORT sports poster proof generator.

Native 600x900 SVG output with companion JSON proof metadata. This generator is
for single-event motorsport rounds (MotoGP, WRC, Formula 1, NASCAR, IndyCar,
generic Motorsport). It is intentionally separate from the team and
competitor families — it never emits a VS marker, never invents two sides, and
must not paint Formula 1 branding on non-F1 events.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


W, H = 600, 900
LAYOUT_FAMILY = "SINGLE_EVENT_MOTORSPORT"

# Order matters: more specific patterns must beat broader ones so MotoGP / WRC
# do not bleed into Formula 1 or generic Motorsport branding.
LEAGUE_RULES = [
    (re.compile(r"\b(?:moto\s*gp|motogp)\b", re.I), "MOTOGP", "MotoGP", "motogp-bike"),
    (re.compile(r"\b(?:wrc|world\s+rally(?:\s+championship)?|rally)\b", re.I), "WRC", "WRC", "wrc-rally"),
    (re.compile(r"\b(?:formula\s*1|formula\s*one|formula1|f1)\b", re.I), "FORMULA 1", "Formula 1", "f1"),
    (re.compile(r"\bnascar\b", re.I), "NASCAR", "NASCAR", "nascar-oval"),
    (re.compile(r"\b(?:indycar|indy\s*car|indy\s*500)\b", re.I), "INDYCAR", "IndyCar", "indycar-oval"),
    (re.compile(r"\b(?:wec|world\s+endurance|formula\s*e|supercars?|v8sc)\b", re.I), "MOTORSPORT", "Motorsport", "motorsport-helmet"),
    (re.compile(r"\b(?:motorsport|motor\s+racing|grand\s+prix|race\s+series)\b", re.I), "MOTORSPORT", "Motorsport", "motorsport-helmet"),
]

LEAGUE_PALETTES = {
    "MOTOGP": {
        "primary": "#c81d2a",
        "secondary": "#1a0606",
        "accent": "#ffd166",
        "paper": "#fff4e0",
    },
    "WRC": {
        "primary": "#2563eb",
        "secondary": "#0a1024",
        "accent": "#fbbf24",
        "paper": "#f5f7ff",
    },
    "FORMULA 1": {
        "primary": "#e10600",
        "secondary": "#15151e",
        "accent": "#f4f4f4",
        "paper": "#ffffff",
    },
    "NASCAR": {
        "primary": "#ffd200",
        "secondary": "#111111",
        "accent": "#0033a0",
        "paper": "#fff8d6",
    },
    "INDYCAR": {
        "primary": "#1f3a8a",
        "secondary": "#0b1228",
        "accent": "#f97316",
        "paper": "#eef2ff",
    },
    "MOTORSPORT": {
        "primary": "#1f2937",
        "secondary": "#0a0d12",
        "accent": "#ef4444",
        "paper": "#f3f4f6",
    },
}

# Fallback fixtures the smoke runs through. Each one exercises a distinct
# motorsport identity so we have visual proof that MotoGP, WRC, F1, NASCAR,
# IndyCar and generic Motorsport stay visually independent.
FIXTURES = {
    "motogp-brazil-gear-up": {
        "raw_title": "MotoGP Brazil Gear Up",
        "league": "MotoGP Brazil",
        "event_title": "Brazil Gear Up",
        "subtitle": "MotoGP",
        "date": "2026-04-30",
    },
    "motogp-brazil": {
        "raw_title": "MotoGP Brazil",
        "league": "MotoGP",
        "event_title": "Brazil",
        "subtitle": "MotoGP Round",
        "date": "2026-04-30",
    },
    "wrc-spain-islas-canarias": {
        "raw_title": "WRC Spain Islas Canarias Saturday Highlights",
        "league": "WRC Spain",
        "event_title": "Islas Canarias Saturday Highlights",
        "subtitle": "World Rally Championship",
        "date": "2026-04-30",
    },
    "formula1-australian-grand-prix": {
        "raw_title": "Formula 1 Australian Grand Prix",
        "league": "Formula 1",
        "event_title": "Australian Grand Prix",
        "subtitle": "Formula 1",
        "date": "2026-04-30",
    },
    "nascar-daytona-500": {
        "raw_title": "NASCAR Daytona 500",
        "league": "NASCAR",
        "event_title": "Daytona 500",
        "subtitle": "NASCAR Cup Series",
        "date": "2026-04-30",
    },
    "indycar-long-beach-grand-prix": {
        "raw_title": "IndyCar Long Beach Grand Prix",
        "league": "IndyCar",
        "event_title": "Long Beach Grand Prix",
        "subtitle": "IndyCar Series",
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
    clean = normalize_space(value).lower()
    return not clean or bool(re.fullmatch(r"(?:tba|tbd|n/?a|na|unknown|undefined|null|event|session)", clean))


def classify_league(*candidates: object) -> tuple[str, str, str]:
    """Return (label, sport_label, icon_kind) using ordered, deterministic rules.
    Falls back to generic MOTORSPORT identity when nothing matches — never to F1."""
    text = normalize_space(" ".join(str(value or "") for value in candidates))
    for pattern, label, sport, icon in LEAGUE_RULES:
        if pattern.search(text):
            return label, sport, icon
    # Defensive fallback: never claim Formula 1 unless the rules said so.
    return "MOTORSPORT", "Motorsport", "motorsport-helmet"


def palette_for(label: str) -> dict:
    return LEAGUE_PALETTES.get(label, LEAGUE_PALETTES["MOTORSPORT"])


def estimate_width(text: str, font_size: float) -> float:
    return len(normalize_space(text)) * font_size * 0.58


def wrap_words(text: str, max_chars: int, max_lines: int = 3) -> list[str]:
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


def fit_event_title(text: str, max_width: int, base_size: int = 78, min_size: int = 40) -> dict:
    clean = normalize_space(text)
    if not clean:
        return {"text": "", "lines": [], "fontSize": base_size, "maxWidth": max_width, "status": "empty"}
    font_size = base_size
    lines = [clean]
    # Try shrinking single-line first.
    while font_size > min_size and estimate_width(clean, font_size) > max_width:
        font_size -= 2
    if estimate_width(clean, font_size) > max_width:
        max_chars = max(8, int(max_width / (font_size * 0.58)))
        lines = wrap_words(clean, max_chars, 3)
        while font_size > min_size and any(estimate_width(line, font_size) > max_width for line in lines):
            font_size -= 2
            max_chars = max(8, int(max_width / (font_size * 0.58)))
            lines = wrap_words(clean, max_chars, 3)
    fitted = bool(lines) and all(estimate_width(line, font_size) <= max_width for line in lines)
    return {
        "text": clean,
        "lines": lines,
        "fontSize": font_size,
        "maxWidth": max_width,
        "status": "fit" if fitted else "fit-with-textLength",
    }


def render_event_title(fit: dict, x: int, y: int, accent: str) -> str:
    if not fit.get("lines"):
        return ""
    rendered = []
    font_size = fit["fontSize"]
    line_step = int(font_size * 1.05)
    for index, line in enumerate(fit["lines"]):
        attrs = [
            'data-role="event-title"',
            f'data-fit-status="{fit["status"]}"',
            f'x="{x}"',
            f'y="{y + index * line_step}"',
            f'font-size="{font_size}"',
            'font-family="Bebas Neue, Impact, Arial, sans-serif"',
            'font-weight="800"',
            'letter-spacing="0"',
            f'fill="{accent}"',
        ]
        if estimate_width(line, font_size) > fit["maxWidth"]:
            attrs.append(f'textLength="{fit["maxWidth"]}"')
            attrs.append('lengthAdjust="spacingAndGlyphs"')
        rendered.append(f"<text {' '.join(attrs)}>{escape_xml(line)}</text>")
    return "\n  ".join(rendered)


def motorsport_glyph(icon_kind: str, cx: int, cy: int, size: int, color: str, accent: str) -> str:
    """Sport-specific identity glyph, as a single <g data-role="motorsport-identity">.

    Each kind is intentionally distinct: MotoGP draws a motorbike (no car),
    WRC draws a rally hood + tyre + stopwatch (no F1 wing), F1 draws an
    open-wheel low-slung silhouette, NASCAR/IndyCar draw an oval track,
    and generic Motorsport draws a neutral helmet + tyre.
    """
    half = size // 2
    s = size / 200.0  # normalize 200x200 internal viewBox to target size
    if icon_kind == "motogp-bike":
        body = (
            '<g data-role="motorsport-identity" data-icon-kind="motogp-bike">'
            f'  <circle cx="{cx}" cy="{cy}" r="{int(size * 0.46)}" fill="rgba(0,0,0,0.32)" stroke="{color}" stroke-width="{max(2, int(size * 0.018))}"/>'
            f'  <g transform="translate({cx} {cy}) scale({s})" stroke="{color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">'
            '    <circle cx="-46" cy="34" r="30"/>'
            '    <circle cx="50" cy="34" r="30"/>'
            '    <path d="M -46 34 L -8 -10 L 36 -10 L 50 34"/>'
            '    <path d="M -10 -8 L 6 -36 L 28 -28 L 22 -8"/>'
            f'    <circle cx="14" cy="-46" r="14" fill="{accent}" stroke="none"/>'
            '    <path d="M -28 -2 L -56 16"/>'
            '  </g>'
            '</g>'
        )
        return body
    if icon_kind == "wrc-rally":
        body = (
            '<g data-role="motorsport-identity" data-icon-kind="wrc-rally">'
            f'  <circle cx="{cx}" cy="{cy}" r="{int(size * 0.46)}" fill="rgba(0,0,0,0.32)" stroke="{color}" stroke-width="{max(2, int(size * 0.018))}"/>'
            f'  <g transform="translate({cx} {cy}) scale({s})" stroke="{color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">'
            # Hatchback rally car silhouette
            '    <path d="M -68 26 L -54 -4 L -18 -22 L 30 -22 L 54 -4 L 68 26 Z"/>'
            '    <path d="M -34 -4 L -10 -16 L 22 -16 L 38 -4"/>'
            '    <circle cx="-40" cy="34" r="16"/>'
            '    <circle cx="42" cy="34" r="16"/>'
            # Speed lines (rally trails)
            f'    <path d="M -84 50 L -54 50" stroke="{accent}"/>'
            f'    <path d="M -90 62 L -40 62" stroke="{accent}"/>'
            f'    <path d="M -78 -14 L -52 -14" stroke="{accent}"/>'
            '  </g>'
            '</g>'
        )
        return body
    if icon_kind == "f1":
        body = (
            '<g data-role="motorsport-identity" data-icon-kind="f1">'
            f'  <circle cx="{cx}" cy="{cy}" r="{int(size * 0.46)}" fill="rgba(0,0,0,0.32)" stroke="{color}" stroke-width="{max(2, int(size * 0.018))}"/>'
            f'  <g transform="translate({cx} {cy}) scale({s})" stroke="{color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">'
            # Open-wheel low-slung F1 silhouette
            '    <path d="M -78 18 L -52 18 L -38 0 L 30 0 L 50 18 L 78 18 L 78 30 L 50 30 L 38 42 L -22 42 L -38 30 L -78 30 Z"/>'
            f'    <circle cx="-50" cy="36" r="14" fill="{accent}" stroke="none"/>'
            f'    <circle cx="56" cy="36" r="14" fill="{accent}" stroke="none"/>'
            # Front wing
            '    <path d="M -82 12 L -90 6 L -70 6"/>'
            '    <path d="M 70 6 L 90 6 L 82 12"/>'
            '  </g>'
            '</g>'
        )
        return body
    if icon_kind == "nascar-oval" or icon_kind == "indycar-oval":
        body = (
            f'<g data-role="motorsport-identity" data-icon-kind="{icon_kind}">'
            f'  <circle cx="{cx}" cy="{cy}" r="{int(size * 0.46)}" fill="rgba(0,0,0,0.32)" stroke="{color}" stroke-width="{max(2, int(size * 0.018))}"/>'
            f'  <g transform="translate({cx} {cy}) scale({s})" stroke="{color}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round">'
            # Oval track
            '    <ellipse cx="0" cy="6" rx="78" ry="40"/>'
            '    <ellipse cx="0" cy="6" rx="58" ry="22"/>'
            f'    <path d="M -34 6 L 34 6" stroke="{accent}" stroke-dasharray="6 6"/>'
            # Start/finish flag
            '    <rect x="-6" y="-46" width="44" height="22" fill="none"/>'
            '    <rect x="-6" y="-46" width="11" height="11" fill="{0}" stroke="none"/>'
            '    <rect x="16" y="-46" width="11" height="11" fill="{0}" stroke="none"/>'
            '    <rect x="5" y="-35" width="11" height="11" fill="{0}" stroke="none"/>'
            '    <rect x="27" y="-35" width="11" height="11" fill="{0}" stroke="none"/>'
            '    <line x1="-6" y1="-46" x2="-6" y2="-2" stroke-width="4"/>'
            '  </g>'
            '</g>'
        ).replace('{0}', color)
        return body
    # generic motorsport-helmet
    body = (
        '<g data-role="motorsport-identity" data-icon-kind="motorsport-helmet">'
        f'  <circle cx="{cx}" cy="{cy}" r="{int(size * 0.46)}" fill="rgba(0,0,0,0.32)" stroke="{color}" stroke-width="{max(2, int(size * 0.018))}"/>'
        f'  <g transform="translate({cx} {cy}) scale({s})" stroke="{color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">'
        # Racing helmet outline
        '    <path d="M -52 16 C -52 -34 52 -34 52 16 L 52 26 L -52 26 Z"/>'
        # Visor
        f'    <path d="M -42 -2 L 42 -2 L 38 14 L -38 14 Z" fill="{accent}" stroke="none"/>'
        # Tyre below
        '    <circle cx="0" cy="58" r="22"/>'
        '    <circle cx="0" cy="58" r="8" fill="{0}" stroke="none"/>'
        '  </g>'
        '</g>'
    ).replace('{0}', color)
    return body


def normalize_event(input_event: dict) -> dict:
    raw_title = normalize_space(input_event.get("raw_title") or input_event.get("title", ""))
    league = normalize_space(input_event.get("league") or input_event.get("competition", ""))
    event_title = normalize_space(input_event.get("event_title") or input_event.get("eventTitle", ""))
    if not event_title:
        # Strip a leading league/sport token from the rawTitle if possible.
        if league and raw_title.lower().startswith(league.lower()):
            stripped = raw_title[len(league):].strip(" -:.")
            event_title = stripped or raw_title
        else:
            event_title = raw_title
    return {
        "raw_title": raw_title,
        "league": league,
        "event_title": event_title,
        "subtitle": normalize_space(input_event.get("subtitle") or input_event.get("session", "")),
        "date": normalize_space(input_event.get("date", "")),
        "is_live": bool(input_event.get("is_live")),
    }


def build_svg(input_event: dict) -> tuple[str, dict]:
    event = normalize_event(input_event)
    if is_placeholder(event["event_title"]) and is_placeholder(event["league"]):
        raise ValueError("SINGLE_EVENT_MOTORSPORT requires a real event title or league")

    label, sport_label, icon_kind = classify_league(
        event["league"],
        event["raw_title"],
        event["event_title"],
        input_event.get("sport"),
        input_event.get("competition"),
    )
    palette = palette_for(label)
    primary = palette["primary"]
    secondary = palette["secondary"]
    accent = palette["accent"]
    paper = palette["paper"]

    title_fit = fit_event_title(event["event_title"], 524, base_size=80, min_size=40)
    identity_box = {"x": 130, "y": 200, "width": 340, "height": 340}
    title_box = {"x": 38, "y": 600, "width": 524, "height": 220}
    label_box = {"x": 38, "y": 38, "width": 220, "height": 60}

    glyph = motorsport_glyph(
        icon_kind,
        identity_box["x"] + identity_box["width"] // 2,
        identity_box["y"] + identity_box["height"] // 2,
        identity_box["width"],
        paper,
        accent,
    )

    title_markup = render_event_title(title_fit, title_box["x"], title_box["y"] + 64, paper)

    live_markup = ""
    warnings: list[str] = []
    if event["is_live"]:
        live_markup = (
            '<g data-role="live-status" data-live="true" transform="translate(530 56)">'
            '<circle cx="0" cy="0" r="6" fill="#ff2d2d"/>'
            f'<text x="-12" y="6" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="900" fill="{paper}" letter-spacing="2">LIVE</text>'
            '</g>'
        )

    subtitle_text = event["subtitle"]
    subtitle_markup = ""
    if subtitle_text and not is_placeholder(subtitle_text):
        subtitle_markup = (
            f'<text data-role="event-subtitle" x="{title_box["x"]}" y="{title_box["y"] + 64 + len(title_fit["lines"]) * int(title_fit["fontSize"] * 1.05) + 26}" '
            f'font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" '
            f'fill="rgba(255,255,255,0.78)" letter-spacing="3">{escape_xml(subtitle_text.upper())}</text>'
        )

    footer_date = event["date"]
    footer_markup = ""
    if footer_date and not is_placeholder(footer_date):
        footer_markup = (
            f'<text data-role="footer-date" x="{W - 38}" y="852" text-anchor="end" '
            f'font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" '
            f'fill="rgba(255,255,255,0.72)" letter-spacing="2">{escape_xml(footer_date)}</text>'
        )

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img"
  data-layout-family="{LAYOUT_FAMILY}"
  data-league-label="{escape_xml(label)}"
  data-sport-label="{escape_xml(sport_label)}"
  data-icon-kind="{escape_xml(icon_kind)}"
  data-event-title="{escape_xml(title_fit['text'])}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{primary}"/>
      <stop offset="55%" stop-color="{secondary}"/>
      <stop offset="100%" stop-color="#04050a"/>
    </linearGradient>
    <radialGradient id="bgSpot" cx="22%" cy="20%" r="80%">
      <stop offset="0%" stop-color="{accent}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="{accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    </pattern>
    <filter id="shadow"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity="0.34"/></filter>
  </defs>
  <rect width="{W}" height="{H}" fill="url(#bgGrad)"/>
  <rect width="{W}" height="{H}" fill="url(#bgSpot)"/>
  <rect width="{W}" height="{H}" fill="url(#grid)"/>
  <path d="M0 116 H{W}" stroke="rgba(255,255,255,0.20)" stroke-width="2"/>
  <path d="M0 580 H{W}" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>

  <g data-role="sport-label" data-league-label="{escape_xml(label)}" data-sport-label="{escape_xml(sport_label)}"
     data-box-x="{label_box["x"]}" data-box-y="{label_box["y"]}" data-box-width="{label_box["width"]}" data-box-height="{label_box["height"]}"
     transform="translate({label_box["x"]} {label_box["y"]})">
    <rect x="0" y="0" width="{label_box["width"]}" height="{label_box["height"]}" rx="6" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.35)"/>
    <text x="18" y="32" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="900" fill="{paper}" letter-spacing="2">{escape_xml(label)}</text>
    <text x="18" y="50" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="rgba(255,255,255,0.7)" letter-spacing="3">{escape_xml(sport_label.upper())}</text>
  </g>
  {live_markup}

  <g filter="url(#shadow)" data-role="motorsport-identity-box"
     data-box-x="{identity_box["x"]}" data-box-y="{identity_box["y"]}"
     data-box-width="{identity_box["width"]}" data-box-height="{identity_box["height"]}">
    {glyph}
  </g>

  <g data-role="event-title-box"
     data-box-x="{title_box["x"]}" data-box-y="{title_box["y"]}"
     data-box-width="{title_box["width"]}" data-box-height="{title_box["height"]}">
    {title_markup}
  </g>
  {subtitle_markup}
  {footer_markup}
</svg>'''

    proof = {
        "layoutFamily": LAYOUT_FAMILY,
        "leagueLabel": label,
        "sportLabel": sport_label,
        "iconKind": icon_kind,
        "eventTitle": title_fit["text"],
        "subtitle": subtitle_text,
        "date": footer_date,
        "isLive": event["is_live"],
        "identityBox": identity_box,
        "eventTitleBox": title_box,
        "labelBox": label_box,
        "titleFitStatus": title_fit["status"],
        "titleFontSize": title_fit["fontSize"],
        "titleLines": title_fit["lines"],
        "palette": {
            "primary": primary,
            "secondary": secondary,
            "accent": accent,
            "paper": paper,
        },
        "warnings": warnings,
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


def build_event_from_args(args: argparse.Namespace) -> dict:
    if args.fixture and args.fixture != "all":
        return dict(FIXTURES[args.fixture])
    return {
        "raw_title": normalize_space(args.title),
        "league": normalize_space(args.league),
        "event_title": normalize_space(args.event_title),
        "subtitle": normalize_space(args.subtitle),
        "date": normalize_space(args.date),
        "is_live": bool(args.live),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="out")
    parser.add_argument("--fixture", choices=["all", *FIXTURES.keys()], default="all")
    parser.add_argument("--title", default="")
    parser.add_argument("--league", default="")
    parser.add_argument("--event-title", default="")
    parser.add_argument("--subtitle", default="")
    parser.add_argument("--date", default="")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.out)
    if args.fixture == "all" and not (args.title or args.league or args.event_title):
        results = [write_event(slug, dict(event), out_dir) for slug, event in FIXTURES.items()]
    else:
        event = build_event_from_args(args)
        slug = args.fixture if args.fixture != "all" else slugify(
            f"{event.get('league', '')} {event.get('event_title', '') or event.get('raw_title', '')}"
        ) or "single-event-motorsport"
        results = [write_event(slug, event, out_dir)]
    print(json.dumps({"ok": True, "out": str(out_dir), "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
