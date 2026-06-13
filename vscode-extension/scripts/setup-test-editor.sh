#!/usr/bin/env bash
# Provision a VS Code-compatible editor (VSCodium) for the Extension Host
# integration tests, so they can run without @vscode/test-electron's on-demand
# VS Code download (useful offline or for a deterministic, self-contained run).
#
# VSCodium publishes full, VS Code-compatible Linux builds as GitHub release
# assets; this fetches one and points the test runner at it.
#
# Output: prints the absolute path to the editor executable on the last line and
# writes it to .vscode-test/editor-path so npm scripts can pick it up.
#
# Env:
#   VSCODIUM_VERSION   Pin a version (default: latest via releases/latest).
#   VSCODIUM_PLATFORM  Asset platform (default: linux-x64).
set -euo pipefail

cd "$(dirname "$0")/.."
CACHE_DIR=".vscode-test/vscodium"
PLATFORM="${VSCODIUM_PLATFORM:-linux-x64}"

mkdir -p "$CACHE_DIR"

version="${VSCODIUM_VERSION:-}"
if [[ -z "$version" ]]; then
  redirect="$(curl -fsS -m 30 -o /dev/null -w '%{redirect_url}' \
    https://github.com/VSCodium/vscodium/releases/latest)"
  version="${redirect##*/tag/}"
fi
if [[ -z "$version" ]]; then
  echo "ERROR: could not resolve VSCodium version" >&2
  exit 1
fi

dest="$CACHE_DIR/$version"
exe="$dest/codium"
if [[ -x "$exe" ]]; then
  echo "VSCodium $version already present" >&2
else
  asset="VSCodium-${PLATFORM}-${version}.tar.gz"
  url="https://github.com/VSCodium/vscodium/releases/download/${version}/${asset}"
  echo "Downloading $url" >&2
  tmp="$(mktemp -d)"
  curl -fSL -m 600 -o "$tmp/$asset" "$url"
  mkdir -p "$dest"
  tar -xzf "$tmp/$asset" -C "$dest"
  rm -rf "$tmp"
fi

if [[ ! -x "$exe" ]]; then
  echo "ERROR: editor executable not found at $exe after extraction" >&2
  ls -la "$dest" >&2 || true
  exit 1
fi

abs="$(cd "$dest" && pwd)/codium"
printf '%s\n' "$abs" > .vscode-test/editor-path
echo "$abs"
