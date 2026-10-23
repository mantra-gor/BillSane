GST Feature Plan

I would build GST as a progressive compliance system, not as one giant “GST module.”

The product should move through this journey:

Configure → Calculate → Validate → Reconcile → Prepare → Submit → Monitor

The most important product principle is:

The billing system should make GST compliance easy, but it should not pretend to replace a CA or make legal/tax judgments that require professional review.

The current GST ecosystem supports e-invoicing through IRPs, e-way-bill APIs, and return workflows such as GSTR-1/IFF and GSTR-3B. These systems also change over time, so your integration layer needs to be versioned and updateable.

Phase 0 — GST Foundation

Goal: Make the billing engine GST-aware before connecting to government systems.

Business setup

Create a GST profile for every business:

GSTIN
Legal business name
Trade name
State / jurisdiction
Registration type
Regular / Composition
Filing frequency
Applicable tax configuration
Multiple GSTINs for multi-state businesses

The setup wizard should determine which features are relevant rather than exposing every GST option.

Master data

Make these first-class entities:

Business
 ├── GST Registration
 ├── Tax Profiles
 ├── Customers
 ├── Vendors
 ├── Products
 │     ├── HSN/SAC
 │     └── Tax Rate
 └── Locations
Tax engine

Do not put GST calculations directly inside invoice components.

Build:

Tax Engine
 ├── CGST
 ├── SGST
 ├── IGST
 ├── UTGST
 ├── Cess
 ├── Exempt
 ├── Nil-rated
 └── Zero-rated

The engine receives transaction context:

Supplier State
Customer State
Product
HSN/SAC
Tax configuration
Transaction type

and produces the tax result.

This gives you a foundation that can later support rule updates without redesigning billing.

Phase 1 — GST-Aware Billing

Goal: The customer can create compliant GST-aware invoices without understanding GST mechanics.

Invoice intelligence

The invoice engine should automatically determine the applicable tax treatment based on the configured business and transaction data.

Provide:

GSTIN validation
Customer GST type
HSN/SAC
Tax rate
Place of supply
CGST/SGST/IGST calculation
Tax breakup
Credit/debit notes
Sales returns
Purchase returns
Validation before invoice

Instead of allowing bad data into the system:

Create Invoice
      ↓
GST Validation
      ↓
┌────────────────────┐
│  Everything OK     │
└─────────┬──────────┘
          ↓
       Invoice

or:

GST Validation
      ↓
3 issues
      ↓
[Fix before issuing]

This is where the product begins preventing problems rather than merely recording them.

Phase 2 — GST Compliance Center

Goal: Give the owner one screen that answers:

"What is my GST situation?"

Create a dedicated module:

GST Center
GST Center
────────────────────────────

Current Period

Output Tax             ₹84,250
Input Tax Credit       ₹31,800
Estimated Liability    ₹52,450

GSTR-1                 Ready
GSTR-3B                Review Required

E-Invoice              98%
E-Way Bills            100%

Issues                 3
Compliance status

Each item gets a state:

READY
ACTION_REQUIRED
WARNING
ERROR
SUBMITTED
SYNCING
NOT_APPLICABLE

This status model will be extremely useful throughout the product.

Phase 3 — GST Returns Preparation

Goal: Automatically prepare return data from billing activity.

Your database should maintain GST-specific transaction records independently of the UI.

For every transaction, retain the information needed to generate the relevant return data.

Conceptually:

Invoice
   ↓
GST Transaction
   ↓
GST Ledger
   ↓
Return Aggregation
   ↓
GSTR-1 / GSTR-3B preparation
Important product distinction

Initially:

"Prepare my GST return."

not:

"File my GST return automatically."

The system should produce:

Return summaries
Exception reports
Tax liability
Sales classification
Credit/debit note data
HSN summaries
Relevant supporting data

The GST portal itself uses GSTR-1/IFF and GSTR-3B workflows, and filing conditions can differ for schemes such as QRMP.

Phase 4 — GST Reconciliation

This is where your product can become significantly better than a basic billing application.

