# A. Product/System Boundary

## Executive Legal Boundary Summary

### What the product is

PVTKRRX is a Stremio addon plus runtime software that connects a user's own private-tracker and seedbox setup to Stremio. It surfaces sports, movies, TV, and seedbox library content through one addon family. In the live repository, it is a bridge layer between the user's own infrastructure and Stremio, not a standalone media service.

### What the product is not

PVTKRRX is not:

- a debrid service;
- a third-party media host;
- a generic streaming platform;
- a live sports service;
- a promise that playback works the same way on every route or every device.

The hosted relay is not described in the live repo as a video-byte proxy. The live docs and code both state that hosted relay routes do not proxy video bytes and that hosted `/file` and `/playback` must fail fast when playback still depends on local-only serving.

### Who the product is for

PVTKRRX is for users who already have, or are prepared to operate, their own Stremio-compatible media setup. In live repo truth, that means technically capable users who want to connect private trackers and qBittorrent-based storage or playback infrastructure into Stremio without using debrid and without handing media hosting to PVTKRRX.

### What the user must already have

The live repo shows that the user is expected to provide, configure, and control:

- Stremio;
- Prowlarr or another Torznab-compatible search layer;
- qBittorrent with reachable WebUI/API access;
- tracker access;
- a route-appropriate host environment:
  `PC Local` requires the Windows host running PVTKRRX;
  `LAN Bridge` requires the Windows host plus the home-device pairing path;
  `Remote Seedbox` requires public-ready playback endpoints on the public hosted relay, unless the user is explicitly self-hosting PVTKRRX on their own server.

The built-in file server is real, but only where the runtime can actually read the file locally. An external file server is optional in some setups and routes, not universal.

### What the hosted service does

Based on the live docs and code, the hosted PVTKRRX surface can do the following:

- serve public guide/bootstrap pages;
- serve hosted manifests;
- generate encrypted hosted config tokens;
- maintain LAN pair state, account state, and link-session state when the relevant storage is configured;
- handle optional Stremio AuthKey linking;
- redirect eligible home-device traffic back to an active paired local host;
- test public HTTP/HTTPS service endpoints from supported configure flows.

### What the hosted service does not do

Based on the live docs and code, the hosted PVTKRRX surface does not:

- host the user's media library for playback as a third-party media host;
- proxy or stream the user's video bytes through the public hosted relay;
- turn local-only private endpoints into public playback automatically;
- guarantee queue-and-buffer playback on routes where the runtime cannot actually serve built-in `/playback`;
- make raw `192.168.x.x` addon URLs the primary supported Stremio install path.

### Route-specific truth summary

#### `PC Local`

`PC Local` is the same-PC route for the Windows host running PVTKRRX. The live docs state that its stable install path is `http://127.0.0.1:7000/local/manifest.json?mode=local`. It is the real host-machine addon, not a general LAN install path. It can use built-in `/file` serving and built-in `/playback` queue-and-buffer behavior where the local runtime can read the file.

#### `LAN Bridge`

For legal drafting, this pack uses `LAN Bridge` as the operative defined term for the home-device route. In live technical behavior, this route depends on:

- a hosted manifest;
- pair state plus heartbeat;
- a hosted 307 redirect back to the active local host when the pair is online and the request still matches the home-network path.

When the home route is online and the request is redirected to the active Windows host, the redirected device effectively reaches the local runtime and inherits local playback capability. When the home route is offline, stale, or mismatched, the behavior depends on the exact hosted profile in use, as explained in the naming-conflict note below.

The Windows host itself is not supposed to use the hosted home-device route for its own browsing or playback. The host must use `PC Local`.

#### `Remote Seedbox`

`Remote Seedbox` is the public/away-from-home route. On the public hosted relay, it depends on public HTTPS playback endpoints and is ready-file-first. The public hosted relay does not offer local-only built-in buffering there. If the user explicitly self-hosts PVTKRRX on their own VPS or seedbox, built-in `/file` and `/playback` can exist on that user-controlled server runtime, and the self-host server can use localhost/private service URLs after self-host admin authentication.

### Route naming conflict that must be fixed before release

The repository contains a live naming conflict that should not be hidden:

- `docs/CURRENT_DESIGN.md`, `docs/SPEC.md`, `public/index.html`, `public/configure.html`, `docs/copy.md`, and other current copy surfaces use or prefer `LAN Bridge`.
- `docs/ROUTE_FRAMEWORK.md`, `docs/STREMIO_INSTALL_TRACKER.md`, parts of the live manifest/profile logic, and parts of the README still use `Hybrid Home` for the current fallback-capable synced home-device route.
- The codebase also still distinguishes between a fallback-capable hosted profile (`routeProfile=hybrid`) and older strict fail-closed LAN tokens (`routeProfile=lan`).

Safe resolution note for this draft:

- This draft uses `LAN Bridge` as the legal and product-facing defined term because the highest-priority design doc and the current copy rules both treat `LAN Bridge` as the intended user-facing label.
- This draft expressly notes that some live docs and logic still use `Hybrid Home` as an alias for the current fallback-capable home-device profile.
- This draft does not treat `Hybrid Home` and `LAN Bridge` as two unrelated products.
- Before release, product/legal should either:
  1. keep `LAN Bridge` as the defined legal term and describe `Hybrid Home` as a temporary alias still present in some surfaces; or
  2. unify all docs, UI, manifest copy, and legal text to one route name.

