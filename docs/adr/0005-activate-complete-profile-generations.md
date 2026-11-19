# Activate restored profiles through complete data generations

Keep Electron's user-data root and single-instance ownership stable. Restore validated SQLite and artwork into a complete UUID data generation, preserve the previous generation and a recovery backup, then atomically publish the active-generation pointer. This gives interruption an old-or-new boundary while browser caches and lock files stay in place.

Drain the local service before activation and restart through the ordinary desktop lifecycle. A flushed activation journal supports recovery around pointer publication. Existing profiles without a pointer retain their current layout, and backup archives remain independent of the local generation layout. This extends the local ownership decision without changing hosted rules or formats.

Scope browser draft-recovery keys to the active data generation. Legacy profiles keep their original keys. Restoring committed data preserves prior browser recovery copies while keeping them separate from the restored editor state.
