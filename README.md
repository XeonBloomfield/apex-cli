# Apex CLI

A CLI for configuring coding assistants to use `callstack/Apex`.

The package has not been published to npm yet. Use the local commands below
until the first release. `init` configures existing tools; it does not install
assistants or models.

## Try locally

Requires Node.js 22+ and npm.

```sh
npm ci
node bin/apex.js detect
node bin/apex.js init --dry-run
node bin/apex.js init
```

`init` lists detected assistants and planned file changes, then asks for confirmation.
Use `--assistants codex,claude,opencode,pi` to select tools explicitly (including
tools not yet detected). Use `--yes` for noninteractive setup. Detection checks
PATH, configuration directories, and common macOS editor application locations;
it does not run discovered executables or recursively scan your machine. A
configuration directory may remain after a tool has been uninstalled.

## npm usage (after publication)

```sh
npx @callstack/apex init
npx @callstack/apex init --assistants codex,pi --dry-run
npx @callstack/apex init --assistants codex,pi --yes
```

Provide `CALLSTACK_AUTH_TOKEN` through your shell or secret manager. The installer
does not prompt for, log, store, or validate API keys. For example, a hidden prompt
in Bash avoids placing the value directly in shell history:

```bash
read -r -s -p 'Callstack API key: ' CALLSTACK_AUTH_TOKEN; echo
export CALLSTACK_AUTH_TOKEN
npx @callstack/apex run codex
```

For local development, substitute `node bin/apex.js run codex`. Other launchers:

```sh
apex run opencode
apex run claude
apex run pi
apex run codex -- --help
```

Launchers pass additional arguments unchanged (without a shell). Explicit user
arguments can override the selected model. They do not run `init` automatically.
`apex run claude` sets the gateway URL, token, attribution flag and model aliases
only in the child process, without changing your default Claude provider. Other
launchers select the registered model/profile. Keep the environment variable set
when launching these assistants directly too.

## Integrations

| Assistant | Configuration | Behavior |
| --- | --- | --- |
| OpenCode v1 | `~/.config/opencode/opencode.json` or `.jsonc` | Adds `provider.callstack.ai`, OpenAI-compatible transport, model and environment-key reference; preserves the default model. |
| Codex 0.134.0+ | `~/.codex/callstack_ai.config.toml` | Adds a self-contained Responses API provider/profile; leaves base config and default model untouched. |
| Claude Code | `~/.claude/settings.json` | Merges attribution flag only; use `apex run claude` for gateway credentials and model selection. |
| Pi | `~/.pi/agent/models.json` | Adds `providers.callstack` with Chat Completions, Apex and `$CALLSTACK_AUTH_TOKEN`; preserves other models. Requires a Pi version supporting `$VAR` key interpolation. |
| Cursor | Guided setup | Prints endpoint, API-key and custom-model steps; does not modify private editor storage. |
| VS Code / Copilot | Guided setup | Detects VS Code, not whether Copilot is installed; prints custom-endpoint steps and model JSON, retaining the editor-generated secret reference. |

Respects `XDG_CONFIG_HOME`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR`,
`PI_CODING_AGENT_DIR`, and Windows `APPDATA`. Project-specific settings and custom
`OPENCODE_CONFIG` files are not modified and may override global configuration.
OpenCode's v2 `providers` format is not supported; this adapter uses the v1
`provider` format. Older Codex releases using inline
`[profiles]` need a manual migration or a newer Codex release.

Windows: use npm/npx for setup. File configuration supports Windows paths, but
`apex run` refuses `.cmd`/`.bat` shims to avoid shell interpolation;
launch the configured assistant directly or use WSL. The shell installer targets
macOS, Linux and WSL. Native Windows installer and standalone Node-free binaries
are not included.

## Safety and recovery

- Dry runs print paths, never configuration contents or credentials, and do not write.
- All selected configurations are parsed before any write. Malformed files,
  conflicting Codex profile keys and symlinked files/directories are refused.
- JSON/JSONC edits preserve comments and unrelated keys. Existing Callstack
  endpoint/auth fields are replaced with the documented endpoint and environment
  references. Existing auth files are left untouched; a stored credential may
  need removal through the assistant's own auth UI if it takes precedence.
- Existing files get unique sibling `.apex-backup-<uuid>` backups. Backups and
  new/replaced files use mode `0600`, and newly created directories use `0700`
  (POSIX; Windows ACLs remain OS-managed). Backups may contain previous secrets.
- Writes use same-directory temporary files plus rename; concurrent modifications
  detected between planning and saving abort the operation. This is not a lock or
  a multi-file transaction: a later I/O failure can leave earlier writes applied.
  The CLI prints each successful save and backup. No shell startup file is edited.
- To undo, close the assistant and restore the printed backup path over its
  corresponding config after reviewing intervening changes. For newly created
  files, remove only those files after checking they contain no later additions.
- The CLI makes no API requests and does not verify credentials or gateway access.
  Test your connection by launching a configured assistant.

## Shell installation

The bootstrapper installs the npm package to `~/.local` without sudo. It does not
download Node.js or alter shell profiles. Set `APEX_INSTALL_PREFIX` to an absolute
path and/or `APEX_VERSION` to a published version to override the defaults.

```sh
sh scripts/install.sh
sh scripts/install.sh --assistants codex,pi
```

The first command only installs and prints the next command. Passing init options
also runs setup; when piped, it reconnects prompts to `/dev/tty` if available.
For automation pass `--yes`.

Upgrade by rerunning the installer
with a newer `APEX_VERSION`; uninstall the npm CLI with
`npm uninstall --global --prefix "$HOME/.local" @callstack/apex` (or your chosen
prefix). Uninstalling does not undo assistant configuration.

## Development and release

```sh
npm test
npm run check
npm pack --dry-run
```

Tests use temporary home directories and fake credentials without changing your
assistant settings. Before releasing, test each supported tool against a real
account and verify version compatibility.

Maintainers with publish access to `@callstack` can release a new version with:

```sh
npm publish --access public
```

## Configuration references

- Official Codex advanced configuration: `https://developers.openai.com/codex/config-advanced/`
  (separate profile files for 0.134.0+; provider is placed in that profile).
- OpenCode v1 configuration: `https://dev.opencode.ai/docs/config/`
  (JSONC and `{env:VARIABLE}` support).
- Pi custom models: `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/models.md`
  (`$VARIABLE` key interpolation; bare uppercase names are literals in current docs).
