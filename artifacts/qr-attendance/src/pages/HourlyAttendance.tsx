import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/contexts/AuthContext";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Calendar,
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  GraduationCap,
  ChevronRight,
  AlertTriangle,
  BookOpen,
  UserPlus,
  Plus,
  UserCheck,
  Edit3
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

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
  status?: "pending" | "started" | "submitted";
  studentCount?: number;
};

type HourlyRecord = {
  id: number;
  studentId: number;
  name: string;
  uniqueId: string;
  markedPresent: boolean;
  scannedGate: boolean;
};

type SubmissionResponse = {
  dates: string[];
  date: string | null;
  records: HourlyRecord[];
};

export default function HourlyAttendance() {
  const { role } = useAuth();
  const [selectedSection, setSelectedSection] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Helper to get current date in Asia/Kolkata (IST)
  const getTodayISTString = () => {
    const now = new Date();
    // Convert to IST offset
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().slice(0, 10);
  };

  const [selectedDateFilter, setSelectedDateFilter] = useState(getTodayISTString());
  
  // Drawer states
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [detailRecords, setDetailRecords] = useState<HourlyRecord[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Fetch mentors list
  const { data: mentors = [] } = useQuery<any[]>({
    queryKey: ["admin-mentors-tracking"],
    queryFn: () => customFetch<any[]>("/api/admin/mentors-tracking"),
  });

  // Assign Faculty Modal States
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [scheduleToAssign, setScheduleToAssign] = useState<Schedule | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState<number | "">("");
  const [assigning, setAssigning] = useState(false);
  const [assignSuccessMsg, setAssignSuccessMsg] = useState("");

  // Create Class Schedule Modal States
  const [newClassModalOpen, setNewClassModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newSection, setNewSection] = useState("A");
  const [newYear, setNewYear] = useState("II");
  const [newDay, setNewDay] = useState("MON");
  const [newStartTime, setNewStartTime] = useState("09:00:00");
  const [newEndTime, setNewEndTime] = useState("10:00:00");
  const [newMentorId, setNewMentorId] = useState<number | "">("");
  const [creatingClass, setCreatingClass] = useState(false);

  // Fetch timetables with status for the selected date
  const { data: schedules = [], isLoading: schedulesLoading, error: schedulesErr } = useQuery<Schedule[]>({
    queryKey: ["admin-schedules-list-status", selectedDateFilter],
    queryFn: () => customFetch<Schedule[]>(`/api/admin/schedules-with-status?date=${selectedDateFilter}`)
  });

  const handleOpenAssignModal = (e: React.MouseEvent, schedule: Schedule) => {
    e.stopPropagation();
    setScheduleToAssign(schedule);
    setSelectedMentorId(schedule.mentor_id || (mentors[0]?.id ?? ""));
    setAssignSuccessMsg("");
    setAssignModalOpen(true);
  };

  const handleConfirmAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleToAssign || !selectedMentorId) return;
    setAssigning(true);
    try {
      await customFetch(`/api/admin/schedules/${scheduleToAssign.id}`, {
        method: "PUT",
        body: JSON.stringify({ mentorId: Number(selectedMentorId) }),
      });
      queryClient.invalidateQueries({ queryKey: ["admin-schedules-list-status"] });
      queryClient.invalidateQueries({ queryKey: ["admin-schedules"] });
      setAssignSuccessMsg("Faculty assigned successfully!");
      setTimeout(() => {
        setAssignModalOpen(false);
        setAssignSuccessMsg("");
      }, 800);
    } catch (err: any) {
      alert(err?.data?.error || "Failed to assign faculty");
    } finally {
      setAssigning(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMentorId || !newSubject || !newSection || !newYear || !newDay) return;
    setCreatingClass(true);
    try {
      await customFetch("/api/admin/schedules", {
        method: "POST",
        body: JSON.stringify({
          mentorId: Number(newMentorId),
          dayOfWeek: newDay,
          startTime: newStartTime,
          endTime: newEndTime,
          section: newSection,
          subject: newSubject,
          year: newYear,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["admin-schedules-list-status"] });
      queryClient.invalidateQueries({ queryKey: ["admin-schedules"] });
      setNewClassModalOpen(false);
      setNewSubject("");
    } catch (err: any) {
      alert(err?.data?.error || "Failed to create class schedule");
    } finally {
      setCreatingClass(false);
    }
  };

  const loadDetails = async (scheduleId: number, dateStr?: string) => {
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const url = `/api/admin/hourly-attendance-submissions?scheduleId=${scheduleId}${dateStr ? `&date=${dateStr}` : ""}`;
      const res = await customFetch<SubmissionResponse>(url);
      setDetailRecords(res.records);
      setAvailableDates(res.dates);
      if (res.date) {
        setSelectedDate(res.date);
      }
    } catch (err: any) {
      setDetailsError(err?.data?.error ?? "Failed to load submission details");
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSlotClick = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setAvailableDates([]);
    setDetailRecords([]);
    setSelectedDate(selectedDateFilter);
    setDrawerOpen(true);
    loadDetails(schedule.id, selectedDateFilter);
  };

  const handleDateChange = (dateVal: string) => {
    setSelectedDate(dateVal);
    if (selectedSchedule) {
      loadDetails(selectedSchedule.id, dateVal);
    }
  };

  // Helper to map date string to day of week (MON, TUE etc.)
  const getDayOfWeekFromDate = (dateStr: string): string => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayIndex = dateObj.getDay();
    const days = ["SUN", "MON", "TUE", "WED", "THUR", "FRI", "SAT"];
    return days[dayIndex];
  };

  const getFormattedDate = (dateStr: string): string => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  const activeDayOfWeek = getDayOfWeekFromDate(selectedDateFilter);

  const daysFullNames: Record<string, string> = {
    MON: "Monday",
    TUE: "Tuesday",
    WED: "Wednesday",
    THUR: "Thursday",
    FRI: "Friday",
    SAT: "Saturday",
    SUN: "Sunday"
  };

  const filterAndSearchSchedules = (day: string) => {
    return schedules.filter(s => {
      if (s.day_of_week !== day) return false;
      
      // Mapped Section check
      const dName = `DS ${s.year}/I/${s.section}`;
      if (selectedSection !== "All" && dName !== selectedSection) return false;

      // Search match
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        s.subject.toLowerCase().includes(q) ||
        (s.qr_mentors?.name || "").toLowerCase().includes(q) ||
        s.section.toLowerCase().includes(q)
      );
    }).sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6 text-slate-350 font-sans">
        <BackButton to={role === "hod" ? "/hod-dashboard" : "/dashboard"} />
        
        {/* Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-purple-500" />
              Hourly Lecture Attendance
            </h1>
            <p className="text-sm text-slate-400 mt-1">View scheduled lectures and check hourly attendance submitted by mentors</p>
          </div>

          {(role === "hod" || role === "admin") && (
            <button
              onClick={() => setNewClassModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-900/30 active:scale-[0.98] self-start md:self-auto"
            >
              <Plus className="w-4 h-4" />
              Assign New Class
            </button>
          )}
        </div>

        {/* Prominent Date View */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div>
            <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Active Date View</span>
            <h2 className="text-2xl font-black text-white mt-1">
              {getFormattedDate(selectedDateFilter)}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-400">Change Date:</span>
            <input
              type="date"
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 text-slate-200 focus:outline-none focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/10 text-sm font-bold cursor-pointer font-sans"
            />
          </div>
        </div>

        {/* Filters Panel */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Search Timetable</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Search by subject or teacher name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/10 transition-all text-sm font-sans"
              />
            </div>
          </div>

          <div className="w-full md:w-64">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Section Filter</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 text-slate-200 focus:outline-none focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/10 transition-all text-sm font-semibold cursor-pointer font-sans"
            >
              <option value="All">All Sections</option>
              <option value="DS II/I/A">2A CSE Data Science</option>
              <option value="DS II/I/B">2B CSE Data Science</option>
              <option value="DS II/I/C">2C CSE Data Science</option>
              <option value="DS III/I/A">3A CSE Data Science</option>
              <option value="DS III/I/B">3B CSE Data Science</option>
              <option value="DS III/I/C">3C CSE Data Science</option>
              <option value="DS IV/I/A">4A CSE Data Science</option>
              <option value="DS IV/I/B">4B CSE Data Science</option>
            </select>
          </div>
        </div>

        {/* Timetable view */}
        {schedulesLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            <p className="text-sm text-slate-450">Loading scheduled timetable lectures...</p>
          </div>
        ) : schedulesErr ? (
          <div className="bg-red-950/20 border border-red-800 text-red-200 p-5 rounded-xl text-center text-sm">
            Failed to load schedules: {schedulesErr instanceof Error ? schedulesErr.message : "Unknown error"}
          </div>
        ) : activeDayOfWeek === "SUN" ? (
          <div className="bg-slate-900 border border-slate-800 p-12 rounded-2xl text-center space-y-3">
            <Calendar className="w-12 h-12 text-slate-500 mx-auto" />
            <h3 className="text-slate-200 font-bold text-lg">Sunday - No Classes Scheduled</h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">Please select a weekday to view scheduled lectures and check attendance.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {(() => {
              const daySlots = filterAndSearchSchedules(activeDayOfWeek);
              if (daySlots.length === 0) {
                return (
                  <div className="bg-slate-900 border border-slate-800 p-12 rounded-2xl text-center space-y-3">
                    <AlertTriangle className="w-12 h-12 text-slate-500 mx-auto" />
                    <h3 className="text-slate-200 font-bold text-lg">No Classes Found</h3>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      No classes are scheduled on {daysFullNames[activeDayOfWeek]} matching your search filters.
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 px-1">
                    <Calendar className="w-5 h-5 text-purple-400" />
                    {daysFullNames[activeDayOfWeek]} Lectures ({selectedDateFilter})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {daySlots.map(s => (
                      <Card
                        key={s.id}
                        onClick={() => handleSlotClick(s)}
                        className="bg-slate-900 border-slate-800 hover:border-purple-500/50 p-4 shadow-sm rounded-xl cursor-pointer hover:bg-slate-850/40 active:scale-[0.99] transition-all flex flex-col justify-between group"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="px-2 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300 text-[10px] font-bold">
                              {s.year} Yr - {s.section}
                            </span>
                            <span className="text-[10px] font-mono font-semibold text-slate-455 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              {s.start_time.slice(0,5)} - {s.end_time.slice(0,5)}
                            </span>
                          </div>
                          
                          <h4 className="text-slate-100 font-bold text-sm mt-3 group-hover:text-purple-400 transition-colors">
                            {s.subject || "Lecture hour"}
                          </h4>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
                            <p className="text-xs text-slate-400">
                              Teacher: <span className="text-slate-200 font-semibold">{s.qr_mentors?.name || "Unassigned"}</span>
                            </p>
                            {(role === "hod" || role === "admin") && (
                              <button
                                onClick={(e) => handleOpenAssignModal(e, s)}
                                className="px-2 py-1 rounded-lg bg-purple-900/60 hover:bg-purple-800 text-purple-200 text-[10px] font-bold flex items-center gap-1 transition-colors border border-purple-700/50"
                                title="Assign or change faculty for this class"
                              >
                                <UserPlus className="w-3 h-3 text-purple-300" />
                                Assign Faculty
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                          {/* Attendance Status Badge */}
                          {s.status === "submitted" ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-950 text-green-400 border border-green-900/40">
                              ✓ Submitted ({s.studentCount} present)
                            </span>
                          ) : s.status === "started" ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-yellow-950 text-yellow-400 border border-yellow-900/40 animate-pulse">
                              ● Scan Started
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-950 text-slate-500 border border-slate-850">
                              Pending
                            </span>
                          )}
                          
                          <div className="flex items-center text-[10px] text-purple-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            View <ChevronRight className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Detailed Attendance Log Sheet */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent className="w-full sm:max-w-xl bg-slate-900 border-l border-slate-800/80 p-0 flex flex-col h-full text-slate-100">
            {selectedSchedule && (
              <>
                <SheetHeader className="p-6 border-b border-slate-800 bg-slate-950">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-purple-950 border border-purple-900 text-purple-300 text-[10px] font-bold">
                        {selectedSchedule.year} Yr - {selectedSchedule.section}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {selectedSchedule.start_time.slice(0,5)} - {selectedSchedule.end_time.slice(0,5)}
                      </span>
                    </div>

                    {(role === "hod" || role === "admin") && (
                      <button
                        onClick={(e) => handleOpenAssignModal(e, selectedSchedule)}
                        className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Reassign Faculty
                      </button>
                    )}
                  </div>
                  <SheetTitle className="text-xl font-black text-slate-100 mt-2 truncate">
                    {selectedSchedule.subject}
                  </SheetTitle>
                  <SheetDescription className="text-slate-400 text-xs mt-1">
                    Teacher: <span className="text-slate-200 font-semibold">{selectedSchedule.qr_mentors?.name || "Unassigned"}</span>
                  </SheetDescription>
                </SheetHeader>

                {/* Toolbar inside drawer */}
                <div className="px-6 py-4 border-b border-slate-850 bg-slate-900/60 flex items-center justify-between gap-4">
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <label className="text-xs font-bold text-slate-400 flex-shrink-0">Select Date:</label>
                    {availableDates.length > 0 ? (
                      <select
                        value={selectedDate}
                        onChange={(e) => handleDateChange(e.target.value)}
                        className="flex-1 max-w-[160px] px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold focus:outline-none focus:border-purple-500 cursor-pointer"
                      >
                        {availableDates.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium">No dates recorded</span>
                    )}
                  </div>
                  
                  {detailRecords.length > 0 && (
                    <div className="text-xs font-bold text-slate-300 bg-slate-950 border border-slate-850 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                      Present: <span className="text-green-400 font-extrabold">{detailRecords.filter(r => r.markedPresent).length}</span> / {detailRecords.length}
                    </div>
                  )}
                </div>

                {/* Drawer Content Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {detailsLoading ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                      <p className="text-xs text-slate-400">Loading student attendance checklist...</p>
                    </div>
                  ) : detailsError ? (
                    <div className="px-4 py-3 rounded-lg bg-red-950/20 border border-red-800 text-red-200 text-xs">
                      {detailsError}
                    </div>
                  ) : detailRecords.length === 0 ? (
                    <div className="py-20 text-center space-y-3">
                      <AlertTriangle className="w-10 h-10 text-slate-500 mx-auto" />
                      <p className="text-slate-400 text-sm font-semibold">No attendance submitted for this class yet.</p>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        Timetable slots will display student attendance details here once the mentor starts and submits their hourly scan.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-850 border border-slate-850 bg-slate-950 rounded-xl overflow-hidden shadow-sm">
                      {detailRecords.map(r => (
                        <div key={r.studentId} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-slate-900/25 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-200 truncate">{r.name}</p>
                              {r.scannedGate ? (
                                <span className="px-1.5 py-0.5 rounded bg-green-950/40 text-green-400 border border-green-900/30 text-[9px] font-bold">
                                  Gate Scanned
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-slate-850/80 text-slate-500 border border-slate-800 text-[9px]">
                                  No Gate Scan
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">{r.uniqueId}</p>
                          </div>

                          <div className="flex-shrink-0">
                            {r.markedPresent ? (
                              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-950/50 text-green-400 border border-green-900/40">
                                <CheckCircle className="w-3.5 h-3.5" /> Present
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-950/50 text-red-400 border border-red-900/40">
                                <XCircle className="w-3.5 h-3.5" /> Absent
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Assign Faculty to Class Modal */}
        {assignModalOpen && scheduleToAssign && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-purple-400" />
                  <h3 className="text-lg font-bold text-white">Assign Class to Faculty</h3>
                </div>
                <button
                  onClick={() => setAssignModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-850 p-3 rounded-xl space-y-1 text-xs">
                <p className="text-slate-300 font-bold">{scheduleToAssign.subject}</p>
                <p className="text-slate-400">Class: {scheduleToAssign.year} Yr - {scheduleToAssign.section} | Day: {scheduleToAssign.day_of_week}</p>
                <p className="text-slate-500 font-mono">{scheduleToAssign.start_time.slice(0,5)} - {scheduleToAssign.end_time.slice(0,5)}</p>
              </div>

              <form onSubmit={handleConfirmAssign} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Select Faculty / Teacher
                  </label>
                  <select
                    value={selectedMentorId}
                    onChange={(e) => setSelectedMentorId(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm font-semibold focus:outline-none focus:border-purple-500 cursor-pointer"
                    required
                  >
                    <option value="" disabled>-- Select Faculty --</option>
                    {mentors.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.email}) — Key: {m.key || "No Key"}
                      </option>
                    ))}
                  </select>
                </div>

                {assignSuccessMsg && (
                  <div className="p-3 rounded-xl bg-green-950/60 border border-green-800 text-green-300 text-xs font-bold text-center flex items-center justify-center gap-2">
                    <UserCheck className="w-4 h-4" />
                    {assignSuccessMsg}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setAssignModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={assigning || !selectedMentorId}
                    className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-purple-950/40"
                  >
                    {assigning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-4 h-4" />
                        Confirm Assign
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create New Class Schedule Modal */}
        {newClassModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-purple-400" />
                  <h3 className="text-lg font-bold text-white">Assign New Class Schedule</h3>
                </div>
                <button
                  onClick={() => setNewClassModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateClass} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Subject Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DBMS, Computer Networks, AI"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Year</label>
                    <select
                      value={newYear}
                      onChange={(e) => setNewYear(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold"
                    >
                      <option value="II">II Year</option>
                      <option value="III">III Year</option>
                      <option value="IV">IV Year</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Section</label>
                    <select
                      value={newSection}
                      onChange={(e) => setNewSection(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold"
                    >
                      <option value="A">Section A</option>
                      <option value="B">Section B</option>
                      <option value="C">Section C</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Day</label>
                    <select
                      value={newDay}
                      onChange={(e) => setNewDay(e.target.value)}
                      className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold"
                    >
                      <option value="MON">Mon</option>
                      <option value="TUE">Tue</option>
                      <option value="WED">Wed</option>
                      <option value="THUR">Thu</option>
                      <option value="FRI">Fri</option>
                      <option value="SAT">Sat</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Start Time</label>
                    <input
                      type="text"
                      placeholder="09:00:00"
                      value={newStartTime}
                      onChange={(e) => setNewStartTime(e.target.value)}
                      className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">End Time</label>
                    <input
                      type="text"
                      placeholder="10:00:00"
                      value={newEndTime}
                      onChange={(e) => setNewEndTime(e.target.value)}
                      className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Assign Faculty / Teacher
                  </label>
                  <select
                    value={newMentorId}
                    onChange={(e) => setNewMentorId(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold focus:outline-none focus:border-purple-500 cursor-pointer"
                    required
                  >
                    <option value="" disabled>-- Select Faculty --</option>
                    {mentors.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.email}) — Key: {m.key || "No Key"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setNewClassModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingClass || !newMentorId || !newSubject}
                    className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-purple-950/40"
                  >
                    {creatingClass ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Assign Class
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
