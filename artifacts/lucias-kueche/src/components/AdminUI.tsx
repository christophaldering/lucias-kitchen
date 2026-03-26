import { type ReactNode } from "react";

export function AdminNeedBox({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#4A7C59]/10 border border-[#4A7C59]/20 rounded-2xl p-5 mb-6">
      <div className="text-base font-semibold text-[#2d5c3e] leading-snug">{children}</div>
    </div>
  );
}

export function AdminActionCard({
  title,
  description,
  children,
  variant,
}: {
  title: ReactNode;
  description: string;
  children?: ReactNode;
  variant?: "default" | "danger";
}) {
  const borderClass =
    variant === "danger"
      ? "border-red-200"
      : "border-border";

  return (
    <div className={`bg-white rounded-2xl border ${borderClass} shadow-sm p-6`}>
      <h3 className={`font-serif font-semibold text-lg mb-1 ${variant === "danger" ? "text-red-700" : ""}`}>
        {title}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      {children}
    </div>
  );
}
