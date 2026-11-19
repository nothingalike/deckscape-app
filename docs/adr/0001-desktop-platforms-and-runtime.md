# Deliver one Electron app for Windows, macOS, and Linux

The user chose Windows, macOS, and Linux to reach desktop players, and excluded phones. Use Electron with a React/Pixi renderer and a local Node service so the existing TypeScript engine and presentation code can be adapted in this separate repository.

Electron is chosen over a browser-only port or Tauri with a packaged Node sidecar because the reference engine already uses Node APIs. Accept the bundled Chromium runtime in exchange for one rendering environment and a direct Node integration path. This is a design choice whose packaging and rendering still need qualification on all three operating systems.

Keep the renderer sandboxed with context isolation and Node integration disabled. Expose specific validated application operations through preload IPC. Put engine work, catalog downloads, and database access in a Node utility process managed by the main process. Serve bundled UI and local artwork through a restricted application protocol; the design does not require a listening HTTP server.

## Sources

- Reference checkout: `package.json`, `lib/simulator/match-service.ts`, and `lib/simulator/bot-executor.ts` establish React/Pixi and Node dependencies.
- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model) and [utility processes](https://www.electronjs.org/docs/latest/api/utility-process).
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) and [security guidance](https://www.electronjs.org/docs/latest/tutorial/security).
- [Tauri Node sidecar alternative](https://v2.tauri.app/learn/sidecar-nodejs/).
