import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  FiAlertTriangle,
  FiArrowRight,
  FiFileText,
  FiInfo,
  FiPercent,
  FiPlus,
  FiRefreshCw,
  FiTrendingUp,
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
import {
  CustomerBar,
  PaymentMixDonut,
  TopItemsBar,
  TrendChart,
} from "../components/ui/charts/DashboardCharts";
import {
  getDashboardInsights,
  type DashboardInsights,
  type InsightAlert,
  type InsightsRangeToken,
  type RecentInvoice,
} from "../utils/insights";
import { getBusinessConfig } from "../utils/businessConfig";
import { getUserProfile } from "../utils/userProfile";
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
    <div className="space-y-2.5">
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
  // Name is read once at mount; company is async. Deriving name in the state
  // initializer (rather than an effect) keeps setState out of the effect body.
  const [name] = useState(() => getUserProfile().fullName);
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

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card
              title="Top customers"
              subtitle="Where your revenue is concentrated"
              action={
                <FiUsers size={15} className="text-ink-faint" aria-hidden />
              }>
              <div className="h-56">
                <CustomerBar data={insights.topCustomers} />
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