For avoidance of doubt in this draft, "`LAN Bridge`" includes the current home-device hosted route behavior even where some live repo surfaces still call that route "`Hybrid Home`". Older strict LAN-only tokens remain possible in the live system and may fail closed when the pair is offline.

# B. Draft Terms of Use

## PVTKRRX Terms of Use

### 1. Who these Terms are between

These Terms of Use are between you and `[PLACEHOLDER – PVTKRRX legal entity name, registered address, and company number]` ("PVTKRRX", "we", "us", or "our").

These Terms apply to your access to:

- the hosted PVTKRRX guide/bootstrap and relay surfaces;
- tokenized or linked PVTKRRX addon routes;
- the PVTKRRX website and configure flows;
- any associated runtime or server-side features made available as part of the PVTKRRX service.

The separate desktop/runtime software is also subject to the EULA in Section C of this pack.

By installing, accessing, configuring, or using PVTKRRX, you agree to these Terms.

### 2. Eligibility

You may use PVTKRRX only if you are legally able to enter into a binding agreement and are legally allowed to use Stremio, private trackers, qBittorrent, seedbox infrastructure, and any other connected services in your jurisdiction.

If you are using PVTKRRX on behalf of a business or other organization, you confirm that you have authority to bind that organization to these Terms.

`[PLACEHOLDER – solicitor to confirm final age wording and any age-gating requirement]`

### 3. What PVTKRRX is

PVTKRRX is a bridge between your own setup and Stremio. It is designed to bring your private tracker and seedbox content into Stremio through route-specific addon behavior.

PVTKRRX is not:

- a debrid service;
- a third-party media host;
- a generic streaming platform;
- a promise of fully hosted playback;
- a promise that the same setup method works the same way on every device.

Configuration comes first. You are responsible for supplying and maintaining the underlying infrastructure that your chosen route requires.

### 4. Install routes and operational boundaries

PVTKRRX uses route-dependent behavior. These routes are materially different and must not be blurred.

#### 4.1 `PC Local`

`PC Local` is the same-PC route for the Windows machine running PVTKRRX. The live supported install path is the loopback route on `127.0.0.1`. It is intended for the host machine itself. It is not the general route for your other devices.

#### 4.2 `LAN Bridge`

`LAN Bridge` is the home-device route for your other devices on the same Stremio account. In the live system, it depends on a hosted manifest plus pair state plus heartbeat plus redirect back to the active local host when the home route is online.

This route has a blunt constraint: the Windows host must stay online for the home-network redirect path.

Away-from-home or offline behavior is not identical to same-home behavior. In the live repo, some current surfaces call the fallback-capable version of this route `Hybrid Home`. Older strict LAN-only tokens may fail closed when the pair is offline.

#### 4.3 `Remote Seedbox`

`Remote Seedbox` is the public or away-from-home route. On the public hosted relay, it depends on public HTTPS playback infrastructure and is ready-file-first. It is not the same as `PC Local` or `LAN Bridge`.

If you explicitly self-host PVTKRRX on your own server, the self-host runtime can provide built-in playback features on your own infrastructure. That is different from the public hosted relay.

#### 4.4 Unsupported or unstable install assumptions

Raw `http://192.168.x.x/...` addon install URLs are not the stable primary supported Stremio install path. The repo's live install tracker distinguishes between LAN reachability and Stremio addon-install acceptance, and treats `PC Local` on `127.0.0.1` as the supported same-PC route.

### 5. No hosted media and no hosted video proxy

PVTKRRX does not operate as a third-party media host for your playback bytes. The public hosted relay does not proxy or serve your video bytes as a hosted streaming service.

Where playback is local-only, the hosted relay is designed to fail fast rather than pretend that hosted playback exists. Built-in `/file` and `/playback` depend on the selected route and the runtime that is actually serving the file.

If your selected route depends on your own host, seedbox, file server, or self-hosted runtime, that dependency is part of the product contract.

### 6. Accounts, tokens, installs, and access basics

PVTKRRX does not require a separate general-purpose PVTKRRX consumer account for basic addon use in the way a typical SaaS streaming platform would. However, the live system does use:

- encrypted config tokens for hosted addon installs;
- local disk-backed config for the Windows host runtime;
- self-host disk-backed config for explicit self-host server mode;
- pair identifiers and pair keys for the home-device route;
- optional Stremio account linking and linked account state;
- short-lived link-session state for account-link workflows.

You are responsible for keeping your install URLs, tokens, pair keys, self-host passwords, and other credentials secure. Anyone who has valid access material may be able to use or reconfigure the relevant route or runtime.

### 7. Your responsibilities and required infrastructure

You are responsible for:

- having and maintaining your own Stremio access;
- having and maintaining your own Prowlarr or Torznab-compatible search setup;
- having and maintaining your own qBittorrent setup and credentials;
- having lawful access to any trackers, files, or services you configure;
- maintaining any Windows host, VPS, seedbox, reverse proxy, file server, or HTTPS playback infrastructure required by your chosen route;
- checking that your configured URLs, credentials, path mappings, and file serving are correct;
- making sure your route choice matches where playback actually happens.

You are solely responsible for the legality of the content sources, trackers, credentials, downloads, files, and playback infrastructure you connect to PVTKRRX.

### 8. Route-specific operational limitations

You agree and acknowledge that:

