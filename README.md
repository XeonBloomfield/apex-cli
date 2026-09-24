# Apex CLI

A CLI for configuring coding assistants to use `callstack/Apex`.

`apex init` detects the assistants on your machine, lets you pick which ones to configure,
shows every change it wants to make, and only then writes. Nothing changes until you say so.

## Try it locally

Requires Node.js 22+ and npm.

```sh
npm ci
npm link        # puts `apex` on your PATH, pointing at this checkout
apex --help
apex detect
apex init --no-interactive   # preview only: prints the plan, writes nothing
apex init       # interactive: pick assistants, review, confirm
apex undo --no-interactive   # preview the reversal
```

`npm link` is the standard npm mechanism: `package.json` declares
`"bin": { "apex": "bin/apex.js" }`, so npm symlinks the command into your Node `bin`
directory (no sudo with nvm, no shell aliases, no `PATH` edits). Remove it with
`npm rm -g @callstack/apex`. Until the package is published, `npm link` is how you get the
bare `apex` command; from a checkout you can also always run `node bin/apex.js …`, and once
published a plain `npm install -g @callstack/apex` (or `scripts/install.sh`) does the same
thing from the registry: the published tarball already contains `dist/cli.js`, so no build
step or install scripts are needed on your machine.

## Commands

| Command | What it does | Writes by default? |
| --- | --- | --- |
| `apex detect [--json]` | Finds assistants on `PATH`, in config directories and in macOS `/Applications`; shows what would change | No, never |
| `apex init` | Interactive setup: multiselect of detected assistants, colourised change preview, confirmation | Only after you confirm |
| `apex init --no-interactive` | Prints the plan without asking questions | No |
| `apex init --apply` | Writes the planned changes without asking | Yes |
| `apex undo` | Reverts the most recent Apex CLI setup, with the same preview and confirmation | Only after you confirm |
| `apex undo --list` | Shows recorded setups and which are already undone | No |
| `apex run <assistant> [-- <args>]` | Launches the assistant with the gateway, model and credentials in the child environment | No |
| `apex completion <zsh\|bash\|fish>` | Prints a shell completion script generated from the live command and flag tables | No |

One table in `src/cli.js` defines every command and the flags it accepts, and `--help`, flag
parsing and the completion scripts are all generated from it, so none of the three can promise a
flag the others reject:

| Command | Flags |
| --- | --- |
| `init` | `--assistants <ids>`, `--no-interactive`, `--apply`, `--no-diff`, `--json`, `--help` |
| `detect` | `--json`, `--help` |
| `undo` | `--no-interactive`, `--apply`, `--no-diff`, `--json`, `--list`, `--help` |

`apex init --wat` fails fast, and so does a flag in the wrong command
(`apex detect --no-diff`). Only `--apply` writes, so there is no "preview *and* write" to argue
about. `--assistants <ids>` is a comma list of `opencode`, `codex`,
`claude`, `pi`, `cursor`, `copilot`.

Non-interactive callers (`--no-interactive`, `--json`, pipes, CI) never get a prompt and never
have files changed unless they also pass `--apply`. `--json` prints a machine-readable plan with
`mode`, `applied`, `appliedPaths`, per-file `changes` and `nextSteps` instead of the human UI. If a
write fails halfway through a batch, the payload still reports what already landed plus the `error`,
and the exit code is 1.

### Shell completion

```sh
apex completion zsh  > "${fpath[1]}/_apex"                          # then rehash
apex completion bash >> ~/.bashrc                                   # then source ~/.bashrc
apex completion fish > ~/.config/fish/completions/apex.fish
```

## What a review looks like

