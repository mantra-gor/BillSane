import React, { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="rounded-2xl bg-white w-full h-full border shadow-xl overflow-clip">
      {children}
    </div>
  );
};

export default AppLayout;
