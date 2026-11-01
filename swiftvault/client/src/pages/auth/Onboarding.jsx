import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, Zap, ShieldCheck } from "lucide-react";
import Button from "../../components/ui/Button.jsx";

const SLIDES = [
  {
    icon: Wallet,
    title: "One wallet, everything you need",
    description: "Send money, pay bills, and manage your finances - all from a single secure wallet.",
  },
  {
    icon: Zap,
    title: "Instant airtime, data & bills",
    description: "Buy airtime, data, electricity, cable TV, and more in seconds, anytime.",
  },
  {
    icon: ShieldCheck,
    title: "Bank-level security",
    description: "Your money and data are protected with encryption and PIN-secured transactions.",
  },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const isLast = step === SLIDES.length - 1;
  const Slide = SLIDES[step];

  const finish = () => {
    localStorage.setItem("onboarded", "true");
    navigate("/register");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 py-10 dark:bg-gray-950">
      <button
        onClick={finish}
        className="self-end text-sm font-medium text-gray-400 hover:text-gray-600"
      >
        Skip
      </button>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/30">
          <Slide.icon size={44} className="text-primary-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{Slide.title}</h2>
        <p className="mt-2 max-w-xs text-sm text-gray-500 dark:text-gray-400">{Slide.description}</p>
      </div>

      <div className="mb-8 flex justify-center gap-2">
        {SLIDES.map((_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all ${
              i === step ? "w-6 bg-primary-600" : "w-2 bg-gray-200 dark:bg-gray-700"
            }`}
          />
        ))}
      </div>

      <Button onClick={() => (isLast ? finish() : setStep((s) => s + 1))}>
        {isLast ? "Get Started" : "Next"}
      </Button>
    </div>
  );
}
