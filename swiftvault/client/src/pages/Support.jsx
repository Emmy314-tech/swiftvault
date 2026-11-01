import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, MessageCircle, Send } from "lucide-react";
import Badge from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";
import Card from "../components/ui/Card.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import Input from "../components/ui/Input.jsx";
import { SkeletonList } from "../components/ui/Skeleton.jsx";
import { useToast } from "../context/ToastContext.jsx";
import {
  createSupportTicket,
  getMySupportTickets,
  replyToSupportTicket,
} from "../services/supportService.js";

const CATEGORIES = [
  ["account", "Account"],
  ["transaction", "Transaction"],
  ["payment", "Payment or funding"],
  ["service", "Airtime, data or bills"],
  ["security", "Security concern"],
  ["complaint", "Complaint"],
  ["other", "Other"],
];

const STATUS_VARIANT = {
  open: "warning",
  in_review: "primary",
  resolved: "success",
  closed: "neutral",
};

const STATUS_LABEL = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  closed: "Closed",
};

const formatDate = (date) => new Date(date).toLocaleString();

export default function Support() {
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [form, setForm] = useState({ category: "account", subject: "", reference: "", message: "" });
  const [replies, setReplies] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [error, setError] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getMySupportTickets();
      setTickets(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const submitTicket = async (event) => {
    event.preventDefault();
    setCreating(true);
    try {
      await createSupportTicket(form);
      setForm({ category: "account", subject: "", reference: "", message: "" });
      toast("Your support request has been submitted.", "success");
      await loadTickets();
    } catch (requestError) {
      toast(requestError.response?.data?.message || "Could not submit your support request.", "error");
    } finally {
      setCreating(false);
    }
  };

  const submitReply = async (event, ticketId) => {
    event.preventDefault();
    const message = replies[ticketId] || "";
    setReplyingTo(ticketId);
    try {
      await replyToSupportTicket(ticketId, message);
      setReplies((current) => ({ ...current, [ticketId]: "" }));
      toast("Your reply has been added.", "success");
      await loadTickets();
    } catch (requestError) {
      toast(requestError.response?.data?.message || "Could not send your reply.", "error");
    } finally {
      setReplyingTo(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2">
          <LifeBuoy size={22} className="text-primary-600" />
          <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Help & support</h1>
        </div>
        <p className="mt-2 text-sm text-text-secondary dark:text-gray-400">
          Send a question or complaint and follow replies here. Include a transaction reference when relevant.
        </p>
      </div>

      <Card>
        <form onSubmit={submitTicket} className="space-y-4">
          <h2 className="font-semibold text-text-primary dark:text-gray-100">Create a support request</h2>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Category
            <select
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <Input
            label="Subject"
            required
            minLength={5}
            maxLength={120}
            value={form.subject}
            onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
            placeholder="Briefly describe the issue"
          />
          <Input
            label="Transaction reference (optional)"
            maxLength={120}
            value={form.reference}
            onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
            placeholder="Reference from your transaction history"
          />
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Message
            <textarea
              required
              minLength={5}
              maxLength={4000}
              rows={5}
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              placeholder="Explain what happened and what help you need."
              className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white p-3 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-primary-900/40"
            />
          </label>
          <p className="text-xs leading-5 text-amber-700 dark:text-amber-400">
            Do not include your password, transaction PIN, OTP, full card details, or private authentication information.
          </p>
          <Button type="submit" loading={creating} icon={Send}>Submit request</Button>
        </form>
      </Card>

      <section className="space-y-3" aria-labelledby="support-history">
        <h2 id="support-history" className="text-lg font-semibold text-text-primary dark:text-gray-100">Your requests</h2>
        {loading && <SkeletonList count={3} />}
        {error && <ErrorState message="Could not load your support requests." onRetry={loadTickets} />}
        {!loading && !error && tickets.length === 0 && (
          <Card>
            <EmptyState icon={MessageCircle} title="No support requests yet" description="Your submitted requests and replies will appear here." />
          </Card>
        )}
        {!loading && !error && tickets.map((ticket) => (
          <Card key={ticket._id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-text-primary dark:text-gray-100">{ticket.subject}</p>
                <p className="mt-1 text-xs text-text-secondary dark:text-gray-400">
                  {CATEGORIES.find(([value]) => value === ticket.category)?.[1] || "Other"} · Updated {formatDate(ticket.updatedAt)}
                </p>
                {ticket.reference && <p className="mt-1 text-xs text-text-secondary dark:text-gray-400">Reference: {ticket.reference}</p>}
              </div>
              <Badge variant={STATUS_VARIANT[ticket.status] || "neutral"}>{STATUS_LABEL[ticket.status] || ticket.status}</Badge>
            </div>
            <div className="mt-4 space-y-3 border-t border-borderc pt-4 dark:border-gray-800">
              {ticket.messages.map((entry) => (
                <div key={entry._id} className={`rounded-xl p-3 ${entry.authorType === "admin" ? "bg-primary-50 dark:bg-primary-900/20" : "bg-gray-50 dark:bg-gray-800/70"}`}>
                  <div className="mb-1 flex justify-between gap-3 text-xs">
                    <span className="font-semibold">{entry.authorType === "admin" ? "SwiftVault Support" : "You"}</span>
                    <time dateTime={entry.createdAt} className="text-gray-500">{formatDate(entry.createdAt)}</time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700 dark:text-gray-300">{entry.body}</p>
                </div>
              ))}
            </div>
            <form onSubmit={(event) => submitReply(event, ticket._id)} className="mt-4 space-y-3">
              <label className="sr-only" htmlFor={`reply-${ticket._id}`}>Reply to {ticket.subject}</label>
              <textarea
                id={`reply-${ticket._id}`}
                minLength={5}
                maxLength={4000}
                required
                rows={2}
                value={replies[ticket._id] || ""}
                onChange={(event) => setReplies((current) => ({ ...current, [ticket._id]: event.target.value }))}
                placeholder="Add a reply or provide more details"
                className="w-full rounded-xl border border-gray-300 bg-white p-3 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
              <Button type="submit" size="sm" loading={replyingTo === ticket._id} fullWidth={false}>Send reply</Button>
            </form>
          </Card>
        ))}
      </section>
    </div>
  );
}
