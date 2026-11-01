import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock3, ShieldCheck, Trophy } from "lucide-react";
import Card from "../../components/ui/Card.jsx";

export default function Betting() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/vtu" aria-label="Back"><ArrowLeft size={20} className="text-gray-500" /></Link>
        <h1 className="text-xl font-bold text-text-primary dark:text-gray-100">Betting</h1>
      </div>

      <Card className="overflow-hidden !p-0">
        <div className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-indigo-500 px-6 py-10 text-white sm:px-10 sm:py-12">
          <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full border-[24px] border-white/10" />
          <div className="absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-white/5" />
          <div className="relative mx-auto max-w-xl text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 shadow-inner ring-1 ring-white/20">
              <Trophy size={30} aria-hidden="true" />
            </div>
            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide ring-1 ring-white/20">
              <Clock3 size={14} aria-hidden="true" />
              COMING SOON
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
              Betting payments are on their way
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/85 sm:text-base">
              We’re preparing a secure, reliable way to fund supported betting accounts.
              This service will be available as soon as setup and provider checks are complete.
            </p>
          </div>
        </div>

        <div className="space-y-5 px-5 py-6 sm:px-8">
          <div className="flex items-start gap-3 rounded-xl bg-primary-50 p-4 dark:bg-primary-900/20">
            <ShieldCheck size={19} className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-300" aria-hidden="true" />
            <p className="text-sm leading-5 text-text-secondary dark:text-gray-300">
              Betting is not available yet. No payment will be taken and no provider request will be sent from this page.
            </p>
          </div>
          <Link
            to="/vtu"
            className="mx-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            Explore available services
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </Card>
    </div>
  );
}
