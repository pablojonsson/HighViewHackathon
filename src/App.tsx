import { ReactElement } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom";
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
        <div className="mock-header-top">
          <div className="brand-stack">
            <div className="brand-badge-full">
              <img
                src="/pulseboard-logo.png"
                alt="Pulseboard logo"
                className="brand-image-full"
              />
            </div>
          </div>
          <div className="mock-user-block">
            <span className="mock-user subtle">
              <strong>{user.name}</strong> ({user.role})
            </span>
            <Link className="signout-link" to="/logout">
              Sign out
            </Link>
          </div>
        </div>
        <nav className="mock-nav">
          <NavLink to="/mock/leaderboard" className={({ isActive }) => (isActive ? "active" : undefined)}>
            Leaderboard
          </NavLink>
          {isTeacher ? (
            <>
              <NavLink to="/mock/student" className={({ isActive }) => (isActive ? "active" : undefined)}>
                Student details
              </NavLink>
              <NavLink to="/mock/data-entry" className={({ isActive }) => (isActive ? "active" : undefined)}>
                Data input
              </NavLink>
            </>
          ) : (
            <NavLink to="/mock/student" className={({ isActive }) => (isActive ? "active" : undefined)}>
              My Summary
            </NavLink>
          )}
        </nav>
      </header>
      <main className="mock-content">
        <Outlet />
      </main>
    </div>
  );
};

export default App;