- `PC Local` is the host-PC route and is intended for the Windows machine running PVTKRRX;
- the Windows host should not use the hosted home-device route for its own browsing or playback;
- `LAN Bridge` depends on heartbeat and redirect behavior and may stop working as intended if the host is offline, stale, not paired, or unreachable on the relevant network path;
- `Remote Seedbox` on the public hosted relay requires public playback capability and does not expose local-only buffering or tracker playback when those paths are not actually supportable;
- auth-protected external file-server behavior may suppress some redirect/buffering flows on non-local routes;
- playback behavior differs by route, by runtime, by file state, by client, and by whether the configured runtime can actually read or serve the file.

### 9. Acceptable use

You may use PVTKRRX only for lawful purposes and only in connection with systems, services, and content you are entitled to use.

You may use PVTKRRX to:

- configure addon routes for your own setup;
- connect your own Stremio, tracker, qBittorrent, seedbox, or self-host infrastructure;
- browse and play content through the route that your setup actually supports;
- use the local runtime or self-hosted runtime on systems you control.

### 10. Prohibited use

You may not:

- use PVTKRRX in violation of applicable law or third-party terms;
- use PVTKRRX to infringe copyright or other intellectual property rights;
- represent PVTKRRX as a hosted media service when you are reselling or redistributing access;
- resell hosted PVTKRRX as if it were a generic streaming platform or media-hosting backend;
- abuse, overload, scrape, or interfere with the hosted relay, link flows, pair flows, or route security controls;
- use the hosted connection-test surfaces to probe loopback, LAN, private-resolution, or rebinding-style targets in breach of the route controls;
- attempt to bypass route restrictions, token protections, CSRF protections, self-host password gates, or similar safeguards;
- share secrets, pair keys, install URLs, or self-host passwords in a way that exposes another user's configuration or infrastructure;
- misrepresent the route capabilities to other users.

### 11. Third-party dependencies and integrations

PVTKRRX depends on third-party systems that are outside our control. These may include:

- Stremio and Stremio client behavior;
- the Stremio API used for optional AuthKey verification;
- Prowlarr, Torznab-compatible indexers, qBittorrent, and your configured trackers;
- external file servers, reverse proxies, VPS providers, or seedbox providers;
- SportsMeta for sports metadata and artwork surfaces;
- optional analytics infrastructure if enabled by the operator.

We do not control those services, and we are not responsible for their availability, output, policies, compatibility, or legal compliance.

### 12. Service availability, outages, and route dependency

PVTKRRX is provided on an "as is" and "as available" basis. Route behavior depends on the route you chose and the infrastructure that route requires.

Examples from the live system include:

- the public hosted relay may be up while your Windows host is down;
- your Windows host may be up while the home-device pair is stale or mismatched;
- public playback may fail if your public HTTPS endpoints, auth headers, or path mappings are not correct;
- Stremio client behavior may differ by client and version;
- third-party outages can break search, metadata, linking, or playback even if PVTKRRX itself is working.

We do not guarantee uninterrupted service, route parity across every client, or support for every third-party setup.

### 13. Updates and modifications

We may update, modify, suspend, replace, or remove any part of the hosted service, route logic, configure flow, runtime behavior, or related materials.

We may also change:

- supported route behavior;
- install guidance;
- security controls;
- token formats;
- third-party integrations;
- route labels or copy.

If we later introduce paid features, subscription controls, trials, or billing, those will require separate reviewed terms before they should be treated as legally final.

### 14. Intellectual property

PVTKRRX, including its software, site materials, route logic, design, documentation, and branding, is owned by PVTKRRX and its licensors, except for third-party components, third-party services, and user-supplied materials.

Your use of PVTKRRX does not transfer ownership of the service or software to you.

You retain whatever rights you have in your own configuration data, infrastructure, and content, but you grant us only the limited rights needed to process configuration, linking, and route operations for the service features you actually use.

### 15. Source-available position and code rights

The repository materials describe PVTKRRX as "Source Available" and state that personal use is free and commercial use is restricted. However, this repository snapshot does not include the referenced license text.

Accordingly:

- no open-source licence is granted by implication in this draft;
- no commercial-use permission is granted beyond what an actual published licence may expressly allow;
- the final public legal pack must be aligned to the actual released source licence before issue.

`[PLACEHOLDER – CONFIRM ACTUAL LICENCE TERMS, SCOPE OF PERSONAL USE, AND COMMERCIAL RESTRICTIONS]`

### 16. Suspension and termination

We may suspend, restrict, or terminate your access to hosted parts of PVTKRRX if:

- you breach these Terms;
- your use creates legal, security, operational, or abuse risk;
- we receive a valid legal demand or infringement complaint that requires action;
- the hosted relay or linked services need to be changed, withdrawn, or shut down.

Termination or suspension of hosted service access does not automatically grant you any right to continued hosted operation. If you are using a local or self-hosted runtime, your separate software licence position is governed by the EULA and any applicable source licence.

### 17. Disclaimers

To the maximum extent permitted by law:

- PVTKRRX is provided "as is" and "as available";
- we do not warrant that every route, device, third-party dependency, or playback scenario will work uninterrupted or error-free;
- we do not warrant that any tracker result, file, metadata item, redirect, or route fallback will remain available;
- we do not warrant that the hosted relay can replace your own infrastructure;
- we do not warrant that PVTKRRX is fit for any commercial, broadcast, archival, or business-critical use unless expressly agreed in writing.

