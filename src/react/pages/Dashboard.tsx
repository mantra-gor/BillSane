import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  FiAlertTriangle,
  FiArrowRight,
  FiFileText,
  FiInfo,
  FiPackage,
  FiPercent,
  FiPlus,
  FiRefreshCw,
  FiRepeat,
  FiSlash,
  FiTrendingUp,
  FiUserPlus,
  FiUsers,
} from "react-icons/fi";
import { TbCurrencyRupee } from "react-icons/tb";
import AppLayout from "../components/core/layout/AppLayout";
import PageHeader from "../components/ui/elements/PageHeader";
import StatTile from "../components/ui/elements/StatTile";
import Card from "../components/ui/elements/Card";
import Button from "../components/ui/elements/Button";
import EmptyState from "../components/ui/elements/EmptyState";
import SegmentedControl from "../components/ui/elements/SegmentedControl";
import CustomDataTable from "../components/ui/elements/CustomDataTable";
import {
  SkeletonCard,
  SkeletonStat,
} from "../components/ui/elements/Skeleton";
import Badge from "../components/ui/elements/Badge";
import {
  CustomerBar,
  CustomerMixSplit,
  PaymentMixDonut,
  TopItemsBar,
  TrendChart,
} from "../components/ui/charts/DashboardCharts";
import {
  getDashboardInsights,
  type DashboardInsights,
  type InsightAlert,
  type InsightsRangeToken,
  type LapsedCustomer,
  type RecentInvoice,
  type ReorderItem,
} from "../utils/insights";
import { getBusinessConfig } from "../utils/businessConfig";
import { useAuth } from "../auth/authContext";
import { formatINR } from "../utils/format";
import upiIcon from "../assets/resources/upi-icon.png";
import cardIcon from "../assets/resources/card-icon.png";
import cashIcon from "../assets/resources/cash-icon.png";

const paymentIcons: Record<string, string> = {
  cash: cashIcon,
  card: cardIcon,
  upi: upiIcon,
};

const RANGES: { value: InsightsRangeToken; label: string; title: string }[] = [
  { value: "7d", label: "7D", title: "Last 7 days" },
  { value: "30d", label: "30D", title: "Last 30 days" },
  { value: "90d", label: "90D", title: "Last 90 days" },
  { value: "1y", label: "1Y", title: "Last 12 months" },
  { value: "all", label: "All", title: "All time" },
];

