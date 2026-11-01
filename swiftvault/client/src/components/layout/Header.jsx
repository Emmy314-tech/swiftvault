import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Moon, Sun, LogOut, User as UserIcon, Wallet2 } from "lucide-react";
import Dropdown from "../ui/Dropdown.jsx";
import NotificationDrawer from "./NotificationDrawer.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getNotifications } from "../../services/notificationService.js";

export default function Header() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    getNotifications()
      .then(({ data }) => setUnreadCount(data.filter((n) => !n.read).length))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      toast(error.response?.data?.message || "Could not securely sign out. Please try again.", "error");
    }
  };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-borderc bg-white/90 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90 sm:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
          <Wallet2 size={16} className="text-white" />
        </div>
        <span className="font-bold text-text-primary dark:text-gray-100">SwiftVault</span>
      </div>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </button>

        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Notifications"
          className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <Bell size={19} />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-error text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        <Dropdown
          align="right"
          trigger={
            <button
              aria-label="Account menu"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
            >
              {user?.fullName?.[0]?.toUpperCase() || <UserIcon size={16} />}
            </button>
          }
          items={[
            { label: "Profile", icon: UserIcon, onClick: () => navigate("/profile") },
            { divider: true },
            { label: "Log out", icon: LogOut, danger: true, onClick: handleLogout },
          ]}
        />
      </div>

      <NotificationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUnreadChange={(val) => setUnreadCount(typeof val === "function" ? val(unreadCount) : val)}
      />
    </header>
  );
}