Nothing in these Terms excludes any rights that cannot lawfully be excluded under applicable law.

### 18. Limitation of liability

To the maximum extent permitted by law, PVTKRRX and its officers, employees, contractors, and licensors will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive losses, or for loss of profits, revenue, data, business, goodwill, or content, arising out of or related to your use of or inability to use PVTKRRX.

To the maximum extent permitted by law, our total aggregate liability for all claims arising out of or related to PVTKRRX will be limited to:

`[PLACEHOLDER – solicitor to set liability cap, for example fees paid in the prior 12 months, or other appropriate cap]`

Nothing in this clause excludes liability that cannot lawfully be excluded or limited.

### 19. Indemnity

You will indemnify and hold harmless PVTKRRX and its officers, employees, contractors, and licensors from and against claims, liabilities, losses, damages, costs, and expenses, including reasonable legal fees, arising out of or related to:

- your configured trackers, seedboxes, file servers, or other connected services;
- your content sources, downloads, or playback activity;
- your misuse of the hosted relay or runtime software;
- your breach of these Terms;
- your infringement of third-party rights.

`[PLACEHOLDER – solicitor to confirm indemnity scope for consumer enforceability and jurisdiction]`

### 20. Governing law and disputes

These Terms are governed by the laws of:

`[PLACEHOLDER – governing law and jurisdiction]`

Any dispute, claim, or controversy arising out of or in connection with these Terms will be resolved in:

`[PLACEHOLDER – courts/arbitration/venue wording]`

`[PLACEHOLDER – solicitor to confirm consumer-law carve-outs and mandatory local rights]`

### 21. Contact

Legal notices and support contacts should be sent to:

`[PLACEHOLDER – legal contact email]`

`[PLACEHOLDER – postal notice address]`

# C. Draft EULA

## PVTKRRX End User Licence Agreement

### 1. Scope of this EULA

This EULA governs your use of the PVTKRRX software made available by `[PLACEHOLDER – PVTKRRX legal entity name]`, including the Windows desktop application, packaged runtime, installer, self-host bootstrap scripts, server runtime packages, and related software components we distribute as PVTKRRX (the "Software").

The hosted service components are governed separately by the Terms of Use in Section B.

### 2. Licence grant

Subject to this EULA, we grant you a limited, non-exclusive, revocable, non-transferable, non-sublicensable licence to install and use the Software for your own lawful internal or personal use with your own Stremio and route-appropriate infrastructure.

This licence is a licence to use the Software. It is not a sale of the Software or any intellectual property rights in it.

### 3. Permitted use

You may:

- install the Software on devices or servers you own or control;
- use the Software to configure and operate `PC Local`, `LAN Bridge`, and `Remote Seedbox` routes within the boundaries described in the live product docs;
- use the Software with your own Stremio account, tracker services, qBittorrent instance, file-serving setup, and self-host environment;
- make a reasonable number of backup or archival copies for your own recovery and continuity purposes, provided you keep all proprietary notices intact.

### 4. Licence limitations and restrictions

You may not, except as expressly allowed by this EULA or mandatory law:

- sell, rent, lease, host for others as a managed streaming platform, sublicense, assign, distribute, or commercially exploit the Software;
- remove or alter proprietary notices or branding;
- use the Software to operate a third-party hosted media service under the PVTKRRX name or as if PVTKRRX were your content-hosting backend;
- use the Software in a way that breaches law or third-party terms;
- bypass, disable, or interfere with route controls, token protections, pair protections, or self-host password protections;
- use the Software to probe, scan, or attack private networks or third-party systems without authorization.

### 5. Reverse engineering and interoperability

Except to the extent applicable law expressly permits it despite this restriction, you may not reverse engineer, decompile, disassemble, or otherwise attempt to derive source code, internal logic, or non-public implementation details from the Software.

If applicable law gives you a non-waivable right to perform limited reverse engineering for interoperability or similar purposes, this clause applies only to the extent lawful.

### 6. Updates and changed versions

We may make updates, patches, bug fixes, route changes, or replacement versions available. This EULA applies to those updates unless a different licence is supplied with a particular release.

We do not promise:

- that updates will always be provided;
- that every old version will remain supported;
- that route behavior will remain unchanged between versions.

### 7. No resale and no sublicensing

Unless a separate written agreement expressly says otherwise, you may not resell the Software, sublicense the Software, bundle the Software into a commercial service, or redistribute it as part of a managed offering.

`[PLACEHOLDER – solicitor to align this clause with any actual commercial/self-host distribution plan]`

### 8. Third-party software and services

The Software depends on or interoperates with third-party software and services, including Stremio, qBittorrent, Prowlarr or Torznab-compatible search, seedbox infrastructure, SportsMeta, and other open-source or third-party components.

Your use of those third-party components is subject to their own terms.

`[PLACEHOLDER – add third-party notices and attribution schedule before release]`

### 9. Source-available code position

Repo materials describe PVTKRRX as source-available and say personal use is free while commercial use is restricted, but the actual outbound licence text is not present in this repository snapshot.

Until a final published source licence is confirmed:

- no broader open-source permission is granted by implication;
- any access to source code is still subject to rights reserved by PVTKRRX and its licensors;
- commercial use remains restricted to the extent stated in the final published licence.

