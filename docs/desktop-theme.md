# Desktop theme

The desktop shell uses shadcn Button, Badge and Card components. The existing catalog search uses shadcn Input. Source comes from the official `new-york-v4` registry at `https://ui.shadcn.com/r/styles/new-york-v4/{name}.json`, retrieved November 16, 2026. The local changes are relative utility imports and the equivalent `@radix-ui/react-slot` package. The MIT source notice is in `src/renderer/ui/LICENSE.shadcn.txt` and is copied into `dist` for packaging.

`components.json` points future shadcn additions at `@desktop/*`; the existing `@/*` alias continues to resolve hosted modules. Theme colors live in `src/renderer/theme.css`. Cyan marks primary actions and focus. Magenta marks shell decoration and card-preview edges. Text uses system fonts and all assets are local.

`npm run build` compiles Tailwind v4 with PostCSS into `dist/renderer/theme.css`. The main process serves this exact file through the application protocol. Hosted CSS and local shell CSS are in the components layer; generated utilities follow them. Tailwind preflight is omitted to retain the working hosted control and game defaults. Hosted palette aliases map to the shared theme tokens. `--muted` retains its hosted meaning as text; shadcn's muted surface has a separate token.

The shell uses the full window width. At 1100 CSS pixels and below, navigation becomes an accessible icon rail. Catalog grids fit the available width, editor columns stack in smaller windows, and card dialogs scroll inside the viewport. The original editor drawer and game interactions remain intact. The minimum native window is 740 by 600 pixels.

Run `npm run test:theme-ui` after a build and an existing `.local/catalog-live.json` qualification record. The check copies the qualified catalog into a disposable profile, imports a starter, checks seven routes at four sizes, opens card previews, checks keyboard focus and verifies external-link policy without launching a browser. It accepts `NEUROSCAPE_EXE` for a packaged artifact. `--before` captures the earlier unpacked Windows build. Earlier sealed release candidates and the prepared Mac source bundle remain earlier snapshots until qualification is repeated for this revision.

Setup follows the official [shadcn manual installation](https://ui.shadcn.com/docs/installation/manual) and [Tailwind PostCSS installation](https://tailwindcss.com/docs/installation/using-postcss).
