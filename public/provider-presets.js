(function (global) {
  "use strict";

  var providers = [
    {
      id: "custom",
      label: "Custom / Other",
      badges: ["Manual setup", "Use exact provider URLs"],
      compatibility: {
        lan: "yes",
        remote: "conditional",
        direct: "conditional",
        note: "Use Remote Seedbox only when qBittorrent, Prowlarr, and your completed-file path are reachable over trusted public HTTPS."
      },
      route: {
        label: "Depends on your provider",
        reason: "If your provider only exposes loopback, LAN, HTTP-only, or browser-only endpoints, use PC Local or LAN Bridge instead of hosted Remote Seedbox."
      },
      preset: {
        from: "",
        to: "",
        qbitPlaceholder: "https://seedbox.example.com/qbittorrent",
        prowlarrPlaceholder: "https://seedbox.example.com/prowlarr",
        fileServerPlaceholder: "https://seedbox.example.com/files",
        note: "Paste the exact public URLs from your provider panel. Hosted Remote Seedbox on www.pvtkrrx.cc needs a trusted HTTPS file URL."
      },
      fields: [
        {
          label: "qBittorrent URL",
          value: "Exact public qBittorrent WebUI URL",
          detail: "Use the provider's real public URL, including any required subpath."
        },
        {
          label: "Prowlarr URL",
          value: "Exact public Prowlarr URL",
          detail: "Use the public URL you already use in your browser, not a private host or raw loopback address."
        },
        {
          label: "File Server URL",
          value: "Exact public file/download base URL",
          detail: "This must map back to the same filesystem tree that qBittorrent saves into, or you must adjust Path Mapping."
        }
      ],
      pathMappingNote: "Leave the mapping blank only if your file server URL already points at the same filesystem root qBittorrent uses. Otherwise map qBit's filesystem prefix to the web root your file server exposes.",
      authNote: "If the published file area uses Basic Auth, put user:password in File Server Auth. Hosted Remote Seedbox can only use auth on clients that honor the emitted auth behavior.",
      steps: [
        "Pick the provider whose panel or docs already give you public HTTPS qBittorrent, Prowlarr, and file URLs. If you do not have that, use PC Local or LAN Bridge instead.",
        "In /configure, choose Custom / Other and paste the exact public qBittorrent URL, Prowlarr URL, and completed-file base URL.",
        "Set Path Mapping so qBittorrent save paths can be translated into public file URLs.",
        "If the file area is Basic Auth protected, fill File Server Auth as user:password.",
        "Generate the Remote Seedbox URL and test on the real Stremio client you plan to use."
      ],
      directHost: {
        supported: "conditional",
        intro: "Only self-host PVTKRRX on the seedbox if the provider gives SSH, a current Node runtime, and a trusted HTTPS route for the addon itself.",
        commands: [
          "git clone https://github.com/Kepners/pvtkrrx.git",
          "cd pvtkrrx",
          "npm ci --omit=dev",
          "PORT=7000 ENCRYPTION_SECRET=$(openssl rand -hex 32) node index.js"
        ],
        steps: [
          "Run the addon behind a trusted HTTPS reverse proxy or provider app-routing layer.",
          "If the addon is only exposed on a subpath, keep that in mind when testing Stremio install behavior."
        ]
      },
      docs: []
    },
    {
      id: "whatbox",
      label: "Whatbox",
      badges: ["Managed Links", "SSH + Node", "Best fit: Remote Seedbox or Direct"],
      compatibility: {
        lan: "yes",
        remote: "yes",
        direct: "yes",
        note: "Managed Links expose public HTTPS app URLs and SSH lets advanced users self-host PVTKRRX on the box."
      },
      route: {
        label: "Remote Seedbox or Direct",
        reason: "Most users should keep PVTKRRX hosted and wire in their Whatbox URLs. Direct hosting is only for users who want the addon runtime on Whatbox itself."
      },
      preset: {
        from: "/home/",
        to: "/",
        qbitPlaceholder: "https://<your-qbit-managed-link>",
        prowlarrPlaceholder: "https://<your-prowlarr-managed-link>",
        fileServerPlaceholder: "https://<your-files-host>",
        note: "Use the exact HTTPS Managed Link or published file host from Whatbox. Avoid raw port URLs in hosted mode."
      },
      fields: [
        {
          label: "qBittorrent URL",
          value: "HTTPS qBittorrent Managed Link from Whatbox Manage Apps",
          detail: "Paste the exact Managed Link URL instead of a raw :8080 address."
        },
        {
          label: "Prowlarr URL",
          value: "HTTPS Prowlarr Managed Link from Whatbox Manage Apps",
          detail: "Install Prowlarr in Manage Apps first if it is not already available."
        },
        {
          label: "File Server URL",
          value: "Exact HTTPS files/download host you expose on Whatbox",
          detail: "Keep Path Mapping: To as / only if that web root maps back to your home-directory root."
        }
      ],
      pathMappingNote: "Whatbox usually maps /home/ to the web root you publish. If your files are exposed deeper than the root, keep /home/ as From and change To to the published subpath.",
      authNote: "If the file host prompts for Basic Auth, set File Server Auth as user:password and test on a real Stremio client.",
      steps: [
        "Open Whatbox Manage Apps and confirm qBittorrent and Prowlarr are installed.",
        "In PVTKRRX /configure, select Whatbox. That auto-fills /home/ -> / and opens the matching runbook link.",
        "Paste the exact HTTPS Managed Links for qBittorrent and Prowlarr.",
        "Paste the HTTPS file/download host you use for completed files. If that host serves a subfolder, change Path Mapping: To to that subfolder.",
        "Add File Server Auth if the published files require a login, then generate the Remote Seedbox URL."
      ],
      directHost: {
        supported: "yes",
        intro: "Optional advanced path if you want PVTKRRX itself running on Whatbox.",
        commands: [
          "ssh user@server.whatbox.ca",
          "mkdir -p ~/apps",
          "cd ~/apps",
          "git clone https://github.com/Kepners/pvtkrrx.git",
          "cd pvtkrrx",
          "npm ci --omit=dev",
          "PORT=15000 ENCRYPTION_SECRET=$(openssl rand -hex 32) nohup node index.js > pvtkrrx.log 2>&1 &"
        ],
        steps: [
          "Expose the chosen port through a custom Managed Link so Stremio sees a trusted HTTPS URL.",
          "Use this only if you want the addon runtime on Whatbox instead of on www.pvtkrrx.cc."
        ]
      },
      docs: [
        { label: "Managed Links", url: "https://whatbox.ca/wiki/Managed_Links" },
        { label: "Installing Software", url: "https://whatbox.ca/wiki/Installing_Software" },
        { label: "SSH", url: "https://whatbox.ca/wiki/ssh" }
      ]
    },
    {
      id: "ultra",
      label: "Ultra.cc",
      badges: ["App panel", "Path-based app URLs", "Direct hosting is conditional"],
      compatibility: {
        lan: "yes",
        remote: "yes",
        direct: "conditional",
        note: "Ultra apps normally live behind trusted HTTPS on your slot host, but direct hosting still depends on app-port and Nginx proxy setup."
      },
      route: {
        label: "Remote Seedbox first",
        reason: "Ultra already exposes app URLs over HTTPS. Use direct hosting only if you are comfortable with app-ports and Nginx proxy configuration."
      },
      preset: {
        from: "/home/",
        to: "/",
        qbitPlaceholder: "https://<slot>.ultra.cc/qbittorrent",
        prowlarrPlaceholder: "https://<slot>.ultra.cc/prowlarr",
        fileServerPlaceholder: "https://<slot>.ultra.cc/<files-path>",
        note: "Ultra app URLs usually live under the slot host plus an app base path such as /qbittorrent or /prowlarr."
      },
      fields: [
        {
          label: "qBittorrent URL",
          value: "https://<slot>.ultra.cc/qbittorrent",
          detail: "Use the exact qBittorrent app URL from the Ultra panel if your slot host or path differs."
        },
        {
          label: "Prowlarr URL",
          value: "https://<slot>.ultra.cc/prowlarr",
          detail: "Use the Prowlarr app URL from the panel. Keep the full app subpath."
        },
        {
          label: "File Server URL",
          value: "Exact HTTPS files path you already expose on the slot host",
          detail: "If your files live under a published subpath, change Path Mapping: To to that same subpath."
        }
      ],
      pathMappingNote: "Ultra usually maps /home/ to the published web root. Adjust Path Mapping: To if your file URLs start under a deeper subpath.",
      authNote: "If your published files use Basic Auth or app credentials, add File Server Auth and verify playback on the clients you actually use.",
      steps: [
        "Select Ultra.cc in PVTKRRX /configure to auto-fill /home/ -> / and update the URL examples.",
        "Paste your Ultra qBittorrent URL, normally under /qbittorrent, and your Prowlarr URL, normally under /prowlarr.",
        "Paste the HTTPS file path you use for completed downloads. If it is not rooted at /, set Path Mapping: To to that published subpath.",
        "Add File Server Auth if the published file area requires credentials.",
        "Generate the Remote Seedbox URL and test it from the real Stremio client."
      ],
      directHost: {
        supported: "conditional",
        intro: "Advanced only. Use Ultra app ports and Nginx proxy routing if you want PVTKRRX running on the box.",
        commands: [
          "ssh username@host",
          "bash <(wget -qO- https://scripts.ultra.cc/util-v2/LanguageInstaller/Node-Installer/main.sh)",
          "app-ports free",
          "mkdir -p ~/apps",
          "cd ~/apps",
          "git clone https://github.com/Kepners/pvtkrrx.git",
          "cd pvtkrrx",
          "npm ci --omit=dev",
          "PORT=<free-port> ENCRYPTION_SECRET=$(openssl rand -hex 32) nohup node index.js > pvtkrrx.log 2>&1 &"
        ],
        steps: [
          "Proxy the chosen port through ~/.apps/nginx/proxy.d/ and reload app-nginx so Stremio sees HTTPS.",
          "If the addon only ends up available on a subpath, treat install behavior as conditional and test with the real client."
        ]
      },
      docs: [
        { label: "Install Node.js", url: "https://docs.ultra.cc/unofficial-language-installers/install-nodejs" },
        { label: "Generic Software Installation", url: "https://docs.ultra.cc/unofficial-application-installers/generic-software-installation" },
        { label: "Assigned Ports", url: "https://docs.ultra.cc/unofficial-ssh-utilities/assigned-ports-command" }
      ]
    },
    {
      id: "seedhost",
      label: "SeedHost",
      badges: ["Shared plans are limited", "qBit path documented", "Remote Seedbox is conditional"],
      compatibility: {
        lan: "yes",
        remote: "conditional",
        direct: "conditional",
        note: "SeedHost documents qBittorrent over a hosted path, but hosted Remote Seedbox still depends on whether your file access is trusted public HTTPS."
      },
      route: {
        label: "Remote Seedbox only if your file access is trusted HTTPS",
        reason: "SeedHost can expose app URLs publicly, but hosted PVTKRRX still needs a trusted HTTPS completed-file URL. If you only have HTTP file access, use LAN Bridge or self-host."
      },
      preset: {
        from: "/home/",
        to: "/",
        qbitPlaceholder: "https://<hostname>/<username>/qbittorrent",
        prowlarrPlaceholder: "https://<hostname>/<username>/prowlarr",
        fileServerPlaceholder: "https://<your-seedhost-files-url>",
        note: "SeedHost documents qBittorrent as host + /username/qbittorrent. Confirm the exact Prowlarr and file URLs in Client Area before saving."
      },
      fields: [
        {
          label: "qBittorrent URL",
          value: "https://<hostname>/<username>/qbittorrent",
          detail: "SeedHost documents qBittorrent WebUI as host + 443 + /username/qbittorrent."
        },
        {
          label: "Prowlarr URL",
          value: "Usually https://<hostname>/<username>/prowlarr",
          detail: "SeedHost one-click apps generally follow the same hosted path style as qBittorrent. Confirm the exact Prowlarr URL in Client Area."
        },
        {
          label: "File Server URL",
          value: "Exact public file/direct-download URL from SeedHost",
          detail: "Hosted Remote Seedbox needs trusted HTTPS. If SeedHost only gives you HTTP file access on your plan, use LAN Bridge or self-host PVTKRRX instead."
        }
      ],
      pathMappingNote: "Start with /home/ -> /. If your published files are served under a nested web folder, change Path Mapping: To to that published folder.",
      authNote: "If the file area is protected, add File Server Auth as user:password. Validate on your real Stremio client, not just in a browser.",
      steps: [
        "Confirm qBittorrent and Prowlarr are installed in SeedHost Client Area.",
        "Select SeedHost in PVTKRRX /configure to auto-fill /home/ -> /.",
        "Paste the documented qBittorrent URL and confirm the exact Prowlarr URL from Client Area before saving.",
        "Only use hosted Remote Seedbox if you also have a trusted HTTPS file/download URL for completed files. If your file path is HTTP-only, switch to LAN Bridge or self-host PVTKRRX.",
        "Adjust Path Mapping: To if the published file URL starts below the web root, then generate the Remote Seedbox URL."
      ],
      directHost: {
        supported: "conditional",
        intro: "Optional advanced path on plans where SSH and a current LTS Node install are available.",
        commands: [
          "# Install a current LTS Node release using the SeedHost Node guide first",
          "mkdir -p ~/apps",
          "cd ~/apps",
          "git clone https://github.com/Kepners/pvtkrrx.git",
          "cd pvtkrrx",
          "npm ci --omit=dev",
          "PORT=7000 ENCRYPTION_SECRET=$(openssl rand -hex 32) nohup node index.js > pvtkrrx.log 2>&1 &"
        ],
        steps: [
          "Do not pin PVTKRRX docs to an old Node tarball. Use the current LTS flow from SeedHost docs.",
          "Only treat direct hosting as finished after the addon itself is behind trusted HTTPS."
        ]
      },
      docs: [
        { label: "Node Install", url: "https://www.seedhost.eu/client-area/knowledgebase/256/node.js-installation.html" },
        { label: "Shared App FAQ", url: "https://www.seedhost.eu/wspoldzielony-hosting.php" },
        { label: "Available Apps", url: "https://www.seedhost.eu/client-area/knowledgebase/303/List-of-available-apps.html" }
      ]
    },
    {
      id: "feral",
      label: "Feral Hosting",
      badges: ["Proxypass matters", "User-space tooling", "Best fit: Remote Seedbox or LAN Bridge"],
      compatibility: {
        lan: "yes",
        remote: "yes",
        direct: "conditional",
        note: "Feral can expose apps over HTTPS with proxypass, but direct hosting is still user-space and routing-dependent."
      },
      route: {
        label: "Remote Seedbox or LAN Bridge",
        reason: "Feral works well once qBittorrent, Prowlarr, and file access are all behind HTTPS proxypass URLs. Direct hosting is optional and more manual."
      },
      preset: {
        from: "/media/",
        to: "/",
        qbitPlaceholder: "https://<server>.feralhosting.com/<username>/qbittorrent",
        prowlarrPlaceholder: "https://<server>.feralhosting.com/<username>/prowlarr",
        fileServerPlaceholder: "https://<server>.feralhosting.com/<username>/<files-path>",
        note: "Hosted Remote Seedbox should use the HTTPS proxypass URLs, not the raw high-port Feral app URLs."
      },
      fields: [
        {
          label: "qBittorrent URL",
          value: "https://<server>.feralhosting.com/<username>/qbittorrent",
          detail: "Expose qBittorrent through Feral proxypass first, then use that HTTPS URL in PVTKRRX."
        },
        {
          label: "Prowlarr URL",
          value: "https://<server>.feralhosting.com/<username>/prowlarr",
          detail: "Use the HTTPS proxypass URL for Prowlarr, not the raw internal port."
        },
        {
          label: "File Server URL",
          value: "https://<server>.feralhosting.com/<username>/<published-path>",
          detail: "Point this at the HTTPS path that can actually reach completed files under /media/."
        }
      ],
      pathMappingNote: "Feral usually needs /media/ -> /. If your HTTPS file path begins under a deeper subpath, change Path Mapping: To to that published subpath.",
      authNote: "If the published file area is Basic Auth protected, add File Server Auth. Hosted auth behavior still needs testing on the Stremio client you use.",
      steps: [
        "Select Feral Hosting in PVTKRRX /configure. That auto-fills /media/ -> /.",
        "Expose qBittorrent and Prowlarr through Feral proxypass and paste those HTTPS URLs into PVTKRRX.",
        "Paste the HTTPS file URL that maps back to the same /media/ tree qBittorrent saves into.",
        "If the web files live below the root path, set Path Mapping: To to that published subpath.",
        "Generate the Remote Seedbox URL and validate playback on a real client."
      ],
      directHost: {
        supported: "conditional",
        intro: "Advanced only. Install a current Node build in home space, then run PVTKRRX on a high port and proxypass it.",
        commands: [
          "# Follow the current Feral Node guide first",
          "mkdir -p ~/apps",
          "cd ~/apps",
          "git clone https://github.com/Kepners/pvtkrrx.git",
          "cd pvtkrrx",
          "npm ci --omit=dev",
          "PORT=<high-port> ENCRYPTION_SECRET=$(openssl rand -hex 32) nohup node index.js > pvtkrrx.log 2>&1 &"
        ],
        steps: [
          "Do not pin Feral setup to the ancient Node 12 tarball. Use the current Node guide instead.",
          "Expose the addon itself through proxypass before treating it as a working Stremio endpoint."
        ]
      },
      docs: [
        { label: "Generic Install", url: "https://www.feralhosting.com/wiki/slots/generic-install-guide" },
        { label: "Node.js", url: "https://www.feralhosting.com/wiki/software/nodejs" },
        { label: "Proxypass", url: "https://www.feralhosting.com/wiki/slots/proxypass" }
      ]
    },
    {
      id: "rapid",
      label: "RapidSeedbox",
      badges: ["Lean lacks SSH", "Premium enables direct hosting", "Remote Seedbox is conditional"],
      compatibility: {
        lan: "yes",
        remote: "conditional",
        direct: "conditional",
        note: "RapidSeedbox can expose app URLs publicly, but hosted Remote Seedbox still depends on having trusted HTTPS playback URLs. Lean plans do not offer SSH."
      },
      route: {
        label: "Remote Seedbox when you already have trusted HTTPS app and file URLs",
        reason: "Use Lean or standard panel URLs for hosted Remote Seedbox only when qBittorrent, Prowlarr, and completed files are all reachable over trusted HTTPS. Premium is required if you want to self-host PVTKRRX."
      },
      preset: {
        from: "/home/",
        to: "/",
        qbitPlaceholder: "https://<your-rapid-qbit-url>",
        prowlarrPlaceholder: "https://<your-rapid-prowlarr-url>",
        fileServerPlaceholder: "https://<your-rapid-files-url>",
        note: "Use the exact HTTPS Web Access URLs from the RapidSeedbox panel. Treat self-signed or browser-only access as conditional for hosted Remote Seedbox."
      },
      fields: [
        {
          label: "qBittorrent URL",
          value: "Exact HTTPS qBittorrent Web Access URL from the RapidSeedbox panel",
          detail: "Do not guess the hostname. Paste the URL RapidSeedbox already shows for qBittorrent."
        },
        {
          label: "Prowlarr URL",
          value: "Exact HTTPS Prowlarr URL from the RapidSeedbox panel",
          detail: "Use the public URL RapidSeedbox gives you for the installed app."
        },
        {
          label: "File Server URL",
          value: "Exact trusted HTTPS file/download URL",
          detail: "If the published file area is only browser-accepted or self-signed, hosted Remote Seedbox remains conditional. Use LAN Bridge or self-host instead."
        }
      ],
      pathMappingNote: "Start with /home/ -> /. If your published file URLs begin inside a subfolder, change Path Mapping: To to that folder.",
      authNote: "Use File Server Auth if the published downloads require credentials. Test on the actual Stremio client, not just in a browser.",
      steps: [
        "Check the RapidSeedbox panel for the exact qBittorrent, Prowlarr, and file/download URLs you already use.",
        "In PVTKRRX /configure, select RapidSeedbox to auto-fill /home/ -> /.",
        "Paste the exact public app URLs instead of inventing a hostname or port.",
        "Only use hosted Remote Seedbox if the completed-file URL is trusted HTTPS. If it is not, stay on LAN Bridge or move to a Premium/self-hosted setup.",
        "Lean plans stop here. Premium users can also self-host PVTKRRX if they need the addon runtime on-box."
      ],
      directHost: {
        supported: "conditional",
        intro: "Premium only. Lean plans do not offer SSH, so direct hosting is not available there.",
        commands: [
          "ssh <premium-user>@<premium-host>",
          "mkdir -p ~/apps",
          "cd ~/apps",
          "git clone https://github.com/Kepners/pvtkrrx.git",
          "cd pvtkrrx",
          "npm ci --omit=dev",
          "PORT=7000 ENCRYPTION_SECRET=$(openssl rand -hex 32) nohup node index.js > pvtkrrx.log 2>&1 &"
        ],
        steps: [
          "Put the addon behind RapidSeedbox's HTTPS routing layer or your own reverse proxy before testing Stremio install.",
          "If you stay on Lean, treat PVTKRRX as hosted elsewhere and only connect your public app URLs."
        ]
      },
      docs: [
        { label: "Lean FAQ", url: "https://help.rapidseedbox.com/en/articles/6998134-faq-lean-seedbox" },
        { label: "SSH Access", url: "https://help.rapidseedbox.com/en/articles/903924-how-to-connect-to-your-seedbox-using-ssh" },
        { label: "Premium One-Click / Custom", url: "https://help.rapidseedbox.com/en/articles/5945962-install-uninstall-apps-using-the-one-click-installers-on-the-premium-seedbox" }
      ]
    },
    {
      id: "bytesized",
      label: "Bytesized",
      badges: ["Official HTTP downloads are plain HTTP", "Connect requires more control", "Remote Seedbox is conditional"],
      compatibility: {
        lan: "yes",
        remote: "conditional",
        direct: "conditional",
        note: "Bytesized's official HTTP download guide is plain HTTP plus Basic Auth. Hosted Remote Seedbox on www.pvtkrrx.cc needs trusted HTTPS for the completed-file path."
      },
      route: {
        label: "LAN Bridge or self-host unless you already have HTTPS file access",
        reason: "Bytesized can work with hosted Remote Seedbox only if you front the official HTTP download surface with your own trusted HTTPS endpoint. Otherwise stay on LAN Bridge or self-host."
      },
      preset: {
        from: "/home/",
        to: "/",
        qbitPlaceholder: "https://<your-bytesized-app-url>",
        prowlarrPlaceholder: "https://<your-bytesized-prowlarr-url>",
        fileServerPlaceholder: "https://<your-https-file-host>",
        note: "Bytesized's own HTTP download guide uses plain HTTP. Hosted Remote Seedbox needs a trusted HTTPS file URL, so use your own HTTPS front end if necessary."
      },
      fields: [
        {
          label: "qBittorrent URL",
          value: "Exact public qBittorrent URL from the Bytesized panel",
          detail: "Use the panel-provided URL for the app you already expose publicly."
        },
        {
          label: "Prowlarr URL",
          value: "Exact public Prowlarr URL from the Bytesized panel",
          detail: "Paste the actual app URL from Bytesized rather than guessing a path."
        },
        {
          label: "File Server URL",
          value: "Official guide: http://<username>.<server>.bysh.me/<share>",
          detail: "That official Bytesized path is plain HTTP. Hosted Remote Seedbox on www.pvtkrrx.cc needs trusted HTTPS, so put your own HTTPS proxy in front of it or use LAN Bridge/self-host."
        }
      ],
      pathMappingNote: "Start with /home/ -> /. If your HTTPS proxy publishes files under a subpath such as /data, set Path Mapping: To to that subpath.",
      authNote: "Bytesized's HTTP guide uses Basic Auth via .htpasswd. If you proxy that behind HTTPS, keep the same credentials in File Server Auth.",
      steps: [
        "Treat Bytesized hosted Remote Seedbox as conditional. The official file-download path is plain HTTP, which the hosted relay does not accept as a finished public file URL.",
        "If you already front Bytesized downloads with trusted HTTPS, select Bytesized in /configure and start with /home/ -> /.",
        "Paste the exact qBittorrent and Prowlarr URLs from the Bytesized panel.",
        "Paste your trusted HTTPS file host. If it is just the default bysh HTTP link, switch to LAN Bridge or self-host instead of hosted Remote Seedbox.",
        "Use File Server Auth if your published files still require credentials."
      ],
      directHost: {
        supported: "conditional",
        intro: "SSH is available, but if you want full control over public HTTPS playback it is usually cleaner to self-host PVTKRRX on your own server or Connect target.",
        commands: [
          "# Prefer your own VPS / Connect target if you need full HTTPS control",
          "git clone https://github.com/Kepners/pvtkrrx.git",
          "cd pvtkrrx",
          "npm ci --omit=dev",
          "PORT=7000 ENCRYPTION_SECRET=$(openssl rand -hex 32) node index.js"
        ],
        steps: [
          "Use Bytesized Connect only when you control the target server requirements and its HTTPS routing.",
          "Do not rely on the default plain-HTTP bysh file path for hosted Remote Seedbox."
        ]
      },
      docs: [
        { label: "Connect", url: "https://bytesized-hosting.com/pages/connect" },
        { label: "SSH", url: "https://bytesized-hosting.com/pages/ssh" },
        { label: "HTTP Download", url: "https://bytesized-hosting.com/pages/http-download" }
      ]
    },
    {
      id: "hbd",
      label: "HostingByDesign",
      badges: ["Application hosting", "SSH + box tooling", "Remote or Direct"],
      compatibility: {
        lan: "yes",
        remote: "yes",
        direct: "yes",
        note: "HBD application-hosting slots expose apps over HTTPS and still give you SSH plus box tooling for more control."
      },
      route: {
        label: "Remote Seedbox or Direct",
        reason: "Use hosted Remote Seedbox when your HBD app URLs and file host are already public over HTTPS. Direct hosting is realistic on plans where you control the slot and routing."
      },
      preset: {
        from: "/home/",
        to: "/",
        qbitPlaceholder: "https://<your-hbd-qbit-url>",
        prowlarrPlaceholder: "https://<your-hbd-prowlarr-url>",
        fileServerPlaceholder: "https://<your-hbd-files-url>",
        note: "Use the exact HBD app URL from the panel or box tooling. Keep the full path if your app is mounted under a subpath."
      },
      fields: [
        {
          label: "qBittorrent URL",
          value: "Exact HTTPS qBittorrent URL from HBD application hosting",
          detail: "Use the actual HBD app URL rather than a guessed hostname or port."
        },
        {
          label: "Prowlarr URL",
          value: "Exact HTTPS Prowlarr URL from HBD application hosting",
          detail: "Paste the full public URL, including any app subpath."
        },
        {
          label: "File Server URL",
          value: "Exact trusted HTTPS file/download URL",
          detail: "Point this at the web root that can actually reach the qBittorrent save path you want to publish."
        }
      ],
      pathMappingNote: "Start with /home/ -> /. If HBD publishes your files deeper under the URL, change Path Mapping: To to the same published folder.",
      authNote: "If the published file area requires Basic Auth or panel credentials, add File Server Auth and validate on a real client.",
      steps: [
        "Check the HBD panel or box tooling for the exact HTTPS qBittorrent, Prowlarr, and file/download URLs you already use.",
        "Select HostingByDesign in PVTKRRX /configure to auto-fill /home/ -> /.",
        "Paste those exact public URLs instead of inventing a hostname or port.",
        "If your file URL starts below the web root, update Path Mapping: To to match that published subpath.",
        "Generate the Remote Seedbox URL and test it from the real Stremio client."
      ],
      directHost: {
        supported: "yes",
        intro: "Optional advanced path if you want PVTKRRX itself running on the HBD slot.",
        commands: [
          "ssh <user>@<slot-host>",
          "mkdir -p ~/apps",
          "cd ~/apps",
          "git clone https://github.com/Kepners/pvtkrrx.git",
          "cd pvtkrrx",
          "npm ci --omit=dev",
          "PORT=7000 ENCRYPTION_SECRET=$(openssl rand -hex 32) nohup node index.js > pvtkrrx.log 2>&1 &"
        ],
        steps: [
          "Expose the addon itself through the HBD HTTPS routing layer and keep PVTKRRX_ALLOWED_WEB_ORIGINS aligned to that origin if you lock it down.",
          "Use this only if you want the addon runtime on HBD instead of on the hosted relay."
        ]
      },
      docs: [
        { label: "box Basics", url: "https://docs.hostingby.design/application-hosting/getting-started/box-basics" },
        { label: "App Example", url: "https://docs.hostingby.design/application-hosting/applications/jackett" }
      ]
    },
    {
      id: "swizzin",
      label: "Swizzin",
      badges: ["Self-hosted", "Best direct-host option", "Full control"],
      compatibility: {
        lan: "yes",
        remote: "yes",
        direct: "yes",
        note: "Swizzin is the cleanest option when you control the VPS, domain, Nginx, and application paths yourself."
      },
      route: {
        label: "Direct or Remote Seedbox",
        reason: "If you control Swizzin, you can make the app URLs and file server match PVTKRRX exactly instead of adapting to a provider panel."
      },
      preset: {
        from: "/home/",
        to: "/",
        qbitPlaceholder: "https://seedbox.example.com/qbittorrent",
        prowlarrPlaceholder: "https://seedbox.example.com/prowlarr",
        fileServerPlaceholder: "https://seedbox.example.com/files",
        note: "Swizzin usually exposes apps behind your own domain. Keep the full subpath you configured in Nginx."
      },
      fields: [
        {
          label: "qBittorrent URL",
          value: "https://<your-domain>/qbittorrent",
          detail: "Use the exact Swizzin qBittorrent path you exposed through Nginx."
        },
        {
          label: "Prowlarr URL",
          value: "https://<your-domain>/prowlarr",
          detail: "Use the exact Prowlarr path you exposed through Nginx."
        },
        {
          label: "File Server URL",
          value: "https://<your-domain>/<files-path>",
          detail: "Point this at the same published root that maps back to the qBittorrent save path."
        }
      ],
      pathMappingNote: "Start with /home/ -> /. If your Nginx location publishes files under a subpath such as /downloads or /files, set Path Mapping: To to that subpath.",
      authNote: "Use File Server Auth only if you intentionally protect the published file area. Otherwise keep file URLs simple for Stremio.",
      steps: [
        "Select Swizzin in PVTKRRX /configure to auto-fill /home/ -> /.",
        "Paste the exact qBittorrent and Prowlarr URLs you exposed through your Swizzin/Nginx setup.",
        "Paste the file URL that can reach completed files. If it is mounted below the root path, change Path Mapping: To to that same subpath.",
        "Generate the Remote Seedbox URL if you want the hosted manifest, or self-host PVTKRRX directly on the Swizzin box if you want the addon runtime there.",
        "Validate playback on the exact Stremio client you intend to use."
      ],
      directHost: {
        supported: "yes",
        intro: "Swizzin is the strongest direct-host option because you control the VPS, the reverse proxy, and the process supervisor.",
        commands: [
          "git clone https://github.com/Kepners/pvtkrrx.git",
          "cd pvtkrrx",
          "npm ci --omit=dev",
          "ENCRYPTION_SECRET=$(openssl rand -hex 32) PORT=7000 node index.js"
        ],
        steps: [
          "Run PVTKRRX behind Nginx on a dedicated domain or subdomain.",
          "If you want stable startup and restart behavior, supervise it with systemd, pm2, or your preferred service manager."
        ]
      },
      docs: [
        { label: "Swizzin Docs", url: "https://swizzin.ltd/" },
        { label: "Swizzin GitHub", url: "https://github.com/swizzin/swizzin" }
      ]
    }
  ];

  var byId = Object.create(null);
  providers.forEach(function (provider) {
    byId[provider.id] = provider;
  });

  global.PVTKRRX_PROVIDER_PRESETS = {
    updatedAt: "March 31, 2026",
    providers: providers,
    byId: byId,
    defaultId: "custom",
    remoteRule: "Hosted Remote Seedbox on https://www.pvtkrrx.cc needs public qBittorrent, Prowlarr, and completed-file URLs that are reachable over trusted HTTPS. HTTP-only or browser-only file access is not enough."
  };
})(typeof window !== "undefined" ? window : globalThis);
