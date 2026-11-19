# 21: Qualify the complete player journey on Linux

**What to build:** Run the finished offline application and cross-OS backup checks on the selected Linux x64 distribution/display-server matrix using the shared journey suite.

**Blocked by:** 18 - Prove the packaged local profile on Linux; 19 - Qualify the full Windows offline player journey.

**Status:** complete

**Spec stories:** 3, 53, 61, 63, 64.

- [x] Run the shared installed-app qualification suite against completed Linux artifacts on the documented distribution and display-server matrix.
- [x] Cover fresh official-source setup, complete app-wide network denial, deckbuilding, curated bot completion, saved-match restart, and upgrade compatibility.
- [x] Restore a backup from another supported OS, verify deck and pinned-match behavior, and validate Linux-origin backup portability on another available supported host.
- [x] Exercise X11/Wayland rendering and input as selected, file dialogs, path and case handling, single-instance behavior, and local data preservation.
- [x] Record exact host/distribution versions, GPU limits, runtime prerequisites, and every failed or excluded combination rather than claiming generic Linux coverage.
- [x] Preserve repeatable evidence and resolve platform-specific defects in scope before marking a tested combination passed.



## Comments

The first full X11 AppImage run is preserved as failure in `.local/linux-journeys/x11/4073f1a0-c03d-4b51-9423-8084a8044fa3/qualification-linux-bd29c619-dbb9-49a7-9498-bbd48253fba6/qualification.json`. Fresh256-card official sync, offline editor/interchange/roster, full bot health outcome, resume, owned crash recovery, content retention, backup and restore passed before the actual native-relaunch step failed. The restored data remained intact.

A bounded experiment established that Electron's native relaunch returnedtrue but did not reopen this AppImage on the tested WSLg host, including an explicit permanent AppImage target and fresh debug ports. A separate detached handoff that waits for the old PID to exit then execs the same AppImage passed with a new main PID, restored generation and exact original match (`.local/linux-appimage-fresh-port-shell-probe.log`). The production Linux-packaged-APPIMAGE-only branch now uses that handoff in `src/linux-relaunch.ts`; executable/arguments are literal positional shell parameters, waiting is bounded, and Windows/Mac retain native relaunch. Scheduling failure gives a manual-reopen message with the committed restored profile preserved.

The rebuilt production AppImage passed the direct native path (`.local/linux-production-native-relaunch.json`: previous43519, next43666, new generation and exact match) and a real process regression proving old-owner exit ordering and literal shell-like arguments (1/1). TypeScript passed. Both review axes have zero remaining findings. Full final X11/Wayland and final-source Windows qualification are running before acceptance.

The native proof now waits for inspector bootstrap and validates launcher, mounted runtime/resources, isolated profile and unique run token before control. Fresh AppImage successor debug ports avoid an observed inherited-debug-socket bind98 collision; only those diagnostic args are mapped at the actual spawn boundary. The OS handoff, files, restore and match run for real. Ordinary players have no debug ports. Native chooser completion and real Linux browser remain excluded host combinations, with controlled OS-boundary tests recorded separately. A short persistent private temporary root avoids WSL idle eviction and Unix-domain socket length limits in maintainer proofs.

Final bounded acceptance: X11 run0bff7c63-1f56-4a17-a1e1-f055cf3cfe43 and Wayland rund140e7ae-9ad4-4926-9114-1e755ebc57bb both have success=true in `.local/linux-journeys/<display>/latest.json`. Each passes30/30 shared installed steps and215/215 current tests with zero skips/failures on AppImage SHA256e4bb56e4221ad6708acb074f3cfc8a45d65ef233b5dfd8532e0f6e9262f95e5d. Both also pass Windows-origin backup input/reopen, real native restore/relaunch with successor sandbox/isolation/no-Node, and schema8/schema7 upgrade fixtures with old database/records/pins/recovery ZIP preserved. The predecessor uses the exact preserved platform-neutral0.1.0 archive in native Linux Electron45.3.2, explicitly reconstructed as an internal pre-release fixture; predecessor display isX11 and current display is independently X11/Wayland.

The Linux X11-origin export was restored in a temporary installed final Windows artifact, comparing all decks and the pinned original game, accepting a real player action and reopening the commit. `.local/linux-to-windows-portability.json` and `.local/linux-to-windows-installed-portability.log` record the proof and owned uninstaller exit0. No real user profile was used. Two-way portability is qualified for these exact hosts/artifacts.

A later controlled restore regression initially still intercepted only app.relaunch; it was adapted to the exact Linux shell handoff boundary. Its isolated check passed before the final all-green full runs. The actual native handoff remains a separate real-process proof. Earlier failure directories retain success=false. Both final application archives have8299 inspected files, retained notices and zero detected private-path/named credential-pattern findings; this bounded scan does not grant source/artwork permissions or prove absence of every possible secret. All600 source/local provenance hashes still match and reference HEAD is unchanged.

Standards: corrected nonzero uninstaller failure propagation in the Windows return harness; zero remaining findings. Spec: zero findings. Linux coverage remains Ubuntu22.04.3 WSLg1.0.79, glibc2.35, kernel6.18.58.1-microsoft-standard-WSL2, virtual graphics. Native chooser completion, real Linux browser handoff, physical Linux/GNOME/KDE/other distributions remain unqualified, explicitly excluded from the accepted automated combinations. All work is uncommitted. Review: http://localhost:4321/f/neuroscape-app/general/reviews/2026-11-15-2320-linux-offline-player-journey . Mac17/20 stay ready-for-human; prepare22 with these and permission/signing gates open.
