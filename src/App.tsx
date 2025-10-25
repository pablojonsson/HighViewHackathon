import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";

const App = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<div className="centered-page"><LoginPage /></div>} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>
);

export default App;
