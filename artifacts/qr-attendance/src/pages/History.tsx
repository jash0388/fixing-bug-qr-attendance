import { useState } from "react";
import { useParams } from "wouter";
import {
  useSearchUsers,
  useGetUserAttendance,
  getSearchUsersQueryKey,
  getGetUserAttendanceQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { BackButton } from "@/components/BackButton";
import { Search, Download, Calendar, Clock, AlertCircle, XCircle } from "lucide-react";

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

function StatusBadge({ status, exitOver }: { status: string; exitOver?: boolean }) {
  if (exitOver) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-950/60 text-red-400 border border-red-900/40">
        <XCircle className="w-3.5 h-3.5 text-red-400" />
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

function HistoryPanel({ userId }: { userId: number }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});

  const { data, isLoading } = useGetUserAttendance(userId, applied, {
    query: {
      queryKey: getGetUserAttendanceQueryKey(userId, applied),
      enabled: !!userId,
    }
  });

  const exportCsv = () => {
    if (!data) return;
    const headers = ["Date", "Entry", "Exit", "Duration", "Status"];
    const rows = data.records.map((r) => [
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
    a.download = `history-${data.user.name.replace(/\s+/g, "-")}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { user, records, summary } = data;

  return (
    <div>
      {/* User info */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-blue-900/40 flex items-center justify-center text-2xl font-bold text-blue-300 flex-shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{user.name}</h2>
            <p className="text-sm text-slate-400">
              {user.role === "student" ? "Student" : "Staff"} · ID: {user.uniqueId}
            </p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Days Present", value: summary.totalDaysPresent, icon: Calendar, color: "text-blue-400" },
          { label: "Avg Time Spent", value: formatDuration(summary.averageMinutesSpent), icon: Clock, color: "text-emerald-400" },
          { label: "Late Entries", value: summary.lateEntriesCount, icon: AlertCircle, color: "text-orange-400" },
          { label: "Total Records", value: summary.totalDaysChecked, icon: Calendar, color: "text-purple-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <p className="text-xs text-slate-400">{label}</p>
            </div>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Date filter */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-400 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-400 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={() => setApplied({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
            >
              Apply
            </button>
            <button
              onClick={exportCsv}
              disabled={!records.length}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table data-testid="history-table" className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Date</th>
                <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Entry</th>
                <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Exit</th>
                <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Duration</th>
                <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {!records.length ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">
                    No attendance records found
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3 text-sm text-white font-medium">{rec.date}</td>
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
  );
}

export default function History() {
  const params = useParams<{ userId?: string }>();
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(params.userId ? parseInt(params.userId) : null);

  const { data: searchResults = [], isLoading: searching } = useSearchUsers(
    { query: query || " " },
    {
      query: {
        queryKey: getSearchUsersQueryKey({ query: query || " " }),
        enabled: query.length >= 2,
      },
    }
  );

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <BackButton />
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Student History</h1>
          <p className="text-sm text-slate-400 mt-1">Search and view complete attendance history</p>
        </div>

        {/* Search */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              data-testid="history-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or ID..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {query.length >= 2 && (
            <div className="mt-3 border border-slate-700 rounded-lg overflow-hidden">
              {searching ? (
                <div className="px-4 py-3 text-sm text-slate-400">Searching...</div>
              ) : !searchResults.length ? (
                <div className="px-4 py-3 text-sm text-slate-400">No users found</div>
              ) : (
                searchResults.map((user) => (
                  <button
                    data-testid={`search-result-${user.id}`}
                    key={user.id}
                    onClick={() => { setSelectedUserId(user.id); setQuery(""); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/50 text-left border-b border-slate-800 last:border-0 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-300 flex-shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.role} · {user.uniqueId}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* History */}
        {selectedUserId ? (
          <HistoryPanel userId={selectedUserId} />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-slate-500" />
            </div>
            <p className="text-slate-400 text-sm">Search for a student or staff member to view their attendance history</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