```
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ Apex CLI · Configure callstack/Apex for your favorite harness              │
 │                                                                            │
 │ Nothing is written until you confirm.                                      │
 └────────────────────────────────────────────────────────────────────────────┘
│
◆  Set up callstack/Apex for which assistants?  (space toggles, enter confirms)
│  OpenCode, Codex
│
◇  Set up callstack/Apex for which assistants?  (space toggles, enter confirms)
│  OpenCode, Codex


   Planned changes:

   Update     ~/.config/opencode/opencode.json
   --- ~/.config/opencode/opencode.json
   +++ ~/.config/opencode/opencode.json
   @@ -1,4 +1,19 @@
    {
      // keep this comment
   -  "theme": "dark"
   +  "theme": "dark",
   +  "provider": {
   +    "callstack.ai": { … }
   +  }
    }

   Create     ~/.codex/callstack_ai.config.toml
   --- /dev/null
   +++ ~/.codex/callstack_ai.config.toml
   @@ -0,0 +1,10 @@
   +model_provider = "callstack_ai"

   Existing files get a .apex-backup-<id> copy first.        (dimmed)
│
◇  Apply these changes?
   ✔ ~/.config/opencode/opencode.json backup: opencode.json.apex-backup-b4c42657


   Environment

   ✓ CALLSTACK_AUTH_TOKEN is set in this shell
   Apex CLI never reads, stores or logs the key itself.


   Use these commands to run callstack/Apex with your selected harnesses:

   apex run opencode  opencode --model callstack.ai/callstack/Apex        (dimmed)
   apex run codex     codex --profile callstack_ai

   ...or pick "callstack/Apex" from the UI when setting up manually.
   For more instructions, visit:
   https://app.notion.com/p/callstack/Apex-how-to-use-it-36d5d027c0f880e99d03d1c37a77382f

   If you want to undo the changes, run apex undo
```
Every Apex line sits in the same 3-space gutter the prompt library uses for its own text (`◇  …`,
`│  …`), so the picker, the plan and the diff below it read as one column; the header box sits just
outside that gutter, so its text lines up too. Blocks are separated by blank lines that headings own,
so nothing can slide out of alignment when a terminal wraps a line, and wrapped text stays inside the
gutter because widths are measured on the text without its colour codes. Columns inside a line are
sized from their longest value plus a gap, so labels never touch the text beside them. Added lines are green,
removals red, hunk markers magenta, the `callstack/Apex` model id is always green, and environment
references such as `{env:CALLSTACK_AUTH_TOKEN}` are highlighted instead of printed as secrets.

`Environment` only shows the `export CALLSTACK_AUTH_TOKEN=…` line while the variable is missing; once
it is set you get a green `✓ CALLSTACK_AUTH_TOKEN is set in this shell` instead. The closing block shows
what each `apex run` expands to, links the guide (the URL is never folded, so it stays clickable), and
mentions `apex undo` only when something was actually written.

The diff is the change list: it only shows the lines that actually move, paths are shortened to
`~/…`, and values under keys like `apiKey`, `token` or `secret` are redacted, so a preview can be
pasted into a ticket safely. A file Apex CLI created diffs from `/dev/null`, and one it is deleting
diffs to `/dev/null`. `--no-diff` swaps the diff for one `+ key  value` row per setting.

## Reversing changes

`apex undo` re-applies the inverse of the last setup, named by the time it ran: files Apex CLI
created are deleted, files it edited go back to their pre-setup bytes. It only touches a file whose current content still hashes
to what Apex CLI wrote; anything you edited afterwards is left alone and reported. Restores create
their own backup first, so an undo is itself reversible. Apex CLI records each batch in
`$APEX_STATE_DIR/journal.json` (default `~/.local/state/apex/journal.json`, mode `0600`); the last
20 batches are kept. Deleting the journal only forgets the history, it never changes a config.

## Integrations

| Assistant | Configuration | Behavior |
| --- | --- | --- |
| OpenCode v1 | `~/.config/opencode/opencode.json` or `.jsonc` | Adds `provider.callstack.ai`, OpenAI-compatible transport, model and environment-key reference; preserves the default model. |
| Codex 0.134.0+ | `~/.codex/callstack_ai.config.toml` | Adds a self-contained Responses API provider/profile; leaves base config and default model untouched. |
| Claude Code | `~/.claude/settings.json` | Merges attribution flag only; use `apex run claude` for gateway credentials and model selection. |
| Pi | `~/.pi/agent/models.json` | Adds `providers.callstack` with Chat Completions, Apex and `$CALLSTACK_AUTH_TOKEN`; preserves other models. Requires a Pi version supporting `$VAR` key interpolation. |
| Cursor | Guided setup | Prints endpoint, API-key and custom-model steps; does not modify private editor storage. |
| VS Code / Copilot | Guided setup | Detects VS Code, not whether Copilot is installed; prints custom-endpoint steps and model JSON, retaining the editor-generated secret reference. |

Respects `XDG_CONFIG_HOME`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `PI_CODING_AGENT_DIR`,
`XDG_STATE_HOME`/`APEX_STATE_DIR`, and Windows `APPDATA`. Project-specific settings and custom
`OPENCODE_CONFIG` files are not modified and may override global configuration. OpenCode's v2
`providers` format is not supported; this adapter uses the v1 `provider` format. Older Codex
releases using inline `[profiles]` need a manual migration or a newer Codex release.

