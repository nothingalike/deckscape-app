# Build player downloads on GitHub

Status: complete
Type: task

## Acceptance criteria

- [x] Tag-push-only GitHub workflow validates version and exact source revision.
- [x] Configure native builds for Windows Setup, two Mac DMGs and Linux AppImage.
- [x] Complete artifacts, provenance and checksums are verified before draft creation.
- [x] Release page gives plain download/install instructions and excludes maintainer bundles.
- [x] Unsigned preview and explicit signed modes preserve honest signing status.
- [x] Repeat runs preserve published releases; ordinary build jobs have read-only access.
- [x] Validate locally and provide an interactive review with hosted-run limitations.

## Evidence and decisions

2026-11-16: The user requested GitHub release builds for nontechnical players. The repo has remote `https://github.com/nothingalike/deckscape-app.git`, an unborn local `main`, no workflow and existing Electron packaging for all four targets. Internal Mac packaging deliberately strips signing credentials, so CI signing uses the separate distribution profile. Existing public-release prerequisites remain recorded; use a draft release as the maintainer handoff. This creates actual release assets rather than asking players to download Actions artifact ZIPs.

## Implementation and verification

- `.github/workflows/release.yml` handles version-tag pushes only. It validates package version and exact tagged commit, runs the complete application tests in CI, builds each target on its native runner, runs the packaged smoke check, and collects all four artifacts before draft creation. Actions are pinned to official immutable SHAs; ordinary jobs use read-only repository access and the final job uses the built-in write token.
- `electron-builder.github.cjs` preserves the existing packaged-file allowlist and gives installers readable version/platform names. The existing signed distribution profile remains the signed-mode baseline. No source, cached-artwork, profile or qualification ZIP is attached as a player asset.
- `tools/github-release.mjs` verifies a complete same-tag/version/SHA/mode installer set, exact allowed paths, file types, sizes and hashes. It creates player instructions, direct download links, checksums and a build manifest. Published releases are preserved. Same-source/mode draft retries retain maintainer-edited notes. Unsigned outputs are labeled prereleases; signed mode requires credentials and actual native signature checks.
- `tools/verify-release-signatures.ps1` checks both the Windows installer and packaged application. Missing/invalid signatures fail signed mode; no credential was acquired or signing identity used here.
- Fixed a reproduced smoke-test selector race: after New deck, a fuzzy label query could match the outgoing deck-list sort control because it includes the option Deck name. `tools/desktop-smoke.mjs` now waits for the exact editor textbox role/name. The packaged check then passed without changing app behavior.
- `npm run typecheck` and all four new release regression tests passed. The tests reject bad/mismatched/injected tags, missing or altered installers, mixed source revisions, path changes, extra private files, another signing mode and attempts to replace a published version.
- actionlint 1.7.12 passed the workflow; its downloaded binary matched the official SHA256. Both preview/signed configuration variants passed the installed electron-builder26.18.0 schema.
- Actual local Windows NSIS output: `release/github/Neuroscape-Local-0.2.0-Windows-x64-Setup.exe`, 143964961 bytes, SHA256 `c959ee34b92e20344a3eab8008112ff26188de840f50dd0094ee5082071e0d4b`. The real packaged app passed startup, sandbox/context isolation, exact preload capability, single-instance, persistence and reopen checks. The signed-release gate rejected this unsigned installer as intended. Evidence: `.local/github-release-windows.json` and `.local/desktop-proof.json`.
- All600 reuse hashes and the unchanged pinned reference pass audit. GitHub connector metadata confirms `nothingalike/deckscape-app` is public with size0. No GitHub build was dispatched, source committed/pushed, release created/published, repository setting changed or credential configured. The initial commit/push and matching version tag are needed to run the workflow. Native Mac/Linux hosted builds, signing/notarization and end-to-end GitHub uploads remain unexecuted in this session.
- Existing distribution prerequisites remain separate from workflow implementation completion.

2026-11-16 clarification: The user selected tag-push-only builds. Removed the manual trigger and inputs, simplified concurrency/source selection to the pushed tag, and retained RELEASE_SIGNED for signing. Spec, operator instructions and interactive review are updated; actionlint passed.

2026-11-19: The user approved the app and requested the initial commit, push and release tag. The public remote was empty and no signing mode was configured, so the matching initial tag is `v0.2.0` in unsigned-preview mode. Before committing, comparing staged Git blob hashes with the 600 reused working files found 529 byte mismatches caused by `core.autocrlf=true`. Added `.gitattributes` with `* -text` to preserve the recorded source bytes on every platform. Workflow lint and the application build passed; the build required an unrestricted filesystem run because the sandbox denied esbuild's parent-directory reads. Existing platform and distribution limits remain recorded separately.

The initial commit `9ed1cac` and annotated `v0.2.0` tag were pushed. Local verification passed 321 tests with one expected platform skip. GitHub run 44554208886 passed full source validation and Windows/Apple Silicon/Intel Mac packaging and smoke checks. Linux produced an AppImage named `Linux-x86_64.AppImage`, then release staging failed because it expected `Linux-x64.AppImage`. A new regression using electron-builder's real architecture/macro expansion reproduced that mismatch. The Linux artifact pattern now explicitly uses the supported `x64` download label; all five release tests and TypeScript pass. Version `0.2.1` preserves the failed initial tag while retrying the corrected source.
