import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  FiAlertCircle,
  FiArrowRight,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMail,
  FiPhone,
  FiShield,
  FiUser,
} from "react-icons/fi";
import Button from "../components/ui/elements/Button";
import Field from "../components/ui/elements/Field";
import Input from "../components/ui/elements/Input";
import { useAuth } from "../auth/authContext";
import { PASSWORD_MIN_LENGTH, passwordValidation } from "../utils/authStore";
import { blockNonDigitKey, emailValidation, PHONE_REGEX } from "../utils/validators";

interface SetupValues {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

/**
 * First run, once: the owner account.
 *
 * BillSane ships with no default credentials — a shipped password is a backdoor
 * that outlives every install that forgets to change it — so the first account
 * is created here, on the machine, and gets the Administrator role. From then
 * on this screen is unreachable and everyone else is added from
 * Settings → Users.
 */
function Setup() {
  const { completeSetup } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SetupValues>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: SetupValues) => {
    setFailure(null);
    try {
      await completeSetup({
        name: values.name,
        email: values.email,
        phone: values.phone.trim() || null,
        password: values.password,
      });
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="animate-fade-in-up">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-munsell_blue-50 bg-munsell_blue-5 px-2.5 py-1 text-[11px] font-semibold text-munsell_blue-700">
        <FiShield size={12} />
        First-time setup
      </span>

      <h1 className="mt-4 text-[2rem] font-bold leading-tight tracking-tight text-ink">
        Create your account
      </h1>
      <p className="mt-2 text-[15px] text-ink-muted">
        This is the{" "}
        <span className="accent-underline font-medium text-ink">administrator</span>{" "}
        account. You'll add everyone else from Settings once you're in.
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

        <Field label="Full name" htmlFor="name" required error={errors.name?.message}>
          <Input
            id="name"
            autoFocus
            autoComplete="name"
            placeholder="Your name"
            prefix={<FiUser size={15} />}
            invalid={Boolean(errors.name)}
            {...register("name", { required: "Full name is required" })}
          />
        </Field>

        <Field label="Email" htmlFor="email" required error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            prefix={<FiMail size={15} />}
            invalid={Boolean(errors.email)}
            {...register("email", emailValidation)}
          />
        </Field>

        <Field
          label="Phone"
          htmlFor="phone"
          hint="Optional"
          error={errors.phone?.message}>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit number"
            prefix={<FiPhone size={15} />}
            onKeyDown={blockNonDigitKey}
            invalid={Boolean(errors.phone)}
            {...register("phone", {
              pattern: {
                value: PHONE_REGEX,
                message: "Enter a valid 10-digit mobile number",
              },
            })}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          required
          hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
          error={errors.password?.message}>
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            prefix={<FiLock size={15} />}
            invalid={Boolean(errors.password)}
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
            {...register("password", passwordValidation)}
          />
        </Field>

        <Field
          label="Confirm password"
          htmlFor="confirmPassword"
          required
          error={errors.confirmPassword?.message}>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            prefix={<FiLock size={15} />}
            invalid={Boolean(errors.confirmPassword)}
            {...register("confirmPassword", {
              required: "Confirm your password",
              validate: (value) =>
                value === getValues("password") || "Both passwords must match",
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
          Create account
        </Button>
      </form>

      <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint">
        Your password is stored on this machine only, hashed with scrypt. There
        is no reset email — keep it somewhere safe.
      </p>
    </div>
  );
}

export default Setup;
