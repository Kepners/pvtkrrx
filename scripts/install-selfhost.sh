#!/usr/bin/env bash
set -euo pipefail

# ─── configuration ──────────────────────────────────────────────────
INSTALL_DIR="${PVTKRRX_INSTALL_DIR:-/opt/pvtkrrx}"
GITHUB_OWNER="${PVTKRRX_GITHUB_OWNER:-Kepners}"
GITHUB_REPO="${PVTKRRX_GITHUB_REPO:-pvtkrrx}"
REPO_BRANCH="${PVTKRRX_REPO_BRANCH:-main}"
RELEASE_MANIFEST_URL="${PVTKRRX_RELEASE_MANIFEST_URL:-https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest}"
RELEASE_TAG="${PVTKRRX_RELEASE_TAG:-}"
REPO_TARBALL_URL="${PVTKRRX_REPO_TARBALL_URL:-}"
NODE_VERSION="${PVTKRRX_NODE_VERSION:-22.14.0}"
SERVICE_USER_DEFAULT="${PVTKRRX_SERVICE_USER:-${SUDO_USER:-${USER:-root}}}"
PROWLARR_DATA="${PVTKRRX_PROWLARR_DATA:-/var/lib/prowlarr}"
QBIT_USER="${PVTKRRX_QBIT_USER:-qbittorrent}"
QBIT_DATA_DIR="${PVTKRRX_QBIT_DATA:-/var/lib/$QBIT_USER}"
QBIT_PORT="${PVTKRRX_QBIT_WEBUI_PORT:-8080}"
DOWNLOADS_DIR="${PVTKRRX_DOWNLOADS_DIR:-$INSTALL_DIR/downloads}"

# ─── helpers ────────────────────────────────────────────────────────
have_command() { command -v "$1" >/dev/null 2>&1; }

resolve_repo_tarball_url() {
  if [ -n "$REPO_TARBALL_URL" ]; then
    echo "$REPO_TARBALL_URL"
    return 0
  fi

  if [ -n "$RELEASE_TAG" ]; then
    echo "https://codeload.github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tar.gz/refs/tags/${RELEASE_TAG}"
    return 0
  fi

  # Default: always pull from the configured branch (main).
  # Set PVTKRRX_RELEASE_TAG to pin to a specific tagged release instead.
  echo "https://codeload.github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tar.gz/refs/heads/${REPO_BRANCH}"
}

branch_tarball_url() {
  echo "https://codeload.github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tar.gz/refs/heads/${REPO_BRANCH}"
}

sync_repo_from_url() {
  local source_url="$1"
  local tmp; tmp="$(mktemp -d)"
  trap "rm -rf '$tmp'" RETURN

  echo "Downloading PVTKRRX source from ${source_url}"
  curl -fsSL "$source_url" -o "$tmp/pvtkrrx.tar.gz"
  tar -xzf "$tmp/pvtkrrx.tar.gz" -C "$tmp"

  local src_dir
  src_dir="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [ -z "$src_dir" ] || [ ! -d "$src_dir" ]; then
    echo "Could not unpack the PVTKRRX source archive." >&2
    exit 1
  fi

  run_root mkdir -p "$INSTALL_DIR"
  run_root rm -rf "$INSTALL_DIR/node_modules"
  run_root cp -a "$src_dir"/. "$INSTALL_DIR"/
}

write_ini_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp; tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0; inserted = 0 }
    {
      if (substr($0, 1, length(key) + 1) == key "=") {
        print key "=" value
        found = 1
        next
      }
      if (!inserted && $0 ~ /^\[Preferences\]/) {
        print $0
        print key "=" value
        inserted = 1
        next
      }
      print $0
    }
    END {
      if (!found && !inserted) {
        print "[Preferences]"
        print key "=" value
      }
    }
  ' "$file" > "$tmp" && mv "$tmp" "$file"
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; return; fi
  if ! have_command sudo; then
    echo "Root access is required to run: $*" >&2
    exit 1
  fi
  sudo "$@"
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
}

detect_pkg_manager() {
  for pm in apt-get dnf yum zypper pacman apk; do
    if have_command "$pm"; then echo "$pm"; return; fi
  done
  echo ""
}

