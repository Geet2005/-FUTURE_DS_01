import { OrderItem, DataCleaningLog, SummaryMetrics } from "./types";

// Base products and rates
export const PRODUCT_PRICES: Record<string, number> = {
  "Enterprise Cloud Analytics": 1200,
  "Pro CRM Integration Suite": 450,
  "Basic Sales Automation Hub": 150,
  "AI Customer Sentiment Bot": 300,
  "Automated Reporting Daemon": 100,
  "Database Replication Pipeline": 750,
};

// Generates starting dataset covering multiple months in 2026
const generateCleanDatabase = (): OrderItem[] => {
  const data: OrderItem[] = [];
  const regions = ["North", "South", "East", "West", "Midwest"];
  const products = Object.keys(PRODUCT_PRICES);
  
  // Base sales timeline (Jan 1, 2026 to May 28, 2026)
  const startDate = new Date("2026-01-05");
  let orderNumber = 1000;

  // Let's create ~60 items with custom distributions
  for (let i = 0; i < 65; i++) {
    orderNumber += 3;
    const orderId = `ORD-2026-${orderNumber}`;
    
    // Distribute dates across Jan-May
    const dateOffsetDays = i * 2.2;
    const orderDate = new Date(startDate.getTime() + dateOffsetDays * 24 * 60 * 60 * 1000);
    const dateString = orderDate.toISOString().split("T")[0];

    // Distribute products and regions in pseudo-random stable patterns
    const productIndex = (i * 3 + 1) % products.length;
    const regionIndex = (i * 7) % regions.length;
    
    const productName = products[productIndex];
    const unitPrice = PRODUCT_PRICES[productName];
    
    // Vary quantities (mostly 1 to 10)
    let quantity = ((i * 4) % 6) + 1;
    if (productName === "Enterprise Cloud Analytics" && quantity > 3) {
      quantity = Math.max(1, quantity - 3); // High value products have smaller quantities
    } else if (productName === "Automated Reporting Daemon") {
      quantity = quantity + 4; // Low-value product gets higher quantities
    }

    const revenue = quantity * unitPrice;

    data.push({
      Order_ID: orderId,
      Date: dateString,
      Product_Name: productName,
      Quantity: quantity,
      Unit_Price: unitPrice,
      Revenue: revenue,
      Region: regions[regionIndex],
    });
  }

  return data;
};

const BASE_CLEAN_DATA = generateCleanDatabase();

// Deliberately introduce dirty records to simulate CSV issues
export const INITIAL_DIRTY_DATA: OrderItem[] = [
  ...BASE_CLEAN_DATA,
  
  // 1. DUPLICATE: exact same record duplicated
  {
    Order_ID: "ORD-2026-1015", // Already in BASE_CLEAN_DATA index 5 approx. Let's make exact copies
    Date: "2026-01-16",
    Product_Name: "Pro CRM Integration Suite",
    Quantity: 2,
    Unit_Price: 450,
    Revenue: 900,
    Region: "South",
  },
  {
    Order_ID: "ORD-2026-1015",
    Date: "2026-01-16",
    Product_Name: "Pro CRM Integration Suite",
    Quantity: 2,
    Unit_Price: 450,
    Revenue: 900,
    Region: "South",
  },

  // 2. WHITESPACE & CHARACTER CASING INCONSISTENCIES
  {
    Order_ID: "ORD-2026-1215",
    Date: "2026-03-30",
    Product_Name: " ai customer sentiment bot  ", // casing and spaces
    Quantity: 3,
    Unit_Price: 300,
    Revenue: 900,
    Region: "  West ", // spaces
  },
  {
    Order_ID: "ORD-2026-1218",
    Date: "2026-04-02",
    Product_Name: "Enterprise Cloud Analytics",
    Quantity: 1,
    Unit_Price: 1200,
    Revenue: 1200,
    Region: "north", // lowercase
  },

  // 3. MISSING/NAN METRICS
  {
    Order_ID: "ORD-2026-1225",
    Date: "2026-04-12",
    Product_Name: "Basic Sales Automation Hub",
    Quantity: 5,
    Unit_Price: 0, // Missing price
    Revenue: 750, // Revenue exists, so price can be calculated
    Region: "East",
  },
  {
    Order_ID: "ORD-2026-1230",
    Date: "2026-04-18",
    Product_Name: "Automated Reporting Daemon",
    Quantity: 0, // Missing quantity
    Unit_Price: 100, // Unit Price exists
    Revenue: 800, // Revenue exists, so quantity can be inferred as 8
    Region: "Midwest",
  },
  {
    Order_ID: "ORD-2026-1240",
    Date: "2026-04-28",
    Product_Name: "Database Replication Pipeline",
    Quantity: 2,
    Unit_Price: 750,
    Revenue: 0, // Revenue calculation is missing/0
    Region: "North",
  },

  // 4. METRIC INCONSISTENCIES (typo in calculation)
  {
    Order_ID: "ORD-2026-1255",
    Date: "2026-05-15",
    Product_Name: "Pro CRM Integration Suite",
    Quantity: 4,
    Unit_Price: 450,
    Revenue: 1500, // Mathematically bad: 4 * 450 is 1800, not 1500.
    Region: "West",
  },
];

