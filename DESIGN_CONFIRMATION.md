# Design Confirmation — PVTKRRX Website

**To:** Peter (Production Engineer)
**From:** Nico (Creative Director)
**Date:** February 10, 2026
**Re:** FULL_SITE_REDESIGN.md implementation approach

---

## Status: ✅ CONFIRMED — APPROACH IS CORRECT

Peter, the full spec is in `FULL_SITE_REDESIGN.md` and you can proceed immediately.

---

## Key Points Confirmed

### 1. Chromatic Aberration Intensity
**✅ CORRECT**

The spec matches the video's AGGRESSIVE glitch vibe:
- Red channel: +3px right, +1px up
- Blue channel: -3px left, -1px down
- 70% opacity on each channel
- Subtle jitter animation (±1px every 0.1s)

This is NOT subtle. This is **in your face**. That's the point.

### 2. Color Palette
**✅ CORRECT**

**DO NOT use the cream/peach from CLAUDE.md** — that's for code editor themes, not the website.

Website palette:
- Void Black (#0A0A0A) — background
- Toxic Green (#00FF41) — primary accent
- Glitch Blue (#0080FF) — CTAs, links
- Corrupt Red (#FF0040) — errors, danger, glow effects
- Static Gray (#1A1A1A) — cards, surfaces
- Ghost White (#E0E0E0) — body text

### 3. Implementation Order
**✅ CORRECT**

Follow the 8-step checklist in section 8:

1. Foundation (Next.js + Tailwind + fonts + noise.gif)
2. Core Effects (RGB split, scanlines, noise background, flicker)
3. Components (Logo, Button, Card, InputTerminal)
4. Layout (Hero, Features, How It Works, Footer)
5. Config Page (terminal-style form)
6. Polish (animations, scroll effects, hover states)
7. Performance (optimize noise.gif, lazy load, Lighthouse >90)
8. Deploy (Vercel, test, launch)

**Do NOT skip steps.** Each builds on the previous.

---

## Mobile Strategy
**✅ CORRECT**

Desktop gets the full glitch experience.
Mobile gets stripped down:

**Disable on mobile:**
- Scanline overlay (performance hit)
- Noise background (distracting on small screens)
- Glitch flicker (seizure risk)

**Keep on mobile:**
- RGB chromatic aberration on logo (signature effect)
- Toxic green accents
- Terminal input style
- Sharp, clean layout

---

## Critical Design Principles

### 1. No Softness
- Zero rounded corners
- Zero gradients
- Zero blur effects (except chromatic aberration)
- Sharp edges. Hard cuts. Digital.

### 2. Underground Vibe
This should feel like you're accessing something you're NOT supposed to. Raw. Technical. Hacker aesthetic.

### 3. Performance Matters
The glitch effects are EXPENSIVE. Optimize ruthlessly:
- `noise.gif` must be <5KB
- Lazy load animations (only run when in viewport)
- Test on low-end devices
- Lighthouse score MUST be >90

If effects tank performance, DIAL THEM BACK. A fast site with subtle glitches beats a slow site with aggressive glitches.

---

## Assets You'll Need

### 1. noise.gif
**Specs:**
- Size: 100x100px
- File size: <5KB
- Tileable seamless static noise
- Black and white

**Where to get it:**
- Generate via ImageMagick: `convert -size 100x100 xc: +noise Random noise.gif`
- Or download from: https://github.com/pixijs/pixi-filters/blob/main/tools/demo/public/noise.png (convert to gif)

### 2. Fonts
**JetBrains Mono:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
```

**Inter:**
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
```

---

## Questions to Flag Immediately

If ANY of these are unclear, STOP and ask:

1. **Chromatic aberration math** — Do you understand how to offset the red/blue channels?
2. **Scanline implementation** — The `::before` pseudo-element pattern clear?
3. **Glitch flicker safety** — Should we skip this effect entirely? (It's optional)
4. **Mobile breakpoints** — 768px cutoff for disabling effects OK?
5. **Performance targets** — Lighthouse >90 achievable with these effects?

---

## Final Notes

**This design is intentionally EXTREME.**

If the client looks at it and says "tone it down," that's EXPECTED. We can dial back:
- Chromatic aberration (reduce to ±2px instead of ±3px)
- Glitch flicker (remove entirely)
- Scanline opacity (reduce from 5% to 2%)

But we START aggressive and pull back if needed. Better to overshoot and scale down than undershoot and look generic.

**The goal:** Make this site feel like the ONLY Stremio addon built for the underground.

---

**Signed:**
Nico — Creative Director
February 10, 2026

**Action:** Proceed with Step 1 (Foundation). Report back when fonts + noise.gif are loaded and color palette is in `globals.css`.
