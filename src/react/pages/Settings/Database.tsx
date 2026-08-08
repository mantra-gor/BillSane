import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiDatabase,
  FiHardDrive,
  FiSave,
  FiServer,
  FiXCircle,
  FiZap,
} from "react-icons/fi";
import Card from "../../components/ui/elements/Card";
import Button from "../../components/ui/elements/Button";
import Field from "../../components/ui/elements/Field";
import LabeledInput from "../../components/ui/elements/LabeledInput";
import { SkeletonText } from "../../components/ui/elements/Skeleton";
import { useToast } from "../../components/ui/feedback/toastContext";
import {
  getDbConfig,
  saveDbConfig,
  testDbConnection,
  type DbConfigInput,
} from "../../utils/dbConfig";

type DbBackend = DbConfigInput["backend"];
type RemoteBackend = "postgres" | "mysql";

type ConnectionFieldsForm = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  useSsl: boolean;
};

type DatabaseFormValues = {
  backend: DbBackend;
  postgres: ConnectionFieldsForm;
  mysql: ConnectionFieldsForm;
};

const emptyFields: ConnectionFieldsForm = {
  host: "",
  port: 0,
  username: "",
  password: "",
  database: "",
  useSsl: false,
};

const defaultPorts: Record<RemoteBackend, number> = {
  postgres: 5432,
  mysql: 3306,
};

const backendOptions: {
  id: DbBackend;
  label: string;
  description: string;
  icon: typeof FiHardDrive;
}[] = [
  {
    id: "local",
    label: "Local",
    description: "SQLite on this computer. No setup needed.",
    icon: FiHardDrive,
  },
  {
    id: "postgres",
    label: "PostgreSQL",
    description: "Connect to a PostgreSQL server.",
    icon: FiDatabase,
  },
  {
    id: "mysql",
    label: "MySQL",
    description: "Connect to a MySQL server.",
    icon: FiServer,
  },
];

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "success" }
  | { status: "error"; message: string };

