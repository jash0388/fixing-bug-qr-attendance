import { useGetDashboardStats, useGetCurrentlyInside } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Users, UserCheck, Clock, TrendingUp, ArrowRight, Circle } from "lucide-react";
import { Link } from "wouter";

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
          <p data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`} className="text-3xl font-bold text-white mt-2">
            {value}
          </p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "inside") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 text-xs font-medium">
        <Circle className="w-2 h-2 fill-current" />
        In Campus
      </span>
    );
  }
  if (status === "left") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 text-xs font-medium">
        <Circle className="w-2 h-2 fill-current" />
        Left Campus
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-400 text-xs font-medium">
      <Circle className="w-2 h-2 fill-current" />
      Present
    </span>
  );
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export default function Dashboard() {
  const stats = useGetDashboardStats({ query: { refetchInterval: 5000 } as any });
  const inside = useGetCurrentlyInside({ query: { refetchInterval: 5000 } as any });

  const data = stats.data;
  const insideList = inside.data ?? [];

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Stats */}
        {stats.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-2/3 mb-3" />
                <div className="h-8 bg-slate-700 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Total Users"
              value={data?.totalUsers ?? 0}
              icon={Users}
              color="bg-blue-900/40 text-blue-400"
              sub={`${data?.totalStudents ?? 0} students, ${data?.totalStaff ?? 0} staff`}
            />
            <StatCard
              label="Today's Check-ins"
              value={data?.todayAttendanceCount ?? 0}
              icon={UserCheck}
              color="bg-emerald-900/40 text-emerald-400"
              sub="Records today"
            />
            <StatCard
              label="Still on Campus"
              value={data?.currentlyInsideCount ?? 0}
              icon={Clock}
              color="bg-orange-900/40 text-orange-400"
              sub="In college campus now"
            />
            <StatCard
              label="Students"
              value={data?.totalStudents ?? 0}
              icon={TrendingUp}
              color="bg-purple-900/40 text-purple-400"
              sub={`${data?.totalStaff ?? 0} staff members`}
            />
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
              <Link href="/attendance">
                <span className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer">
                  View all <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            </div>
            <div data-testid="recent-activity-table" className="divide-y divide-slate-800">
              {stats.isLoading ? (
                [...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-slate-700" />
                    <div className="flex-1">
                      <div className="h-3 bg-slate-700 rounded w-1/2 mb-2" />
                      <div className="h-2 bg-slate-800 rounded w-1/3" />
                    </div>
                  </div>
                ))
              ) : !data?.recentActivity?.length ? (
                <div className="px-5 py-8 text-center text-sm text-slate-500">No activity today yet</div>
              ) : (
                data.recentActivity.map((rec) => (
                  <div key={rec.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
                      {rec.user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{rec.user?.name}</p>
                      <p className="text-xs text-slate-400">
                        {rec.user?.role === "student" ? "Student" : "Staff"} · {rec.user?.uniqueId}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={rec.status} />
                      <span className="text-xs text-slate-500">{formatTime(rec.entryTime)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Currently Inside */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <h2 className="text-sm font-semibold text-white">Currently On Campus</h2>
              </div>
              <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full">
                {insideList.length} inside
              </span>
            </div>
            <div data-testid="currently-inside-list" className="divide-y divide-slate-800">
              {inside.isLoading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-slate-700" />
                    <div className="flex-1">
                      <div className="h-3 bg-slate-700 rounded w-1/2 mb-2" />
                      <div className="h-2 bg-slate-800 rounded w-1/3" />
                    </div>
                  </div>
                ))
              ) : !insideList.length ? (
                <div className="px-5 py-8 text-center text-sm text-slate-500">No one currently on campus</div>
              ) : (
                insideList.map((rec) => (
                  <div key={rec.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-full bg-green-900/40 flex items-center justify-center text-xs font-bold text-green-400 flex-shrink-0">
                      {rec.user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{rec.user?.name}</p>
                      <p className="text-xs text-slate-400">{rec.user?.role} · Entered {formatTime(rec.entryTime)}</p>
                    </div>
                    <Link href={`/history/${rec.userId}`}>
                      <span className="text-xs text-slate-500 hover:text-blue-400 cursor-pointer">
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
