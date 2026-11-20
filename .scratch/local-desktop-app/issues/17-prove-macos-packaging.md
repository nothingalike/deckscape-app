# 17: Prove the packaged local profile on both Mac architectures

**What to build:** Build and install the same narrow persisted-profile and rendering proof on Apple Silicon and Intel macOS so platform feasibility is checked before final gameplay qualification.

**Blocked by:** 01 - Prove a packaged local profile on Windows.

**Status:** ready-for-human

**Spec stories:** 2, 4, 61.

- [ ] Produce installable artifacts using the pinned toolchain for Apple Silicon and Intel macOS, recording how each is built and installed.
- [ ] The visible persisted deck-name and Pixi proof from the first ticket works through the same renderer/service/SQLite path on each architecture.
- [ ] Verify per-user data paths, native window/file-dialog integration as available, safe external links, single-instance behavior, and reopening with committed data.
- [ ] Document exact tested macOS versions and architecture evidence, including whether evidence came from native or translated execution.
- [ ] Record unsigned/internal-development installation limits separately from signed/notarized general distribution; no public release or credential purchase is implied.
- [ ] Record measured package size, startup, memory, and rendering observations and preserve any platform-specific failures as owning-ticket evidence.

## Comments

The current session exposes Windows and WSL Ubuntu, with no configured Mac execution target. The user explicitly answered the Mac-host question: **"Prepare the procedure; I’ll run it later."** Prepare the native-host build and qualification procedure, then continue independent Linux work. Keep all Mac acceptance criteria open until actual execution evidence is returned; ask no further Mac-host question during this goal.

Added the native-only internal build entry `npm run package:mac`. It supports native architecture or explicit arm64/x64/both targets, records host version/architecture and translation, uses an ad-hoc development signature with Hardened Runtime disabled, and forces publication off. It does not select or purchase a distribution identity. The selected minimum is macOS 13, matching pinned Electron 45.3.2's platform support. This is a build procedure, not a successful Mac build or installed qualification.

Prepared `docs/macos-qualification.md`. The user can run native builds, copy the DMG app into a new empty owned folder, execute the shared persistence/Pixi/input/reopen proof, perform native dialog/browser checks, and return architecture/translation, OS/GPU, timing/memory, package hashes and screenshots separately for each architecture.

`npm run qualification:bundle` creates the private allowlisted source/fixture ZIP under `release/`; the 758-file snapshot inventory and every staged hash were verified. General local data, installed dependencies and credential/configuration folders are excluded. The native Mac command stops before packaging on Windows. Distribution credentials are removed from its child environment and notarization is explicitly disabled. The shared launcher now preserves the Chromium sandbox on Linux; the installed-rendering procedure passed on Windows and emits real platform/runtime/GPU metadata. Standards and prepared-procedure Spec reviews have zero findings. The report's desktop/narrow layout and raw command Copy behavior were verified.

Every Mac acceptance checkbox remains open. No Mac package, native runtime result, signing/notarization readiness or full ticket-20 journey has been claimed. Continue Linux work independently under the user's instruction.


The source/procedure bundle was refreshed after the completed Windows19 and Linux21 slices, including the tested coordinator fix, bounded Linux restart handoff, full shared journey, actual app architecture/translation metadata and prepared distribution configuration. Use the current `release/mac-qualification-source.zip` and its `.local/mac-qualification-bundle.json` hash; its complete staged inventory/hashes are verified. The initial71807c06 procedure ZIP is preserved separately under `release/mac/`. The stable interactive Mac checklist retains its earlier question IDs and adds the full ticket20 journey/return-backup steps. All native Mac acceptance remains open for the user's later execution.
