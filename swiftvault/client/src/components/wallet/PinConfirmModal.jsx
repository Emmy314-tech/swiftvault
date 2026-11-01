import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import Modal from "../ui/Modal.jsx";
import CodeInput from "../ui/CodeInput.jsx";
import { Spinner } from "../ui/Spinner.jsx";

export default function PinConfirmModal({ open, onClose, onConfirm, title = "Confirm Transaction", subtitle, loading, error }) {
  const [key, setKey] = useState(0); // forces CodeInput to reset between attempts

  useEffect(() => {
    if (error) setKey((k) => k + 1);
  }, [error]);

  const handleComplete = (pin) => {
    onConfirm(pin);
  };

  const handleClose = () => {
    setKey((k) => k + 1);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/30">
          <ShieldCheck size={22} className="text-primary-600" />
        </div>
        <p className="mb-6 text-sm text-text-secondary dark:text-gray-400">
          {subtitle || "Enter your 4-digit transaction PIN to continue"}
        </p>

        <CodeInput key={key} length={4} secure onComplete={handleComplete} error={error} />

        {loading && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-text-secondary">
            <Spinner size={16} /> Processing...
          </div>
        )}
      </div>
    </Modal>
  );
}
