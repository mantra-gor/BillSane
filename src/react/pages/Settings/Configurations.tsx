import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FiImage, FiSave } from "react-icons/fi";
import Card from "../../components/ui/elements/Card";
import Button from "../../components/ui/elements/Button";
import Field from "../../components/ui/elements/Field";
import LabeledInput from "../../components/ui/elements/LabeledInput";
import ImagePicker from "../../components/ui/elements/ImagePicker";
import { SkeletonText } from "../../components/ui/elements/Skeleton";
import { useToast } from "../../components/ui/feedback/toastContext";
import {
  defaultBusinessConfig,
  getBusinessConfig,
  saveBusinessConfig,
  type BusinessConfig,
} from "../../utils/businessConfig";
import {
  blockNonDigitKey,
  emailValidation,
  phoneValidation,
} from "../../utils/validators";

type ConfigFormValues = Omit<BusinessConfig, "logo">;

function Configurations() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [logo, setLogo] = useState("");
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConfigFormValues>({
    defaultValues: defaultBusinessConfig,
  });

  useEffect(() => {
    let cancelled = false;
    getBusinessConfig().then((config) => {
      if (cancelled) return;
      setLogo(config.logo);
      reset(config);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reset]);

  const gstNoField = register("gstNo", {
    required: "GST number is required",
    pattern: {
      value: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      message: "Enter a valid GSTIN",
    },
  });

  const onSubmit = async (data: ConfigFormValues) => {
    setSaving(true);
    try {
      await saveBusinessConfig({ ...data, logo });
      toast.success(
        "Business details saved",
        "New invoices will use these details."
      );
    } catch (err) {
      toast.error(
        "Couldn't save business details",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card title="Business details">
        <SkeletonText lines={6} />
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card
        title="Business details"
        subtitle="These appear on every invoice you generate.">
        <div className="space-y-6">
          <ImagePicker
            value={logo}
            onChange={setLogo}
            label="Company logo"
            placeholderIcon={FiImage}
            hint="Square image, at least 300×300px. A PNG with a transparent background prints best. Max 1MB."
          />

          <div className="rule-fade" />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <LabeledInput
              title="Company name"
              required
              placeholder="Enter company name"
              error={errors.companyName?.message}
              {...register("companyName", {
                required: "Company name is required",
              })}
            />
            <LabeledInput
              title="Phone"
              required
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit number"
              onKeyDown={blockNonDigitKey}
              error={errors.phone?.message}
              {...register("phone", phoneValidation)}
            />
            <LabeledInput
              title="Email"
              required
              type="email"
              placeholder="billing@example.com"
              error={errors.email?.message}
              {...register("email", emailValidation)}
            />
            <LabeledInput
              title="GSTIN"
              required
              placeholder="06AAACM5586C1ZL"
              maxLength={15}
              className="tnum uppercase"
              hint="15-character GST identification number"
              error={errors.gstNo?.message}
              {...gstNoField}
              onChange={(e) => {
                e.target.value = e.target.value.toUpperCase();
                gstNoField.onChange(e);
              }}
            />
            <Field
              label="Registered address"
              htmlFor="address"
              required
              error={errors.address?.message}
              className="md:col-span-2">
              <textarea
                id="address"
                rows={3}
                className="input-field resize-y"
                aria-invalid={Boolean(errors.address) || undefined}
                placeholder="Street, city, state and PIN code"
                {...register("address", { required: "Address is required" })}
              />
            </Field>
          </div>

          <Button type="submit" loading={saving} icon={<FiSave size={15} />}>
            Save changes
          </Button>
        </div>
      </Card>
    </form>
  );
}

export default Configurations;
