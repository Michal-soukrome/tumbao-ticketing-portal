import { useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "../app/runtime-context";
import { Button } from "./ui";

// NOTE: same caveat as the other files — `Button` comes from "./ui" and
// I'm assuming it forwards `className` onto its root element.

export function TestModeBanner() {
  const { testMode, testControls } = useRuntime();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!testMode || !testControls) return null;

  const reset = async () => {
    setBusy(true);
    await testControls.reset();
    sessionStorage.clear();
    await queryClient.invalidateQueries();
    setBusy(false);
  };

  return (
    <aside className="flex items-center justify-between gap-4 bg-amber-100 px-6 py-2 text-sm text-amber-900">
      <span className="flex items-center gap-2 font-medium">
        <FlaskConical size={16} /> Local test mode · no external connections
      </span>
      <Button
        className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={reset}
        disabled={busy}
      >
        <RotateCcw size={15} /> Reset demo data
      </Button>
    </aside>
  );
}
