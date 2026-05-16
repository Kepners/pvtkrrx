# Incident: PVTKRRX public outage — Coolify sharp/libvips build break

**Date:** 2026-05-15
**Severity:** P1 — total public outage (no logo, no playback, manifest 502)
**Duration:** ~ from Codex push of `49f6ae0`/`2d391ae` to recovery (recovery container up 2026-05-15)
**Status:** ✅ RESOLVED 2026-05-16 — Coolify build pipeline FIXED (hardened Dockerfile), controlled deploy of `da6bdb4` live & healthy. Auto-deploy still disabled by choice (see Follow-up #2).

## Symptoms
- `https://www.pvtkrrx.cc/manifest.json` and `/configure` → **HTTP 502**.
- Stremio showed the generic purple-diamond placeholder (no manifest → no logo).
- No playback: addon backend unreachable, player stuck on placeholder with `--:--:--`.

## Root cause (proven)
- Coolify Docker container in crash loop: `Error: Could not load the "sharp" module ... ERR_DLOPEN_FAILED: libvips-cpp.so.8.17.3: cannot open shared object file`.
- Triggered when Codex pushed `49f6ae0 fix sports logo slot fallbacks` + `2d391ae add UCL and WNBA logo coverage` to `main`; Coolify auto-rebuilt.
- **NOT a code/dependency change:** `sharp` is `^0.34.5` in both good and bad commits; package.json / package-lock.json / Dockerfile / .dockerignore unchanged.
- **NOT fixed by reverting code:** a fresh build of the reverted last-good code (`540e9fa`, byte-identical to `6c2ced9`) **also** crashed on sharp. Conclusion: the Coolify **build pipeline** now produces images missing libvips (fresh image 604MB vs healthy 643MB). Likely sharp prebuilt-binary/libvips not installed during `npm` step in fresh builds.
- 22h-old cached images (`e43a9fe`, `0268bf44`, 643/644MB) built before the break = healthy.

## Recovery action
1. Diagnosed crash loop + identified deployed commit via `docker logs` / `docker ps`.
2. Reverted `2d391ae`+`49f6ae0` on `main` (`540e9fa`) — proved tree identical to last-good `6c2ced9`. (Kept: Codex's ungated logo work was never gate-approved under DIRECTIVE 001.)
3. Fresh Coolify build of revert ALSO crashed → proved build-pipeline, not code.
4. Launched `pvtkrrx-recovery` container from cached known-good image `w14jewmw5ubscrxh8zzfhq7d:e43a9fe43638...` on `coolify` network, alias `pvtkrrx`, same env (22 vars from broken container) + 2 mounts. Caddy (`reverse_proxy pvtkrrx:3000`) now hits it.
5. Stopped the crash-looping Coolify container (`Exited (1)`).
6. **Disabled Coolify auto-deploy** for app `w14jewmw5ubscrxh8zzfhq7d` (`application_settings.is_auto_deploy_enabled = false`) so a future push can't deploy another broken image that fights the network alias.

## Verified post-recovery (live)
- `manifest.json` → HTTP 200, valid bootstrap (`com.kepners.pvtkrrx.bootstrap` v1.1.68, name `PVTKRR`).
- `/configure` → 302 · `/logo.ico` → 200 · hostname lock clean (logo `www.pvtkrrx.cc`, no kepners leak).
- Recovery container stable (`Up`, not restarting).

## Current state / what is NOT fixed
- Public site runs on **v1.1.68 cached image** (pre Codex sports-logo work). Codex's logo fixes (DIRECTIVE 001) are NOT live and have NOT passed the audit gate.
- **Coolify build pipeline is still broken** — must not re-enable auto-deploy until the sharp/libvips Docker build is fixed and a fresh image is proven to boot.
- Self-host systemd runtime (`/selfhost/*`) was unaffected (HTTP 200 throughout).

## Follow-up proof - Dockerfile hardening (2026-05-15)
- Root cause narrowed further: the bad fresh image `w14jewmw5ubscrxh8zzfhq7d:540e9fa017e15d2de55ff866a0883acb07bdf98f` contains `@img/sharp-linux-x64` and `@img/sharp-libvips-linuxmusl-x64`, but is missing `@img/sharp-libvips-linux-x64`. The healthy recovery image contains both the musl and glibc libvips packages.
- Dockerfile now runs `npm ci --omit=dev --include=optional`, rebuilds `sharp`, asserts `node_modules/@img/sharp-linux-x64`, asserts `node_modules/@img/sharp-libvips-linux-x64`, asserts a `libvips-cpp.so*` file exists inside that package, and then runs `require('sharp')`.
- Local fresh build proof: `docker build --no-cache --progress=plain -t pvtkrrx-sharp-proof:local .` passed and printed `sharp ok 0.34.5 8.17.3`.
- Local runtime proof: throwaway container `pvtkrrx-sharp-proof-local` served `http://127.0.0.1:13000/manifest.json` with `HTTP 200`; in-container sharp probe returned `{"sharp":"0.34.5","vips":"8.17.3"}`.
- Contabo Docker-daemon proof: cloned `main` into `/tmp/pvtkrrx-sharp-proof`, copied only the patched `Dockerfile`, built `pvtkrrx-sharp-proof:server` with `--no-cache`, and the build printed `sharp ok 0.34.5 8.17.3`.
- Contabo throwaway runtime proof: container `pvtkrrx-sharp-proof-server` served `http://127.0.0.1:13080/manifest.json` with `HTTP 200` in `0.040093s`; in-container sharp probe returned `{"sharp":"0.34.5","vips":"8.17.3"}`.
- Cleanup done: removed the throwaway Contabo container/image and `/tmp/pvtkrrx-sharp-proof`.
- Live public check after cleanup: recovery container `pvtkrrx-recovery` still served `https://www.pvtkrrx.cc/manifest.json` with `HTTP 200` in `0.098056s`.
- Important caveat: this proves the Dockerfile fix locally and on the Contabo Docker daemon. It does **not** prove a real Coolify deployment yet. Auto-deploy remains disabled until a controlled Coolify deploy of this fix is run and verified.

## RESOLUTION — controlled Coolify deploy SUCCEEDED (2026-05-16)

**The Coolify build pipeline is FIXED. The hardened Dockerfile resolves the sharp/libvips break through Coolify itself.**

- Client-authorised test deploy of branch `integrate/sportcult-category-contract` HEAD `da6bdb4` (parser contract `d761c01` + Codex playback fix `9cc94b7` + consumer migration `da6bdb4`).
- Pointed Coolify app id 9 (`w14jewmw5ubscrxh8zzfhq7d`) `git_branch` → `integrate/sportcult-category-contract`, triggered ONE controlled deploy (deployment_uuid `01KRRV6W7N53SFDZCVFXAVXC1J`) via the same `queue_application_deployment(...)` path the UI uses.
- **Coolify build log proof:** `npm ci --include=optional` + `npm rebuild sharp` + all native assertions passed → `rebuilt dependencies successfully` / `sharp ok 0.34.5 8.17.3`. The 2026-05-15 broken-build symptom did NOT recur. Image built + tagged `w14jewmw5ubscrxh8zzfhq7d:da6bdb4787a032db376f9a08218840d0fc8d8b4c`.
- **Rolling update completed:** new container `w14jewmw5ubscrxh8zzfhq7d-165144371361` Created→Started→old removed. Site never 502 (rolling update kept the prior container serving until the new one took the `pvtkrrx` network alias). The trailing deployment-queue status `cancelled-by-user` was a benign post-rollout bookkeeping race AFTER "Rolling update completed" — not a build/deploy failure.
- **`pvtkrrx-recovery` retired by Coolify's rolling update** (it shared the compose project; "Removing old containers" took it down once the new healthy container was up). No leftover recovery/orphan containers.
- **Live verification:** `https://www.pvtkrrx.cc/manifest.json` → HTTP 200 (×3 consistent), valid bootstrap `com.kepners.pvtkrrx.bootstrap` v1.1.68 name `PVTKRR`; `/configure` → 302; hostname lock CLEAN (no `kepners.co.uk` host leak; only the addon-ID namespace `com.kepners.*`); container `SOURCE_COMMIT=da6bdb4787a...`, `COOLIFY_BRANCH=integrate/sportcult-category-contract`, RestartCount=0, Running=true, serving real users.
- **Parser fix observable live** (run inside the deployed container): `Football FA Cup Chelsea vs Leeds United` → home=`Chelsea` away=`Leeds United` league=`FA Cup` date=`2026-04-26` (was: home=`Football FA Cup Chelsea`); `EPL 2026 Celtic vs Rangers` → league=`Scottish Premiership` (club-identity override) date=`2026-05-10`; `NBA Playoffs ECSF 76ers@Knicks` → home=`New York Knicks` away=`Philadelphia 76ers` date=`2026-05-04`; IndyCar single-event now emits `date=2026-05-14` (was empty — the "no year on poster" symptom).

## Follow-up workstream (status)
1. ✅ DONE — controlled Coolify deploy of hardened Dockerfile run and verified healthy live (above).
2. ⚠️ `is_auto_deploy_enabled` STILL `false` — intentionally NOT re-enabled by this deploy. Recommendation: the Coolify pipeline is now proven on ONE controlled deploy of this branch; before re-enabling auto-deploy, also confirm a deploy from `main` (the auto-deploy branch) builds clean, then re-enable. Until then keep manual/controlled deploys only.
3. OPEN — re-run DIRECTIVE 001 audit gate for Codex's sports-logo work before it ships (independent of this parser deploy; SportsMeta upstream artwork gaps still resolve to clean deterministic initials per DIR-001).
4. OPEN — deferred product bugs: wrong-torrent selection partly addressed by Codex's `9cc94b7` playback-priority fix (now live); event-year-on-poster for single-event motorsport is a cosmetic edge the §7 oracle does not gate (out of this deploy's scope, fold into DIR-001).
5. KNOWN non-blocking: `smoke-sports-single-event-motorsport` (`motogp-brazil-gear-up identity glyph marker`) still fails — verified byte-identical to pre-change baseline, not a regression from this work.
