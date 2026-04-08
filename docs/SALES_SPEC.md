# SALES_SPEC — SportsMeta (PVTKRRX Premium Feature)

> **Authors:** Jason (Sales Director) & Jasmine (Marketing)
> **Status:** Concept approved — ready for implementation planning
> **Date:** 2026-04-07

---

## Decisions (locked)

- SportsMeta lives inside PVTKRRX, not a separate brand
- Customer = PVTKRRX users only
- Freemium split: free users see generated text/SVG cards, paid users see real event artwork
- The artwork catalogue is the competitive moat
- No standalone go-to-market — this is a premium upgrade path

---

## 1. The Visual Upgrade Trigger

The freemium split IS the sales pitch. Every free user sees the "before" state every time they open Stremio.

### How it works

| Tier | What they see | Feeling |
|------|--------------|---------|
| **Free** | Generated SVG text cards — sport name, event title, date in plain text on a flat colour | Functional but ugly. Like watching Netflix with no cover art. |
| **Paid** | Real event posters — fighter face-offs, match crests, race circuits, league branding | Professional. Like the sports section belongs in Stremio. |

### Why this converts

The user doesn't need to visit a website, watch a demo, or read a comparison. The upgrade trigger is baked into daily usage:

1. User opens Stremio sports catalogue
2. Sees rows of plain text cards
3. Knows paid users see real posters (because we tell them once, on install)
4. Every browsing session is a silent reminder

This is the same psychology as Spotify's free tier — the product sells itself by being slightly worse. The gap isn't crippling (they can still find and play content), but it's visible every single time.

### Design constraint

The free SVG cards must be clean enough to be usable but plain enough that the upgrade is obvious. They should NOT be so ugly that users think the product is broken. They should feel like a functional placeholder, not a punishment.

---

## 2. Conversion Strategy

### Primary conversion lever: the artwork quality gap

- Free cards = generated, generic, text-only
- Paid cards = real photography, event branding, fighter portraits, team crests
- The gap is immediate and visual — no explanation needed

### Secondary conversion levers

| Lever | Detail |
|-------|--------|
| **Social proof in the UI** | Subtle indicator on the configure page: "X users have upgraded to real artwork" (if we track this) |
| **One-click upgrade** | Configure page shows the upgrade option. No separate checkout flow. No leaving Stremio's ecosystem. |
| **Preview strip** | On the configure page, show 3-4 real artwork cards next to the generated equivalents. Side by side. Let the eyes do the selling. |
| **Time-limited taste** | Consider: first 7 days show real artwork, then revert to generated cards. User experiences the loss. Powerful. |

### What does NOT convert

- Long feature lists
- Comparison tables with checkmarks
- Pop-ups or interruptions during playback
- Guilt-tripping ("support the developer")

The artwork sells itself or it doesn't. Do not oversell.

---

## 3. Messaging — Configure Page & Install Flow

### Configure page

Add a single visual block to the configure page. Not a modal, not a banner — a permanent section.

**Suggested block:**

```
┌─────────────────────────────────────────────┐
│  SPORTS ARTWORK                             │
│                                             │
│  [SVG card]  →  [Real poster]               │
│  "UFC 320"      [Fighter face-off image]    │
│                                             │
│  Free: text cards  |  Upgrade: real posters │
│                                             │
│  [ Upgrade ]                                │
└─────────────────────────────────────────────┘
```

**Copy rules (aligned with copy.md):**
- No hype language. No "unlock premium" or "go pro"
- Factual: "Generated cards" vs "Real event artwork"
- The visual does the talking. Words are secondary.
- Must not imply PVTKRRX is a media host or streaming service

**Suggested copy:**

> Your sports catalogue currently shows generated cards.
> Upgrade to see real event artwork — posters, fighter portraits, team crests.

That's it. One line. The images do the rest.

### Install flow

During first install or first configure:
- Show the artwork comparison once
- Do not gate any functionality behind the upgrade
- Make it clear: free users get full sports content, just with generated cards instead of real artwork

