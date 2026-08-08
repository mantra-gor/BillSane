import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useForm, useWatch } from "react-hook-form";
import {
  FiAlertCircle,
  FiCornerDownLeft,
  FiPlus,
  FiRotateCcw,
  FiShoppingCart,
  FiTrash2,
  FiUser,
} from "react-icons/fi";
import { TbCurrencyRupee } from "react-icons/tb";
import AppLayout from "../components/core/layout/AppLayout";
import CustomerIdentity from "../components/common/CustomerIdentity";
import Card from "../components/ui/elements/Card";
import Button from "../components/ui/elements/Button";
import Field from "../components/ui/elements/Field";
import Input from "../components/ui/elements/Input";
import LabeledInput from "../components/ui/elements/LabeledInput";
import EmptyState from "../components/ui/elements/EmptyState";
import ProductSelect from "../components/ui/elements/ProductSelect";
import { useToast } from "../components/ui/feedback/toastContext";
import { saveInvoice } from "../utils/invoiceStore";
import { formatINR } from "../utils/format";
import { MOD_KEY, hasModifier } from "../hooks/usePlatform";
import { useCustomerLookup } from "../hooks/useCustomerLookup";
import type { CustomerMatch } from "../utils/customerStore";
import type { ProductOption } from "../utils/productStore";
import {
  blockInvalidNumberKey,
  blockNonDigitKey,
  emailValidation,
  phoneValidation,
  EMAIL_REGEX,
  PHONE_REGEX,
} from "../utils/validators";
import upiIcon from "../assets/resources/upi-icon.png";
import cardIcon from "../assets/resources/card-icon.png";
import cashIcon from "../assets/resources/cash-icon.png";

