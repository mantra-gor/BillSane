import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  FiCheck,
  FiEdit2,
  FiLock,
  FiPlus,
  FiShield,
  FiTrash2,
  FiUsers,
} from "react-icons/fi";
import Badge from "../../components/ui/elements/Badge";
import Button from "../../components/ui/elements/Button";
import Card from "../../components/ui/elements/Card";
import EmptyState from "../../components/ui/elements/EmptyState";
import LabeledInput from "../../components/ui/elements/LabeledInput";
import Modal from "../../components/ui/elements/Modal";
import { SkeletonRows } from "../../components/ui/elements/Skeleton";
import { useToast } from "../../components/ui/feedback/toastContext";
import { useAuth } from "../../auth/authContext";
import {
  createRole,
  deleteRole,
  listPermissions,
  listRoles,
  updateRole,
  type Permission,
  type PermissionGroup,
  type RoleSummary,
} from "../../utils/authStore";

interface RoleFormValues {
  name: string;
  description: string;
}

/** The roles plus the permission catalog they are assembled from. */
async function fetchRoleData() {
  const [roles, groups] = await Promise.all([listRoles(), listPermissions()]);
  return { roles, groups };
}

/**
 * Custom roles, and what each one is allowed to do.
 *
 * The permission list is drawn from the catalog the main process publishes, not
 * from a copy kept here — so a permission added to the app appears as a new
 * checkbox on this screen with no work, and a role can never be given one that
 * nothing checks.
 */
