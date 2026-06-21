import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Buttons ──────────────────────────────────────────────────────────────
type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANT: Record<Variant, string> = {
  primary: "bg-green-600 text-white shadow-sm hover:bg-green-700 active:bg-green-800",
  secondary: "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:text-slate-900",
  danger: "bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
};

export function buttonClass(variant: Variant = "primary", extra?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
    VARIANT[variant],
    extra,
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

// ─── Form controls ──────────────────────────────────────────────────────────
const fieldBase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/30";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-20", className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, className)} {...props} />;
}

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

// ─── Surfaces ─────────────────────────────────────────────────────────────
export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

/** Card with an optional header row (title + action). Body padded unless `flush`. */
export function Section({
  title,
  description,
  action,
  children,
  flush,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </Card>
  );
}

/** Collapsible card — native <details>, no client JS. Header shows title (+count).
 *  Keep interactive controls OUT of the header (clicks there toggle the panel). */
export function Collapsible({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details {...(defaultOpen ? { open: true } : {})} className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-slate-900">
          {title}
          {count != null ? ` (${count})` : ""}
        </h2>
        <span className="text-xs text-slate-400 transition-transform group-open:rotate-180">▼</span>
      </summary>
      <div className="border-t border-slate-100">{children}</div>
    </details>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <div className="mt-1 text-sm text-slate-500">{description}</div>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

const STAT_ACCENT: Record<string, string> = {
  slate: "text-slate-900",
  green: "text-green-600",
  red: "text-red-600",
  amber: "text-amber-600",
  blue: "text-blue-600",
};

export function StatCard({
  label,
  value,
  sub,
  tone = "slate",
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: keyof typeof STAT_ACCENT;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <div className={cn("mt-2 whitespace-nowrap text-2xl font-bold leading-tight tabular-nums sm:text-3xl", STAT_ACCENT[tone])}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </Card>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────
export function initials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// Deterministic tint per name so the same person keeps the same colour. Photo
// support is built in (pass `src`) for when we add student/parent photos.
const AVATAR_TINTS = [
  "bg-green-100 text-green-700", "bg-blue-100 text-blue-700", "bg-amber-100 text-amber-700",
  "bg-purple-100 text-purple-700", "bg-pink-100 text-pink-700", "bg-teal-100 text-teal-700",
  "bg-rose-100 text-rose-700", "bg-indigo-100 text-indigo-700",
];
function tintFor(name: string): string {
  let h = 0;
  for (let i = 0; i < (name ?? "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} style={style} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span
      style={{ ...style, fontSize: Math.round(size * 0.4) }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none", tintFor(name), className)}
    >
      {initials(name)}
    </span>
  );
}

// ─── ProgressRing ───────────────────────────────────────────────────────────
// Real SVG ring (replaces the old number-only / flat-bar score displays).
export function ProgressRing({
  value,
  size = 96,
  stroke = 10,
  caption,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  caption?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("shrink-0", className)} role="img" aria-label={`${Math.round(pct)}${caption ? " " + caption : ""}`}>
      <circle cx={mid} cy={mid} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200" />
      <circle
        cx={mid} cy={mid} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
        className="stroke-green-600" strokeDasharray={c} strokeDashoffset={offset}
        transform={`rotate(-90 ${mid} ${mid})`}
      />
      <text x={mid} y={caption ? mid - size * 0.04 : mid} textAnchor="middle" dominantBaseline="central" className="fill-slate-900 font-bold" style={{ fontSize: Math.round(size * 0.28) }}>
        {Math.round(pct)}
      </text>
      {caption && (
        <text x={mid} y={mid + size * 0.18} textAnchor="middle" dominantBaseline="central" className="fill-slate-400" style={{ fontSize: Math.round(size * 0.12) }}>
          {caption}
        </text>
      )}
    </svg>
  );
}

// Tinted icon-chip backgrounds for action cards / nav (full literals so Tailwind
// JIT keeps them). Pair a lucide icon on top: <Icon className="h-5 w-5" />.
export const ICON_TINT: Record<string, string> = {
  green: "bg-green-50 text-green-600",
  emerald: "bg-emerald-50 text-emerald-600",
  teal: "bg-teal-50 text-teal-600",
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  purple: "bg-purple-50 text-purple-600",
  rose: "bg-rose-50 text-rose-600",
};

// ─── Badge ────────────────────────────────────────────────────────────────
const TONE: Record<string, string> = {
  green: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20",
  red: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
  yellow: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  slate: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20",
};

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: keyof typeof TONE;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize", TONE[tone])}>
      {children}
    </span>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="rtable-wrap overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="rtable w-full text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cn("border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500", className)}>
      {children}
    </th>
  );
}
export function Td({
  children,
  className,
  title,
  label,
}: {
  children?: ReactNode;
  className?: string;
  title?: string;
  /** Shown as a "label:" prefix when the row stacks into a card on mobile. */
  label?: string;
}) {
  return (
    <td data-label={label} title={title} className={cn("border-b border-slate-100 px-4 py-3 text-slate-700", className)}>
      {children}
    </td>
  );
}
