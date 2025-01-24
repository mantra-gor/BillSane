import { useForm } from "react-hook-form";
import Button from "../components/ui/elements/Button";
import { useNavigate } from "react-router";

function SignIn() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const navigate = useNavigate();

  const onSubmit = (data: object) => {
    console.log(data);
    localStorage.setItem("isUserLoggedIn", "true");
    navigate("/dashboard");
  };

  return (
    <div className="w-10/12 mx-auto h-full mt-16">
      <h1 className="text-[3rem] leading-10 text-center mb-4 font-bold text-gray-700">
        Welcome to BillSane
        <div className="text-[2.5rem] mt-1">
          <span className="underlined2 underline-clip2- italic">Simplify</span>{" "}
          Your Billing
        </div>
      </h1>
      <div className="w-10/12 mt-16 mx-auto flex flex-col gap-6">
        <h2 className="text-xl mb-2 text-center font-medium text-gray-700">
          Login to{" "}
          <span className="underlined1 underline-clip1 italic">Streamline</span>{" "}
          your invoices
          <span className="mt-1"> and stay in control.</span>
        </h2>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4">
          <div className="flex flex-col ">
            <label htmlFor="email" className="mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={`input-field !p-3`}
              placeholder="john@example.com"
              {...register("email", {
                required: "Email is required",
                pattern: {
                  value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/,
                  message: "Enter a valid email address",
                },
              })}
              style={{
                boxShadow: " 0px -1px 1px 0px rgba(20, 20, 20, 0.1) inset",
              }}
            />
            {errors.email && typeof errors.email.message === "string" && (
              <p className="text-red-500 text-sm p-1">{errors.email.message}</p>
            )}
          </div>
          <div className="flex flex-col ">
            <label htmlFor="password" className="mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={`input-field !p-3`}
              placeholder="**********"
              {...register("password", {
                required: "Password is required",
                pattern: {
                  value: /^.{8,}$/,
                  message: "Password must be at least 8 characters long",
                },
              })}
              style={{
                boxShadow: "0px -1px 1px 0px rgba(20, 20, 20, 0.1) inset",
              }}
            />
            {errors.password && typeof errors.password.message === "string" && (
              <p className="text-red-500 text-sm p-1">
                {errors.password.message}
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full mt-6 !shadow-md active:brightness-110">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}

export default SignIn;
