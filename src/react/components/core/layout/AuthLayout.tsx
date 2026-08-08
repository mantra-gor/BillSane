import { FiCheck } from "react-icons/fi";
import BrandMark from "../../common/BrandMark";
import SignIn from "../../../pages/SignIn";
import SignUp from "../../../pages/SignUp";
import accounting from "../../../assets/resources/accounting.webm";

const HIGHLIGHTS = [
  "GST-ready invoices in seconds",
  "Live insight into revenue and top sellers",
  "Your data stays on your machine",
];

/**
 * Split auth screen: form on the left over a light canvas, brand panel on the
 * right. The video sits behind a navy scrim so the overlaid copy keeps its
 * contrast regardless of which frame is showing.
 */
function AuthLayout({ formType }: { formType: string }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas">
      {/* Form column */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Soft brand wash so the pane isn't a flat slab of white. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-munsell_blue/[0.07] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 left-1/4 h-[26rem] w-[26rem] rounded-full bg-prussian_blue/[0.05] blur-3xl"
        />

        <div className="relative z-10 px-10 pt-8">
          <BrandMark size={30} />
        </div>

        <div className="scroll-area relative z-10 flex flex-1 items-center justify-center px-10 py-6">
          <div className="w-full max-w-[400px]">
            {formType === "signin" ? <SignIn /> : <SignUp />}
          </div>
        </div>

        <footer className="relative z-10 px-10 pb-6 text-center text-xs text-ink-faint">
          © {new Date().getFullYear()} BillSane. All rights reserved.
        </footer>
      </div>

      {/* Brand panel */}
      <div className="relative hidden w-[46%] max-w-[720px] shrink-0 overflow-hidden bg-shell lg:block">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover opacity-60">
          <source src={accounting} type="video/webm" />
        </video>

        {/* Navy gradient scrim — keeps the copy legible over any video frame. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-shell via-shell/70 to-shell/30"
        />

        <div className="relative z-10 flex h-full flex-col justify-end p-12">
          <h2 className="text-[2.75rem] font-bold leading-[1.1] tracking-tight text-white">
            Make your
            <br />
            finances
            <br />
            <span className="text-munsell_blue-400">sane.</span>
          </h2>

          <ul className="mt-8 space-y-3.5">
            {HIGHLIGHTS.map((line) => (
              <li key={line} className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-munsell_blue/25 text-munsell_blue-400">
                  <FiCheck size={12} strokeWidth={3} />
                </span>
                <span className="text-sm text-white/75">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
