import { ReactElement } from "react";
import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import StudentDetailPage from "./pages/StudentDetailPage";
import DataInputPage from "./pages/DataInputPage";
import LogoutPage from "./pages/LogoutPage";

type RequireAuthProps = {
  children: ReactElement;
  allowedRoles?: Array<"teacher" | "student">;
};

const RequireAuth = ({ children, allowedRoles }: RequireAuthProps) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const fallback = user.role === "teacher" ? "/mock/leaderboard" : "/mock/student";
    return <Navigate to={fallback} replace />;
  }

  return children;
};

const App = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route
      path="/login"
      element={
        <div className="centered-page">
          <LoginPage />
        </div>
      }
    />
    <Route path="/logout" element={<LogoutPage />} />
    <Route
      path="/mock"
      element={
        <RequireAuth>
          <MockLayout />
        </RequireAuth>
      }
    >
      <Route index element={<LeaderboardPage />} />
      <Route path="leaderboard" element={<LeaderboardPage />} />
      <Route
        path="student"
        element={
          <RequireAuth>
            <StudentDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="data-entry"
        element={
          <RequireAuth allowedRoles={["teacher"]}>
            <DataInputPage />
          </RequireAuth>
        }
      />
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>
);

const MockLayout = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isTeacher = user.role === "teacher";

  return (
    <div className="mock-layout">
      <header className="mock-header">
        <h1>HighView Engagement</h1>
        <nav className="mock-nav">
          <Link to="/mock/leaderboard">Leaderboard</Link>
          {isTeacher ? (
            <>
              <Link to="/mock/student">Student detail</Link>
              <Link to="/mock/data-entry">Data input</Link>
            </>
          ) : (
            <Link to="/mock/student">My summary</Link>
          )}
          <Link to="/logout">Sign out</Link>
        </nav>
        <span className="mock-back subtle">
          Signed in as {user.name} ({user.role})
        </span>
      </header>
      <main className="mock-content">
        <Outlet />
      </main>
    </div>
  );
};

export default App;