function Roles() {
  const toast = useToast();
  const { refresh, user } = useAuth();

  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<RoleSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [granted, setGranted] = useState<Set<Permission>>(new Set());
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RoleSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors },
  } = useForm<RoleFormValues>({ defaultValues: { name: "", description: "" } });

  // Bumped after every write — see the same note in Settings/Users.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchRoleData()
      .then(({ roles: nextRoles, groups: nextGroups }) => {
        if (cancelled) return;
        setRoles(nextRoles);
        setGroups(nextGroups);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error(
            "Couldn't load roles",
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

  const startCreating = () => {
    resetForm({ name: "", description: "" });
    setGranted(new Set());
    setEditing(null);
    setCreating(true);
  };

  const startEditing = (role: RoleSummary) => {
    if (role.isSystem) return;
    resetForm({ name: role.name, description: role.description ?? "" });
    setGranted(new Set(role.permissions));
    setCreating(false);
    setEditing(role);
  };

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
  };

  const toggle = (permission: Permission) => {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  };

  const toggleGroup = (group: PermissionGroup, on: boolean) => {
    setGranted((prev) => {
      const next = new Set(prev);
      for (const permission of group.permissions) {
        if (on) next.add(permission.key);
        else next.delete(permission.key);
      }
      return next;
    });
  };

  const onSave = async (data: RoleFormValues) => {
    setSaving(true);
    const input = {
      name: data.name,
      description: data.description.trim() || null,
      permissions: [...granted],
    };
    try {
      if (editing) await updateRole({ id: editing.id, ...input });
      else await createRole(input);
      toast.success(editing ? "Role updated" : "Role created", data.name);
      closeForm();
      reload();
      // Re-scoping the role you hold changes your own sidebar, immediately.
      await refresh();
    } catch (err) {
      toast.error(
        editing ? "Couldn't update the role" : "Couldn't create the role",
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
      await deleteRole(pendingDelete.id);
      toast.success(`${pendingDelete.name} deleted`);
      setPendingDelete(null);
      reload();
    } catch (err) {
      toast.error(
        "Couldn't delete the role",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setDeleting(false);
    }
  };

  const formOpen = creating || editing !== null;
  const totalPermissions = groups.reduce(
    (sum, group) => sum + group.permissions.length,
    0
  );

  return (
    <div className="space-y-5">
      <Card
        title="Roles"
        subtitle="A role is a named set of permissions. Assign one to each user."
        action={
          <Button size="sm" icon={<FiPlus size={14} />} onClick={startCreating}>
            New role
          </Button>
        }>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : roles.length === 0 ? (
          <EmptyState
            compact
            icon={FiShield}
            title="No roles yet"
            description="Create one to describe what a group of people is allowed to do."
            action={
              <Button icon={<FiPlus size={15} />} onClick={startCreating}>
                New role
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {roles.map((role) => {
              const isMine = role.id === user?.roleId;
              return (
                <li
                  key={role.id}
                  className="rounded-xl border border-line bg-surface-subtle p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink">{role.name}</h3>
                        {role.isSystem && (
                          <Badge tone="brand" icon={<FiLock size={10} />} size="sm">
                            Built in
                          </Badge>
                        )}
                        {isMine && (
                          <Badge tone="accent" size="sm">
                            Your role
                          </Badge>
                        )}
                        <Badge tone="neutral" icon={<FiUsers size={10} />} size="sm">
                          {role.userCount}
                        </Badge>
                      </div>
                      {role.description && (
                        <p className="mt-1 text-xs text-ink-muted">{role.description}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<FiEdit2 size={13} />}
                        disabled={role.isSystem}
                        title={
                          role.isSystem
                            ? "Built-in roles always have every permission"
                            : `Edit ${role.name}`
                        }
                        onClick={() => startEditing(role)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<FiTrash2 size={13} />}
                        disabled={role.isSystem}
                        title={
                          role.isSystem
                            ? "Built-in roles can't be deleted"
                            : `Delete ${role.name}`
                        }
                        onClick={() => setPendingDelete(role)}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {role.isSystem ? (
                      <Badge tone="success" icon={<FiCheck size={10} />}>
                        Every permission, including any added later
                      </Badge>
                    ) : role.permissions.length === 0 ? (
                      <Badge tone="warning">
                        No permissions — this role can only see its own account
                      </Badge>
                    ) : (
                      <>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                          {role.permissions.length} of {totalPermissions}
                        </span>
                        {role.permissions.map((permission) => (
                          <Badge key={permission} tone="neutral" size="sm">
                            {permission}
                          </Badge>
                        ))}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Create / edit ---------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => !saving && closeForm()}
        size="lg"
        title={editing ? `Edit ${editing.name}` : "New role"}
        description={
          editing
            ? `${editing.userCount} ${
                editing.userCount === 1 ? "person holds" : "people hold"
              } this role. Changes apply the moment you save.`
            : "Name it after the job, then tick what that job needs."
        }
        footer={
          <>
            {/* The groups don't all fit on screen at once, so the tally stays
                put while the list scrolls. */}
            <span className="mr-auto text-xs font-medium text-ink-muted tnum">
              {granted.size === 0
                ? "Nothing selected yet"
                : `${granted.size} of ${totalPermissions} permissions selected`}
            </span>
            <Button variant="secondary" disabled={saving} onClick={closeForm}>
              Cancel
            </Button>
            <Button loading={saving} onClick={handleSubmit(onSave)}>
              {editing ? "Save changes" : "Create role"}
            </Button>
          </>
        }>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <LabeledInput
              title="Role name"
              required
              placeholder="e.g. Store Manager"
              error={errors.name?.message}
              {...register("name", { required: "A role needs a name" })}
            />
            <LabeledInput
              title="Description"
              placeholder="What this role is for"
              error={errors.description?.message}
              {...register("description")}
            />
          </div>

          <div className="rule-fade" />

          <div className="space-y-4">
            {groups.map((group) => {
              const total = group.permissions.length;
              const on = group.permissions.filter((p) => granted.has(p.key)).length;
              const allOn = on === total;

              return (
                <section key={group.label}>
                  <header className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-semibold text-ink">
                        {group.label}
                      </h4>
                      <p className="text-xs text-ink-faint">{group.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group, !allOn)}
                      className="shrink-0 cursor-pointer text-xs font-semibold text-munsell_blue transition-colors hover:text-munsell_blue-700">
                      {allOn ? "Clear all" : "Select all"}
                    </button>
                  </header>

                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.permissions.map((permission) => {
                      const checked = granted.has(permission.key);
                      return (
                        <label
                          key={permission.key}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
                            checked
                              ? "border-munsell_blue-50 bg-munsell_blue-5"
                              : "border-line bg-surface hover:bg-surface-subtle"
                          }`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(permission.key)}
                            className="mt-0.5 h-4 w-4 cursor-pointer accent-munsell_blue"
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium text-ink">
                              {permission.label}
                            </span>
                            <span className="block text-xs leading-snug text-ink-muted">
                              {permission.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Delete ----------------------------------------------------------- */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => !deleting && setPendingDelete(null)}
        title={`Delete the ${pendingDelete?.name ?? ""} role?`}
        description={
          pendingDelete?.userCount
            ? `${pendingDelete.userCount} ${
                pendingDelete.userCount === 1 ? "person still holds" : "people still hold"
              } it — move them to another role first.`
            : "Nobody holds this role, so nothing changes for anyone."
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              icon={<FiTrash2 size={15} />}
              onClick={confirmDelete}>
              Delete role
            </Button>
          </>
        }
      />
    </div>
  );
}

export default Roles;
