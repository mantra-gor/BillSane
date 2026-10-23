# WhatsApp messaging via Infobip — invoices + marketing campaigns

## Context

BillSane can create invoices but has no way to get them to the customer other than
the counter printer. There is also no outbound marketing channel at all. This adds
both, over WhatsApp, through Infobip:

1. **Invoice delivery** — a "Send via WhatsApp" button on an invoice sends the
   customer a PDF of that invoice.
2. **Marketing campaigns** — pick a Meta-approved WhatsApp template, fill its
   placeholders, choose recipients from the customer directory, send, and watch
   per-recipient delivery status.

Both are online-only features bolted onto an offline-first app. Nothing here may
change that: SQLite stays the source of truth, launch still never blocks on the
network, and an unconfigured/offline install must behave exactly as it does today.

### Verified API facts (from `https://api.infobip.com/platform/1/openapi/whatsapp`)

These were checked against the live spec, not assumed:

- Auth header is `Authorization: App <api-key>`. Base URL is per-account
  (`https://<subdomain>.api.infobip.com`), so it must be a configurable field.
- `POST /whatsapp/1/message/template` — **bulk**: body is
  `{ messages: [{ from, to, content: { templateName, language, templateData:
  { body: { placeholders: [...] } } } }], bulkId }`. One call, many recipients.
- `POST /whatsapp/1/message/document` — **single** recipient:
  `{ from, to, content: { mediaUrl, filename, caption } }`.
- **`content.mediaUrl` is required and must be a public `https://` URL.** There is
  no outbound media-upload endpoint — Infobip fetches the file from us. This is why
  S3 exists in this plan at all.
- `GET /whatsapp/2/senders/{sender}/templates` — the approved-template list.
- `GET /messages-api/1/reports?channel=WHATSAPP&bulkId=…` — the pull-based delivery
  report endpoint (there is no WhatsApp-specific one).

### Decisions already made

- Invoice sending is a **manual per-invoice button** (not automatic on save, no bulk
  resend in v1), and it sends a **PDF attachment**.
- Marketing is **template-based** (Meta rejects freeform business-initiated messages
  outside the 24h service window), with a **locally cached reusable template library**.
- Delivery status is tracked by **polling**, not webhooks — a desktop app has no
  public callback URL.
- **Scheduling is deferred.** Campaigns send immediately; the schema reserves a
  `scheduledAt` column so adding it later needs no migration.
- Credentials live in a **new Settings tab**, encrypted at rest, mirroring the
  Database tab exactly.
- **Desktop-direct with S3**, chosen over a relay backend. Two caveats accepted
  knowingly, recorded here because they are real:
  - Both the Infobip key and the S3 secret sit decrypted in the main process on every
    machine. Mitigate by scoping both credentials as narrowly as the providers allow
    (Infobip API key limited to WhatsApp send + reports; IAM user limited to
    `PutObject` on the one bucket prefix — no `s3:*`, no console access).
  - `GET /messages-api/1/reports` is a **drain-once queue** — each call returns
    reports and they are then gone. If the same Infobip account is used from two
    BillSane installs, whichever polls first consumes the other's reports and the
    other machine's rows sit stuck at `sent`. Acceptable for single-machine shops;
    it is the main thing that would push toward a relay later.

---

## 1. Data model

Three new entities in `src/electron/db/entities/`, registered in that folder's
`index.ts` `entities` array. None are `eager` — they are read via query-builder from
domain modules, like `Customer`/`Invoice` already are in `domain/customers.ts`.

**`WhatsappTemplate`** — local cache of approved templates.
`id`, `name` + `language` (unique together), `category`, `status`, `bodyText`,
`headerType`/`headerText`/`footerText`, `buttonsJson`, `variableCount` (parsed from
`{{n}}` at sync time — drives the composer form), `rawJson`, `syncedAt`,
`createdAt`, `updatedAt`.
`buttonsJson`/`rawJson` are `text`, not `jsonb` — the schema must run on sqlite and
postgres both.

