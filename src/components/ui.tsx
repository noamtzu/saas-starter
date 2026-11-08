import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  secondary: "border border-line bg-surface text-ink hover:bg-paper",
  ghost: "text-muted hover:bg-line/50 hover:text-ink",
  danger: "text-danger hover:bg-danger-soft",
};

export function buttonClass(variant: Variant = "primary", className?: string): string {
  return cx(buttonBase, buttonVariants[variant], className);
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cx(
        "rounded-md border border-line bg-surface px-2.5 py-2 text-sm focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cx("mb-1.5 block text-sm font-medium", className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section className={cx("rounded-lg border border-line bg-surface", className)} {...props} />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "accent" | "warn" | "danger";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-line/60 text-ink",
  accent: "bg-accent-soft text-accent-strong",
  warn: "bg-warn-soft text-[#7a5a12]",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
    </header>
  );
}

export function FormMessage({ state }: { state: { error?: string; message?: string } }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="text-sm text-accent-strong">
        {state.message}
      </p>
    );
  }
  return null;
}