/**
 * Intelligent Data Cleaning Algorithm
 * Audits the dataset and builds a list of logs, returning correct items.
 */
export function auditAndCleanData(rawItems: OrderItem[]): {
  cleaned: OrderItem[];
  logs: DataCleaningLog[];
} {
  const logs: DataCleaningLog[] = [];
  const cleaned: OrderItem[] = [];
  const seenOrderIds = new Set<string>();

  let duplicateCount = 0;
  let whitespaceCount = 0;
  let missingCount = 0;
  let inconsistencyCount = 0;

  // Track duplicated rows precisely to isolate them
  const orderIdFreq: Record<string, number> = {};
  rawItems.forEach((it) => {
    const oid = String(it.Order_ID).trim();
    orderIdFreq[oid] = (orderIdFreq[oid] || 0) + 1;
  });

  rawItems.forEach((item, index) => {
    let hasChanges = false;
    
    // Copy item to avoid direct mutation
    const record: OrderItem = { ...item };

    // 1. Sanitize standard string types
    const rawId = String(record.Order_ID || "").trim();
    if (rawId !== record.Order_ID) {
      record.Order_ID = rawId;
      hasChanges = true;
    }

    // Handing IDs
    if (!record.Order_ID) {
      record.Order_ID = `ORD-TEMP-${1000 + index}`;
      logs.push({
        id: `missing-id-${index}`,
        timestamp: new Date().toISOString(),
        severity: "warning",
        type: "missing",
        message: `Missing Order_ID at row ${index + 1}`,
        details: `Assigned temporary ID ${record.Order_ID}`,
        count: 1,
        resolved: true,
      });
      hasChanges = true;
    }

    // 2. Check for exact duplications
    if (seenOrderIds.has(record.Order_ID)) {
      duplicateCount++;
      return; // Skip adding this item
    }
    seenOrderIds.add(record.Order_ID);

    // 3. Region white space & casing standardization
    let rawRegion = String(record.Region || "").trim();
    if (rawRegion) {
      // Capitalize first letter (e.g. north -> North)
      const capitalized = rawRegion.charAt(0).toUpperCase() + rawRegion.slice(1).toLowerCase();
      if (capitalized !== record.Region) {
        record.Region = capitalized;
        whitespaceCount++;
        hasChanges = true;
      }
    } else {
      record.Region = "Unspecified";
      missingCount++;
      hasChanges = true;
    }

    // 4. Product Name whitespace & casing standardization
    let rawProduct = String(record.Product_Name || "").trim();
    if (rawProduct) {
      // Match against known product catalogs (case-insensitive replacement)
      const lowercaseProduct = rawProduct.toLowerCase();
      let matchedName = record.Product_Name;
      for (const knownName of Object.keys(PRODUCT_PRICES)) {
        if (knownName.toLowerCase() === lowercaseProduct) {
          matchedName = knownName;
          break;
        }
      }

      if (matchedName !== record.Product_Name || rawProduct !== record.Product_Name) {
        record.Product_Name = matchedName;
        whitespaceCount++;
        hasChanges = true;
      }
    } else {
      record.Product_Name = "Unknown Product";
      missingCount++;
      hasChanges = true;
    }

    // 5. Numerical Parsing and Inference
    let qty = Number(record.Quantity);
    let price = Number(record.Unit_Price);
    let rev = Number(record.Revenue);

    // If unit price is missing but revenue and qty exist
    if ((isNaN(price) || price <= 0) && !isNaN(rev) && rev > 0 && !isNaN(qty) && qty > 0) {
      price = Number((rev / qty).toFixed(2));
      record.Unit_Price = price;
      missingCount++;
      hasChanges = true;
    }

    // Use product catalog fallback for price if still missing
    if ((isNaN(price) || price <= 0) && record.Product_Name && PRODUCT_PRICES[record.Product_Name]) {
      price = PRODUCT_PRICES[record.Product_Name];
      record.Unit_Price = price;
      missingCount++;
      hasChanges = true;
    }

    // If quantity is missing/0 but revenue and price exist
    if ((isNaN(qty) || qty <= 0) && !isNaN(rev) && rev > 0 && price > 0) {
      qty = Math.round(rev / price);
      record.Quantity = qty;
      missingCount++;
      hasChanges = true;
    }

    // Base fallback quantities
    if (isNaN(qty) || qty < 0) {
      qty = 1;
      record.Quantity = qty;
      missingCount++;
      hasChanges = true;
    }

    // Ensure price is a clean float
    if (isNaN(price) || price < 0) {
      price = 0;
      record.Unit_Price = price;
    }

    // Recalculate mathematical revenue consistency
    const mathematicallyCorrectRevenue = qty * price;
    if (isNaN(rev) || Math.abs(rev - mathematicallyCorrectRevenue) > 0.01) {
      record.Revenue = mathematicallyCorrectRevenue;
      inconsistencyCount++;
      hasChanges = true;
    }

    // 6. Handle Dates
    let dateStr = String(record.Date || "").trim();
    if (!dateStr || isNaN(Date.parse(dateStr))) {
      // Use fallback date (default mid-point)
      record.Date = "2026-03-15";
      missingCount++;
      hasChanges = true;
    } else {
      // Re-format to clean YYYY-MM-DD
      const dateObj = new Date(dateStr);
      record.Date = dateObj.toISOString().split("T")[0];
    }

    cleaned.push(record);
  });

  // Compile aggregate log entries for professional insight
  if (duplicateCount > 0) {
    logs.push({
      id: "dup-log",
      timestamp: new Date().toISOString(),
      severity: "warning",
      type: "duplicate",
      message: `Detected ${duplicateCount} fully duplicated sale row(s)`,
      details: "Removed duplicate database files based on Order_ID collision to secure data correctness.",
      count: duplicateCount,
      resolved: true,
    });
  }

  if (whitespaceCount > 0) {
    logs.push({
      id: "ws-log",
      timestamp: new Date().toISOString(),
      severity: "success",
      type: "whitespace",
      message: `Standardized ${whitespaceCount} product names and region strings`,
      details: "Trimmed trailing/leading whitespaces and normalized inconsistent text casing (e.g., 'north' -> 'North').",
      count: whitespaceCount,
      resolved: true,
    });
  }

  if (missingCount > 0) {
    logs.push({
      id: "missing-log",
      timestamp: new Date().toISOString(),
      severity: "warning",
      type: "missing",
      message: `Inferred or repaired ${missingCount} missing value metrics`,
      details: "Reconstructed missing fields (e.g. Unit_Price derived from Revenue/Quantity or default product catalogs).",
      count: missingCount,
      resolved: true,
    });
  }

  if (inconsistencyCount > 0) {
    logs.push({
      id: "inc-log",
      timestamp: new Date().toISOString(),
      severity: "warning",
      type: "outlier",
      message: `Resolved ${inconsistencyCount} revenue reporting inconsistencies`,
      details: "Recalculated mathematically inconsistent Revenue cells (Revenue = Quantity * Unit_Price).",
      count: inconsistencyCount,
      resolved: true,
    });
  }

  // If everything is spotless (or after cleaning is run)
  if (logs.length === 0) {
    logs.push({
      id: "perfect-log",
      timestamp: new Date().toISOString(),
      severity: "success",
      type: "unification",
      message: "Database check successfully passed with zero anomalies",
      details: "All transaction structures align mathematically and follow high data definition parameters.",
      count: 0,
      resolved: true,
    });
  }

  return { cleaned, logs };
}

