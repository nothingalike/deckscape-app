# Stage supported profile upgrades before opening storage

Run the desktop service through an asynchronous startup gate before its trusted synchronous storage constructor. Read the prior schema and release metadata without changing the source database. Create a consistent complete recovery ZIP, validate a copy, apply the existing supported migration in staging and activate a complete generation. Keep the original database and recovery archive intact across failure or interruption. This extends [the complete-generation decision](0005-activate-complete-profile-generations.md).

Qualify the internal 0.1.0-to-0.2.0 upgrade at schemas 7 and 8. Preserve expanded-v6 rules and saved pins. The supported schema transition adds the original match-directory timestamp. Describe predecessor fixtures and internal artifact hashes explicitly; development builds sharing a version are distinct artifacts and do not establish a published release history.

Preserve unavailable-runtime and unavailable-definition saves as opaque data during an upgrade and let the original match directory explain their compatibility. Public ZIP restore continues to require installed compatible runtime content. Downloads and retained records remain data inputs.

Bound initial service responsiveness, then wait for acknowledged backup or validation work to complete, fail or exit. Yield between validation records. A fixed heartbeat deadline cannot distinguish a legitimate blocking SQLite operation from a failed process; the startup gate must allow the supported migration to finish without misreporting failure.
