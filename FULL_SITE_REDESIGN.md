# PVTKRRX — Full Site Redesign
## Digital Corruption Aesthetic

**Creative Director:** Nico
**Date:** February 10, 2026
**Status:** APPROVED FOR IMPLEMENTATION

---

## 1. Design Philosophy

PVTKRRX is **underground tech**. Private trackers. Seedboxes. Torrents. This isn't Netflix — it's the raw, unfiltered internet. The design should reflect that edge.

**Core Concept:** Digital Corruption
The interface looks like it's barely holding together — glitching, corrupting, chromatic aberration everywhere. It feels **dangerous**, **powerful**, and **alive**.

---

## 2. Visual Language

### 2.1 Logo Treatment (PRIMARY IDENTITY)

**Reference:** The video showing PVTKRRX logo with RGB chromatic aberration

**Specification:**
- **Base logo:** Clean sans-serif "PVTKRRX" in white
- **RGB split:**
  - Red channel: offset +3px right, +1px up
  - Blue channel: offset -3px left, -1px down
  - Green channel: stays centered
- **Opacity:** Each channel at 70% to create that toxic overlap
- **Animation:** Subtle jitter (±1px random offset every 0.1s)

**Where to use:**
- Site header/logo
- Hero section
- Footer
- Loading states

### 2.2 Color Palette

**DO NOT use the cream/peach palette from CLAUDE.md. That's for CODE EDITOR themes, not the website.**

| Color | Hex | Usage |
|-------|-----|-------|
| **Void Black** | `#0A0A0A` | Background, darkness |
| **Corrupt Red** | `#FF0040` | Errors, alerts, danger |
| **Toxic Green** | `#00FF41` | Success, ready states, matrix vibes |
| **Glitch Blue** | `#0080FF` | Links, info, download buttons |
| **Static Gray** | `#1A1A1A` | Cards, surfaces |
| **Ghost White** | `#E0E0E0` | Body text |
| **Neon Purple** | `#B026FF` | Highlights, CTAs |

### 2.3 Typography

**Headings:** JetBrains Mono (monospace, technical, hacker vibes)
**Body:** Inter (clean, readable, modern)
**Code:** JetBrains Mono (obviously)

**Font Sizes:**
- H1: 48px (logo hero)
- H2: 32px (section headers)
- H3: 24px (subsections)
- Body: 16px
- Small: 14px (captions, metadata)

---

## 3. Key Effects

### 3.1 RGB Chromatic Aberration (SIGNATURE EFFECT)

**Intensity Level:** AGGRESSIVE (matching the video)

**CSS Implementation:**
```css
.glitch-text {
  position: relative;
  color: #E0E0E0;
}

.glitch-text::before,
.glitch-text::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.glitch-text::before {
  color: #FF0040; /* Red channel */
  animation: glitch-red 0.3s infinite;
  z-index: -1;
}

.glitch-text::after {
  color: #0080FF; /* Blue channel */
  animation: glitch-blue 0.3s infinite;
  z-index: -2;
}

@keyframes glitch-red {
  0%, 100% { transform: translate(3px, 1px); opacity: 0.7; }
  50% { transform: translate(4px, 0px); opacity: 0.6; }
}

@keyframes glitch-blue {
  0%, 100% { transform: translate(-3px, -1px); opacity: 0.7; }
  50% { transform: translate(-4px, 0px); opacity: 0.6; }
}
```

**Where to apply:**
- Logo (always)
- H1 headings
- Hero title
- CTA buttons (on hover)

### 3.2 Scanline Overlay

**Effect:** Old CRT monitor horizontal lines
**Opacity:** 5% (subtle, not distracting)
**Animation:** Slow scroll from top to bottom (10s loop)

```css
.scanlines::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15),
    rgba(0, 0, 0, 0.15) 1px,
    transparent 1px,
    transparent 2px
  );
  pointer-events: none;
  z-index: 9999;
  animation: scanline-scroll 10s linear infinite;
}

@keyframes scanline-scroll {
  0% { transform: translateY(0); }
  100% { transform: translateY(100px); }
}
```

### 3.3 Noise/Static Background

**Effect:** Subtle TV static noise in the background
**Opacity:** 3% (barely visible, just adds texture)
**Animation:** Random noise pattern every 0.1s

```css
body::after {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: url('/noise.gif'); /* 100x100px static noise */
  opacity: 0.03;
  pointer-events: none;
  z-index: -1;
}
```

### 3.4 Glitch Flicker (Rare, High Impact)

**Frequency:** Every 15-30 seconds
**Duration:** 0.1s (barely noticeable, subliminal)
**Effect:** Entire page inverts colors for a single frame

