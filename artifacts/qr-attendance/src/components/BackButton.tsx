import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export function BackButton({ to = "/dashboard", label = "Back" }: { to?: string; label?: string }) {
  return (
    <Link href={to}>
      <button
        data-testid="back-button"
        className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium transition-colors border border-slate-700"
      >
        <ArrowLeft className="w-4 h-4" />
        {label}
      </button>
    </Link>
  );
}
