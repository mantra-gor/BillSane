import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { FiArrowRight, FiEye, FiEyeOff, FiLock, FiMail } from "react-icons/fi";
import Button from "../components/ui/elements/Button";
import Field from "../components/ui/elements/Field";
import Input from "../components/ui/elements/Input";
import { emailValidation } from "../utils/validators";

interface SignInValues {
  email: string;
  password: string;
  remember: boolean;
}

function SignIn() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    defaultValues: { email: "", password: "", remember: true },
  });

  const onSubmit = () => {
    localStorage.setItem("isUserLoggedIn", "true");
    navigate("/dashboard");
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
            {...register("password", {
              required: "Password is required",
              minLength: {
                value: 8,
                message: "Password must be at least 8 characters long",
              },
            })}
          />
        </Field>

        <div className="flex items-center justify-between pt-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-munsell_blue"
              {...register("remember")}
            />
            Keep me signed in
          </label>
          <button
            type="button"
            className="cursor-pointer text-sm font-medium text-munsell_blue transition-colors hover:text-munsell_blue-700">
            Forgot password?
          </button>
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

      <p className="mt-8 text-center text-sm text-ink-muted">
        New to BillSane?{" "}
        <button
          type="button"
          onClick={() => navigate("/sign-up")}
          className="cursor-pointer font-semibold text-munsell_blue transition-colors hover:text-munsell_blue-700">
          Create an account
        </button>
      </p>
    </div>
  );
}

export default SignIn;
