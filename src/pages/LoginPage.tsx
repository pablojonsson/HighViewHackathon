import { useNavigate } from "react-router-dom";

const LoginPage = () => {
  const navigate = useNavigate();

  const handleMockLogin = () => {
    navigate("/mock/leaderboard");
  };

  return (
    <div className="card stack" style={{ maxWidth: "520px" }}>
      <h2>Welcome back</h2>
      <p className="subtle">
        Sign in with your school Google account to view attendance diagnostics.
      </p>
      <button className="primary-btn" onClick={handleMockLogin}>
        Continue with Google
      </button>
      <p className="subtle">Need access? Contact your program admin.</p>
    </div>
  );
};

export default LoginPage;
