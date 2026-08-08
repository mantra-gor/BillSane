import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  FiEye,
  FiFileText,
  FiFilter,
  FiPercent,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { TbCurrencyRupee } from "react-icons/tb";
import AppLayout from "../components/core/layout/AppLayout";
import PageHeader from "../components/ui/elements/PageHeader";
import Card from "../components/ui/elements/Card";
import CustomDataTable from "../components/ui/elements/CustomDataTable";
import Input from "../components/ui/elements/Input";
import Select from "../components/ui/elements/Select";
import Button from "../components/ui/elements/Button";
import Badge from "../components/ui/elements/Badge";
import Field from "../components/ui/elements/Field";
import Modal from "../components/ui/elements/Modal";
import EmptyState from "../components/ui/elements/EmptyState";
import DatePicker from "../components/ui/elements/DatePicker";
import StatTile from "../components/ui/elements/StatTile";
import { SkeletonRows, SkeletonStat } from "../components/ui/elements/Skeleton";
import { useToast } from "../components/ui/feedback/toastContext";
import { formatINR } from "../utils/format";
import {
  deleteInvoice,
  getInvoices,
  type SavedInvoice,
} from "../utils/invoiceStore";
import upiIcon from "../assets/resources/upi-icon.png";
import cardIcon from "../assets/resources/card-icon.png";
import cashIcon from "../assets/resources/cash-icon.png";

const paymentIcons: Record<string, string> = {
  cash: cashIcon,
  card: cardIcon,
  upi: upiIcon,
};

// `capitalize` would render the acronym as "Upi".
const paymentLabels: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  upi: "UPI",
};

