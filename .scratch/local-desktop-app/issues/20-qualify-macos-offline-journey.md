# 20: Qualify the complete player journey on macOS

**What to build:** Run the finished offline application and portability checks on the two initial Mac architectures using the shared installed-app journey suite.

**Blocked by:** 17 - Prove the packaged local profile on both Mac architectures; 19 - Qualify the full Windows offline player journey.

**Status:** ready-for-human

**Spec stories:** 2, 53, 61, 63, 64.

- [ ] Run the shared installed-app qualification suite on Apple Silicon and Intel macOS using completed application artifacts rather than the early proof UI.
- [ ] Cover fresh official-source setup, complete app-wide network denial, deckbuilding, curated bot completion, saved-match restart, and upgrade compatibility.
- [ ] Restore the provided Windows-origin profile backup on macOS, verify the decks and pinned match, and export a usable backup for a return or Linux-host check.
- [ ] Verify native file dialogs, artwork paths, rendering/input, data preservation, and the documented OS matrix on each target architecture.
- [ ] Record actual test hosts and any translation, GPU, or signing limits, and keep unsigned development results distinct from general-distribution readiness.
- [ ] Capture reproducible evidence and resolve platform-specific defects within the ticket's scope before claiming that target passed.


## Comments

The user selected "Prepare the procedure; I’ll run it later" for native Mac execution. Windows19 is now qualified; the shared installed suite and full Mac instructions are ready in `docs/installed-qualification.md` and `docs/macos-qualification.md`. Each architecture must run its actual installed artifact, private Windows-origin backup restore, full offline journey, native-dialog/browser checks and return its Mac-origin backup for another-host verification. A matching-architecture internal predecessor is required for native upgrade acceptance; record unavailable predecessors as unqualified. Every Mac acceptance checkbox remains open, including native Intel versus Rosetta distinctions. Ask no repeat Mac-host question; continue independent Linux21 and prepare distribution records with these gates explicit.
