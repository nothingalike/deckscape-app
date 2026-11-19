# Neon shadcn desktop theme

Status: complete
Type: task

## Acceptance criteria

- [x] Install actual shadcn components and a reproducible Tailwind build.
- [x] Apply the dark neon theme across navigation and existing screens, with accessible focus and text.
- [x] Fit minimum, typical and large desktop windows, including the editor and card dialogs.
- [x] Remove eBay purchase controls and the external-link allowance.
- [x] Preserve catalog, deck import/export and solo game behavior with relevant UI checks.
- [x] Provide screenshots and an interactive review; leave all changes uncommitted.

## Evidence and decisions

The current shell adds broad `header`, `main`, `button`, `h1` and `footer` rules on top of the copied hosted stylesheet. These affect nested editor controls. The hosted UI itself uses plain CSS, so add Tailwind specifically for shadcn and keep existing presentation in a CSS layer. The card preview is the sole consumer of the eBay purchase component; `src/main.ts` also permits that hostname.

## Comments

2026-11-16: User authorized shadcn, cyberpunk neons, responsive desktop layout and eBay removal. Functionality and local profile contracts remain the hosted baseline. Prior release qualification describes the earlier sealed artifact, not this new UI revision.

## Implementation and verification

- Added official shadcn Button, Badge, Card and Input source, shared class utilities, pinned dependencies, `components.json`, desktop alias, PostCSS/Tailwind build and packaged MIT source notice. Existing hosted stylesheet stays in the components layer and retains its defaults.
- Replaced broad shell styling with scoped navigation/header/footer rules, graphite surfaces, cyan primary actions, magenta accents, system-font fallbacks and keyboard focus. Sidebar becomes an accessible icon rail, catalog grids adapt, editor columns stack, drawers stay beside the rail and dialogs fit the viewport.
- Removed the card-preview purchase action and eBay from the external-link allowlist. The compatibility adapter renders nothing. The actual renderer/main boundary test confirms eBay is rejected and an official link still works, with browser launch intercepted.
- Visual inspection caught a 650px minimum in the copied completed-game canvas. Removing that presentation minimum lets its existing ResizeObserver fit the available panel. The active game and mechanics remain unchanged. All four copied-file adaptations are recorded in `docs/reuse-manifest.json`; all 600 local/reference hashes and the unchanged pinned source checkout pass audit.
- Typecheck/build passed. Current regression run: 214 passed, 0 failed, one expected Linux-only skip. The unchanged two heavy bot matrix files were excluded.
- Original catalog/editor, JSON/text import, clipboard/PNG export, starter handling and solo admission smoke checks passed in a development instance. Final packaged game UI reached a health outcome with HTTP/HTTPS denied; packaged release-screen states/retry/boundary checks passed.
- Separate packaged Windows app: startup, sandbox/context isolation, exact preload capabilities, single-instance handling, deck persistence and reopen passed. Its 404 console line is the deliberate forbidden-profile-resource assertion, not a missing theme resource.
- `npm run test:theme-ui` with `NEUROSCAPE_EXE` pointing to the preview passed seven routes at actual outer sizes 740x600, 1000x700, 1280x860 and 1920x1080, plus expanded filters, import dialogs, card previews, keyboard skip/focus and link policy. Four actual completed-game canvas size checks passed without horizontal overflow. A test-label mismatch was corrected to the existing `Import Deck` label before the final passing run.
- New unsigned Windows unpacked preview: `release/neon-preview/win-unpacked/Neuroscape Local.exe`. The running player app and profile were preserved. Earlier sealed artifacts and the Mac bundle were preserved as prior source snapshots. This theme revision has not been executed on native Mac/Linux.
- [Interactive review](http://localhost:4321/f/neuroscape-app/general/reviews/2026-11-16-0600-neon-desktop-theme) contains screenshots and source links. Everything remains uncommitted.
