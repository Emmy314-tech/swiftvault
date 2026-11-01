import { Link } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, CircleHelp, FileClock, ShieldCheck, Wallet,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const FEATURES = [
  {
    icon: Wallet,
    title: "One clear account view",
    description: "See your account tools and balances from a single SwiftVault dashboard.",
  },
  {
    icon: FileClock,
    title: "Track what happened",
    description: "Review transaction records and open a support request with its reference.",
  },
  {
    icon: ShieldCheck,
    title: "Security before access",
    description: "Verification and transaction controls are enforced by the service, not by a screen.",
  },
];

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? "/dashboard" : "/register";

  return (
    <main className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5" aria-label="SwiftVault home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
            <Wallet size={21} className="text-white" />
          </span>
          <span className="text-lg font-bold">SwiftVault</span>
        </Link>
        <nav className="flex items-center gap-3" aria-label="Main navigation">
          <Link to={isAuthenticated ? "/dashboard" : "/login"} className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            {isAuthenticated ? "Open dashboard" : "Log in"}
          </Link>
          {!isAuthenticated && (
            <Link to="/register" className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">
              Create account
            </Link>
          )}
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-36 -top-32 h-96 w-96 rounded-full bg-primary-100 blur-3xl dark:bg-primary-900/20" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
              <BadgeCheck size={15} />
              A clearer way to manage your account
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Your money tools, with{" "}
              <span className="text-primary-600">clarity built in.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-gray-600 dark:text-gray-300 sm:text-lg">
              SwiftVault brings account information, transaction records, verification status and support together in one place.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={primaryHref} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3.5 font-semibold text-white transition hover:bg-primary-700">
                {isAuthenticated ? "Go to dashboard" : "Get started"}
                <ArrowRight size={18} />
              </Link>
              <Link to={isAuthenticated ? "/support" : "/login"} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 py-3.5 font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900">
                <CircleHelp size={18} />
                {isAuthenticated ? "Get support" : "Sign in"}
              </Link>
            </div>
            <p className="mt-5 max-w-xl text-xs leading-5 text-gray-500 dark:text-gray-400">
              Money movement and provider services may be unavailable while required verification, provider and policy approvals are pending. SwiftVault will show current availability in your account.
            </p>
          </div>

          <div className="mx-auto w-full max-w-md rounded-3xl border border-gray-100 bg-white p-5 shadow-xl shadow-primary-900/5 dark:border-gray-800 dark:bg-gray-900 sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Built around your account</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Clear records. Clear next steps.</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                <ShieldCheck size={22} />
              </div>
            </div>
            <div className="space-y-3">
              {[
                ["Account overview", "View account information"],
                ["Transaction history", "Check recorded activity"],
                ["Help & support", "Contact the support team"],
              ].map(([title, detail], index) => (
                <div key={title} className="flex items-center gap-3 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/70">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary-600 shadow-sm dark:bg-gray-900 dark:text-primary-300">
                    {index === 0 ? <Wallet size={17} /> : index === 1 ? <FileClock size={17} /> : <CircleHelp size={17} />}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-primary-100 bg-primary-50/70 p-4 text-xs leading-5 text-primary-900 dark:border-primary-900/50 dark:bg-primary-900/20 dark:text-primary-200">
              Access to each feature depends on current verification and service controls. No payment is represented as complete until confirmed by SwiftVault.
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <div className="mb-8 max-w-xl">
          <p className="text-sm font-semibold text-primary-600">Designed for confidence</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">The essentials, without guesswork.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <article key={title} className="rounded-2xl border border-gray-100 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                <Icon size={21} />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-gray-100 dark:border-gray-800">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-xs text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>SwiftVault · Account information and support</span>
          <Link to={isAuthenticated ? "/support" : "/login"} className="inline-flex items-center gap-1 font-medium text-primary-600">
            <CircleHelp size={14} /> Help & support
          </Link>
        </div>
      </footer>
    </main>
  );
}
