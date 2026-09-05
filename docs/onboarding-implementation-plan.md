# Apex onboarding implementation plan

Status: manual onboarding MVP implemented locally; release and production acceptance pending.
Prepared: September 5, 2026.

## Execution status — September 5, 2026

Changes are in the three local checkouts (`apex-cli`, `../apex-landing-page`, and
`../apex-developer-console`). Nothing has been committed, pushed, published, or
deployed as part of this implementation. The status table below records delivered
scope; the original phase checklists remain the full acceptance/release checklist,
not a claim that every local change has passed production acceptance.

| Work item | Implemented locally | Remaining acceptance or decision |
| --- | --- | --- |
| ENTRY-01 | Functional self-service signup/sign-in CTAs; separate configurable enterprise destination | Confirm access policy and enterprise owner/URL; absent enterprise URL links to the setup guide instead of a fake request form |
| ENTRY-02 | Package repository metadata; consistent invocation docs; copyable command and prerequisites behind `VITE_CLI_RELEASED` | Licensing/ownership approval, npm publication, clean-machine command and hosted installer verification; registry recheck still returned E404 |
| ENTRY-03 | Public setup/support destinations; removed placeholder links and unsupported integration logos | Supply approved legal URLs and confirm public support policy; missing legal URLs are omitted, not fabricated |
| HANDOFF-01 | Allowlisted same-origin return destinations preserved through signup/sign-in, including checkout query parameters | Browser acceptance for new and expired sessions; default auth destination is `/setup` |
| HANDOFF-02 | Console setup guide, key reuse, shell-specific hidden prompts, CLI `auth` handoff and explicit browser opening | Published CLI required for the advertised npx path; local-source guide shown until then |
| HANDOFF-03 | Separate account/credit/key/setup steps; server-reported funding information; return to setup; disabled-payment support | Verify production signup restrictions, trial credit, currency, minimums, and payment availability |
| SETUP-01 | Interactive selection, explicit automation selection, bounded version probes, manual/missing/unsupported guidance | Broader real assistant/version/OS matrix; unrecognized versions remain unverified |
| SETUP-02 | Per-assistant planning/results, explicit skip, nonzero partial status, backup and concurrent-change safeguards | Real filesystem/platform acceptance beyond isolated fixtures |
| SETUP-03 | Read-only `doctor`; credentials separate from configuration; consent-gated bounded live checks per transport | Approved live gateway/model tests; a gateway check does not verify an assistant's full feature set |
| RECOVERY-01 | Environment-only credential instructions, new-terminal behavior, rotation/removal guidance | Second-session user acceptance; keychain storage intentionally deferred |
| RECOVERY-02 | Unsaved-key dismissal warning, clipboard failure fallback, persistent non-secret setup guide and rotation guidance | Browser interaction QA for Escape, backdrop, close, copy failure, and navigation |
| RECOVERY-03 | Checkout ID in return URL; authenticated pending-session lookup; retained retry context; duplicate-credit budget sync retry | Stripe test-mode delayed webhook, cross-tab/auth recovery, cancellation and expiry acceptance |
| RECOVERY-04 | Account-loading error/retry, preserved auth intent, public support route | Secure password reset remains unimplemented; needs email delivery, abuse controls, token/session lifecycle design |
| AUTH-01 | No automatic authorization protocol added | Deferred pending independent security design/review; no browser-cookie extraction or automatic key creation |

### Implementation defaults and release gates

- Use the existing self-service account flow without changing signup restrictions,
  prices, grants, or payment policy. These defaults need owner confirmation before rollout.
- Console origin defaults to `https://platform.callstack.ai` from the Console source
  configuration. CLI `APEX_CONSOLE_URL` and landing `VITE_CONSOLE_URL` allow override;
  confirm the actual deployed origin before release.
- Both web apps default `VITE_CLI_RELEASED=false`. Set it to true only after the
  advertised npm command works outside a checkout, then rebuild the web apps.
- Keep credentials environment-only. Never persist tokens in source, startup files,
  browser redirect parameters, or telemetry. Opening the Console does not create a key.
- Supply approved enterprise, privacy, terms, and support destinations. The default
  support destination is a public GitHub issue tracker, not a private support inbox.
- Password reset, OS credential storage, device authorization, and funnel telemetry
  are not included in this MVP. Assign owners and approve their designs separately.

### Validation completed

- CLI: all 27 tests and syntax checks pass, including dry-run isolation, partial
  setup, compatibility states, credential redaction, and mocked transport responses.
