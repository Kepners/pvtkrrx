# PVTKRRX Copy Specification Rules

## 1. Core product truth

1. PVTKRRX must always be described as a way to bring **private trackers / seedbox content into Stremio**.
2. The app is **not** a debrid service.
3. The app is **not** a third-party media host.
4. The app is **not** a generic streaming platform.
5. The app is a **bridge layer** between the user's own setup and Stremio.
6. The trust message is central:

   * **Your hardware, your trackers**
   * operator-controlled
   * self-host friendly
7. The product must sound like a **serious tool**, not a toy, hobby demo, or "basic free app".

## 2. Mandatory core claims

These themes should appear repeatedly across homepage, configure flow, docs, and launch copy:

* Private trackers inside Stremio
* No debrid
* No third-party media host
* Your hardware, your trackers
* Configure first
* Choose the route that matches where playback happens
* Sports, movies, TV, and library in one addon family

## 3. Forbidden or misleading claims

The copy must never imply any of the following:

* "No setup required"
* "Instant magic install"
* "Works everywhere the same way"
* "Fully hosted playback"
* "Cloud streaming from PVTKRRX"
* "PVTKRRX hosts your media"
* "Universal one-route install"
* "Live sports service"
* "Independent of your own stack"
* "Just install and stream without infrastructure"

If a line creates the impression that PVTKRRX itself is the media provider, it fails.

## 4. Setup truth rules

1. The product must always acknowledge that **configuration comes first**.
2. Copy must make clear the user needs their own infrastructure.
3. Setup copy should be direct and practical, not clever.
4. The product should not pretend to hide all technical reality.
5. "Configure first" is a valid principle and should be visible in the UX and copy.

## 5. Required infrastructure truth

The copy should clearly communicate that the user is expected to have or provide:

* Prowlarr or Torznab-compatible search
* qBittorrent
* a host PC and/or seedbox depending on route
* Stremio

The built-in file server is a real simplifier and should be stated clearly:

* users do **not** need a third-party file server just to get started if the built-in route fits their setup

## 6. Route model rules

The product must always present the app as **three distinct routes**.

Approved route labels:

* **PC Local**
* **Hybrid Home**
* **Remote Seedbox**

These are product-facing labels.
Internal architecture wording can still use more technical terms where needed, but user-facing website copy should use the chosen product labels consistently.

## 7. Route explanation rules

Each route must have:

* one plain-English purpose
* one blunt constraint
* one "use this when" explanation

### PC Local

Must mean:

* same host PC
* direct local route
* for the Windows machine running PVTKRRX

Must not imply:

* general LAN install for all devices
* universal home route

Recommended copy pattern:

* **PC Local** — use this on the Windows PC that runs PVTKRRX.

### Hybrid Home

Must mean:

* for the user's other home devices
* hybrid because the install/setup path and playback resolution path can differ
* it may use one path or the other depending on availability, not both at once
* home-device route, not the host-PC route

Must not imply:

* magic automatic networking with no dependency
* that the hosted side fully replaces the local side
* that everything is always active at once

Required rule:
Whenever **Hybrid Home** appears, it should be paired with a plain-English explainer.

Recommended copy pattern:

* **Hybrid Home** — use this for your TV, phone, and other home devices. It uses the home route that best fits what is available.

### Remote Seedbox

Must mean:

* public / away-from-home playback route
* intended for public-facing infrastructure

Must not imply:

* same as Hybrid Home
* no public endpoint requirement
* that it works with private local-only infrastructure

Recommended copy pattern:

* **Remote Seedbox** — use this when playback needs to work away from home through public endpoints.

## 8. Honesty about limitations

This is a hard rule: limitations are part of the trust model, not something to hide.

Copy must be honest about:

* hosted playback limitations
* auth-protected file server caveats
* ready-file vs buffering behaviour
* route-specific dependency differences
* device-specific setup differences when relevant

The tone should be:

* confident
* blunt
* calm
* not apologetic
* not evasive

## 9. Sports positioning rules

1. Sports is a **real product pillar**.
2. Sports must not be treated as an afterthought.
3. Sports should appear as a top-level capability in copy and navigation.
4. Sports must still be described truthfully:

   * private tracker sports in Stremio
   * enriched presentation where available
   * not a separate live sports service
5. The sports story should support the product's uniqueness.

Approved framing:

* sports is one of the clearest differentiators
* sports belongs alongside movies, TV, and library

## 10. Privacy and control rules

Privacy/control copy is allowed and encouraged, but it must stay factual.

Approved themes:

* operator-controlled
* self-host friendly
* your hardware, your trackers
* encrypted config / protected setup details
* no third-party media host

Not approved:

* absolute privacy guarantees
* "zero trust surface"
* "fully anonymous"
* any claim that removes all responsibility or infrastructure from the user

## 11. Tone rules

The tone must be:

* direct
* technical but readable
* trustworthy
* plain English first
* not corporate
* not fluffy
* not startup-buzzword heavy

The product can look underground or sharp visually, but the wording must stay understandable.

## 12. Homepage rules

The homepage must answer these questions quickly:

1. What is this?
2. Who is it for?
3. What does it need?
4. Which route should I use?
5. What does it not do?

If the first screen does not answer those, the copy fails.

## 13. FAQ rules

The FAQ must do practical work.
It should answer:

* what PVTKRRX does
* what the user needs
* which route to start with
* whether it hosts media
* whether it needs debrid
* where sports fit
* where to start

The FAQ should not be used for vague brand storytelling.

## 14. UX copy rules

UX copy should prefer clear actions over abstract labels.

Approved patterns:

* Configure first
* Choose your route
* Install on this PC
* Use on other home devices
* Use away from home
* Open setup guide
* Advanced options
* Manual fallback

Avoid vague labels like:

* ecosystem
* mesh
* orchestration
* adaptive routing
* universal mode

unless there is plain English immediately underneath.

## 15. Release / social copy rules

Launch copy should be built around:

* private trackers inside Stremio
* no debrid
* sports included as a real pillar
* route choice
* self-host / operator-controlled angle
* configure-first honesty

Launch copy must not oversell simplicity.
It should sell **clarity, control, and capability**.

## 16. Final governing principle

Every line of copy must pass this test:

**Would a new user wrongly think PVTKRRX is hosting, replacing, or magically abstracting away their own setup?**

If yes, rewrite it.

And a second test:

**Would a technically minded user read this and say "that's fair, that sounds true"?**

If yes, it passes.

---

## Short version for internal use

**Must say**

* private trackers in Stremio
* no debrid
* no third-party media host
* your hardware, your trackers
* configure first
* choose your route
* sports / movies / TV / library

**Must never say**

* no setup required
* fully hosted playback
* universal install
* cloud media hosting
* works the same on every device
* live sports platform

**Routes**

* PC Local = host PC
* Hybrid Home = other home devices, hybrid home route
* Remote Seedbox = public / away-from-home route
