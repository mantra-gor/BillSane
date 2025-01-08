import "./BackgroundGraphic1.css";

function BackgroundGraphic1({ position }: { position: string }) {
  return (
    <div
      className={`w-screen h-screen overflow-hidden ${
        position == "top"
          ? "top-[-30%] right-[-45%]"
          : "-bottom-[20%] left-[-45%] !fixed"
      }  absolute box -z-10`}></div>
  );
}

export default BackgroundGraphic1;
