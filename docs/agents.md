# CableOps for agents

Agents (Claude Code, other MCP clients, scripts) can read CableOps through a
personal API token, without a browser session. This first version is
read-only.

## 1. Create a token

1. Sign in at <https://cableops.nexisltd.com> and open **API tokens** in the
   header (`/settings/tokens`).
2. Pick a name, a scope and an expiry, then **Create token**.
3. Copy the `cops_…` token right away. It is shown once; CableOps keeps only
   its SHA-256 hash.

| Scope | Allows |
|-------|--------|
| `read` | MCP tools and CLI: list workspaces, snapshots, analysis, paths |
| `write:import` | Reserved for upcoming write tools; nothing uses it yet |

A token acts as you, capped by its scope. It sees only the workspaces you own
or have joined. Knowing a workspace id is not enough, and anonymous
(ownerless) drafts are not visible. Revoke a token on the same page; it stops
working right away. Tokens cannot create or revoke tokens: that needs a signed-in browser session.

Limits: 120 requests per minute per token (set `CABLEOPS_TOKEN_RATE_LIMIT` on
the server to change it). The counter is kept in memory, per app process.
Responses: `401` for a missing, invalid, revoked or expired token, `403` when
the token lacks the scope, `429` with `Retry-After` when the rate limit is hit.

## 2. MCP endpoint

```
URL:       https://cableops.nexisltd.com/api/mcp
Transport: Streamable HTTP (stateless, JSON responses; POST only)
Auth:      Authorization: Bearer cops_…
```

| Tool | Input | Returns |
|------|-------|---------|
| `list_workspaces` | none | `{ workspaces: [{ id, name, mode, permission, createdAt }] }` |
| `get_snapshot` | `workspaceId` | The same JSON as **Export JSON** in the UI |
| `analyze` | `workspaceId` | Network Insights: `summary`, `issues[]`, `segments[]` |
| `find_path` | `workspaceId`, `fromDevice`, `toDevice` (id or name) | Cable path, L2/L3 reachability both ways, shared segments |

Resources:

- `cableops://schemas/workspace-snapshot.schema.json` is the JSON Schema of a snapshot.
- `cableops://docs/workspace-snapshot-schema.md` is the [snapshot format guide](workspace-snapshot-schema.md).

### Claude Code

```bash
claude mcp add --transport http cableops https://cableops.nexisltd.com/api/mcp \
  --header "Authorization: Bearer $CABLEOPS_TOKEN"
```

### Generic MCP client config

```json
{
  "mcpServers": {
    "cableops": {
      "type": "http",
      "url": "https://cableops.nexisltd.com/api/mcp",
      "headers": { "Authorization": "Bearer ${CABLEOPS_TOKEN}" }
    }
  }
}
```

### Raw HTTP

```bash
curl -s https://cableops.nexisltd.com/api/mcp \
  -H "Authorization: Bearer $CABLEOPS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_workspaces","arguments":{}}}'
```

## 3. CLI

`bin/cableops` is a small Node (≥ 20) script with no dependencies. It calls the
MCP endpoint.

```bash
export CABLEOPS_TOKEN=cops_…                         # required
export CABLEOPS_URL=https://cableops.nexisltd.com    # optional, this is the default   # https only (http allowed for localhost)

bin/cableops workspaces            # id <TAB> permission <TAB> name
bin/cableops workspaces --json
bin/cableops get "Home Lab" > home-lab.json     # snapshot JSON (id or exact name)
bin/cableops analyze <workspace-id>             # Insights JSON
```

To get `cableops` on your PATH, run `pnpm link --global` in the repo. Exit
codes: `0` ok, `1` error, `2` usage or missing token, `3` 401/403, `4` rate
limited. The CLI never prints the token.
