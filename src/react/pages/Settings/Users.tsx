import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  FiEdit2,
  FiKey,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiUserCheck,
  FiUserX,
} from "react-icons/fi";
import Badge from "../../components/ui/elements/Badge";
import Button from "../../components/ui/elements/Button";
import Card from "../../components/ui/elements/Card";
import CustomDataTable from "../../components/ui/elements/CustomDataTable";
import EmptyState from "../../components/ui/elements/EmptyState";
import Field from "../../components/ui/elements/Field";
import Input from "../../components/ui/elements/Input";
import LabeledInput from "../../components/ui/elements/LabeledInput";
import Modal from "../../components/ui/elements/Modal";
import Select from "../../components/ui/elements/Select";
import { SkeletonRows } from "../../components/ui/elements/Skeleton";
import { useToast } from "../../components/ui/feedback/toastContext";
import { useAuth } from "../../auth/authContext";
import {
  createUser,
  deleteUser,
  formatLastLogin,
  initialsFor,
  listRoles,
  listUsers,
  setUserPassword,
  updateUser,
  PASSWORD_MIN_LENGTH,
  passwordValidation,
  type RoleSummary,
  type UserSummary,
} from "../../utils/authStore";
import { blockNonDigitKey, emailValidation, PHONE_REGEX } from "../../utils/validators";

interface UserFormValues {
  name: string;
  email: string;
  phone: string;
  roleId: string;
  password: string;
  mustChangePassword: boolean;
  isActive: boolean;
}

interface PasswordFormValues {
  password: string;
  mustChangePassword: boolean;
}

const BLANK_USER: UserFormValues = {
  name: "",
  email: "",
  phone: "",
  roleId: "",
  password: "",
  mustChangePassword: true,
  isActive: true,
};

