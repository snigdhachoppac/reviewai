import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import PRDetail from "./pages/PRDetail.jsx";
import Insights from "./pages/Insights.jsx";
import styles from "./App.module.css";

export default function App() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pr/:id" element={<PRDetail />} />
          <Route path="/insights" element={<Insights />} />
        </Routes>
      </main>
    </div>
  );
}