Windows: use npm/npx for setup. File configuration supports Windows paths, but `apex run` refuses
`.cmd`/`.bat` shims to avoid shell interpolation; launch the configured assistant directly or use
WSL. The shell installer targets macOS, Linux and WSL.

## Authentication

Provide `CALLSTACK_AUTH_TOKEN` through your shell or a secret manager. Apex CLI never prompts for,
logs, stores or validates the key, and never writes it to a config file; configs only reference it.
A hidden prompt keeps it out of your shell history:

```bash
read -r -s -p 'Callstack API key: ' CALLSTACK_AUTH_TOKEN; echo
export CALLSTACK_AUTH_TOKEN
apex run codex
```

Other launchers: `apex run opencode`, `apex run claude`, `apex run pi`, `apex run codex -- --help`.
Launchers pass extra arguments through unchanged (without a shell), can be overridden by explicit
user arguments, and never run `init`. `apex run claude` sets the gateway URL, token, attribution
flag and model aliases in the child process only, leaving your default Claude provider alone.

## Safety and recovery

Apex CLI will not break what you already have.

- It shows every change first, and writes nothing until you say yes. If you script it, only
  `--apply` writes.
- It copies a file next to itself before it edits that file, so you can always put the old one back.
- It keeps your comments, your other settings, and your default model.
- It never asks for your API key, writes it down, or sends it anywhere. You keep it in
  `CALLSTACK_AUTH_TOKEN`, and the CLI prints `<redacted>` wherever a secret would show.
- If a config file is broken, set up another way, or a link to somewhere else, Apex CLI stops and
  tells you. It does not overwrite it.
- `apex undo` gives your old setup back. It only touches files that still match what Apex CLI wrote.

How that works underneath:

- Previews print paths and key/value changes, never secrets.
- All selected configurations are parsed before any write. Malformed files, conflicting Codex
  profile keys and symlinked files or directories are refused, and one bad assistant blocks the
  whole batch instead of half-applying it.
- JSON/JSONC edits preserve comments and unrelated keys. Existing Callstack endpoint and auth
  fields are replaced with the documented endpoint and environment references; existing auth files
  are left untouched, so a stored credential may still win and needs removal in the assistant's
  own auth UI.
- Writes use same-directory temporary files plus rename with mode `0600` (new directories `0700`),
  and abort if the file changed on disk between planning and saving. This is not a lock or a
  multi-file transaction: a later I/O failure can leave earlier writes applied. `apex undo`
  cleans that up.
- Backups and newly created files are printed with every save. To recover by hand, close the
  assistant and restore the printed `*.apex-backup-<id>` file over its config after reviewing any
  intervening edits. Backups can contain previous secrets.
- No shell startup file is ever edited. The CLI makes no API requests and cannot verify your
  key or gateway access; launch a configured assistant to test the connection.

## Shell installation

The bootstrapper installs the npm package to `~/.local` without sudo, without downloading Node.js
and without touching shell profiles. Set `APEX_INSTALL_PREFIX` and/or `APEX_VERSION` to override.

```sh
sh scripts/install.sh
sh scripts/install.sh --assistants codex,pi --no-interactive
sh scripts/install.sh --assistants codex,pi --apply
```

The first command only installs and prints the next one. Passing init options also runs setup; when
piped, prompts reconnect to `/dev/tty` if available. Upgrade by rerunning with a newer
`APEX_VERSION`; uninstall with
`npm uninstall --global --prefix "$HOME/.local" @callstack/apex`. Uninstalling the CLI does not
undo assistant configuration: run `apex undo` first.

## Development

```sh
npm test          # builds dist, then runs node:test against a throwaway HOME
npm run check     # syntax checks, installer syntax, build
npm pack --dry-run
```

`src/` is deliberately small and each module owns one concept: `assistants.js` detection and the
per-tool adapters, `config.js` safe reads and JSONC/TOML edits, `diff.js` value and text diffs,
`secrets.js` the redaction rules, `journal.js` the undo journal, `plan.js` plan modelling and the
write flow, `ui.js` presentation, `paths.js` and `tty.js` the two environment probes, and `cli.js`
the command surface.

Tests create a temporary `HOME`, fake credentials and a temporary state directory, so they never
touch your assistants' settings. One test asserts the published bundle imports nothing but `node:*`,
which is the point of bundling: `tsdown` inlines `@clack/prompts`, `jsonc-parser` and `smol-toml`
into a single `dist/cli.js` and the package ships with no runtime dependencies. Before releasing,
test each supported tool against a real account and verify version compatibility.

Maintainers with publish access to `@callstack` can release with:

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
