# App-release information

**App & updates** shows the installed app version and the latest validated maintainer release information. Its separate **Downloaded cards** section shows local catalog count and last successful card update. App releases supply executable rules and bot support; card sync refreshes catalog data and artwork.

Checking a release is an explicit action. Opening its download page uses the system browser. The app keeps running and the player chooses when to install another build. Release checks and browser handoff do not write the profile, update cards or change a saved match.

## Configure a delivery source

This internal build intentionally has no published delivery location. `src/data/app-releases.json` contains two null values, and the screen explains the unconfigured state. Set both values together in a reviewed maintainer build when a real delivery location exists:

```json
{
  "metadataUrl": "https://updates.example.test/neuroscape.json",
  "downloadUrl": "https://downloads.example.test/neuroscape"
}
```

These reserved example URLs are placeholders. Use an actual approved location for a distributed build. Both configured URLs require HTTPS, with no credentials, query, fragment or nonstandard port. The metadata cannot supply or change the approved browser destination.

Serve UTF-8 `application/json` with this versioned format:

```json
{
  "format": "neuroscape-app-release",
  "version": 1,
  "release": {
    "version": "0.2.1",
    "publishedAt": "2026-11-15T12:00:00.000Z",
    "notes": "Describe the qualified release and its compatibility boundary."
  }
}
```

The schema rejects extra fields. Versions use three nonnegative numeric components; each component has at most six digits. Notes are plain text, limited to 8,000 characters. The full response is limited to 64 KiB, redirects are rejected, credentials are omitted and the request/body have a ten-second timeout. Concurrent checks share one request. Invalid or unreachable information disables download opening and supports an explicit retry. A listed release older than the installed version is explained without offering a downgrade.

Only the configured download URL reaches the named browser operation. Renderer arguments, release-note markup and metadata cannot choose another target. Publication, provider permission and signing remain separate distribution gates.

## Verify the screen

`npm run test:release-ui` reuses the existing pending-game preparation and runs the packaged Windows screen against an explicit loopback release fixture. It covers unconfigured, current and newer information; malformed/oversized responses; wrong MIME; unavailable/redirecting sources; a stalled response and retry. It verifies plain-text notes, the approved system-browser boundary and unchanged match, catalog, app version and main process.

The fixture variable `NEUROSCAPE_RELEASE_FIXTURE_ORIGIN` accepts only an explicit `http://127.0.0.1:<port>/` origin. It supplies the local metadata route and a reserved `.test` browser target. The harness controls that browser opener at its OS boundary and denies other HTTP/HTTPS in the shared application session. Profile data, cached artwork and IPC are real; no real maintainer release or physical browser acceptance is implied. Ordinary builds use their reviewed configuration and leave this variable unset.
