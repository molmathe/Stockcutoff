# StockCutoff POS System

Full-stack Point-of-Sale and inventory management web app.

## Features

### POS (Cashier)
- Barcode scanning — USB scanner (auto-Enter) or camera via browser
- Add items to cart, adjust price & per-item discount
- Bill discount & notes
- Save bill, view bill history
- **End of Day** — submit all open bills in one click

### Admin Backend
- **Dashboard** — today's revenue, top items, 7-day trend, branch comparison
- **Items** — CRUD with drag-drop image upload; bulk CSV import; bulk delete; category tagging
- **Categories** — CRUD for product categories
- **Branches** — CRUD with type (ถาวร/ชั่วคราว), external IDs (reportBranchId, bigsellerBranchId), PIN management
- **Users** — CRUD, role management (Super Admin / Branch Admin / Cashier)
- **Reports** — filter by date range & branch; download Excel; **Export Master** (combined POS + import data)
- **Report Templates** *(SUPER_ADMIN)* — configurable column-mapping for Excel import files
- **Import Sales** *(SUPER_ADMIN)* — upload an Excel file, preview every row with match status, then submit matched rows as bills

## Roles

| Role | POS | Items | Branches | Users | Reports | Import |
|------|-----|-------|----------|-------|---------|--------|
| SUPER_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ (all branches) | ✅ |
| BRANCH_ADMIN | ✅ | ✅ | ✅ | ✅ (cashiers only) | ✅ (own branch) | — |
| CASHIER | ✅ | view | — | — | — | — |

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Recharts
- **Backend**: Node.js + Express + TypeScript + Prisma ORM
- **Database**: PostgreSQL 16
- **Reverse Proxy**: Nginx
- **Container**: Docker + Docker Compose
- **CI/CD**: GitHub Actions → GHCR

## Quick Start (Docker)

```bash
# 1. Clone
git clone https://github.com/YOUR_ORG/stockcutoff.git
cd stockcutoff

# 2. Configure
cp .env.example .env
# Edit .env — set DB_PASSWORD and JWT_SECRET

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
| branch_admin | branch123 | Branch Admin (HQ) |
| cashier1 | cashier123 | Cashier (HQ) |
| cashier2 | cashier123 | Cashier (Branch 01) |

> ⚠️ Change all passwords immediately after first login.

## Development

```bash
# Backend
cd backend
cp .env.example .env      # set DATABASE_URL
npm install
npx prisma migrate dev    # creates DB + runs migrations
npm run db:seed           # seed sample data
npm run dev               # http://localhost:3001

# Frontend (new terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173
```

## Cloudflare Tunnel

```bash
# Install cloudflared on your server
# Then create a tunnel pointing to localhost:80
cloudflared tunnel --url http://localhost:80
```

Or use the Cloudflare Zero Trust dashboard to create a persistent tunnel.

## Excel Sales Import (v0.3)

Import sales data from an Excel file exported by an external system (e.g. Bigseller).

### Workflow
1. **Create a Report Template** (`/admin/report-templates`) — map the Excel column headers to the expected fields (date, barcode/SKU, price, qty, branch name/ID).
2. **Configure matching** — choose how to match branches (`name`, `code`, `reportBranchId`, `bigsellerBranchId`) and items (`barcode` or `sku`).
3. **Import Sales** (`/admin/import-sales`) — select the template, upload the `.xlsx` file, click **แสดงตัวอย่าง**.
4. A full-screen preview shows every row with colour-coded status: ✅ matched / ⚠️ no branch / 🟡 no item / 🔴 invalid.
5. Click **นำเข้า N แถว** — matched rows are grouped by `(saleDate, branchId)` into Bills with `source=IMPORT`.

### Export Master
The **ส่งออกข้อมูลหลัก** button on the Reports page exports a single Excel sheet combining both POS-created and imported bills. Columns include: branch name, Bigseller branch ID, SKU, barcode, item name, qty, price, subtotal, sale date, source, bill number.

## CSV Import Format (Items)

Items bulk import accepts CSV with header row:

```csv
sku,barcode,name,description,defaultPrice,category
ITEM001,8850001234567,My Product,Product description,99.00,Electronics
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PASSWORD` | `StrongPass2024!` | PostgreSQL password |
| `JWT_SECRET` | *(change this!)* | JWT signing secret |
| `FRONTEND_URL` | `http://localhost` | CORS allowed origin |
| `PORT` | `80` | Nginx listen port |

## Project Structure

```
stockcutoff/
├── backend/          # Express API + Prisma
│   ├── prisma/       # Schema & seed
│   └── src/
│       ├── middleware/
│       └── routes/
├── frontend/         # React SPA
│   └── src/
│       ├── components/
│       ├── context/
│       └── pages/
│           └── admin/
├── nginx/            # Reverse proxy config
└── docker-compose.yml
```
