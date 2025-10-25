import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import StudentDetailPage from "./pages/StudentDetailPage";
import DataInputPage from "./pages/DataInputPage";

const App = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<div className="centered-page"><LoginPage /></div>} />
    <Route path="/mock" element={<MockLayout />}>
      <Route index element={<LeaderboardPage />} />
      <Route path="leaderboard" element={<LeaderboardPage />} />
      <Route path="student" element={<StudentDetailPage />} />
      <Route path="data-entry" element={<DataInputPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>
);

const MockLayout = () => (
  <div className="mock-layout">
    <header className="mock-header">
      <h1>Mock Workspace</h1>
      <nav className="mock-nav">
        <Link to="/mock/leaderboard">Leaderboard</Link>
        <Link to="/mock/student">Student detail</Link>
        <Link to="/mock/data-entry">Data input</Link>
      </nav>
      <Link className="mock-back subtle" to="/login">
        ← Back to login
      </Link>
    </header>
    <main className="mock-content">
      <Outlet />
    </main>
  </div>
);

export default App;
