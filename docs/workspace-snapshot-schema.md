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
- `workspaceLinks` is optional (older snapshots have none); see below.

## Cross-workspace links (`workspaceLinks`)

A workspace can be linked to other workspaces (Home, VPS, Office, each
hospital) through explicit port-to-port links. A snapshot carries the links
of its workspace, each seen from that workspace:

| Field | Meaning |
|-------|---------|
| `id` | Link id at export time (informational) |
| `linkType` | `wired`, `wifi`, `vpn`, `tunnel` or `wan` (case-insensitive, default `wired`) |
| `label`, `speed` | Optional free text |
| `local.deviceId`, `local.port` | A device in this snapshot's `devices` and its physical port (1 or higher) |
| `remote.workspaceId`, `remote.deviceId`, `remote.port` | The device and port in the other, existing workspace |
| `remote.workspaceName`, `remote.deviceName` | Names at export time (informational) |

Export only includes links whose far workspace the exporting user can view,
so a snapshot never reveals a workspace its author cannot see.

Import replaces the workspace content, which also drops its current
cross-links. Each snapshot link is then recreated when:

- `local.deviceId` is one of the imported devices,
- the remote device still exists in `remote.workspaceId`,
- the importing user can edit both workspaces (owner, or member in
  collaboration mode), and
- neither port is already used by a connection or another cross-link.

Every other link is skipped; the import result lists `linksImported` and
`linksSkipped` (with the reason for each), and the workspace page shows them.

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

## Example With a Cross-Workspace Link

```json
{
  "version": 1,
  "exportedAt": "2026-11-07T00:00:00.000Z",
  "workspace": { "name": "Home" },
  "devices": [
    {
      "id": "home-router",
      "name": "Home router",
      "deviceType": "managed-router",
      "color": "#3b82f6",
      "portCount": 4,
      "positionX": 100,
      "positionY": 100
    }
  ],
  "interfaces": [],
  "connections": [],
  "routes": [],
  "annotations": [],
  "workspaceLinks": [
    {
      "id": "link-1",
      "linkType": "vpn",
      "label": "wg0",
      "local": { "deviceId": "home-router", "port": 2 },
      "remote": {
        "workspaceId": "<id of the VPS workspace>",
        "workspaceName": "VPS",
        "deviceId": "<id of the VPS device>",
        "deviceName": "VPS",
        "port": 1
      }
    }
  ]
}
```
