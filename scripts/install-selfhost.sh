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
PVTKRRX_HTTP_PORT="${PVTKRRX_HTTP_PORT:-7000}"
PVTKRRX_HTTPS_PORT="${PVTKRRX_HTTPS_PORT:-7001}"

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
  local awk_key awk_value
  awk_key="$(printf '%s' "$key" | sed 's/\\/\\\\/g')"
  awk_value="$(printf '%s' "$value" | sed 's/\\/\\\\/g')"
  awk -v key="$awk_key" -v value="$awk_value" '
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

normalize_port() {
  local value
  value="$(printf '%s' "${1:-}" | tr -d '[:space:]')"
  case "$value" in
    ''|*[!0-9]*)
      echo ""
      return 0
      ;;
  esac
  if [ "$value" -ge 1 ] && [ "$value" -le 65535 ]; then
    echo "$value"
  else
    echo ""
  fi
}

port_in_use() {
  local port
  port="$(normalize_port "${1:-}")"
  [ -n "$port" ] || return 1
  (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

pick_available_port() {
  local candidate
  for candidate in "$@"; do
    candidate="$(normalize_port "$candidate")"
    [ -n "$candidate" ] || continue
    if ! port_in_use "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
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

normalize_cloudflared_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) echo "Unsupported architecture for cloudflared: $(uname -m)" >&2; exit 1 ;;
  esac
}

normalize_https_mode() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  case "$value" in
    cloudflare|cloudflare-tunnel|tunnel|cf) echo "cloudflare" ;;
    domain|custom-domain|own-domain|custom|https-domain) echo "domain" ;;
    skip|later|manual|none|off) echo "skip" ;;
    *) echo "" ;;
  esac
}

prompt_https_mode() {
  local default_mode
  default_mode="$(normalize_https_mode "${PVTKRRX_SELF_HOST_HTTPS_MODE:-}")"
  if [ -z "$default_mode" ]; then
    if [ -n "${PVTKRRX_PUBLIC_BASE_URL:-}" ]; then
      default_mode="domain"
    else
      default_mode="cloudflare"
    fi
  fi

  if [ ! -t 0 ] || [ ! -t 1 ] || [ ! -r /dev/tty ]; then
    echo "$default_mode"
    return 0
  fi

  local choice=""
  printf '\nHow should Stremio reach this server?\n' > /dev/tty
  printf '  1) Cloudflare Tunnel - free HTTPS URL, no domain needed (recommended)\n' > /dev/tty
  printf '  2) I have my own domain - I will configure HTTPS myself\n' > /dev/tty
  printf '  3) Skip - I will set this up later\n' > /dev/tty
  printf 'Choose [1-3] [%s]: ' "$default_mode" > /dev/tty
  IFS= read -r choice < /dev/tty || choice=""
  choice="$(normalize_https_mode "$choice")"
  if [ -z "$choice" ]; then
    choice="$default_mode"
  fi

  case "$choice" in
    cloudflare|domain|skip) echo "$choice" ;;
    *) echo "$default_mode" ;;
  esac
}

prompt_https_url() {
  local default_value="${1:-}"
  local value=""
  if [ ! -t 0 ] || [ ! -t 1 ] || [ ! -r /dev/tty ]; then
    echo "$default_value"
    return 0
  fi

  while true; do
    printf 'Public HTTPS URL for Stremio install links' > /dev/tty
    if [ -n "$default_value" ]; then
      printf ' [%s]' "$default_value" > /dev/tty
    fi
    printf ': ' > /dev/tty
    IFS= read -r value < /dev/tty || value=""
    value="${value:-$default_value}"
    value="$(printf '%s' "$value" | tr -d '\r' | sed 's:/*$::')"
    case "$value" in
      https://*) echo "$value"; return 0 ;;
      "")
        printf 'Enter a valid https:// URL.\n' > /dev/tty
        ;;
      *)
        printf 'Public HTTPS URL must start with https://.\n' > /dev/tty
        ;;
    esac
  done
}

install_cloudflared() {
  if have_command cloudflared; then
    echo "✓ cloudflared already installed: $(cloudflared --version 2>/dev/null | head -n 1 || echo 'unknown')"
    return 0
  fi

  local arch; arch="$(normalize_cloudflared_arch)"
  local download_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}"
  local target_path="/usr/local/bin/cloudflared"

  echo "Installing cloudflared..."
  run_root mkdir -p /usr/local/bin
  run_root curl -fsSL "$download_url" -o "$target_path"
  run_root chmod 0755 "$target_path"
  echo "✓ cloudflared installed"
}

wait_for_cloudflared_url() {
  local service_name="$1"
  local attempts=0
  local url=""

  echo "Waiting for Cloudflare Tunnel URL..." >&2
  while [ "$attempts" -lt 45 ]; do
    url="$(journalctl -u "${service_name}.service" --no-pager -n 100 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
    if [ -n "$url" ]; then
      echo "$url"
      return 0
    fi
    sleep 1
    attempts=$((attempts + 1))
  done

  echo "Could not find a Cloudflare Tunnel URL in the service logs." >&2
  return 1
}

