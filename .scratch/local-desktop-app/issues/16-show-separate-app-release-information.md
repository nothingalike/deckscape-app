# 16: Show app releases separately from catalog updates

**What to build:** Display the installed app version and maintainer release information, then let a player open the intended download location in the system browser while retaining control of installation.

**Blocked by:** 01 - Prove a packaged local profile on Windows.

**Status:** complete

**Spec stories:** 58, 59.

- [x] The UI clearly distinguishes app version/release information from card catalog sync state and last successful sync time.
- [x] Release information is supplied through a validated configurable source with controlled regression fixtures; an unconfigured or unreachable location produces an honest actionable state.
- [x] The download action opens the approved external release location in the system browser instead of navigating privileged app content.
- [x] Neither checking release information nor opening a download replaces a running application or modifies the current match.
- [x] Contract and UI checks cover current/new release information, malformed or unavailable metadata, unconfigured delivery, and safe external-link handling; actual public publication remains a separate action.

## Comments

Implemented **App & updates** with the installed app version, explicit release checking and a separate downloaded-card count/last-successful-sync section. Maintainer configuration owns fixed validated HTTPS metadata and download URLs. The internal build deliberately leaves both locations null; no published repository or download location was invented. The screen explains the unconfigured state. See `docs/app-releases.md` and ADR 0003.

`src/app-releases.ts` validates strict versioned metadata, numeric version ordering, a 64 KiB streamed body limit, JSON MIME, no redirects/credentials, and a ten-second request/body timeout. Notes render as plain text. The three named trusted preload operations expose info/check/approved browser opening; renderer arguments and metadata cannot choose a new target. Checks and browser handoff do not install application files, sync cards or write profile data. A listed older release does not offer a downgrade.

TypeScript and 213 current application regressions passed with zero failures/cancellations. All 15 focused release cases passed unsafe/partial configuration, current/new/older versions, malformed/oversized/unavailable/wrong-MIME metadata, retry and shared concurrent requests. The unchanged heavy bot matrix remains qualified by ticket 14's preceding full 286-check snapshot; all 600 source/local hashes match and the read-only reference checkout is unchanged.

The final packaged Windows UI passed unconfigured/current/new presentation, malformed/oversized/wrong-MIME/unavailable/rejected-redirect responses, a real stalled response with timeout, and retry. It queried the real pending match and decks during the stalled check. The exact game, catalog status, app version and main PID were unchanged; notes containing script-like text stayed literal; page errors were empty. The named browser action used only the approved reserved fixture location and privileged navigation never changed. The expanded exact 41-capability desktop boundary, persistence/reopen and second-instance checks passed; the intentional forbidden-file probe returned 404.

Standards review found an owned HTTP-server cleanup edge if Electron close failed; a nested finally now closes the server in either case, and the packaged proof passed again. Standards and Spec have zero remaining findings. The source fixture is explicit loopback HTTP, other HTTP/HTTPS is denied in the shared session, and the system-browser opener is controlled at its OS boundary. This proves the configured handoff contract, not a real published page or physical browser acceptance. Public publication and installed cross-platform qualification remain separate gates. All work remains uncommitted.