**`Campaign`**
`id`, `name`, `templateId` → `WhatsappTemplate` **`ON DELETE SET NULL`**, plus
snapshot columns `templateName`/`templateLanguage`/`templateBodyText`,
`variableValues` (JSON-encoded string array), `status`
(`draft|sending|completed|failed`), `totalRecipients`, `scheduledAt` (nullable,
always NULL in v1), `sentAt`, `completedAt`, `createdBy` → `app_user`
**`ON DELETE SET NULL`**, `createdAt`.

The snapshot columns are the same reasoning as `InvoiceLineItem` snapshotting
`itemName`/`rate`: re-syncing or editing a template must never rewrite what a past
campaign actually sent.

**`WhatsappMessage`** — one unified per-recipient log for *both* features, with a
`kind` discriminator (`'invoice' | 'campaign'`). Unified deliberately: both are a
phone + an Infobip `messageId` + a status the poller advances, so this gives one
poller query and one status vocabulary instead of two implementations to keep in sync.

`id`, `kind`, `invoiceId` → `Invoice` **`ON DELETE CASCADE`**, `campaignId` →
`Campaign` **`ON DELETE CASCADE`**, `customerId` → `Customer` **`ON DELETE SET
NULL`** with `customerName`/`phone` snapshots (the nullable-FK-plus-snapshot pattern
`InvoiceLineItem.productId` already uses), `bulkId`, `messageId`, `status`
(`queued|sent|delivered|read|failed`), `providerStatus`/`providerStatusGroup`,
`errorMessage`, `mediaUrl`, `sentAt`/`deliveredAt`/`readAt`, `statusUpdatedAt`,
`lastPolledAt`, `createdBy`, `createdAt`.

Indexes on `messageId`, `bulkId`, `status`, `invoiceId`, `campaignId`. The "exactly
one of `invoiceId`/`campaignId` is set" invariant is enforced in the domain layer,
matching how this repo does app-level invariants (`assertAdminRemains`) rather than
DB triggers.

**Migration**: one file, `src/electron/db/migrations/1786000000000-Messaging.ts`,
following `1785000000000-AuthRbac.ts`'s shape — `Table`/`TableForeignKey`/
`TableIndex` builders (never raw SQL, per CLAUDE.md, because hybrid runs this on
postgres too), all three tables in one file, `down()` dropping in reverse order.

### Credentials — not a DB entity

New `src/electron/domain/messagingConfigStore.ts`, mirroring
`src/electron/db/configStore.ts` exactly but writing its own
`messaging-config.json` in `getUserDataPath()` at mode `0o600`:

- Plain: `baseUrl`, `senderNumber`, `s3Endpoint`, `s3Region`, `s3Bucket`,
  `s3AccessKeyId`, `s3UrlExpirySeconds`
- Encrypted (base64 `safeStorage` output): `encryptedApiKey`,
  `encryptedS3SecretKey`
- Redacted shape to the renderer: `hasStoredApiKey` / `hasStoredS3SecretKey`
  booleans, never the secrets
- `getDecryptedMessagingConfig()` is main-process-only, called from
  `infobipClient.ts` / `mediaStorage.ts`
- Blank secret on save = keep the stored value (identical to how `db-config.json`
  handles the Postgres password, since the renderer never holds the real secret)

---

## 2. Permissions (`src/electron/domain/permissions.ts`)

Added to the existing **Settings** group:
- `settings:messaging` — "Manage WhatsApp settings" — Infobip credentials, sender
  number, media storage and connection test.

New **Messaging** group:
- `whatsapp:sendInvoice` — send an invoice PDF to the customer over WhatsApp.
- `marketing:view` — see campaigns, recipients and delivery status.
- `marketing:manage` — sync templates, compose and send campaigns.

Two campaign permissions rather than three follows the catalog's existing
`view`/`manage` convention (`customer:`, `inventory:`) — there is no separate
`invoice:print` today either. Adding them to the catalog is all that's needed; the
Roles UI renders `getPermissionCatalog()` verbatim. Leave them ungranted on the
seeded non-admin roles (these cost real money per message); the `Administrator`
system role picks them up automatically via `isSystem` → `ALL_PERMISSIONS`.

