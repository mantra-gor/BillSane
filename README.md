# BillSane

![BillSane](src/react/assets/branding/logo-no-background.png)

**_Make your finances sane._**

A next-generation billing & invoice management desktop app, growing into a lightweight ERP.

---

BillSane is a cross-platform **desktop application** for billing and invoice
management. Beyond generating invoices, it is designed to monitor the health of a
business and surface actionable insights to the owner, with multi-role access control
layered on top. It is India-first (INR `₹`, GST fields, `en-IN` formatting).

> 📄 For the full product vision, architecture, and roadmap, see
> [design.md](design.md). For contributor/agent conventions, see [CLAUDE.md](CLAUDE.md).

## Features

- **Invoice builder** — add line items with live per-row tax and subtotal
  calculation, discounts, and totals.
- **Payment methods** — Cash / Card / UPI selection per invoice.
- **Customer capture** — validated name, phone, and email.
- **Print-ready invoices** — branded, printable output via `react-to-print`
  (`Ctrl/Cmd+P` to print, `Ctrl/Cmd+←` to return to edit).
- **Settings** — account, appearance, and business configuration areas.
- **Cross-platform desktop** — packaged for macOS, Windows, and Linux via Electron.

### On the roadmap

- **Dashboard & insights** — KPIs and trends (revenue, tax, top items) for the owner.
- **Sales ledger** — searchable, filterable invoice history.
- **Roles & permissions** — role-based access control (Owner/Admin, Manager, Cashier,
  Accountant).
- **Persistence** — a local datastore for invoices, customers, and products.

## Tech stack

| Concern | Choice |
|---------|--------|
| Desktop shell | Electron 43 |
| UI | React 19 + TypeScript 6 (strict) |
| Bundler / dev server | Vite 8 |
| Packaging | electron-builder |
| Routing | react-router 8 (`HashRouter`, config-based routes) |
| Styling | TailwindCSS 3.4 |
| Forms & validation | react-hook-form + yup |
| Tables | react-data-table-component |
| Printing | react-to-print |

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer
- npm

### Install

```bash
npm install
```

### Run in development

Runs the Vite dev server (`:5123`) and the Electron shell together:

```bash
npm run dev
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run React + Electron together (main dev command) |
| `npm run dev:react` | Vite dev server only |
| `npm run dev:electron` | Transpile Electron and launch it |
| `npm run build` | Type-check and build the renderer → `dist-react` |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the built renderer |
| `npm run dist:mac` | Package a macOS build (arm64 `.dmg`) |
| `npm run dist:win` | Package a Windows build (`portable` + `msi`) |
| `npm run dist:linux` | Package a Linux build (`AppImage`) |

## Project structure

```text
src/
├── electron/            Main process (window creation, typed IPC bridge)
└── react/               Renderer (the product UI)
    ├── router/          Central route config + auth guard
    ├── pages/           One component per route
    ├── components/      layout, ui/elements, common, graphics
    └── assets/          branding, resources, lottie
src/invoice-templates/   Print-ready invoice output
types.d.ts               Global ambient types
```

## License

© BillSane. All rights reserved. Crafted with ❤️ in India.
