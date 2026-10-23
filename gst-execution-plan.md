# GST — Execution Plan

Execution counterpart to [gst.md](gst.md). That document is the product vision; this one
is the build order, mapped onto the code that actually exists in this repo.

**Locked decisions** (answered before writing this):

| Decision | Choice |
|---|---|
| Plan depth | All phases 0–10, build-ready detail |
| Registrations | **Multi-GSTIN from the start** — registrations, locations, per-registration series |
| Price basis | **Both** — per-item `priceIncludesTax`, engine back-calculates for inclusive lines |
| E-invoice / EWB | Versioned adapter + NIC sandbox; no GSP contracted yet |
| Rule updates | **Over the air, never a hardcoded release** — signed data-only packs, versioned evaluator (§1.6) |

Seven further product decisions — turnover band, composition, purchase side, exports/SEZ,
legacy history, multi-registration, rule ownership — are locked in **§16**.

---

## 0. Ground truth — what exists today

Before any of this is planned, what the code has:

| Concern | Today | Gap |
|---|---|---|
| Business identity | `Business` — **single row**, one free-text `gstNo`, no state, no reg type | No registration entity, no state code, no validation, no multi-GSTIN |
| Tax on a line | `taxType` free text (`"GST"`) + one `taxPer` (`18`) | No CGST/SGST/IGST split, no cess, no exempt/nil/zero distinction |
| Tax computation | Inline in the renderer — `lineTotals()` at [InvoiceCreate.tsx:104](src/react/pages/InvoiceCreate.tsx#L104) | No engine, no server-side authority, renderer decides the tax |
| HSN/SAC | `Product.hsnCode` column exists | Never validated, never required, never reported |
| Customer | name / phone / email | No GSTIN, no state, no registration type → B2B vs B2C is unknowable |
| Place of supply | — | Does not exist |
| Invoice number | `YYMM` + count, [registerDomainIpcHandlers.ts:134](src/electron/ipc/registerDomainIpcHandlers.ts#L134) | Not FY-scoped, not per-registration, and racy by its own admission |
| Documents | Invoice only | No credit note, debit note, bill of supply, delivery challan |
| Cancellation | `invoice:delete` hard-deletes and restocks | **Illegal under GST** once issued — see §1.4 |
| Permissions | 12 keys, no GST key | Whole GST surface needs its own catalog entries |

Two things in this table are load-bearing for everything below: **tax is computed in the
renderer**, and **invoices are deletable**. Both have to change in Phase 0/1, and neither
is a cosmetic change.

---

## 1. Cross-cutting foundations

These are decided once and every phase depends on them. Getting them wrong is the
expensive failure mode, so they come before Phase 0 features.

### 1.1 Where the code lives

`gst.md` proposes a top-level `src/domains/gst/{domain,application,infrastructure}` tree.
**Don't adopt it as written.** This repo's primary boundary is the process split
(`src/electron` vs `src/react`), and a top-level `src/domains/` would either straddle it
or imply the renderer can import GST logic — which is exactly what §1.2 forbids. The
spirit of the proposal (domain / application / infrastructure layering, integrations
isolated) is right; it just nests one level down:

```
src/electron/
├── domain/
│   └── gst/
│       ├── rules/            # rule packs: rates, thresholds, validations, POS rules
│       │   ├── pack.ts       # RulePack loader + version resolution
│       │   └── packs/        # v2026-04-01.ts, v2026-10-01.ts …
│       ├── engine/
│       │   ├── taxEngine.ts      # the pure calculator (§1.3)
│       │   ├── placeOfSupply.ts
│       │   ├── rounding.ts
│       │   └── money.ts          # integer paise
│       ├── validation/
│       │   ├── gstin.ts          # format + checksum
│       │   ├── invoiceRules.ts   # the pre-issue validator (Phase 1)
│       │   └── returnRules.ts    # the pre-file validator (Phase 3)
│       ├── ledger/           # projection + rebuild (Phase 3)
│       ├── returns/          # GSTR-1 / IFF / 3B builders (Phase 3)
│       ├── reconcile/        # matching engine (Phase 4)
│       ├── numbering.ts      # document series (§1.5)
│       └── types.ts
├── integrations/
│   ├── core/                 # adapter contract, retry, queue runner, credentials
│   ├── irp/                  # e-invoice adapters, versioned (Phase 5)
│   └── ewaybill/             # e-way bill adapters, versioned (Phase 6)
└── shared/
    ├── events/               # outbox + dispatcher (Phase 9)
    └── audit/                # append-only audit log (§1.7)
```

Renderer stays where it is: `src/react/pages/Gst/*`, `src/react/components/gst/*`.

### 1.2 The engine is main-process only, and it is the authority

**Non-negotiable, and it is a change from today.** The renderer currently computes tax
and ships the result to `invoice:create`, which stores whatever it's given. Under GST that
is a hole: the numbers on a filed return would be whatever a devtools console said they
were.

New rule: `invoice:create` **recomputes every tax figure server-side** from
`(registration, customer, lines, date, rule pack)` and ignores tax amounts sent by the
renderer. The renderer still calls the same engine for live preview — via a
`gst:quote` IPC channel, not a duplicated TypeScript copy of the maths. One engine, one
answer, and the preview cannot disagree with what gets saved.

`gst:quote` is called on every keystroke in the item grid, so it must be pure and
synchronous over already-loaded rule data — no DB round-trip per call beyond the product
rows the grid already holds.

### 1.3 Money and rounding

Current storage is `decimal(12,2)` via `decimalTransformer`. Keep that for storage, but
**the engine works in integer paise** and never in floats. `0.1 + 0.2` problems in a tax
figure become a rejected return.

```
money.ts:  type Paise = number & { __brand: "paise" }
           fromRupees(s: string): Paise   toRupees(p: Paise): string
```

Rounding rules, fixed in `rounding.ts` and versioned with the rule pack:

1. Line taxable value → 2dp, half-up.
2. Each tax component (CGST/SGST/IGST/UTGST/cess) per line → 2dp, half-up.
3. Invoice tax totals = **sum of rounded line components** (never re-round the sum).
4. Invoice `roundOff` → nearest rupee on the grand total, stored as its own signed column
   (`roundOff`, range **−0.49…+0.50** — half rounds *away from zero*, so a credit note
   mirrors the invoice it reverses). Required — GSTR-1 rejects invoices whose value
   doesn't reconcile to its components without it.
5. **CGST/SGST split the tax amount, not the rate.** Halving the rate reads more
   naturally (18% → 9% + 9%) and breaks on the 0.25% slab, where 0.125% each is not
   expressible in basis points: 12.5bp rounds to 13bp and the two halves silently total
   0.26%. Tax once at the full rate, then halve the amount — the components then sum to
   the tax exactly, at every rate.
6. Inclusive lines: `taxable = round(inclusive × 10000 ÷ (10000 + rateBp))`, components
   derive from `taxable`, and the residual is absorbed **by the taxable value** so
   `taxable + Σtax` re-equals the entered price exactly. Never by a tax component —
   misstating tax to make a total balance is the one trade never worth making. The
   absorbing part is named explicitly rather than picked as "the largest", because a
   large enough cess makes a tax component the largest.

Items 4–6 were all found by the property tests rather than by reasoning, which is the
argument for writing them first.

### 1.4 Issued documents are immutable

GST assumes a document, once issued, exists forever. This kills two current behaviours:

- **`invoice:delete` must stop hard-deleting.** Once an invoice carries a GST document
  number it can only be *cancelled* (same-day, before any IRN/return, leaves a
  cancelled-numbered record behind) or *reversed by a credit note*. Stock still returns in
  both cases — the transaction and `applyStockDelta` logic survives, the `DELETE` doesn't.
- **Editing an issued invoice** is out. Correction = credit note + fresh invoice.

Sequence: keep `invoice:delete` working for pre-GST rows (`taxEngineVersion IS NULL`),
and reject it for GST-issued documents with a message that points at the credit-note flow.
This is the single most user-visible behaviour change in the whole plan — worth a release
note.

### 1.5 Document numbering

Statutory shape: unique, consecutive, **≤16 characters**, alphanumeric plus `/` and `-`,
one unbroken series per financial year, per GSTIN, per document type. The current
`YYMM`+count scheme satisfies none of it.

New `DocumentSeries` table + `nextNumber()` that takes a **row lock inside the existing
`invoice:create` transaction** (`SELECT … FOR UPDATE` on postgres; the sqlite write lock
covers it locally). This finally closes the race the current comment apologises for.

```
DocumentSeries: id, registrationId, documentType, financialYear ("2026-27"),
                prefix, suffix, padWidth, nextValue, resetPolicy, isActive
                UNIQUE (registrationId, documentType, financialYear)
```

FY boundary is 1 April, IST. Compute it from a fixed helper, not from the machine's
locale.

### 1.6 Versioned rule packs — the compliance update mechanism

`gst.md`'s closing point is the right one: GST is not a static calculation library. Rates,
thresholds, validation rules and API versions all move. **GST rules must never be
distributed as a permanently hardcoded Electron release** — an app that needs a new
installer every time a threshold moves will be wrong in the field, quietly, for months.

That is a stronger requirement than "keep the rules in one file", and it drives three
design constraints that are easy to get wrong.

#### Seven independently versioned streams

One monolithic "GST version" couples things that change on different clocks — an IRP
schema bump has nothing to do with a rate revision. Version them separately, resolve them
together:

| Stream | Changes when | Consumed by |
|---|---|---|
| `gst-rules` | POS rules, supply-type logic, UT list, rounding policy | Tax engine |
| `tax-rates` | Rate slabs, cess rules, exemption lists | Tax engine |
| `hsn-master` | HSN/SAC codes, descriptions, default rates, digit requirements | Catalog, validator |
| `einvoice-schema` | IRP payload shape | IRP adapter |
| `einvoice-validation` | IRP's own validation rules and error codes | Pre-submit validator |
| `ewb-schema` | E-way bill payload and operations | EWB adapter |
| `return-schema` | GSTR-1/IFF/3B/CMP-08 JSON shapes | Return builders |

A **`RulePackSet`** is a resolved bundle of one version from each stream, valid over a date
range. Documents store the whole resolved set (`Invoice.rulePackSetId` + a denormalised
`rulePackVersions` JSON), so a March invoice reprinted in December replays March's rules
exactly. Selection is by **document date**, never by today's date.

#### Packs are data, interpreted by a versioned evaluator — never code

This is the constraint that makes runtime updates safe. If a pack were JS/TS, fetching one
would be remote code execution inside a desktop app holding GST credentials. So:

- A pack is **declarative data** (JSON) — rate tables, threshold tables, predicate trees in
  a small fixed DSL. No functions, no expressions eval'd at runtime.
- The **evaluator ships in the app binary** and is itself versioned. Each pack declares
  `minEvaluatorVersion`; the app refuses a pack it cannot fully interpret and keeps the
  previous one, loudly.
- New *kinds* of rule (a genuinely novel mechanism, not a new number) therefore still need
  an app release. That is correct and intended — the split is "numbers and tables update
  over the air, semantics update with the binary".

#### Distribution, integrity, and the infrastructure this needs

- Every pack is **signed** (Ed25519) over its canonical serialisation, with the public key
  pinned in the app. Unsigned or badly-signed packs are rejected before parsing. A billing
  app that accepts unverified tax rules over the network is a supply-chain target.
- A **baseline pack set is bundled with the binary**. The app is fully functional forever
  with zero updates; fetched packs are strictly additive. Offline mode never degrades.
- Updates are **staged, not hot-swapped**: fetch → verify signature → verify evaluator
  compatibility → store → activate on its `effectiveFrom` date. A pack never changes the
  tax on a document that is mid-entry.
- Applying an update is `gst:manage`-gated and audited, and Settings → GST shows the
  active version of each stream, what's staged, and when it takes effect.

> **This is new infrastructure the project does not have.** BillSane today is offline +
> optional Postgres; there is no BillSane-operated server, CDN, or signing pipeline. Pack
> hosting, signing keys, and a release process for packs are a real deliverable, not a
> library import. Milestone M0 ships the *loader, verifier, evaluator and bundled baseline*
> (which is what makes the architecture right); the fetch channel can follow in M1 without
> any rework, because the loader treats "bundled" and "fetched" identically.

```
IPC:  gst:rulePackInfo   (gst:view)    active + staged versions per stream
      gst:rulePackCheck  (gst:manage)  check for updates
      gst:rulePackApply  (gst:manage)  verify + stage, audited
```

#### Applicability is a rules engine, not a comparison

Concretely: **do not implement `aato >= 5cr ⇒ e-invoice`.** E-invoice applicability has
notified exemptions by taxpayer category (SEZ units, insurers, banks, transporters,
cinema), document-type conditions (B2B/export only, not B2C), and a reporting time limit
that itself varies by turnover band. All of it is pack data evaluated by
`rules/applicability.ts`, returning a decision *with its reasons*:

```ts
evaluateEInvoiceApplicability(ctx) →
  { applicable: boolean; reason: string; ruleId: string; packVersion: string }
```

The reason string is what the GST Center shows the owner and what the audit log records —
"why is this invoice not being reported?" must always have an answer.

### 1.7 Audit log

Append-only `AuditLog` (actor userId, action, entity, entityId, before/after JSON,
`reason`, timestamp, source: `ui | import | integration | system`). Written for:
registration changes, document issue/cancel, credit/debit notes, IRN generate/cancel, EWB
actions, return state transitions, reconciliation decisions, migration corrections, rule-pack
activation. No deletes, no updates — enforced in the repository wrapper, not by convention.

**`reason` is required for corrections**, not optional metadata. An audit trail that reads
"invoice changed" is worthless to an accountant; the one that matters is *original value →
correction → who → when → why*. That chain is why §5 keeps imported source values
permanently rather than overwriting them in place.

### 1.8 Permissions to add

New keys in [permissions.ts](src/electron/domain/permissions.ts) (a new `GST` group), each
landing in the same commit as the guard that checks it:

| Key | Gates |
|---|---|
| `gst:view` | GST Center, GST reports, ledger |
| `gst:manage` | Registrations, series, tax profiles, rule-pack settings |
| `gst:return:prepare` | Build/refresh a return draft |
| `gst:return:approve` | Move a draft to APPROVED |
| `gst:return:submit` | Anything that touches a government endpoint for returns |
| `gst:reconcile` | Run reconciliation, resolve exceptions |
| `einvoice:generate` | Request an IRN |
| `einvoice:cancel` | Cancel an IRN |
| `ewaybill:manage` | Generate/update/extend/cancel/close EWB |
| `integration:manage` | IRP/GSP/EWB credentials and onboarding |

The "Tax Professional / Accountant" role from Phase 8 is then **pure data** — the owner
assembles it from these keys at runtime. No code change, exactly as the RBAC design
intends.

### 1.9 Offline & hybrid posture

Everything through Phase 4 (calculate, validate, ledger, prepare, reconcile against
imported data) is fully offline. Only Phases 5–7 touch the network.

`IntegrationRequest` is the single outbox for every government call: idempotency key,
adapter + version, payload, attempt count, next-retry-at, terminal state. The UI **never**
says "filed" or "generated" from a queued row — queued states are named as queued
(`PENDING_EINVOICE`, `QUEUED_EWB`) and render as such.

Cloud sync doesn't exist yet (per CLAUDE.md), so give every GST table the columns the
future sync engine will need from day one: `updatedAt`, `deletedAt` (soft), `syncVersion`,
`originDeviceId`. Retrofitting these across a ledger later is far worse than carrying them
now.

---

## 2. Phase 0 — GST Foundation

**Goal:** the billing engine is GST-aware. Nothing talks to the government yet.

### 2.1 Entities & migration

`1785100000000-GstFoundation.ts` — `Table`/`TableColumn` builders only (sqlite + postgres,
per the existing convention).

**Turnover lives at two levels, and they are not the same number.** E-invoice applicability
is assessed on **aggregate turnover across every GSTIN under one PAN**, while invoicing,
returns and filing all operate against a *particular* registration. Collapsing these into
one `aato` column on the registration — which an earlier draft of this plan did — produces
the wrong applicability answer the moment a second GSTIN exists.

```
Business (PAN level)
   ├── pan, legalName, aato, aatoFinancialYear   ← drives applicability
   │
   ├── GstRegistration  gstin, state, type, filingFrequency, gstinTurnover, config
   ├── GstRegistration  gstin, state, …
   └── GstRegistration  …
```

**New:**

```
GstRegistration    id, businessId, gstin(15, unique), legalName, tradeName, stateCode(2),
                   registrationType (REGULAR|COMPOSITION|CASUAL|SEZ_UNIT|SEZ_DEVELOPER|
                                     ISD|NON_RESIDENT|TDS|TCS),
                   filingFrequency (MONTHLY|QRMP),
                   gstinTurnover, gstinTurnoverFy,   -- this GSTIN's own turnover
                   eInvoiceApplicability (AUTO|FORCE_ON|FORCE_OFF) + resolved cache,
                   hsnRequirementLevel (resolved: 4/6/8 digit, B2C exemptions),
                   isPrimary, isActive, effectiveFrom, effectiveTo

Location           id, registrationId, name, addressLine1/2, city, stateCode, pincode,
                   isPrimary, isActive      -- branch / place of business

DocumentSeries     see §1.5

TaxProfile         id, name, supplyCategory (GOODS|SERVICES), hsnSac, ratePct, cessPct,
                   cessRatePerUnit, treatment (TAXABLE|EXEMPT|NIL_RATED|ZERO_RATED|
                                              NON_GST), isReverseCharge, isActive
                   -- a reusable named bundle, so "GST 5% textiles" is set up once
```

**Altered:**

```
Business        + pan, legalName, aato, aatoFinancialYear, defaultRegistrationId,
                + isGstRegistered (false ⇒ the whole GST surface stays hidden)
Customer        + gstin, gstRegistrationType (REGISTERED|UNREGISTERED|CONSUMER|
                  COMPOSITION|SEZ|EXPORT|DEEMED_EXPORT|UIN),
                + stateCode, placeOfSupplyStateCode (override), legalName
Product         + taxProfileId, hsnSac (rename intent from hsnCode — keep the old
                  column, backfill, drop in a later migration),
                + supplyCategory, priceIncludesTax (bool, default false),
                + cessPct, cessRatePerUnit, uqc (UQC code: PCS, KGS, MTR…)
```

> **Naming:** `supplyCategory` (GOODS/SERVICES) is deliberately *not* called `supplyType` —
> §3.1 uses `supplyType` for the export/SEZ axis and `supplyNature` for intra/inter. Three
> orthogonal axes, three distinct names. The collision is worth avoiding now; it is
> miserable to untangle once it's in a migration and a return builder.

**Turnover bands drive defaults, never hardcoded behaviour.** The target segment is
₹20 lakh–₹20 crore AATO, with the model able to represent anything larger:

| AATO | Product behaviour |
|---|---|
| < ₹20L | Don't assume registration — the wizard's "are you GST registered?" leads |
| ₹20L–₹5Cr | Standard SMB defaults |
| > ₹5Cr | Stricter HSN digits, e-invoice readiness on by default |
| > ₹20Cr | Same model; expect multi-registration and heavier workflows |

Every one of those boundaries is pack data (§1.6), read through the applicability engine.
None of them appears as a numeric literal in a component.

**Backfill:** existing `Business.gstNo` → one `GstRegistration` (marked `isPrimary`) when
it parses as a valid GSTIN; otherwise create an inactive draft the owner completes.
`Product.hsnCode` → `hsnSac`. **Do not** invent tax profiles from the existing free-text
`taxType`/`taxPer` — leave legacy products profile-less and let the setup wizard assign
them (§2.4). Guessing here silently mis-taxes the catalog.

### 2.2 The tax engine

```ts
// domain/gst/engine/taxEngine.ts — pure, no I/O, no DB
interface TaxContext {
  documentDate: string;          // selects the rule pack
  documentType: DocumentType;
  supplier: { stateCode: string; registrationType: RegistrationType; gstin: string };
  recipient: { stateCode: string | null; gstType: CustomerGstType; gstin: string | null };
  placeOfSupplyStateCode: string;
  supplyType: SupplyType;        // see below — explicit, not derived from flags
  reverseCharge: boolean;
  lines: TaxLineInput[];         // qty, rate, priceIncludesTax, discount,
                                 // hsnSac, ratePct, cessPct, treatment, uqc
}
interface TaxResult {
  lines: TaxLineResult[];        // taxableValue, cgst/sgst/igst/utgst{rate,amount},
                                 // cess{...}, total, appliedTreatment
  totals: { taxableValue, cgst, sgst, igst, utgst, cess, totalTax,
            roundOff, invoiceValue };
  supplyNature: "INTRA" | "INTER";   // derived — decides CGST+SGST vs IGST
  rulePackVersions: Record<RuleStream, string>;
  notices: TaxNotice[];          // non-fatal observations
}
```

**`SupplyType` is explicit in the schema from M1**, so the first export or SEZ customer is a
feature flag flip, not a migration of every invoice, line item and ledger row:

```ts
type SupplyType =
  | "DOMESTIC"
  | "EXPORT_WITH_PAYMENT"    | "EXPORT_WITHOUT_PAYMENT"
  | "SEZ_WITH_PAYMENT"       | "SEZ_WITHOUT_PAYMENT"
  | "DEEMED_EXPORT"          | "OTHER";
```

In M1 only `DOMESTIC` is selectable; the rest exist in the schema, are handled by the
engine's zero-rated path, and are surfaced in the UI as *"Advanced GST workflow — coming
later"*. The engine computing them correctly while the UI withholds them is deliberate:
it means enabling exports later is a UI and validation change, not a tax-engine change.

Determination order, encoded once:

1. **Place of supply** (`placeOfSupply.ts`) — explicit override wins; else goods → ship-to
   state; services → recipient's state when registered, else supplier's; export/SEZ
   short-circuit.
2. **Supply nature** — POS state vs supplier state → INTRA / INTER; UT-without-legislature
   → UTGST instead of SGST. (Keep the UT list in the rule pack; it has changed.) Export and
   SEZ `supplyType` values short-circuit to the zero-rated path.
3. **Treatment per line** — TAXABLE / EXEMPT / NIL_RATED / ZERO_RATED / NON_GST. Exempt,
   nil-rated, zero-rated and non-GST are four *different* things on GSTR-1 and collapsing
   them into "no tax" is a filing error.
4. **Reverse charge** — tax computed and shown, but not collected; flagged on the doc.
5. **Composition supplier** — no tax charged, `BILL_OF_SUPPLY` forced, declaration line
   required. Engine-complete in M1, UI-gated (§2.6).
6. **Amounts** — §1.3 rounding, inclusive back-calculation included.

Test the engine hard: a table-driven fixture set covering intra/inter, UT, inclusive vs
exclusive, exempt/nil/zero, cess (both ad-valorem and per-unit), reverse charge,
composition, export with/without payment of tax, and the rounding residual case. **This is
the one place in the repo that genuinely needs a test runner** — Vitest, added here
(CLAUDE.md is explicit that no runner exists today, so adding it is part of this phase's
work, not an assumption).

### 2.3 GSTIN validation

`validation/gstin.ts` — length 15, structure `SS PPPPPPPPPP E Z C` (state code, PAN,
entity number, `Z`, checksum), state code against the rule pack's list, and the mod-36
weighted checksum. Pure, sync, exported to the renderer through `gst:validateGstin` for
live field feedback. Format-valid ≠ real; Phase 5 adds live GSTIN lookup via the IRP.

### 2.4 Setup wizard

`gst.md`'s point that "the wizard should determine which features are relevant rather than
exposing every GST option" is the correct instinct. New screen `/settings/gst`
(+ a `GST` entry in [navigation.ts](src/react/router/navigation.ts) `SETTINGS_TABS`,
permission `gst:manage`), with a first-run wizard:

1. Are you GST registered? → no ⇒ everything below stays hidden, app behaves as today.
2. **PAN + aggregate turnover + FY** — asked once, at business level, because this is what
   applicability is assessed on (§2.1).
3. GSTIN + legal/trade name + state (validated live).
4. Registration type + filing frequency (QRMP question only if turnover suggests it).
5. Additional registrations / locations (skippable, but present from day one).
6. Document series review (defaults proposed, editable).
7. **Catalog readiness** — how many products lack HSN/SAC or a tax profile, with a bulk
   assign-by-rate step. This is where the legacy `taxType`/`taxPer` free text gets
   resolved into real profiles, by the owner, deliberately.
8. **History** — start fresh, or import existing invoices (§2.7).

The wizard shows the owner what its answers *turned on*, not just that it saved:
"e-invoicing applies to you from ₹5Cr AATO — you're at ₹8.2Cr, so it's on", with the rule
id behind it. Compliance settings that change behaviour silently are how people end up
non-compliant while believing the opposite.

### 2.5 IPC surface

| Channel | Guard | Purpose |
|---|---|---|
| `gst:profile` | `gst:view` | Registrations, locations, series, readiness summary |
| `gst:saveRegistration` | `gst:manage` | Create/update a registration |
| `gst:saveLocation` | `gst:manage` | Branch |
| `gst:saveSeries` | `gst:manage` | Numbering series |
| `gst:validateGstin` | authenticated | Format + checksum |
| `gst:listTaxProfiles` / `gst:saveTaxProfile` | `gst:view` / `gst:manage` | Tax profiles |
| `gst:quote` | `invoice:create`, `gst:view` | Live tax preview for the grid |
| `gst:applicability` | `gst:view` | E-invoice/HSN decisions **with reasons** (§1.6) |
| `gst:rulePackInfo` | `gst:view` | Active + staged versions per stream |
| `gst:rulePackCheck` / `gst:rulePackApply` | `gst:manage` | Fetch, verify, stage |
| `gst:migrationPreview` / `gst:migrationCommit` | `gst:manage` | Health check, then import (§2.7) |

All through `ipcHandleGuarded`, all added in the same commit as their handler, all typed
in `types.d.ts` + `preload.cts`.

### 2.6 Composition — schema-complete, workflow gated

Composition is a **first-class registration type in the data model from M1**, and a
deliberately unfinished workflow. The reason to be strict about the first half is that
composition is not a variation on normal billing — a composition taxpayer cannot issue a
tax invoice or collect GST at all, and issues a bill of supply instead. That changes the
document type, the print template, the return set, and the tax engine's output. Bolting it
on later means migrating every issued document.

**In M1:** `COMPOSITION` registration type, composition flags, `BILL_OF_SUPPLY` document
type and its print template, the engine's no-tax-charged path, and feature gating.

**Deferred, as one coherent later phase:**

```
COMPOSITION → Bill of Supply → CMP-08 (quarterly) → GSTR-4 (annual)
```

Note this moves CMP-08 out of Phase 3's builder set (§5.3) — GSTR-1, IFF and GSTR-3B ship
there; CMP-08 and GSTR-4 ship with the composition workflow. A half-working composition
mode that issues correct documents but can't file is worse than one that is honestly
labelled incomplete, so the wizard says so when the type is selected.

### 2.7 Existing invoice history

Assume history exists — most customers arrive from another billing system — but never make
it a blocker. Two paths:

```
Do you have existing invoices?
   [ Start Fresh ]        [ Import Existing Data ]
```

Import runs a **GST Data Health Check** before writing anything, in the preview-then-commit
shape CLAUDE.md already establishes for the CSV catalog import:

```
GST Migration Review

12,842 invoices found

  11,970  OK
     612  missing HSN
     143  invalid GSTIN
      72  missing place of supply
      45  tax configuration conflicts

[Review Issues]   [Import Valid Records]   [Cancel]
```

Partial import is the default outcome. Failing 12,842 invoices because 45 have a tax
conflict is the behaviour that makes people abandon a migration.

**Migration state is tracked per document**, not inferred:

```
LEGACY → VALIDATED → IMPORTED → NEEDS_REVIEW → CORRECTED
```

```
ImportedDocumentSource   id, invoiceId, batchId, sourceSystem, sourceRowRef,
                         sourcePayload (JSON, immutable), importedAt
DocumentCorrection       id, invoiceId, field, originalValue, correctedValue,
                         reason (required), actorId, at
```

**The original imported payload is kept forever and never overwritten.** Corrections are
recorded alongside it, not applied over it. This is the §1.7 chain — original → correction →
who → when → why — and it is the difference between a migration an accountant will sign off
on and one they won't.

Two distinct legacy populations, worth not conflating:

- **BillSane's own pre-GST rows** (`taxEngineVersion IS NULL`) — already in the database,
  handled by §2.1's backfill and the wizard's catalog-readiness step.
- **Documents imported from another system** — a new ingestion pipeline that does not exist
  today. This is real, unbudgeted scope; see §14.

**Done when:** the engine passes its fixture suite; a registration exists with PAN-level
turnover recorded; `gst:quote` returns a correct CGST/SGST split for an intra-state sale
and IGST for inter-state; a composition registration forces bill-of-supply; the invoice
screen still works unchanged (it doesn't call the engine yet).

---

## 3. Phase 1 — GST-aware billing

**Goal:** a counter operator who knows nothing about GST issues a compliant invoice.

### 3.1 Invoice schema

`1785200000000-GstInvoicing.ts`:

```
Invoice   + registrationId (FK), locationId, documentType (TAX_INVOICE|BILL_OF_SUPPLY|
            CREDIT_NOTE|DEBIT_NOTE|DELIVERY_CHALLAN|ADVANCE_RECEIPT),
          + seriesId, financialYear,
          + placeOfSupplyStateCode, reverseCharge,
          + supplyType    (DOMESTIC|EXPORT_*|SEZ_*|DEEMED_EXPORT|OTHER — §2.2),
          + supplyNature  (INTRA|INTER — derived, decides CGST+SGST vs IGST),
          + returnClass   (B2B|B2CL|B2CS|CDNR|CDNUR|EXP|NIL — drives the GSTR-1 section),
          + customerGstin, customerLegalName, customerStateCode   (snapshots),
          + taxableValue, cgstAmount, sgstAmount, igstAmount, utgstAmount, cessAmount,
          + roundOff, invoiceValue, priceBasis (EXCLUSIVE|INCLUSIVE|MIXED),
          + taxEngineVersion, rulePackSetId, rulePackVersions (JSON),
          + status (DRAFT|ISSUED|CANCELLED),
          + migrationState (NATIVE|LEGACY|VALIDATED|IMPORTED|NEEDS_REVIEW|CORRECTED),
          + originalInvoiceId (FK self, for CN/DN), noteReason

InvoiceLineItem
          + hsnSac, uqc, supplyCategory, treatment,
          + discountAmount, taxableValue,
          + cgstRate/cgstAmount, sgstRate/sgstAmount, igstRate/igstAmount,
            utgstRate/utgstAmount, cessRate/cessAmount, cessPerUnitAmount,
          + priceIncludesTax
```

Existing `taxType`/`taxPer`/`tax` columns stay for legacy rows and are no longer written.
`taxEngineVersion IS NULL` is the marker for "pre-GST invoice" throughout the app.

### 3.2 `invoice:create` rewrite

Same transaction, more inside it, in this order:

1. Resolve registration (explicit, else default) and customer.
2. Resolve line products (`resolveLineProducts` unchanged — auto-creating typed items is a
   good behaviour and stays; auto-created items inherit no HSN, which the validator then
   flags rather than silently accepting).
3. **Validate** (§3.3). Fatal issues abort with a structured result, never a raw throw.
4. **Compute** via the engine — server-side, authoritative.
5. Determine document type (composition ⇒ bill of supply; all-exempt ⇒ bill of supply).
6. Allocate the number from `DocumentSeries` under row lock.
7. Persist invoice + lines + audit entry.
8. `applyStockDelta` — unchanged.

Return type becomes a result object (`{ ok: true, invoice } | { ok: false, issues }`),
matching the CSV-import precedent in CLAUDE.md: these messages are meant to be read, and
an `ipcInvoke` rejection would wrap them in "Error invoking remote method …".

### 3.3 The validator

`validation/invoiceRules.ts` — returns `GstIssue[]`, each `{ code, severity, field,
message, fix }`. `severity: "error"` blocks issuing; `"warning"` doesn't.

Errors: missing/invalid supplier GSTIN; B2B line with no customer GSTIN; missing place of
supply; missing HSN/SAC where the turnover slab requires it; invalid rate for the HSN
under the active pack; inter-state doc carrying CGST/SGST; export without shipping bill
context; series exhausted or FY-mismatched; document value ≠ Σ components + roundOff.

Warnings: customer state ≠ POS without override; unusually large discount; item's rate
differs from its tax profile; reverse-charge on an unregistered recipient.

The renderer renders these in the flow `gst.md` draws — a validation panel above the
Create button, "3 issues · fix before issuing", each row clickable to focus the offending
field. Warnings get a checkbox acknowledgement, not a silent pass.

### 3.4 Renderer changes

- `InvoiceCreate.tsx`: `lineTotals()` **deleted**; totals come from a debounced
  `gst:quote`. Grid gains HSN/SAC (auto-filled from the product, editable), UQC, and a
  tax column that shows the split (`CGST 9% + SGST 9%` / `IGST 18%`) rather than a
  free-text box. Header gains a registration selector (only when >1 exists) and a place-of-
  supply selector defaulting from the customer.
- `CustomerIdentity` / customer forms: GSTIN field with live validation, registration type,
  state. Entering a GSTIN auto-fills the state from its first two digits.
- Product form + CSV import: HSN/SAC, tax profile, `priceIncludesTax`, UQC, cess. Import
  needs new `COLUMNS` aliases (`HSN`, `SAC`, `GST%`, `Cess%`, `UQC`, `Unit of Measure`,
  `Price includes tax`) — per CLAUDE.md, adding an alias is the right fix, adding a
  required column is not.
- `src/invoice-templates/Invoice.tsx`: statutory format — supplier GSTIN + address, "Tax
  Invoice"/"Bill of Supply" title, place of supply, HSN-wise table with per-rate tax
  columns, tax amount in words, reverse-charge declaration, round-off line, signature
  block. Space reserved for the QR/IRN block that Phase 5 fills.

### 3.5 Credit / debit notes

New page `/invoice/note/:invoiceId` and channel `invoice:createNote`. A note references
its original, inherits registration/POS/customer, allows partial quantities, runs through
the same engine and validator, draws from its own `DocumentSeries`, and restocks on credit
(sales return). This is what replaces `invoice:delete` for issued documents (§1.4).

**Done when:** an intra-state B2C sale, an inter-state B2B sale, an inclusive-priced MRP
sale, and a credit note against each all produce correct, validated, correctly-numbered
documents — and the printed output is one a CA would accept.

---

## 4. Phase 2 — GST Center

**Goal:** one screen answering "what is my GST situation?"

New route `/gst` (nav group **Compliance**, `⌘7`, permission `gst:view`). Sections:
current period liability (output tax − ITC, with the caveat that ITC is only as good as
what's been recorded), per-return readiness cards, e-invoice/EWB coverage percentages,
open issues.

The status model from `gst.md` becomes a shared union used everywhere:

```ts
type ComplianceStatus = "READY" | "ACTION_REQUIRED" | "WARNING" | "ERROR"
                      | "SUBMITTED" | "SYNCING" | "NOT_APPLICABLE";
```

with one `<ComplianceBadge status>` primitive in `components/ui/elements/`, mapping onto
the existing `success/warning/danger/info` semantic tokens. Define it once here; Phases
3–7 all reuse it.

Aggregates computed in SQL in the main process and shipped as one bundle — same pattern as
[insights.ts](src/electron/domain/insights.ts), which is the model to copy (and the reason
`gst:center` returns a single compact payload rather than N chatty calls).

**Done when:** the screen is accurate for a month of real invoices and every number on it
can be drilled into.

---

## 5. Phase 3 — Returns preparation

**Goal:** produce return-ready data. Prepare, not file.

### 5.1 Ledger — a projection, not a dual write

`gst.md` calls for GST transaction records "independently of the UI". Agreed on intent,
but **don't dual-write invoices into a parallel GST transaction table** — two writable
copies of the same fact drift, and reconciling your own books against your own books is a
bug factory.

Instead: the invoice's GST columns (Phase 1) *are* the immutable record, and
`GstLedgerEntry` is a **derived, rebuildable projection** over them:

```
GstLedgerEntry  id, registrationId, periodId, documentId, documentType, direction
                (OUTWARD|INWARD), transactionType, hsnSac, ratePct, taxableValue,
                cgst, sgst, igst, utgst, cess, placeOfSupply, counterpartyGstin,
                isAmendment, amendedPeriodId, sourceHash
```

`gst:ledgerRebuild` regenerates a period from source documents; `sourceHash` makes drift
detectable. The projection gives the independence the vision asks for without the drift.

### 5.2 Periods & drafts

```
GstReturnPeriod  id, registrationId, periodType (MONTH|QUARTER), year, month/quarter,
                 returnType (GSTR1|IFF|GSTR3B|CMP08), dueDate, status, lockedAt
GstReturnDraft   id, periodId, version, state, summaryJson, generatedAt, generatedBy,
                 approvedBy, approvedAt, notes
GstReturnIssue   id, draftId, code, severity, section, reference, message, resolvedAt
```

State machine (Phase 7 extends the tail): `DRAFT → READY_FOR_REVIEW → REVIEWED →
APPROVED → SUBMITTED → FILED`, with `state` transitions permission-gated and audited.

**Locking a period** matters: once a return is APPROVED, back-dating an invoice into that
period must be refused (or forced into an amendment section). Enforce in
`invoice:create`, not in the UI.

### 5.3 Builders

`returns/gstr1.ts` — sections B2B, B2CL, B2CS, CDNR, CDNUR, EXP, AT, HSN summary, and
documents-issued (that last one is derived from `DocumentSeries` including cancelled
numbers, which is exactly why cancellation must leave a record).
`returns/iff.ts` — B2B + CDNR subset for QRMP months 1–2.
`returns/gstr3b.ts` — 3.1 outward, 3.2 inter-state to unregistered, 4 ITC, 5 exempt,
6.1 payment.

CMP-08 and GSTR-4 are **not** in this phase — they ship with the composition workflow
(§2.6), because a composition taxpayer needs the whole chain or none of it.

Each emits a typed summary + a JSON payload shaped to the current portal schema (schema
version comes from the rule pack), plus exception reports and a CSV/JSON export for the
CA. Offline-only export in this phase — filing is Phase 7.

**Done when:** a GSTR-1 built from a month of invoices matches a hand-computed control
sheet to the paisa, and its exception report catches deliberately broken invoices.

---

## 6. Phase 4 — Reconciliation

**Goal:** flag differences. Never decide ITC eligibility.

### 6.1 Model the purchase document, not the spreadsheet

The tempting shortcut — "a purchase is a row someone imported" — welds the ITC feature to
the CSV that happened to seed it, and has to be unpicked the day anyone wants to *type* a
purchase invoice. Model the same three layers the sales side has:

```
PurchaseDocument            ← what the supplier issued (however it arrived)
      ↓
GstPurchaseTransaction      ← the GST projection, matching GstLedgerEntry's shape
      ↓
ITC / Reconciliation
```

Ingestion is a **pluggable source**, so entry method is a detail rather than the model:

```
integrations/purchase-sources/
  csv.ts          ← M4
  excel.ts        ← M4 (needs a real .xlsx reader; see §14)
  json.ts         ← M4
  manualEntry.ts  ← later, and it changes nothing downstream
  accounting/     ← later (Tally, Zoho, …)
  gstPortal/      ← later (2A/2B via GSP)
```

Because `GstPurchaseTransaction` is the only thing reconciliation reads, adding purchase
invoice *entry* later is a new source module, not a redesign.

### 6.2 M4 import scope

Minimum viable columns — supplier name, GSTIN, invoice number, invoice date, taxable value,
CGST, SGST, IGST, cess, HSN/SAC — through the same preview-then-commit flow, re-parsing on
commit, blank-cell-means-leave-alone. It ends where the catalog import ends:

```
248 purchase records imported.
7 records need attention.
```

That is enough foundation for ITC reconciliation without building purchase management.

### 6.3 Reconciliation

```
ReconciliationRun        id, registrationId, periodId, type (SALES|PURCHASE_ITC),
                         sourceLabel, startedAt, finishedAt, counts
ReconciliationException  id, runId, matchKey, status (MATCHED|MISMATCH|MISSING_IN_BOOKS|
                         MISSING_IN_PORTAL|DUPLICATE), field, bookValue, portalValue,
                         severity, resolution, resolvedBy, resolvedAt, note
```

Matcher: exact on (GSTIN + document number + FY), then fuzzy on (GSTIN + date ± tolerance
+ value ± tolerance), tolerances configurable. Output reads as `gst.md` writes it — plain
sentences naming the document and both figures.

**Hard rule, enforced in code and copy:** the engine emits `status` and evidence. It never
writes "ITC not available". Resolution is a human decision recorded with an actor and a
note.

---

## 7. Phase 5 — E-invoice (IRP)

**Goal:** IRN generation as an isolated, versioned, retryable subsystem.

```
integrations/core/
  adapter.ts        interface IrpAdapter { version; auth(); generateIrn(); cancelIrn();
                                           getIrnByDoc(); getGstinDetails(); }
  registry.ts       version → adapter, selected by config
  queue.ts          IntegrationRequest runner: backoff, idempotency, terminal states
  credentials.ts    safeStorage-encrypted, same pattern as configStore.ts

integrations/irp/
  nicSandbox.ts     v1.x adapter against the NIC sandbox
  payload/          canonical invoice → IRP JSON, per schema version
```

```
EInvoice   id, invoiceId, status (NOT_APPLICABLE|PENDING|SUBMITTED|GENERATED|
           CANCELLED|FAILED), irn, ackNo, ackDate, signedInvoiceB64, signedQrB64,
           qrImagePath, adapterVersion, schemaVersion, errorCode, errorMessage,
           attemptCount, lastAttemptAt, cancelledAt, cancelReason
```

Applicability lives in the rule pack (turnover threshold, taxpayer type, document type,
B2B/export only, and the reporting time limit) — **never hardcoded in a component**, which
is `gst.md`'s point and the reason it survives the next notification unchanged.

Flow: issue invoice → if applicable, enqueue → adapter authenticates → IRN + signed QR
returned → stored → invoice template renders the QR. Offline: the document sits at
`PENDING_EINVOICE`, is labelled as pending on screen and on print, and is picked up when
connectivity returns. Cancellation honours the statutory window; past it, the answer is a
credit note.

Also wire `getGstinDetails` into customer entry — real GSTIN verification, which is the
first thing a user notices working.

**Done when:** sandbox IRN generation, cancellation, retrieval and retry-after-failure all
work, and pulling the network cable mid-flow leaves the app honest.

---

## 8. Phase 6 — E-way bill

Same adapter shape, separate subsystem, `integrations/ewaybill/`.

```
EwayBill   id, invoiceId, ewbNo, status (NOT_REQUIRED|PENDING|GENERATED|PART_B_PENDING|
           IN_TRANSIT|EXTENDED|CANCELLED|CLOSED|EXPIRED|FAILED),
           validUntil, distanceKm, transportMode, transporterId, transporterName,
           vehicleNo, docNo/docDate, fromPincode/toPincode, generatedAt, adapterVersion
EwayBillEvent  id, ewayBillId, action (GENERATE|UPDATE_PART_B|EXTEND|CANCEL|CONSOLIDATE|
               CLOSE), payload, response, actorId, at
```

Applicability (consignment-value threshold, intra vs inter-state, exempt goods) is rule-
pack data. Operations: generate, update Part B, extend validity, cancel, consolidated EWB,
closure, retrieve. Full history per bill — `EwayBillEvent` is the audit trail and the
"EWB history" feature at once. Expiry warnings feed Phase 9 events.

Where Part B is unknown at billing time (vehicle not assigned), generate Part A and leave
`PART_B_PENDING` — that's the common real-world path, not an error state.

---

## 9. Phase 7 — Filing workflow

Extends §5.2's state machine to the full chain and adds submission:

```
DRAFT → READY_FOR_REVIEW → REVIEWED → APPROVED → SUBMITTED → FILED
                                   ↘ REJECTED (back to DRAFT, with a reason)
```

`ReturnApproval` (draftId, actorId, action, note, at) — approval is a real, audited state,
as `gst.md` asks. `gst:return:approve` and `gst:return:submit` are separate permissions so
an owner can let their CA approve without granting submission, or vice versa.

Submission goes through the same `IntegrationRequest` outbox, stores the ARN/acknowledgement,
and polls status to `FILED`. Filed periods lock hard: no new documents dated into them,
amendments only.

---

## 10. Phase 8 — Accountant collaboration

Mostly configuration, because the RBAC design already did the work.

- Seed (don't hardcode) a suggested **Tax Professional** role: `gst:view`,
  `gst:return:prepare`, `gst:reconcile`, `invoice:view`, `customer:view` — and
  deliberately *not* `gst:return:submit`, `invoice:create`, `users:manage` or
  `settings:database`. Owner edits it freely.
- Invite flow reuses the existing admin-creates-user + temporary-password path
  ([ForcePassword.tsx](src/react/pages/ForcePassword.tsx)); there is still no sign-up.
- Optional per-registration scoping on a user (`User.registrationIds`) so a CA engaged for
  one state doesn't see another. Design it now even if enforcement ships with Phase 2's
  screens — retrofitting scope onto guards later is painful.
- A "share with accountant" export bundle: return draft + exceptions + supporting CSVs.

Multi-tenant/remote CA access is explicitly **out** — it needs the cloud sync engine that
CLAUDE.md flags as the next major unbuilt piece.

---

## 11. Phase 9 — Events & alerts

```
shared/events/  OutboxEvent (id, type, payload, occurredAt, dispatchedAt, attempts)
                dispatcher: subscribers registered in main, delivered at-least-once
Notification    id, userId, type, title, body, severity, entityRef, readAt, actionPath
```

Event names as `gst.md` lists them — `invoice.created`, `invoice.invalid`, `irn.generated`,
`irn.failed`, `eway.generated`, `eway.expiring`, `return.ready`, `return.issue_detected`,
`return.submitted`, `filing_deadline_approaching`.

Rules map event → audience (owner / accountant / both) → channel. In-app first (a bell in
`Topbar` + a notification center); the outbox is deliberately transport-agnostic so the
existing [whatsapp-integration-plan.md](whatsapp-integration-plan.md) and email plug in as
additional subscribers rather than a second notification system.

Deadline alerts need a scheduler in main (due dates come from the rule pack per return
type and filing frequency) that survives the app being closed for days — compute missed
windows on launch rather than assuming a live timer.

---

## 12. Phase 10 — GST intelligence

Only after Phases 0–4 are deterministic and trusted.

**In scope:** explain a validation error in plain language; explain a reconciliation
mismatch; a pre-filing review summary; a natural-language month-end position summary.
All grounded — the model receives the engine's structured output and explains it.

**Out of scope, enforced architecturally:** the model never computes tax, never decides
ITC eligibility, never decides e-invoice applicability. Those come from the rule engine.
The integration surface should make this literally impossible: the AI layer gets
read-only access to computed results and no path to write a tax figure.

Model choice and API usage per the `claude-api` reference when this phase starts.

---

## 13. Sequencing

| Milestone | Contents | Gate to pass |
|---|---|---|
| **M0** Foundations | §1.1–1.9: layout, ✅ money, ✅ rounding, ✅ GSTIN validation, ✅ Vitest — then **pack loader + signature verifier + evaluator + bundled baseline**, numbering, audit, permissions | Engine fixtures green; a tampered pack is rejected |
| **M1** Phase 0 | PAN/AATO, registrations, locations, applicability engine, tax profiles, catalog fields, setup wizard, legacy import, `gst:quote` | Quote returns correct splits; applicability answers *with reasons* |
| **M2** Phase 1 | Server-authoritative invoicing, validator, credit/debit notes, statutory print | Four canonical documents correct end-to-end |
| **M3** Phases 2–3 | GST Center, ledger projection, GSTR-1/IFF/3B preparation | GSTR-1 matches a hand-computed control sheet |
| **M4** Phase 4 | Purchase document model + ingestion sources + reconciliation | Exceptions read as sentences, decide nothing |
| **M5** Phase 5 | E-invoice adapter + sandbox | Offline behaviour stays honest under network loss |
| **M6** Phase 6 | E-way bill | Part-A-only path works |
| **M7** Phase 7 | Filing workflow + submission | Approval is audited and period locking holds |
| **M8** Phases 8–9 | Accountant role, events, alerts | — |
| **M9** Phase 10 | Explanations | Cannot write a tax figure |

M0–M2 are the ones that carry real risk; the rest are additive. If the schedule
compresses, cut from the M5+ end, never from M0.

---

## 14. Risks

| Risk | Handling |
|---|---|
| **Tax computed in the renderer today** | Move it in M2 and make `invoice:create` the authority. Don't ship a half-state where both compute. |
| **Deletable invoices** | §1.4. Legacy rows keep the old behaviour; GST documents get cancel + credit note. Release-note it. |
| **Legacy free-text `taxType`/`taxPer`** | Never auto-convert. `taxEngineVersion IS NULL` marks legacy; the wizard makes the owner assign profiles. |
| **Numbering race** | Series table with a lock inside the existing transaction (§1.5). |
| **Rounding drift** | Integer paise + property tests for the inclusive residual (§1.3). |
| **Rules change under you** | Versioned packs selected by document date; every document stores its pack versions (§1.6). |
| **No test runner** | Vitest is added in M0. The engine is not shippable on manual testing. |
| **Hybrid sync doesn't exist** | Sync columns on every GST table from day one (§1.9). |
| **Pack distribution is new infrastructure** | No BillSane server, CDN, or signing pipeline exists. M0 ships loader + verifier + bundled baseline so the architecture is right; hosting and the signing/release process are a separate deliverable, and the app must be permanently correct without them. |
| **Remotely-updated rules are an attack surface** | Data-only packs, pinned-key signature verification, evaluator-version gating (§1.6). Never ship packs as executable code. |
| **Excel ingestion needs a dependency** | The repo's CSV reader is in-house RFC 4180. `.xlsx` means a real parser (SheetJS or similar) — a new dependency in a compliance path, so pin and review it. Ship CSV/JSON first if that's contentious. |
| **Importing history from another system is unbudgeted** | §2.7 is a second ingestion pipeline with its own mapping, health check, migration states and correction provenance. Size it separately from the catalog CSV import it superficially resembles. |
| **Scope** | The purchase side (Phase 4) is a whole new domain the app has never had. Treat M4 as its own project, not a sub-task. |

---

## 15. Deliberately not in this plan

Per `gst.md`'s own "do not build initially", plus two of mine:

- Fully automated filing without human approval.
- AI making any tax or eligibility determination.
- Legal ITC eligibility determination.
- Every GST form and every taxpayer category (ISD, TDS/TCS, NRTP get schema slots, not
  workflows).
- **Composition workflow** (CMP-08, GSTR-4) and **export/SEZ workflow** — schema-complete
  and engine-complete, UI-gated. Deferred, not excluded (§2.6, §2.2).
- **Purchase management** — import only; entry comes later as an ingestion source (§6.1).
- Direct bank reconciliation.
- **Live GST portal scraping** — API/GSP only. Scraping breaks and is a support burden.
- **Remote CA access** — blocked on the cloud sync engine.

---

## 16. Locked decisions

Settled before M1. Each is threaded into the sections named.

| # | Question | Decision | Where |
|---|---|---|---|
| 1 | Turnover band | Target **₹20L–₹20Cr AATO**, configurable beyond. Store PAN-level AATO + FY, GSTIN-level turnover, registration type, resolved e-invoice applicability, HSN requirement level. Thresholds never hardcoded in the UI. | §2.1, §1.6 |
| 2 | Composition | **Schema-supported in M1, workflow deferred.** First-class registration type, bill-of-supply capable, feature-gated. CMP-08 + GSTR-4 ship together, later. | §2.6, §5.3 |
| 3 | Purchase side | **Import-first**, no purchase management. But model `PurchaseDocument → GstPurchaseTransaction → ITC`, with pluggable ingestion sources so manual entry is additive. | §6.1–6.2 |
| 4 | Exports / SEZ | **Schema-supported, workflow deferred.** Explicit `SupplyType` enum in M1, engine handles it, UI marks it "coming later". No migration when the first export customer arrives. | §2.2, §3.1 |
| 5 | Legacy history | **Support import + GST health check.** Two-path wizard, partial import, per-document migration state, immutable source payload + correction provenance. | §2.7, §1.7 |
| 6 | Multi-registration | **One business → many GSTINs.** PAN-level turnover drives applicability; registration-level identity drives invoicing and filing. | §2.1 |
| 7 | **Who owns rule updates** | **The app, over the air — never a hardcoded release.** Seven independently versioned streams, data-only signed packs, versioned in-app evaluator, bundled offline baseline. | §1.6 |

Decision 7 is the one that most changed this plan. The first draft put rule packs "in code,
typed, reviewable, diffable in git" — which is pleasant for developers and wrong for
compliance, because it makes every threshold change an installer. The revision keeps the
reviewability (packs are still authored and version-controlled upstream) while making
delivery independent of the release cycle, and adds the two constraints that make that
safe: packs carry no executable code, and the app verifies a signature against a pinned key
before parsing.

## 17. Still open

Smaller, and none of them block M1:

1. **Pack hosting** — where do signed packs actually live, and who operates the signing
   key? Needed before the fetch channel ships (not before M0's loader).
2. **Excel ingestion** — accept the `.xlsx` dependency in M4, or ship CSV/JSON first?
3. **Source systems for migration** — which billing systems' exports must the §2.7 importer
   understand on day one? Each is a mapping profile.
4. **Per-registration user scoping** — enforce in M1's guards, or design-only until the
   accountant phase? Currently design-only.
