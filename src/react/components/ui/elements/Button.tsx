import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  active?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  type = "button",
  active = true,
  onClick,
  disabled = false,
  className = "",
  children,
  ...rest
}) => {
  return (
    <div>
      <button
        type={type}
        disabled={disabled}
        className={`p-2 rounded-lg hover:drop-shadow-xl active:h-[calc(100% - 20px)] transition-all duration-300 ${active ? "bg-prussian_blue text-white" : "bg-primary-25"} ${className} `}
        onClick={onClick}
        {...rest}>
        {children}
      </button>
    </div>
  );
};

export default Button;
