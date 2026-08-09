import { useState } from "react";
import { useForm } from "react-hook-form";
import { FiAlertCircle, FiArrowRight, FiEye, FiEyeOff, FiKey, FiLogOut } from "react-icons/fi";
import Button from "../components/ui/elements/Button";
import Field from "../components/ui/elements/Field";
import Input from "../components/ui/elements/Input";
import { useToast } from "../components/ui/feedback/toastContext";
import { useAuth } from "../auth/authContext";
import { changePassword, PASSWORD_MIN_LENGTH, passwordValidation } from "../utils/authStore";

interface ForcePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * The gate an admin-issued temporary password lands on.
 *
 * Shown by ProtectedRoute instead of any app screen while
 * `user.mustChangePassword` is set, so there is exactly one way past it. The
 * only other exit is signing out — a shared counter machine has to be able to
 * hand the keyboard back.
 */
function ForcePassword() {
  const { user, signOut, refresh } = useAuth();
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForcePasswordValues>({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ForcePasswordValues) => {
    setFailure(null);
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // The main process cleared the flag; re-reading the session is what lets
      // ProtectedRoute stop showing this screen.
      await refresh();
      toast.success("Password updated", "You're all set — welcome to BillSane.");
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="animate-fade-in-up">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-warning-border bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning-ink">
        <FiKey size={12} />
        Password change required
      </span>

      <h1 className="mt-4 text-[2rem] font-bold leading-tight tracking-tight text-ink">
        Choose your password
      </h1>
      <p className="mt-2 text-[15px] text-ink-muted">
        {user?.name ? `${user.name}, your` : "Your"} current password was set by an
        administrator. Pick your own to continue.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-4">
        {failure && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-soft px-3.5 py-3 text-[13px] font-medium text-danger-ink">
            <FiAlertCircle size={15} className="mt-px shrink-0" />
            {failure}
          </p>
        )}

        <Field
          label="Temporary password"
          htmlFor="currentPassword"
          required
          error={errors.currentPassword?.message}>
          <Input
            id="currentPassword"
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="••••••••"
            invalid={Boolean(errors.currentPassword)}
            {...register("currentPassword", {
              required: "Enter the password you were given",
            })}
          />
        </Field>

        <Field
          label="New password"
          htmlFor="newPassword"
          required
          hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
          error={errors.newPassword?.message}>
          <Input
            id="newPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            invalid={Boolean(errors.newPassword)}
            suffix={
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="cursor-pointer rounded p-1 text-ink-faint transition-colors hover:text-ink">
                {showPassword ? <FiEyeOff size={15} /> : <FiEye size={15} />}
              </button>
            }
            {...register("newPassword", passwordValidation)}
          />
        </Field>

        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          required
          error={errors.confirmPassword?.message}>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            invalid={Boolean(errors.confirmPassword)}
            {...register("confirmPassword", {
              required: "Confirm your new password",
              validate: (value) =>
                value === getValues("newPassword") || "Both passwords must match",
            })}
          />
        </Field>

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={isSubmitting}
          trailing={<FiArrowRight size={16} />}
          className="!mt-7">
          Set password and continue
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Button variant="ghost" size="sm" icon={<FiLogOut size={14} />} onClick={signOut}>
          Sign out instead
        </Button>
      </div>
    </div>
  );
}

export default ForcePassword;
