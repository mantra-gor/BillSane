import { useState } from "react";
import { useForm } from "react-hook-form";
import { FiAlertCircle, FiArrowRight, FiEye, FiEyeOff, FiLock, FiMail } from "react-icons/fi";
import Button from "../components/ui/elements/Button";
import Field from "../components/ui/elements/Field";
import Input from "../components/ui/elements/Input";
import { useAuth } from "../auth/authContext";
import { emailValidation } from "../utils/validators";

interface SignInValues {
  email: string;
  password: string;
  remember: boolean;
}

function SignIn() {
  const { signIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  // Kept out of react-hook-form: it isn't about a field, it's the answer the
  // main process gave, and it has to survive until the next submit.
  const [failure, setFailure] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    defaultValues: { email: "", password: "", remember: true },
  });

  const onSubmit = async (values: SignInValues) => {
    setFailure(null);
    try {
      // No navigate() — the session state changes, and AuthRoute redirects off
      // this screen on the next render. One source of truth for where "in"
      // goes, shared with the ⌘K palette and every other entry point.
      await signIn(values);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-ink">
        Welcome back
      </h1>
      <p className="mt-2 text-[15px] text-ink-muted">
        Sign in to <span className="accent-underline font-medium text-ink">simplify</span>{" "}
        your billing.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-9 space-y-4">
        {failure && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-soft px-3.5 py-3 text-[13px] font-medium text-danger-ink">
            <FiAlertCircle size={15} className="mt-px shrink-0" />
            {failure}
          </p>
        )}

        <Field
          label="Email"
          htmlFor="email"
          error={errors.email?.message as string | undefined}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="john@example.com"
            prefix={<FiMail size={15} />}
            invalid={Boolean(errors.email)}
            {...register("email", emailValidation)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message as string | undefined}>
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
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
            {...register("password", { required: "Password is required" })}
          />
        </Field>

        <div className="pt-1">
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-munsell_blue"
              {...register("remember")}
            />
            Keep me signed in
          </label>
        </div>

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={isSubmitting}
          trailing={<FiArrowRight size={16} />}
          className="!mt-7">
          Sign in
        </Button>
      </form>

      {/* Honest rather than a dead link: BillSane runs on this machine, so there
          is no reset email to send — an administrator issues a new password
          from Settings → Users. */}
      <p className="mt-8 text-center text-sm text-ink-muted">
        Forgotten your password? Ask an administrator to set a new one for you.
      </p>
    </div>
  );
}

export default SignIn;
