import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { BackButton } from "@/components/BackButton";
import { customFetch } from "@workspace/api-client-react";
import {
  GraduationCap,
  Plus,
  X,
  Loader2,
  UserCheck,
  Clock,
  Calendar,
  List,
  Trash2,
} from "lucide-react";

type Mentor = { id: number; name: string; email: string };
type User = {
  id: number;
  name: string;
  uniqueId: string;
  role: "student" | "staff";
  mentorId: number | null;
};

type Schedule = {
  id: number;
  mentor_id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
  section: string;
  subject: string;
  year: string;
  qr_mentors?: { name: string; email: string };
};

type TrackingSession = {
  id: number;
  date: string;
  startedAt: string;
  endedAt: string | null;
  studentCount: number;
  schedule: {
    day: string;
    startTime: string;
    endTime: string;
    section: string;
    subject: string;
  } | null;
};

type MentorTracking = {
  id: number;
  name: string;
  email: string;
  sessions: TrackingSession[];
};

export default function Mentors() {
  const [activeTab, setActiveTab] = useState<"mentors" | "tracking" | "schedules">("mentors");
  
  // Data for Mentors tab
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  // Data for Tracking tab
  const [trackingData, setTrackingData] = useState<MentorTracking[]>([]);
  const [selectedMentorTracking, setSelectedMentorTracking] = useState<MentorTracking | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Data for Schedules tab
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    mentorId: "",
    dayOfWeek: "MON",
    startTime: "09:00:00",
    endTime: "10:00:00",
    section: "A",
    subject: "",
    year: "II"
  });

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, s] = await Promise.all([
        customFetch<Mentor[]>("/api/mentors"),
        customFetch<User[]>("/api/users?role=student"),
      ]);
      setMentors(m);
      setStudents(s);
    } catch (err: any) {
      setError(err?.data?.error ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const loadTracking = async () => {
    setTrackingLoading(true);
    setError(null);
    try {
      const data = await customFetch<MentorTracking[]>("/api/admin/mentors-tracking");
      setTrackingData(data);
      if (selectedMentorTracking) {
        const updatedSelected = data.find(m => m.id === selectedMentorTracking.id);
        if (updatedSelected) setSelectedMentorTracking(updatedSelected);
      }
    } catch (err: any) {
      setError(err?.data?.error ?? "Failed to load tracking log");
    } finally {
      setTrackingLoading(false);
    }
  };

  const loadSchedules = async () => {
    setSchedulesLoading(true);
    setError(null);
    try {
      const data = await customFetch<Schedule[]>("/api/admin/schedules");
      setSchedules(data);
    } catch (err: any) {
      setError(err?.data?.error ?? "Failed to load schedules");
    } finally {
      setSchedulesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "mentors") {
      reload();
    } else if (activeTab === "tracking") {
      loadTracking();
    } else if (activeTab === "schedules") {
      loadSchedules();
      reload(); // load mentors list for schedule form dropdown
    }
  }, [activeTab]);

  const createMentor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await customFetch("/api/mentors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ name: "", email: "", password: "" });
      setShowForm(false);
      reload();
    } catch (err: any) {
      setError(err?.data?.error ?? "Failed to create mentor");
    } finally {
      setSubmitting(false);
    }
  };

  const assignMentor = async (userId: number, mentorId: number | null) => {
    try {
      await customFetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mentorId }),
      });
      setStudents((prev) =>
        prev.map((s) => (s.id === userId ? { ...s, mentorId } : s))
      );
    } catch (err: any) {
      setError(err?.data?.error ?? "Failed to assign");
    }
  };

  const createSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await customFetch("/api/admin/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mentorId: parseInt(scheduleForm.mentorId),
          dayOfWeek: scheduleForm.dayOfWeek,
          startTime: scheduleForm.startTime,
          endTime: scheduleForm.endTime,
          section: scheduleForm.section,
          subject: scheduleForm.subject,
          year: scheduleForm.year
        })
      });
      setShowScheduleForm(false);
      setScheduleForm(p => ({ ...p, subject: "" }));
      loadSchedules();
    } catch (err: any) {
      setError(err?.data?.error ?? "Failed to create schedule");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteSchedule = async (id: number) => {
    if (!confirm("Are you sure you want to delete this schedule?")) return;
    try {
      await customFetch(`/api/admin/schedules/${id}`, {
        method: "DELETE"
      });
      loadSchedules();
    } catch (err: any) {
      setError(err?.data?.error ?? "Failed to delete schedule");
    }
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto text-slate-350">
        <BackButton />
        
        {/* Title */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Mentors Panel</h1>
            <p className="text-sm text-slate-400 mt-1">Manage mentors, timetables, and view active scanning logs</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 mb-6 gap-2">
          <button
            onClick={() => setActiveTab("mentors")}
            className={`px-4 py-2 border-b-2 font-semibold text-sm transition-all ${
              activeTab === "mentors"
                ? "border-purple-500 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            Mentors & Assignments
          </button>
          <button
            onClick={() => setActiveTab("schedules")}
            className={`px-4 py-2 border-b-2 font-semibold text-sm transition-all ${
              activeTab === "schedules"
                ? "border-purple-500 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            Timetable Schedules
          </button>
          <button
            onClick={() => setActiveTab("tracking")}
            className={`px-4 py-2 border-b-2 font-semibold text-sm transition-all ${
              activeTab === "tracking"
                ? "border-purple-500 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            Mentor Scan Logs
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* 1. MENTORS TAB */}
        {activeTab === "mentors" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                data-testid="add-mentor-button"
                onClick={() => setShowForm((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold"
              >
                <Plus className="w-4 h-4" /> Add Mentor
              </button>
            </div>

            {showForm && (
              <form
                onSubmit={createMentor}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6 grid sm:grid-cols-3 gap-3"
              >
                <input
                  data-testid="mentor-name"
                  required
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-purple-500"
                />
                <input
                  data-testid="mentor-email"
                  required
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-purple-500"
                />
                <input
                  data-testid="mentor-password"
                  required
                  type="password"
                  minLength={4}
                  placeholder="Password (min 4 chars)"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-purple-500"
                />
                <div className="sm:col-span-3 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-3 py-2 rounded-lg bg-slate-700 text-white text-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    data-testid="create-mentor-submit"
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white text-sm font-semibold"
                  >
                    {submitting ? "Creating…" : "Create mentor"}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="py-20 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
              </div>
            ) : (
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-purple-400" />
                    <h2 className="text-sm font-semibold text-white">Mentors ({mentors.length})</h2>
                  </div>
                  <div className="divide-y divide-slate-800">
                    {mentors.length === 0 ? (
                      <div className="p-6 text-center text-sm text-slate-500">No mentors yet</div>
                    ) : (
                      mentors.map((m) => {
                        const count = students.filter((s) => s.mentorId === m.id).length;
                        return (
                          <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-purple-900/40 text-purple-300 flex items-center justify-center text-sm font-bold">
                              {m.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{m.name}</p>
                              <p className="text-xs text-slate-400 truncate">{m.email}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-slate-850 text-slate-300 text-xs border border-slate-800">
                              {count} {count === 1 ? "student" : "students"}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-400" />
                    <h2 className="text-sm font-semibold text-white">Assign students</h2>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-800">
                    {students.length === 0 ? (
                      <div className="p-6 text-center text-sm text-slate-500">No students</div>
                    ) : (
                      students.map((s) => (
                        <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{s.name}</p>
                            <p className="text-xs text-slate-400 truncate">{s.uniqueId}</p>
                          </div>
                          <select
                            data-testid={`assign-mentor-${s.id}`}
                            value={s.mentorId ?? ""}
                            onChange={(e) =>
                              assignMentor(
                                s.id,
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                            className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-purple-500"
                          >
                            <option value="">— None —</option>
                            {mentors.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* 2. SCHEDULES TAB */}
        {activeTab === "schedules" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowScheduleForm((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold"
              >
                <Plus className="w-4 h-4" /> Add Class Schedule
              </button>
            </div>

            {showScheduleForm && (
              <form
                onSubmit={createSchedule}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6 grid sm:grid-cols-3 gap-3"
              >
                {/* Mentor Dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Mentor / Teacher</label>
                  <select
                    required
                    value={scheduleForm.mentorId}
                    onChange={(e) => setScheduleForm(p => ({ ...p, mentorId: e.target.value }))}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="">— Select Mentor —</option>
                    {mentors.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                {/* Day of Week */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Day of Week</label>
                  <select
                    value={scheduleForm.dayOfWeek}
                    onChange={(e) => setScheduleForm(p => ({ ...p, dayOfWeek: e.target.value }))}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="MON">Monday</option>
                    <option value="TUE">Tuesday</option>
                    <option value="WED">Wednesday</option>
                    <option value="THUR">Thursday</option>
                    <option value="FRI">Friday</option>
                    <option value="SAT">Saturday</option>
                  </select>
                </div>

                {/* Subject name */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Subject Name</label>
                  <input
                    required
                    placeholder="e.g. OOP THROUGH JAVA"
                    value={scheduleForm.subject}
                    onChange={(e) => setScheduleForm(p => ({ ...p, subject: e.target.value }))}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* Start Time */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Start Time</label>
                  <input
                    type="time"
                    required
                    value={scheduleForm.startTime.slice(0,5)}
                    onChange={(e) => setScheduleForm(p => ({ ...p, startTime: e.target.value + ":00" }))}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* End Time */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">End Time</label>
                  <input
                    type="time"
                    required
                    value={scheduleForm.endTime.slice(0,5)}
                    onChange={(e) => setScheduleForm(p => ({ ...p, endTime: e.target.value + ":00" }))}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* Section & Year */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400">Section & Year</label>
                  <div className="flex gap-2">
                    <select
                      value={scheduleForm.year}
                      onChange={(e) => setScheduleForm(p => ({ ...p, year: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-purple-500"
                    >
                      <option value="II">II Yr</option>
                      <option value="III">III Yr</option>
                      <option value="IV">IV Yr</option>
                    </select>
                    <input
                      required
                      placeholder="Sec"
                      value={scheduleForm.section}
                      onChange={(e) => setScheduleForm(p => ({ ...p, section: e.target.value.toUpperCase() }))}
                      className="w-20 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-purple-500 text-center"
                    />
                  </div>
                </div>

                <div className="sm:col-span-3 flex gap-2 justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => setShowScheduleForm(false)}
                    className="px-3 py-2 rounded-lg bg-slate-750 text-white text-sm border border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white text-sm font-semibold"
                  >
                    {submitting ? "Saving…" : "Save Schedule"}
                  </button>
                </div>
              </form>
            )}

            {schedulesLoading ? (
              <div className="py-20 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-semibold text-white">Active Timetable Schedules ({schedules.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs font-bold text-slate-400 bg-slate-950">
                        <th className="px-4 py-2.5">Mentor</th>
                        <th className="px-4 py-2.5">Day</th>
                        <th className="px-4 py-2.5">Time Slot</th>
                        <th className="px-4 py-2.5">Class / Section</th>
                        <th className="px-4 py-2.5">Subject</th>
                        <th className="px-4 py-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-sm">
                      {schedules.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                            No class schedules defined. Click the button to add.
                          </td>
                        </tr>
                      ) : (
                        schedules.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-850/30">
                            <td className="px-4 py-2.5 font-semibold text-slate-200">{s.qr_mentors?.name || "Unknown"}</td>
                            <td className="px-4 py-2.5">{s.day_of_week}</td>
                            <td className="px-4 py-2.5 text-slate-300 font-mono text-xs">{s.start_time.slice(0,5)} - {s.end_time.slice(0,5)}</td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-purple-300 text-xs font-semibold border border-slate-750">
                                {s.year} Yr - {s.section}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-400 max-w-[200px] truncate" title={s.subject}>{s.subject || "—"}</td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => deleteSchedule(s.id)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/30 text-slate-400 hover:text-red-500 border border-slate-750 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* 3. TRACKING TAB */}
        {activeTab === "tracking" && (
          <div className="grid md:grid-cols-3 gap-5">
            {/* Mentor List Selection */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm h-fit">
              <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
                <List className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-semibold text-white">Mentors ({trackingData.length})</h2>
              </div>
              {trackingLoading && trackingData.length === 0 ? (
                <div className="p-10 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                </div>
              ) : (
                <div className="divide-y divide-slate-800 max-h-[70vh] overflow-y-auto">
                  {trackingData.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500">No mentors found</div>
                  ) : (
                    trackingData.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMentorTracking(m)}
                        className={`px-4 py-3 cursor-pointer transition-colors ${
                          selectedMentorTracking?.id === m.id
                            ? "bg-purple-950/20 text-white border-l-4 border-purple-500"
                            : "hover:bg-slate-850/40"
                        }`}
                      >
                        <p className="text-sm font-bold text-slate-200">{m.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{m.email}</p>
                        <p className="text-[10px] text-slate-450 mt-1">
                          Scanned sessions: <span className="font-semibold text-slate-350">{m.sessions.length}</span>
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Mentor Scan History Logs */}
            <div className="md:col-span-2 bg-slate-900 border border-slate-880 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2 bg-slate-950">
                <Clock className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-semibold text-white">
                  {selectedMentorTracking
                    ? `${selectedMentorTracking.name}'s Scanning Logs`
                    : "Select a Mentor to view logs"}
                </h2>
              </div>

              {!selectedMentorTracking ? (
                <div className="p-20 text-center text-sm text-slate-500 font-medium">
                  Select a mentor from the sidebar list to inspect their hourly start/end scanning sessions.
                </div>
              ) : (
                <div className="overflow-x-auto divide-y divide-slate-850">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs font-bold text-slate-400 bg-slate-950/60">
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Subject & Class</th>
                        <th className="px-4 py-2.5">Start Scan</th>
                        <th className="px-4 py-2.5">End Scan</th>
                        <th className="px-4 py-2.5 text-center">Students</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-sm">
                      {selectedMentorTracking.sessions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            No recorded scan sessions for this mentor today.
                          </td>
                        </tr>
                      ) : (
                        selectedMentorTracking.sessions.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-850/20">
                            <td className="px-4 py-2.5 font-medium text-slate-200">{s.date}</td>
                            <td className="px-4 py-2.5">
                              {s.schedule ? (
                                <div className="text-xs">
                                  <p className="font-bold text-slate-200">{s.schedule.subject}</p>
                                  <p className="text-slate-400 mt-0.5">Section: {s.schedule.section} · {s.schedule.day}</p>
                                </div>
                              ) : (
                                <span className="text-slate-500">Deleted Slot</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-350">{formatDateTime(s.startedAt)}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-350">{formatDateTime(s.endedAt)}</td>
                            <td className="px-4 py-2.5 text-center font-bold text-green-500">{s.studentCount}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
