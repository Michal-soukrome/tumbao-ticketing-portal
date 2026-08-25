import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import {
  Camera,
  CheckCircle2,
  Search,
  StopCircle,
  XCircle,
} from "lucide-react";
import { useRuntime } from "../app/runtime-context";
import type { CheckinResult } from "../domain/models";
import { Button, Card, Input, Notice } from "../components/ui";

// NOTE: same caveat as the other pages — `Button`, `Card`, `Input`, and
// `Notice` come from "../components/ui" and I'm assuming they forward
// `className` (and `tone`, for Notice) onto their root element.

export function ScannerPage() {
  const { service, testMode } = useRuntime();
  const [code, setCode] = useState(testMode ? "TUM-DEMO-001" : "");
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const validate = async (value = code) => {
    if (!value.trim()) return;
    const next = await service.checkinTicket(value);
    setResult(next);
    if (next.result === "CHECKED_IN") setCode("");
  };

  const startCamera = async () => {
    if (!videoRef.current) return;
    setScanning(true);
    const reader = new BrowserQRCodeReader();
    controlsRef.current = await reader.decodeFromVideoDevice(
      undefined,
      videoRef.current,
      (scanResult) => {
        if (scanResult) {
          controlsRef.current?.stop();
          setScanning(false);
          void validate(scanResult.getText());
        }
      },
    );
  };

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  };
  useEffect(() => stopCamera, []);

  const tone =
    result?.result === "CHECKED_IN"
      ? "success"
      : result?.result === "ALREADY_USED"
        ? "warning"
        : "danger";

  const noticeClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
            Personál u vstupu
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Kontrola vstupenek
          </h1>
        </div>
        <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <video
            ref={videoRef}
            className={
              scanning
                ? "aspect-video w-full rounded-xl bg-slate-900 object-cover"
                : "aspect-video w-full rounded-xl bg-slate-900 object-cover opacity-40"
            }
            muted
            playsInline
          />
          <div className="mt-4">
            <Button
              className={
                scanning
                  ? "flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  : "flex w-full items-center justify-center gap-2 rounded-full bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600"
              }
              onClick={scanning ? stopCamera : startCamera}
            >
              {scanning ? <StopCircle size={18} /> : <Camera size={18} />}
              {scanning ? "Vypnout kameru" : "Skenovat QR kód kamerou"}
            </Button>
          </div>
          <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            <span>nebo zadejte kód vstupenky</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void validate();
            }}
            className="flex items-center gap-2"
          >
            <Input
              className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="TUM-00001-1 or QR token"
              autoCapitalize="off"
            />
            <Button
              className="flex shrink-0 items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              type="submit"
            >
              <Search size={18} /> Ověřit
            </Button>
          </form>
        </Card>
        {result ? (
          <Notice className={`rounded-xl border px-4 py-3 ${noticeClass}`}>
            <div className="flex items-start gap-3">
              {result.result === "CHECKED_IN" ? (
                <CheckCircle2 size={32} className="shrink-0" />
              ) : (
                <XCircle size={32} className="shrink-0" />
              )}
              <div className="flex flex-col">
                <strong className="text-sm font-semibold uppercase tracking-wide">
                  {result.result.replace("_", " ")}
                </strong>
                {"ticket" in result ? (
                  <span className="mt-1 text-sm">
                    {result.ticket.ticketCode} · Sekce{" "}
                    {result.ticket.seat.section}, řada{" "}
                    {result.ticket.seat.rowLabel}, sedadlo{" "}
                    {result.ticket.seat.seatNumber}
                    {result.ticket.checkedInAt
                      ? ` · ${new Date(result.ticket.checkedInAt).toLocaleTimeString()}`
                      : ""}
                  </span>
                ) : (
                  <span className="mt-1 text-sm">
                    Vstupenka nenalezena nebo je neplatná. Zkontrolujte kód a
                    zkuste to znovu.
                  </span>
                )}
              </div>
            </div>
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
