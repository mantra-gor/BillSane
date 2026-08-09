import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import {
  FiEdit2,
  FiMail,
  FiPhone,
  FiPlus,
  FiRepeat,
  FiSearch,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { TbCurrencyRupee } from "react-icons/tb";
import AppLayout from "../components/core/layout/AppLayout";
import PageHeader from "../components/ui/elements/PageHeader";
import StatTile from "../components/ui/elements/StatTile";
import Card from "../components/ui/elements/Card";
import Button from "../components/ui/elements/Button";
import Badge from "../components/ui/elements/Badge";
import Input from "../components/ui/elements/Input";
import LabeledInput from "../components/ui/elements/LabeledInput";
import Modal from "../components/ui/elements/Modal";
import EmptyState from "../components/ui/elements/EmptyState";
import CustomDataTable from "../components/ui/elements/CustomDataTable";
import { SkeletonRows, SkeletonStat } from "../components/ui/elements/Skeleton";
import { useToast } from "../components/ui/feedback/toastContext";
import { useAuth } from "../auth/authContext";
import { formatINR } from "../utils/format";
import {
  customerInitials,
  deleteCustomer,
  formatLastVisit,
  getCustomerInvoices,
  listCustomers,
  updateCustomer,
  type CustomerInvoice,
  type CustomerSummary,
} from "../utils/customerStore";
import {
  blockNonDigitKey,
  emailValidation,
  phoneValidation,
} from "../utils/validators";

interface EditFormValues {
  name: string;
  phone: string;
  email: string;
}

const SEARCH_DEBOUNCE_MS = 250;

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-munsell_blue-5 text-[11px] font-bold text-munsell_blue-700 ring-1 ring-munsell_blue-50">
      {customerInitials(name)}
    </span>
  );
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

