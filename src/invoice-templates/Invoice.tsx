import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useReactToPrint } from "react-to-print";
import { FiArrowLeft, FiFileText, FiPlus, FiPrinter } from "react-icons/fi";
import brand_logo from "../react/assets/branding/logo-no-background.png";
import Button from "../react/components/ui/elements/Button";
import Badge from "../react/components/ui/elements/Badge";
import EmptyState from "../react/components/ui/elements/EmptyState";
import { SkeletonText } from "../react/components/ui/elements/Skeleton";
import { MOD_KEY, hasModifier } from "../react/hooks/usePlatform";
import {
  defaultBusinessConfig,
  getBusinessConfig,
  type BusinessConfig,
} from "../react/utils/businessConfig";
import { getInvoiceById, type SavedInvoice } from "../react/utils/invoiceStore";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;

function Invoice() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);
  const reactToPrintFn = useReactToPrint({ contentRef });

  const [business, setBusiness] = useState<BusinessConfig>(
    defaultBusinessConfig
  );
  const [billData, setBillData] = useState<SavedInvoice | undefined>(
    id ? undefined : (location.state as SavedInvoice | undefined)
  );
  const [loadingInvoice, setLoadingInvoice] = useState(!!id);

  // Print on ⌘P and go back on ⌘←. Bare Enter used to trigger a print, which
  // fired whenever the user pressed Enter for any reason.
  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      if (!hasModifier(e)) return;

      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        reactToPrintFn();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigate("/sales");
      }
    };

    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [navigate, reactToPrintFn]);

  useEffect(() => {
    getBusinessConfig().then(setBusiness).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getInvoiceById(id).then((invoice) => {
      if (cancelled) return;
      setBillData(invoice);
      setLoadingInvoice(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const totals = useMemo(() => {
    if (!billData) return null;
    const gross = billData.lineItems.reduce(
      (sum, item) => sum + (item.subTotal ?? 0),
      0
    );
    const tax = billData.totalTax ?? 0;
    return {
      taxable: gross - tax,
      tax,
      discount: billData.totalDiscount ?? 0,
      total: billData.totalAmount ?? 0,
    };
  }, [billData]);

  if (loadingInvoice) {
    return (
      <div className="mx-auto w-full max-w-[820px] p-6">
        <div className="card p-10">
          <SkeletonText lines={8} />
        </div>
      </div>
    );
  }

  if (!billData || !totals) {
    return (
      <div className="mx-auto w-full max-w-[820px] p-6">
        <div className="card">
          <EmptyState
            icon={FiFileText}
            title="Invoice not found"
            description="This invoice may have been deleted, or the link is out of date."
            action={
              <Button
                icon={<FiArrowLeft size={15} />}
                onClick={() => navigate("/sales")}>
                Back to Sales
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[880px] p-6">
      {/* Screen-only action bar */}
      <div className="hideContent mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            icon={<FiArrowLeft size={15} />}
            onClick={() => navigate("/sales")}>
            Sales
          </Button>
          <div>
            <h1 className="text-[17px] font-bold leading-tight text-ink">
              Invoice {billData.invoiceNo}
            </h1>
            <p className="text-xs text-ink-muted">{billData.date}</p>
          </div>
          <Badge tone="success" dot>
            Paid · {billData.payment_type.toUpperCase()}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<FiPlus size={15} />}
            onClick={() => navigate("/invoice-create")}>
            New Invoice
          </Button>
          <Button
            size="sm"
            icon={<FiPrinter size={15} />}
            onClick={() => reactToPrintFn()}
            title={`Print (${MOD_KEY}P)`}>
            Print
          </Button>
        </div>
      </div>

      {/* The printed sheet */}
      <div
        ref={contentRef}
        className="overflow-hidden rounded-2xl border border-line bg-white shadow-card print:rounded-none print:border-0 print:shadow-none">
        {/* Masthead */}
        <div className="flex items-start justify-between gap-8 border-b border-line px-10 pb-7 pt-9">
          <img
            src={business.logo || brand_logo}
            className="h-12 max-w-[220px] object-contain object-left"
            alt=""
          />
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
              Tax Invoice
            </p>
            <p className="mt-1 text-xl font-bold text-ink tnum">
              {billData.invoiceNo}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted tnum">
              {billData.date}
            </p>
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-8 border-b border-line bg-surface-subtle px-10 py-7">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
              From
            </p>
            <p className="text-sm font-bold text-ink">
              {business.companyName || "Your Company Name"}
            </p>
            <address className="mt-1 max-w-[280px] whitespace-pre-line text-[13px] not-italic leading-relaxed text-ink-soft">
              {business.address || "—"}
            </address>
            <dl className="mt-2 space-y-0.5 text-[13px] text-ink-soft">
              <div className="flex gap-1.5">
                <dt className="text-ink-faint">Phone</dt>
                <dd className="tnum">{business.phone || "—"}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-faint">Email</dt>
                <dd>{business.email || "—"}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-faint">GSTIN</dt>
                <dd className="font-medium tnum">{business.gstNo || "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="text-right">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
              Billed to
            </p>
            <p className="text-sm font-bold text-ink">
              {billData.customerDetails?.name || "—"}
            </p>
            <dl className="mt-1 space-y-0.5 text-[13px] text-ink-soft">
              {billData.customerDetails?.phone && (
                <dd className="tnum">{billData.customerDetails.phone}</dd>
              )}
              {billData.customerDetails?.email && (
                <dd>{billData.customerDetails.email}</dd>
              )}
            </dl>
          </div>
        </div>

        {/* Line items */}
        <div className="px-10 py-7">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-line-strong">
                <th className="w-8 pb-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                  #
                </th>
                <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                  Item
                </th>
                <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                  Rate
                </th>
                <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                  Qty
                </th>
                <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                  Tax
                </th>
                <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {billData.lineItems.map((item: LineItem, index: number) => (
                <tr
                  key={item.id ?? index}
                  className="border-b border-line-faint">
                  <td className="py-3 text-[13px] text-ink-faint tnum">
                    {index + 1}
                  </td>
                  <td className="py-3 pr-4 text-[13px] font-medium text-ink">
                    {item.itemName}
                  </td>
                  <td className="py-3 text-right text-[13px] text-ink-soft tnum">
                    {item.rate === 0
                      ? "Free"
                      : money(item.rate ?? 0)}
                  </td>
                  <td className="py-3 text-right text-[13px] text-ink-soft tnum">
                    {item.qty}
                  </td>
                  <td className="py-3 text-right text-[13px] text-ink-soft tnum">
                    {money(item.tax ?? 0)}
                    <span className="ml-1 text-[11px] text-ink-faint">
                      ({item.taxPer}%)
                    </span>
                  </td>
                  <td className="py-3 text-right text-[13px] font-semibold text-ink tnum">
                    {money(item.subTotal ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary */}
          <div className="mt-6 flex justify-end">
            <dl className="w-[300px] space-y-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Taxable value</dt>
                <dd className="font-medium text-ink tnum">
                  {money(totals.taxable)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Tax</dt>
                <dd className="font-medium text-ink tnum">
                  {money(totals.tax)}
                </dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Discount</dt>
                  <dd className="font-medium text-success tnum">
                    −{money(totals.discount)}
                  </dd>
                </div>
              )}
              <div className="mt-3 flex items-baseline justify-between border-t-2 border-line-strong pt-3">
                <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted">
                  Total
                </dt>
                <dd className="text-2xl font-bold text-ink tnum">
                  {money(totals.total)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Payment */}
        <div className="border-t border-line bg-surface-subtle px-10 py-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
            Payment
          </p>
          <p className="mt-1.5 text-sm text-ink-soft">
            Received via{" "}
            <span className="font-semibold capitalize text-ink">
              {billData.payment_type}
            </span>
          </p>
        </div>

        <footer className="bg-shell px-10 py-4 text-center text-[11px] text-white/60">
          © {new Date().getFullYear()} BillSane • Crafted with ❤️ in India •
          Powered by Mantra Gor
        </footer>
      </div>
    </div>
  );
}

export default Invoice;
