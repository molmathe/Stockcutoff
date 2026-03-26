# Fonney StockCutoff POS System

Full-stack Point-of-Sale and inventory management web app for multi-branch retail operations.

## Changelog

### v0.8.0
- **Unresolved Sales — autocomplete inputs** — branch and barcode fields now show a live dropdown as you type; branch filters by name/code from the branch list; barcode searches items by name/SKU/barcode with 300ms debounce; selecting a suggestion immediately saves and re-triggers auto-match
- **Unresolved Sales — edit matched fields** — matched branch/item rows show a pencil icon on hover; click to switch back to the autocomplete input and correct a wrong match without deleting the record
- **POS session persists after page refresh** — `/auth/me` now returns `posMode: true` for system POS users so the POS header banner and logout redirect remain correct after a browser refresh
- **CENTRAL parser branch column fix** — `Store Name` is now matched before `Store Number` so `rawBranch` correctly maps to branch name instead of store number code
- **Blocked Barcodes** *(SUPER_ADMIN)* — manage a list of barcodes that are blocked from being scanned at POS

### v0.7.0
- **การคัดแยกยอดขายหน้าร้าน** *(SUPER_ADMIN)* — upload a Consolidated Report (Excel) from CENTRAL / MBK / PLAYHOUSE; subtracts booth POS sales from report total to isolate in-store (หน้าร้าน) sales; results split into ✅ Ready / ⚠️ Review / 🔴 Errors; submit creates IMPORT bills for net dept store portion; review rows pushed to Unresolved Sales
  - Supports PERMANENT branch matching via `reportBranchId`; BOOTH branches sharing the same code are correctly deducted
  - Draft save / resume / delete (same pattern as Import Sales)
  - **Duplicate protection** — detects existing IMPORT bills for same platform + branch + date range before submitting; shows conflict list, requires explicit force-confirm
- **Import Sales — duplicate protection** — 409 conflict detection; modal lists duplicate dates/branches; user can cancel or force-import
- **Audit Log** *(SUPER_ADMIN)* — view all system activity (CREATE_BILL, EDIT_BILL, CANCEL_BILL, SUBMIT_DAY, DEPT_RECONCILE, LOGIN); click-to-expand shows before/after item diff for EDIT_BILL; filters: date range, action type, user; paginated (50/page); 1000-day retention with daily auto-cleanup
- **Super Admin — Edit Submitted Bill** — SUPER_ADMIN can edit bills with status SUBMITTED; barcode/SKU lookup, edit qty/price/discount per line, add/remove items; full before/after snapshot saved to audit log
- **Bill subtotal rounding** — applied `round2()` to all subtotal/total calculations to prevent floating-point drift
- **Import Sales auth hardened** — endpoints upgraded from `requireAdmin` → `requireSuperAdmin`
- **Branch column fix (CENTRAL)** — parser now correctly maps `Store Number` (= `reportBranchId`) for branch matching

### v0.5.0
- **Bulk image upload** — raised file limits; nginx `client_max_body_size` 500 M
- **Branches** — PIN visible in table, edit modal pre-fills PIN, search & filter by type/PIN/active
- **Items** — category & active filters (server-side, compatible with pagination + CSV export)

### v0.4.0
- **DB indexes** — composite and single-column indexes on Bill, BillItem, Item
- **Pagination** — Items API 50/page with prev/next
- **React Query v5** — all admin pages use caching, dedup, auto-refresh
- **Export All CSV** — full non-paginated dataset

### v0.3.1
- **Branding** — renamed to *Fonney StockCutoff*; version badge in sidebar
- **Security hardening** — JWT validation at startup, rate limiting, privilege-escalation guard, atomic transactions, Thai-timezone day boundaries
- **POS 401 redirect** — cashier sessions redirect to `/pos-login`

---

## Features

### POS (Cashier)
- Barcode scanning — USB scanner (auto-Enter) or camera via browser
- Add items to cart, adjust price & per-item discount
- Bill discount & notes
- Save bill, view bill history
- **End of Day** — submit all open bills in one click

### Admin
- **Dashboard** — today's revenue, top items, 7-day trend, branch comparison
- **Items** — CRUD with drag-drop image upload; bulk CSV import; bulk delete; category tagging
- **Categories** — CRUD for product categories
- **Branches** — CRUD with type (ถาวร/ชั่วคราว), `reportBranchId`, PIN management
- **Users** — CRUD, role management
- **Reports** — filter by date range & branch; download Excel; Export Master (POS + import combined)
- **Import Sales** *(SUPER_ADMIN)* — upload Excel, preview with match status, submit as bills; duplicate protection; draft save/resume
- **Unresolved Sales** *(SUPER_ADMIN)* — rows that failed import matching; manual resolution
- **การคัดแยกยอดขายหน้าร้าน** *(SUPER_ADMIN)* — subtract booth POS from consolidated report to get net in-store sales; duplicate-safe; draft support
- **Audit Log** *(SUPER_ADMIN)* — full activity history with before/after diff; 1000-day retention
- **Edit Submitted Bill** *(SUPER_ADMIN)* — modify any submitted bill with full audit trail

