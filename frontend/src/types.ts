export interface Category {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type BranchType = 'PERMANENT' | 'TEMPORARY';

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  type: BranchType;
  reportBranchId: string | null;
  bigsellerBranchId: string | null;
  tags: string[];
  pincode?: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'CASHIER';
  branchId: string | null;
  branch: Branch | null;
  active: boolean;
  isSystem?: boolean;
  posMode?: boolean;
  createdAt: string;
}

export interface Item {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  defaultPrice: string;
  category: string | null;
  active: boolean;
  createdAt: string;
}

export interface BillItem {
  id: string;
  itemId: string;
  item?: Pick<Item, 'id' | 'name' | 'sku' | 'barcode' | 'imageUrl'> | null;
  quantity: number;
  price: string;
  discount: string;
  subtotal: string;
}

export interface Bill {
  id: string;
  billNumber: string;
  branchId: string;
  branch: Pick<Branch, 'id' | 'name' | 'code'>;
  userId: string;
  user: { id: string; name: string };
  status: 'OPEN' | 'SUBMITTED' | 'CANCELLED';
  source: 'POS' | 'IMPORT';
  saleDate: string | null;
  subtotal: string;
  discount: string;
  total: string;
  notes: string | null;
  createdAt: string;
  submittedAt: string | null;
  items: BillItem[];
}

export interface TodaySummary {
  totalBills: number;
  openBills: number;
  submittedBills: number;
  totalRevenue: number;
  openRevenue: number;
  totalItems: number;
  bills: Bill[];
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string | null;
  columnDate: string | null;
  columnBarcode: string | null;
  columnSku: string | null;
  columnPrice: string;
  columnQty: string;
  columnBranchId: string | null;
  columnBranchName: string | null;
  branchMatchBy: string;
  itemMatchBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportPreviewRow {
  rowNum: number;
  rawDate: string;
  saleDate: string | null;
  rawBranch: string;
  branchId: string | null;
  branchName: string;
  rawItem: string;
  itemId: string | null;
  itemName: string;
  itemSku: string;
  itemBarcode: string;
  qty: number;
  price: number;
  status: 'matched' | 'no_branch' | 'no_item' | 'invalid';
  errors: string[];
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  stats: {
    total: number;
    matched: number;
    unmatched: number;
    totalQty: number;
    totalRevenue: number;
    truncated?: boolean;
    maxRows?: number;
  };
}
