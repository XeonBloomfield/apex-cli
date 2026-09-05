#!/usr/bin/env bash
# Callstack Apex installer.
#
#   curl -fsSL https://apex.callstack.ai/install.sh | sh
#
# This mirrors rustup's install.sh in spirit: keep this script tiny, and
# delegate all real logic to the actual tool (here, the @callstack/apex
# npm package run through npx) so there is only one place to fix bugs.
set -euo pipefail

APEX_PKG="${APEX_PKG:-@callstack/apex@latest}"

err() {
  echo "error: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

main() {
  if ! need_cmd node; then
    err "Node.js is required. Install it from https://nodejs.org (or via nvm/brew) and re-run this script."
  fi

  if ! need_cmd npx; then
    err "npx was not found (it ships with npm). Install/upgrade Node.js and re-run this script."
  fi

  node_major="$(node -e 'console.log(process.versions.node.split(".")[0])')"
  if [ "${node_major}" -lt 18 ]; then
    err "Node.js 18 or newer is required (found $(node --version))."
  fi

  echo "Setting up Callstack Apex..."
  npx --yes "${APEX_PKG}" init "$@"
}

main "$@"