```css
@keyframes glitch-flicker {
  0%, 100% { filter: invert(0); }
  50% { filter: invert(1); }
}

body.glitch-active {
  animation: glitch-flicker 0.1s ease-in-out;
}
```

**JavaScript trigger:**
```javascript
setInterval(() => {
  if (Math.random() > 0.5) { // 50% chance
    document.body.classList.add('glitch-active');
    setTimeout(() => {
      document.body.classList.remove('glitch-active');
    }, 100);
  }
}, Math.random() * 15000 + 15000); // Random 15-30s
```

---

## 4. Layout Structure

### 4.1 Hero Section

**Layout:**
```
┌─────────────────────────────────────┐
│                                     │
│         ██████╗██╗   ██╗████████╗  │ ← Glitched ASCII art logo
│         ██╔══████║   ██║╚══██╔══╝  │   (optional, could be cool)
│         ██████╔╝██║   ██║   ██║     │
│         ██╔═══╝ ╚██╗ ██╔╝   ██║     │
│         ██║      ╚████╔╝    ██║     │
│         ╚═╝       ╚═══╝     ╚═╝     │
│                                     │
│    PVTKRRX                          │ ← RGB chromatic aberration
│    Your Seedbox. Your Stremio.     │ ← Subtitle
│    No Middleman.                    │
│                                     │
│    [GET STARTED →]                  │ ← Glitch blue button
│                                     │
└─────────────────────────────────────┘
```