---

## 3. Main-process domain modules (`src/electron/domain/`)

**`phone.ts`** — `normalizeE164(raw, defaultCc = "91"): string | null`. Strips
spaces/dashes/parens/leading `+` or `0`; a bare 10-digit number is treated as Indian
and gets `91` prepended (India-first, per CLAUDE.md). Returns `null` rather than
throwing, so one bad number fails one recipient instead of the whole campaign.
Existing `Customer.phone` values are **not** assumed clean and are **not**
backfilled — normalize at send time, every time.

**`invoicePdf.ts`** — `renderInvoicePdf(invoiceId): Promise<Buffer>`.

Reuses `src/invoice-templates/Invoice.tsx` at its existing `invoice/view/:id` route;
no second invoice renderer is built. This works because the session lives in
main-process memory (`domain/session.ts`), not per-window, so a hidden window shares
the signed-in session with no extra auth plumbing.

1. `new BrowserWindow({ show: false, webPreferences: { preload: getPreloadPath() } })`
2. dev → `loadURL("http://localhost:5123/#/invoice/view/" + id)`;
   prod → `loadFile(getUIPath(), { hash: "/invoice/view/" + id })`
3. Wait for actual paint, not just `did-finish-load` — React still has to fetch the
   invoice. Poll `webContents.executeJavaScript(...)` for a DOM marker (line-item
   rows present) with backoff and an overall timeout that rejects with a clear
   message. If that proves flaky on a real machine, fall back to a one-way
   `ipcRenderer.send("print:ready")` from `Invoice.tsx` — that would be the one
   genuinely new preload primitive here, since everything in `preload.cts` today is
   invoke-based.
4. `printToPDF({ printBackground: true, pageSize: "A4", preferCSSPageSize: true })`.
   The existing `.hideContent` print rule in `src/react/index.css` already hides the
   on-screen action bar, because `printToPDF` goes through the same `@media print`
   pipeline as `useReactToPrint` — **no print-only route or new CSS needed.**
5. `destroy()` in a `finally` so the window never leaks on a failure path.

Plain `show: false`, not `webPreferences.offscreen` — offscreen adds paint-event
handling for no benefit here.

**`mediaStorage.ts`** — `uploadInvoicePdf(buffer, filename): Promise<string>`.
Uploads to S3 under a keyed prefix (`invoices/<invoiceId>-<timestamp>.pdf`) and
returns a **presigned GET URL** with a short expiry (default 15 min, configurable).

