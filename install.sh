#!/usr/bin/env bash
# Installs H0x Video Studio on macOS or Linux and connects Claude Code.
#   curl -fsSL https://raw.githubusercontent.com/buckleson/h0x-video-studio/main/install.sh | bash
#   ... | bash -s -- --deb   (Linux: install the .deb with apt instead of the AppImage)
# This script never asks for, reads or stores API keys.
set -euo pipefail

REPO="buckleson/h0x-video-studio"
APP_NAME="H0x Video Studio"
USE_DEB=0
for arg in "$@"; do
  case "$arg" in
    --deb) USE_DEB=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null || die "curl is required."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "Finding the latest release"
RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")" \
  || die "Could not read the latest release from GitHub."

# Prints the download URL of the release asset whose name ends with $1.
asset_url() {
  printf '%s\n' "$RELEASE_JSON" | grep -o '"browser_download_url": *"[^"]*"' \
    | sed 's/.*"\(https[^"]*\)"$/\1/' | grep -E -- "$1\$" | head -n 1 || true
}

download() {
  local url
  url="$(asset_url "$1")"
  [ -n "$url" ] || die "No $1 file in the latest release."
  echo "Downloading ${url##*/}" >&2
  curl -fL --progress-bar -o "$TMP/$2" "$url"
  echo "$TMP/$2"
}

install_macos() {
  local dmg mnt app dest
  dmg="$(download "_universal.dmg" app.dmg)"
  mnt="$TMP/mnt"
  mkdir -p "$mnt"
  hdiutil attach -nobrowse -quiet -mountpoint "$mnt" "$dmg"
  app="$(find "$mnt" -maxdepth 1 -name '*.app' | head -n 1)"
  [ -n "$app" ] || { hdiutil detach -quiet "$mnt"; die "No app found in the disk image."; }
  dest="/Applications"
  [ -w "$dest" ] || { dest="$HOME/Applications"; mkdir -p "$dest"; }
  rm -rf "$dest/$APP_NAME.app"
  cp -R "$app" "$dest/$APP_NAME.app"
  hdiutil detach -quiet "$mnt"
  INSTALLED="$dest/$APP_NAME.app"

  say "About the unsigned app"
  echo "This build is not signed by Apple yet, so macOS would block it on first launch."
  echo "Next step: remove the download quarantine flag from the installed app only:"
  echo "  xattr -dr com.apple.quarantine \"$INSTALLED\""
  xattr -dr com.apple.quarantine "$INSTALLED" || echo "Could not clear it. Right-click the app and choose Open the first time."
  echo "Installed to $INSTALLED"
}

install_linux() {
  case "$(uname -m)" in
    x86_64|amd64) ;;
    *) die "Only x86_64 Linux builds are published. Build from source for $(uname -m)." ;;
  esac
  if [ "$USE_DEB" = 1 ]; then
    local deb
    deb="$(download "_amd64.deb" h0x-video-studio.deb)"
    sudo apt install -y "$deb"
    echo "Installed with apt."
    return
  fi
  local img bin="$HOME/.local/bin" apps="$HOME/.local/share/applications"
  img="$(download "_amd64.AppImage" h0x-video-studio.AppImage)"
  mkdir -p "$bin" "$apps"
  install -m 755 "$img" "$bin/h0x-video-studio"
  cat > "$apps/h0x-video-studio.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Exec=$bin/h0x-video-studio
Terminal=false
Categories=AudioVideo;Graphics;
EOF
  echo "Installed to $bin/h0x-video-studio"
  case ":$PATH:" in *":$bin:"*) ;; *) echo "Add $bin to your PATH to start it from a terminal." ;; esac
}

case "$(uname -s)" in
  Darwin) say "Installing $APP_NAME for macOS"; install_macos ;;
  Linux) say "Installing $APP_NAME for Linux"; install_linux ;;
  *) die "Unsupported system $(uname -s). On Windows use install.ps1." ;;
esac

say "Checking Node.js (the plugin's local server needs Node 18 or newer)"
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; then
  echo "Found Node $(node -v)."
else
  echo "Node 18+ not found. Install it from https://nodejs.org (or: brew install node / your package manager)."
fi

say "Connecting Claude Code"
if command -v claude >/dev/null; then
  claude plugin marketplace add "$REPO" || claude plugin marketplace update h0x-video-studio
  claude plugin install h0x@h0x-video-studio
  echo "The h0x plugin is installed."
else
  echo "Claude Code is not installed. Install it from https://claude.com/claude-code, then run:"
  echo "  claude plugin marketplace add $REPO"
  echo "  claude plugin install h0x@h0x-video-studio"
fi

say "Done"
echo "Open $APP_NAME, then run 'claude' and type /h0x:start"
