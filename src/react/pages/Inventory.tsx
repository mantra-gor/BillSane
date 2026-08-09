import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useForm, useWatch } from "react-hook-form";
import {
  FiAlertTriangle,
  FiEdit2,
  FiPackage,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import { TbCurrencyRupee } from "react-icons/tb";
import AppLayout from "../components/core/layout/AppLayout";
import PageHeader from "../components/ui/elements/PageHeader";
import StatTile from "../components/ui/elements/StatTile";
import Card from "../components/ui/elements/Card";
import Button from "../components/ui/elements/Button";
import Badge from "../components/ui/elements/Badge";
import Field from "../components/ui/elements/Field";
import Input from "../components/ui/elements/Input";
import Select from "../components/ui/elements/Select";
import LabeledInput from "../components/ui/elements/LabeledInput";
import Modal from "../components/ui/elements/Modal";
import EmptyState from "../components/ui/elements/EmptyState";
import CustomDataTable from "../components/ui/elements/CustomDataTable";
import { SkeletonRows, SkeletonStat } from "../components/ui/elements/Skeleton";
import ImportInventoryModal from "../components/inventory/ImportInventoryModal";
import { useToast } from "../components/ui/feedback/toastContext";
import { useAuth } from "../auth/authContext";
import { MOD_KEY, hasModifier } from "../hooks/usePlatform";
import { formatINR } from "../utils/format";
import { blockInvalidNumberKey } from "../utils/validators";
import {
  UNIT_OPTIONS,
  createProduct,
  deleteProduct,
  formatLastSold,
  listProducts,
  stockLevel,
  updateProduct,
  type ProductKind,
  type ProductSummary,
  type StockLevel,
} from "../utils/productStore";

// Every field is a string in the form: an empty money box means "unknown", and
// `valueAsNumber` would turn that into NaN. Coerced on submit instead.
interface ItemFormValues {
  name: string;
  sku: string;
  kind: ProductKind;
  unit: string;
  hsnCode: string;
  rate: string;
  taxType: string;
  taxPer: string;
  stockQty: string;
  lowStockAt: string;
}

const BLANK_ITEM: ItemFormValues = {
  name: "",
  sku: "",
  kind: "product",
  unit: "pcs",
  hsnCode: "",
  rate: "",
  taxType: "GST",
  taxPer: "18",
  stockQty: "",
  lowStockAt: "",
};

const SEARCH_DEBOUNCE_MS = 250;

// Only the levels a number alone doesn't explain. "Not counted" and services
// are rendered as the whole cell instead — a badge beside text that says the
// same thing is noise, and the Type column already names services.
const STOCK_BADGE: Partial<
  Record<StockLevel, { tone: "warning" | "danger"; label: string }>
> = {
  low: { tone: "warning", label: "Low" },
  out: { tone: "danger", label: "Out" },
  oversold: { tone: "danger", label: "Oversold" },
};

/** Empty string means "not set", which is a different answer from zero. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toField(value: number | null): string {
  return value === null ? "" : String(value);
}

function RowAction({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ComponentType<{ size?: number }>;
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
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors ${
        danger
          ? "text-ink-faint hover:bg-danger-soft hover:text-danger-ink"
          : "text-ink-faint hover:bg-surface-muted hover:text-ink"
      }`}>
      <Icon size={15} />
    </button>
  );
}

function Inventory() {
  const navigate = useNavigate();
  // A cashier reads the catalog while billing; repricing it is another job.
  const canManage = useAuth().can("inventory:manage");
  const toast = useToast();

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // The item being edited; null with `creating` true is the "add" form.
  const [editing, setEditing] = useState<ProductSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProductSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    control,
    formState: { errors },
  } = useForm<ItemFormValues>({ defaultValues: BLANK_ITEM });

  // Services are billed, never counted, so their stock fields are hidden rather
  // than sitting there inviting a number that would be ignored. useWatch, not
  // watch() — watch returns a fresh function each render, which the React
  // Compiler can't memoize safely.
  const kind = useWatch({ control, name: "kind" });

  const load = useCallback(
    async (term: string) => {
      try {
        setProducts(await listProducts(term || undefined));
      } catch (err) {
        toast.error(
          "Couldn't load inventory",
          err instanceof Error ? err.message : String(err)
        );
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  // Search runs in SQL, so the list stays correct past the row cap rather than
  // filtering only what happened to be fetched.
  useEffect(() => {
    const timer = setTimeout(() => void load(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, load]);

  // ⌘I / Ctrl+I opens the importer — hasModifier picks the right one, so the
  // chord is the same gesture on macOS and Windows.
  useEffect(() => {
    if (!canManage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (hasModifier(e) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setImporting(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canManage]);

  const stats = useMemo(() => {
    const needsAttention = products.filter((product) => {
      const level = stockLevel(product);
      return level === "low" || level === "out" || level === "oversold";
    }).length;
    const uncounted = products.filter(
      (product) => stockLevel(product) === "uncounted"
    ).length;
    const value = products.reduce(
      (sum, product) => sum + (product.stockQty ?? 0) * (product.rate ?? 0),
      0
    );
    return { total: products.length, needsAttention, uncounted, value };
  }, [products]);

  const startCreating = () => {
    resetForm(BLANK_ITEM);
    setEditing(null);
    setCreating(true);
  };

  const startEditing = (product: ProductSummary) => {
    resetForm({
      name: product.name,
      sku: product.sku ?? "",
      kind: product.kind,
      unit: product.unit,
      hsnCode: product.hsnCode ?? "",
      rate: toField(product.rate),
      taxType: product.taxType ?? "",
      taxPer: toField(product.taxPer),
      stockQty: toField(product.stockQty),
      lowStockAt: toField(product.lowStockAt),
    });
    setCreating(false);
    setEditing(product);
  };

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
  };

  const onSave = async (data: ItemFormValues) => {
    setSaving(true);
    const input = {
      name: data.name,
      sku: data.sku.trim() || null,
      kind: data.kind,
      unit: data.unit,
      hsnCode: data.hsnCode.trim() || null,
      rate: toNumber(data.rate),
      taxType: data.taxType.trim() || null,
      taxPer: toNumber(data.taxPer),
      stockQty: toNumber(data.stockQty),
      lowStockAt: toNumber(data.lowStockAt),
    };
    try {
      if (editing) await updateProduct({ id: editing.id, ...input });
      else await createProduct(input);
      toast.success(editing ? "Item updated" : "Item added", data.name);
      closeForm();
      await load(search.trim());
    } catch (err) {
      toast.error(
        editing ? "Couldn't update the item" : "Couldn't add the item",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteProduct(pendingDelete.id);
      toast.success(`${pendingDelete.name} deleted`);
      setPendingDelete(null);
      await load(search.trim());
    } catch (err) {
      toast.error(
        "Couldn't delete the item",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      id: "name",
      name: "Item",
      selector: (row: ProductSummary) => row.name,
      sortable: true,
      grow: 2,
      cell: (row: ProductSummary) => (
        <div className="min-w-0 py-2">
          <p className="truncate font-medium text-ink">{row.name}</p>
          <p className="truncate text-xs text-ink-muted tnum">
            {[row.sku, row.hsnCode ? `HSN ${row.hsnCode}` : null]
              .filter(Boolean)
              .join(" · ") || "No code"}
          </p>
        </div>
      ),
    },
    {
      id: "kind",
      name: "Type",
      selector: (row: ProductSummary) => row.kind,
      sortable: true,
      width: "110px",
      cell: (row: ProductSummary) => (
        <Badge tone={row.kind === "service" ? "info" : "neutral"} size="sm">
          {row.kind === "service" ? "Service" : "Product"}
        </Badge>
      ),
    },
    {
      id: "rate",
      name: "Rate",
      selector: (row: ProductSummary) => row.rate ?? 0,
      sortable: true,
      width: "120px",
      right: true,
      cell: (row: ProductSummary) => (
        <span className="w-full text-right text-ink-soft tnum">
          {row.rate === null ? "—" : formatINR(row.rate)}
        </span>
      ),
    },
    {
      id: "stockQty",
      name: "In stock",
      // Uncounted sorts to the bottom rather than pretending to be zero.
      selector: (row: ProductSummary) =>
        row.stockQty ?? Number.NEGATIVE_INFINITY,
      sortable: true,
      width: "170px",
      cell: (row: ProductSummary) => {
        const level = stockLevel(row);
        if (row.kind === "service") {
          return <span className="text-ink-faint">—</span>;
        }
        if (level === "uncounted") {
          return (
            <Badge tone="neutral" size="sm">
              Not counted
            </Badge>
          );
        }
        const badge = STOCK_BADGE[level];
        return (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="font-semibold text-ink tnum">
              {row.stockQty?.toLocaleString("en-IN")} {row.unit}
            </span>
            {badge && (
              <Badge tone={badge.tone} size="sm">
                {badge.label}
              </Badge>
            )}
          </span>
        );
      },
    },
    {
      id: "unitsSold",
      name: "Sold",
      selector: (row: ProductSummary) => row.unitsSold,
      sortable: true,
      width: "100px",
      right: true,
      cell: (row: ProductSummary) => (
        <span className="w-full text-right text-ink-soft tnum">
          {row.unitsSold.toLocaleString("en-IN")}
        </span>
      ),
    },
    {
      id: "revenue",
      name: "Revenue",
      selector: (row: ProductSummary) => row.revenue,
      sortable: true,
      width: "140px",
      right: true,
      cell: (row: ProductSummary) => (
        <span className="w-full text-right font-bold text-ink tnum">
          {formatINR(row.revenue)}
        </span>
      ),
    },
    {
      id: "actions",
      name: "",
      width: "96px",
      omit: !canManage,
      cell: (row: ProductSummary) => (
        <div className="flex items-center gap-0.5">
          <RowAction
            icon={FiEdit2}
            label={`Edit ${row.name}`}
            onClick={() => startEditing(row)}
          />
          <RowAction
            icon={FiTrash2}
            danger
            label={`Delete ${row.name}`}
            onClick={() => setPendingDelete(row)}
          />
        </div>
      ),
    },
  ];

  const formOpen = creating || editing !== null;
  const lastSold = editing ? formatLastSold(editing.lastSoldAt) : null;

  return (
    <AppLayout width="wide" className="space-y-5">
      <PageHeader
        title="Inventory"
        description="Everything you sell, with its price, tax and what's left on the shelf."
        badge={
          !loading && products.length > 0 ? (
            <Badge tone="accent">{products.length}</Badge>
          ) : undefined
        }
        actions={
          canManage ? (
            <>
              <Button
                variant="secondary"
                icon={<FiUploadCloud size={15} />}
                title={`Import from a CSV file (${MOD_KEY}I)`}
                onClick={() => setImporting(true)}>
                Import
              </Button>
              <Button icon={<FiPlus size={15} />} onClick={startCreating}>
                Add item
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonStat key={i} />)
        ) : (
          <>
            <StatTile
              icon={FiPackage}
              tone="accent"
              label="Items"
              value={stats.total.toLocaleString("en-IN")}
              caption={
                search
                  ? "matching search"
                  : stats.uncounted > 0
                    ? `${stats.uncounted} still uncounted`
                    : "products and services"
              }
            />
            <StatTile
              icon={FiAlertTriangle}
              tone={stats.needsAttention > 0 ? "warning" : "success"}
              label="Needs restocking"
              value={stats.needsAttention.toLocaleString("en-IN")}
              caption={
                stats.needsAttention > 0
                  ? "low, out or oversold"
                  : "nothing running short"
              }
            />
            <StatTile
              icon={TbCurrencyRupee}
              tone="brand"
              label="Stock value"
              value={formatINR(stats.value)}
              caption="counted items, at their rate"
            />
          </>
        )}
      </div>

      <Card
        title="Find an item"
        subtitle="Search by name, code or HSN"
        action={
          search ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<FiX size={14} />}
              onClick={() => setSearch("")}>
              Clear
            </Button>
          ) : (
            <FiSearch size={15} className="text-ink-faint" />
          )
        }>
        <Input
          id="inventory-search"
          name="search"
          type="search"
          aria-label="Search inventory"
          placeholder="Item name, SKU or HSN code"
          prefix={<FiSearch size={15} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : products.length === 0 && !search ? (
        <Card>
          <EmptyState
            icon={FiPackage}
            title="Nothing in inventory yet"
            description={
              canManage
                ? "Already keep your stock in a spreadsheet? Import it in one go. Otherwise add items here, or let them appear on their own the first time you bill them."
                : "Items appear here on their own the first time you bill them."
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {canManage && (
                  <>
                    <Button
                      icon={<FiUploadCloud size={15} />}
                      onClick={() => setImporting(true)}>
                      Import from a file
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<FiPlus size={15} />}
                      onClick={startCreating}>
                      Add an item
                    </Button>
                  </>
                )}
                <Button variant="ghost" onClick={() => navigate("/invoice-create")}>
                  Create an invoice
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <CustomDataTable
          columns={columns}
          data={products}
          pagination
          highlightOnHover={canManage}
          defaultSortFieldId="name"
          onRowClicked={canManage ? (row: ProductSummary) => startEditing(row) : undefined}
          noDataComponent={
            <EmptyState
              compact
              icon={FiSearch}
              title="No items match that search"
              description="Try part of a name, an item code, or an HSN code."
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FiX size={14} />}
                  onClick={() => setSearch("")}>
                  Clear search
                </Button>
              }
            />
          }
        />
      )}

      {/* Bulk import ----------------------------------------------------- */}
      {/* Mounted only while open so each run starts on a clean dialog. */}
      {importing && (
        <ImportInventoryModal
          open
          onClose={() => setImporting(false)}
          onImported={() => void load(search.trim())}
        />
      )}

      {/* Add / edit ------------------------------------------------------ */}
      <Modal
        open={formOpen}
        onClose={() => !saving && closeForm()}
        size="lg"
        title={editing ? editing.name : "Add an item"}
        description={
          editing
            ? `${editing.unitsSold.toLocaleString("en-IN")} sold · ${formatINR(editing.revenue)}${lastSold ? ` · last sold ${lastSold}` : ""}`
            : "It will show up in the invoice item search straight away."
        }
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={closeForm}>
              Cancel
            </Button>
            <Button loading={saving} onClick={handleSubmit(onSave)}>
              {editing ? "Save changes" : "Add item"}
            </Button>
          </>
        }>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput
            title="Item name"
            required
            fieldClassName="sm:col-span-2"
            placeholder="e.g. A4 Notebook 200 pages"
            error={errors.name?.message}
            {...register("name", { required: "An item needs a name" })}
          />

          <Field label="Type" htmlFor="kind">
            <Select id="kind" {...register("kind")}>
              <option value="product">Product — counted in stock</option>
              <option value="service">Service — never counted</option>
            </Select>
          </Field>

          <Field label="Unit" htmlFor="unit" hint="Shown beside the quantity.">
            <Select id="unit" {...register("unit")}>
              {UNIT_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </Field>

          <LabeledInput
            title="Item code"
            placeholder="Optional"
            hint="Searchable at the counter."
            error={errors.sku?.message}
            {...register("sku")}
          />
          <LabeledInput
            title="HSN / SAC"
            placeholder="Optional"
            className="tnum"
            {...register("hsnCode")}
          />

          <LabeledInput
            title="Rate (₹)"
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            className="tnum"
            hint="Filled into the invoice line when this item is picked."
            onKeyDown={blockInvalidNumberKey}
            {...register("rate")}
          />
          <div className="grid grid-cols-2 gap-4">
            <LabeledInput title="Tax type" placeholder="GST" {...register("taxType")} />
            <LabeledInput
              title="Tax %"
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="0"
              className="tnum"
              onKeyDown={blockInvalidNumberKey}
              {...register("taxPer")}
            />
          </div>

          {kind === "product" && (
            <>
              <LabeledInput
                title="Quantity in stock"
                type="number"
                step="0.01"
                placeholder="Not counted"
                className="tnum"
                hint="Leave blank until you've counted. Sales only move a counted number."
                onKeyDown={blockInvalidNumberKey}
                {...register("stockQty")}
              />
              <LabeledInput
                title="Low-stock alert at"
                type="number"
                min={0}
                step="0.01"
                placeholder="Optional"
                className="tnum"
                hint="Flagged once stock drops to this."
                onKeyDown={blockInvalidNumberKey}
                {...register("lowStockAt")}
              />
            </>
          )}
        </div>
      </Modal>

      {/* Delete confirmation -------------------------------------------- */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => !deleting && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? ""}?`}
        description={
          pendingDelete && pendingDelete.unitsSold > 0
            ? `Invoices that sold this keep their own copy of the name and price, so nothing already issued changes. It just stops appearing at the counter.`
            : "This removes the item from your inventory. It can't be undone."
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              icon={<FiTrash2 size={14} />}
              onClick={confirmDelete}>
              Delete item
            </Button>
          </>
        }
      />
    </AppLayout>
  );
}

export default Inventory;
