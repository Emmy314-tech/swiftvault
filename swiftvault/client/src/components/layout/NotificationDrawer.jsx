import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import Drawer from "../ui/Drawer.jsx";
import Badge from "../ui/Badge.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import { SkeletonList } from "../ui/Skeleton.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../../services/notificationService.js";

// Maps the REAL Notification model type enum (wallet/transfer/vtu/bonus/security/
// announcement/promotion/system) to badge colors. Previously this incorrectly assumed
// types were info/success/warning/error, which don't exist on the model at all -
// every badge was silently falling back to a gray "neutral" regardless of actual type.
const TYPE_VARIANT = {
  wallet: "success",
  bonus: "success",
  transfer: "info",
  vtu: "info",
  promotion: "primary",
  announcement: "primary",
  security: "error",
  system: "neutral",
};

const PRIORITY_VARIANT = { high: "error", normal: "info", low: "neutral" };

export default function NotificationDrawer({ open, onClose, onUnreadChange }) {
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getNotifications();
      setNotifications(data);
      onUnreadChange?.(data.filter((n) => !n.read).length);
    } catch {
      toast("Could not load notifications", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    onUnreadChange?.((prev) => Math.max(0, prev - 1));
    try {
      await markAsRead(id);
    } catch {
      /* non-critical, keep optimistic UI */
    }
  };

  const handleMarkAll = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    onUnreadChange?.(0);
    try {
      await markAllAsRead();
      toast("All notifications marked as read", "success");
    } catch {
      toast("Failed to mark all as read", "error");
    }
  };

  const handleDelete = async (id) => {
    const prev = notifications;
    setNotifications((n) => n.filter((item) => item._id !== id));
    try {
      await deleteNotification(id);
    } catch {
      setNotifications(prev);
      toast("Failed to delete notification", "error");
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="Notifications">
      {!loading && notifications.length > 0 && (
        <div className="flex justify-end px-5 pt-3">
          <button
            onClick={handleMarkAll}
            className="flex items-center gap-1 text-xs font-medium text-primary-600"
          >
            <CheckCheck size={14} /> Mark all as read
          </button>
        </div>
      )}

      <div className="px-2 pb-6">
        {loading && <div className="px-3"><SkeletonList count={4} /></div>}

        {!loading && notifications.length === 0 && (
          <EmptyState icon={Bell} title="No notifications yet" description="We'll let you know when something happens." />
        )}

        {!loading &&
          notifications.map((n) => (
            <div
              key={n._id}
              onClick={() => !n.read && handleRead(n._id)}
              className={`group relative m-1 rounded-xl p-3 transition ${
                n.read ? "bg-transparent" : "bg-primary-50 dark:bg-primary-900/20"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <p className="text-sm font-semibold text-text-primary dark:text-gray-100">{n.title}</p>
                    {n.type && <Badge variant={TYPE_VARIANT[n.type] || "neutral"}>{n.type}</Badge>}
                    {n.priority && n.priority !== "normal" && (
                      <Badge variant={PRIORITY_VARIANT[n.priority] || "neutral"}>{n.priority}</Badge>
                    )}
                    {!n.read && <span className="h-2 w-2 rounded-full bg-primary-600" />}
                  </div>
                  <p className="text-sm text-text-secondary dark:text-gray-400">{n.message}</p>
                  <p className="mt-1 text-xs text-gray-400">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(n._id); }}
                  aria-label="Delete notification"
                  className="opacity-0 transition group-hover:opacity-100 text-gray-400 hover:text-error"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
      </div>

      {!loading && notifications.length > 0 && (
        <Link
          to="/notifications"
          onClick={onClose}
          className="block px-5 pb-5 text-center text-sm font-medium text-primary-600"
        >
          View all notifications
        </Link>
      )}
    </Drawer>
  );
}