/**
 * Generate Summary Metrics for charting
 */
export function calculateSummaryMetrics(items: OrderItem[]): SummaryMetrics {
  let totalRevenue = 0;
  let totalUnits = 0;
  let totalOrders = items.length;

  const productRev: Record<string, { rev: number; qty: number }> = {};
  const regionRev: Record<string, { rev: number; qty: number; count: number }> = {};
  const monthlyRev: Record<string, { rev: number; qty: number; count: number }> = {};

  items.forEach((item) => {
    const rev = Number(item.Revenue) || 0;
    const qty = Number(item.Quantity) || 0;

    totalRevenue += rev;
    totalUnits += qty;

    // Product aggregate
    const prod = item.Product_Name || "Unknown Product";
    if (!productRev[prod]) productRev[prod] = { rev: 0, qty: 0 };
    productRev[prod].rev += rev;
    productRev[prod].qty += qty;

    // Region aggregate
    const reg = item.Region || "Unspecified";
    if (!regionRev[reg]) regionRev[reg] = { rev: 0, qty: 0, count: 0 };
    regionRev[reg].rev += rev;
    regionRev[reg].qty += qty;
    regionRev[reg].count += 1;

    // Date/Month trend
    // Date standard is YYYY-MM-DD
    let month = "2026-03"; // fallback
    if (item.Date && item.Date.length >= 7) {
      month = item.Date.substring(0, 7); // Gets "YYYY-MM"
    }
    if (!monthlyRev[month]) monthlyRev[month] = { rev: 0, qty: 0, count: 0 };
    monthlyRev[month].rev += rev;
    monthlyRev[month].qty += qty;
    monthlyRev[month].count += 1;
  });

  // Calculate top-performing metrics
  let topProduct = "None";
  let topProductRev = -1;
  Object.entries(productRev).forEach(([name, val]) => {
    if (val.rev > topProductRev) {
      topProduct = name;
      topProductRev = val.rev;
    }
  });

  let topRegion = "None";
  let topRegionRev = -1;
  Object.entries(regionRev).forEach(([name, val]) => {
    if (val.rev > topRegionRev) {
      topRegion = name;
      topRegionRev = val.rev;
    }
  });

  // Map into structured arrays for recharts
  const regionalData = Object.entries(regionRev).map(([region, val]) => ({
    region,
    revenue: Math.round(val.rev),
    units: val.qty,
    orders: val.count,
  })).sort((a, b) => b.revenue - a.revenue);

  const productData = Object.entries(productRev).map(([product, val]) => ({
    product,
    revenue: Math.round(val.rev),
    units: val.qty,
    avgPrice: Math.round((val.rev / (val.qty || 1)) * 100) / 100,
  })).sort((a, b) => b.revenue - a.revenue);

  const monthlyTrend = Object.entries(monthlyRev).map(([month, val]) => ({
    month,
    revenue: Math.round(val.rev),
    units: val.qty,
    orders: val.count,
  })).sort((a, b) => a.month.localeCompare(b.month));

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    totalUnits,
    avgOrderValue: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
    topProduct,
    topRegion,
    regionalData,
    productData,
    monthlyTrend,
  };
}