function RowAction({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof FiEye;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        // The row itself is clickable; an action button shouldn't also open it.
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors ${
        danger
          ? "hover:bg-danger-soft hover:text-danger"
          : "hover:bg-munsell_blue-5 hover:text-munsell_blue"
      }`}>
      <Icon size={15} />
    </button>
  );
}

function Sales() {
  const navigate = useNavigate();
  const toast = useToast();
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SavedInvoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInvoices()
      .then((data) => {
        if (cancelled) return;
        setInvoices(
          data.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        );
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(
            "Couldn't load invoices",
            err instanceof Error ? err.message : String(err)
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Runs once on mount; `toast` is stable for the provider's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtersActive =
    search.trim() !== "" ||
    paymentFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "";

  const clearFilters = () => {
    setSearch("");
    setPaymentFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesQuery =
        !query ||
        invoice.invoiceNo.toLowerCase().includes(query) ||
        invoice.customerDetails?.name?.toLowerCase().includes(query) ||
        invoice.customerDetails?.phone?.toLowerCase().includes(query);

      const matchesPayment =
        paymentFilter === "all" || invoice.payment_type === paymentFilter;

      const invoiceTime = new Date(invoice.createdAt).getTime();
      const matchesFrom =
        !dateFrom || invoiceTime >= new Date(`${dateFrom}T00:00:00`).getTime();
      const matchesTo =
        !dateTo || invoiceTime <= new Date(`${dateTo}T23:59:59`).getTime();

      return matchesQuery && matchesPayment && matchesFrom && matchesTo;
    });
  }, [invoices, search, paymentFilter, dateFrom, dateTo]);

  const stats = useMemo(
    () => ({
      count: filteredInvoices.length,
      revenue: filteredInvoices.reduce(
        (sum, invoice) => sum + (invoice.totalAmount ?? 0),
        0
      ),
      tax: filteredInvoices.reduce(
        (sum, invoice) => sum + (invoice.totalTax ?? 0),
        0
      ),
    }),
    [filteredInvoices]
  );

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteInvoice(pendingDelete.id);
      setInvoices((prev) =>
        prev.filter((invoice) => invoice.id !== pendingDelete.id)
      );
      toast.success(`Invoice ${pendingDelete.invoiceNo} deleted`);
      setPendingDelete(null);
    } catch (err) {
      toast.error(
        "Couldn't delete the invoice",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setDeleting(false);
    }
  };

  const salesCols = [
    {
      id: "invoiceNo",
      name: "Invoice",
      selector: (row: SavedInvoice) => row.invoiceNo,
      sortable: true,
      width: "150px",
      cell: (row: SavedInvoice) => (
        <span className="font-semibold text-ink tnum">{row.invoiceNo}</span>
      ),
    },
    {
      id: "date",
      name: "Date",
      selector: (row: SavedInvoice) => new Date(row.createdAt).getTime(),
      sortable: true,
      width: "130px",
      cell: (row: SavedInvoice) => (
        <span className="text-ink-soft tnum">{row.date}</span>
      ),
    },
    {
      id: "customer",
      name: "Customer",
      selector: (row: SavedInvoice) => row.customerDetails?.name ?? "",
      sortable: true,
      grow: 2,
      cell: (row: SavedInvoice) => (
        <div className="min-w-0 py-2">
          <p className="truncate font-medium text-ink">
            {row.customerDetails?.name || "—"}
          </p>
          <p className="text-xs text-ink-muted tnum">
            {row.customerDetails?.phone}
          </p>
        </div>
      ),
    },
    {
      id: "payment",
      name: "Payment",
      selector: (row: SavedInvoice) => row.payment_type,
      sortable: true,
      width: "132px",
      cell: (row: SavedInvoice) => (
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-subtle py-1 pl-1 pr-3">
          <img
            src={paymentIcons[row.payment_type]}
            className="h-5 w-5"
            alt=""
          />
          <span className="text-xs font-semibold text-ink-soft">
            {paymentLabels[row.payment_type] ?? row.payment_type}
          </span>
        </span>
      ),
    },
    {
      id: "amount",
      name: "Amount",
      selector: (row: SavedInvoice) => row.totalAmount ?? 0,
      sortable: true,
      width: "140px",
      right: true,
      cell: (row: SavedInvoice) => (
        <span className="w-full text-right font-bold text-ink tnum">
          {formatINR(row.totalAmount ?? 0)}
        </span>
      ),
    },
    {
      id: "actions",
      name: "",
      width: "96px",
      cell: (row: SavedInvoice) => (
        <div className="flex items-center gap-0.5">
          <RowAction
            icon={FiEye}
            label={`View invoice ${row.invoiceNo}`}
            onClick={() => navigate(`/invoice/view/${row.id}`)}
          />
          <RowAction
            icon={FiTrash2}
            danger
            label={`Delete invoice ${row.invoiceNo}`}
            onClick={() => setPendingDelete(row)}
          />
        </div>
      ),
    },
  ];

  return (
    <AppLayout width="wide" className="space-y-5">
      <PageHeader
        title="Sales"
        description="Track, search and revisit every invoice you've created."
        badge={
          !loading && invoices.length > 0 ? (
            <Badge tone="accent">{invoices.length} total</Badge>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonStat key={i} />)
        ) : (
          <>
            <StatTile
              icon={FiFileText}
              tone="accent"
              label="Invoices"
              value={stats.count.toLocaleString("en-IN")}
              caption={filtersActive ? "matching filters" : "all time"}
            />
            <StatTile
              icon={TbCurrencyRupee}
              tone="brand"
              label="Total Revenue"
              value={formatINR(stats.revenue)}
              caption={filtersActive ? "matching filters" : "all time"}
            />
            <StatTile
              icon={FiPercent}
              tone="info"
              label="Tax Collected"
              value={formatINR(stats.tax)}
              caption={filtersActive ? "matching filters" : "all time"}
            />
          </>
        )}
      </div>

      <Card
        title="Filters"
        subtitle={
          filtersActive
            ? `${filteredInvoices.length} of ${invoices.length} invoices`
            : "Narrow the ledger down"
        }
        action={
          filtersActive ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<FiX size={14} />}
              onClick={clearFilters}>
              Clear
            </Button>
          ) : (
            <FiFilter size={15} className="text-ink-faint" />
          )
        }>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" htmlFor="sales-search" className="lg:col-span-2">
            <Input
              id="sales-search"
              name="search"
              type="search"
              placeholder="Invoice #, customer name or phone"
              prefix={<FiSearch size={15} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Payment type" htmlFor="sales-payment">
            <Select
              id="sales-payment"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}>
              <option value="all">All methods</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <DatePicker
                placeholder="Start date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={setDateFrom}
              />
            </Field>
            <Field label="To">
              <DatePicker
                placeholder="End date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={setDateTo}
              />
            </Field>
          </div>
        </div>
      </Card>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon={FiFileText}
            title="No invoices yet"
            description="Once you ring up your first sale it'll show here, with search, filters and totals."
            action={
              <Button
                icon={<FiPlus size={15} />}
                onClick={() => navigate("/invoice-create")}>
                Create your first invoice
              </Button>
            }
          />
        </Card>
      ) : (
        <CustomDataTable
          columns={salesCols}
          data={filteredInvoices}
          pagination
          highlightOnHover
          defaultSortFieldId="date"
          defaultSortAsc={false}
          onRowClicked={(row: SavedInvoice) =>
            navigate(`/invoice/view/${row.id}`)
          }
          noDataComponent={
            <EmptyState
              compact
              icon={FiSearch}
              title="No invoices match these filters"
              description="Try a different search term or widen the date range."
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FiX size={14} />}
                  onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          }
        />
      )}

      <Modal
        open={pendingDelete !== null}
        onClose={() => !deleting && setPendingDelete(null)}
        title={`Delete invoice ${pendingDelete?.invoiceNo ?? ""}?`}
        description="This permanently removes the invoice and its line items. It can't be undone."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              icon={<FiTrash2 size={15} />}
              onClick={confirmDelete}>
              Delete invoice
            </Button>
          </>
        }>
        {pendingDelete && (
          <div className="rounded-xl border border-line bg-surface-subtle p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">
                  {pendingDelete.customerDetails?.name || "Unknown customer"}
                </p>
                <p className="text-xs text-ink-muted">{pendingDelete.date}</p>
              </div>
              <p className="shrink-0 text-lg font-bold text-ink tnum">
                {formatINR(pendingDelete.totalAmount ?? 0)}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

export default Sales;