- npm package dry-run passes: nine expected runtime/documentation files, with no
  test fixtures or credentials included. Diff whitespace checks pass in all three repos.
- Landing: lint and production build pass.
- Console: TypeScript checks and production build pass. Vite reports the existing
  large-bundle warning; no bundle-splitting work was included.
- Isolated Console smoke checks pass for safe return destinations, auth query
  roundtrips, unavailable session storage, and matching-only checkout cleanup.
- A temporary SQLite database and mocked gateway verify that a failed budget sync
  retries without duplicate ledger credit, and pending checkout queries are user-scoped.
- No live signup, email delivery, payment, gateway requests, or browser interaction
  acceptance was performed. Complete the cross-repository matrix below with approved
  test accounts before declaring the onboarding journey production-ready.

## Objective

A new user can go from the landing page to a successful assistant request, then
repeat it from a new terminal, without Slack help, private documentation, or
guessing the next step.

The initial release should connect the existing browser and CLI experiences.
Automatic browser-to-CLI authorization is a later enhancement, not a prerequisite
for fixing the basic journey.

## Audit baseline

| Repository | Reviewed revision | Responsibility |
| --- | --- | --- |
| `callstackincubator/apex-landing-page` | `3d27a73` | Discovery, pricing, access, documentation |
| `callstackincubator/apex-developer-console` | `75850d4` | Accounts, credit, keys, onboarding, recovery |
| `callstackincubator/apex` | `1fcda23` | Installation, configuration, credentials, launching, diagnostics |

These findings are based on source inspection, a registry lookup, and isolated CLI
reproductions. Live signup, payment, gateway access, and deployed environment
settings were not tested. Source paths below are relative to the named repository.

At audit time, `npm view @callstack/apex` returned `E404`. Recheck before release:
this is a dated observation, not a permanent package status.

### Confirmed failure paths

- Landing email submission only calls `preventDefault()`.
- Landing documentation and legal links are placeholders.
- The advertised npm installation cannot currently be verified from the registry.
- Console key creation ends with a secret and curl example, not assistant setup.
- CLI initialization can report completion without credentials.
- Cursor-only initialization reports configuration is up to date without checking it.
- A malformed OpenCode configuration prevents another selected assistant's setup.
- Sign-in and signup discard the original destination.
- Payment reconciliation clears its retry context before confirmation.
- There is no password-reset flow or persistent CLI login.

## Target journey

```text
Landing: Get started
  → Sign up / sign in, preserving destination
  → Explain trial credit or prepaid funding
  → Create an Apex key
  → Choose assistant and operating system
  → Run the matching setup command
  → Supply credentials securely
  → Verify connection and selected model
  → Make the first successful request
  → Explain returning, rotating keys, and adding credit
```

The CLI-first path must converge on the same journey: missing credentials should
offer the Console key page, not leave the user with only an environment-variable
name. Existing-key users must be able to skip account and key creation.

## Decisions required

Resolve these before implementing the affected tasks:

- [ ] Choose self-service access, restricted beta, or an explicit combination.
- [ ] Confirm canonical landing, Console, documentation, and support destinations.
- [ ] Assign a separate enterprise/pilot destination and request owner.
- [ ] Decide trial credit, prepaid minimums, and behavior when payments are unavailable.
- [ ] Define the supported assistant/version/OS matrix and manual-only integrations.
- [ ] Choose whether the first release keeps credentials environment-only or offers
  opt-in OS credential storage. Document the fallback when a credential store is unavailable.
- [ ] Assign maintainers for each repository, npm publication, and deployed configuration.

## Phase 1 — Restore entry points (P0)

### ENTRY-01: Make access CTAs functional

Repository: landing. Depends on: access policy and canonical destinations.

- [ ] Route self-service access to Console signup, or implement a real beta-request
  submission with loading, success, failure, and retry states.
- [ ] Route enterprise inquiries separately rather than through the generic beta form.
- [ ] Apply the same behavior to header, mobile, pricing, and footer CTAs.
- [ ] Link returning users directly to Console sign-in.

Acceptance:
- Every CTA reaches its stated destination or records a request with visible confirmation.
- Failed requests retain user input and expose a retry path.
- A submitted form never silently does nothing.

Sources: `src/components/EmailCapture.tsx:17`, `src/components/Pricing.tsx:5`.

### ENTRY-02: Make the advertised installation reproducible

Repository: CLI, then landing. Depends on: npm publish access and release readiness.

