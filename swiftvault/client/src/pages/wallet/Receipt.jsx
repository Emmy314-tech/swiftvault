import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Share2, Wallet2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import TransactionStatus from "../../components/wallet/TransactionStatus.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getTransactions } from "../../services/transactionService.js";
import { TYPE_LABEL } from "../../utils/transactionLabels.js";

export default function Receipt() {
  const { reference } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const receiptRef = useRef(null);

  const [transaction, setTransaction] = useState(location.state?.transaction || null);
  const [loading, setLoading] = useState(!location.state?.transaction);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cards = location.state?.cards || [];
  const examData = location.state?.examData || null;

  useEffect(() => {
    if (transaction) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data } = await getTransactions();
        const found = data.find((t) => t.reference === reference || t._id === reference);
        if (found) {
          setTransaction(found);
        } else if (location.state?.fallback) {
          setTransaction(location.state.fallback);
        } else {
          setError(true);
        }
      } catch {
        if (location.state?.fallback) setTransaction(location.state.fallback);
        else setError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  const handleDownload = async () => {
    if (!receiptRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(receiptRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "px", format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`SwiftVault-Receipt-${reference}.pdf`);
    } catch {
      toast("Could not generate PDF", "error");
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    const text = `SwiftVault Receipt\nReference: ${reference}\nAmount: ₦${Number(transaction?.amount || 0).toLocaleString()}\nStatus: ${transaction?.status}\nDate: ${new Date(transaction?.createdAt || Date.now()).toLocaleString()}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "SwiftVault Receipt", text });
      } catch {
        /* user cancelled share sheet - not an error */
      }
    } else {
      navigator.clipboard.writeText(text);
      toast("Receipt details copied to clipboard", "success");
    }
  };

  if (loading) return <SkeletonCard />;
  if (error || !transaction) {
    return <ErrorState message="Receipt not found." onRetry={() => navigate("/transactions")} />;
  }

  return (
    <div className="mx-auto max-w-md space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/wallet" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Receipt</h1>
      </div>

      <Card>
        <div ref={receiptRef} className="bg-white p-2 dark:bg-gray-900">
          <div className="mb-5 flex items-center justify-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
              <Wallet2 size={16} className="text-white" />
            </div>
            <span className="font-bold text-text-primary dark:text-gray-100">SwiftVault</span>
          </div>

          <div className="flex flex-col items-center">
            <TransactionStatus status={transaction.status} size="lg" />
            <p className="mt-3 text-3xl font-bold text-text-primary dark:text-gray-100">
              ₦{Number(transaction.amount).toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-text-secondary dark:text-gray-400">
              {transaction.description || TYPE_LABEL[transaction.type] || "Transaction"}
            </p>
          </div>

          <div className="mt-6 space-y-3 border-t border-dashed border-borderc pt-4 dark:border-gray-700">
            <DetailRow label="Reference" value={reference} mono />
            {transaction.createdAt && (
              <DetailRow label="Date" value={new Date(transaction.createdAt).toLocaleString()} />
            )}
            {transaction.fee > 0 && <DetailRow label="Fee" value={`₦${transaction.fee.toLocaleString()}`} />}
            {transaction.recipient?.name && <DetailRow label="Recipient" value={transaction.recipient.name} />}
            <DetailRow label="Status" value={transaction.status} capitalize />
          </div>
        </div>
      </Card>

      {cards.length > 0 && (
        <Card>
          <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Your Recharge Card PIN(s)</h3>
          <div className="space-y-2">
            {cards.map((card, i) => (
              <div key={i} className="rounded-xl border border-borderc p-3 dark:border-gray-700">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary dark:text-gray-400">PIN</span>
                  <span className="font-mono font-semibold text-text-primary dark:text-gray-100">{card.pin}</span>
                </div>
                {card.serial && (
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-text-secondary dark:text-gray-400">Serial</span>
                    <span className="font-mono text-text-primary dark:text-gray-100">{card.serial}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {examData && (
        <Card>
          <h3 className="mb-3 font-semibold text-text-primary dark:text-gray-100">Exam PIN Details</h3>
          <pre className="whitespace-pre-wrap break-words rounded-xl bg-gray-50 p-3 text-xs text-text-primary dark:bg-gray-800 dark:text-gray-200">
            {typeof examData === "string" ? examData : JSON.stringify(examData, null, 2)}
          </pre>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" icon={Share2} onClick={handleShare}>Share</Button>
        <Button icon={Download} loading={downloading} onClick={handleDownload}>Download PDF</Button>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono, capitalize }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary dark:text-gray-400">{label}</span>
      <span className={`text-sm font-medium text-text-primary dark:text-gray-100 ${mono ? "font-mono" : ""} ${capitalize ? "capitalize" : ""}`}>
        {value}
      </span>
    </div>
  );
}