---

## 4. Community Positioning

### The Stremio community problem

The community expects free addons. Charging for anything triggers immediate backlash. The usual responses:

- "Why would I pay when Torrentio is free?"
- "Just another cash grab"
- "Fork it and remove the paywall"

### How to avoid this

**Frame it as optional polish, not a paywall.**

The core product remains free. Sports search, sports streams, sports catalogue — all free. The artwork is a visual enhancement. Nobody loses functionality by not paying.

**Messaging for Reddit/Discord:**

> PVTKRRX sports catalogue is free. Always has been.
> We built a real artwork system — actual event posters, fighter portraits, league branding — because sports on Stremio looks terrible with generic cards.
> The artwork is an optional upgrade. Everything else works the same.

**Key phrases to use:**
- "Optional visual upgrade"
- "The catalogue works the same either way"
- "We built this because sports deserved better artwork in Stremio"
- "Your streams, your trackers — now with real posters"

**Phrases to avoid:**
- "Premium", "Pro", "Subscription" (loaded words in this community)
- "Unlock", "Paywall", "Gated"
- Anything that implies free users are second-class

**Suggested framing: "Artwork Pack"**

Call it an artwork pack, not a subscription or premium tier. This reframes the purchase as buying content (the posters) rather than paying for access. Like buying a skin pack in a game — the game works fine without it, but it looks better with it.

### Open source positioning

If the community asks "why not open source the artwork?":

> The artwork catalogue takes real effort to maintain — sourcing, cropping, caching, mapping to events. It's the one thing we charge for. The addon itself remains source-available.

---

## 5. Before/After Showcase

### Required screenshots (production assets)

Produce these before any public announcement:

| # | Screenshot | Purpose |
|---|-----------|---------|
| 1 | **Stremio catalogue — free tier** | Full sports catalogue view with generated SVG cards. Must look real — actual Stremio UI, not a mockup. |
| 2 | **Stremio catalogue — paid tier** | Same view, same events, with real artwork. Side by side with #1, the difference should be immediate. |
| 3 | **Single event comparison** | One event card, free vs paid, zoomed in. Close-up of the quality gap. |
| 4 | **Configure page preview strip** | The upgrade block as it appears in the PVTKRRX configure page. Shows users what they'd get. |
| 5 | **Before/after GIF** | Animated toggle between free and paid views of the same catalogue. For Reddit/Discord posts. |

### Screenshot rules

- Use real Stremio UI, not browser mockups
- Show a mix of sports: UFC fight, football match, F1 race, NBA game
- Free cards should use the actual generated SVG style, not a deliberately ugly placeholder
- Paid cards should show the best artwork available — this is the hero shot
- Dark Stremio theme (most users use dark mode)

### Where to use them

| Asset | Where |
|-------|-------|
| Side-by-side catalogue | Reddit announcement, Discord, configure page |
| Single event close-up | Configure page upgrade block |
| Before/after GIF | Reddit post, Discord embed |
| Configure page preview | In-app only |

---

## Pricing (recommendation — not yet locked)

**Suggested: one-time purchase, not recurring.**

- The Stremio community will resist subscriptions harder than one-time payments
- A one-time "artwork pack" purchase aligns with the skin-pack framing
- Suggested range: **£2.99–£4.99 one-time**
- This is low enough to be an impulse buy, high enough to signal quality

If recurring is required for business reasons, frame it as:

> "Artwork updates" — new events, new seasons, new fighters — delivered continuously.

But one-time is the safer community play.

---

## Summary

The entire sales strategy is one sentence:

**Free users see text. Paid users see posters. The product sells the upgrade every time someone opens Stremio.**

No landing page needed. No ad spend. No influencer campaign. The UI is the sales funnel.

---

*— Jason & Jasmine, Sales & Marketing*
*PVTKRRX Concept Meeting, April 2026*