- [ ] Confirm package ownership, licensing, release metadata, and packaged contents.
- [ ] Run tests, syntax checks, and package preview; publish an approved version.
- [ ] Verify the exact advertised command in a clean environment without a local checkout.
- [ ] Display Node.js/npm prerequisites beside the landing command and provide a copy action.
- [ ] Document global versus `npx` usage consistently; do not assume an `apex` binary
  is globally available after an `npx` invocation.
- [ ] If advertising a shell installer, host and test the actual HTTPS endpoint and
  explain user-local PATH setup. Do not advertise placeholder URLs.

Acceptance:
- Registry metadata resolves and the advertised command starts successfully.
- A user with missing prerequisites receives an actionable installation path.
- Shell and npm entry points lead to the same setup flow.

Sources: landing `src/components/SetupVisual.tsx:5`; CLI `package.json:1`,
`scripts/install.sh:5`.

### ENTRY-03: Restore documentation and trust links

Repository: landing. Depends on: approved documentation, legal, and support destinations.

- [ ] Replace disabled documentation, Terms, and Privacy links with real destinations.
- [ ] Provide a public assistant setup guide and troubleshooting/support entry point.
- [ ] Align integration claims with automatic, manual, and unsupported categories.

Acceptance: all published navigation links work; users can find setup and recovery
instructions without internal documents.

Sources: `src/nav.ts:8`, `src/components/Documentation.tsx:7`,
`src/components/Footer.tsx:6`, `src/components/Integration.tsx:9`.

## Phase 2 — Connect the Console and CLI (P0/P1)

### HANDOFF-01: Preserve intent across authentication

Repository: Console. Depends on: agreed onboarding routes.

- [ ] Preserve the requested path and required query parameters through both sign-in
  and signup, including switching between those screens.
- [ ] Validate return destinations as allowed same-origin routes to prevent open redirects.
- [ ] Retain checkout-return context when authentication is required.
- [ ] Send users with no return destination to onboarding when setup is incomplete.

Acceptance: a signed-out visitor opening `/keys` reaches `/keys` after either login
or registration; invalid external destinations are rejected.

Sources: `web/src/App.tsx:28`, `web/src/pages/SignIn.tsx:20`,
`web/src/pages/SignUp.tsx:25`.

### HANDOFF-02: Add a browser handoff and assistant quickstart

Repositories: Console and CLI. Depends on: HANDOFF-01, ENTRY-02, canonical Console URL.

- [ ] Add “Set up your coding assistant” after key creation and keep a non-secret
  quickstart accessible from the keys page afterward.
- [ ] Ask for assistant and operating system; show the matching setup and launch commands.
- [ ] In CLI setup, distinguish an existing token from missing credentials and offer
  to open the Console key page, with a printed URL fallback.
- [ ] Explain how to supply `CALLSTACK_AUTH_TOKEN` securely for the user's shell.
- [ ] Keep an existing-key path; do not require users to mint another key on every run.
- [ ] Do not copy browser cookies, request the gateway admin key, or put API keys in URLs.

Acceptance:
- A Console-first user can continue into assistant setup without searching elsewhere.
- A CLI-first user can discover where to obtain a key and resume setup afterward.
- Headless users receive equivalent manual instructions.
- Credentials do not appear in logs, command examples containing literal secrets,
  repository files, or redirect parameters.

Sources: Console `web/src/components/SecretReveal.tsx:44`;
CLI `bin/apex.js:74`, `src/assistants.js:126`.

### HANDOFF-03: Make credit readiness explicit

Repositories: Console and landing. Depends on: trial/payment policy.

- [ ] Explain prepaid funding, minimum top-up, and any trial credit before first use.
- [ ] Show account, credit, key, and assistant readiness as separate onboarding steps.
- [ ] Preserve the return to setup after funding.
- [ ] Replace customer-facing server-variable instructions with an actionable support
  path when payments are disabled.
- [ ] Validate deployed settings so the intended audience is not admitted into an
  unfunded account with no supported way to add credit.

Acceptance: zero-credit and disabled-payments states have an explicit next action;
creating a key is not presented as proof that requests can run.

Sources: Console `server/src/env.ts:37`, `server/src/env.ts:44`,
`web/src/pages/Billing.tsx:169`; landing `src/components/Pricing.tsx:9`.

## Phase 3 — Make setup results trustworthy (P1)

### SETUP-01: Add capability-aware assistant selection

Repository: CLI. Depends on: supported assistant/version/OS matrix.

- [ ] Offer interactive selection instead of configuring every detected tool by default.
- [ ] Preserve explicit `--assistants` selection for automation.
- [ ] Distinguish binary detection from stale configuration directories.
- [ ] Check supported versions/capabilities and report automatic, manual, upgrade-required,
  missing, and unsupported states before writing.
