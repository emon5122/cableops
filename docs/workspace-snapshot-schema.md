# Workspace Snapshot Schema

Use this schema when generating CableOps import/export files programmatically.

## Canonical Type Definitions

- Runtime validator + TypeScript types: `src/lib/workspace-snapshot-schema.ts`
- `WorkspaceSnapshot` type export: `src/lib/workspace-snapshot-schema.ts`

## JSON Schema Artifact

- File: `public/schemas/workspace-snapshot.schema.json`
- App URL (when running locally): `/schemas/workspace-snapshot.schema.json`

## Notes

- `version` is currently fixed to `1`.
- `deviceType` accepts canonical values from `DEVICE_TYPES`.
- Alias `"ap"` is accepted and normalized to `"access-point"` during import validation.
- Unknown fields are tolerated, so future extensions do not break imports.

## Minimal Example

```json
{
  "version": 1,
  "exportedAt": "2026-02-21T00:00:00.000Z",
  "workspace": { "name": "Office" },
  "devices": [],
  "interfaces": [],
  "connections": [],
  "routes": [],
  "annotations": []
}
```
