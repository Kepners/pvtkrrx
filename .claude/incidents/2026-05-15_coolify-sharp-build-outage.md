# Incident: PVTKRRX public outage — Coolify sharp/libvips build break

**Date:** 2026-05-15
**Severity:** P1 — total public outage (no logo, no playback, manifest 502)
**Duration:** ~ from Codex push of `49f6ae0`/`2d391ae` to recovery (recovery container up 2026-05-15)
**Status:** ✅ SERVICE RESTORED (on cached known-good image) — ⚠️ Coolify build pipeline still broken

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

## Follow-up workstream (open)
1. Run a controlled Coolify deployment of the hardened Dockerfile, verify the resulting app image boots, then re-enable auto-deploy only after that live Coolify image is healthy.
2. Re-enable `is_auto_deploy_enabled` only after (1) is proven.
3. Then re-run DIRECTIVE 001 audit gate for Codex's sports-logo work before it ships.
4. Deferred product bugs (now triageable, backend alive): wrong-torrent selection (dead/0-seed pick), event year not shown on poster/metadata — fold into DIRECTIVE 001 scope.
