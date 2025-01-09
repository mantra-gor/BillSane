import { useState } from "react";
import Button from "../components/ui/elements/Button";
import LabeledInput from "../components/ui/elements/LabeledInput";

function SignIn() {
  const [loginCreds, setLoginCreds] = useState({
    email: "",
    password: "",
  });

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
          your billing
          <span className="mt-1"> and stay in control.</span>
        </h2>
        <div className="space-y-4">
          <LabeledInput
            title="Email"
            type="email"
            className="!p-3 !shadow-md"
            placeholder="john@example.com"
            onChange={(e) => console.log(e)}
          />
          <LabeledInput
            title="Password"
            type="password"
            className="!p-3 !shadow-md"
            placeholder="************"
            onChange={(e) => console.log(e)}
          />
          <Button className="w-full mt-6 !shadow-md active:brightness-110">
            Login
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
