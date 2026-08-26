import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from "react";

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`group rounded-xl border border-slate-200 px-4 py-3 field w-full input ${className}`}
      {...props}
    />
  );
}

export function Card({
  className = "",
  children,
}: PropsWithChildren<{ className?: string }>) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Badge({
  tone = "neutral",
  children,
}: PropsWithChildren<{ tone?: "neutral" | "success" | "warning" | "danger" }>) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Notice({
  tone = "info",
  className = "",
  children,
}: PropsWithChildren<{
  tone?: "info" | "success" | "warning" | "danger";
  className?: string;
}>) {
  return (
    <div className={`notice notice-${tone} ${className}`} role="status">
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}