`[PLACEHOLDER – CONFIRM ACTUAL LICENCE TEXT AND HOW IT INTERACTS WITH THIS EULA]`

### 10. Ownership

The Software is licensed, not sold. All rights, title, and interest in and to the Software remain with PVTKRRX and its licensors, except for third-party components and user-owned materials.

### 11. Termination

This EULA ends automatically if you breach it. We may also terminate or suspend this licence if required by law or if continuing the licence would create legal, security, or abuse risk.

On termination, you must stop using the Software and delete or destroy copies under your control, except to the extent mandatory law gives you continuing rights.

### 12. Warranty disclaimer

To the maximum extent permitted by law, the Software is provided "as is" and "as available", without warranties of any kind, whether express, implied, statutory, or otherwise, including implied warranties of merchantability, fitness for a particular purpose, non-infringement, or uninterrupted operation.

We do not warrant that the Software will work with every Stremio client, every tracker, every seedbox environment, every operating system state, or every route configuration.

### 13. Limitation of liability

To the maximum extent permitted by law, we will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of data, profits, business, content, or service availability arising out of or related to the Software.

Our total liability under this EULA will not exceed:

`[PLACEHOLDER – solicitor to set EULA liability cap]`

Nothing in this EULA excludes liability that cannot lawfully be excluded or limited.

### 14. Governing law

This EULA is governed by:

`[PLACEHOLDER – governing law and forum to match Terms of Use]`

### 15. Contact

Questions about this EULA should be sent to:

`[PLACEHOLDER – legal/support contact details]`

# D. Draft Privacy Notice

## PVTKRRX Privacy Notice

### 1. Scope of this notice

This notice explains, in plain English, how PVTKRRX handles data across the live product boundary shown in this repository.

This notice covers:

- the hosted PVTKRRX site and relay;
- the Windows local runtime;
- the explicit self-host server mode;
- optional Stremio account linking;
- route and state handling that the live repo shows today.

When you self-host PVTKRRX, you may also be the operator of that self-host deployment. In that case, some storage and logging happens on your own machine or server, not on the hosted PVTKRRX relay.

`[PLACEHOLDER – add controller identity, privacy contact, and any DPO details]`

### 2. System boundary summary

The live repo shows three main processing surfaces:

#### 2.1 Hosted relay

The hosted relay can generate encrypted config tokens, serve hosted manifests, maintain pair and account-related state, run optional Stremio linking flows, and test public endpoints from allowed configure surfaces.

The hosted relay is not presented in the repo as a hosted video-byte proxy.

#### 2.2 Local Windows runtime

The local Windows runtime stores configuration and state in a runtime folder, can read files locally when the host has access to them, and can run local-only and home-device route flows.

#### 2.3 Self-host server mode

The self-host server mode stores configuration on the user's own server runtime, can use localhost/private backend URLs after self-host password authentication, and can expose a stable self-host manifest from the user's own infrastructure.

### 3. Data categories and how the live repo handles them

### 3.1 Hosted token and configuration processing

When you use a hosted configure flow, the repo shows PVTKRRX receiving configuration values such as:

- Prowlarr URL;
- Prowlarr API key;
- qBittorrent URL;
- qBittorrent username and password;
- optional file-server URL;
- optional file-server auth;
- path-mapping and route-related settings;
- optional Stremio-linked identity fields.

The hosted relay can then encrypt that configuration into an addon token. The code uses AES-256-GCM-style encryption through the app's crypto utility for hosted tokens.

If the config is account-linked and fallback-capable, the account store can also persist an encrypted hosted fallback/takeover config token for that linked account.

### 3.2 Local runtime and self-host runtime storage

The live repo shows local and self-host runtimes storing disk-backed data in runtime storage, including:

- `local-config.json`;
- `lan-pair-store.json`;
- `accounts-store.json`;
- `stremio-link-store.json`;
- runtime logs;
- optional analytics dedupe state;
- other runtime files created by the installer or runtime.

The runtime directory defaults are route/runtime dependent. On Windows, the live repo resolves the runtime to `%APPDATA%\\PVTKRRX\\runtime` by default. On Linux-style self-host deployments, the runtime path can be configured and is commonly kept under a dedicated runtime directory.

The repo's secure JSON helper writes new state using an encrypted wrapper rather than plain JSON, subject to the configured secret.

### 3.3 Pair state for the home-device route

The live code shows the home-device route storing pair state that can include:

- pair id;
- a hash of the pair key, not the raw pair key;
- a hash of the pair owner id;
- a hash of the client IP address;
- candidate LAN endpoints;
- local hostname;
- relay URL;
- app version;
- timestamps and expiry data.

That state may be stored in:

- KV-backed storage if that deployment is configured that way;
- encrypted disk-backed runtime storage;
- or memory fallback where persistent backing is not available.

The public `pair/status` response is intentionally limited. The live smoke tests and code show that it does not return raw endpoint URLs, raw pair keys, or local hostname to the caller.

### 3.4 Optional Stremio account linking

PVTKRRX can optionally link a Stremio account.

The live repo shows two relevant flows:

- a same-host local auto-link flow that reads local Stremio session material from the same machine only; and
- a manual AuthKey flow where the user supplies a Stremio AuthKey for verification.

The code verifies the supplied AuthKey against the Stremio API and then stores:

- the Stremio user id;
- timestamps such as linked-at and last-verified-at;
- a hash of the AuthKey, not the raw AuthKey, in the account store;
- email from Stremio if available and valid, or a synthetic local email if not.