const RANGE_CAPTIONS: Record<InsightsRangeToken, string> = {
  "7d": "vs. previous 7 days",
  "30d": "vs. previous 30 days",
  "90d": "vs. previous 90 days",
  "1y": "vs. previous year",
  all: "all time",
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function AlertsStrip({ alerts }: { alerts: InsightAlert[] }) {
  return (
    // Two up once there's room: stock, customers and tax can all have something
    // to say at once, and four full-width banners would push every number on
    // the page below the fold.
    <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
      {alerts.map((alert) => {
        const warning = alert.level === "warning";
        const Icon = warning ? FiAlertTriangle : FiInfo;
        return (
          <div
            key={alert.id}
            className={`flex items-start gap-3 rounded-xl border p-3.5 ${
              warning
                ? "border-warning-border bg-warning-soft"
                : "border-info-border bg-info-soft"
            }`}>
            <Icon
              size={17}
              className={`mt-0.5 shrink-0 ${
                warning ? "text-warning" : "text-info"
              }`}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{alert.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
                {alert.detail}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentInvoicesTable({
  rows,
  onView,
  onCreate,
}: {
  rows: RecentInvoice[];
  onView: (id: string) => void;
  onCreate: () => void;
}) {
  const columns = [
    {
      id: "invoiceNo",
      name: "Invoice",
      selector: (row: RecentInvoice) => row.invoiceNo,
      width: "132px",
      cell: (row: RecentInvoice) => (
        <span className="font-semibold text-ink tnum">{row.invoiceNo}</span>
      ),
    },
    {
      id: "customer",
      name: "Customer",
      grow: 2,
      cell: (row: RecentInvoice) => (
        <div className="min-w-0 py-1">
          <p className="truncate font-medium text-ink">{row.customerName}</p>
          <p className="text-xs text-ink-muted">{row.date}</p>
        </div>
      ),
    },
    {
      id: "payment",
      name: "",
      width: "52px",
      cell: (row: RecentInvoice) =>
        paymentIcons[row.paymentType] ? (
          <img
            src={paymentIcons[row.paymentType]}
            className="h-5 w-5"
            alt={row.paymentType}
            title={row.paymentType}
          />
        ) : null,
    },
    {
      id: "amount",
      name: "Amount",
      selector: (row: RecentInvoice) => row.totalAmount,
      width: "124px",
      right: true,
      cell: (row: RecentInvoice) => (
        <span className="w-full text-right font-bold text-ink tnum">
          {formatINR(row.totalAmount)}
        </span>
      ),
    },
  ];

  return (
    <CustomDataTable
      columns={columns}
      data={rows}
      dense
      bare
      highlightOnHover
      onRowClicked={(row: RecentInvoice) => onView(row.id)}
      noDataComponent={
        <EmptyState
          compact
          icon={FiFileText}
          title="No invoices in this period"
          description="Widen the date range, or ring up a new sale."
          action={
            <Button size="sm" icon={<FiPlus size={14} />} onClick={onCreate}>
              New Invoice
            </Button>
          }
        />
      }
    />
  );
}

/** A quiet divider between the money / customer / stock halves of the page. */
function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="pt-1">
      <h2 className="text-[15px] font-bold text-ink">{title}</h2>
      <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>
    </div>
  );
}

const REORDER_TONE: Record<
  ReorderItem["reason"],
  { tone: "danger" | "warning" | "info"; label: string }
> = {
  oversold: { tone: "danger", label: "Oversold" },
  out: { tone: "danger", label: "Out" },
  low: { tone: "warning", label: "Low" },
  soon: { tone: "info", label: "Running out" },
};

/**
 * The reorder list. Sorted by how soon each item runs out at its current sales
 * rate, which is the question "how many are left?" can't answer on its own —
 * 4 boxes of something you sell twice a day is a problem; 4 of something you
 * sell twice a month isn't.
 */
function ReorderTable({
  rows,
  onOpen,
}: {
  rows: ReorderItem[];
  onOpen: () => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        icon={FiPackage}
        title="Nothing needs reordering"
        description="Every counted item is above its low-stock mark and none are about to run out."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const badge = REORDER_TONE[row.reason];
        return (
          <li
            key={row.id}
            className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-subtle">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">
                {row.name}
              </p>
              <p className="truncate text-xs text-ink-muted tnum">
                {row.stockQty.toLocaleString("en-IN")} {row.unit} left
                {row.unitsSold > 0
                  ? ` · ${row.unitsSold.toLocaleString("en-IN")} sold`
                  : " · no sales this period"}
              </p>
            </div>
            {/* Only where it adds something: "0d left" beside an Out badge is
                the same fact twice. */}
            {row.daysCover !== null &&
              row.reason !== "out" &&
              row.reason !== "oversold" && (
                <span
                  className="shrink-0 text-right text-xs text-ink-soft tnum"
                  title="Days of stock left at the current sales rate">
                  ~{Math.max(0, Math.round(row.daysCover))}d left
                </span>
              )}
            <Badge tone={badge.tone} size="sm">
              {badge.label}
            </Badge>
          </li>
        );
      })}
      <li className="px-5 py-2.5">
        <button
          type="button"
          onClick={onOpen}
          className="flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-munsell_blue transition-colors hover:text-munsell_blue-700">
          Open inventory
          <FiArrowRight size={13} />
        </button>
      </li>
    </ul>
  );
}

/** Regulars who stopped coming — each row is a phone call worth making. */
function LapsedTable({
  rows,
  onOpen,
}: {
  rows: LapsedCustomer[];
  onOpen: () => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        icon={FiUsers}
        title="Your regulars are still coming back"
        description="Nobody with two or more visits has been away for more than 60 days."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-subtle">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{row.name}</p>
            <p className="truncate text-xs text-ink-muted tnum">
              {row.phone} · {row.invoiceCount} visits · {formatINR(row.totalSpent)}
            </p>
          </div>
          <span className="shrink-0 text-right text-xs font-semibold text-warning-ink tnum">
            {row.daysSince}d ago
          </span>
        </li>
      ))}
      <li className="px-5 py-2.5">
        <button
          type="button"
          onClick={onOpen}
          className="flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-munsell_blue transition-colors hover:text-munsell_blue-700">
          Open customers
          <FiArrowRight size={13} />
        </button>
      </li>
    </ul>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>
      <SkeletonCard height="h-72" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState<InsightsRangeToken>("30d");
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // The signed-in user's name, straight off the session; company is async.
  const name = useAuth().user?.name ?? "";
  const [company, setCompany] = useState("");

  useEffect(() => {
    let cancelled = false;
    getBusinessConfig()
      .then((config) => {
        if (!cancelled) setCompany(config.companyName);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDashboardInsights({ token: range })
      .then((data) => {
        if (cancelled) return;
        setInsights(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, reloadKey]);

  // Loading feedback is triggered from the event handlers (setState in an event
  // is fine; setState synchronously in an effect is what the linter flags).
  const changeRange = (token: InsightsRangeToken) => {
    if (token === range) return;
    setLoading(true);
    setRange(token);
  };

  const retry = () => {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  };

  const firstName = name.trim().split(" ")[0];
  const caption = RANGE_CAPTIONS[range];

  return (
    <AppLayout width="wide" className="space-y-5">
      <PageHeader
        title={firstName ? `${greeting()}, ${firstName}` : "Dashboard"}
        description={
          company
            ? `Here's how ${company} is doing.`
            : "Your business at a glance."
        }
        actions={
          <>
            <SegmentedControl
              aria-label="Date range"
              segments={RANGES}
              value={range}
              onChange={changeRange}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<FiRefreshCw size={14} />}
              onClick={retry}
              title="Refresh insights"
              aria-label="Refresh insights"
            />
          </>
        }
      />

      {loading && <DashboardSkeleton />}

      {!loading && error && (
        <Card>
          <EmptyState
            icon={FiAlertTriangle}
            title="Couldn't load insights"
            description={error}
            action={
              <Button icon={<FiRefreshCw size={15} />} onClick={retry}>
                Try again
              </Button>
            }
          />
        </Card>
      )}

      {!loading && !error && insights && (
        <div className="space-y-5">
          {insights.alerts.length > 0 && (
            <AlertsStrip alerts={insights.alerts} />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={TbCurrencyRupee}
              tone="brand"
              label="Revenue"
              value={formatINR(insights.kpis.revenue.value)}
              delta={insights.kpis.revenue.deltaPct}
              caption={caption}
            />
            <StatTile
              icon={FiFileText}
              tone="accent"
              label="Invoices"
              value={insights.kpis.invoiceCount.value.toLocaleString("en-IN")}
              delta={insights.kpis.invoiceCount.deltaPct}
              caption={caption}
            />
            <StatTile
              icon={FiPercent}
              tone="info"
              label="Tax Collected"
              value={formatINR(insights.kpis.taxCollected.value)}
              delta={insights.kpis.taxCollected.deltaPct}
              caption={caption}
            />
            <StatTile
              icon={FiTrendingUp}
              tone="success"
              label="Avg Invoice"
              value={formatINR(insights.kpis.avgInvoice.value)}
              delta={insights.kpis.avgInvoice.deltaPct}
              caption={caption}
            />
          </div>

          <Card
            title="Sales trend"
            subtitle="Revenue over the selected period">
            <div className="h-72">
              <TrendChart data={insights.trend} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Payment mix" subtitle="How customers are paying">
              <div className="h-56">
                <PaymentMixDonut data={insights.paymentMix} />
              </div>
            </Card>
            <Card title="Top items" subtitle="Highest-earning products">
              <div className="h-56">
                <TopItemsBar data={insights.topItems} />
              </div>
            </Card>
          </div>

          {/* ---------------------------------------------------------------
              Customers
              --------------------------------------------------------------- */}
          <SectionHeading
            title="Customers"
            description="Who is buying, how often they come back, and who has stopped."
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={FiUsers}
              tone="accent"
              label="Active customers"
              value={insights.kpis.activeCustomers.value.toLocaleString("en-IN")}
              delta={insights.kpis.activeCustomers.deltaPct}
              caption={caption}
            />
            <StatTile
              icon={FiUserPlus}
              tone="info"
              label="New customers"
              value={insights.kpis.newCustomers.value.toLocaleString("en-IN")}
              delta={insights.kpis.newCustomers.deltaPct}
              caption="first-time buyers"
            />
            <StatTile
              icon={FiRepeat}
              tone="success"
              label="Repeat rate"
              value={`${insights.kpis.repeatRatePct.value}%`}
              delta={insights.kpis.repeatRatePct.deltaPct}
              caption="of sales were repeat business"
            />
            <StatTile
              icon={TbCurrencyRupee}
              tone="brand"
              label="Per customer"
              value={formatINR(insights.kpis.avgCustomerValue.value)}
              delta={insights.kpis.avgCustomerValue.deltaPct}
              caption="average spend this period"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card
              title="New vs returning"
              subtitle="Where this period's revenue came from">
              <div className="h-40">
                <CustomerMixSplit data={insights.customerMix} />
              </div>
            </Card>
            <Card
              title="Top customers"
              subtitle="Where your revenue is concentrated"
              action={
                <FiUsers size={15} className="text-ink-faint" aria-hidden />
              }>
              <div className="h-40">
                <CustomerBar data={insights.topCustomers} />
              </div>
            </Card>
          </div>

          <Card
            title="Regulars who've gone quiet"
            subtitle="Two or more visits, then nothing for 60 days"
            flush
            action={
              insights.lapsedCustomers.length > 0 ? (
                <Badge tone="warning">{insights.lapsedCustomers.length}</Badge>
              ) : undefined
            }>
            <div className="border-t border-line">
              <LapsedTable
                rows={insights.lapsedCustomers}
                onOpen={() => navigate("/customers")}
              />
            </div>
          </Card>

          {/* ---------------------------------------------------------------
              Inventory
              --------------------------------------------------------------- */}
          <SectionHeading
            title="Inventory"
            description="What's on the shelf right now, and what it's costing you."
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              icon={FiPackage}
              tone="brand"
              label="Stock on hand"
              value={formatINR(insights.inventory.stockValue)}
              caption={
                insights.inventory.uncountedItems > 0
                  ? `${insights.inventory.uncountedItems} item${insights.inventory.uncountedItems === 1 ? "" : "s"} not counted yet`
                  : "every item counted"
              }
            />
            <StatTile
              icon={FiAlertTriangle}
              tone={insights.inventory.needsRestocking > 0 ? "warning" : "success"}
              label="Needs restocking"
              value={insights.inventory.needsRestocking.toLocaleString("en-IN")}
              caption={
                insights.inventory.outOfStock > 0
                  ? `${insights.inventory.outOfStock} already at zero or below`
                  : "nothing running short"
              }
            />
            <StatTile
              icon={FiSlash}
              tone={insights.inventory.deadStockValue > 0 ? "warning" : "success"}
              label="Not moving"
              value={formatINR(insights.inventory.deadStockValue)}
              caption={
                insights.inventory.deadStockItems > 0
                  ? `${insights.inventory.deadStockItems} item${insights.inventory.deadStockItems === 1 ? "" : "s"} unsold this period`
                  : "everything on the shelf sold"
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card
              title="Reorder soon"
              subtitle="Ordered by how long the stock will last"
              flush
              action={
                insights.reorderList.length > 0 ? (
                  <Badge tone="warning">{insights.reorderList.length}</Badge>
                ) : undefined
              }>
              <div className="border-t border-line">
                <ReorderTable
                  rows={insights.reorderList}
                  onOpen={() => navigate("/inventory")}
                />
              </div>
            </Card>
            <Card
              title="Recent invoices"
              subtitle="Click a row to open the bill"
              flush
              action={
                <button
                  type="button"
                  onClick={() => navigate("/sales")}
                  className="flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-munsell_blue transition-colors hover:text-munsell_blue-700">
                  View all
                  <FiArrowRight size={13} />
                </button>
              }>
              <div className="border-t border-line">
                <RecentInvoicesTable
                  rows={insights.recentInvoices}
                  onView={(id) => navigate(`/invoice/view/${id}`)}
                  onCreate={() => navigate("/invoice-create")}
                />
              </div>
            </Card>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

export default Dashboard;
