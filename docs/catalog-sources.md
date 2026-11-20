# Catalog sources and backup sync

**Update cards** first requests the official Neuroscape catalog. If that source fails, returns an empty or invalid catalog, or cannot supply valid artwork, the app restarts the download using the public [Deckscape card page](https://www.deckscape.run/cards). The user approved this backup on November 20, 2026.

A successful backup sync displays **Using the Deckscape backup catalog because the official source is unavailable.** This message survives reopening the app. The next update tries the official source again. Deckscape supplies its stored copy of the catalog, which may be older than the official feed.

## Preserve a complete snapshot

Each attempt uses one source for its card records and artwork. A failed official attempt restarts from the complete backup; it does not combine partial official pages with backup pages or substitute backup images into changed official records.

Both sources use the existing importer for pagination, unique IDs, normalization and the Basic RAM correction. Catalog activation remains transactional. If both sources fail, the working catalog stays active. Cancellation and local storage errors stop the update without starting another source. Saved matches keep their pinned content.

## Read the public backup

The hosted card page already sends its complete `cards` array to the catalog component. The desktop adapter reads the page's serialized JSON data, checks the array against the rendered catalog count, and uses each card's original `raw` record. It does not execute page scripts or query the hosted database. No hosted-site changes or credentials are required.

The adapter rejects incomplete pages, duplicate or mismatched IDs, unsupported serialized references, and changed artwork paths. A changed page format causes a failed update rather than a partial import. A dedicated JSON endpoint could replace this page adapter in future hosted-site work.

The page download is limited to 4 MiB and 10,000 cards. Artwork downloads are limited to 10 MiB per image and retain the existing image-type checks. The adapter discovers the public artwork origin from images on the Deckscape page that match the validated catalog's card-ID/hash paths. It accepts one HTTPS Supabase public storage origin and authorizes only the exact image URLs belonging to that snapshot. Downloaded bytes must match their SHA256 hashes. Other origins, buckets, paths and redirects are rejected. The app contains no deployment-specific project reference or access key.

The shared request policy keeps bounded retries, cancellation and timeouts. Downloaded images remain local after synchronization, including when the network is unavailable.

## Verify the behavior

```sh
npm run typecheck
npx tsx --test tests/catalog-fallback.test.ts tests/catalog.test.ts tests/catalog-recovery.test.ts
```

The regressions cover backup parsing and artwork hashes, primary empty/network/partial/artwork failures, recovery to the official source, both-source failure, cancellation, and local disk failure. Native desktop qualification is recorded in the catalog recovery ticket.
