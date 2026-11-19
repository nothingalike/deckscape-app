# 18: Prove the packaged local profile on Linux

**What to build:** Build and install the narrow local persistence and rendering proof on x64 Linux, establishing the initial distribution and display-server support matrix.

**Blocked by:** 01 - Prove a packaged local profile on Windows.

**Status:** complete

**Spec stories:** 3, 4, 61.

- [x] Produce and install a Linux x64 artifact using the pinned toolchain without requiring player-installed development tools or a database server.
- [x] The visible persisted deck-name and Pixi proof works through the same renderer/service/SQLite path as Windows.
- [x] Verify local data paths, file dialogs as available, single-instance handling, external links, and reopen behavior on the selected distributions.
- [x] Exercise both X11 and Wayland where offered by the chosen matrix, documenting actual rendering and input results rather than inferring them from a package build.
- [x] Document tested distribution versions and required system runtime libraries; record package size, startup, memory, and GPU observations.
- [x] Keep internal packaging evidence separate from a general-distribution claim and retain unresolved compatibility limits explicitly.


## Comments

Qualified the actual 0.2.0 x64 AppImage through FUSE on Ubuntu 22.04.3 LTS, glibc 2.35, WSLg 1.0.79, kernel 6.18.58.1-microsoft-standard-WSL2. Both X11 and native Wayland passed visible windows, SQLite deck persistence, original Pixi/artwork/player input, committed game reopen, exact renderer capabilities, second-instance yielding and sandbox/seccomp mode 2. Each display has a separate run directory recorded by `.local/linux-platform/<display>/latest-appimage.json`.

The visible-window regression first failed on the old artifact: a loaded Wayland page stayed hidden when relying only on ready-to-show. The guarded post-load show fallback fixes the observed condition. No engine/card/deck source changed. TypeScript passed; Standards and Spec reviews returned zero remaining findings.

The artifact is 155824590 bytes, mounted app 430413360 bytes, SHA256 f9a6d6796ae0e2d638790cfec5bcbe552b11703d8dd1dfda17ebab0a994c3484. Observed cold startup: X11 2107ms, Wayland 2042ms. Per-process memory and virtual GPU details are in each desktop-proof.json. `.local/linux-build-evidence.json` records exact runtime package versions. Added libnss3/libnspr4 and libfuse2; player development tools/database server are unnecessary. Copied the private AppImage to `release/linux/`.

Native integration is qualified only as available on this host. The real native save request stayed pending without an owned visible X11 chooser; no native input was sent, and cancel/selection success remains unqualified. No Linux default browser handler is installed, so real browser handoff also remains unqualified. These are explicit host limits, distinct from previously passed controlled dialog/opener boundary tests. GNOME, KDE, other distributions and physical GPUs are untested. Completing this bounded WSLg ticket does not claim general Linux compatibility.

Repeatable procedure: `docs/linux-qualification.md`. Interactive review: http://localhost:4321/f/neuroscape-app/general/reviews/2026-11-15-2250-linux-appimage-proof . Full Linux journey remains 21. Mac17 stays ready-for-human per the user's instruction; continue19. All work remains uncommitted.
