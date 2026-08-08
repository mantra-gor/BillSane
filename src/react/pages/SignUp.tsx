import { useNavigate } from "react-router";
import { FiArrowLeft, FiUserPlus } from "react-icons/fi";
import Button from "../components/ui/elements/Button";
import EmptyState from "../components/ui/elements/EmptyState";

/**
 * Registration isn't wired up yet — auth is still the local placeholder. Rather
 * than a dead screen, this states that plainly and routes back to sign-in.
 */
function SignUp() {
  const navigate = useNavigate();

  return (
    <div className="animate-fade-in-up">
      <div className="card">
        <EmptyState
          icon={FiUserPlus}
          title="Account creation isn't available yet"
          description="BillSane runs entirely on this machine right now, so there's no sign-up step. Use the existing sign-in to get to your workspace."
          action={
            <Button
              variant="secondary"
              icon={<FiArrowLeft size={15} />}
              onClick={() => navigate("/sign-in")}>
              Back to sign in
            </Button>
          }
        />
      </div>
    </div>
  );
}

export default SignUp;
