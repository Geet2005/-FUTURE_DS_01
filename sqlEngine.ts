import alasql from "alasql";
import { OrderItem, SQLQueryResult } from "./types";

/**
 * Execute in-memory SQL queries against the active sales array using AlaSQL
 */
export function executeSQLQuery(queryText: string, salesData: OrderItem[]): SQLQueryResult {
  try {
    // Trim query
    const trimmedQuery = queryText.trim();
    if (!trimmedQuery) {
      return { columns: [], rows: [], error: "Query is empty." };
    }

    // Support standard SQL naming conventions (allow writing FROM sales, FROM orders, FROM dataset)
    // We replace 'FROM sales' or 'FROM sales_data' etc with 'FROM ?' which is AlaSQL's parameter token.
    const sqlExpression = trimmedQuery.replace(
      /\bFROM\s+(sales|sales_data|data|orders|transactions)\b/gi,
      "FROM ?"
    );

    // If there is no parameter token '?' in the query, and not matching system functions, default to adding it
    let finalQuery = sqlExpression;
    const hasQueryPlaceholder = sqlExpression.includes("?");
    const hasFrom = /\bFROM\b/i.test(sqlExpression);
    
    if (hasFrom && !hasQueryPlaceholder) {
      // Find the FROM table name and substitute it with '?'
      finalQuery = sqlExpression.replace(/\bFROM\s+\w+\b/i, "FROM ?");
    }

    // Run AlaSQL on the items array
    const rawResult = alasql(finalQuery, [salesData]);

    if (!rawResult) {
      return { columns: [], rows: [] };
    }

    const rows = Array.isArray(rawResult) ? rawResult : [rawResult];
    
    if (rows.length === 0) {
      return { columns: [], rows: [] };
    }

    // Extract headers
    const firstRow = rows[0];
    let columns: string[] = [];
    if (firstRow && typeof firstRow === "object") {
      columns = Object.keys(firstRow);
    } else {
      columns = ["Value"];
    }

    return { columns, rows };
  } catch (error: any) {
    console.error("SQL Engine Error:", error);
    return {
      columns: [],
      rows: [],
      error: error?.message || "SQL Execution Error. Check your syntax.",
    };
  }
}

/**
 * Helper to generate CSV string from active dataset
 */
export function generateCSVTemplate(data: OrderItem[]): string {
  const headers = ["Order_ID", "Date", "Product_Name", "Quantity", "Unit_Price", "Revenue", "Region"];
  const rows = data.map((item) => [
    item.Order_ID,
    item.Date,
    `"${item.Product_Name.replace(/"/g, '""')}"`,
    item.Quantity,
    item.Unit_Price,
    item.Revenue,
    `"${item.Region.replace(/"/g, '""')}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/**
 * Custom light-weight CSV Parser with quote-escaping support
 */
export function parseCSVData(rawText: string): { data: OrderItem[]; error?: string } {
  try {
    const lines: string[] = [];
    let currentLine = "";
    let insideQuotes = false;

    // Correctly split lines taking quotes with newlines into consideration
    for (let i = 0; i < rawText.length; i++) {
      const char = rawText[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
        currentLine += char;
      } else if (char === "\n" && !insideQuotes) {
        lines.push(currentLine);
        currentLine = "";
      } else if (char === "\r" && !insideQuotes) {
        // Skip CR
      } else {
        currentLine += char;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    if (lines.length < 2) {
      return { data: [], error: "CSV does not contain sufficient rows (requires header & data)." };
    }

    // Parse Headers
    const parseCSVRow = (rowText: string): string[] => {
      const result: string[] = [];
      let entry = "";
      let inQuote = false;
      
      for (let i = 0; i < rowText.length; i++) {
        const char = rowText[i];
        if (char === '"') {
          inQuote = !inQuote;
        } else if (char === "," && !inQuote) {
          result.push(entry.trim());
          entry = "";
        } else {
          entry += char;
        }
      }
      result.push(entry.trim());
      return result.map(v => v.replace(/^"|"$/g, "").replace(/""/g, '"'));
    };

    const headers = parseCSVRow(lines[0]).map(h => h.trim());
    
    // Check if critical columns roughly exist, or compile them
    const mappedItems: OrderItem[] = [];

    for (let idx = 1; idx < lines.length; idx++) {
      const line = lines[idx].trim();
      if (!line) continue;

      const cells = parseCSVRow(line);
      const rowObj: any = {};
      headers.forEach((header, cellIdx) => {
        rowObj[header] = cells[cellIdx] !== undefined ? cells[cellIdx] : "";
      });

      // Normalization
      // Try to find columns regardless of casing or underscores
      const getVal = (possibleKeys: string[]): string => {
        for (const pk of possibleKeys) {
          // exact
          if (rowObj[pk] !== undefined) return String(rowObj[pk]);
          // case insensitive
          const foundKey = Object.keys(rowObj).find(k => k.toLowerCase() === pk.toLowerCase());
          if (foundKey) return String(rowObj[foundKey]);
          // replaced symbols
          const foundSymbolKey = Object.keys(rowObj).find(
            k => k.toLowerCase().replace(/_/g, "") === pk.toLowerCase().replace(/_/g, "")
          );
          if (foundSymbolKey) return String(rowObj[foundSymbolKey]);
        }
        return "";
      };

      const orderId = getVal(["Order_ID", "OrderID", "order_id", "id", "Order_Number"]) || `ORD-CSV-${2000 + idx}`;
      const dateVal = getVal(["Date", "date", "sale_date", "Date_Of_Sale", "Order_Date"]) || new Date().toISOString().split("T")[0];
      const productName = getVal(["Product_Name", "ProductName", "product_name", "product", "Item"]) || "Imported Product";
      const quantityStr = getVal(["Quantity", "qty", "quantity", "units", "Units_Sold"]);
      const unitPriceStr = getVal(["Unit_Price", "UnitPrice", "unit_price", "price", "Rate"]);
      const revenueStr = getVal(["Revenue", "revenue", "sales", "Total_Amount"]);
      const region = getVal(["Region", "region", "sales_location", "Location", "State"]) || "Global";

      const quantity = quantityStr ? Number(quantityStr) : 1;
      const unitPrice = unitPriceStr ? Number(unitPriceStr) : 0;
      const revenue = revenueStr ? Number(revenueStr) : (quantity * unitPrice);

      mappedItems.push({
        Order_ID: orderId,
        Date: dateVal,
        Product_Name: productName,
        Quantity: isNaN(quantity) ? 1 : quantity,
        Unit_Price: isNaN(unitPrice) ? 0 : unitPrice,
        Revenue: isNaN(revenue) ? 0 : revenue,
        Region: region,
      });
    }

    return { data: mappedItems };
  } catch (err: any) {
    return { data: [], error: err?.message || "Failed parsing CSV data format." };
  }
}
