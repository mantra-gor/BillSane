import { useNavigate } from "react-router";
import Button from "../../components/ui/elements/Button";

function Account() {
  const navigate = useNavigate();
  const logoutHandler = () => {
    localStorage.clear();
    navigate("/");
  };

  return (
    <div>
      Account
      <div>
        <Button onClick={logoutHandler}>Logout</Button>
      </div>
    </div>
  );
}

export default Account;
