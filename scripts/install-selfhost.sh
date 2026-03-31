#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${PVTKRRX_INSTALL_DIR:-/opt/pvtkrrx}"
REPO_TARBALL_URL="${PVTKRRX_REPO_TARBALL_URL:-https://codeload.github.com/Kepners/pvtkrrx/tar.gz/refs/heads/main}"
NODE_VERSION="${PVTKRRX_NODE_VERSION:-22.14.0}"
SERVICE_USER_DEFAULT="${PVTKRRX_SERVICE_USER:-${SUDO_USER:-${USER:-root}}}"

have_command() {
  command -v "$1" >/dev/null 2>&1
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi
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
    *)
      echo "Unsupported architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

install_packages() {
  if have_command apt-get; then
    run_root apt-get update
    run_root apt-get install -y ca-certificates tar xz-utils
    return
  fi
  if have_command dnf; then
    run_root dnf install -y ca-certificates tar xz
    return
  fi
  if have_command yum; then
    run_root yum install -y ca-certificates tar xz
    return
  fi
  if have_command zypper; then
    run_root zypper install -y ca-certificates tar xz
    return
  fi
  if have_command pacman; then
    run_root pacman -Sy --noconfirm ca-certificates tar xz
    return
  fi
  if have_command apk; then
    run_root apk add --no-cache ca-certificates tar xz
    return
  fi
  echo "Missing required packages and no supported package manager was found." >&2
  exit 1
}

ensure_base_tools() {
  local missing=0
  have_command tar || missing=1
  have_command xz || missing=1
  if [ "$missing" -eq 1 ]; then
    install_packages
  fi
}

download_node() {
  local arch="$1"
  local node_root="$INSTALL_DIR/.node"
  local node_dir="$node_root/node-v${NODE_VERSION}-linux-${arch}"
  local node_bin="$node_dir/bin/node"

  if [ -x "$node_bin" ]; then
    echo "$node_bin"
    return
  fi

  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  local archive="node-v${NODE_VERSION}-linux-${arch}.tar.xz"
  local url="https://nodejs.org/dist/v${NODE_VERSION}/${archive}"
  echo "Downloading Node.js ${NODE_VERSION} (${arch})..."
  curl -fsSL "$url" -o "$tmp/$archive"
  run_root mkdir -p "$node_root"
  run_root tar -xJf "$tmp/$archive" -C "$node_root"
  echo "$node_bin"
}

sync_repo() {
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  echo "Downloading PVTKRRX source..."
  curl -fsSL "$REPO_TARBALL_URL" -o "$tmp/pvtkrrx.tar.gz"
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

main() {
  if ! have_command curl; then
    echo "curl is required to run this installer." >&2
    exit 1
  fi

  ensure_base_tools
  local arch
  arch="$(detect_arch)"

  local node_bin
  node_bin="$(download_node "$arch")"

  sync_repo

  export PATH="$(dirname "$node_bin"):$PATH"
  export PVTKRRX_NODE_PATH="$node_bin"
  export PVTKRRX_SERVICE_USER="$SERVICE_USER_DEFAULT"

  local node_dir="$INSTALL_DIR/.node/node-v${NODE_VERSION}-linux-${arch}"
  echo "Installing production dependencies..."
  run_root env "PATH=${node_dir}/bin:$PATH" "${node_dir}/bin/npm" install --omit=dev --prefix "$INSTALL_DIR"

  echo ""
  echo "Launching the PVTKRRX server installer..."
  cd "$INSTALL_DIR"
  "$node_bin" scripts/server-installer.js
}

main "$@"
