import { useState, useMemo, useEffect, useRef } from "react";
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Package,
  MapPin,
  Calendar,
  Search,
  RefreshCw,
  FileText,
  Database,
  Sparkles,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  ChevronRight,
  Info,
  Terminal,
  Send,
  User,
  Bot,
  Maximize2,
  Check,
  HelpCircle,
  FileSpreadsheet,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import Markdown from "react-markdown";

import { OrderItem, DataCleaningLog, SQLQueryResult, SummaryMetrics } from "./types";
import {
  INITIAL_DIRTY_DATA,
  auditAndCleanData,
  calculateSummaryMetrics,
  PRODUCT_PRICES,
} from "./data";
import { executeSQLQuery, generateCSVTemplate, parseCSVData } from "./sqlEngine";

export default function App() {
  // --- CORE DATA STATES ---
  const [salesData, setSalesData] = useState<OrderItem[]>(INITIAL_DIRTY_DATA);
  const [cleanMode, setCleanMode] = useState<boolean>(false);
  const [dbName, setDbName] = useState<"Sample Database" | "Uploaded CSV File">("Sample Database");
  const [selectedTab, setSelectedTab] = useState<"dashboard" | "csv" | "sql" | "ai">("dashboard");

  // --- FILTER STATES ---
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterRegion, setFilterRegion] = useState<string>("All");
  const [filterProduct, setFilterProduct] = useState<string>("All");

  // Get date bounds of current dataset config
  const dateRangeBounds = useMemo(() => {
    if (salesData.length === 0) return { min: "", max: "" };
    const dates = salesData.map((d) => d.Date).filter((d) => !!d).sort();
    return {
      min: dates[0] || "",
      max: dates[dates.length - 1] || "",
    };
  }, [salesData]);

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Sync date sliders on database change
  useEffect(() => {
    setStartDate(dateRangeBounds.min);
    setEndDate(dateRangeBounds.max);
  }, [dateRangeBounds]);

  // --- COMPILING DETECTED ANOMALIES ---
  const auditResult = useMemo(() => {
    return auditAndCleanData(salesData);
  }, [salesData]);

  // Working records depends on cleanMode toggle
  const activeRecords = useMemo(() => {
    return cleanMode ? auditResult.cleaned : salesData;
  }, [cleanMode, salesData, auditResult]);

  // Active unique values for selectors
  const uniqueRegions = useMemo(() => {
    return ["All", ...Array.from(new Set(activeRecords.map((r) => r.Region).filter(Boolean)))];
  }, [activeRecords]);

  const uniqueProducts = useMemo(() => {
    return ["All", ...Array.from(new Set(activeRecords.map((r) => r.Product_Name).filter(Boolean)))];
  }, [activeRecords]);

  // Filter application
  const filteredRecords = useMemo(() => {
    return activeRecords.filter((item) => {
      const matchesRegion = filterRegion === "All" || item.Region.toLowerCase().trim() === filterRegion.toLowerCase().trim();
      const matchesProduct = filterProduct === "All" || item.Product_Name.toLowerCase().trim() === filterProduct.toLowerCase().trim();
      
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query ||
        item.Order_ID.toLowerCase().includes(query) ||
        item.Product_Name.toLowerCase().includes(query) ||
        item.Region.toLowerCase().includes(query);

      const matchesDate =
        (!startDate || item.Date >= startDate) &&
        (!endDate || item.Date <= endDate);

      return matchesRegion && matchesProduct && matchesSearch && matchesDate;
    });
  }, [activeRecords, filterRegion, filterProduct, searchQuery, startDate, endDate]);

  // Dynamic Metrics summaries
  const metrics = useMemo(() => {
    return calculateSummaryMetrics(filteredRecords);
  }, [filteredRecords]);

  // Pre-load full catalog metrics for absolute comparative analytics
  const wholeDataMetrics = useMemo(() => {
    return calculateSummaryMetrics(activeRecords);
  }, [activeRecords]);

  // --- SQL PLAYGROUND STATES ---
  const [sqlQuery, setSqlQuery] = useState<string>(
    "SELECT Product_Name, SUM(Revenue) AS Revenue, SUM(Quantity) AS Units FROM sales GROUP BY Product_Name ORDER BY Revenue DESC"
  );
  const [sqlResult, setSqlResult] = useState<SQLQueryResult | null>(null);
  
  // SQL plot configurations
  const [sqlChartType, setSqlChartType] = useState<"bar" | "line" | "pie" | "none">("bar");
  const [sqlXColumn, setSqlXColumn] = useState<string>("");
  const [sqlYColumn, setSqlYColumn] = useState<string>("");

  // Run default query when data or clean state changes
  useEffect(() => {
    handleExecuteSQL(sqlQuery);
  }, [activeRecords]);

  const handleExecuteSQL = (queryToExecute: string) => {
    const res = executeSQLQuery(queryToExecute, activeRecords);
    setSqlResult(res);
    
    // Auto configure default charting columns for plotting SQL output
    if (res.columns.length >= 2 && !res.error) {
      setSqlXColumn(res.columns[0]);
      
      // Look for a numeric column for Y axis
      const numericCol = res.columns.find((col) => {
        if (col === res.columns[0]) return false;
        const val = res.rows[0]?.[col];
        return typeof val === "number" || !isNaN(Number(val));
      });
      setSqlYColumn(numericCol || res.columns[1]);
      setSqlChartType("bar");
    } else {
      setSqlChartType("none");
    }
  };

  // --- CSV UPLOAD & TEMPLATE PROCESSING ---
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [csvRawInput, setCsvRawInput] = useState<string>("");
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCSVTextSubmit = () => {
    if (!csvRawInput.trim()) {
      setCsvError("Casting error: Copy-paste string is empty.");
      return;
    }
    const res = parseCSVData(csvRawInput);
    if (res.error) {
      setCsvError(res.error);
    } else if (res.data.length === 0) {
      setCsvError("Empty dataset parsed. Verify headers and row alignment.");
    } else {
      setSalesData(res.data);
      setDbName("Uploaded CSV File");
      setCleanMode(false); // require new audit on loaded custom CSV
      setCsvError(null);
      setSelectedTab("dashboard");
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        setCsvRawInput(text);
        const res = parseCSVData(text);
        if (res.error) {
          setCsvError(res.error);
        } else if (res.data.length === 0) {
          setCsvError("File contains no aligned rows.");
        } else {
          setSalesData(res.data);
          setDbName("Uploaded CSV File");
          setCleanMode(false);
          setCsvError(null);
          setSelectedTab("dashboard");
        }
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerRawFile = () => {
    fileInputRef.current?.click();
  };

  const resetToSample = () => {
    setSalesData(INITIAL_DIRTY_DATA);
    setDbName("Sample Database");
    setCleanMode(false);
    setSearchQuery("");
    setFilterRegion("All");
    setFilterProduct("All");
  };

  const downloadSampleTemplate = () => {
    const csvContent = generateCSVTemplate(INITIAL_DIRTY_DATA);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "business_sales_template_raw.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- SECURE AI CONSULTANT SERVER-SIDE INTEGRATION ---
  const [aiName, setAiName] = useState<string>("ApexIntel BI");
  const [aiModel, setAiModel] = useState<string>("gemini-3.5-flash");
  const [aiPersona, setAiPersona] = useState<string>("executive");

  const [aiReport, setAiReport] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiQuestion, setAiQuestion] = useState<string>("");
  const [chats, setChats] = useState<{ role: "user" | "model"; text: string }[]>([
    {
      role: "model",
      text: "Welcome to your executive intelligence suite. I am your specialized AI Business Analytics Consultant. I have loaded your metrics. Select '**Generate Executive Intelligence Report**' above to get a deep SWOT diagnostic, or ask me any question about your sales performance below!",
    },
  ]);

  const generateAIReport = async () => {
    setAiLoading(true);
    try {
      const response = await fetch("/api/analyze-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: wholeDataMetrics,
          recentPerformance: activeRecords.slice(0, 15),
          model: aiModel,
          aiName: aiName,
          persona: aiPersona,
        }),
      });
      const data = await response.json();
      if (data.report) {
        setAiReport(data.report);
        // Automatically inject report into consultant history as model contribution
        setChats((prev) => [
          ...prev,
          { role: "user", text: "Please generate the strategic executive diagnostic report." },
          { role: "model", text: "### Executive Statement Released\n\nI have compiled the comprehensive report. You can review its full contents inside the layout viewer. Let me know if you would like me to draft an email to the board summarizing these points!" },
        ]);
      } else {
        throw new Error(data.error || "Malformed API Response");
      }
    } catch (err: any) {
      console.error(err);
      setAiReport(`### ⚠️ Analysis Pipeline Interrupted\n\nError: ${err?.message || "Failed communicating with Server-Side Analytics service."}\n\nMake sure your **GEMINI_API_KEY** is configured securely inside AI Studio's Settings > Secrets panel.`);
    } finally {
      setAiLoading(false);
    }
  };

  const submitAiQuestion = async (prebuiltQuestion?: string) => {
    const questionText = prebuiltQuestion || aiQuestion;
    if (!questionText.trim()) return;

    const userMessage = questionText;
    setChats((prev) => [...prev, { role: "user", text: userMessage }]);
    if (!prebuiltQuestion) setAiQuestion("");

    setAiLoading(true);

    try {
      const response = await fetch("/api/analyze-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: wholeDataMetrics,
          question: userMessage,
          recentPerformance: activeRecords.slice(0, 15),
          model: aiModel,
          aiName: aiName,
          persona: aiPersona,
        }),
      });
      const data = await response.json();
      if (data.report) {
        setChats((prev) => [...prev, { role: "model", text: data.report }]);
      } else {
        throw new Error(data.error || "Could not retrieve analytical feedback.");
      }
    } catch (err: any) {
      setChats((prev) => [
        ...prev,
        {
          role: "model",
          text: `⚠️ **System Integration Error**: ${err?.message || "Failed communicating with the analytics server. Verify your connection settings."}`,
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // Predefined queries to select
  const SQL_PRESETS = [
    {
      name: "Top Products Revenue",
      query: "SELECT Product_Name, SUM(Revenue) AS Revenue, SUM(Quantity) AS Units FROM sales GROUP BY Product_Name ORDER BY Revenue DESC",
    },
    {
      name: "Regional Orders Share",
      query: "SELECT Region, COUNT(Order_ID) AS Orders, SUM(Revenue) AS Revenue FROM sales GROUP BY Region ORDER BY Revenue DESC",
    },
    {
      name: "Monthly Summary & Growth",
      query: "SELECT strftime('%Y-%m', Date) AS Month, SUM(Revenue) AS Monthly_Revenue FROM sales GROUP BY Month ORDER BY Month",
    },
    {
      name: "High Value Flag (Outliers)",
      query: "SELECT Order_ID, Date, Product_Name, Quantity, Revenue, Region FROM sales WHERE Revenue > 1000 ORDER BY Revenue DESC",
    },
  ];

  // Colors for Recharts palette
  const CHART_COLORS = ["#4f46e5", "#10b981", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6"];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      
      {/* --- BUSINESS INTELLIGENCE HEADER RAIL --- */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs" id="applet-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-150" id="applet-logo-container">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display tracking-tight text-slate-900" id="main-title">
                Sales Analytics & Strategic Intel
              </h1>
              <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5" id="developer-credits">
                <span>Enterprise Business Intelligence Portal</span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                <span className="text-indigo-600 flex items-center gap-0.5 font-semibold">
                  <Sparkles className="w-3 h-3 inline" /> Powered by {aiName} Analytics
                </span>
              </p>
            </div>
          </div>

          {/* ACTIVE DATABASE ENVIRONMENT SUMMARY */}
          <div className="flex flex-wrap items-center gap-2.5" id="portal-status-deck">
            
            {/* Database indicator */}
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono text-slate-600">
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span>DB: {dbName === "Sample Database" ? "SAMPLE_SALES" : "CUSTOM_CSV"}</span>
            </div>

            {/* Sanitization Integrity Indicator */}
            {cleanMode ? (
              <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 text-xs text-emerald-700 font-semibold shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>● INTEGRITY: SANITIZED</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 text-xs text-amber-800 font-semibold animate-pulse shadow-2xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>● INTEGRITY: RAW ({auditResult.logs.filter((l) => l.type !== "unification").length} ANOMALIES)</span>
              </div>
            )}

            {/* Clean Data Global Action */}
            {!cleanMode && (
              <button
                onClick={() => setCleanMode(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-3.5 py-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1"
                id="header-clean-button"
              >
                <RefreshCw className="w-3 h-3 animate-spin duration-1000" />
                Audit & Repair Data
              </button>
            )}

            {cleanMode && (
              <button
                onClick={() => setCleanMode(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs px-3.5 py-1.5 rounded-lg transition-all"
                id="header-raw-toggle"
              >
                View Raw Data
              </button>
            )}
          </div>
        </div>
      </header>

      {/* --- RECONSTRUCTIVE DATA INTEGRITY WARNING BANNER --- */}
      {!cleanMode && (
        <div className="bg-amber-500 text-white py-2 px-4 shadow-inner" id="integrity-warning-strip">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs sm:text-sm font-medium gap-2">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-white shrink-0" />
              <span>
                <strong>Warning: Data Quality Impaired!</strong> Outliers, casing duplicates, blank unit rates, and mathematical calculation drifts detected in input data source.
              </span>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCleanMode(true);
                  setSelectedTab("csv");
                }}
                className="underline font-bold text-white hover:text-indigo-100 bg-amber-600 px-2.5 py-1 rounded transition-colors text-xs"
              >
                Investigate Integrity Logs
              </button>
              <button
                onClick={() => setCleanMode(true)}
                className="bg-white text-slate-900 font-semibold px-3 py-1 rounded shadow-xs text-xs hover:bg-slate-100 transition-colors"
              >
                Auto-Repair Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MAIN PAGE CONTENT WRAPPER --- */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">

        {/* --- NAVIGATION WORKSPACE TABS --- */}
        <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-px" id="workspace-tabs-strip">
          <button
            onClick={() => setSelectedTab("dashboard")}
            className={`px-5 py-3 text-sm font-medium transition-all flex items-center gap-2 shrink-0 border-b-2 ${
              selectedTab === "dashboard"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
            id="tab-dashboard"
          >
            <TrendingUp className="w-4 h-4" />
            Active Business Dashboard
          </button>
          <button
            onClick={() => setSelectedTab("csv")}
            className={`px-5 py-3 text-sm font-medium transition-all flex items-center gap-2 shrink-0 border-b-2 ${
              selectedTab === "csv"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
            id="tab-csv"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Integrate CSV & Auditing
            {!cleanMode && (
              <span className="w-2 h-2 rounded-full bg-amber-500 block"></span>
            )}
          </button>
          <button
            onClick={() => setSelectedTab("sql")}
            className={`px-5 py-3 text-sm font-medium transition-all flex items-center gap-2 shrink-0 border-b-2 ${
              selectedTab === "sql"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
            id="tab-sql"
          >
            <Terminal className="w-4 h-4" />
            Real-Time SQL Terminal
          </button>
          <button
            onClick={() => setSelectedTab("ai")}
            className={`px-5 py-3 text-sm font-medium transition-all flex items-center gap-2 shrink-0 border-b-2 relative ${
              selectedTab === "ai"
                ? "border-indigo-600 text-indigo-600 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
            id="tab-ai"
          >
            <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
            ApexIntel Strategic Advisor
            <span className="absolute -top-1 right-0 bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-indigo-200">
              AI Powered
            </span>
          </button>
        </div>

        {/* --- GLOBAL QUICK FILTERS PANEL (Only shown in dashboard tab) --- */}
        {selectedTab === "dashboard" && (
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs flex flex-col gap-4" id="filters-deck">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-800">
                <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
                <span>Workspace Filters & Timeline Controls</span>
              </div>
              
              {/* Reset to Samples */}
              <div className="flex items-center gap-2 text-xs">
                {dbName === "Uploaded CSV File" && (
                  <button
                    onClick={resetToSample}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 border border-indigo-200 px-2.5 py-1.5 rounded-lg bg-indigo-50/50 hover:bg-indigo-50 transition-colors"
                  >
                    <Database className="w-3.5 h-3.5" />
                    Reset to Sample Database
                  </button>
                )}
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setFilterRegion("All");
                    setFilterProduct("All");
                    setStartDate(dateRangeBounds.min);
                    setEndDate(dateRangeBounds.max);
                  }}
                  className="text-slate-500 hover:text-slate-800 font-semibold hover:underline"
                >
                  Clear All Filters
                </button>
              </div>
            </div>

            {/* Input Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Query Order ID or product..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9.5 pr-3 text-sm focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all font-medium"
                />
              </div>

              {/* Region */}
              <div>
                <select
                  value={filterRegion}
                  onChange={(e) => setFilterRegion(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all font-medium"
                >
                  <option value="All">All Regions ({uniqueRegions.length - 1})</option>
                  {uniqueRegions.filter((r) => r !== "All").map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Product */}
              <div>
                <select
                  value={filterProduct}
                  onChange={(e) => setFilterProduct(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all font-medium"
                >
                  <option value="All">All Products ({uniqueProducts.length - 1})</option>
                  {uniqueProducts.filter((p) => p !== "All").map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Date Start */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 flex flex-col text-[10px] text-slate-400 font-semibold">
                  <span>Start Date</span>
                  <input
                    type="date"
                    value={startDate}
                    min={dateRangeBounds.min}
                    max={dateRangeBounds.max}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-transparent font-medium border-0 p-0 text-xs text-slate-700 focus:ring-0 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Date End */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 flex flex-col text-[10px] text-slate-400 font-semibold">
                  <span>End Date</span>
                  <input
                    type="date"
                    value={endDate}
                    min={dateRangeBounds.min}
                    max={dateRangeBounds.max}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-transparent font-medium border-0 p-0 text-xs text-slate-700 focus:ring-0 focus:outline-hidden"
                  />
                </div>
              </div>

            </div>

            {/* Filter tags feedback */}
            {(filterRegion !== "All" || filterProduct !== "All" || searchQuery || startDate !== dateRangeBounds.min || endDate !== dateRangeBounds.max) && (
              <div className="flex flex-wrap items-center gap-2 text-xs border-t border-slate-100 pt-3">
                <span className="text-slate-400 font-medium font-mono text-[10px]">ACTIVE SEGMENT:</span>
                
                {searchQuery && (
                  <span className="bg-indigo-50 border border-indigo-150 text-indigo-700 px-2.5 py-0.5 rounded-full font-medium">
                    Search: "{searchQuery}"
                  </span>
                )}
                {filterRegion !== "All" && (
                  <span className="bg-indigo-50 border border-indigo-150 text-indigo-700 px-2.5 py-0.5 rounded-full font-medium">
                    Region: {filterRegion}
                  </span>
                )}
                {filterProduct !== "All" && (
                  <span className="bg-indigo-50 border border-indigo-150 text-indigo-700 px-2.5 py-0.5 rounded-full font-medium">
                    Product: {filterProduct}
                  </span>
                )}
                {(startDate !== dateRangeBounds.min || endDate !== dateRangeBounds.max) && (
                  <span className="bg-indigo-50 border border-indigo-150 text-indigo-700 px-2.5 py-0.5 rounded-full font-medium">
                    Timeline: {startDate} to {endDate}
                  </span>
                )}
                <span className="text-slate-500 font-medium ml-auto font-mono text-[11px]">
                  Showing {filteredRecords.length} of {activeRecords.length} orders
                </span>
              </div>
            )}
          </div>
        )}

        {/* --- EXECUTIVE HIGH-LEVEL METRIC TILES (BENTO GRID) --- */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4" id="metric-tiles-grid">
          
          {/* Card 1: Revenue */}
          <div className="bg-white border border-slate-200 p-4.5 rounded-2xl shadow-xs flex flex-col justify-between card-shine hover:shadow-md transition-shadow relative">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Revenue</span>
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold font-display tracking-tight text-slate-900">
                ${metrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0 })}
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1 leading-snug">
                Avg. order: ${metrics.avgOrderValue}
              </p>
            </div>
            {!cleanMode && (
              <span className="absolute top-2 right-2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            )}
          </div>

          {/* Card 2: Units Sold */}
          <div className="bg-white border border-slate-200 p-4.5 rounded-2xl shadow-xs flex flex-col justify-between card-shine hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Units Sold</span>
              <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold font-display tracking-tight text-slate-900">
                {metrics.totalUnits.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1 leading-snug">
                Invoiced volume
              </p>
            </div>
          </div>

          {/* Card 3: Total Orders */}
          <div className="bg-white border border-slate-200 p-4.5 rounded-2xl shadow-xs flex flex-col justify-between card-shine hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Orders</span>
              <div className="p-1.5 bg-sky-50 text-sky-600 rounded-lg">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold font-display tracking-tight text-slate-900">
                {metrics.totalOrders.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1 leading-snug">
                Completed transactions
              </p>
            </div>
          </div>

          {/* Card 4: Ticket Size (AOV) */}
          <div className="bg-white border border-slate-200 p-4.5 rounded-2xl shadow-xs flex flex-col justify-between card-shine hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ticket Size (AOV)</span>
              <div className="p-1.5 bg-violet-50 text-violet-600 rounded-lg">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold font-display tracking-tight text-slate-900 font-sans">
                ${metrics.avgOrderValue.toLocaleString(undefined, { minimumFractionDigits: 0 })}
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1 leading-snug">
                Avg. ticket amount
              </p>
            </div>
          </div>

          {/* Card 5: Best Selling Product */}
          <div className="bg-white border border-slate-200 p-4.5 rounded-2xl shadow-xs flex flex-col justify-between card-shine hover:shadow-md transition-shadow lg:col-span-1">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Top Product</span>
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-sm font-bold text-slate-900 line-clamp-2 leading-tight min-h-[40px] flex items-center">
                {metrics.topProduct}
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1 leading-snug">
                Primary revenue locomotive
              </p>
            </div>
          </div>

          {/* Card 6: Top Performing Region */}
          <div className="bg-white border border-slate-200 p-4.5 rounded-2xl shadow-xs flex flex-col justify-between card-shine hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Top Region</span>
              <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                <MapPin className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold font-display tracking-tight text-slate-900">
                {metrics.topRegion}
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1 leading-snug">
                Highest regional volume
              </p>
            </div>
          </div>

        </div>

        {/* --- ACTIVE TAB SCREEN CONTAINER --- */}
        <div className="flex-1 flex flex-col gap-6" id="workspace-core-view">
          
          {/* =========================================
              TAB 1: REGISTERED SYSTEM DASHBOARD INTERFACE
              ========================================= */}
          {selectedTab === "dashboard" && (
            <div className="flex flex-col gap-6" id="dashboard-workspace">
              
              {/* --- BIG DUAL CHART DECK --- */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* TIMELINE TREND AREA CHART */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs lg:col-span-8">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-slate-900 font-display text-[15px]">Commercial Revenue Timeline</h3>
                      <p className="text-xs text-slate-400">Periodic revenue & transactional order volume curve</p>
                    </div>
                    <div className="text-[10px] font-mono border border-slate-200 px-2 py-1 rounded bg-slate-50 text-slate-500 font-semibold">
                      REAL-TIME RECHART
                    </div>
                  </div>
                  
                  <div className="h-72">
                    {metrics.monthlyTrend.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={metrics.monthlyTrend}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey="month"
                            stroke="#94a3b8"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="#94a3b8"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => `$${v.toLocaleString()}`}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#0f172a",
                              color: "#fff",
                              borderRadius: "10px",
                              border: "none",
                              fontSize: "11px",
                            }}
                            formatter={(value: any) => [`$${Number(value).toLocaleString()}`, "Revenue"]}
                          />
                          <Legend wrapperStyle={{ fontSize: "11px" }} />
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            name="Net Revenue"
                            stroke="#4f46e5"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorRevenue)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                        <Calendar className="w-8 h-8 opacity-40 shrink-0" />
                        <span className="text-xs">No dates align with current active filtering parameters.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* REGIONAL PERFORMANCE RATIO */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs lg:col-span-4 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 font-display text-[15px]">Regional Markets</h3>
                    <p className="text-xs text-slate-400 mb-4 font-normal">Revenue distribution across active commercial regions</p>
                  </div>
                  
                  <div className="h-44 relative flex items-center justify-center">
                    {metrics.regionalData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={metrics.regionalData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={4}
                            dataKey="revenue"
                            nameKey="region"
                          >
                            {metrics.regionalData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "#0f172a",
                              color: "#fff",
                              borderRadius: "8px",
                              border: "none",
                              fontSize: "11px",
                            }}
                            formatter={(value: any) => [`$${Number(value).toLocaleString()}`, "Contribution"]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <span className="text-xs text-slate-400">No regional metrics.</span>
                    )}

                    {/* Simple overlay label for total */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] uppercase text-slate-400 tracking-wider font-semibold">Total Revenue</span>
                      <span className="text-base font-bold text-slate-800">${metrics.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>

                  {/* Regional Legend rows */}
                  <div className="mt-4 flex-1 flex flex-col gap-2 justify-end">
                    {metrics.regionalData.map((reg, index) => {
                      const share = metrics.totalRevenue > 0 ? ((reg.revenue / metrics.totalRevenue) * 100).toFixed(0) : "0";
                      return (
                        <div key={reg.region} className="flex items-center justify-between text-xs font-semibold">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <span className="w-2.5 h-2.5 rounded-full block" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}></span>
                            <span>{reg.region}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-medium font-mono text-[10px]">${reg.revenue.toLocaleString()}</span>
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-sm font-mono text-[9px] font-bold">{share}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* --- LOWER ROW: TOP PRODUCTS GRID & SUMMARY DATA TABLE --- */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* TOP PRODUCTS CHART */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs lg:col-span-5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-slate-900 font-display text-[15px]">Product Portfolio Revenue</h3>
                        <p className="text-xs text-slate-400">Invoiced product performance sorted by net revenue</p>
                      </div>
                    </div>

                    <div className="h-68">
                      {metrics.productData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={metrics.productData}
                            layout="vertical"
                            margin={{ top: 5, right: 10, left: 30, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" stroke="#94a3b8" fontSize={9} tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} />
                            {/* We truncate labels or render customized if needed, standard recharts handles fine */}
                            <YAxis
                              type="category"
                              dataKey="product"
                              stroke="#64748b"
                              fontSize={9}
                              width={90}
                              tickFormatter={(text) => text.length > 15 ? `${text.substring(0, 15)}...` : text}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "#0f172a",
                                color: "#fff",
                                borderRadius: "8px",
                                border: "none",
                                fontSize: "11px",
                              }}
                              formatter={(value: any) => [`$${Number(value).toLocaleString()}`, "Revenue"]}
                            />
                            <Bar dataKey="revenue" fill="#6366f1" radius={[0, 4, 4, 0]}>
                              {metrics.productData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[(index + 1) % CHART_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400">
                          <span className="text-xs">No product metrics found.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Portfolio details */}
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-400 font-mono">
                    <span>PORTFOLIO SIZE: {metrics.productData.length} ACTIVE ITEMS</span>
                    <button
                      onClick={() => setSelectedTab("sql")}
                      className="text-indigo-600 hover:underline flex items-center gap-0.5"
                    >
                      Write Custom SQL Group By <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* CURRENT ACTIVE TRANSACTION LOG TABLE */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs lg:col-span-7 flex flex-col justify-between">
                  
                  <div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="font-bold text-slate-900 font-display text-[15px]">Transaction Registry</h3>
                        <p className="text-xs text-slate-400">Live indexed orders satisfying active search boundaries</p>
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">
                        {filteredRecords.length} ORDERS IN WORKSPACE
                      </span>
                    </div>

                    {/* Table View */}
                    <div className="overflow-x-auto border border-slate-150 rounded-xl max-h-68 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 border-b border-slate-150 sticky top-0 font-bold text-slate-500 uppercase tracking-wider font-mono text-[9px]">
                          <tr>
                            <th className="px-4 py-2.5">Order ID</th>
                            <th className="px-3 py-2.5">Date</th>
                            <th className="px-4 py-2.5">Product</th>
                            <th className="px-3 py-2.5 text-center">QTY</th>
                            <th className="px-3 py-2.5 text-right">Price</th>
                            <th className="px-4 py-2.5 text-right">Revenue</th>
                            <th className="px-4 py-2.5">Region</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                          {filteredRecords.length > 0 ? (
                            filteredRecords.map((record) => {
                              // We detect if this item has warning flags
                              const isUncleanRow = !cleanMode && (
                                record.Order_ID === "ORD-2026-1015" ||
                                record.Product_Name.startsWith(" ") ||
                                record.Product_Name.toLowerCase() === " ai customer sentiment bot  " ||
                                record.Region === "north" ||
                                record.Unit_Price === 0 ||
                                record.Quantity === 0 ||
                                record.Order_ID === "ORD-2026-1255"
                              );
                              
                              return (
                                <tr
                                  key={`${record.Order_ID}-${record.Product_Name}-${record.Region}`}
                                  className={`hover:bg-slate-50/70 transition-colors ${
                                    isUncleanRow ? "bg-amber-50/50 hover:bg-amber-100/40" : ""
                                  }`}
                                >
                                  <td className="px-4 py-2.5 font-mono text-slate-950 font-bold whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      {isUncleanRow && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />}
                                      <span>{record.Order_ID}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-slate-500 text-[10px]">{record.Date}</td>
                                  <td className="px-4 py-2.5 line-clamp-1 max-w-[140px] truncate">{record.Product_Name}</td>
                                  <td className="px-3 py-2.5 text-center font-mono">{record.Quantity}</td>
                                  <td className="px-3 py-2.5 text-right font-mono text-slate-500">${record.Unit_Price.toLocaleString()}</td>
                                  <td className="px-4 py-2.5 text-right font-mono text-slate-900 font-semibold">${record.Revenue.toLocaleString()}</td>
                                  <td className="px-4 py-2.5 font-semibold text-slate-500">
                                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[10px]">
                                      {record.Region}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={7} className="px-4 py-12 text-center text-slate-400 font-medium">
                                No records found satisfying current filters. Try relaxing search queries or region filters.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="mt-4 pt-3 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">
                      Showing row limits {Math.min(filteredRecords.length, 50)} of {filteredRecords.length}
                    </span>
                    <button
                      onClick={() => setSelectedTab("csv")}
                      className="text-indigo-600 font-semibold hover:underline flex items-center gap-0.5"
                    >
                      Manage database files & audit logs <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                </div>

              </div>

            </div>
          )}

          {/* =========================================
              TAB 2: CSV SOURCE INTEGRATION & AUDIT CONSOLE
              ========================================= */}
          {selectedTab === "csv" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="csv-auditing-workspace">
              
              {/* CSV FILE INTEGRATOR */}
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs lg:col-span-5 flex flex-col justify-between gap-5">
                <div>
                  <h3 className="font-bold text-slate-900 font-display text-base mb-1">CSV Data Source Integrator</h3>
                  <p className="text-xs text-slate-400 mb-4 leading-normal">
                    Import standard comma-separated sales records to visualize transactions, run SQL queries, and trigger AI executive analytics.
                  </p>

                  {/* DROP/CLICK FOR FILE UPLOAD */}
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={triggerRawFile}
                    className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                      dragActive
                        ? "border-indigo-500 bg-indigo-50/20"
                        : "border-slate-200 hover:border-slate-350 bg-slate-50/50 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".csv"
                      className="hidden"
                    />
                    <div className="p-3 bg-white border border-slate-150 rounded-xl shadow-xs text-slate-600 mb-3 hover:scale-105 transition-transform">
                      <Upload className="w-6 h-6 text-indigo-505" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800">
                      Drag-and-drop CSV file here, or click to browse
                    </span>
                    <p className="text-[10px] text-slate-400 font-medium mt-1">
                      Supports Order_ID, Date, Product_Name, Quantity, Unit_Price, Revenue, Region columns
                    </p>
                  </div>

                  {/* COPY-PASTING RAW CSV STRING AREA */}
                  <div className="mt-5">
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5 uppercase tracking-wider">
                      Or Paste Raw Comma-Separated Data Text (CSV)
                    </label>
                    <textarea
                      placeholder={`Order_ID,Date,Product_Name,Quantity,Unit_Price,Revenue,Region\nORD-2026-9001,2026-06-01,Enterprise Cloud Analytics,1,1200,1200,North\nORD-2026-9003,2026-06-02,Pro CRM Integration Suite,3,450,1350,West`}
                      value={csvRawInput}
                      onChange={(e) => setCsvRawInput(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 h-32 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all resize-none"
                    />
                    {csvError && (
                      <p className="text-[11px] font-semibold text-rose-500 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Parser error: {csvError}</span>
                      </p>
                    )}
                    <button
                      onClick={handleCSVTextSubmit}
                      className="mt-2.5 w-full bg-slate-900 hover:bg-slate-850 text-white font-semibold text-xs py-2.5 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Database className="w-3.5 h-3.5" />
                      Instantiate CSV Database
                    </button>
                  </div>
                </div>

                {/* TEMPLATE DECK */}
                <div className="border-t border-slate-100 pt-4 mt-auto">
                  <div className="flex justify-between items-center bg-indigo-50 border border-indigo-100 p-3 rounded-lg">
                    <div className="flex items-start gap-2 text-xs">
                      <Download className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-indigo-900 block">Pre-populated Template</span>
                        <p className="text-[10px] text-indigo-600 font-medium">Download the raw faulty database of business transactions to verify formatting.</p>
                      </div>
                    </div>
                    <button
                      onClick={downloadSampleTemplate}
                      className="bg-white hover:bg-slate-55 border border-slate-250 text-slate-700 font-bold p-2 rounded-lg shadow-xs shrink-0 transition-colors"
                      title="Download CSV template"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>

              {/* AUTOMATED AUDIT LOOPS & SANITIZER */}
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs lg:col-span-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div>
                      <h3 className="font-bold text-slate-900 font-display text-base">Analytical Quality Auditor</h3>
                      <p className="text-xs text-slate-400">Step-by-step diagnostic registry of database integrity checks</p>
                    </div>
                    <span className="text-xs font-semibold font-mono bg-slate-100 px-2 py-1 rounded border text-slate-500">
                      INTEGRITY LAUNCH
                    </span>
                  </div>

                  {/* AUDIT TIMELINE LOG ROWS */}
                  <div className="flex flex-col gap-3 min-h-[300px]">
                    {auditResult.logs.map((log) => {
                      const isUnification = log.type === "unification";
                      const isResolvedState = cleanMode || isUnification;
                      
                      return (
                        <div
                          key={log.id}
                          className={`p-3.5 rounded-xl border flex gap-3 transition-colors ${
                            isResolvedState
                              ? "bg-slate-50 border-slate-200 text-slate-600"
                              : "bg-amber-50 border-amber-200 text-amber-900"
                          }`}
                        >
                          {/* Alert Icon based on severity */}
                          <div className="shrink-0 mt-0.5">
                            {isResolvedState ? (
                              <div className="p-1 px-1.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-bold font-mono">
                                COMPLIED
                              </div>
                            ) : (
                              <div className="p-1 px-1.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-bold font-mono">
                                DETECTED
                              </div>
                            )}
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold font-display">{log.message}</span>
                              <span className="text-[9px] font-mono font-medium opacity-65">{log.timestamp.split("T")[1]?.substring(0, 8)}</span>
                            </div>
                            <p className="text-[11px] opacity-80 mt-1 leading-relaxed">{log.details}</p>
                            
                            {/* Actions / Status badges */}
                            <div className="flex items-center gap-2 mt-2">
                              {isResolvedState ? (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-150 px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-0.5">
                                  <Check className="w-3 h-3" /> Resolved (Dataset Sanitized)
                                </span>
                              ) : (
                                <span className="bg-amber-100 text-amber-800 border border-amber-250 px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-0.5">
                                  <AlertTriangle className="w-3 h-3 animate-bounce" /> Action Required (Impairs Reports)
                                </span>
                              )}
                              
                              <span className="bg-slate-105 text-slate-500 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold">
                                Affected rows: {log.count}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Big sanitizer trigger */}
                <div className="border-t border-slate-100 pt-4 mt-4">
                  {!cleanMode ? (
                    <button
                      onClick={() => {
                        setCleanMode(true);
                      }}
                      className="w-full bg-indigo-650 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Execute In-Memory Deep Audit & Repair
                    </button>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-250 text-emerald-800 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <span className="font-bold">Sanitization Complied successfully</span>
                          <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">All transactions parsed to float aggregates, spaces stripped, casing unified under clean indices.</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setCleanMode(false)}
                        className="bg-white hover:bg-slate-100 border border-emerald-200 text-slate-700 font-semibold px-2.5 py-1.5 rounded transition-all text-[11px]"
                      >
                        Reset to Raw
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* =========================================
              TAB 3: REAL-TIME SQL EXECUTION hub
              ========================================= */}
          {selectedTab === "sql" && (
            <div className="flex flex-col gap-6" id="sql-terminal-workspace">
              
              {/* TERMINAL EDITOR */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col justify-between">
                
                {/* Editor Header */}
                <div className="bg-slate-850 px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 block"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block"></span>
                    </div>
                    <span className="text-slate-400 font-mono text-[11px] font-semibold ml-2 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5" />
                      In-Memory SQL Console [Active Database: sales]
                    </span>
                  </div>
                  
                  {/* Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-500 font-mono text-[9px] font-bold">PRESETS:</span>
                    {SQL_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => {
                          setSqlQuery(preset.query);
                          handleExecuteSQL(preset.query);
                        }}
                        className="bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-semibold font-mono text-[9px] px-2 py-1 rounded transition-colors border border-slate-700"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Editor Text Block */}
                <div className="relative">
                  <textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-900 text-slate-100 p-5 pl-7 min-h-36 focus:outline-hidden focus:ring-0 select-all border-0 resize-y leading-relaxed"
                  />
                  <div className="absolute left-2.5 top-5 bottom-5 flex flex-col text-[10px] font-mono text-slate-650 text-right pr-2 pointer-events-none select-none">
                    <span>1</span>
                    <span>2</span>
                    <span>3</span>
                  </div>
                </div>

                {/* Editor Action Bottom Bar */}
                <div className="bg-slate-850 px-4 py-3.5 border-t border-slate-853.5 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-400 font-mono text-[10px] hidden sm:inline">
                    Reference target table as <strong className="text-indigo-400 font-semibold">'sales'</strong>
                  </span>
                  
                  <button
                    onClick={() => handleExecuteSQL(sqlQuery)}
                    className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Execute Query (Ctrl+Enter)
                  </button>
                </div>

              </div>

              {/* SQL INTERACTIVE RESULTS DECK */}
              {sqlResult && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="sql-results-deck">
                  
                  {/* TABULAR RESULT DATA */}
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs lg:col-span-7">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <div>
                        <h4 className="font-bold text-slate-900 font-display text-sm">Query Output Table</h4>
                        <p className="text-xs text-slate-400">Structured data rows matching SQL filters</p>
                      </div>
                      {!sqlResult.error && (
                        <span className="bg-emerald-50 text-emerald-700 font-bold border border-emerald-150 px-2.5 py-0.5 rounded-md text-[10px]">
                          {sqlResult.rows.length} rows returned
                        </span>
                      )}
                    </div>

                    {sqlResult.error ? (
                      <div className="bg-red-50 border border-red-150 text-red-800 p-4 rounded-xl flex items-start gap-2.5 text-xs">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">SQL Compiler Warning</span>
                          <p className="text-[11px] opacity-90 mt-1 leading-normal font-mono">{sqlResult.error}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-150 rounded-xl max-h-80 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs font-medium">
                          <thead className="bg-slate-50 border-b border-slate-150 sticky top-0 font-bold text-slate-500 uppercase tracking-wider font-mono text-[9px]">
                            <tr>
                              {sqlResult.columns.map((col) => (
                                <th key={col} className="px-4 py-2.5">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                            {sqlResult.rows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                {sqlResult.columns.map((col) => {
                                  const cellVal = row[col];
                                  const displayVal = typeof cellVal === "number"
                                    ? cellVal % 1 === 0 ? cellVal.toLocaleString() : cellVal.toFixed(2)
                                    : String(cellVal !== undefined ? cellVal : "NULL");
                                  
                                  return (
                                    <td key={col} className="px-4 py-2.5 text-[11px]">
                                      {displayVal}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* REAL-TIME DYNAMIC VISUALIZER */}
                  {!sqlResult.error && sqlResult.rows.length > 0 && (
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs lg:col-span-5 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 font-display text-sm mb-1">Dynamic SQL Plotter</h4>
                        <p className="text-xs text-slate-400 mb-4 leading-normal">Bind table vectors dynamically to real-time charts</p>
                        
                        {/* Columns selectors */}
                        <div className="grid grid-cols-3 gap-2 mb-4 text-xs font-semibold">
                          <div>
                            <label className="text-[10px] text-slate-400 font-semibold block mb-1">X-AXIS LABEL</label>
                            <select
                              value={sqlXColumn}
                              onChange={(e) => setSqlXColumn(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-hidden"
                            >
                              {sqlResult.columns.map((col) => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 font-semibold block mb-1">Y-AXIS METRIC</label>
                            <select
                              value={sqlYColumn}
                              onChange={(e) => setSqlYColumn(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-hidden"
                            >
                              {sqlResult.columns.map((col) => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 font-semibold block mb-1">CHART VALUE</label>
                            <select
                              value={sqlChartType}
                              onChange={(e) => setSqlChartType(e.target.value as any)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-hidden font-bold text-indigo-650"
                            >
                              <option value="bar">Bar Chart</option>
                              <option value="line">Line Chart</option>
                              <option value="pie">Pie Chart</option>
                              <option value="none">Disabled</option>
                            </select>
                          </div>
                        </div>

                        {/* Chart Render */}
                        <div className="h-56 mt-2 flex items-center justify-center">
                          {sqlChartType !== "none" && sqlXColumn && sqlYColumn ? (
                            <ResponsiveContainer width="100%" height="100%">
                              {sqlChartType === "bar" ? (
                                <BarChart data={sqlResult.rows} margin={{ bottom: 15, left: -10 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                  <XAxis dataKey={sqlXColumn} stroke="#94a3b8" fontSize={9} />
                                  <YAxis stroke="#94a3b8" fontSize={9} />
                                  <Tooltip contentStyle={{ background: "#0f172a", color: "#fff", border: "none", fontSize: "11px", borderRadius: "8px" }} />
                                  <Bar dataKey={sqlYColumn} fill="#4f46e5" radius={[4, 4, 0, 0]}>
                                    {sqlResult.rows.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              ) : sqlChartType === "line" ? (
                                <AreaChart data={sqlResult.rows} margin={{ bottom: 15, left: -10 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                  <XAxis dataKey={sqlXColumn} stroke="#94a3b8" fontSize={9} />
                                  <YAxis stroke="#94a3b8" fontSize={9} />
                                  <Tooltip contentStyle={{ background: "#0f172a", color: "#fff", border: "none", fontSize: "11px", borderRadius: "8px" }} />
                                  <Area type="monotone" dataKey={sqlYColumn} stroke="#4f46e5" strokeWidth={2} fill="#818cf8" fillOpacity={0.15} />
                                </AreaChart>
                              ) : (
                                <PieChart>
                                  <Pie
                                    data={sqlResult.rows}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={45}
                                    outerRadius={65}
                                    dataKey={sqlYColumn}
                                    nameKey={sqlXColumn}
                                  >
                                    {sqlResult.rows.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                  </Pie>
                                  <Tooltip contentStyle={{ background: "#0f172a", color: "#fff", border: "none", fontSize: "11px", borderRadius: "8px" }} />
                                </PieChart>
                              )}
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex flex-col items-center text-slate-400 gap-1 text-[11px] font-semibold">
                              <HelpCircle className="w-8 h-8 opacity-30 shrink-0" />
                              <span>Dynamic plotting disabled. Select X/Y vectors.</span>
                            </div>
                          )}
                        </div>

                      </div>

                      {/* Info bar */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] font-semibold text-slate-400 font-mono">
                        <span>X: {sqlXColumn || "N/A"}</span>
                        <span>Y: {sqlYColumn || "N/A"}</span>
                      </div>

                    </div>
                  )}

                </div>
              )}

            </div>
          )}

          {/* =========================================
              TAB 4: AI STRATEGIC EXECUTIVE ADVISOR
              ========================================= */}
          {selectedTab === "ai" && (
            <div className="flex flex-col gap-6 animate-fade-in" id="ai-advisor-workspace">
              
              {/* TOP CONFIGURATION: BRANDING, DESIGN & MODEL */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col lg:flex-row items-center justify-between gap-5 shadow-inner" id="ai-customizer-panel">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl shadow-xs shrink-0 self-start lg:self-center">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm font-display flex items-center gap-1.5">
                      Configure Custom AI Copilot
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Rename the agent, select target models, or switch analytical styles to adjust perspective.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                  {/* AI Copilot Name input */}
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase tracking-wider font-mono">Agent Identity Name</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-hidden focus:border-indigo-500 text-slate-800"
                      value={aiName}
                      onChange={(e) => setAiName(e.target.value)}
                      placeholder="e.g. Acuity AI"
                    />
                  </div>

                  {/* Model Engine Select */}
                  <div className="flex-1 min-w-[170px]">
                    <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase tracking-wider font-mono">AI Model Engine</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-hidden text-slate-800"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                    >
                      <option value="gemini-3.5-flash">ApexIntel 3.5 Flash (Standard)</option>
                      <option value="gemini-3.1-flash-lite">ApexIntel 3.1 Flash-Lite</option>
                      <option value="gemini-flash-latest">ApexIntel Flash (Latest)</option>
                    </select>
                  </div>

                  {/* Strategic Persona Select */}
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase tracking-wider font-mono">Analytical Specialization</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-hidden text-slate-800"
                      value={aiPersona}
                      onChange={(e) => setAiPersona(e.target.value)}
                    >
                      <option value="executive">Executive SWOT Advisor (Balanced)</option>
                      <option value="cfo">Profit & margin CFO (Strict Costing)</option>
                      <option value="cmo">Growth-Hack CMO (Marketing & Volume)</option>
                      <option value="data_scientist">Scientific Data Scientist (Quant Focus)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* LEFT REPORT COLUMN: EXECUTIVE DOCUMENT */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs lg:col-span-6 flex flex-col justify-between min-h-[460px]">
                  
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <div>
                        <h3 className="font-bold text-slate-900 font-display text-base">Executive Analytics Brief</h3>
                        <p className="text-xs text-slate-400">SWOT formulation calculated by {aiName}</p>
                      </div>
                      
                      <button
                        onClick={generateAIReport}
                        disabled={aiLoading}
                        className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition-all flex items-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
                        id="ai-generate-report-button"
                      >
                        {aiLoading ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Formulating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            {aiReport ? "Recalculate Brief" : "Generate Executive Brief"}
                          </>
                        )}
                      </button>
                    </div>

                    {/* Diagnostic document viewport */}
                    <div className="overflow-y-auto max-h-[380px] pr-2">
                      {aiReport ? (
                        <div className="markdown-body text-xs leading-relaxed text-slate-700 space-y-4">
                          <Markdown>{aiReport}</Markdown>
                        </div>
                      ) : (
                        <div className="py-20 text-center flex flex-col items-center justify-center text-slate-400 gap-3.5">
                          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-550 shadow-inner">
                            <FileText className="w-8 h-8" />
                          </div>
                          <div className="max-w-xs">
                            <span className="font-bold text-slate-700 text-sm block">Strategic brief is empty</span>
                            <p className="text-[11px] text-slate-400 leading-normal mt-1">Press the generate button above. {aiName} will analyze trends, pricing curves, and formulate operational priority recommendations.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 mt-4 flex items-center justify-between text-[10px] font-bold text-slate-400 font-mono">
                    <span>METRICS DIGEST SIZE: {wholeDataMetrics.regionalData.length} REGIONS, {wholeDataMetrics.productData.length} PRODUCTS</span>
                    <span>CONFIDENTIAL DICTATION</span>
                  </div>

                </div>

                {/* RIGHT CHAT COLUMN: INTERACTIVE BUSINESS CONSULTANT */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs lg:col-span-6 flex flex-col justify-between min-h-[460px]">
                  
                  <div>
                    <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 mb-4">
                      <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Bot className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 font-display text-sm">{aiName} Copilot Advisor</h3>
                        <p className="text-[11px] text-slate-400">Ask strategic questions, draft team emails, or explore region trends</p>
                      </div>
                    </div>

                    {/* Chat scrolling log */}
                    <div className="overflow-y-auto h-76 max-h-[310px] flex flex-col gap-3 pr-1">
                      {chats.map((chat, idx) => (
                        <div
                          key={idx}
                          className={`flex gap-2 text-xs leading-normal max-w-[85%] ${
                            chat.role === "user" ? "ml-auto flex-row-reverse" : ""
                          }`}
                        >
                          {/* Profile initials */}
                          <div className={`p-1.5 rounded-lg text-[10px] font-bold shrink-0 shadow-2xs h-7 w-7 flex items-center justify-center ${
                            chat.role === "user" ? "bg-slate-700 text-white" : "bg-indigo-650 text-white"
                          }`}>
                            {chat.role === "user" ? <User className="w-3.5 h-3.5" /> : <div className="font-bold text-[10px] uppercase font-mono">{aiName.substring(0, 2)}</div>}
                          </div>

                          {/* Reply content bubble */}
                          <div className={`p-3 rounded-2xl leading-relaxed text-slate-700 shadow-2xs ${
                            chat.role === "user"
                              ? "bg-slate-800 text-white rounded-tr-xs"
                              : "bg-slate-50 border border-slate-200 rounded-tl-xs text-xs"
                          }`}>
                            {chat.role === "user" ? (
                              <p className="font-medium whitespace-pre-wrap">{chat.text}</p>
                            ) : (
                              <div className="markdown-body font-medium space-y-2">
                                <Markdown>{chat.text}</Markdown>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {aiLoading && (
                        <div className="flex gap-2 text-xs items-center text-slate-400 font-semibold italic animate-pulse">
                          <Bot className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span>{aiName} is analyzing tables & formulating diagnostic report...</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Question builder & pre-loads */}
                  <div className="border-t border-slate-100 pt-3 mt-4 flex flex-col gap-2 bg-white">
                    
                    {/* Preset prompt pills */}
                    <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 max-w-full">
                      <button
                        onClick={() => submitAiQuestion("Draft a comprehensive email to share these insights with the executive team")}
                        className="bg-slate-100 hover:bg-slate-150 text-slate-600 border border-slate-200 truncate font-semibold text-[9.5px] px-2.5 py-1 rounded-full transition-colors cursor-pointer"
                      >
                        ✉️ Draft Executive Email
                      </button>
                      <button
                        onClick={() => submitAiQuestion("Under what parameters should we adjust the Unit Price of Database Replication Pipeline?")}
                        className="bg-slate-100 hover:bg-slate-150 text-slate-600 border border-slate-200 truncate font-semibold text-[9.5px] px-2.5 py-1 rounded-full transition-colors cursor-pointer"
                      >
                        📈 Pricing Adjustments
                      </button>
                      <button
                        onClick={() => submitAiQuestion("What are the primary operational bottlenecks in the West region sales channel?")}
                        className="bg-slate-100 hover:bg-slate-150 text-slate-600 border border-slate-200 truncate font-semibold text-[9.5px] px-2.5 py-1 rounded-full transition-colors cursor-pointer"
                      >
                        🗺️ West Channel Bottlenecks
                      </button>
                    </div>

                    {/* Input field */}
                    <div className="flex gap-2 items-center relative">
                      <input
                        type="text"
                        placeholder={`Ask ${aiName} sales advice or custom queries...`}
                        value={aiQuestion}
                        onChange={(e) => setAiQuestion(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            submitAiQuestion();
                          }
                        }}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2 pl-3.5 pr-10 text-xs font-semibold focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all text-slate-800"
                      />
                      <button
                        onClick={() => submitAiQuestion()}
                        className="absolute right-1.5 p-1.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-transform duration-150 hover:scale-105 active:scale-95 text-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>

                </div>
              </div>

            </div>
          )}

        </div>

      </main>

      {/* --- REUSE FOOTER CONSOLE BAR --- */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 mt-12 text-center text-xs text-slate-400 font-mono font-medium" id="system-credits">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <span>BUSINESS SALES PERFORMANCE ANALYTICS — © 2026 GEET INC PORTAL</span>
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>In-Memory SQL Enabled</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>W3C Complied</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