Build a reconciliation engine.

Sales reconciliation
Your invoices
      ↕
E-invoice records
      ↕
Return data
Purchase / ITC reconciliation

Eventually:

Purchase Register
        ↕
GST data available for reconciliation
        ↕
Potential ITC differences

Then show human-readable exceptions:

Potential mismatch

Purchase invoice INV-8291 is recorded as ₹25,000 in your books but the corresponding external GST data differs.

The system should flag, not automatically decide whether ITC is legally available.

Phase 5 — E-Invoice Integration

This should be a separate integration subsystem.

The current IRP ecosystem exposes APIs for operations such as generating IRNs, cancelling IRNs, retrieving invoice details, GSTIN details and related authentication/onboarding flows.

Architecture:

Billing
   ↓
E-Invoice Adapter
   ↓
IRP / GSP
   ↓
IRN
   ↓
Signed invoice / QR
   ↓
Billing
Features
Determine applicability
IRP onboarding
Authentication
Generate IRN
Cancel IRN
Retrieve IRN
Retry failed requests
Store IRN
Store signed response
Store QR information
E-invoice status
Error handling
Audit trail

E-invoice applicability is based on government-notified criteria, and the IRP documentation currently describes the mandate in terms of aggregate annual turnover and taxpayer type. This is exactly why applicability should be represented as configurable rules rather than hardcoded UI logic.

Phase 6 — E-Way Bill

Treat this as another integration adapter rather than mixing it into invoice code.

Invoice
   ↓
E-Way Bill Service
   ↓
EWB Number
   ↓
Invoice / Shipment

The official E-Way Bill API supports generation and retrieval and provides APIs for operations such as updating Part B, cancellation, consolidated e-way bills and, more recently, closure functionality.

Product features
Generate E-Way Bill
Update vehicle details
Extend validity
Cancel
Retrieve
Consolidated EWB
Closure
Error handling
EWB history
Phase 7 — Filing Workflow

Once the earlier layers are stable, introduce:

GST Period
      ↓
Data Collection
      ↓
Validation
      ↓
Reconciliation
      ↓
Return Preview
      ↓
Owner / CA Approval
      ↓
Submission
      ↓
Acknowledgement
      ↓
Filed

I'd make Approval a real state.

For example:

DRAFT
  ↓
READY_FOR_REVIEW
  ↓
REVIEWED
  ↓
APPROVED
  ↓
SUBMITTED
  ↓
FILED

This also works naturally with your RBAC system.

Phase 8 — CA / Accountant Collaboration

This should connect directly to the RBAC vision you already have.

Create a role such as:

Tax Professional / Accountant

Give it carefully scoped permissions:

GST Data       READ
GST Reports    READ
Reconciliation READ
Return Draft   READ / EDIT
Return Submit  OPTIONAL
Invoices       READ
Financial Data RESTRICTED

Then:

Invite Accountant

The business owner can invite their CA/accountant into the system.

This turns GST from:

"Owner versus complicated government process"

into:

"Business owner + software + accountant."

Phase 9 — GST Alerts

Build an event-driven notification system.

Examples:

invoice.created
invoice.invalid
irn.generated
irn.failed
eway.generated
eway.expiring
return.ready
return.issue_detected
return.submitted
filing_deadline_approaching

Then map events to actions.

Example:

GSTR-3B due soon
        ↓
Owner notification

Return has unresolved issues
        ↓
Owner + Accountant notification

This same event infrastructure will eventually power your WhatsApp, email and automation integrations.

Phase 10 — GST Intelligence

Only after the deterministic GST engine is working should you add AI.

Good AI use

The AI explains:

"Why am I seeing this GST warning?"

"What does this reconciliation mismatch mean?"

"What should I review before filing?"

"Summarize my GST position this month."

Bad AI use

Don't have an LLM independently decide:

"This transaction is legally eligible for ITC."

or:

"This invoice definitely requires e-invoicing."

Those decisions should come from your rules engine + authoritative integration data, with professional review where appropriate.

