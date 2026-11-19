# 02: Establish source and provider distribution prerequisites

**What to build:** Produce a reviewable, evidence-linked distribution prerequisite record for the intended reused source, official catalog integration, artwork use, and dependency notices, so implementation can distinguish verified permissions from unresolved release work.

**Blocked by:** None (can start immediately).

**Status:** complete

**Spec stories:** 65, 66, 67.

- [x] Inspect the read-only reference source and available authoritative terms for reused code, attribution, official API access, caching, downloads, and artwork use.
- [x] Record each permission or ownership claim with its supporting source and date; explicitly identify missing evidence instead of inferring permission from public availability.
- [x] Identify the code and dependency notice work required before adopting the intended MIT license; adding a license remains conditional on authority to do so.
- [x] Record whether public-source evidence resolves each prerequisite or whether a specific owner/provider action remains necessary; unresolved items stay gates on distribution.
- [x] Preserve source attribution and identify private operational material that must stay outside public artifacts.
- [x] Perform this investigation without contacting a provider, publishing source or artwork, changing the reference checkout, or acquiring credentials. A complete prerequisite record may contain unresolved gates.


## Comments

2026-11-15: Completed the dated source/provider/dependency prerequisite record in the repository's distribution documentation. Verified the reference remote and absence of a root source license, its Neuroscape attribution, the official Neuroscape footer/gallery, and Carde's published terms. The applicability of Carde's automated-collection restrictions to this specific integration and any separate owner/provider grant remain unresolved; public distribution stays gated.

Generated and inspected notices for all 15 installed production packages: 15 license texts, zero missing declarations/texts in the current tree. The build includes the notice file, and packaged Electron retains its runtime notices. Optional-package handling is implemented but this dependency tree did not exercise absent optional production packages.

Standards review found an incomplete artifact-content description; corrected it to include automatically packaged production dependencies and the Electron runtime. Spec review found no remaining gaps. Source licensing, official API/caching/artwork use, signing, and final artifact inspection remain release gates, as this ticket explicitly permits. No source license was assigned and no provider contact, publication, credential acquisition, or reference-checkout mutation occurred.
