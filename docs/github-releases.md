# Build a GitHub release

The **Build desktop release** workflow builds the existing app on Windows, Apple Silicon Mac, Intel Mac and Ubuntu runners. It attaches a Setup EXE, two DMGs and an AppImage to a draft GitHub Release. Players download those installers from **Releases**; they use no development tools.

## Prepare the repository

1. Review and commit the source, lockfile and `.github/workflows/release.yml`, then push them to `nothingalike/deckscape-app`. Pushing a branch alone does not run the release workflow.
2. Enable GitHub Actions for the repository if needed. The workflow uses the built-in `GITHUB_TOKEN`; a personal access token is unnecessary. The final draft job requests `contents: write`. Organization policy must permit that request.
3. Use a public repository for downloads that people can open without a GitHub account. A private repository's releases remain restricted to people with access. Changing repository visibility is a separate maintainer action.
4. Choose the signing mode below. Existing source/provider/artwork permissions and installed-platform qualification stay in [the distribution record](distribution-prerequisites.md).

## Choose signing mode

Unsigned previews build without signing credentials. The workflow labels their release as a prerelease and includes a visible notice that Windows is unsigned and Mac is not Developer ID signed/notarized. A Mac may block the preview. Use signed installers for the intended nontechnical audience.

For signed builds, add these repository **Actions secrets** using existing authorized identities:

- Windows: `WIN_CSC_LINK` contains the base64 PFX certificate; `WIN_CSC_KEY_PASSWORD` contains its password.
- Mac: `MAC_CSC_LINK` contains the base64 Developer ID Application P12 certificate; `MAC_CSC_KEY_PASSWORD` contains its password. `MAC_CSC_NAME` can select the identity when needed.
- Apple notarization: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.

Set the repository **Actions variable** `RELEASE_SIGNED` to `true` for signed tag builds. Missing required credentials or failed signature/notarization checks fail the signed build. Preview builds discard signing credentials. Certificates and passwords stay outside source control.

Signing uses the existing `electron-builder.distribution.cjs` settings through `electron-builder.github.cjs`; the internal Mac packaging command deliberately remains separate. A code signature does not guarantee that Windows reputation checks show no warning. Successful native hosted builds and the packaged-app smoke check do not replace the complete installed Mac qualification procedure.

## Start the build

1. Set `package.json` to the intended numeric version, such as `0.2.0`, and commit and push that source.
2. Create and push the matching tag, such as `v0.2.0`:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

   Release builds start only when a version tag is pushed. The tag must match the package version exactly.
3. Open **Actions** and wait for **Validate tagged source**, all four builds and **Prepare player download page** to finish.
4. Open the draft under **Releases**. If you made a draft yourself before the workflow, create it against the exact commit SHA with the matching prerelease setting; otherwise let the workflow create it. The workflow preserves a draft's edited description on retries.

The source job runs TypeScript and the complete application test suite. Each native build packages the app and runs the existing desktop smoke check with its actual executable and installer paths. The final job checks that all four expected installers have the same tag, version, source SHA and signing mode and match their recorded sizes and SHA256 hashes. A failed or incomplete build produces no complete release set.

## Publish the downloads

1. Review the draft's four installers and installation instructions after the workflow finishes. Resolve the prerequisites in the distribution record and validate the actual target platforms.
2. Keep unsigned previews marked as prereleases. Use a signed release for routine player installation.
3. Click **Publish release**. Share `https://github.com/nothingalike/deckscape-app/releases` with players. They choose their computer from the download table and open its installer.

The assets also include `INSTALL.txt`, `SHA256SUMS.txt` and `build-manifest.json`. The automatic **Source code** links belong to GitHub; the release instructions tell players to choose the installers. Only those named assets are uploaded. Private source/fixture transfer bundles, cached artwork, profiles, `.local` files and unpacked app directories stay out of the download set. Installer contents still use the existing `dist/**/*` package allowlist and notices.

Retries can replace assets only on a draft for the same source revision and release mode; published releases are preserved. Use a new version tag for a published update or a signing-mode change. Publish after the final job succeeds to keep the draft upload and manual publication separate.

The in-app release-check URLs remain unconfigured. This workflow provides player downloads; it does not add background updates or alter local profiles.

References: [GitHub hosted runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [workflow triggers](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [electron-builder v26 CI](https://www.electron.build/v26/docs/features/github-actions/), and [signing configuration](https://www.electron.build/v26/docs/features/code-signing/).