Recommended Technical Architecture

Given your Electron + React + TypeScript stack, I'd structure GST approximately like this:

src/
│
├── domains/
│   ├── billing/
│   ├── inventory/
│   ├── customers/
│   └── gst/
│       ├── domain/
│       │   ├── entities/
│       │   ├── value-objects/
│       │   └── rules/
│       │
│       ├── application/
│       │   ├── calculate-tax/
│       │   ├── validate-invoice/
│       │   ├── prepare-return/
│       │   └── reconcile/
│       │
│       └── infrastructure/
│           ├── irp/
│           ├── ewaybill/
│           └── gst-portal/
│
├── integrations/
│   ├── gst/
│   ├── payments/
│   ├── whatsapp/
│   └── accounting/
│
└── shared/
    ├── events/
    ├── audit/
    └── security/

The important architectural boundary is:

                 GST DOMAIN
                     │
          ┌──────────┴──────────┐
          ↓                     ↓
     Tax Rules              Compliance
          │                     │
          └──────────┬──────────┘
                     ↓
              Integration Layer
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
       IRP          EWB       GST Services

Never let the React UI directly talk to IRP/GST APIs.

Online / Offline Strategy

This is particularly important for your application.

Offline

The user should be able to:

Create invoices
Calculate taxes
View GST reports
View historical data
Prepare transactions
Queue integrations
Online

The application synchronizes:

Local GST Transaction
        ↓
Sync Queue
        ↓
Integration Service
        ↓
Government / GSP
        ↓
Response
        ↓
Local Database

For example:

Invoice created offline
        ↓
PENDING_EINVOICE
        ↓
Internet restored
        ↓
E-Invoice request
        ↓
IRN received
        ↓
EINVOICE_GENERATED

However, don't present government submission as successfully completed while offline. Offline mode should mean local preparation/queueing; actual government-side operations occur when the required online service is available.

MVP → V1 → V2 → V3

I would scope it like this.

Stage	GST Capability
MVP	GST business setup, GST-aware invoices, HSN/SAC, tax engine, GST reports
V1	GST Center, return preparation, validation, compliance dashboard
V1.5	E-invoice integration
V2	E-way bill integration, reconciliation, accountant access
V2.5	Filing workflow, submission tracking, advanced reconciliation
V3	GST intelligence, automated alerts, AI explanations, advanced compliance automation
Do not build initially

I would deliberately keep these out of the first release:

Full GST filing automation
AI tax decision-making
Complex ITC legal determination
Every GST form
Every possible taxpayer category
Direct bank reconciliation
Automated legal advice

First make billing → GST calculation → validation → reporting rock solid.

The most important product flow

Ultimately, I would want the owner to experience GST like this:

                     BUSINESS
                        │
                        ▼
                   Create Invoice
                        │
                        ▼
                 GST automatically
                    calculated
                        │
                        ▼
                   GST validated
                        │
              ┌─────────┴─────────┐
              │                   │
          E-Invoice            Normal
              │                   │
              └─────────┬─────────┘
                        ▼
                   GST Ledger
                        │
                        ▼
                  Reconciliation
                        │
                        ▼
                 Return Preparation
                        │
                        ▼
                   GST Review
                        │
              ┌─────────┴─────────┐
              │                   │
           Owner                CA
              │                   │
              └─────────┬─────────┘
                        ▼
                     Submit
                        │
                        ▼
                  Filed / Tracked

That is the GST vision I would put into the product roadmap.

One especially important point from the current ecosystem: E-Way Bill and E-Invoice systems have active API/version changes and validations—the E-Way Bill developer portal currently lists v1.03 and 2026 enhancements, while the IRP documentation shows recent production validation/rate changes. So your architecture should include a GST compliance update mechanism and versioned adapters from the beginning, rather than treating GST as a static calculation library.

The next design decision should be the GST domain model/database schema—business GST profiles, tax rules, invoice tax lines, GST ledger, return periods, reconciliation records, IRN/EWB state, and audit history. That will determine whether the later GST features remain easy to add.