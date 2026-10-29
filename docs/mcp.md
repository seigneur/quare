# Medication management over MCP

Quare exposes a remote MCP endpoint at `https://YOUR_WORKER/mcp`. It uses
`@modelcontextprotocol/sdk`'s Web Standard Streamable HTTP transport in stateless,
JSON-response mode, in the existing Worker. No Durable Objects or session store
are required. Clients send JSON-RPC requests by POST with `Content-Type:
application/json`, `Accept: application/json, text/event-stream`, and bearer
authentication. Initialize normally; subsequent requests do not need a session ID.
GET/SSE subscriptions and DELETE/session termination are not supported (405).

## Setup and tokens

Apply the existing D1 migrations and configure the Worker's KV/D1 bindings and
`ADMIN_KEY` secret as described in `CLAUDE.md`. Set `APP_URL` in
`services/backend/wrangler.toml` to the frontend's HTTPS base URL. MCP returns QR
links as `{APP_URL}/scan?id={recordId}`. Medication creation fails before writing
if this setting is missing.

Create a token using the admin API:

```sh
curl -X POST "$API_URL/admin/mcp-tokens" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"my-org","scopes":["read","write"]}'
```

The response contains `token`, `tokenId`, `orgId`, and `scopes`. Save the token
securely: it is returned only at creation. `tokenId` is its SHA-256 hash. KV
`RECORD_SECRETS` stores only `mcp:token:{tokenId}` → `{orgId, scopes}`; the raw
token is never persisted. Organization IDs use letters, digits, underscores,
and hyphens (up to 128 characters). Tokens have no automatic expiration.

Revoke with the hash, not the raw token:

```sh
curl -X DELETE "$API_URL/admin/mcp-tokens" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tokenId":"REPLACE_WITH_TOKEN_ID"}'
```

Both admin operations require `X-Admin-Key`. KV is eventually consistent, so
token creation/revocation can take time to propagate across locations.

The bearer token fixes the organization for every tool. Tools do not accept an
organization override, and IDs from other organizations are not accessible.
`read` permits recipient/due/adherence/refill queries; `write` permits recipient
creation, medication changes, and dose logging. A write-only token cannot query
health data. All ten tools are discoverable, but calls require the corresponding
scope. Use the narrowest scopes necessary. Keep tokens out of URLs, prompts,
source control, and logs; use HTTPS in production.

## Claude client

For Claude Code, register a remote Streamable HTTP server. Set
`MCP_AUTHORIZATION` securely in your shell to the authorization value: the
`Bearer` scheme, one space, and your token.

```sh
claude mcp add --transport http quare https://YOUR_WORKER/mcp \
  --header "Authorization: ${MCP_AUTHORIZATION}"
```

Equivalent MCP client configuration for clients supporting remote HTTP and custom
headers:

```json
{
  "mcpServers": {
    "quare": {
      "type": "http",
      "url": "https://YOUR_WORKER/mcp",
      "headers": {
        "Authorization": "${MCP_AUTHORIZATION}"
      }
    }
  }
}
```

The JSON example uses environment-variable expansion supported by Claude Code;
for other clients use their secret-injection mechanism. Do not commit a
configuration containing a real token. Claude clients that only
support OAuth-based remote connectors cannot use these static bearer credentials
directly; use a client supporting custom authorization headers.

## Tools

Every successful call returns a short text summary, JSON text, and
`structuredContent.data` containing the same JSON value. Validation and tool
failures return MCP error results; authentication failures return HTTP 401.

| Tool | Scope | Inputs / result |
|------|-------|-----------------|
| `list_recipients` | read | No arguments; returns recipients. |
| `add_recipient` | write | `name`, optional `dateOfBirth` (`YYYY-MM-DD`), `notes`; returns recipient with generated `id`. |
| `add_medications` | write | `medications` array (1–100); returns `recordId`, `name`, `scanUrl` for each medication. |
| `update_medication` | write | `recordId`, `changes` (any medication input fields); omitted fields and stock are preserved. |
| `deactivate_medication` | write | `recordId`; sets `active=false`, removing future pending doses. |
| `set_routine` | write | `recordId`, replacement `schedule`, optional `timezone`. |
| `list_due` | read | `windowHours` (default 12, >0 to 168), optional `recipientId`; pending doses in the past/upcoming window. |
| `log_dose` | write | `doseId`, or `medicationName` + ISO `time` + optional `recipientId`; `status`, optional `notes`. Always records source `mcp`. |
| `get_adherence` | read | `days` (1–366, default 30), optional `recipientId`; taken/missed counts and `taken/(taken+missed)`, or null without observations. |
| `refill_status` | read | Optional `recipientId`; medications whose stock quantity is at or below their configured `refillThreshold`. |

Medication inputs require `name`, `dosage`, `form`, `schedule`, IANA `timezone`,
and an existing `recipientId` in the token's organization. Optional fields:
`instructions`, `stock: {quantity, unit, refillThreshold?}`, `color`, `startDate`,
`endDate`, `active`. Stock numbers and thresholds must be nonnegative.
Defaults are `color="blue"`, `active=true`, and today's date in the medication's
timezone. Dates are inclusive local dates. There is no `icon` field.

Schedule examples:

```json
{"type":"daily","times":["08:00","20:00"]}
```

```json
{"type":"weekdays","times":["09:00"],"days":[1,3,5]}
```

```json
{"type":"interval","times":["08:00"],"intervalHours":8}
```

Days run from Sunday (0) to Saturday (6). Times use local `HH:mm`. Interval
schedules use elapsed hours from the start date's first schedule time.
MCP accepts intervals of 1–8760 hours and at most 24 times per schedule.
The existing scheduler handles daylight-saving changes. Medication edits reuse
the REST stock reconciliation, schedule refresh, and Merkle batch-queue logic.
Medication snapshots remain private hashed commitments; generic assets are unchanged.

`log_dose` accepts `pending`, `taken`, `missed`, `skipped`, or `rescheduled`.
By name, it selects the closest *pending* occurrence within 24 hours of `time`;
ambiguous medication names or equally close occurrences require a dose ID.
Dose materialization covers up to the next seven days; past doses must already
exist. Logging by ID supports corrections and repeated confirmations without
double-decrementing stock. A name-based retry can select a different pending
dose, so use the returned dose ID for retries.

Bulk inputs and recipient references are checked before writes. KV/D1 do not
provide a cross-store transaction: an infrastructure failure can leave partial
progress. Before retrying a failed bulk add, inspect the authenticated medication
REST list (`GET /api/medications/:orgId`) to avoid duplicates.

## Example tool call

After adding a recipient, call `add_medications` with its returned ID:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "add_medications",
    "arguments": {
      "medications": [{
        "name": "Example medication",
        "dosage": "10 mg",
        "form": "tablet",
        "instructions": "Follow the prescribed directions",
        "recipientId": "REPLACE_WITH_RECIPIENT_ID",
        "timezone": "Europe/Paris",
        "schedule": {"type":"daily","times":["08:00"]},
        "stock": {"quantity":28,"unit":"tablets","refillThreshold":7}
      }]
    }
  }
}
```

## Sample prompts

- “List the care recipients, then add these five prescribed medications for the
  selected recipient. Use Europe/Paris time and return their QR links.”
- “Replace this medication's routine with 08:00 and 20:00 daily.”
- “Show pending doses for the next twelve hours for this recipient.”
- “Mark dose ID … taken, with the note ‘after breakfast’.”
- “What was this recipient's adherence over the last thirty days?”
- “Which medications have reached their refill threshold?”

Confirm medication details against the prescription; these tools manage records,
not medical advice.
