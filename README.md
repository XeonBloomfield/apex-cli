# Apex CLI

Configures the AI coding assistants installed on your machine to use
[Callstack Apex](https://apex.callstack.com/).

## Install

```sh
npx @callstack/apex init
```

## What `init` does

It detects which of these are installed and writes (or updates) their config
to point at Apex, backing up any existing file first (`<file>.bak-<timestamp>`):

| Assistant | Config written |
| --- | --- |
| Claude Code | `~/.claude/settings.json` |
| Codex | `~/.codex/config.toml`, `~/.codex/callstack_ai.config.toml` |
| OpenCode | `~/.config/opencode/opencode.json` (v1 or v2 format, auto-detected), `~/.local/share/opencode/auth.json` (if absent, v1 only) |
| pi | `~/.pi/agent/models.json` |
| Cursor | manual steps (GUI-only, printed to the terminal) |
| VS Code + GitHub Copilot | manual steps (GUI-only, printed to the terminal) |
| Vercel AI SDK / Eve | `.env` in the current project, if it depends on `ai`/`eve` |

You'll be prompted for your Apex API key (input hidden), or pass it directly:

```sh
npx @callstack/apex init --api-key sk-XXX
# or
APEX_API_KEY=sk-XXX npx @callstack/apex init --yes
```

Other flags: `--dry-run` (show changes without writing), `--only <ids>` /
`--skip <ids>` (comma-separated, see `apex list` for ids).

## Commands

```sh
apex init      # detect + configure
apex list      # show which assistants are detected, without changing anything
```

## Security

Your Apex API key is written locally to config files under your home
directory (and, for JS projects, to a local `.env`). Never commit these
files or share the key. Rotate it if you suspect it leaked.
