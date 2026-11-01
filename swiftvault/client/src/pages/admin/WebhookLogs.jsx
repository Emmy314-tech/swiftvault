import { useEffect, useState } from "react";
import { Webhook } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import SearchBar from "../../components/ui/SearchBar.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import Modal from "../../components/ui/Modal.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonList } from "../../components/ui/Skeleton.jsx";
import { getWebhookLogs } from "../../services/adminService.js";

const STATUS_VARIANT = {
  received: "info",
  processed: "success",
  duplicate: "warning",
  failed: "error",
  rejected: "error",
};

export default function WebhookLogs() {
  const [result, setResult] = useState({ logs: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await getWebhookLogs({ page, limit: 20, search: search || undefined, processingStatus: status || undefined });
      setResult(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, search, status]);
  useEffect(() => { setPage(1); }, [search, status]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <Webhook size={22} className="text-primary-600" />
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Webhook Logs</h1>
      </div>

      <Card>
        <div className="space-y-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by reference..." />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-borderc bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">All Statuses</option>
            <option value="processed">Processed</option>
            <option value="duplicate">Duplicate</option>
            <option value="failed">Failed</option>
            <option value="rejected">Rejected (bad signature)</option>
          </select>
        </div>
      </Card>

      {loading && <SkeletonList count={8} />}
      {error && <ErrorState message="Could not load webhook logs." onRetry={load} />}

      {!loading && !error && result.logs.length === 0 && (
        <EmptyState icon={Webhook} title="No webhook events received yet" />
      )}

      {!loading && !error && result.logs.length > 0 && (
        <>
          <Card padded={false}>
            <div className="divide-y divide-borderc dark:divide-gray-800">
              {result.logs.map((log) => (
                <button
                  key={log._id}
                  onClick={() => setSelected(log)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary dark:text-gray-100">{log.eventType || "Unknown event"}</p>
                    <p className="text-xs text-text-secondary dark:text-gray-400">{log.reference || "No reference"}</p>
                    <p className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[log.processingStatus] || "neutral"}>{log.processingStatus}</Badge>
                </button>
              ))}
            </div>
          </Card>
          <Pagination page={page} totalPages={result.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Webhook Details">
        {selected && (
          <div className="space-y-3 text-sm">
            <Row label="Provider" value={selected.provider} />
            <Row label="Event Type" value={selected.eventType} />
            <Row label="Reference" value={selected.reference} />
            <Row label="Signature Valid" value={selected.signatureValid === null ? "N/A" : selected.signatureValid ? "Yes" : "No"} />
            <Row label="Status" value={selected.processingStatus} />
            {selected.errorMessage && <Row label="Error" value={selected.errorMessage} />}
            <Row label="Received" value={new Date(selected.createdAt).toLocaleString()} />
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary dark:text-gray-400">Payload</p>
              <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-gray-50 p-3 text-xs dark:bg-gray-800">
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-secondary dark:text-gray-400">{label}</span>
      <span className="font-medium text-text-primary dark:text-gray-100">{value}</span>
    </div>
  );
}
