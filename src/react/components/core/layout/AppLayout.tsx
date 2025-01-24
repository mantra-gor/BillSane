import React, { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="relative rounded-2xl bg-white w-full max-h-[calc(100vh-40px)] border shadow-xl overflow-hidden">
      {children}
    </div>
  );
};

export default AppLayout;
