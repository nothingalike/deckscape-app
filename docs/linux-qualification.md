# Linux qualification

The internal x64 artifact is an AppImage. Build it on Linux x64 with Node.js
24.5 or later using `npm ci`, `npm run typecheck`, and `npm run package:linux`.
The package includes Electron, Node and SQLite; players need no development
toolchain or database server. The build command disables publication.

Copy the AppImage into a new owned folder and make it executable. Preserve any
existing installation and profile. An AppImage runs in place through FUSE; this
procedure does not install a system package or change desktop associations.

## Repeat the narrow installed proof

Set `NEUROSCAPE_EXE` to the absolute AppImage path and `NEUROSCAPE_INSTALLER` to
the same file. Run these commands separately for every available display system:

```sh
export NEUROSCAPE_DISPLAY=x11
npm run test:desktop
npm run test:platform-render
# Save .local/desktop-proof.json/png and .local/platform-render-* before repeating.
export NEUROSCAPE_DISPLAY=wayland
npm run test:desktop
npm run test:platform-render
```

The rendering proof requires the private Windows-origin fixture described in
[the Mac procedure](macos-qualification.md). It tests the original game, artwork,
canvas input and reopen path. Each run uses its own profile. The launcher keeps
Chromium's sandbox enabled and the desktop proof checks renderer seccomp. It
rejects `--no-sandbox`; do not use that flag to turn a failed host into a pass.

The ordinary profile uses a `profile` folder inside Electron's per-user
application-data directory. The tested app-data root is `~/.config`. The proofs override it with an
owned isolated profile and record both the actual app-data root and profile path.
They verify SQLite persistence, visible native windows, restricted renderer
capabilities, instance ownership, shutdown and reopen.

Manually check a native save dialog: cancel once, then export a complete backup
to an owned empty directory. Verify the ZIP exists. Check the approved external
link opens in the system browser and leaves the privileged application window
on its own page. Record unavailable dialogs or browser handlers explicitly.

## Current internal evidence

The actual 0.2.0 x64 AppImage passed both X11 and native Wayland rendering, input,
committed deck/game persistence, second-instance yielding and cold reopen on
Ubuntu 22.04.3 LTS, glibc 2.35, through WSLg 1.0.79. The kernel was
`6.18.58.1-microsoft-standard-WSL2`. Electron was 45.3.2 with bundled Node
24.22.2 and SQLite 3.53.4. This qualifies that virtual host only; native GNOME,
KDE, other distributions and physical GPU configurations remain untested.

The host needed `libnss3`/`libnspr4` and `libfuse2`. Other installed runtime
libraries included GTK 3, GBM, ALSA, X11 and Xtst; exact package versions are
recorded in `.local/linux-build-evidence.json`. A working FUSE device and system
desktop/browser integration are host prerequisites. Diagnostic X11 tools are
maintainer tools, not player dependencies.

The save request reached the system chooser, but this WSLg session exposed no
owned visible X11 chooser to finish or cancel. No native input was sent and no
successful real chooser selection is claimed. The host also had no Linux browser
handler. Native chooser completion and real browser handoff remain unqualified
on this host; controlled main-process dialog/opener checks are separate evidence.

The AppImage was 155,824,590 bytes and its mounted application was 430,413,360
bytes. The per-display JSON records observed startup time, all owned process
memory, GPU information, runtime versions and paths. These are single-run
observations, not performance targets. WSLg graphics are virtualized. The
interactive ticket-18 review carries the exact hash, JSON and screenshots.

A Wayland regression was reproduced: the loaded page could remain hidden when
the window relied solely on `ready-to-show`. Showing a successfully loaded
window, guarded against duplicate activation, fixed it. The same visible-window
assertion now runs on every platform. No game, card or deck functionality changed.

Full offline player qualification remains ticket 21. This internal artifact is
separate from general distribution, provider/artwork permission and signing gates.

The full-journey investigation also reproduced a failed native AppImage restart
after a successfully committed restore. A Linux-only handoff now waits for the
old main process to exit, then executes the same permanent AppImage launcher so
it remounts its runtime. Executable and arguments remain positional shell
parameters, and waiting is bounded to30 seconds. The handoff uses `/bin/sh` and
the host's `sleep` command. Scheduling failure gives a manual-reopen message;
the committed restored profile remains ready for the next launch. Windows and
Mac retain their native Electron restart path.

The native-relaunch proof waits for Electron's inspector identity to initialize
and validates the actual launcher, mounted executable/resources, isolated
profile and unique run token before control. AppImage successors use fresh test
debug ports because the experiment observed an inherited debug-port collision.
The test changes only those diagnostic arguments at the spawn boundary; the
actual restart, profile activation and original match execute for real. The
successor also preserves sandboxing, context isolation and disabled Node
integration in the renderer. Diagnostic ports are absent from ordinary launches.

## Full journey and portability

After Windows qualification passes, run the [shared installed journey](installed-qualification.md)
against the completed AppImage separately on X11 and Wayland. Preserve each
UUID evidence folder. The native chooser/browser limits above remain excluded
even when controlled OS-boundary proofs pass.

Run `npm run test:platform-render` with the provided Windows-origin fixture on
each display. It validates/stages the real portable backup, compares every deck
and the pinned original game, exercises player input and reopens the commit.
After the Linux backup proof, run:

```sh
node --import tsx tools/prepare-portability-fixture.ts
```

Copy the resulting private `.local/portability-export` folder to the Windows
qualification checkout. Set `NEUROSCAPE_PORTABILITY_FIXTURE` to that folder and
run `npm run test:platform-render` against the Windows artifact. Keep its evidence
with the Linux ticket. This tests Linux-origin archive portability independently
from Windows-origin restoration on Linux.

For supported upgrades, set `NEUROSCAPE_PREDECESSOR_EXE` to a separately prepared
native 0.1.0 predecessor, retain `NEUROSCAPE_EXE` for the current AppImage, and run
`node tools/qualify-platform-upgrade.mjs`. The internal Linux predecessor fixture
uses the actual preserved 0.1.0 platform-neutral application archive in the same
pinned native Linux Electron runtime. Its exact hash and reconstruction are
recorded separately; it is not a previously shipped Linux release. Set
`NEUROSCAPE_PREDECESSOR_DISPLAY=x11` for that early fixture; the current artifact
is checked on the caller's selected display. The suite checks schema 8 and the
explicit schema-7 fixture, old database preservation, recovery ZIP, pinned match
resume, a real player action, reopen and no repeated upgrade.
