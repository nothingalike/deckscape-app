# Distribution prerequisites

Evidence checked November 15, 2026. This record identifies release prerequisites; it does not grant permission or declare a public release ready. Reconcile it with the final shipped source and dependency inventory before distribution.

## Source and ownership

The reference Deckscape checkout identifies its remote as `github.com/nothingalike/deckscape`. Its root has no license file. Confirm the reused source owners and their permission for the intended MIT release before adding that license. The current app deliberately reuses 600 source/presentation/test artifacts from commit `032a0ec6d4d644f0d37b3b586b8d33b5089e2f9d`; every source/local hash matches the provenance manifest and the reference checkout remains unchanged. Local storage/transport adaptations and the command-delivery correction are recorded in that manifest. No source license has been assigned.

The reference README attributes cards and artwork to Neuroscape LLC. Preserve that attribution. The [official Neuroscape site](https://www.neuroscapetcg.com/) identifies Neuroscape LLC and its trademark in the footer; its linked Play Network is the intended catalog source. The inspected pages did not supply an explicit third-party artwork or catalog integration license. This is a bounded observation, not a claim that no separate permission exists.

## Official-source integration

The [Carde terms](https://www.carde.io/terms-and-conditions), displayed as updated September 25, 2024, restrict automated access and systematic database compilation without permission. Their content license addresses personal use and reserves other rights. These provisions are relevant to the planned catalog download, but the reviewed material does not establish which agreement governs this specific Play Network API or whether Neuroscape has separately authorized the integration.

Record the authoritative integration basis covering automated card queries, per-install artwork downloads, persistent offline caching, correction checks, permitted request rates, and distribution of the app. Preserve the evidence and operational limits. Current qualification completes fresh 256-card catalog/artwork sync and offline play on the tested hosts. Technical qualification and integration permission remain separate records. The user is locating the existing agreement and authorized development to continue; provider contact remains outside this work.

## Dependencies and notices

The installed package manifests declare MIT for Electron, React, React DOM, Pixi, electron-builder, and esbuild; Playwright and TypeScript declare Apache-2.0. These are observed declarations, not a completed transitive-license review.

The current lockfile inventory covers 21 production packages with zero missing license declarations/texts. The build includes `THIRD_PARTY_NOTICES.txt`; both actual application archives retain it, and their runtime folders retain `LICENSE.electron.txt` and `LICENSES.chromium.html`. Each archive has 8,299 inventoried files with no detected private operational paths or named credential patterns. The scan scope and limits are recorded in the candidate evidence. Review future dependency changes and include the authorized app-source license before public distribution.

## Release gates

| Gate | Current evidence | Required next action |
| --- | --- | --- |
| Reused Deckscape code license | No root license found in the inspected checkout | Confirm source-owner authority for the files actually reused and record the permitted license. |
| Official-source API and caching | Full technical sync/offline qualification; separate Carde restrictions identified; user locating agreement | Record the applicable integration agreement and allowed download/caching behavior. |
| Official artwork use | Neuroscape attribution; no explicit grant found in inspected pages | Record the rights-holder's basis for the app's intended use. |
| Runtime dependencies | Pinned manifests and generated license-text inventory | Reconcile all shipped dependencies and preserve their notices. |
| Private inputs | Both actual archives inventoried; named credential/path scans have zero findings; source/fixture bundle remains private | Retain the bounded audit and review future artifact changes. |
| Windows signing | Final qualified internal installer reports `NotSigned`; separate signing profile is schema-validated | Supply an authorized identity and verify the exact signed outputs and installed journey. |
| macOS distribution | User chose prepared procedure for later execution; arm64/x64 artifacts and native qualification remain absent | Run both native target procedures and verify signing, notarization and installed behavior. |
| Linux native integration | Automated WSLg X11/Wayland journeys pass; chooser completion/browser/physical Linux remain unqualified | Complete the documented native desktop checks before claiming general Linux readiness. |
| Release delivery | Normal metadata/download targets remain null; no public location selected | Record approved delivery locations and reconcile the release record before publication. |

No provider was contacted, source or artwork published, signing credentials acquired, or hosted service changed during this investigation. The prerequisite record can be complete while these external release gates remain unresolved.

See [the internal candidate and signing procedure](release-candidate.md) for the
exact artifact manifest, prepared configuration and repeatable verification.
