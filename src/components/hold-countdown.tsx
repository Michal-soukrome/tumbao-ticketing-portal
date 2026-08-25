import { useEffect, useState } from "react";

export function HoldCountdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired?: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );

  useEffect(() => {
    let called = false;
    const update = () => {
      const next = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(next);
      if (next === 0 && !called) {
        called = true;
        onExpired?.();
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, onExpired]);

  const seconds = Math.ceil(remaining / 1000);
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = String(seconds % 60).padStart(2, "0");
  return (
    <span
      className={
        remaining < 60_000 ? "countdown countdown-urgent" : "countdown"
      }
    >
      Hold {minutesPart}:{secondsPart}
    </span>
  );
}
