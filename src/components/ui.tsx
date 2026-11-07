import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const btn = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  secondary: "bg-surface border border-border text-text hover:bg-surface-2",
  danger: "bg-surface border border-danger/40 text-danger hover:bg-danger-bg",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
};
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 h-9 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: keyof typeof btn }) {
  return <button className={cx(btnBase, btn[variant], className)} {...p} />;
}

export function ButtonLink({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: keyof typeof btn }) {
  return <Link className={cx(btnBase, btn[variant], className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-border bg-surface", className)} {...p} />;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const badge = {
  neutral: "bg-surface-2 text-muted",
  work: "bg-work-bg text-work",
  personal: "bg-personal-bg text-personal",
  danger: "bg-danger-bg text-danger",
  warn: "bg-warn-bg text-warn",
  ok: "bg-ok-bg text-ok",
  primary: "bg-primary/10 text-primary",
};
export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof badge; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", badge[tone], className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-muted">{children}</p>;
}

export const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 h-10 text-[15px] text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 aria-[invalid=true]:border-danger";

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm text-danger" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "warn" | "ok"; children: ReactNode }) {
  const cls = { danger: "bg-danger-bg text-danger border-danger/30", warn: "bg-warn-bg text-warn border-warn/30", ok: "bg-ok-bg text-ok border-ok/30" }[tone];
  return (
    <div className={cx("rounded-lg border px-4 py-3 text-sm", cls)} role={tone === "danger" ? "alert" : "status"}>
      {children}
    </div>
  );
}
