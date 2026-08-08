import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  FiCheckCircle,
  FiCloud,
  FiHardDrive,
  FiInfo,
  FiSave,
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

type DbMode = DbConfigInput["mode"];

type CloudFieldsForm = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  useSsl: boolean;
};

type DatabaseFormValues = {
  mode: DbMode;
  cloud: CloudFieldsForm;
};

const POSTGRES_DEFAULT_PORT = 5432;

const emptyCloud: CloudFieldsForm = {
  host: "",
  port: POSTGRES_DEFAULT_PORT,
  username: "",
  password: "",
  database: "",
  useSsl: true,
};

const modeOptions: {
  id: DbMode;
  label: string;
  description: string;
  icon: typeof FiHardDrive;
}[] = [
  {
    id: "offline",
    label: "Offline",
    description:
      "Everything stays in a local SQLite file on this computer. No setup, no internet.",
    icon: FiHardDrive,
  },
  {
    id: "hybrid",
    label: "Hybrid",
    description:
      "Local SQLite keeps working offline and syncs with your PostgreSQL cloud database.",
    icon: FiCloud,
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
  const [selectedMode, setSelectedMode] = useState<DbMode>("offline");
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setValue,
    formState: { errors },
  } = useForm<DatabaseFormValues>({
    defaultValues: { mode: "offline", cloud: emptyCloud },
  });

  useEffect(() => {
    let cancelled = false;
    getDbConfig().then((config) => {
      if (cancelled) return;
      setSelectedMode(config.mode);
      setHasStoredPassword(config.cloud?.hasStoredPassword ?? false);
      reset({
        mode: config.mode,
        cloud: config.cloud ? { ...config.cloud, password: "" } : emptyCloud,
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reset]);

  const handleSelectMode = (mode: DbMode) => {
    setSelectedMode(mode);
    setValue("mode", mode);
    setTestState({ status: "idle" });
  };

  const buildInput = (data: DatabaseFormValues): DbConfigInput => ({
    mode: data.mode,
    cloud:
      data.mode === "hybrid"
        ? { ...data.cloud, port: Number(data.cloud.port) }
        : undefined,
  });

  const handleTestConnection = async () => {
    const cloud = getValues("cloud");
    setTestState({ status: "testing" });
    const result = await testDbConnection({
      ...cloud,
      port: Number(cloud.port),
    });
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
      toast.success(
        "Database settings saved",
        data.mode === "hybrid"
          ? "Cloud sync will use these credentials once it's enabled."
          : undefined
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

  const isHybrid = selectedMode === "hybrid";

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Card
        title="Data mode"
        subtitle="BillSane always works from a local SQLite file. Hybrid adds a cloud copy on top of it.">
        <div
          role="radiogroup"
          aria-label="Data mode"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {modeOptions.map((option) => {
            const selected = selectedMode === option.id;
            return (
              <button
                type="button"
                key={option.id}
                role="radio"
                aria-checked={selected}
                onClick={() => handleSelectMode(option.id)}
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

      {isHybrid && (
        <>
          <div className="flex items-start gap-3 rounded-xl border border-info-border bg-info-soft p-4">
            <FiInfo size={17} className="mt-0.5 shrink-0 text-info" />
            <div>
              <p className="text-sm font-semibold text-ink">
                Cloud sync isn't running yet
              </p>
              <p className="mt-0.5 text-sm text-ink-soft">
                Save your PostgreSQL details now — BillSane keeps reading and
                writing the local database until the sync engine ships.
              </p>
            </div>
          </div>

          <Card
            title="Cloud database"
            subtitle="Credentials for the PostgreSQL server BillSane will sync with.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <LabeledInput
                title="Host"
                required
                placeholder="db.example.com"
                error={errors.cloud?.host?.message}
                {...register("cloud.host", { required: "Host is required" })}
              />
              <LabeledInput
                title="Port"
                required
                type="number"
                className="tnum"
                error={errors.cloud?.port?.message}
                {...register("cloud.port", {
                  required: "Port is required",
                  valueAsNumber: true,
                })}
              />
              <LabeledInput
                title="Database name"
                required
                placeholder="billsane"
                error={errors.cloud?.database?.message}
                {...register("cloud.database", {
                  required: "Database name is required",
                })}
              />
              <LabeledInput
                title="Username"
                required
                placeholder="Enter username"
                error={errors.cloud?.username?.message}
                {...register("cloud.username", {
                  required: "Username is required",
                })}
              />
              <LabeledInput
                title="Password"
                type="password"
                placeholder={hasStoredPassword ? "••••••••" : "Enter password"}
                hint={
                  hasStoredPassword
                    ? "Leave blank to keep the stored password"
                    : undefined
                }
                {...register("cloud.password")}
              />
              <Field label="Security">
                <label className="flex h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-sm text-ink-soft transition-colors hover:border-line-strong">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-munsell_blue"
                    {...register("cloud.useSsl")}
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
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving} icon={<FiSave size={15} />}>
          Save changes
        </Button>
        {isHybrid && (
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