function Database() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [selectedBackend, setSelectedBackend] = useState<DbBackend>("local");
  const [hasStoredPassword, setHasStoredPassword] = useState<
    Record<RemoteBackend, boolean>
  >({ postgres: false, mysql: false });
  const [saving, setSaving] = useState(false);
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setValue,
    formState: { errors },
  } = useForm<DatabaseFormValues>({
    defaultValues: {
      backend: "local",
      postgres: { ...emptyFields, port: defaultPorts.postgres },
      mysql: { ...emptyFields, port: defaultPorts.mysql },
    },
  });

  useEffect(() => {
    let cancelled = false;
    getDbConfig().then((config) => {
      if (cancelled) return;
      setSelectedBackend(config.backend);
      setHasStoredPassword({
        postgres: config.postgres?.hasStoredPassword ?? false,
        mysql: config.mysql?.hasStoredPassword ?? false,
      });
      reset({
        backend: config.backend,
        postgres: config.postgres
          ? { ...config.postgres, password: "" }
          : { ...emptyFields, port: defaultPorts.postgres },
        mysql: config.mysql
          ? { ...config.mysql, password: "" }
          : { ...emptyFields, port: defaultPorts.mysql },
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reset]);

  const handleSelectBackend = (backend: DbBackend) => {
    setSelectedBackend(backend);
    setValue("backend", backend);
    setTestState({ status: "idle" });
  };

  const buildInput = (data: DatabaseFormValues): DbConfigInput => ({
    backend: data.backend,
    postgres:
      data.backend === "postgres"
        ? { ...data.postgres, port: Number(data.postgres.port) }
        : undefined,
    mysql:
      data.backend === "mysql"
        ? { ...data.mysql, port: Number(data.mysql.port) }
        : undefined,
  });

  const handleTestConnection = async () => {
    setTestState({ status: "testing" });
    const result = await testDbConnection(buildInput(getValues()));
    if (result.ok) {
      setTestState({ status: "success" });
      toast.success("Connection successful");
    } else {
      setTestState({ status: "error", message: result.error });
    }
  };

  const onSubmit = async (data: DatabaseFormValues) => {
    setSaving(true);
    const result = await saveDbConfig(buildInput(data));
    setSaving(false);

    if (result.ok) {
      setRestartNeeded(true);
      toast.success(
        "Database settings saved",
        "Restart BillSane to apply the new backend."
      );
    } else {
      toast.error("Couldn't save database settings", result.error);
    }
  };

  if (loading) {
    return (
      <Card title="Database">
        <SkeletonText lines={5} />
      </Card>
    );
  }

  const activeBackend = selectedBackend as RemoteBackend;
  const isRemote = selectedBackend === "postgres" || selectedBackend === "mysql";
  const fieldErrors = isRemote ? errors[activeBackend] : undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Card
        title="Storage backend"
        subtitle="Choose where BillSane keeps its data. Changing this needs a restart.">
        <div
          role="radiogroup"
          aria-label="Storage backend"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {backendOptions.map((option) => {
            const selected = selectedBackend === option.id;
            return (
              <button
                type="button"
                key={option.id}
                role="radio"
                aria-checked={selected}
                onClick={() => handleSelectBackend(option.id)}
                className={`flex cursor-pointer flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all duration-150 ease-snap ${
                  selected
                    ? "border-munsell_blue bg-munsell_blue-5 shadow-xs"
                    : "border-line bg-surface hover:border-line-strong hover:bg-surface-subtle"
                }`}>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    selected
                      ? "bg-munsell_blue text-white"
                      : "bg-surface-muted text-ink-muted"
                  }`}>
                  <option.icon size={17} />
                </span>
                <span className="text-sm font-bold text-ink">
                  {option.label}
                </span>
                <span className="text-xs leading-snug text-ink-muted">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {isRemote && (
        <Card
          title="Connection"
          subtitle={`Credentials for your ${
            activeBackend === "postgres" ? "PostgreSQL" : "MySQL"
          } server.`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <LabeledInput
              title="Host"
              required
              placeholder="localhost"
              error={fieldErrors?.host?.message}
              {...register(`${activeBackend}.host`, {
                required: "Host is required",
              })}
            />
            <LabeledInput
              title="Port"
              required
              type="number"
              className="tnum"
              error={fieldErrors?.port?.message}
              {...register(`${activeBackend}.port`, {
                required: "Port is required",
                valueAsNumber: true,
              })}
            />
            <LabeledInput
              title="Database name"
              required
              placeholder="billsane"
              error={fieldErrors?.database?.message}
              {...register(`${activeBackend}.database`, {
                required: "Database name is required",
              })}
            />
            <LabeledInput
              title="Username"
              required
              placeholder="Enter username"
              error={fieldErrors?.username?.message}
              {...register(`${activeBackend}.username`, {
                required: "Username is required",
              })}
            />
            <LabeledInput
              title="Password"
              type="password"
              placeholder={
                hasStoredPassword[activeBackend]
                  ? "••••••••"
                  : "Enter password"
              }
              hint={
                hasStoredPassword[activeBackend]
                  ? "Leave blank to keep the stored password"
                  : undefined
              }
              {...register(`${activeBackend}.password`)}
            />
            <Field label="Security">
              <label className="flex h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-sm text-ink-soft transition-colors hover:border-line-strong">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-munsell_blue"
                  {...register(`${activeBackend}.useSsl`)}
                />
                Use SSL
              </label>
            </Field>
          </div>

          {testState.status !== "idle" && (
            <div className="mt-4">
              {testState.status === "testing" && (
                <p className="text-sm text-ink-muted">Testing connection…</p>
              )}
              {testState.status === "success" && (
                <p className="flex items-center gap-2 rounded-lg border border-success-border bg-success-soft px-3 py-2.5 text-sm font-medium text-success-ink">
                  <FiCheckCircle size={16} className="shrink-0" />
                  Connection successful
                </p>
              )}
              {testState.status === "error" && (
                <p className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger-ink">
                  <FiXCircle size={16} className="mt-0.5 shrink-0" />
                  <span className="break-words">{testState.message}</span>
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {restartNeeded && (
        <div className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-soft p-4">
          <FiAlertTriangle size={17} className="mt-0.5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold text-ink">Restart required</p>
            <p className="mt-0.5 text-sm text-ink-soft">
              Quit and reopen BillSane to start using the new database backend.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving} icon={<FiSave size={15} />}>
          Save changes
        </Button>
        {isRemote && (
          <Button
            type="button"
            variant="secondary"
            loading={testState.status === "testing"}
            icon={<FiZap size={15} />}
            onClick={handleTestConnection}>
            Test connection
          </Button>
        )}
      </div>
    </form>
  );
}

export default Database;
