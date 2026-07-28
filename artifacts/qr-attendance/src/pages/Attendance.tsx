import { useMemo, useState } from "react";
import { useListAttendance, getListAttendanceQueryKey, customFetch } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { BackButton } from "@/components/BackButton";
import { Download, Filter, Trash2, AlertTriangle, XCircle } from "lucide-react";

function StatusBadge({ status, exitOver }: { status: string; exitOver?: boolean }) {
  if (exitOver) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-950/60 text-red-400 border border-red-900/40">
        <XCircle className="w-3 h-3 text-red-400" />
        Not Scanned
      </span>
    );
  }
  const map: Record<string, string> = {
    inside: "bg-green-900/40 text-green-400",
    left: "bg-slate-700 text-slate-300",
    present: "bg-blue-900/40 text-blue-400",
  };
  const labels: Record<string, string> = { inside: "Inside", left: "Left", present: "Present" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-slate-700 text-slate-300"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function formatDuration(mins: number | null | undefined) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isExitTimeOver(logDate: string | null | undefined, exitTime: string | null | undefined) {
  if (exitTime) return false;
  if (!logDate) return false;

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    
    const parts = formatter.formatToParts(new Date());
    const getPart = (type: string) => parts.find((part) => part.type === type)?.value || "";
    
    const year = getPart("year");
    const month = getPart("month");
    const day = getPart("day");
    const hour = parseInt(getPart("hour"), 10);
    const minute = parseInt(getPart("minute"), 10);
    
    const todayStr = `${year}-${month}-${day}`;
    
    if (logDate < todayStr) {
      return true;
    }
    if (logDate === todayStr) {
      return hour > 16 || (hour === 16 && minute >= 30);
    }
  } catch (e) {
    console.error(e);
  }
  return false;
}

export default function Attendance() {
  const today = new Date().toISOString().split("T")[0];
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [role, setRole] = useState<"" | "student" | "staff">("");
  const [applied, setApplied] = useState({ from: today, to: today, role: "" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const queryClient = useQueryClient();
  const queryKey = getListAttendanceQueryKey({ from: applied.from, to: applied.to, ...(applied.role ? { role: applied.role as any } : {}) });

  const { data: records = [], isLoading } = useListAttendance(
    { from: applied.from, to: applied.to, ...(applied.role ? { role: applied.role as any } : {}) },
    { query: { queryKey } }
  );

  const allIds = useMemo(() => records.map((r: any) => r.id as number), [records]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return customFetch<{ deletedCount: number }>("/api/attendance/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: () => {
      setSelected(new Set());
      setConfirmOpen(false);
      setErrorMsg("");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries();
    },
    onError: (err: any) => {
      setErrorMsg(err?.data?.error ?? err?.message ?? "Failed to delete records");
    },
  });

  const handleConfirmDelete = () => {
    if (selected.size === 0) return;
    setErrorMsg("");
    deleteMutation.mutate(Array.from(selected));
  };

  const applyFilters = () => {
    setApplied({ from, to, role });
    setSelected(new Set());
  };

  const exportCsv = () => {
    const headers = ["Name", "ID", "Role", "Date", "Entry", "Exit", "Duration", "Status"];
    const rows = records.map((r: any) => [
      r.user?.name ?? "",
      r.user?.uniqueId ?? "",
      r.user?.role ?? "",
      r.date,
      formatTime(r.entryTime),
      formatTime(r.exitTime),
      formatDuration(r.durationMinutes),
      r.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${applied.from}-to-${applied.to}.csv`;
    a.click();
  };

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <BackButton />
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Attendance Records</h1>
            <p className="text-sm text-slate-400 mt-1">{records.length} records found</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="delete-selected"
              onClick={() => setConfirmOpen(true)}
              disabled={selected.size === 0 || deleteMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
            <button
              data-testid="export-csv"
              onClick={exportCsv}
              disabled={!records.length}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-300">Filters</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">From date</label>
              <input
                data-testid="filter-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">To date</label>
              <input
                data-testid="filter-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Role</label>
              <select
                data-testid="filter-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "" | "student" | "staff")}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">All roles</option>
                <option value="student">Students</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                data-testid="apply-filters"
                onClick={applyFilters}
                className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table data-testid="attendance-table" className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-5 py-3 w-10">
                    <input
                      type="checkbox"
                      data-testid="select-all"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={!records.length}
                      className="h-4 w-4 rounded bg-slate-800 border-slate-600 accent-blue-500"
                    />
                  </th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">ID</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Entry</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Exit</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Duration</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(9)].map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-4 bg-slate-800 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !records.length ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">
                      No records found for this period
                    </td>
                  </tr>
                ) : (
                  records.map((rec: any) => (
                    <tr
                      key={rec.id}
                      className={`hover:bg-slate-800/40 transition-colors ${selected.has(rec.id) ? "bg-blue-950/30" : ""}`}
                    >
                      <td className="px-5 py-3">
                        <input
                          type="checkbox"
                          data-testid={`select-row-${rec.id}`}
                          checked={selected.has(rec.id)}
                          onChange={() => toggleOne(rec.id)}
                          className="h-4 w-4 rounded bg-slate-800 border-slate-600 accent-blue-500"
                        />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
                            {rec.user?.name?.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-white">{rec.user?.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-sm text-slate-400">{rec.user?.uniqueId}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rec.user?.role === "student" ? "bg-blue-900/40 text-blue-400" : "bg-purple-900/40 text-purple-400"}`}>
                          {rec.user?.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-300">{rec.date}</td>
                      <td className="px-5 py-3 text-sm text-slate-300">{formatTime(rec.entryTime)}</td>
                      <td className="px-5 py-3 text-sm text-slate-300">
                        {isExitTimeOver(rec.date, rec.exitTime) ? (
                          <span className="inline-flex items-center gap-1 text-red-400 font-semibold text-xs">
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                            Not Scanned
                          </span>
                        ) : (
                          formatTime(rec.exitTime)
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-300">{formatDuration(rec.durationMinutes)}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={rec.status} exitOver={isExitTimeOver(rec.date, rec.exitTime)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Confirm delete modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !deleteMutation.isPending && setConfirmOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Delete attendance records?</h3>
                <p className="text-sm text-slate-400 mt-1">
                  This will permanently remove <span className="font-bold text-white">{selected.size}</span> record{selected.size === 1 ? "" : "s"}. This action cannot be undone.
                </p>
              </div>
            </div>
            {errorMsg && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
                {errorMsg}
              </div>
            )}
            <div className="flex gap-3 justify-end mt-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-delete"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {deleteMutation.isPending ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
