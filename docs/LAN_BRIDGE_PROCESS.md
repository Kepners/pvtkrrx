# LAN Bridge Process

Updated: 2026-03-31

## Purpose

This document explains the real `LAN Bridge` flow end to end:

- what gets generated locally
- what gets installed in Stremio
- what the hosted relay does
- what "configured" actually means
- how to troubleshoot route mistakes vs pair/relay failures

`Hybrid Home` now reuses this same LAN-pair machinery as its at-home path. This document remains relevant because the hosted fallback route is built on top of the same pair identity, heartbeat, and redirect behavior. Treat `LAN Bridge` here as the strict/manual profile and `Hybrid Home` as the default synced profile layered on top of it.

## The Short Version

`LAN Bridge` is a two-part system:

1. The Windows PVTKRRX app creates and stores the local LAN-pair identity.
2. Stremio installs a hosted addon URL that asks the public relay where the live home PC is.

If either side is missing, the addon can install but still show empty content or route errors.

## The Most Important Rule

- The Windows host desktop itself should use `PC Local`.
- `LAN Bridge` is for the user's other home devices on the same account and LAN.
- If the host desktop browses the hosted `LAN Bridge` addon and sees `Failed to fetch`, that is usually the wrong route for that machine, not proof that the relay or local server is broken.

## The Actors

### Windows Host Runtime

The Windows runtime is the source of truth for local `LAN Bridge` identity and playback-capable LAN endpoints.

It:

- stores local config under `%APPDATA%\PVTKRRX\runtime`
- generates `lanPairId`, `lanPairKey`, and `lanPairOwnerId`
- sends heartbeat updates to the hosted relay
- serves local addon, file, and playback routes on the host PC

### Hosted Relay

The hosted relay at `https://www.pvtkrrx.cc` does not invent the LAN pair credentials.

It:

- mints hosted config tokens for Stremio install URLs
- stores the current LAN pair heartbeat state
- validates pair credentials
- redirects hosted addon requests to the active LAN endpoint when the pair is online

### Stremio Client

Stremio does not generate LAN pair credentials.

It:

- installs the hosted addon URL
- fetches catalogs from the hosted relay
- follows the hosted relay to the active LAN endpoint when appropriate

## Where The Pair Lives

Default Windows runtime folder:

- `%APPDATA%\PVTKRRX\runtime`

Important files:

- `local-config.json`
- `logs\desktop-YYYY-MM-DD.log`

The local config file contains the LAN Bridge identity:

- `lanPairId`
- `lanPairKey`
- `lanPairOwnerId`
- `lanPairRelayUrl`
- `lanPairEnabled`
- `lanPairRequired`

## End-To-End Setup Flow

### 1. Install and run the Windows app

The EXE starts the local runtime and uses the Windows runtime folder under `%APPDATA%\PVTKRRX\runtime`.
This packaged Windows app is now a verified working host entrypoint for the current local/LAN route set.

### 2. Sign into Stremio on the host PC

Before using `LAN Bridge`, Stremio Desktop should be installed and signed in on that same Windows host.

The desktop popup and configure page now both check that local state first.

### 3. Open the local configure flow

Use the Windows-hosted setup flow:

- desktop app popup
- `Open LAN Bridge Setup`
- local `/configure?target=lan`

The current UI leads with route cards and a simplified top-level flow.
Fallback/manual tools live under `Hidden Setup Tabs`.

### 4. Auto Setup prepares the host

`Auto Setup Home LAN` checks and/or prepares:

- local Stremio session reuse
- account link when available
- qBittorrent
- Prowlarr
- local storage visibility
- LAN pair identity
- hosted `LAN Bridge` install link generation

### 5. Mint the hosted install token

For `LAN Bridge`, the hosted relay must mint the install token.

The correct hosted install artifact is:

- `stremio://www.pvtkrrx.cc/{token}/manifest.json?mode=hosted`

Important rule:

- the Windows app must not mint the hosted token with its own local runtime secret
- the public relay must mint the hosted token used by Stremio

