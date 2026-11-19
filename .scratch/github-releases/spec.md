# GitHub desktop release builds

Build the existing desktop app on GitHub and collect ordinary player downloads on one GitHub Release page: Windows x64 Setup EXE, Apple Silicon DMG, Intel Mac DMG and Linux x64 AppImage. Players install the app without Node, Git or build tools. Release notes explain which download to choose and how to open it.

Start only when a version tag matching `package.json` is pushed. Test the source, build on native hosted runners and collect the complete platform set before creating a draft release. The maintainer publishes the reviewed draft. Unsigned previews work without signing secrets; the repository variable `RELEASE_SIGNED=true` selects the prepared signed distribution settings and fails when credentials or signature checks fail.

Keep application functionality, current player data and sealed local candidates unchanged. Record that a hosted build is packaging evidence, separate from native installed-user acceptance and the existing source/provider/artwork prerequisites. Implementation stays local and uncommitted until the user chooses to commit and push.