install_system_packages() {
  local pm="$1"
  shift
  case "$pm" in
    apt-get)  run_root apt-get update -qq && run_root apt-get install -y -qq "$@" ;;
    dnf)      run_root dnf install -y -q "$@" ;;
    yum)      run_root yum install -y -q "$@" ;;
    zypper)   run_root zypper install -y "$@" ;;
    pacman)   run_root pacman -Sy --noconfirm "$@" ;;
    apk)      run_root apk add --no-cache "$@" ;;
    *) echo "No supported package manager found." >&2; exit 1 ;;
  esac
}

ensure_base_tools() {
  local missing=0
  have_command tar  || missing=1
  have_command xz   || missing=1
  have_command curl || missing=1
  if [ "$missing" -eq 1 ]; then
    local pm; pm="$(detect_pkg_manager)"
    install_system_packages "$pm" ca-certificates tar xz-utils curl
  fi
}

# ─── qBittorrent ────────────────────────────────────────────────────
install_qbittorrent() {
  if have_command qbittorrent-nox; then
    echo "✓ qBittorrent-nox already installed: $(qbittorrent-nox --version 2>/dev/null || echo 'unknown')"
    return 0
  fi

  echo "Installing qBittorrent-nox..."
  local pm; pm="$(detect_pkg_manager)"
  install_system_packages "$pm" qbittorrent-nox

  # Create service user if needed
  if ! id "$QBIT_USER" >/dev/null 2>&1; then
    run_root useradd -r -s /usr/sbin/nologin -m -d "/var/lib/$QBIT_USER" "$QBIT_USER"
  fi

  echo "✓ qBittorrent-nox installed"
}

setup_qbittorrent_service() {
  local unit_path="/etc/systemd/system/qbittorrent-nox.service"
  local service_was_active=0
  if [ -f "$unit_path" ] && systemctl is-active --quiet qbittorrent-nox 2>/dev/null; then
    service_was_active=1
    echo "✓ qBittorrent service already running"
  else
    # Create downloads dir
    run_root mkdir -p "$DOWNLOADS_DIR"
    run_root chown "$QBIT_USER:$QBIT_USER" "$DOWNLOADS_DIR"

    cat > /tmp/qbittorrent-nox.service << EOF
[Unit]
Description=qBittorrent-nox Daemon
After=network.target

[Service]
User=$QBIT_USER
Group=$QBIT_USER
Type=simple
ExecStart=/usr/bin/qbittorrent-nox --webui-port=$QBIT_PORT
Restart=on-failure
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF
    run_root install -m 0644 /tmp/qbittorrent-nox.service "$unit_path"
    rm -f /tmp/qbittorrent-nox.service
    run_root systemctl daemon-reload
    run_root systemctl enable qbittorrent-nox
    run_root systemctl start qbittorrent-nox
  fi

  # Wait for WebUI to come up
  echo "Waiting for qBittorrent WebUI..."
  local attempts=0
  while [ "$attempts" -lt 15 ]; do
    if curl -s -o /dev/null "http://127.0.0.1:$QBIT_PORT/" 2>/dev/null; then
      break
    fi
    sleep 1
    attempts=$((attempts + 1))
  done

  # Read the temp password from journal and configure
  local temp_pass
  temp_pass="$(journalctl -u qbittorrent-nox --no-pager -n 20 2>/dev/null | grep -oP 'temporary password.*: \K\S+' | tail -1 || true)"
  if [ -n "$temp_pass" ]; then
    # Login and set download path + disable CSRF for local access
    local cookie_jar; cookie_jar="$(mktemp)"
    if curl -s "http://127.0.0.1:$QBIT_PORT/api/v2/auth/login" \
         -d "username=admin&password=$temp_pass" \
         -c "$cookie_jar" 2>/dev/null | grep -q "Ok"; then
      curl -s -b "$cookie_jar" "http://127.0.0.1:$QBIT_PORT/api/v2/app/setPreferences" \
        -d "json={\"bypass_local_auth\":true,\"web_ui_csrf_protection_enabled\":false,\"web_ui_host_header_validation_enabled\":false,\"save_path\":\"$DOWNLOADS_DIR\",\"queueing_enabled\":false}" \
        >/dev/null 2>&1
      echo "✓ qBittorrent configured (bypass_local_auth=true, save_path=$DOWNLOADS_DIR)"
    fi
    rm -f "$cookie_jar"
  fi

  if [ -z "${temp_pass:-}" ] && [ -f "$QBIT_DATA_DIR/.config/qBittorrent/qBittorrent.conf" ]; then
    write_ini_value "$QBIT_DATA_DIR/.config/qBittorrent/qBittorrent.conf" 'WebUI\LocalHostAuth' 'false'
    write_ini_value "$QBIT_DATA_DIR/.config/qBittorrent/qBittorrent.conf" 'WebUI\AuthSubnetWhitelistEnabled' 'true'
    write_ini_value "$QBIT_DATA_DIR/.config/qBittorrent/qBittorrent.conf" 'WebUI\AuthSubnetWhitelist' '127.0.0.1/32,::1/128'
    echo "✓ qBittorrent existing config patched for localhost API access"
    if [ "$service_was_active" -eq 1 ] || systemctl is-active --quiet qbittorrent-nox 2>/dev/null; then
      run_root systemctl restart qbittorrent-nox
      sleep 2
    fi
  fi

  echo "✓ qBittorrent service started on port $QBIT_PORT"
}

