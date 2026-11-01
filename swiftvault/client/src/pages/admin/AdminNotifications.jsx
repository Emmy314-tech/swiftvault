import { useState } from "react";
import { Radio, Send, ChevronDown } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Input from "../../components/ui/Input.jsx";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import SearchBar from "../../components/ui/SearchBar.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { listAllUsers, broadcastNotification, sendIndividualNotification } from "../../services/adminService.js";

// These MUST match the real Notification model's type enum exactly
// (wallet/transfer/vtu/bonus/security/announcement/promotion/system) - anything
// else fails Mongoose validation and the notification silently never gets created.
const TYPES = [
  { value: "announcement", label: "Announcement" },
  { value: "promotion", label: "Promotion" },
  { value: "security", label: "Security" },
  { value: "system", label: "System" },
];

export default function AdminNotifications() {
  const toast = useToast();

  const [broadcastForm, setBroadcastForm] = useState({ title: "", message: "", type: "announcement" });
  const [broadcasting, setBroadcasting] = useState(false);

  const [individualForm, setIndividualForm] = useState({ title: "", message: "", type: "announcement" });
  const [selectedUser, setSelectedUser] = useState(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [sending, setSending] = useState(false);

  const openUserPicker = async () => {
    setUserModalOpen(true);
    if (users.length === 0) {
      const { data } = await listAllUsers();
      setUsers(data);
    }
  };

  const filteredUsers = users.filter((u) =>
    [u.fullName, u.username, u.phone].some((v) => v?.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const handleBroadcast = async (e) => {
    e.preventDefault();
    setBroadcasting(true);
    try {
      const { data } = await broadcastNotification(broadcastForm);
      toast(data.message, "success");
      setBroadcastForm({ title: "", message: "", type: "announcement" });
    } catch (err) {
      toast(err.response?.data?.message || "Failed to broadcast", "error");
    } finally {
      setBroadcasting(false);
    }
  };

  const handleSendIndividual = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSending(true);
    try {
      await sendIndividualNotification({ userId: selectedUser._id, ...individualForm });
      toast(`Notification sent to ${selectedUser.fullName}`, "success");
      setIndividualForm({ title: "", message: "", type: "announcement" });
      setSelectedUser(null);
    } catch (err) {
      toast(err.response?.data?.message || "Failed to send", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Notifications</h1>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Radio size={17} className="text-primary-600" />
          <h3 className="font-semibold text-text-primary dark:text-gray-100">Broadcast to All Users</h3>
        </div>
        <form onSubmit={handleBroadcast} className="space-y-3">
          <Input label="Title" required value={broadcastForm.title} onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Message</label>
            <textarea
              required
              rows={3}
              value={broadcastForm.message}
              onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
              className="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <TypeSelector value={broadcastForm.type} onChange={(v) => setBroadcastForm({ ...broadcastForm, type: v })} />
          <Button type="submit" loading={broadcasting}>Send to All Users</Button>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Send size={17} className="text-primary-600" />
          <h3 className="font-semibold text-text-primary dark:text-gray-100">Send to Individual User</h3>
        </div>
        <form onSubmit={handleSendIndividual} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Recipient</label>
            <button
              type="button"
              onClick={openUserPicker}
              className="flex w-full items-center justify-between rounded-xl border border-gray-300 p-3 text-left dark:border-gray-700"
            >
              <span className={selectedUser ? "text-text-primary dark:text-gray-100" : "text-gray-400"}>
                {selectedUser ? `${selectedUser.fullName} (@${selectedUser.username})` : "Select a user"}
              </span>
              <ChevronDown size={18} className="text-gray-400" />
            </button>
          </div>
          <Input label="Title" required value={individualForm.title} onChange={(e) => setIndividualForm({ ...individualForm, title: e.target.value })} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Message</label>
            <textarea
              required
              rows={3}
              value={individualForm.message}
              onChange={(e) => setIndividualForm({ ...individualForm, message: e.target.value })}
              className="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <TypeSelector value={individualForm.type} onChange={(v) => setIndividualForm({ ...individualForm, type: v })} />
          <Button type="submit" disabled={!selectedUser} loading={sending}>Send Notification</Button>
        </form>
      </Card>

      <Modal open={userModalOpen} onClose={() => setUserModalOpen(false)} title="Select Recipient">
        <SearchBar value={userSearch} onChange={setUserSearch} placeholder="Search users..." />
        <div className="mt-3 max-h-80 overflow-y-auto">
          {filteredUsers.map((u) => (
            <button
              key={u._id}
              onClick={() => { setSelectedUser(u); setUserModalOpen(false); }}
              className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {u.fullName} <span className="text-text-secondary">(@{u.username})</span>
            </button>
          ))}
          {filteredUsers.length === 0 && <p className="py-6 text-center text-sm text-text-secondary">No users found</p>}
        </div>
      </Modal>
    </div>
  );
}

function TypeSelector({ value, onChange }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
      <div className="grid grid-cols-4 gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={`rounded-xl border-2 py-2 text-xs font-semibold transition ${
              value === t.value ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/20" : "border-borderc text-text-secondary dark:border-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
