interface LabeledInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  name?: string;
  title: string;
  required?: boolean;
  className?: string;
}

function LabeledInput({
  name,
  title,
  required = false,
  className = "",
  ...rest
}: LabeledInputProps) {
  console.log(name);

  return (
    <div className="flex flex-col col-span-1">
      <label htmlFor={name} className="mb-1 font-medium text-gray-700">
        {title}
        {required && <sup className="text-pink-600 ml-1">*</sup>}
      </label>
      <input
        // id={name}
        // name={name + "1"}
        className={`border p-3 input-field w-full rounded-md ${className}`}
        style={{
          boxShadow: "0px -1px 1px 0px rgba(20, 20, 20, 0.1) inset",
        }}
        {...rest} // keep this last so hook-form's props (like onChange) take priority
      />
    </div>
  );
}

export default LabeledInput;