# ─── Prowlarr ───────────────────────────────────────────────────────
install_prowlarr() {
  if [ -x /opt/Prowlarr/Prowlarr ]; then
    echo "✓ Prowlarr already installed"
    return 0
  fi

  local arch; arch="$(detect_arch)"
  local prowlarr_arch
  case "$arch" in
    x64) prowlarr_arch="x64" ;;
    arm64) prowlarr_arch="arm64" ;;
  esac

  echo "Installing Prowlarr..."
  local tmp; tmp="$(mktemp -d)"
  curl -fsSL "https://prowlarr.servarr.com/v1/update/master/updatefile?os=linux&runtime=netcore&arch=$prowlarr_arch" \
    -o "$tmp/prowlarr.tar.gz"
  run_root mkdir -p /opt/Prowlarr
  run_root tar -xzf "$tmp/prowlarr.tar.gz" -C /opt/Prowlarr --strip-components=1
  rm -rf "$tmp"

  # Create prowlarr user if needed
  if ! id prowlarr >/dev/null 2>&1; then
    run_root useradd -r -s /usr/sbin/nologin -d "$PROWLARR_DATA" prowlarr
  fi
  run_root mkdir -p "$PROWLARR_DATA"
  run_root chown -R prowlarr:prowlarr "$PROWLARR_DATA" /opt/Prowlarr

  echo "✓ Prowlarr installed"
}

setup_prowlarr_service() {
  local unit_path="/etc/systemd/system/prowlarr.service"
  if [ -f "$unit_path" ] && systemctl is-active --quiet prowlarr 2>/dev/null; then
    echo "✓ Prowlarr service already running"
    return 0
  fi

  cat > /tmp/prowlarr.service << EOF
[Unit]
Description=Prowlarr Daemon
After=network.target

[Service]
User=prowlarr
Group=prowlarr
Type=simple
ExecStart=/opt/Prowlarr/Prowlarr -nobrowser -data=$PROWLARR_DATA
Restart=on-failure
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF
  run_root install -m 0644 /tmp/prowlarr.service "$unit_path"
  rm -f /tmp/prowlarr.service
  run_root systemctl daemon-reload
  run_root systemctl enable prowlarr
  run_root systemctl start prowlarr

  # Wait for Prowlarr to write its config.xml (contains the API key)
  echo "Waiting for Prowlarr to start..."
  local attempts=0
  while [ "$attempts" -lt 20 ]; do
    if [ -f "$PROWLARR_DATA/config.xml" ]; then
      # Check API is responding
      local api_key
      api_key="$(grep -oP '<ApiKey>\K[^<]+' "$PROWLARR_DATA/config.xml" 2>/dev/null || true)"
      if [ -n "$api_key" ] && curl -s -o /dev/null "http://localhost:9696/api/v1/health" -H "X-Api-Key: $api_key" 2>/dev/null; then
        break
      fi
    fi
    sleep 1
    attempts=$((attempts + 1))
  done

  echo "✓ Prowlarr service started on port 9696"
}

