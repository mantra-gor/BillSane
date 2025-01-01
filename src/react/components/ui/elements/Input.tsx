function Input({ name, type, onChange, className = "", ...rest }: InputProps) {
  return (
    <div>
      <input
        type={type}
        name={name}
        id={name}
        className={`${className} w-full p-2 rounded-lg bg-primary disabled:bg-primary-50`}
        onChange={onChange}
        style={{
          boxShadow: " 0px -1px 1px 0px rgba(20, 20, 20, 0.1) inset",
        }}
        {...rest}
      />
    </div>
  );
}

export default Input;