---

## Roles

| Role | POS | Items | Branches | Users | Reports | Import | Reconcile | Audit Log |
|------|-----|-------|----------|-------|---------|--------|-----------|-----------|
| SUPER_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ all | ✅ | ✅ | ✅ |
| BRANCH_ADMIN | ✅ | ✅ | ✅ | ✅ cashiers | ✅ own | — | — | — |
| CASHIER | ✅ | view | — | — | — | — | — | — |

---

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Recharts + React Query v5
- **Backend**: Node.js + Express + TypeScript + Prisma ORM
- **Database**: PostgreSQL 16
- **Reverse Proxy**: Nginx
- **Container**: Docker + Docker Compose

---

## Quick Start (Docker)

```bash
# 1. Clone
git clone https://github.com/YOUR_ORG/stockcutoff.git
cd stockcutoff

# 2. Configure
cp .env.example .env
# Edit .env — set DB_PASSWORD and JWT_SECRET (min 32 chars)

# 3. Start
docker compose up -d --build

# 4. Seed default data (first time only)
docker compose exec backend npm run db:seed
```

Open `http://localhost` in your browser.

**Default accounts:**
| User | Password | Role |
|------|----------|------|
| admin | admin123 | Super Admin |
| branch_admin | branch123 | Branch Admin |
| cashier1 | cashier123 | Cashier |

> ⚠️ Change all passwords immediately after first login.

---

## Development

```bash
# Backend
cd backend
cp .env.example .env      # set DATABASE_URL
npm install
npx prisma migrate dev
npm run db:seed
npm run dev               # http://localhost:3001

# Frontend (new terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173
```

---

## Excel Sales Import

Supports 3 platforms: **CENTRAL / Robinson**, **MBK / At First**, **Playhouse**

### Workflow
1. Go to **นำเข้าข้อมูลการขาย**
2. Select platform → upload `.xlsx`
3. Preview: ✅ matched / ⚠️ no branch / 🟡 no item / 🔴 invalid
4. Fix unmatched rows inline (type corrected branch code or barcode)
5. Click **นำเข้า N บิล** — matched rows grouped by `(saleDate, branchId)` into IMPORT Bills
6. If duplicates detected → conflict modal; choose cancel or force-import

### Branch matching
Matched by `reportBranchId`. For CENTRAL, `Store Number` column is used (not `Store Name`).

---

## การคัดแยกยอดขายหน้าร้าน

Used when a department store provides a **Consolidated Report** combining booth (บูธ) and in-store (หน้าร้าน) sales.

### Workflow
1. Go to **การคัดแยกยอดขายหน้าร้าน**
2. Select platform → upload Consolidated Report `.xlsx`
3. System fetches submitted POS booth bills for matching branches & dates
4. Net in-store = Consolidated − Booth
5. Preview buckets:
   - ✅ **ยอดขายหน้าร้าน** — ready to import
   - ⚠️ **ต้องตรวจสอบ** — negative result (booth > consolidated); sent to Unresolved Sales
   - 🔴 **ข้อผิดพลาด** — unknown branch/item or orphaned booth scans
6. Click **นำเข้า** → creates IMPORT Bills for net in-store portion

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |
| `FRONTEND_URL` | CORS allowed origin (e.g. `https://pos.example.com`) |
| `PORT` | Nginx listen port (default `80`) |

---

## Project Structure

```
stockcutoff/
├── backend/
│   ├── prisma/           # Schema, migrations, seed
│   └── src/
│       ├── lib/          # audit.ts, excelParsers.ts, prisma.ts
│       ├── middleware/   # auth.ts
│       └── routes/       # auth, bills, branches, categories,
│                         # deptReconcile, items, reports,
│                         # auditLogs, users
├── frontend/
│   └── src/
│       ├── components/   # Layout, Modal
│       ├── context/      # AuthContext
│       └── pages/
│           ├── admin/    # Dashboard, Items, Branches, Users,
│           │             # Reports, ImportSales, UnresolvedSales,
│           │             # DeptReconcile, AuditLogs
│           ├── Bills.tsx
│           └── POS.tsx
├── nginx/
└── docker-compose.yml
```