The account store can also hold an internal account id and linked PVTKRRX state such as the encrypted hosted fallback config token for account-linked fallback behavior.

The live smoke tests show that `/auth/me` returns a limited public user model with linked Stremio status and Stremio user id, but omits the internal account id and email.

The repo docs also state that no raw Stremio password needs to live on the cloud host for the cross-device link-session flow.

### 3.5 Link-session state

The live repo shows short-lived link-session state for Stremio linking. A session can include:

- session token;
- created-at and expiry timestamps;
- status;
- source config token;
- config alias;
- install mode and install target;
- install-seen timestamps;
- linked config token;
- persisted-config-saved flag;
- Stremio user id;
- recommended pair id.

The link-session store does not need to store the raw Stremio AuthKey to track session state.

### 3.6 Connection testing

The live repo shows a `/test-connection` route that can receive Prowlarr and qBittorrent URLs and credentials in order to verify connectivity.

The live route behavior differs by surface:

- hosted connection testing is rate limited and only allows public HTTP/HTTPS targets;
- hosted connection testing rejects loopback, LAN, private-resolution, and rebinding-style targets;
- same-host local runtime or unlocked self-host admin sessions can test localhost/private targets because those checks happen from the relevant host environment.

The repo proves that the test route processes those values. It does not prove a final production retention policy for test payloads or error logs, so this draft does not claim that those payloads are or are not durably stored beyond what the code itself shows.

`[PLACEHOLDER – CONFIRM ACTUAL HOSTED TEST-PAYLOAD RETENTION PRACTICE]`

### 3.7 Logs and diagnostics

The live repo includes log-redaction logic that redacts:

- secret fields;
- auth keys and tokens;
- pair keys;
- file-server auth strings;
- sensitive URLs;
- magnet links;
- Windows and Unix file paths;
- auth identifiers such as Stremio user ids and account ids.

The smoke tests explicitly check that server-side log output redacts tracker URLs, private endpoint URLs, paths, pair keys, and auth identifiers.

The repo also documents desktop runtime logs in the runtime directory. However, the repo does not itself prove the exact live hosted logging stack, who has access to hosted logs, or the exact hosted log-retention period.

`[PLACEHOLDER – CONFIRM ACTUAL HOSTED LOGGING AND RETENTION PRACTICE]`

### 3.8 Browser storage and cookies

The live repo shows at least two browser-side storage behaviors:

- the hosted/configure surface sets a CSRF cookie (`pvtkrrx_csrf`) with `SameSite=Strict` and a limited lifetime;
- the self-host configure page stores the self-host password in the browser's local storage when the user unlocks that browser for self-host administration.

The live self-host configure page also supports bootstrap links that may carry the self-host password in a URL fragment or query at first load, then removes that secret from the URL after reading it into browser storage.

The repo does not prove a final public cookie banner or cookie-classification policy for production release.

`[PLACEHOLDER – CONFIRM FINAL COOKIE DISCLOSURE POSITION AND ANY OTHER BROWSER-STORED UI DATA THAT SHOULD BE DISCLOSED]`

### 3.9 Optional analytics

The repo includes optional analytics support, currently for Umami, when that deployment is configured and the host is on the analytics allowlist.

The live analytics code can send event data such as:

- event name;
- hostname;
- request path;
- runtime surface;
- app version;
- route label;
- whether a config is linked;
- endpoint counts and related high-level event metadata.

The analytics utility also stores hashed dedupe keys in a local runtime file (`analytics-dedupe.json`) when dedupe windows are used.

The repo does not prove that analytics is enabled on the live public deployment at the time of this draft, and it does not prove the retention or IP-handling policy of the deployed analytics backend.

`[PLACEHOLDER – CONFIRM WHETHER ANALYTICS IS ENABLED IN LIVE PRODUCTION, WHAT THE BACKEND RETAINS, AND FOR HOW LONG]`

### 4. What PVTKRRX does not do with data, based on live repo truth

The live repo supports the following negative statements:

- the public hosted relay does not proxy video bytes;
- the public hosted relay does not act as a third-party media host for the user's playback stream;
- the account store stores a hash of the Stremio AuthKey rather than the raw AuthKey;
- the public `pair/status` route does not return raw endpoint metadata or raw pair keys;
- config readback and log surfaces redact secrets rather than exposing them directly;
- hosted connection testing is not allowed to probe loopback or private-resolution targets.

This notice does not claim:

- total anonymity;
- zero logging;
- zero data retention;
- total security;
- that every third-party service involved shares the same privacy posture.

### 5. Third parties and external recipients

Depending on your route and configuration, data may be sent to or processed through third parties such as:

- Stremio and the Stremio API;
- your configured Prowlarr, qBittorrent, tracker, seedbox, file server, or reverse proxy;
- SportsMeta for sports metadata and artwork URLs;
- an analytics provider if analytics is enabled by the operator.

If you self-host PVTKRRX, your own hosting provider, VPS provider, reverse proxy, and logging stack may also process data under your control.

### 6. Security measures described in the repo

The live repo shows the following security measures:

- encrypted hosted config tokens;
- encrypted-at-rest secure JSON for newly written runtime state files;
- hashed AuthKeys in the account store;
- hashed pair keys, owner ids, and client IPs in pair state;
- CSRF protection for sensitive web routes;
- same-host or self-host-password gating for local-only or private-service admin actions;
- hosted target validation that blocks loopback/LAN/private/rebinding test targets;
- log redaction for secrets, paths, and auth identifiers.