function Customers() {
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useAuth().can("customer:manage");

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<CustomerSummary | null>(null);
  const [history, setHistory] = useState<CustomerInvoice[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CustomerSummary | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetEdit,
    formState: { errors },
  } = useForm<EditFormValues>({
    defaultValues: { name: "", phone: "", email: "" },
  });

  const load = useCallback(
    async (term: string) => {
      try {
        setCustomers(await listCustomers(term || undefined));
      } catch (err) {
        toast.error(
          "Couldn't load customers",
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

  const stats = useMemo(() => {
    const repeat = customers.filter((c) => c.invoiceCount > 1).length;
    return {
      total: customers.length,
      repeat,
      lifetime: customers.reduce((sum, c) => sum + c.totalSpent, 0),
    };
  }, [customers]);

  const openCustomer = async (customer: CustomerSummary) => {
    setSelected(customer);
    setEditing(false);
    setHistory(null);
    try {
      setHistory(await getCustomerInvoices(customer.id));
    } catch {
      setHistory([]);
    }
  };

  const startEditing = (customer: CustomerSummary) => {
    resetEdit({
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? "",
    });
    setEditing(true);
  };

  const onSaveEdit = async (data: EditFormValues) => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateCustomer({
        id: selected.id,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
      });
      toast.success("Customer updated", data.name);
      setSelected(null);
      setEditing(false);
      await load(search.trim());
    } catch (err) {
      toast.error(
        "Couldn't update the customer",
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
      await deleteCustomer(pendingDelete.id);
      toast.success(`${pendingDelete.name} deleted`);
      setPendingDelete(null);
      setSelected(null);
      await load(search.trim());
    } catch (err) {
      toast.error(
        "Couldn't delete the customer",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      id: "name",
      name: "Customer",
      selector: (row: CustomerSummary) => row.name,
      sortable: true,
      grow: 2,
      cell: (row: CustomerSummary) => (
        <div className="flex min-w-0 items-center gap-3 py-2">
          <Avatar name={row.name} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.name}</p>
            <p className="truncate text-xs text-ink-muted">
              {row.email || "No email on file"}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "phone",
      name: "Phone",
      selector: (row: CustomerSummary) => row.phone,
      sortable: true,
      width: "150px",
      cell: (row: CustomerSummary) => (
        <span className="text-ink-soft tnum">{row.phone}</span>
      ),
    },
    {
      id: "invoiceCount",
      name: "Invoices",
      selector: (row: CustomerSummary) => row.invoiceCount,
      sortable: true,
      width: "110px",
      right: true,
      cell: (row: CustomerSummary) => (
        <span className="w-full text-right text-ink-soft tnum">
          {row.invoiceCount}
        </span>
      ),
    },
    {
      id: "totalSpent",
      name: "Total spent",
      selector: (row: CustomerSummary) => row.totalSpent,
      sortable: true,
      width: "140px",
      right: true,
      cell: (row: CustomerSummary) => (
        <span className="w-full text-right font-bold text-ink tnum">
          {formatINR(row.totalSpent)}
        </span>
      ),
    },
    {
      id: "lastInvoiceAt",
      name: "Last visit",
      selector: (row: CustomerSummary) =>
        row.lastInvoiceAt ? new Date(row.lastInvoiceAt).getTime() : 0,
      sortable: true,
      width: "140px",
      cell: (row: CustomerSummary) => (
        <span className="text-ink-soft tnum">
          {formatLastVisit(row.lastInvoiceAt) ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      name: "",
      width: "96px",
      // Correcting or removing a record is a different job from looking one up.
      omit: !canManage,
      cell: (row: CustomerSummary) => (
        <div className="flex items-center gap-0.5">
          <RowAction
            icon={FiEdit2}
            label={`Edit ${row.name}`}
            onClick={() => {
              setSelected(row);
              setHistory(null);
              startEditing(row);
            }}
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

  const lastVisit = selected ? formatLastVisit(selected.lastInvoiceAt) : null;

  return (
    <AppLayout width="wide" className="space-y-5">
      <PageHeader
        title="Customers"
        description="Everyone you've billed, with their history — so the counter recognises a regular."
        badge={
          !loading && customers.length > 0 ? (
            <Badge tone="accent">{customers.length}</Badge>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonStat key={i} />)
        ) : (
          <>
            <StatTile
              icon={FiUsers}
              tone="accent"
              label="Customers"
              value={stats.total.toLocaleString("en-IN")}
              caption={search ? "matching search" : "on file"}
            />
            <StatTile
              icon={FiRepeat}
              tone="success"
              label="Repeat customers"
              value={stats.repeat.toLocaleString("en-IN")}
              caption={
                stats.total > 0
                  ? `${Math.round((stats.repeat / stats.total) * 100)}% came back`
                  : "no sales yet"
              }
            />
            <StatTile
              icon={TbCurrencyRupee}
              tone="brand"
              label="Lifetime value"
              value={formatINR(stats.lifetime)}
              caption="across those customers"
            />
          </>
        )}
      </div>

      <Card
        title="Find a customer"
        subtitle="Search by name, phone or email"
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
          id="customer-search"
          name="search"
          type="search"
          aria-label="Search customers"
          placeholder="Name, 10-digit phone or email"
          prefix={<FiSearch size={15} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : customers.length === 0 && !search ? (
        <Card>
          <EmptyState
            icon={FiUsers}
            title="No customers yet"
            description="Customers are saved automatically when you create an invoice — the next time they visit, the counter fills their details in."
            action={
              <Button
                icon={<FiPlus size={15} />}
                onClick={() => navigate("/invoice-create")}>
                Create an invoice
              </Button>
            }
          />
        </Card>
      ) : (
        <CustomDataTable
          columns={columns}
          data={customers}
          pagination
          highlightOnHover
          defaultSortFieldId="lastInvoiceAt"
          defaultSortAsc={false}
          onRowClicked={(row: CustomerSummary) => void openCustomer(row)}
          noDataComponent={
            <EmptyState
              compact
              icon={FiSearch}
              title="No customers match that search"
              description="Try a phone number, part of a name, or an email address."
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

      {/* Detail / edit ------------------------------------------------- */}
      <Modal
        open={selected !== null}
        onClose={() => !saving && setSelected(null)}
        size="md"
        title={selected?.name}
        description={
          selected
            ? `${selected.invoiceCount} invoice${selected.invoiceCount === 1 ? "" : "s"} · ${formatINR(selected.totalSpent)}${lastVisit ? ` · last visit ${lastVisit}` : ""}`
            : undefined
        }
        footer={
          editing ? (
            <>
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button loading={saving} onClick={handleSubmit(onSaveEdit)}>
                Save changes
              </Button>
            </>
          ) : (
            <>
              {/* Reading a customer's history and correcting their details are
                  separate permissions, so the panel opens either way. */}
              {canManage && (
                <Button
                  variant="secondary"
                  icon={<FiEdit2 size={14} />}
                  onClick={() => selected && startEditing(selected)}>
                  Edit details
                </Button>
              )}
              <Button
                icon={<FiPlus size={14} />}
                onClick={() => navigate("/invoice-create")}>
                New invoice
              </Button>
            </>
          )
        }>
        {selected && editing && (
          <div className="grid grid-cols-1 gap-4">
            <LabeledInput
              title="Full name"
              required
              error={errors.name?.message}
              {...register("name", { required: "Customer name is required" })}
            />
            <LabeledInput
              title="Phone"
              required
              type="tel"
              inputMode="numeric"
              maxLength={10}
              hint="Used to recognise them at the counter."
              onKeyDown={blockNonDigitKey}
              error={errors.phone?.message}
              {...register("phone", phoneValidation)}
            />
            <LabeledInput
              title="Email"
              required
              type="email"
              hint="A second way to find them if their number changes."
              error={errors.email?.message}
              {...register("email", emailValidation)}
            />
          </div>
        )}

        {selected && !editing && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-subtle p-3.5">
              <Avatar name={selected.name} />
              <div className="min-w-0 space-y-0.5 text-[13px]">
                <p className="flex items-center gap-2 text-ink-soft tnum">
                  <FiPhone size={13} className="text-ink-faint" />
                  {selected.phone}
                </p>
                <p className="flex items-center gap-2 truncate text-ink-soft">
                  <FiMail size={13} className="shrink-0 text-ink-faint" />
                  {selected.email || "No email on file"}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Invoice history
              </p>
              {history === null ? (
                <SkeletonRows rows={3} />
              ) : history.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line bg-surface-subtle px-3.5 py-6 text-center text-[13px] text-ink-muted">
                  No invoices yet.
                </p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {history.map((invoice) => (
                    <li key={invoice.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/invoice/view/${invoice.id}`)}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 bg-surface px-3.5 py-2.5 text-left transition-colors hover:bg-surface-subtle">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-ink tnum">
                            {invoice.invoiceNo}
                          </span>
                          <span className="block truncate text-xs text-ink-muted tnum">
                            {invoice.date} · {invoice.paymentType.toUpperCase()}
                          </span>
                        </span>
                        <span className="shrink-0 text-[13px] font-bold text-ink tnum">
                          {formatINR(invoice.totalAmount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation -------------------------------------------- */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => !deleting && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? ""}?`}
        description={
          pendingDelete && pendingDelete.invoiceCount > 0
            ? `This customer is on ${pendingDelete.invoiceCount} invoice${pendingDelete.invoiceCount === 1 ? "" : "s"}, so they can't be deleted — an invoice has to keep the customer it was billed to.`
            : "This removes the customer record. It can't be undone."
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}>
              {pendingDelete && pendingDelete.invoiceCount > 0
                ? "Close"
                : "Cancel"}
            </Button>
            {pendingDelete?.invoiceCount === 0 && (
              <Button
                variant="danger"
                loading={deleting}
                icon={<FiTrash2 size={14} />}
                onClick={confirmDelete}>
                Delete customer
              </Button>
            )}
          </>
        }
      />
    </AppLayout>
  );
}

export default Customers;
