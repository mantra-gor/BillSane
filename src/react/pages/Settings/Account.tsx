import { useState } from "react";
import { useForm } from "react-hook-form";
import { FiKey, FiLogOut, FiSave, FiShield, FiUser } from "react-icons/fi";
import Card from "../../components/ui/elements/Card";
import Button from "../../components/ui/elements/Button";
import Badge from "../../components/ui/elements/Badge";
import LabeledInput from "../../components/ui/elements/LabeledInput";
import ImagePicker from "../../components/ui/elements/ImagePicker";
import Modal from "../../components/ui/elements/Modal";
import { useToast } from "../../components/ui/feedback/toastContext";
import { useAuth } from "../../auth/authContext";
import {
  changePassword,
  updateProfile,
  PASSWORD_MIN_LENGTH,
  passwordValidation,
} from "../../utils/authStore";
import { blockNonDigitKey, emailValidation, PHONE_REGEX } from "../../utils/validators";

interface ProfileFormValues {
  name: string;
  email: string;
  phone: string;
}

interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

function Account() {
  const { user, permissions, applySession, signOut } = useAuth();
  const toast = useToast();
  const [avatar, setAvatar] = useState(user?.avatar ?? "");
  const [savedAvatar, setSavedAvatar] = useState(user?.avatar ?? "");
  const [confirmLogout, setConfirmLogout] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSaveProfile = async (data: ProfileFormValues) => {
    try {
      const session = await updateProfile({
        name: data.name,
        email: data.email,
        phone: data.phone.trim() || null,
        avatar: avatar || null,
      });
      // Adopt what the main process actually saved, rather than assuming the
      // form's values landed — the sidebar reads this same session.
      applySession(session);
      setSavedAvatar(session.user.avatar ?? "");
      profileForm.reset({
        name: session.user.name,
        email: session.user.email,
        phone: session.user.phone ?? "",
      });
      toast.success("Profile saved", "Your details are updated across BillSane.");
    } catch (err) {
      toast.error(
        "Couldn't save your profile",
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const onChangePassword = async (data: PasswordFormValues) => {
    try {
      await changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      passwordForm.reset();
      toast.success("Password changed", "Use your new password next time you sign in.");
    } catch (err) {
      toast.error(
        "Couldn't change your password",
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const avatarChanged = avatar !== savedAvatar;
  const profileDirty = profileForm.formState.isDirty || avatarChanged;

  return (
    <div className="space-y-5">
      <form onSubmit={profileForm.handleSubmit(onSaveProfile)} noValidate>
        <Card
          title="Profile"
          subtitle="Your personal details, shown across BillSane."
          action={
            user && (
              <Badge tone="brand" icon={<FiShield size={11} />}>
                {user.roleName}
              </Badge>
            )
          }>
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
                error={profileForm.formState.errors.name?.message}
                {...profileForm.register("name", {
                  required: "Full name is required",
                })}
              />
              <LabeledInput
                title="Email"
                required
                type="email"
                hint="This is what you sign in with"
                placeholder="name@example.com"
                error={profileForm.formState.errors.email?.message}
                {...profileForm.register("email", emailValidation)}
              />
              <LabeledInput
                title="Phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit number"
                onKeyDown={blockNonDigitKey}
                error={profileForm.formState.errors.phone?.message}
                {...profileForm.register("phone", {
                  pattern: {
                    value: PHONE_REGEX,
                    message: "Enter a valid 10-digit mobile number",
                  },
                })}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                icon={<FiSave size={15} />}
                loading={profileForm.formState.isSubmitting}
                disabled={!profileDirty}>
                Save changes
              </Button>
              {profileDirty && (
                <span className="text-xs font-medium text-warning-ink">
                  You have unsaved changes
                </span>
              )}
            </div>
          </div>
        </Card>
      </form>

      <form onSubmit={passwordForm.handleSubmit(onChangePassword)} noValidate>
        <Card
          title="Password"
          subtitle="Change the password you sign in with on this machine.">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <LabeledInput
                title="Current password"
                required
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                error={passwordForm.formState.errors.currentPassword?.message}
                {...passwordForm.register("currentPassword", {
                  required: "Enter your current password",
                })}
              />
              <LabeledInput
                title="New password"
                required
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
                error={passwordForm.formState.errors.newPassword?.message}
                {...passwordForm.register("newPassword", passwordValidation)}
              />
              <LabeledInput
                title="Confirm new password"
                required
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                error={passwordForm.formState.errors.confirmPassword?.message}
                {...passwordForm.register("confirmPassword", {
                  required: "Confirm your new password",
                  validate: (value) =>
                    value === passwordForm.getValues("newPassword") ||
                    "Both passwords must match",
                })}
              />
            </div>

            <Button
              type="submit"
              icon={<FiKey size={15} />}
              loading={passwordForm.formState.isSubmitting}>
              Change password
            </Button>
          </div>
        </Card>
      </form>

      <Card
        title="What you can do"
        subtitle={`Granted by your ${user?.roleName ?? "assigned"} role.`}>
        {permissions.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Your role has no permissions yet. Ask an administrator to grant some.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {permissions.map((permission) => (
              <Badge key={permission} tone="neutral">
                {permission}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card title="Session" subtitle="Sign out of this workspace.">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-md text-sm text-ink-muted">
            Signing out clears your session on this machine. You can sign back in
            anytime with your credentials — your data stays where it is.
          </p>
          <Button
            variant="subtle"
            icon={<FiLogOut size={15} />}
            onClick={() => setConfirmLogout(true)}>
            Sign out
          </Button>
        </div>
      </Card>

      <Modal
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Sign out of BillSane?"
        description="Any unsaved changes on this screen will be lost."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmLogout(false)}>
              Stay signed in
            </Button>
            <Button variant="danger" icon={<FiLogOut size={15} />} onClick={signOut}>
              Sign out
            </Button>
          </>
        }
      />
    </div>
  );
}

export default Account;
