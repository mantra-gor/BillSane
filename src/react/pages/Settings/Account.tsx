import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { FiLogOut, FiSave, FiUser } from "react-icons/fi";
import Card from "../../components/ui/elements/Card";
import Button from "../../components/ui/elements/Button";
import LabeledInput from "../../components/ui/elements/LabeledInput";
import ImagePicker from "../../components/ui/elements/ImagePicker";
import Modal from "../../components/ui/elements/Modal";
import { useToast } from "../../components/ui/feedback/toastContext";
import {
  getUserProfile,
  saveUserProfile,
  type UserProfile,
} from "../../utils/userProfile";
import {
  blockNonDigitKey,
  emailValidation,
  phoneValidation,
} from "../../utils/validators";

type ProfileFormValues = Omit<UserProfile, "avatar">;

function Account() {
  const navigate = useNavigate();
  const toast = useToast();
  const [savedProfile] = useState(getUserProfile);
  const [avatar, setAvatar] = useState(savedProfile.avatar);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    defaultValues: {
      fullName: savedProfile.fullName,
      email: savedProfile.email,
      phone: savedProfile.phone,
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    saveUserProfile({ ...data, avatar });
    toast.success("Profile saved", "Your details are updated across BillSane.");
  };

  const logout = () => {
    localStorage.removeItem("isUserLoggedIn");
    navigate("/sign-in");
  };

  const avatarChanged = avatar !== savedProfile.avatar;

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card title="Profile" subtitle="Your personal details, shown across BillSane.">
          <div className="space-y-6">
            <ImagePicker
              value={avatar}
              onChange={setAvatar}
              label="Profile photo"
              shape="circle"
              fit="cover"
              placeholderIcon={FiUser}
              hint="Square image recommended, at least 200×200px. Max 1MB."
            />

            <div className="rule-fade" />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <LabeledInput
                title="Full name"
                required
                placeholder="Enter your full name"
                error={errors.fullName?.message}
                {...register("fullName", {
                  required: "Full name is required",
                })}
              />
              <LabeledInput
                title="Email"
                required
                type="email"
                placeholder="name@example.com"
                error={errors.email?.message}
                {...register("email", emailValidation)}
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
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                icon={<FiSave size={15} />}
                disabled={!isDirty && !avatarChanged}>
                Save changes
              </Button>
              {(isDirty || avatarChanged) && (
                <span className="text-xs font-medium text-warning-ink">
                  You have unsaved changes
                </span>
              )}
            </div>
          </div>
        </Card>
      </form>

      <Card title="Session" subtitle="Sign out of this workspace.">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-md text-sm text-ink-muted">
            Logging out clears your local session. You can sign back in anytime
            with your credentials — your data stays on this machine.
          </p>
          <Button
            variant="subtle"
            icon={<FiLogOut size={15} />}
            onClick={() => setConfirmLogout(true)}>
            Log out
          </Button>
        </div>
      </Card>

      <Modal
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Log out of BillSane?"
        description="Any unsaved changes on this screen will be lost."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmLogout(false)}>
              Stay signed in
            </Button>
            <Button
              variant="danger"
              icon={<FiLogOut size={15} />}
              onClick={logout}>
              Log out
            </Button>
          </>
        }
      />
    </div>
  );
}

export default Account;