- Add `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. This is the first real
  dependency added for this feature and it is worth it — hand-rolling SigV4 for a
  signed `PutObject` is subtle, security-sensitive code with no upside.
- S3-compatible endpoint config (not hardcoded AWS) so Cloudflare R2, Backblaze B2
  or MinIO all work; R2 in particular has no egress fees, which suits this.
- A short expiry is safe: WhatsApp downloads the media and re-hosts it on Meta's
  servers, so only Infobip's one fetch needs a live URL. The customer's copy persists
  regardless.
- The bucket must stay **private** — the presigned URL is the only access path.
- Objects are **not** deleted after send (Infobip may fetch asynchronously). Document
  an S3 lifecycle rule (expire `invoices/` after ~7 days) in the settings UI hint
  rather than building a cleanup job.

**`infobipClient.ts`** — thin `fetch` wrapper (Electron 43 / Node 22 has global
`fetch`; no HTTP dependency needed), `AbortController` timeouts, shared
`Authorization: App <key>` header builder. Functions map 1:1 to the verified
endpoints: `testConnection`, `sendWhatsappDocument`, `listWhatsappTemplates`,
`sendWhatsappTemplateMessages` (bulk), `fetchDeliveryReports`.

**`whatsappInvoice.ts`** — `sendInvoiceViaWhatsapp(dataSource, invoiceId, userId)`:
load invoice + customer → normalize phone → `renderInvoicePdf` →
`uploadInvoicePdf` → `sendWhatsappDocument` → write the `WhatsappMessage` row
(`kind='invoice'`, storing `mediaUrl` and `messageId`).

**`whatsappTemplates.ts`** — `syncTemplates` (fetch, upsert on `name`+`language`,
regex-count `{{n}}`, keep `rawJson`), `listTemplates`.

**`campaigns.ts`** — `createCampaign` (one transaction: `Campaign` row as `draft` +
one `queued` `WhatsappMessage` per recipient), `getCampaign`, `listCampaigns`,
`sendCampaign`. The dispatch loop exploits the fact that the template endpoint is
bulk: **chunk recipients (~50 per call)** into `messages[]` rather than one HTTP
request per person, set our own `bulkId` per chunk, then map the response's
per-message ids back onto the rows. One failed chunk marks only its own rows failed
and the loop continues.

**`messageStatusPoller.ts`** — see §5.

---

## 4. IPC surface

New `src/electron/ipc/registerMessagingIpcHandlers.ts`, registered from `main.ts`
alongside the existing three. Every channel is wired through all three layers —
`types.d.ts` (`EventPayloadMapping` + `Window.electron`), `preload.cts`, and the
guarded handler — per CLAUDE.md's rule that an unguarded channel is a hole.

| Channel | Args → Return | Guard |
|---|---|---|
| `messaging:getConfig` | `[]` → redacted config | authenticated |
| `messaging:saveConfig` | `[input]` → result | `settings:messaging` |
| `messaging:testConnection` | `[input]` → result | `settings:messaging` |
| `messaging:testStorage` | `[input]` → result | `settings:messaging` |
| `whatsapp:syncTemplates` | `[]` → `{ synced }` | `marketing:manage` |
| `whatsapp:listTemplates` | `[]` → summaries | `marketing:view`, `marketing:manage` |
| `whatsapp:sendInvoice` | `[{ invoiceId }]` → result | `whatsapp:sendInvoice` |
| `whatsapp:getInvoiceMessageStatus` | `[{ invoiceId }]` → status \| null | `invoice:view`, `invoice:create`, `whatsapp:sendInvoice` |
| `campaign:list` / `campaign:get` | → summaries / detail | `marketing:view`, `marketing:manage` |
| `campaign:create` | `[{ name, templateId, variableValues, customerIds }]` → `{ campaignId }` | `marketing:manage` |
| `campaign:send` | `[{ campaignId }]` → result | `marketing:manage` |
| `whatsapp:refreshStatus` | `[]` → `{ updated }` | any of the three messaging perms |

Handlers return `{ ok, error }` result objects rather than throwing, matching the
existing convention — an `ipcInvoke` rejection reaches the renderer wrapped in
"Error invoking remote method …" and these messages are meant to be read.

`create` and `send` stay separate channels even though v1 sends immediately: it lets
the composer show "you're about to message 214 customers" against a real campaign row
before dispatch starts, and leaves room for drafts with no new channel. The UI still
chains them behind one button.

---

## 5. Delivery-status polling

There is no `setInterval`/queue precedent anywhere in `src/electron`, so this is new
infrastructure — designed to need as little of it as possible.

- **Starts** in `main.ts` after the register calls:
  `initializeDatabase().then(startStatusPoller)`. `pollOnce` independently no-ops if
  the data source or config is missing.
- **Cadence** `setInterval(pollOnce, 60_000)` with a `let polling = false`
  re-entrancy guard, so a slow response can't overlap the next tick.
- **What's in flight** is a *query*, not an in-memory queue:
  `status IN ('sent','delivered') AND messageId IS NOT NULL`, oldest
  `statusUpdatedAt` first, capped ~200 rows per tick. `queued` rows have no
  `messageId` yet; `read`/`failed` are terminal.
- **Restart safety comes free** from that: nothing is reconstructed on launch, the
  next tick just picks up whatever is still non-terminal — whether the app was closed
  for five minutes or five days. This is the whole reason for a DB-driven design over
  a job-queue library.
- **Drain-once handling is the critical detail.** `GET /messages-api/1/reports`
  hands back each report exactly once. So the poller must **persist every report it
  receives inside one transaction before doing anything else** — a crash between
  fetch and write loses those reports permanently. Fetch by `bulkId` for campaign
  chunks and `messageId` for invoice sends, and treat a report that maps to no known
  row as a logged no-op rather than an error.
- **Staleness cutoff**: stop polling rows older than ~14 days even if non-terminal.
  WhatsApp read receipts are withheld when the recipient disables them, so "stuck at
  delivered" is an expected end state, not a bug to chase forever.
- **Manual refresh** calls the same `pollOnce()`, not a second implementation.

---

## 6. Renderer

- **`src/react/pages/Settings/WhatsApp.tsx`** — mirrors `Settings/Database.tsx`
  structurally: `react-hook-form`, redacted config loaded on mount, dotted
  placeholder + "leave blank to keep the stored value" on both secrets, and two test
  buttons (Infobip connection, S3 storage). New `src/react/utils/messagingConfig.ts`
  wrapper mirrors `utils/dbConfig.ts`. Register in `navigation.ts`'s `SETTINGS_TABS`
  **and** as a nested route in `Router.tsx`, both carrying `settings:messaging`.

- **`src/invoice-templates/Invoice.tsx`** — add a "Send via WhatsApp" `Button` to the
  existing screen-only action bar next to Print, gated on
  `can("whatsapp:sendInvoice")`, disabled with a hint linking to Settings when
  `messaging:getConfig` reports unconfigured. Toast on result; a status pill fed by
  `whatsapp:getInvoiceMessageStatus` on mount and after send.

- **New Marketing area** — `src/react/pages/Marketing/{Campaigns,CampaignCompose,
  CampaignDetail}.tsx`, registered under the protected `Home` branch in `Router.tsx`
  and as a new group in `navigation.ts`. `Campaigns` mirrors `Sales.tsx`'s list
  shape; `CampaignCompose` is template pick → variable fill with live preview →
  recipient pick → review/send; `CampaignDetail` is a `CustomDataTable` of
  per-recipient status plus a manual refresh button.

- **Recipient selection — build a picker inside the composer, do not retrofit
  `Customers.tsx`.** `Customers.tsx` has no selection affordance today and its job
  (browse/edit/delete the directory) is unrelated to campaign authoring; a campaign
  recipient list is a disposable draft-scoped selection with no reuse elsewhere, and
  handing it across screens would need router-state or a store for no benefit. So:
  `src/react/components/marketing/CustomerPicker.tsx` — modal with debounced search
  over the **existing** `customer:list` IPC (no new backend endpoint), checkbox list,
  selected-count chip, "select all matching". A single shop's directory doesn't need
  virtualization.

All UI composes the existing primitives (`Card`, `PageHeader`, `Field`,
`LabeledInput`, `Modal`, `EmptyState`, `Skeleton*`, `useToast`) and semantic tokens —
no new one-off components beyond the picker.

---

## 7. Sequencing

Each phase is independently shippable and testable.

**Phase 0 — Foundation.** Migration + entities + `messagingConfigStore.ts` +
`messaging:*` IPC + permissions + Settings → WhatsApp tab.
*Done when: credentials save, redact correctly, and both test buttons pass.*

**Phase 1 — Invoice PDF + send.** `phone.ts`, `invoicePdf.ts`, `mediaStorage.ts`,
`infobipClient` document-send, `whatsappInvoice.ts`, the Invoice.tsx button.
Verify `renderInvoicePdf` in isolation first (a throwaway channel that just reports
byte count) before wiring Infobip — the hidden-window timing is the riskiest new
piece. *Done when: a real PDF arrives on a real WhatsApp number from one click.*

**Phase 2 — Status polling.** `fetchDeliveryReports`, `messageStatusPoller.ts`,
`whatsapp:refreshStatus`, the status pill. Exercised against Phase 1's invoice sends.
*Done when: a send visibly advances Sent → Delivered → Read with the app just open.*

**Phase 3 — Templates + campaigns.** `whatsappTemplates.ts`, bulk template send,
`campaigns.ts`, `campaign:*` IPC, the three Marketing pages + `CustomerPicker`.
Reuses Phase 2's poller unchanged, since it queries `whatsapp_message` regardless of
`kind`. *Done when: a campaign reaches real customers and each row updates itself.*

**Phase 4 — Polish (deferred).** Sales.tsx sent-indicator and resend, campaign
cancel/duplicate, per-recipient personalization tokens.

---

## 8. Verification

There is **no test runner in this repo** (CLAUDE.md is explicit — the README's
Playwright/Vitest mention is stale). So verification is manual and staged:

1. `npm run lint` and `npm run build` must stay green — per memory the baseline is
   clean, so any red is this feature's regression.
2. Migration: delete/rename the local `billsane.db`, launch, confirm the three tables
   and indexes are created and the app still boots offline with messaging
   unconfigured. Then confirm `down()` reverses cleanly.
3. Permissions: sign in as a non-admin role without the new permissions — the
   Settings tab and Marketing nav must not render, **and** calling
   `window.electron.sendInvoiceWhatsapp(...)` from devtools must be rejected by the
   main-process guard. That second check is the one that matters.
4. PDF in isolation before any network call: render a known invoice, write the buffer
   to a file, open it, confirm the action bar is absent and totals/GST are correct.
5. Infobip against a **sandbox sender and an allowlisted test number first**. Use
   your own number as the recipient. Confirm the presigned URL is fetchable by an
   anonymous client (`curl -I`) and that the bucket is otherwise private.
6. Campaign end-to-end with a 2–3 recipient list of numbers you control, then watch
   `whatsapp_message` rows advance over a few poll cycles. Kill and relaunch the app
   mid-flight to confirm polling resumes from the database.
7. Offline behavior: disconnect the network and confirm invoicing, inventory and
   login all still work, and the WhatsApp actions fail with a readable message rather
   than hanging or crashing.

Run any DB inspection scripts with `ELECTRON_RUN_AS_NODE=1 npx electron …` (plain
node hits a better-sqlite3 ABI mismatch), and use `env -u ELECTRON_RUN_AS_NODE` when
actually launching the app.

---

## 9. Open risks

1. **Compliance is the biggest gap, and it is a product decision, not an engineering
   one.** There is no opt-in flag anywhere in the data model. Meta requires prior
   opt-in for marketing templates, and India's DND/TRAI rules apply on top. Worth
   deciding before Phase 3 ships whether `Customer` needs a `marketingOptIn` column
   and a UI to capture it — adding it in the same migration is nearly free now and
   costly later.
2. **Two credentials on every desktop.** Accepted knowingly; mitigate with narrowly
   scoped keys as described in Context. A relay remains the clean fix if this ever
   ships to machines you don't control.
3. **Report drain-once across multiple installs** — one Infobip account used from two
   machines means one steals the other's reports. Single-machine only, for now.
4. **Sandbox constraints**: `testConnection` can pass while a real send fails, because
   a fresh WABA is often restricted to allowlisted numbers. Surface Infobip's raw
   error text, never a generic failure message.
5. **`printToPDF` readiness timing** needs real-machine verification; the DOM-polling
   approach has a documented fallback.
6. **Rate limits are unverified.** The ~50-per-chunk batch size and any concurrency
   cap are conservative placeholders, not numbers confirmed against Infobip's actual
   per-key limits.
7. **Template approval turnaround is outside our control**, but doesn't block Phase 3
   — it only needs one already-approved template to test against.
8. **Cost**: every business-initiated conversation is billed. The recipient-count
   confirmation is the only guardrail in this plan; whether a cost estimate belongs in
   that dialog is an open product call.
