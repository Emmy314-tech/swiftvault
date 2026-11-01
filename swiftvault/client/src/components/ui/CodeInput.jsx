import { useRef, useState, useEffect } from "react";

export default function CodeInput({ length = 6, onComplete, secure = false, error }) {
  const [digits, setDigits] = useState(Array(length).fill(""));
  const refs = useRef([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const handleChange = (index, value) => {
    const clean = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);

    if (clean && index < length - 1) {
      refs.current[index + 1]?.focus();
    }

    if (next.every((d) => d !== "")) {
      onComplete?.(next.join(""));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    const next = pasted.split("");
    while (next.length < length) next.push("");
    setDigits(next);
    if (pasted.length === length) onComplete?.(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div>
      <div className="flex justify-center gap-2" onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            type={secure ? "password" : "text"}
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={`h-14 w-11 rounded-xl border text-center text-xl font-semibold outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 dark:bg-gray-900 dark:text-gray-100 ${
              error ? "border-red-400" : "border-gray-300 dark:border-gray-700"
            }`}
          />
        ))}
      </div>
      {error && <p className="mt-2 text-center text-xs text-red-500">{error}</p>}
    </div>
  );
}
