import { Outlet } from "react-router-dom";
import Sidebar from "../components/layout/Sidebar.jsx";
import Header from "../components/layout/Header.jsx";
import BottomNav from "../components/layout/BottomNav.jsx";

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-surface dark:bg-gray-950">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header />
        <main className="flex-1 pb-24 lg:pb-6">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
            <Outlet />
          </div>
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
