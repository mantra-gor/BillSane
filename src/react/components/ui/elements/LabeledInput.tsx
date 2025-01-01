function LabeledInput({
  name,
  title,
  required = false,
  onChange,
  ...rest
}: LabeledInputProps) {
  return (
    <div className="flex flex-col col-span-1">
      <label htmlFor={name} className="mb-1">
        {title}
        {required && <sup className="text-[0.825rem] text-pink-600">*</sup>}
      </label>
      <input
        name={name}
        id={name}
        className={`input-field`}
        onChange={onChange}
        style={{
          boxShadow: " 0px -1px 1px 0px rgba(20, 20, 20, 0.1) inset",
        }}
        {...rest}
      />
    </div>
  );
}

export default LabeledInput;
