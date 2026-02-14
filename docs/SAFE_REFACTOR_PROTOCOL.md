# Safe Refactor Protocol

This document defines the mandatory process for refactoring large frontend/backend files without breaking the monolith.

## 1. Backups Before Large Edits

Use `scripts/safe_backup.ps1` before touching large files.

Example:

```powershell
.\scripts\safe_backup.ps1 -Label "phase2_backend" -Files `
  "backend/server.js","backend/core/VotingManager.js","frontend/app.js"
```

Rules:
- Every large-file edit requires a new backup version.
- Backups must include a `manifest.json`.
- Never overwrite or delete previous backup versions.

## 2. Change Discipline

- Use small, reversible commits/patches.
- Keep behavior stable first; optimize structure second.
- Avoid refactor + feature changes in the same patch unless unavoidable.

## 3. Validation Gate (Mandatory)

Run:

```powershell
.\scripts\verify_refactor.ps1
```

The gate includes:
- syntax checks
- backend test suite
- frontend visual contract smoke test

## 4. Rollback Procedure

If a regression appears:
1. Identify last known-good backup folder under `backend/backup_versions/`.
2. Restore only affected files.
3. Re-run `.\scripts\verify_refactor.ps1`.

## 5. Definition of Done

A refactor phase is done only when:
- backups were created and documented
- verification gate passes
- behavior parity is preserved
- architecture docs are updated
