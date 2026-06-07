export interface OrderItem {
  Order_ID: string;
  Date: string;
  Product_Name: string;
  Quantity: number;
  Unit_Price: number;
  Revenue: number;
  Region: string;
  [key: string]: any; // Allow indexing for CSV/SQL compatibility
}

export interface SummaryMetrics {
  totalRevenue: number;
  totalOrders: number;
  totalUnits: number;
  avgOrderValue: number;
  topProduct: string;
  topRegion: string;
  regionalData: {
    region: string;
    revenue: number;
    units: number;
    orders: number;
  }[];
  productData: {
    product: string;
    revenue: number;
    units: number;
    avgPrice: number;
  }[];
  monthlyTrend: {
    month: string;
    revenue: number;
    units: number;
    orders: number;
  }[];
}

export type LogSeverity = "info" | "warning" | "success" | "error";

export interface DataCleaningLog {
  id: string;
  timestamp: string;
  severity: LogSeverity;
  type: "duplicate" | "missing" | "whitespace" | "outlier" | "unification";
  message: string;
  details: string;
  count: number;
  resolved: boolean;
}

export interface SQLQueryResult {
  columns: string[];
  rows: any[];
  error?: string;
}
