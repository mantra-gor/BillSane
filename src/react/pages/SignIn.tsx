import Button from "../components/ui/elements/Button";
import LabeledInput from "../components/ui/elements/LabeledInput";

function SignIn() {
  return (
    <div className="w-full h-full mt-10 ml-8">
      <h1 className="text-4xl mb-4 font-bold text-gray-700">
        Welcome to BillSane:{" "}
        <span className="underlined2- underline-clip2-">Simplify</span> Your
        Billing
      </h1>

      <div className="w-9/12 ml-8 p-12 flex flex-col gap-6 bg-[#E5E4E2] bg-opacity-50 backdrop-blur-xl rounded-lg shadow-xl mt-8">
        <h2 className="text-3xl font-semibold text-gray-700 mb-2">
          Login to{" "}
          <span className="underlined1 underline-clip1">Streamline</span> your
          billing
          <span className="mt-1"> and stay in control.</span>
        </h2>
        <div className="space-y-4">
          <LabeledInput
            title="Email"
            type="email"
            placeholder="Enter your email"
            onChange={(e) => console.log(e)}
          />
          <LabeledInput
            title="Password"
            type="password"
            placeholder="Enter your password"
            onChange={(e) => console.log(e)}
          />
          <Button className="w-full mt-2">Login</Button>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
