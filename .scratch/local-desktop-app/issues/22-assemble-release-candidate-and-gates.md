# 22: Assemble an internal release candidate with distribution gates

**What to build:** Assemble the qualified desktop artifacts and an evidence-backed release record that clearly states whether source, provider, signing, and distribution prerequisites permit a public release.

**Blocked by:** 02 - Establish source and provider distribution prerequisites; 20 - Qualify the complete player journey on macOS; 21 - Qualify the complete player journey on Linux.

**Status:** ready-for-human

**Spec stories:** 61, 65, 66, 67, 68.

- [ ] Collect the tested Windows, Apple Silicon/Intel macOS, and Linux artifacts with exact versions, checksums, the supported-OS matrix, and links to installed-journey evidence.
- [x] Reconcile the earlier prerequisite record with the source and dependencies actually shipped; preserve required attribution/notices and verify that private operational data and credentials are excluded.
- [x] Add the intended code license only for source whose owners authorize it; record unresolved reused-source, official API, caching, download, or artwork permissions as unmet distribution gates.
- [x] Prepare Windows signing and macOS signing/notarization configuration and repeatable verification. Use authorized existing credentials when available; otherwise name the missing prerequisites and keep general-distribution readiness blocked.
- [x] Reconcile release metadata and intended download locations without publishing artifacts, contacting providers, buying credentials, or retiring the hosted service.
- [x] The ticket can deliver an internal candidate and a complete gate record with external prerequisites still unresolved. Public-release readiness is passed only when permission, signing, and tested-artifact evidence actually satisfy every gate.



## Comments

Prepared the feasible internal candidate while the user's native Mac execution remains deferred. The first criterion stays open because Apple Silicon/Intel artifacts and actual installed evidence are absent; ticket20 is ready-for-human. This ticket is ready-for-human with all public distribution gates retained, rather than complete or publicly releasable.

`tools/assemble-internal-candidate.mjs` assembles exact qualified artifacts into a new preserved directory and verifies each copied hash. Current candidate: `release/internal-candidates/0.2.0-162d3921/manifest.json`, also recorded in `.local/internal-candidate.json`. It contains12 files: final Windows installer, final Linux AppImage, production/Electron/Chromium notices and supporting records. Mac entries are null and publicReleaseReady=false. Windows11 Pro10.0.26200 x64 is directly recorded; Linux is the bounded Ubuntu22.04.3 WSLg X11/Wayland matrix. Earlier internal0.2.0 build snapshots remain in their own directories.

Reconciled `docs/distribution-prerequisites.md` with600 reused artifacts, actual full sync/offline evidence and21 production packages (zero missing license declarations/texts). Both actual application archives have8299 inventoried files and no detected private operational paths or named credential-pattern findings; notices are retained. The scanner's limited scope is explicit. The user is finding the applicable provider/artwork agreement; no new permission question or provider contact was made. No source license was assigned without source-owner authority.

Prepared separate `electron-builder.distribution.cjs` and JIT entitlements, with forced signing, Windows signing enabled, macOS Hardened Runtime/notarization, signed DMGs and no publish provider; commands also force publish never. The pinned26.18.0 builder schema and settings validation pass. Actual Windows installer signature is NotSigned. No signed build, Mac signing, notarization, credential acquisition or publication ran. `docs/release-candidate.md` names authorized existing credential inputs and repeatable signature/notarization/installed verification. These remain unqualified until actual authorized native execution.

Unmet gates: source-license authority; official API/download/caching grant; artwork/presentation-asset permission; both native Mac qualification targets; Windows signing; Mac signing/notarization; native Linux chooser/browser/physical-desktop integration; and approved release metadata/download delivery. Normal app delivery configuration remains null. All work remains uncommitted, the reference checkout and hosted service remain unchanged. The user can run the prepared Mac procedure later; additional agreement/signing evidence can be reconciled when available.

Final reviewed candidate: `C:/Users/johns/source/repos/neuroscape-app/release/internal-candidates/0.2.0-4cbad5a5/manifest.json`. It supersedes the initial162d3921 record, which is preserved with an explicit supersededBy pointer. Standards review identified a Linux audit binding gap; the corrected scanner launches the exact AppImage, scans its mounted app.asar, and records/validates both hashes before and after inspection. The assembler rejects mismatched same-version image evidence before creating a candidate. The actual negative case passed, the canonical audit was restored and the new12-file candidate was copied/hash-verified. Both review axes now have zero remaining findings. Mac remains absent and all9 external gates remain unmet; publicReleaseReady=false.

Interactive internal-candidate review: http://localhost:4321/f/neuroscape-app/general/reviews/2026-11-15-2348-internal-candidate-release-gates . The prepared Mac checklist/source bundle is refreshed with final tested source and stable answer IDs.