- [ ] Give specific guidance for Windows shims, missing binaries, editor-only setup,
  and project-level configuration overrides.

Acceptance: users know which selected tools can be configured and what remains manual;
unsupported tools are not silently treated as compatible.

Sources: `src/assistants.js:44`, `bin/apex.js:38`, `bin/apex.js:67`.

### SETUP-02: Isolate configuration failures

Repository: CLI. Depends on: SETUP-01.

- [ ] Plan and report changes/errors per assistant.
- [ ] Offer “Skip this assistant and continue” for malformed, conflicting, ambiguous,
  or symlinked configurations without weakening safe-write protections.
- [ ] Define noninteractive behavior explicitly: no silent skips; return a documented
  nonzero status for partial failure.
- [ ] Report created, updated, unchanged, skipped, failed, and manual-only outcomes.
- [ ] Include backup and recovery instructions for applied changes when a later write fails.

Acceptance: a malformed OpenCode file does not prevent the user from explicitly
continuing with Claude; the original malformed file remains untouched.

Sources: `bin/apex.js:69`, `src/config.js:38`.

### SETUP-03: Separate configuration from verified readiness

Repository: CLI. Depends on: HANDOFF-02 and SETUP-01.

- [ ] Replace generic completion messages with configuration, credential, manual-action,
  and verification states.
- [ ] Never report an editor configuration as up to date without checking it.
- [ ] Add a diagnostic command, such as `apex doctor`, for configuration and credential checks.
- [ ] Offer an explicitly disclosed minimal live request to verify gateway access;
  explain that it may consume credit and do not send project content.
- [ ] Distinguish authentication, exhausted credit, rate limits, unavailable models,
  network/gateway failures, and local configuration errors when evidence permits.
- [ ] Preserve useful redacted errors when the failure category is uncertain.

Acceptance:
- No-token initialization reports credentials missing rather than ready to use.
- Cursor-only setup reports manual action required.
- A successful live check identifies the model and transport tested; it does not
  imply every assistant feature has been validated.
- Dry runs remain network-free and write-free.

Sources: `bin/apex.js:74`, `bin/apex.js:91`, `src/assistants.js:126`.

## Phase 4 — Returning users and recovery (P1)

### RECOVERY-01: Support the second terminal session

Repository: CLI. Depends on: credential-storage decision and HANDOFF-02.

- [ ] Provide shell-specific environment-only instructions, including new-session behavior.
- [ ] If approved, add opt-in OS credential storage with an explicit environment-variable
  override policy and an actionable fallback when storage is unavailable.
- [ ] Resolve stored credentials at launch and inject them only into the child environment.
- [ ] Explain direct assistant launch versus `apex run`, including provider/model defaults.
- [ ] Provide credential replacement/removal and guidance for expired or rotated keys.
- [ ] Do not silently edit shell startup files or introduce plaintext persistence.

Acceptance: a user can repeat a request from a new terminal using the documented
credential mode; rotation has a clear local update path.

Sources: `README.md:35`, `src/assistants.js:126`.

### RECOVERY-02: Preserve one-time key delivery

Repository: Console. Depends on: HANDOFF-02.

- [ ] Confirm dismissal of an unsaved key when Escape, backdrop, or close is used.
- [ ] Show clipboard failures and provide a manual-copy fallback.
- [ ] Keep setup instructions accessible after the secret dialog closes, without
  retaining the secret for later display.
- [ ] Explain lost-key rotation and the need to update every affected client.

Acceptance: failed copying is visible; accidental dismissal warns the user;
post-dismissal help remains available without exposing the secret again.

Sources: `web/src/components/SecretReveal.tsx:19`, `web/src/components/Modal.tsx:16`,
`web/src/pages/Keys.tsx:229`.

### RECOVERY-03: Make payment reconciliation recoverable

Repository: Console. Depends on: HANDOFF-01 and HANDOFF-03.

- [ ] Retain pending checkout context until confirmed or explicitly resolved.
- [ ] Render pending, failed, unpaid, and confirmed outcomes with appropriate retry actions.
- [ ] Support recovery after reload or return to a different tab without relying solely
  on one tab's `sessionStorage`; verify ownership server-side.
- [ ] Surface budget re-sync errors and distinguish payment confirmation from gateway readiness.
- [ ] Keep credit application idempotent under webhook and reconciliation retries.

Acceptance: a delayed webhook or failed reconciliation request does not remove the
user's recovery path; retries never duplicate credit.