Important limitation: in self-host mode, the self-host password itself is stored in a local file on the self-host machine and may be stored in that browser's local storage on the configure page. The repo sets file permissions when creating the server-side password file, but this is still a secret you must protect on your own system.

### 7. Retention

The live repo proves some retention or TTL behavior, but not all of it.

What is shown in code:

- pair state has an expiry/TTL model, with a default TTL of 21,600 seconds in code unless changed by environment;
- link sessions are short-lived and expire based on a configured TTL;
- bearer auth tokens have a time limit;
- opaque playback and file-state tokens have a time limit;
- local config and self-host config persist on disk until changed or deleted;
- runtime logs and analytics dedupe state can persist in the runtime directory.

What the repo does not prove fully:

- final production retention schedules for hosted logs;
- final production retention schedules for hosted account state;
- final production retention schedules for KV-backed state;
- final production retention schedules for analytics backend data.

`[PLACEHOLDER – CONFIRM LIVE RETENTION SCHEDULES BEFORE FINAL ISSUE]`

### 8. Your choices

Depending on the route and deployment:

- you can stop using the hosted relay by choosing self-hosted server mode and your own infrastructure;
- you can delete local runtime data by deleting the relevant runtime directory on your own systems;
- you can clear browser-stored self-host password data by clearing the relevant browser storage;
- you can choose whether to use optional Stremio account linking.

The repo does not prove a finished public self-service portal for access, deletion, export, or correction requests against hosted account state.

`[PLACEHOLDER – CONFIRM USER RIGHTS HANDLING PROCESS FOR HOSTED ACCOUNT STATE]`

### 9. International transfers, legal bases, and regulator language

This draft repository review does not prove:

- the final legal entity;
- the hosting regions for all production systems;
- the final controller/processor allocation;
- the legal bases being relied on under UK GDPR/GDPR or other privacy law;
- the final cross-border transfer mechanism wording.

`[PLACEHOLDER – solicitor/privacy counsel to complete this section if required]`

### 10. Changes and contact

We may update this notice as the product changes. The final published notice should include:

`[PLACEHOLDER – privacy contact email]`

`[PLACEHOLDER – controller identity and address]`

`[PLACEHOLDER – effective date and update process]`

# E. In-App Acceptance Wording

## Short checkbox consent line

I understand that PVTKRRX is a bridge to my own Stremio and tracker/seedbox setup, not a hosted streaming service, and I accept the Terms, EULA, and Privacy Notice.

## Short installer acceptance line

By installing PVTKRRX, you accept the EULA and acknowledge that playback and setup depend on your own route, Stremio account, and supporting infrastructure.

## Short configure-page acceptance note

Saving this config creates a route for your own setup. PVTKRRX does not host your media bytes, and route behavior differs between `PC Local`, `LAN Bridge`, and `Remote Seedbox`.

# F. Solicitor Redline List

The following items should be reviewed, finalized, or replaced by a qualified solicitor before release:

1. Legal entity identity, registered address, and contracting party details.
2. Governing law, jurisdiction, venue, and any dispute-resolution wording.
3. Eligibility and age wording, including any adult-only or guardian language.
4. Consumer-rights carve-outs and whether the product is consumer-facing, business-facing, or mixed.
5. Limitation-of-liability cap and any exclusions that may not be enforceable in the target jurisdiction.
6. Indemnity scope, especially if consumer enforceability is limited.
7. Source-available and commercial-use restriction wording, because the repo says "Source Available" but the referenced licence text is missing from this snapshot.
8. The relationship between the Terms, the EULA, and any separate published source licence.
9. Copyright and infringement response process, including notice address, takedown handling, and repeat-abuse policy.
10. User-responsibility wording for trackers, downloaded content, and third-party services.
11. Privacy controller/processor roles across hosted relay, self-host server mode, and user-operated deployments.
12. UK GDPR/GDPR or other privacy-law requirements, including legal bases, data-subject rights, international transfers, and regulator language.
13. Final retention schedule for hosted logs, hosted account state, link-session state, KV-backed state, analytics, and support records.
14. Final disclosure around analytics, cookies, and browser-side storage.
15. Disclosure and treatment of the self-host password, including that the current repo stores it in a local file on the self-host machine and in browser local storage when the page is unlocked.
16. Whether Stremio AuthKey handling needs any additional contractual or privacy wording.
17. Any export-control, sanctions, or restricted-use language that the operator requires.
18. Any SLA, support, uptime, or maintenance commitments, if any will be promised publicly.
19. Any billing, payment, subscription, trial, refund, or cancellation wording if those features are later enabled.
20. Any treatment of SportsMeta as a separate product/service boundary and whether cross-product terms or notices are needed.
21. Third-party software notices, attribution, and any open-source notice schedule.
22. Installer consent mechanics and clickwrap enforceability for desktop and self-host install flows.
23. Whether any additional warning language is needed for route-specific failure modes, auth-protected file servers, or device-specific Stremio behavior.

# G. Assumed / Verified / Missing

## ASSUMED