function RowAction({
  icon: Icon,
  label,
  onClick,
  danger = false,
  disabled = false,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        danger
          ? "cursor-pointer text-ink-faint hover:bg-danger-soft hover:text-danger-ink"
          : "cursor-pointer text-ink-faint hover:bg-surface-muted hover:text-ink"
      }`}>
      <Icon size={15} />
    </button>
  );
}

/** Both lists in one round trip — the Add User dialog needs the roles too. */
async function fetchTeam() {
  const [users, roles] = await Promise.all([listUsers(), listRoles()]);
  return { users, roles };
}

/**
 * Who can sign in, and as what.
 *
 * There is no sign-up anywhere in BillSane — this screen is the only way an
 * account comes into existence after the first one. Which is also why the
 * dangerous edges are the interesting part: the main process refuses to leave
 * the app without an administrator, and the messages it sends back say exactly
 * which account to fix first.
 */
function Users() {
  const toast = useToast();
  const { refresh } = useAuth();

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // The user being edited; null with `creating` true is the "add" form.
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState<UserSummary | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors },
  } = useForm<UserFormValues>({ defaultValues: BLANK_USER });

  const passwordForm = useForm<PasswordFormValues>({
    defaultValues: { password: "", mustChangePassword: true },
  });

  // Bumped after every write. The fetch lives in the effect and the state is
  // written from its callback — a loader called straight from an effect body is
  // what the React compiler rule objects to.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchTeam()
      .then(({ users: nextUsers, roles: nextRoles }) => {
        if (cancelled) return;
        setUsers(nextUsers);
        setRoles(nextRoles);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error(
            "Couldn't load users",
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
  }, [reloadKey, toast]);

  // The whole team arrives in one fetch, so filtering here is the honest place
  // for it — no round trip can make a list this short any more correct.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.name, user.email, user.phone ?? "", user.roleName]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [users, search]);

  const startCreating = () => {
    resetForm({ ...BLANK_USER, roleId: String(roles[0]?.id ?? "") });
    setEditing(null);
    setCreating(true);
  };

  const startEditing = (user: UserSummary) => {
    resetForm({
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      roleId: String(user.roleId),
      password: "",
      mustChangePassword: false,
      isActive: user.isActive,
    });
    setCreating(false);
    setEditing(user);
  };

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
  };

  const onSave = async (data: UserFormValues) => {
    setSaving(true);
    try {
      if (editing) {
        await updateUser({
          id: editing.id,
          name: data.name,
          email: data.email,
          phone: data.phone.trim() || null,
          roleId: Number(data.roleId),
          isActive: data.isActive,
        });
      } else {
        await createUser({
          name: data.name,
          email: data.email,
          phone: data.phone.trim() || null,
          roleId: Number(data.roleId),
          password: data.password,
          mustChangePassword: data.mustChangePassword,
        });
      }
      toast.success(editing ? "User updated" : "User added", data.name);
      closeForm();
      reload();
      // Editing your own account changes what the sidebar and routes allow.
      await refresh();
    } catch (err) {
      toast.error(
        editing ? "Couldn't update the user" : "Couldn't add the user",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSaving(false);
    }
  };

  const onResetPassword = async (data: PasswordFormValues) => {
    if (!resetting) return;
    setSaving(true);
    try {
      await setUserPassword({
        id: resetting.id,
        password: data.password,
        mustChangePassword: data.mustChangePassword,
      });
      toast.success(
        "Password reset",
        `Give ${resetting.name} the new password — they'll be asked to change it.`
      );
      setResetting(null);
      passwordForm.reset();
      reload();
    } catch (err) {
      toast.error(
        "Couldn't reset the password",
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
      await deleteUser(pendingDelete.id);
      toast.success(`${pendingDelete.name} removed`);
      setPendingDelete(null);
      reload();
    } catch (err) {
      toast.error(
        "Couldn't remove the user",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      id: "name",
      name: "User",
      selector: (row: UserSummary) => row.name,
      sortable: true,
      grow: 2,
      cell: (row: UserSummary) => (
        <div className="flex min-w-0 items-center gap-3 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-prussian_blue-5 text-[11px] font-bold text-prussian_blue">
            {row.avatar ? (
              <img src={row.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              initialsFor(row.name)
            )}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium text-ink">{row.name}</span>
              {row.isCurrent && (
                <Badge tone="accent" size="sm">
                  You
                </Badge>
              )}
            </span>
            <span className="block truncate text-xs text-ink-muted">{row.email}</span>
          </span>
        </div>
      ),
    },
    {
      id: "roleName",
      name: "Role",
      selector: (row: UserSummary) => row.roleName,
      sortable: true,
      width: "160px",
      cell: (row: UserSummary) => <Badge tone="brand">{row.roleName}</Badge>,
    },
    {
      id: "isActive",
      name: "Status",
      selector: (row: UserSummary) => (row.isActive ? 1 : 0),
      sortable: true,
      width: "180px",
      cell: (row: UserSummary) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={row.isActive ? "success" : "danger"} dot>
            {row.isActive ? "Active" : "Suspended"}
          </Badge>
          {row.mustChangePassword && (
            <Badge tone="warning" size="sm">
              Temp password
            </Badge>
          )}
        </span>
      ),
    },
    {
      id: "lastLoginAt",
      name: "Last sign-in",
      // Never sorts to the bottom rather than pretending to be the epoch.
      selector: (row: UserSummary) =>
        row.lastLoginAt ? new Date(row.lastLoginAt).getTime() : 0,
      sortable: true,
      width: "160px",
      cell: (row: UserSummary) => (
        <span className="text-ink-soft tnum">{formatLastLogin(row.lastLoginAt)}</span>
      ),
    },
    {
      id: "actions",
      name: "",
      width: "132px",
      cell: (row: UserSummary) => (
        <div className="flex items-center gap-0.5">
          <RowAction
            icon={FiEdit2}
            label={`Edit ${row.name}`}
            onClick={() => startEditing(row)}
          />
          <RowAction
            icon={FiKey}
            label={`Reset ${row.name}'s password`}
            onClick={() => {
              passwordForm.reset({ password: "", mustChangePassword: true });
              setResetting(row);
            }}
          />
          <RowAction
            icon={FiTrash2}
            danger
            disabled={row.isCurrent}
            label={
              row.isCurrent
                ? "You can't delete your own account"
                : `Remove ${row.name}`
            }
            onClick={() => setPendingDelete(row)}
          />
        </div>
      ),
    },
  ];

  const formOpen = creating || editing !== null;
  const activeCount = users.filter((user) => user.isActive).length;

  return (
    <div className="space-y-5">
      <Card
        title="Users"
        subtitle={
          loading
            ? "Loading…"
            : `${users.length} account${users.length === 1 ? "" : "s"} · ${activeCount} active`
        }
        action={
          <Button size="sm" icon={<FiPlus size={14} />} onClick={startCreating}>
            Add user
          </Button>
        }
        flush>
        <div className="border-b border-line px-5 pb-4">
          <Input
            id="user-search"
            name="search"
            type="search"
            aria-label="Search users"
            placeholder="Search by name, email or role"
            prefix={<FiSearch size={15} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="p-5">
            <SkeletonRows rows={4} />
          </div>
        ) : (
          <CustomDataTable
            bare
            columns={columns}
            data={filtered}
            highlightOnHover
            defaultSortFieldId="name"
            onRowClicked={(row: UserSummary) => startEditing(row)}
            noDataComponent={
              <EmptyState
                compact
                icon={FiSearch}
                title="No users match that search"
                description="Try part of a name, an email address or a role."
              />
            }
          />
        )}
      </Card>

      {/* Add / edit ------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => !saving && closeForm()}
        size="md"
        title={editing ? editing.name : "Add a user"}
        description={
          editing
            ? `Signs in as ${editing.email} · joined ${new Date(
                editing.createdAt
              ).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}`
            : "They'll sign in with the email and password you set here."
        }
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={closeForm}>
              Cancel
            </Button>
            <Button loading={saving} onClick={handleSubmit(onSave)}>
              {editing ? "Save changes" : "Add user"}
            </Button>
          </>
        }>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput
            title="Full name"
            required
            placeholder="e.g. Ravi Kumar"
            error={errors.name?.message}
            {...register("name", { required: "A user needs a name" })}
          />

          <LabeledInput
            title="Email"
            required
            type="email"
            hint="What they sign in with"
            placeholder="name@example.com"
            error={errors.email?.message}
            {...register("email", emailValidation)}
          />

          <LabeledInput
            title="Phone"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit number"
            onKeyDown={blockNonDigitKey}
            error={errors.phone?.message}
            {...register("phone", {
              pattern: {
                value: PHONE_REGEX,
                message: "Enter a valid 10-digit mobile number",
              },
            })}
          />

          <Field
            label="Role"
            htmlFor="roleId"
            required
            hint="Decides what they can see and do"
            error={errors.roleId?.message}>
            <Select
              id="roleId"
              invalid={Boolean(errors.roleId)}
              {...register("roleId", { required: "Pick a role" })}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>

          {!editing && (
            <>
              <LabeledInput
                title="Temporary password"
                required
                type="password"
                autoComplete="new-password"
                fieldClassName="sm:col-span-2"
                hint={`At least ${PASSWORD_MIN_LENGTH} characters. Tell them in person — BillSane can't email it.`}
                placeholder="••••••••"
                error={errors.password?.message}
                {...register("password", passwordValidation)}
              />

              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-soft sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-munsell_blue"
                  {...register("mustChangePassword")}
                />
                <span>
                  Ask them to choose their own password when they first sign in
                  <span className="block text-xs text-ink-faint">
                    Recommended — you never end up knowing their password.
                  </span>
                </span>
              </label>
            </>
          )}

          {editing && (
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-soft sm:col-span-2">
              <input
                type="checkbox"
                disabled={editing.isCurrent}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-munsell_blue disabled:cursor-not-allowed"
                {...register("isActive")}
              />
              <span>
                Account is active
                <span className="block text-xs text-ink-faint">
                  {editing.isCurrent
                    ? "You can't suspend the account you're signed in with."
                    : "Suspending keeps their history but stops them signing in."}
                </span>
              </span>
            </label>
          )}
        </div>
      </Modal>

      {/* Reset password --------------------------------------------------- */}
      <Modal
        open={resetting !== null}
        onClose={() => !saving && setResetting(null)}
        title={`Reset password for ${resetting?.name ?? ""}`}
        description="Their current password stops working immediately."
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button
              loading={saving}
              icon={<FiKey size={15} />}
              onClick={passwordForm.handleSubmit(onResetPassword)}>
              Reset password
            </Button>
          </>
        }>
        <div className="space-y-4">
          <LabeledInput
            title="New password"
            required
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
            error={passwordForm.formState.errors.password?.message}
            {...passwordForm.register("password", passwordValidation)}
          />
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-munsell_blue"
              {...passwordForm.register("mustChangePassword")}
            />
            <span>
              Ask them to choose a new one when they next sign in
              <span className="block text-xs text-ink-faint">
                They won't reach any other screen until they do.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      {/* Delete ----------------------------------------------------------- */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => !deleting && setPendingDelete(null)}
        title={`Remove ${pendingDelete?.name ?? ""}?`}
        description="They will no longer be able to sign in. Invoices they created are untouched."
        footer={
          <>
            <Button
              variant="secondary"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}>
              Keep the account
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              icon={<FiTrash2 size={15} />}
              onClick={confirmDelete}>
              Remove user
            </Button>
          </>
        }>
        <p className="flex items-start gap-2 rounded-xl border border-info-border bg-info-soft px-3.5 py-3 text-[13px] text-info-ink">
          {pendingDelete?.isActive ? (
            <FiUserX size={15} className="mt-px shrink-0" />
          ) : (
            <FiUserCheck size={15} className="mt-px shrink-0" />
          )}
          If they might come back, suspend the account instead — it keeps the
          record and can be switched on again in a click.
        </p>
      </Modal>
    </div>
  );
}

export default Users;