# ─── Node.js ────────────────────────────────────────────────────────
download_node() {
  local arch="$1"
  local node_root="$INSTALL_DIR/.node"
  local node_dir="$node_root/node-v${NODE_VERSION}-linux-${arch}"
  local node_bin="$node_dir/bin/node"

  if [ -x "$node_bin" ]; then
    echo "$node_bin"
    return
  fi

  local tmp; tmp="$(mktemp -d)"
  trap "rm -rf '$tmp'" RETURN

  local archive="node-v${NODE_VERSION}-linux-${arch}.tar.xz"
  echo "Downloading Node.js ${NODE_VERSION} (${arch})..." >&2
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${archive}" -o "$tmp/$archive"
  run_root mkdir -p "$node_root"
  run_root tar -xJf "$tmp/$archive" -C "$node_root"
  echo "$node_bin"
}

# ─── PVTKRRX source ────────────────────────────────────────────────
sync_repo() {
  local source_url; source_url="$(resolve_repo_tarball_url)"
  local branch_url; branch_url="$(branch_tarball_url)"

  sync_repo_from_url "$source_url"
  if [ ! -f "$INSTALL_DIR/scripts/server-installer.js" ] && [ "$source_url" != "$branch_url" ]; then
    echo "Release payload is missing scripts/server-installer.js; retrying with branch ${REPO_BRANCH}." >&2
    sync_repo_from_url "$branch_url"
  fi

  if [ ! -f "$INSTALL_DIR/scripts/server-installer.js" ]; then
    echo "The self-host source bundle is incomplete: scripts/server-installer.js is still missing after sync." >&2
    exit 1
  fi
}

# ─── main ───────────────────────────────────────────────────────────
main() {
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║       PVTKRRX Self-Host Installer        ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""

  if [ "$(uname -s)" != "Linux" ]; then
    echo "This installer only runs on Linux." >&2
    exit 1
  fi

  ensure_base_tools
  local arch; arch="$(detect_arch)"

  # ── Step 1: qBittorrent ──
  echo ""
  echo "── Step 1/5: qBittorrent ──"
  install_qbittorrent
  setup_qbittorrent_service

  # ── Step 2: Prowlarr ──
  echo ""
  echo "── Step 2/5: Prowlarr ──"
  install_prowlarr
  setup_prowlarr_service

  # ── Step 3: Node.js ──
  echo ""
  echo "── Step 3/5: Node.js runtime ──"
  local node_bin; node_bin="$(download_node "$arch")"
  echo "✓ Node.js ready at $node_bin"

  # ── Step 4: PVTKRRX source + deps ──
  echo ""
  echo "── Step 4/5: PVTKRRX application ──"
  sync_repo

  local node_dir="$INSTALL_DIR/.node/node-v${NODE_VERSION}-linux-${arch}"
  export PATH="${node_dir}/bin:$PATH"
  export PVTKRRX_NODE_PATH="$node_bin"
  export PVTKRRX_SERVICE_USER="$SERVICE_USER_DEFAULT"

  echo "Installing production dependencies..."
  run_root env "PATH=${node_dir}/bin:$PATH" "${node_dir}/bin/npm" install --omit=dev --prefix "$INSTALL_DIR" 2>&1 | tail -3

  # ── Step 5: Auto-configure PVTKRRX ──
  echo ""
  echo "── Step 5/5: Auto-configuring PVTKRRX ──"

  # Export detection hints for the Node installer
  export PVTKRRX_PROWLARR_DATA="$PROWLARR_DATA"
  export PVTKRRX_QBIT_USER="$QBIT_USER"
  export PVTKRRX_QBIT_DATA="$QBIT_DATA_DIR"
  export PVTKRRX_QBIT_WEBUI_PORT="$QBIT_PORT"
  export PVTKRRX_DOWNLOADS_DIR="$DOWNLOADS_DIR"

  cd "$INSTALL_DIR"
  "$node_bin" scripts/server-installer.js --auto

  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║       PVTKRRX install complete!          ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
}

main "$@"