**Background:** Void black (#0A0A0A) with noise overlay
**Text:** Ghost white with RGB split on "PVTKRRX"
**CTA Button:** Glitch blue (#0080FF) with red glow on hover

### 4.2 Features Section

**Layout:** 3-column grid (mobile: stack)

```
┌──────────────┬──────────────┬──────────────┐
│   PRIVATE    │    FAST      │   SECURE     │
│   ▓▓▓▓░░░░   │  ▓▓▓▓░░░░   │  ▓▓▓▓░░░░    │ ← Glitchy progress bars
│              │              │              │
│  Your        │  Direct      │  AES-256     │
│  trackers.   │  streams.    │  encrypted.  │
│  Your        │  No proxy.   │  Zero        │
│  seedbox.    │  Zero        │  logs.       │
│              │  buffering.  │              │
└──────────────┴──────────────┴──────────────┘
```

**Card style:**
- Background: Static gray (#1A1A1A)
- Border: 1px solid Toxic Green (#00FF41) with 50% opacity
- Hover: Border glows brighter, slight lift

### 4.3 How It Works

**Layout:** Vertical timeline with terminal-style steps

```
┌─────────────────────────────────────┐
│  > STEP 1: Configure                │ ← Green prompt
│    Enter your Jackett + qBittorrent │
│    URLs. Test connection.           │
│                                     │
│  > STEP 2: Install                  │
│    Click the stremio:// link.       │
│    Addon installs instantly.        │
│                                     │
│  > STEP 3: Stream                   │
│    Sports. Movies. TV. Library.     │
│    All from YOUR seedbox.           │
└─────────────────────────────────────┘
```

**Style:**
- Font: JetBrains Mono
- Background: Black terminal window
- Text: Toxic green (#00FF41)
- Cursor blink animation on active step

### 4.4 Footer

**Layout:**
```
┌─────────────────────────────────────┐
│  PVTKRRX                            │ ← Small glitched logo
│  Source Available • MIT License     │
│  Built for the underground.         │
│                                     │
│  [GitHub] [Docs] [Issues]           │ ← Links
└─────────────────────────────────────┘
```

**Background:** Void black
**Text:** Ghost white 50% opacity
**Links:** Glitch blue, glow on hover

---

## 5. Component Specs

### 5.1 Buttons

**Primary CTA (e.g., "Get Started"):**
```css
.btn-primary {
  background: #0080FF; /* Glitch blue */
  color: #0A0A0A; /* Black text */
  border: none;
  padding: 16px 32px;
  font-size: 16px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.btn-primary::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  background: #FF0040; /* Red glow */
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: width 0.3s, height 0.3s;
  z-index: -1;
}

.btn-primary:hover::before {
  width: 300px;
  height: 300px;
}
```

**Secondary (e.g., "Learn More"):**
- Transparent background
- 1px solid Glitch Blue border
- Text: Glitch Blue
- Hover: Background fills with blue, text turns black

### 5.2 Input Fields (Config Page)

**Style:**
```css
.input-terminal {
  background: #0A0A0A;
  border: 1px solid #00FF41;
  color: #E0E0E0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  padding: 12px;
  width: 100%;
}

.input-terminal:focus {
  outline: none;
  border-color: #00FF41;
  box-shadow: 0 0 10px rgba(0, 255, 65, 0.3);
}

.input-terminal::placeholder {
  color: #555555;
}
```

**Labels:**
- Font: JetBrains Mono
- Color: Toxic Green
- Size: 12px uppercase

### 5.3 Cards (Features, Catalogs)

**Style:**
```css
.card {
  background: #1A1A1A;
  border: 1px solid rgba(0, 255, 65, 0.3);
  padding: 24px;
  border-radius: 0; /* Sharp corners, no softness */
  transition: all 0.3s;
}

.card:hover {
  border-color: #00FF41;
  box-shadow: 0 0 20px rgba(0, 255, 65, 0.2);
  transform: translateY(-4px);
}
```

---

## 6. Animations

### 6.1 Page Load

**Sequence:**
1. Screen fades in from static noise (0.5s)
2. Logo glitches into view with RGB split (0.3s)
3. Subtitle types in character-by-character (1s)
4. CTA button fades in (0.5s)

**Total:** ~2.3s entrance

### 6.2 Scroll Effects

**Parallax:** Background noise moves slower than foreground content
**Fade-in:** Section headers fade in with RGB split when scrolling into view
**No overscroll animations** — keep it sharp and instant

### 6.3 Hover States

**All interactive elements:**
- Cursor: `cursor: pointer;`
- Transition: 0.3s ease-in-out
- Glow effect (colored box-shadow based on element type)

---

## 7. Responsive Behavior

### 7.1 Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Desktop | 1440px+ | 3-column grid, full effects |
| Laptop | 1024px - 1439px | 3-column grid, reduced effects |
| Tablet | 768px - 1023px | 2-column grid, minimal effects |
| Mobile | < 768px | 1-column stack, logo only |

### 7.2 Mobile Optimizations

**Disable:**
- Scanline overlay (performance)
- Noise background (distracting on small screens)
- Glitch flicker (can cause seizures on small screens)

**Keep:**
- RGB chromatic aberration on logo (signature effect)
- Toxic green accents
- Terminal input style

---

## 8. Implementation Checklist

**Peter — follow this order:**

- [ ] **Step 1: Foundation**
  - [ ] Set up Next.js app with Tailwind
  - [ ] Add JetBrains Mono & Inter fonts (Google Fonts or local)
  - [ ] Create `globals.css` with color palette CSS variables
  - [ ] Add noise.gif (100x100px static noise texture)

- [ ] **Step 2: Core Effects**
  - [ ] Implement RGB chromatic aberration CSS (`.glitch-text`)
  - [ ] Add scanline overlay (`:before` pseudo-element)
  - [ ] Add noise background (body `::after`)
  - [ ] Test glitch flicker animation (optional, can skip if too intense)

- [ ] **Step 3: Components**
  - [ ] Create `<Logo />` component with RGB split
  - [ ] Create `<Button />` component (primary + secondary variants)
  - [ ] Create `<Card />` component
  - [ ] Create `<InputTerminal />` component

- [ ] **Step 4: Layout**
  - [ ] Build Hero section
  - [ ] Build Features section (3-column grid)
  - [ ] Build "How It Works" timeline
  - [ ] Build Footer

- [ ] **Step 5: Config Page**
  - [ ] Create `/configure` route
  - [ ] Build terminal-style input form
  - [ ] Add "Test Connection" button
  - [ ] Add "Generate Install Link" button
  - [ ] Style with terminal green theme

- [ ] **Step 6: Polish**
  - [ ] Add page load animation sequence
  - [ ] Add scroll-triggered fade-ins
  - [ ] Test all hover states
  - [ ] Optimize for mobile (disable heavy effects)

- [ ] **Step 7: Performance**
  - [ ] Ensure noise.gif is optimized (<5KB)
  - [ ] Lazy load animations (only run when in viewport)
  - [ ] Test on low-end devices
  - [ ] Lighthouse score >90

- [ ] **Step 8: Deploy**
  - [ ] Deploy to Vercel
  - [ ] Test on real devices (desktop, tablet, mobile)
  - [ ] Get client approval
  - [ ] Launch

---

## 9. Design Confirmation

**Status:** ✅ CONFIRMED — Peter can proceed

**Adjustments from initial concept:**
- Chromatic aberration intensity MATCHES the video (aggressive, not subtle)
- Added glitch flicker effect for subliminal corruption vibe
- Removed any "soft" design elements (rounded corners, gradients)
- Terminal green (#00FF41) is the primary accent, not blue
- Mobile gets stripped-down version (performance + safety)

**Key principle:** This should feel like you're accessing something you're not supposed to. Raw. Underground. Dangerous.

---

**Signed:**
Nico — Creative Director
February 10, 2026

**Next Action:** Peter implements Step 1-8 checklist. Flag any questions immediately.
