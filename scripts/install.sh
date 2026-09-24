#!/bin/sh
set -eu

main() {
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    printf '%s\n' 'Apex CLI requires Node.js 22+ and npm. Install Node.js, then rerun this installer.' >&2
    exit 1
  fi
  if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
    printf '%s\n' 'Apex CLI requires Node.js 22 or newer.' >&2
    exit 1
  fi
  version=${APEX_VERSION:-latest}
  case "$version" in
    ''|*[!a-zA-Z0-9.+-]*) printf '%s\n' 'Invalid APEX_VERSION.' >&2; exit 1 ;;
  esac
  prefix=${APEX_INSTALL_PREFIX:-"$HOME/.local"}
  case "$prefix" in
    /*) ;;
    *) printf '%s\n' 'APEX_INSTALL_PREFIX must be an absolute path.' >&2; exit 1 ;;
  esac
  printf 'Installing @callstack/apex@%s into %s (no sudo).\n' "$version" "$prefix"
  npm install --global --prefix "$prefix" --registry=https://registry.npmjs.org --ignore-scripts --no-audit --no-fund "@callstack/apex@$version"
  case ":$PATH:" in
    *":$prefix/bin:"*) ;;
    *) printf '\nAdd %s/bin to your PATH to use the apex command. Shell profiles were not modified.\n' "$prefix" ;;
  esac
  if [ "$#" -eq 0 ]; then
    printf '\nInstalled. Next: "%s/bin/apex" init\n' "$prefix"
  elif [ -t 0 ]; then
    "$prefix/bin/apex" init "$@"
  elif [ -r /dev/tty ] && ( : </dev/tty ) 2>/dev/null; then
    "$prefix/bin/apex" init "$@" </dev/tty
  else
    "$prefix/bin/apex" init "$@"
  fi
}

main "$@"
