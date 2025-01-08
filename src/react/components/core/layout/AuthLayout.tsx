import BackgroundGraphic1 from "../graphics/BackgroundGraphic1";
import logo from "../../../assets/branding/logo-no-background.png";
import SignIn from "../../../pages/SignIn";
import SignUp from "../../../pages/SignUp";
import accounting from "../../../assets/resources/accounting.mp4";
// import animationData from "../../../assets/lottie/Meditation.json";
// import Lottie from "react-lottie";

function AuthLayout({ formType }: { formType: string }) {
  // const defaultOptions = {
  //   loop: true,
  //   autoplay: true,
  //   animationData: animationData,
  //   rendererSettings: {
  //     preserveAspectRatio: "xMidYMid slice",
  //     clearCanvas: false, // Avoid potential canvas issues
  //   },
  // };

  return (
    <div className="w-screen h-screen overflow-hidden flex">
      <BackgroundGraphic1 position="bottom" />
      <div className="p-6 z-20 w-7/12">
        <img src={logo} className="w-[200px]" />
        <div>{formType === "signin" ? <SignIn /> : <SignUp />}</div>
      </div>
      <div className="w-5/12 my-3 rounded-l-2xl overflow-hidden  flex justify-center items-center ">
        {/* <Lottie options={defaultOptions} /> */}
        <div style={{ position: "relative", width: "100%", height: "auto" }}>
          <video
            src={accounting}
            autoPlay
            muted
            loop
            className="w-full h-full relative"
          />
          <div className="absolute top-0 left-0 w-full h-full z-10 bg-black bg-opacity-20" />
          <div className="absolute flex flex-col gap-4 bottom-[20%] left-[10%] z-20 text-5xl text-white font-semibold tracking-wider">
            <div>Make Your</div>
            <div>Finances</div>
            <div>Sane</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
