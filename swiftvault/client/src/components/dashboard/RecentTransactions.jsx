import { Link, useNavigate } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Receipt } from "lucide-react";
import Card from "../ui/Card.jsx";
import Badge from "../ui/Badge.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import { CREDIT_TYPES, STATUS_VARIANT, TYPE_LABEL } from "../../utils/transactionLabels.js";

export default function RecentTransactions({ transactions = [] }) {
  const navigate = useNavigate();

  const openReceipt = (tx) => {
    navigate(`/receipt/${tx.reference || tx._id}`, { state: { transaction: tx } });
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-text-primary dark:text-gray-100">Recent Transactions</h3>
        <Link to="/transactions" className="text-sm font-medium text-primary-600">
          See all
        </Link>
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No transactions yet"
          description="Your recent activity will show up here once you start using your wallet."
        />
      ) : (
        <div className="divide-y divide-borderc dark:divide-gray-800">
          {transactions.map((tx) => {
            const isCredit = CREDIT_TYPES.includes(tx.type);
            return (
              <div key={tx._id} onClick={() => openReceipt(tx)} className="flex cursor-pointer items-center gap-3 py-3 -mx-1 px-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    isCredit ? "bg-success-light text-success dark:bg-success/10" : "bg-gray-100 text-gray-500 dark:bg-gray-800"
                  }`}
                >
                  {isCredit ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary dark:text-gray-100">
                    {tx.description || TYPE_LABEL[tx.type] || tx.type}
                  </p>
                  <p className="text-xs text-text-secondary dark:text-gray-400">
                    {new Date(tx.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${isCredit ? "text-success" : "text-text-primary dark:text-gray-100"}`}>
                    {isCredit ? "+" : "-"}₦{Number(tx.amount).toLocaleString()}
                  </p>
                  <Badge variant={STATUS_VARIANT[tx.status] || "neutral"}>{tx.status}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