interface CustomerFormValues {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

/**
 * A draft row. Rate/qty/tax% are held as strings so a half-typed value ("1.",
 * "") round-trips through the input without the cursor jumping — they're
 * coerced to numbers only when totals are computed.
 */
interface DraftLine {
  id: number;
  // The catalog item this row sells. Null means the name was typed rather than
  // picked, which is fine — saving the invoice adds it to inventory.
  productId: number | null;
  itemName: string;
  unit: string;
  rate: string;
  qty: string;
  taxType: string;
  taxPer: string;
}

const PAYMENT_OPTIONS = [
  { id: "cash", label: "Cash", icon: cashIcon },
  { id: "card", label: "Card", icon: cardIcon },
  { id: "upi", label: "UPI", icon: upiIcon },
];

// Columns are declared once and shared by the header and every row, so the
// grid can never drift out of alignment. The fixed widths total ~580px with
// gaps and padding, which keeps the natural minimum inside the entry column at
// a 1440px window (sidebar + cart leave it roughly 760px).
const GRID = "grid-cols-[minmax(0,1fr)_100px_72px_96px_76px_120px_36px]";

let nextLineId = 1;

function newLine(): DraftLine {
  return {
    id: nextLineId++,
    productId: null,
    itemName: "",
    unit: "pcs",
    rate: "",
    qty: "1",
    taxType: "GST",
    taxPer: "18",
  };
}

const num = (value: string) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface LineTotals {
  base: number;
  tax: number;
  total: number;
}

function lineTotals(line: DraftLine): LineTotals {
  const base = num(line.rate) * num(line.qty);
  const tax = (base * num(line.taxPer)) / 100;
  return { base, tax, total: base + tax };
}

/** A line counts once it names something and carries a quantity. */
function isFilled(line: DraftLine): boolean {
  return line.itemName.trim() !== "" && num(line.qty) > 0;
}

function InvoiceCreate() {
  const navigate = useNavigate();
  const toast = useToast();

  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [payment, setPayment] = useState("cash");
  const [discount, setDiscount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showLineErrors, setShowLineErrors] = useState(false);
  // Set when a row is appended, so the effect below can focus its first input.
  const focusLineId = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset: resetCustomer,
    control,
    getValues,
    setValue,
    setFocus,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    defaultValues: { customerName: "", customerPhone: "", customerEmail: "" },
  });

  // The customer record this invoice will be billed to. Null means "whoever the
  // phone number turns out to belong to", which is the walk-in path.
  const [linked, setLinked] = useState<CustomerMatch | null>(null);
  // useWatch, not watch() — watch returns a fresh function each render, which
  // the React Compiler can't memoize safely.
  const typedPhone = useWatch({ control, name: "customerPhone" });
  const typedEmail = useWatch({ control, name: "customerEmail" });
  const lookup = useCustomerLookup(typedPhone, typedEmail);

  /**
   * Accept a proposed match. Only blank or still-invalid fields are filled: if
   * the operator has already typed a new number for someone found by their old
   * email, that new number is what they meant, and it overwrites the one on
   * file when the invoice saves.
   */
  const linkCustomer = useCallback(
    (match: CustomerMatch) => {
      setLinked(match);
      const fill = (
        field: keyof CustomerFormValues,
        value: string,
        isComplete: (current: string) => boolean
      ) => {
        if (!value) return;
        if (!isComplete(getValues(field).trim())) {
          setValue(field, value, { shouldValidate: true });
        }
      };
      fill("customerName", match.name, (current) => current !== "");
      fill("customerPhone", match.phone, (current) => PHONE_REGEX.test(current));
      fill("customerEmail", match.email ?? "", (current) =>
        EMAIL_REGEX.test(current)
      );
    },
    [getValues, setValue]
  );

  const unlinkCustomer = useCallback(() => {
    setLinked(null);
    resetCustomer({ customerName: "", customerPhone: "", customerEmail: "" });
    setFocus("customerPhone");
  }, [resetCustomer, setFocus]);

  // With exactly one candidate, Enter accepts it — the counter shouldn't have to
  // reach for the mouse. Enter is swallowed either way so a half-filled customer
  // can never submit the invoice by accident.
  const soleMatch =
    !linked && lookup.matches.length === 1 ? lookup.matches[0] : null;

  const onCustomerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || hasModifier(e)) return;
    e.preventDefault();
    if (soleMatch) linkCustomer(soleMatch);
  };

  const addLine = useCallback(() => {
    const line = newLine();
    focusLineId.current = line.id;
    setLines((prev) => [...prev, line]);
  }, []);

  const removeLine = (id: number) => {
    setLines((prev) => {
      const next = prev.filter((line) => line.id !== id);
      // Never leave the counter with nothing to type into.
      return next.length > 0 ? next : [newLine()];
    });
  };

  const patchLine = (id: number, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line))
    );
  };

  /**
   * A catalog item was chosen, so its price and tax become the row's — that is
   * the point of picking one, and anything already typed was a guess at the
   * same numbers. (The customer panel fills only blanks, because there the
   * typed value is the *newer* fact; here the catalog is.)
   */
  const applyProduct = (id: number, product: ProductOption) => {
    patchLine(id, {
      productId: product.id,
      itemName: product.name,
      unit: product.unit,
      rate: product.rate !== null ? String(product.rate) : "",
      taxType: product.taxType ?? "",
      taxPer: product.taxPer !== null ? String(product.taxPer) : "",
    });
  };

  // Focus the item-name box of a freshly added row. The cell is a wrapper now,
  // so the query reaches through to the search input inside it.
  useEffect(() => {
    if (focusLineId.current === null) return;
    const input = gridRef.current?.querySelector<HTMLInputElement>(
      `[data-line="${focusLineId.current}"][data-field="itemName"] input`
    );
    input?.focus();
    focusLineId.current = null;
  }, [lines]);

  const totals = useMemo(() => {
    const filled = lines.filter(isFilled);
    const base = filled.reduce((sum, line) => sum + lineTotals(line).base, 0);
    const tax = filled.reduce((sum, line) => sum + lineTotals(line).tax, 0);
    const discountValue = Math.min(Math.max(num(discount), 0), base + tax);
    return {
      itemCount: filled.length,
      units: filled.reduce((sum, line) => sum + num(line.qty), 0),
      base,
      tax,
      discount: discountValue,
      grand: base + tax - discountValue,
    };
  }, [lines, discount]);

  const hasItems = totals.itemCount > 0;

  const resetAll = () => {
    resetCustomer();
    setLinked(null);
    setLines([newLine()]);
    setDiscount("");
    setPayment("cash");
    setShowLineErrors(false);
  };

  const onSubmit = async (data: CustomerFormValues) => {
    const filled = lines.filter(isFilled);

    if (filled.length === 0) {
      setShowLineErrors(true);
      toast.error(
        "Add at least one item",
        "An invoice needs a line with a name and a quantity."
      );
      return;
    }

    setSubmitting(true);
    try {
      const saved = await saveInvoice({
        date: new Date()
          .toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          .replace(",", ""),
        customerDetails: {
          id: linked?.id,
          name: data.customerName,
          phone: data.customerPhone,
          email: data.customerEmail,
        },
        lineItems: filled.map((line) => {
          const { tax, total } = lineTotals(line);
          return {
            id: line.id,
            productId: line.productId ?? undefined,
            itemName: line.itemName.trim(),
            rate: num(line.rate),
            qty: num(line.qty),
            taxType: line.taxType.trim(),
            taxPer: num(line.taxPer),
            tax,
            subTotal: total,
          };
        }),
        totalAmount: totals.grand,
        totalTax: totals.tax,
        totalDiscount: totals.discount,
        payment_type: payment,
      });

      toast.success(
        `Invoice ${saved.invoiceNo} created`,
        `${formatINR(totals.grand)} · ${payment.toUpperCase()}`
      );
      navigate("/invoice/view", { state: saved });
    } catch (err) {
      toast.error(
        "Couldn't save the invoice",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ⌘Enter submits from anywhere on the screen — the counter shortcut.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (hasModifier(e) && e.key === "Enter") {
        e.preventDefault();
        void handleSubmit(onSubmit)();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSubmit, lines, discount, payment, totals.grand]);

  /** Enter anywhere in the last row starts the next one. */
  const onRowKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "Enter" || hasModifier(e)) return;
    // …unless the item search has a menu open, where Enter means "pick the
    // highlighted item". react-select doesn't stop the event, so the row would
    // otherwise both choose a product and skip to a new line.
    if ((e.target as HTMLElement).getAttribute("aria-expanded") === "true") return;
    e.preventDefault();
    if (index === lines.length - 1) addLine();
    else {
      gridRef.current
        ?.querySelector<HTMLInputElement>(
          `[data-line="${lines[index + 1].id}"][data-field="itemName"] input`
        )
        ?.focus();
    }
  };

  const cellClass =
    "h-9 w-full rounded-lg border border-transparent bg-transparent px-2.5 text-sm text-ink transition-colors hover:border-line focus:border-munsell_blue focus:bg-surface focus:outline-none focus:ring-[3px] focus:ring-munsell_blue/15 placeholder:text-ink-faint";

  return (
    <AppLayout width="wide">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
          {/* ---------------------------------------------------------------
              Entry column
              --------------------------------------------------------------- */}
          <div className="min-w-0 flex-1 space-y-5">
            <div>
              <h1 className="text-[22px] font-bold leading-tight text-ink">
                New Invoice
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                Add the customer and what they bought — totals update as you
                type.
              </p>
            </div>

            <Card
              title="Customer"
              subtitle="Printed on the invoice"
              action={<FiUser size={15} className="text-ink-faint" />}>
              <CustomerIdentity
                matches={lookup.matches}
                searching={lookup.searching}
                searched={lookup.searched}
                linked={linked}
                phone={typedPhone}
                email={typedEmail}
                onLink={linkCustomer}
                onUnlink={unlinkCustomer}
              />

              {/* Phone leads: it is the fastest thing to ask for and the key the
                  lookup is fastest on, so a regular is recognised before the
                  operator has typed anything else. */}
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <LabeledInput
                  title="Phone"
                  required
                  autoFocus
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit number"
                  hint={soleMatch ? "Press ⏎ to use the match above" : undefined}
                  onKeyDown={(e) => {
                    blockNonDigitKey(e);
                    onCustomerKeyDown(e);
                  }}
                  error={errors.customerPhone?.message}
                  {...register("customerPhone", phoneValidation)}
                />
                <LabeledInput
                  title="Full name"
                  required
                  placeholder="e.g. Rohan Mehta"
                  onKeyDown={onCustomerKeyDown}
                  error={errors.customerName?.message}
                  {...register("customerName", {
                    required: "Customer name is required",
                  })}
                />
                <LabeledInput
                  title="Email"
                  required
                  type="email"
                  placeholder="name@example.com"
                  onKeyDown={onCustomerKeyDown}
                  error={errors.customerEmail?.message}
                  {...register("customerEmail", emailValidation)}
                />
              </div>
            </Card>

            <Card
              title="Items"
              subtitle={
                hasItems
                  ? `${totals.itemCount} line${totals.itemCount === 1 ? "" : "s"} · ${totals.units} unit${totals.units === 1 ? "" : "s"}`
                  : "Nothing added yet"
              }
              flush
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FiPlus size={14} />}
                  onClick={addLine}>
                  Add item
                </Button>
              }>
              <div className="overflow-x-auto border-t border-line">
                <div className="min-w-[700px]">
                  {/* Header */}
                  <div
                    className={`grid ${GRID} items-center gap-2 border-b border-line bg-surface-subtle px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted`}>
                    <span>Item</span>
                    <span>Rate (₹)</span>
                    <span>Qty</span>
                    <span>Tax type</span>
                    <span>Tax %</span>
                    <span className="text-right">Line total</span>
                    <span className="sr-only">Remove</span>
                  </div>

                  {/* Rows */}
                  <div ref={gridRef} className="divide-y divide-line-faint">
                    {lines.map((line, index) => {
                      const { tax, total } = lineTotals(line);
                      const blank = !isFilled(line);
                      const flagged =
                        showLineErrors && blank && lines.length === 1;

                      return (
                        <div
                          key={line.id}
                          className={`grid ${GRID} items-center gap-2 px-4 py-1.5 transition-colors ${
                            flagged ? "bg-danger-soft" : "hover:bg-surface-subtle"
                          }`}
                          onKeyDown={(e) => onRowKeyDown(e, index)}>
                          <div
                            data-line={line.id}
                            data-field="itemName"
                            className="relative min-w-0">
                            <ProductSelect
                              value={{
                                productId: line.productId,
                                name: line.itemName,
                              }}
                              onType={(name) =>
                                // Typing after picking means this is no longer
                                // that catalog item — drop the link so the row
                                // is judged on its name again.
                                patchLine(line.id, { productId: null, itemName: name })
                              }
                              onPick={(product) => applyProduct(line.id, product)}
                            />
                            {/* Overlaid rather than stacked below: a hint that
                                appears on the first keystroke must not resize
                                the row under the operator's hands. */}
                            {line.productId === null && line.itemName.trim() !== "" && (
                              <span
                                title="Not in your inventory yet — saving this invoice adds it"
                                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-munsell_blue-5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-munsell_blue-700">
                                New
                              </span>
                            )}
                          </div>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className={`${cellClass} tnum`}
                            placeholder="0.00"
                            value={line.rate}
                            onWheel={(e) =>
                              (e.target as HTMLInputElement).blur()
                            }
                            onKeyDown={blockInvalidNumberKey}
                            onChange={(e) =>
                              patchLine(line.id, { rate: e.target.value })
                            }
                          />
                          <input
                            type="number"
                            min={0}
                            step="1"
                            aria-label={`Quantity in ${line.unit}`}
                            title={`Quantity in ${line.unit}`}
                            className={`${cellClass} tnum`}
                            placeholder="0"
                            value={line.qty}
                            onWheel={(e) =>
                              (e.target as HTMLInputElement).blur()
                            }
                            onKeyDown={blockInvalidNumberKey}
                            onChange={(e) =>
                              patchLine(line.id, { qty: e.target.value })
                            }
                          />
                          <input
                            className={cellClass}
                            placeholder="GST"
                            value={line.taxType}
                            onChange={(e) =>
                              patchLine(line.id, { taxType: e.target.value })
                            }
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            className={`${cellClass} tnum`}
                            placeholder="0"
                            value={line.taxPer}
                            onWheel={(e) =>
                              (e.target as HTMLInputElement).blur()
                            }
                            onKeyDown={blockInvalidNumberKey}
                            onChange={(e) =>
                              patchLine(line.id, { taxPer: e.target.value })
                            }
                          />
                          <div className="pr-1 text-right">
                            <p
                              className={`text-sm font-bold tnum ${
                                blank ? "text-ink-faint" : "text-ink"
                              }`}>
                              {formatINR(total)}
                            </p>
                            {tax > 0 && (
                              <p className="text-[11px] text-ink-faint tnum">
                                incl. {formatINR(tax)} tax
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            aria-label={`Remove line ${index + 1}`}
                            title="Remove line"
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger">
                            <FiTrash2 size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                    <button
                      type="button"
                      onClick={addLine}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-munsell_blue transition-colors hover:bg-munsell_blue-5">
                      <FiPlus size={15} />
                      Add another item
                    </button>
                    <p className="hidden items-center gap-1.5 text-xs text-ink-faint sm:flex">
                      <kbd className="kbd">
                        <FiCornerDownLeft size={9} />
                      </kbd>
                      on the last row adds a line
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* ---------------------------------------------------------------
              Cart / summary column — sticky, so the total is always in view
              --------------------------------------------------------------- */}
          <aside className="w-full shrink-0 xl:sticky xl:top-6 xl:w-[340px]">
            <div className="card overflow-hidden">
              <header className="flex items-center gap-2.5 border-b border-line bg-surface-subtle px-5 py-3.5">
                <FiShoppingCart size={16} className="text-munsell_blue" />
                <h2 className="text-sm font-bold text-ink">Order summary</h2>
                {hasItems && (
                  <span className="ml-auto rounded-full bg-prussian_blue px-2 py-0.5 text-[11px] font-bold text-white tnum">
                    {totals.units}
                  </span>
                )}
              </header>

              {!hasItems ? (
                <EmptyState
                  compact
                  icon={FiShoppingCart}
                  title="Cart is empty"
                  description="Add an item on the left and the totals will appear here."
                />
              ) : (
                <div className="px-5 py-4">
                  <dl className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-ink-muted">Subtotal</dt>
                      <dd className="font-semibold text-ink tnum">
                        {formatINR(totals.base)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-ink-muted">Tax</dt>
                      <dd className="font-semibold text-ink tnum">
                        {formatINR(totals.tax)}
                      </dd>
                    </div>
                    {totals.discount > 0 && (
                      <div className="flex items-center justify-between">
                        <dt className="text-ink-muted">Discount</dt>
                        <dd className="font-semibold text-success tnum">
                          −{formatINR(totals.discount)}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="my-4">
                    <Field label="Discount (₹)" htmlFor="discount">
                      <Input
                        id="discount"
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0.00"
                        className="tnum"
                        prefix={<TbCurrencyRupee size={15} />}
                        value={discount}
                        onKeyDown={blockInvalidNumberKey}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        onChange={(e) => setDiscount(e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="rule-fade" />

                  <div className="flex items-end justify-between pt-4">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                      Amount due
                    </span>
                    <span className="text-[28px] font-bold leading-none text-ink tnum">
                      {formatINR(totals.grand)}
                    </span>
                  </div>
                </div>
              )}

              {/* Payment method */}
              <div className="border-t border-line px-5 py-4">
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                  Payment method
                </p>
                <div
                  role="radiogroup"
                  aria-label="Payment method"
                  className="grid grid-cols-3 gap-2">
                  {PAYMENT_OPTIONS.map((option) => {
                    const selected = payment === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPayment(option.id)}
                        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-2.5 transition-all duration-150 ease-snap ${
                          selected
                            ? "border-munsell_blue bg-munsell_blue-5 shadow-xs"
                            : "border-line bg-surface hover:border-line-strong hover:bg-surface-subtle"
                        }`}>
                        <img src={option.icon} alt="" className="h-7 w-7" />
                        <span
                          className={`text-xs font-semibold ${
                            selected ? "text-munsell_blue-700" : "text-ink-soft"
                          }`}>
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 border-t border-line bg-surface-subtle px-5 py-4">
                {showLineErrors && !hasItems && (
                  <p className="mb-1 flex items-start gap-1.5 text-xs font-medium text-danger">
                    <FiAlertCircle size={13} className="mt-px shrink-0" />
                    Add at least one item to create the invoice.
                  </p>
                )}
                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                  loading={submitting}
                  title={`Create invoice (${MOD_KEY}↵)`}>
                  {submitting
                    ? "Creating…"
                    : `Create invoice · ${formatINR(totals.grand)}`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  icon={<FiRotateCcw size={14} />}
                  onClick={resetAll}>
                  Reset
                </Button>
                <p className="pt-1 text-center text-[11px] text-ink-faint">
                  Press <kbd className="kbd">{MOD_KEY}</kbd>{" "}
                  <kbd className="kbd">↵</kbd> to create
                </p>
              </div>
            </div>
          </aside>
        </div>
      </form>
    </AppLayout>
  );
}

export default InvoiceCreate;