### 6. Install or refresh the addon in Stremio

Stremio installs the hosted addon URL.

This does not generate the pair key.
It installs the hosted manifest route that points back to the relay.

### 7. Desktop heartbeat brings the pair online

After local setup, the Windows runtime heartbeats the hosted relay with:

- `pairId`
- `pairKey`
- `ownerId`
- current LAN endpoints
- local hostname
- relay URL

Current heartbeat behavior:

- startup pulse
- Stremio-launch pulse
- long periodic background heartbeat (default 12 minutes)
- if the hosted relay rejects the saved pair with `invalid pair key`, the desktop app now rotates the local LAN-pair identity and the user should refresh `LAN Bridge` once in Stremio on the other home devices

### 8. Hosted catalogs resolve through the live pair

When Stremio requests catalogs through the hosted addon:

- the relay looks up the pair state
- validates the provided pair credentials
- resolves the preferred LAN endpoint
- redirects or serves data through the active route logic

If the pair is offline, requests can still return successfully but with no playable result behind them.

## What "Configured" Means

`LAN Bridge` should be considered configured only when all of these are true:

1. The local Windows runtime is listening on port `7000`.
2. `local-config.json` contains valid LAN Bridge fields.
3. The hosted relay is reachable on the intended deployment.
4. Pair status reports `online: true` for the current pair.
5. A second device on the same account/LAN can browse or play through the hosted route.

Anything less than that is only partial setup.

## Failure Modes

### Install fails with `400`

Likely cause:

- bad hosted token
- wrong token secret
- local runtime tried to mint a hosted token itself

This is an install artifact problem, not a LAN heartbeat/content problem.

### Addon installs but catalogs are empty

Likely cause:

- pair offline
- heartbeat never reached the relay
- `lanPairKey` in local config no longer matches the relay's stored key for the same `lanPairId`
- local runtime is not running

Host-side configure note:

- the local configure page now asks the hosted relay for `LAN Bridge` status instead of reading only local runtime state
- if that status is red after an `invalid pair key` repair, refresh the hosted `LAN Bridge` install once in Stremio so the other home devices use the repaired pair identity

### Host desktop shows `Failed to fetch`

Likely cause:

- host desktop is browsing `LAN Bridge` instead of `PC Local`

Fix:

- use `PC Local` on the Windows host
- keep `LAN Bridge` for the user's phone, TV, web, and Apple TV

### Stremio addon is installed but still points at old behavior

Likely cause:

- stale installed token
- stale pair state
- old desktop build

Refresh or reinstall the addon with a newly minted hosted link.

## Operational Notes

### The desktop app must stay running

`LAN Bridge` is not a fire-and-forget public addon.

The home Windows runtime must stay online because it is the playback-capable side of the bridge.

Real-device proof on 2026-03-31: Apple TV played successfully through `LAN Bridge` while the Windows host stayed locked, as long as the desktop runtime remained running.

### The popup "Server Shell" panel

The desktop popup exposes a live tail of recent runtime logs and lets the user copy the full current runtime log.

Use it to watch:

- startup state
- heartbeat activity
- provider warm-up
- runtime errors

### Runtime logs

Useful log path:

- `%APPDATA%\PVTKRRX\runtime\logs\desktop-YYYY-MM-DD.log`

PowerShell:

```powershell
Get-Content "$env:APPDATA\PVTKRRX\runtime\logs\desktop-$(Get-Date -Format yyyy-MM-dd).log" -Tail 200
```

## Canonical Mental Model

Think of `LAN Bridge` like this:

- the hosted URL is the address book entry Stremio installs
- the Windows app is the actual house key
- the relay only tells Stremio which door to knock on right now

If the app is not running, the key is wrong, or the relay never got the latest heartbeat, Stremio reaches the address but finds no live room behind it.

## Related Docs

- `README.md`
- `docs/CURRENT_DESIGN.md`
- `docs/STREMIO_INSTALL_TRACKER.md`
- `ARCHITECTURE.md`