setup_cloudflared_service() {
  local http_port="$1"
  local service_name="pvtkrrx-tunnel"
  local unit_path="/etc/systemd/system/${service_name}.service"
  local binary_path

  binary_path="$(command -v cloudflared || echo /usr/local/bin/cloudflared)"
  if [ ! -x "$binary_path" ]; then
    echo "cloudflared binary not found at $binary_path" >&2
    exit 1
  fi

  if [ -f "$unit_path" ] && systemctl is-active --quiet "$service_name" 2>/dev/null; then
    echo "✓ Cloudflare Tunnel service already running"
  else
    cat > /tmp/pvtkrrx-tunnel.service << EOF
[Unit]
Description=PVTKRRX Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$binary_path tunnel --url http://localhost:${http_port} --no-autoupdate
Restart=always
RestartSec=10
KillSignal=SIGINT
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF
    run_root install -m 0644 /tmp/pvtkrrx-tunnel.service "$unit_path"
    rm -f /tmp/pvtkrrx-tunnel.service
    run_root systemctl daemon-reload
    run_root systemctl enable "$service_name"
    run_root systemctl restart "$service_name"
  fi

  local public_url
  public_url="$(wait_for_cloudflared_url "$service_name" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
  export PVTKRRX_PUBLIC_BASE_URL="$public_url"
  echo "✓ Tunnel URL: $public_url"
}

ensure_qbittorrent_user() {
  local qbit_home="/var/lib/$QBIT_USER"

  if ! id "$QBIT_USER" >/dev/null 2>&1; then
    # Recreate the service account if a wipe removed it but left the package installed.
    run_root useradd -r -s /usr/sbin/nologin -d "$qbit_home" "$QBIT_USER"
  fi

  run_root mkdir -p "$qbit_home"
  run_root chown -R "$QBIT_USER:$QBIT_USER" "$qbit_home"
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
  ensure_qbittorrent_user

  local requested_port
  requested_port="$(normalize_port "$QBIT_PORT")"
  if [ -z "$requested_port" ]; then
    requested_port=8080
  fi

  local selected_port
  selected_port="$(pick_available_port "$requested_port" 8085 8090 8095 8100 8180)"
  if [ -z "$selected_port" ]; then
    echo "Could not find a free qBittorrent WebUI port near $requested_port" >&2
    exit 1
  fi
  if [ "$selected_port" != "$requested_port" ]; then
    echo "✓ qBittorrent WebUI port moved to $selected_port to avoid a conflict"
  fi
  QBIT_PORT="$selected_port"

  local qbit_conf="$QBIT_DATA_DIR/.config/qBittorrent/qBittorrent.conf"
  if [ -f "$qbit_conf" ]; then
    write_ini_value "$qbit_conf" 'WebUI\Port' "$QBIT_PORT"
  fi

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
      if [ -f "$qbit_conf" ]; then
        write_ini_value "$qbit_conf" 'WebUI\Port' "$QBIT_PORT"
      fi
      echo "✓ qBittorrent configured (bypass_local_auth=true, save_path=$DOWNLOADS_DIR)"
    fi
    rm -f "$cookie_jar"
  fi

  if [ -z "${temp_pass:-}" ] && [ -f "$qbit_conf" ]; then
    write_ini_value "$qbit_conf" 'WebUI\Port' "$QBIT_PORT"
    write_ini_value "$qbit_conf" 'WebUI\LocalHostAuth' 'false'
    write_ini_value "$qbit_conf" 'WebUI\AuthSubnetWhitelistEnabled' 'true'
    write_ini_value "$qbit_conf" 'WebUI\AuthSubnetWhitelist' '127.0.0.1/32,::1/128'
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

  # ── Step 1: Cloudflare Tunnel ──
  echo ""
  echo "── Step 1/6: HTTPS front door ──"
  local https_mode
  https_mode="$(prompt_https_mode)"
  export PVTKRRX_SELF_HOST_HTTPS_MODE="$https_mode"

  local public_base_url="${PVTKRRX_PUBLIC_BASE_URL:-}"
  case "$https_mode" in
    cloudflare)
      if [ -n "$public_base_url" ]; then
        echo "✓ Using existing public HTTPS URL: $public_base_url"
      else
        install_cloudflared
        setup_cloudflared_service "$PVTKRRX_HTTP_PORT"
        public_base_url="${PVTKRRX_PUBLIC_BASE_URL:-}"
      fi
      ;;
    domain)
      public_base_url="$(prompt_https_url "$public_base_url")"
      echo "✓ Using custom domain: $public_base_url"
      ;;
    skip)
      public_base_url=""
      echo "✓ Skipping public HTTPS setup for now"
      ;;
  esac

  export PVTKRRX_PUBLIC_BASE_URL="$public_base_url"

  # ── Step 2: qBittorrent ──
  echo ""
  echo "── Step 2/6: qBittorrent ──"
  install_qbittorrent
  setup_qbittorrent_service

  # ── Step 3: Prowlarr ──
  echo ""
  echo "── Step 3/6: Prowlarr ──"
  install_prowlarr
  setup_prowlarr_service

  # ── Step 4: Node.js ──
  echo ""
  echo "── Step 4/6: Node.js runtime ──"
  local node_bin; node_bin="$(download_node "$arch")"
  echo "✓ Node.js ready at $node_bin"

  # ── Step 5: PVTKRRX source + deps ──
  echo ""
  echo "── Step 5/6: PVTKRRX application ──"
  sync_repo

  local node_dir="$INSTALL_DIR/.node/node-v${NODE_VERSION}-linux-${arch}"
  export PATH="${node_dir}/bin:$PATH"
  export PVTKRRX_NODE_PATH="$node_bin"
  export PVTKRRX_SERVICE_USER="$SERVICE_USER_DEFAULT"
  export PORT="$PVTKRRX_HTTP_PORT"
  export HTTPS_PORT="$PVTKRRX_HTTPS_PORT"
  export PVTKRRX_PUBLIC_BASE_URL="${PVTKRRX_PUBLIC_BASE_URL:-}"

  echo "Installing production dependencies..."
  run_root env "PATH=${node_dir}/bin:$PATH" "${node_dir}/bin/npm" install --omit=dev --prefix "$INSTALL_DIR" 2>&1 | tail -3

  # ── Step 6: Auto-configure PVTKRRX ──
  echo ""
  echo "── Step 6/6: Auto-configuring PVTKRRX ──"

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