- `[PLACEHOLDER – PVTKRRX legal entity name]` is not identifiable from the live repo snapshot.
- Final governing law and dispute forum are not identifiable from the live repo snapshot.
- Final contact emails and notice address are not identifiable from the live repo snapshot.
- The exact outbound source licence text is not present even though repo metadata refers to one.
- Live production analytics enablement, analytics retention, and analytics-backend privacy policy are not proven by the repo snapshot alone.
- Final hosted log-retention policy is not proven by the repo snapshot alone.
- Final billing/payment/refund position for launch is assumed to be "not live" because the repo says access is currently forced free, but a solicitor should confirm the public legal position.

## VERIFIED FROM LIVE DOCS

- PVTKRRX brings private tracker and seedbox content into Stremio.
- PVTKRRX is not a debrid service.
- PVTKRRX is not a third-party media host.
- PVTKRRX is not a generic streaming platform.
- PVTKRRX is a bridge layer between the user's own setup and Stremio.
- Hosted relay routes do not proxy video bytes.
- Configuration comes first.
- The user must provide their own infrastructure.
- Route behavior differs and must not be blurred.
- `PC Local` exists and uses the same-PC `127.0.0.1` path.
- Raw `192.168.x.x` addon install is not the stable primary supported Stremio route.
- `LAN Bridge` / home-device routing depends on hosted manifest plus heartbeat plus redirect to the active local host.
- `Remote Seedbox` on the public hosted relay depends on public playback infrastructure and is ready-file-first.
- Hosted `/file` and `/playback` fail fast on the public hosted relay when playback still depends on local-only serving.
- Sports, movies, TV, and library are all part of the addon family.
- Built-in file serving exists when the runtime can read the file locally.
- External file serving is optional in some setups and routes, not universal.
- Optional Stremio account linking exists.
- Pair state exists.
- Hosted/state features may use KV-backed storage when configured.
- Hosted config tokens are encrypted.
- Local and self-host config can be disk-backed.
- New secure JSON runtime state is written in encrypted wrapper form.
- The repo hashes Stremio AuthKeys in account state instead of storing them in clear in the account store.
- The repo hashes pair keys, owner ids, and client IPs in pair state.
- The repo redacts secrets, URLs, paths, and auth identifiers in log output.
- The self-host server uses a self-host password, and the configure UI stores that password in browser local storage when the user unlocks the page.
- SportsMeta is a separate product/service boundary for sports metadata/artwork and billing.
- The route naming conflict is real: both `LAN Bridge` and `Hybrid Home` appear in live surfaces.

## MISSING INPUT NEEDED BEFORE FINAL LEGAL ISSUE

- Contracting entity name, registered address, and company details.
- Governing law, jurisdiction, and dispute-resolution position.
- Final contact details for legal notices, privacy requests, and support.
- Final source licence text and how it interacts with personal-use and commercial-use restrictions.
- Final privacy-controller and processor mapping across hosted relay and self-host deployments.
- Final hosted retention schedule for logs, account data, link-session state, pair state, and analytics.
- Final analytics policy, including whether analytics is enabled in production and what the analytics backend retains.
- Final user-rights handling process for access, deletion, correction, or export of hosted account state.
- Final copyright/infringement notice and takedown process.
- Final consumer-rights language for the intended launch jurisdiction.
- Final payment/refund/trial terms if billing or subscriptions are later switched on.
- Final third-party notices and attribution schedule.
- Final decision on route naming: unify on one term, or formally define aliasing between `LAN Bridge` and `Hybrid Home`.

# H. Self-Audit

## A. False-claim check

PASS, with placeholders where needed.

This draft does not claim that:

- PVTKRRX is a debrid service;
- PVTKRRX hosts media;
- the hosted relay proxies video bytes;
- setup is universal or no-config;
- every route behaves the same way;
- sports is a live sports service;
- privacy or security is absolute.

This draft does state that the product is a bridge to user-controlled infrastructure and that hosted playback behavior is route-dependent.

## B. Missing-lawyer-input check

PASS, with explicit open items.

This draft leaves placeholders or redlines for:

- legal entity identity;
- governing law;
- liability cap;
- contact details;
- source licence text;
- privacy controller details;
- retention schedules;
- consumer-rights wording;
- takedown process;
- billing/refund language if later enabled.

## C. Route-model consistency check

PASS, with conflict flagged rather than hidden.

This draft:

- keeps `PC Local`, `LAN Bridge`, and `Remote Seedbox` separate;
- states that `PC Local` is the same-PC host route;
- states that the home-device route depends on hosted manifest plus heartbeat plus redirect;
- states that the public hosted `Remote Seedbox` route is ready-file-first and needs public endpoints;
- states that self-hosted server mode is different from the public hosted relay;
- explicitly flags the `LAN Bridge` / `Hybrid Home` naming conflict and does not pretend it does not exist.

## D. Privacy overclaim check

PASS, with conservative wording.

This draft does not promise:

- zero logging;
- zero retention;
- total anonymity;
- total security;
- no third-party data handling.

Where the repo does not prove a live operational practice, the draft uses `[PLACEHOLDER – CONFIRM ACTUAL PRACTICE]` or equivalent wording.

## E. Marketing language removed check

PASS.

This draft removes or avoids:

- "no setup required";
- "instant magic install";
- "works everywhere the same way";
- "fully hosted playback";
- "cloud streaming from PVTKRRX";
- "PVTKRRX hosts your media";
- "universal one-route install";
- "live sports platform".

The draft stays in legal/plain-English product-truth language rather than marketing copy.