Sources: `web/src/pages/Billing.tsx:51`, `web/src/pages/Billing.tsx:74`,
`web/src/pages/Billing.tsx:149`.

### RECOVERY-04: Add account recovery and service-error states

Repository: Console.

- [ ] Add password recovery with expiring, single-use reset tokens and non-enumerating
  responses; define email delivery and abuse controls.
- [ ] Distinguish signed out, expired session, and service/network failures.
- [ ] Offer retry on account-loading failure instead of presenting it as a normal login state.
- [ ] Preserve onboarding progress through authentication recovery.
- [ ] Expose a customer support route for account restrictions or recovery failures.

Acceptance: forgotten passwords have a self-service recovery path, and a failing
`/auth/me` request is not silently presented as an ordinary signed-out session.

Sources: `server/src/routes/auth.ts:96`, `web/src/pages/SignIn.tsx:8`,
`web/src/lib/auth.tsx:19`, `web/src/lib/auth.tsx:54`.

## Phase 5 — Seamless browser authorization (P2)

### AUTH-01: Add an approved browser-to-CLI flow

Repositories: Console and CLI. Depends on: secure credential lifecycle, HANDOFF-01,
and an independently reviewed authorization design.

- [ ] Design a device-authorization-style flow with a public verification code and
  a separate high-entropy credential held by the initiating CLI.
- [ ] Add short-lived requests, explicit browser approval showing account and key
  permissions, expiry, denial, polling limits, and single-use redemption.
- [ ] Bind key delivery to the initiating client; prevent replay and cross-account confusion.
- [ ] Protect browser approval against CSRF and rate-limit creation, approval, and polling.
- [ ] Define retry-safe key creation/delivery, abandoned-flow cleanup, and secret retention.
- [ ] Reuse server-side key scoping; keep the gateway admin key server-side.
- [ ] Add `apex login` and retain the manual browser/key path for headless environments.

Acceptance: approval authorizes only the displayed request; expired, denied, replayed,
and mismatched requests fail safely. Browser cookies and API keys never appear in
URLs or logs. Opening a browser alone does not create a key.

This protocol does not exist in the audited repositories. It requires backend and
frontend changes, not just a CLI call to the existing cookie-authenticated key endpoint.

## Cross-repository validation

Use isolated accounts and approved test credentials. Run payment scenarios in test
mode. Never use production customer credentials in fixtures or logs.

| Scenario | Required outcome |
| --- | --- |
| New visitor, no account | CTA reaches signup; user reaches a successful request |
| Returning visitor, signed out | Original destination survives authentication |
| CLI-first, no key | Console handoff and explicit resume instructions |
| Existing key | No forced signup or duplicate key creation |
| Fresh machine / missing Node.js | Actionable prerequisite instructions |
| No assistant installed | Installation guidance, not a success state |
| Supported automatic assistant | Correct configuration and verified model selection |
| Cursor/Copilot | Honest manual checklist and verification guidance |
| Unsupported version / Windows shim | Specific compatibility guidance |
| Malformed unrelated config | Explicit skip allows other selected tools to proceed |
| No token / invalid or expired token | Correct state and a recovery action |
| New terminal session | Documented credential mode still works |
| No credit / payments disabled | Clear funding or support path |
| Delayed webhook / failed reconciliation | Recoverable state without duplicate credit |
| Lost key / clipboard failure | Visible fallback and rotation guidance |
| Forgotten password / auth outage | Recovery or retry, without losing setup intent |
| Rerun setup | Idempotent changes with no unnecessary backup churn |
| Partial write failure | Accurate per-tool results and recovery instructions |

## Rollout and completion criteria

- [ ] Complete Phase 1 and the manual handoff before promoting self-service onboarding.
- [ ] Verify the actual deployed signup restrictions, trial credit, payment configuration,
  and model availability; defaults alone are not evidence of production behavior.
- [ ] Gate release on the cross-repository scenarios above, including the second-session test.
- [ ] Update public documentation and compatibility claims alongside behavior changes.
- [ ] Keep a tested CLI version available if an assistant release breaks configuration support.
- [ ] Define privacy-reviewed aggregate funnel measurements: access, signup, key creation,
  setup started, configuration completed, and first successful request. Do not log secrets
  or introduce CLI telemetry without an explicit policy and appropriate consent.

Definition of done: a fresh user and a returning user can complete the supported
journey without private instructions, misleading success messages, or an unexplained
dead end. Automatic authorization may remain deferred if the manual handoff meets
this criterion.
