import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, CheckCheck, Trash2 } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import { SkeletonList } from "../components/ui/Skeleton.jsx";
import { useToast } from "../context/ToastContext.jsx";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../services/notificationService.js";

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

export default function Notifications() {
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getNotifications();
      setNotifications(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    try {
      await markAsRead(id);
    } catch {
      /* keep optimistic state */
    }
  };

  const handleMarkAll = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
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

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
          <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Notifications</h1>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAll} className="flex items-center gap-1 text-sm font-medium text-primary-600">
            <CheckCheck size={15} /> Mark all read
          </button>
        )}
      </div>

      {loading && <SkeletonList count={6} />}
      {error && <ErrorState message="Could not load notifications." onRetry={load} />}

      {!loading && !error && notifications.length === 0 && (
        <EmptyState icon={Bell} title="No notifications yet" description="We'll let you know when something happens." />
      )}

      {!loading && !error && notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n._id}
              onClick={() => !n.read && handleRead(n._id)}
              className={`group relative !p-4 ${n.read ? "" : "border-l-4 border-l-primary-600"}`}
            >
              <div className="flex items-start justify-between gap-3">
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
                  className="text-gray-400 opacity-0 transition hover:text-error group-hover:opacity-100"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
