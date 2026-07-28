import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import {
  Calendar,
  Users,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRightLeft,
  GraduationCap,
  ListFilter,
  Grid3X3,
  ClipboardList,
  UserPlus,
  Plus,
  UserCheck,
  Loader2
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

type StudentUser = {
  id: number;
  name: string;
  uniqueId: string;
  role: string;
  section: string | null;
  batch: string | null;
};

type AttendanceRecord = {
  id: number;
  userId: number;
  date: string;
  entryTime: string | null;
  exitTime: string | null;
  status: "inside" | "left";
  user?: StudentUser;
  durationMinutes?: number | null;
};

type SectionStats = {
  sectionKey: string;     // e.g. "DS II/I/A"
  displayName: string;    // e.g. "2A"
  batch: string;          // e.g. "2025"
  yearLabel: string;      // e.g. "2nd Year"
  totalStudents: StudentUser[];
  presentStudents: { student: StudentUser; record: AttendanceRecord }[];
  absentStudents: StudentUser[];
};

export default function HodDashboard() {
  const [activeTab, setActiveTab] = useState<"summary" | "logs" | "mentors" | "schedules">("summary");
  
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  
  const [logDate, setLogDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerConfig, setDrawerConfig] = useState<{
    title: string;
    description: string;
    studentsList: Array<{
      student: StudentUser;
      record?: AttendanceRecord;
      status: "present" | "absent";
    }>;
  }>({
    title: "",
    description: "",
    studentsList: []
  });

  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [mentorsSearchQuery, setMentorsSearchQuery] = useState("");
  const [schedulesSearchQuery, setSchedulesSearchQuery] = useState("");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState("All");

  // Fetch all students
  const { data: allUsers = [], isLoading: usersLoading } = useQuery<StudentUser[]>({
    queryKey: ["users"],
    queryFn: () => customFetch<StudentUser[]>("/api/users"),
  });

  // Fetch today's summary attendance records
  const { data: attendanceRecords = [], isLoading: attendanceLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["attendance-today", selectedDate],
    queryFn: () => customFetch<AttendanceRecord[]>("/api/attendance/today"),
    refetchInterval: 5000,
  });

  // Fetch custom date attendance logs
  const { data: detailedLogs = [], isLoading: logsLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["attendance-logs", logDate],
    queryFn: () => customFetch<AttendanceRecord[]>(`/api/attendance?from=${logDate}&to=${logDate}`),
    refetchInterval: activeTab === "logs" ? 5000 : undefined,
  });

  const queryClient = useQueryClient();

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [scheduleToAssign, setScheduleToAssign] = useState<any | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState<number | "">("");
  const [assigning, setAssigning] = useState(false);
  const [assignSuccessMsg, setAssignSuccessMsg] = useState("");

  const [newClassModalOpen, setNewClassModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newSection, setNewSection] = useState("A");
  const [newYear, setNewYear] = useState("II");
  const [newDay, setNewDay] = useState("MON");
  const [newStartTime, setNewStartTime] = useState("09:00:00");
  const [newEndTime, setNewEndTime] = useState("10:00:00");
  const [newMentorId, setNewMentorId] = useState<number | "">("");
  const [creatingClass, setCreatingClass] = useState(false);

  // Fetch mentors with keys for HOD Dashboard
  const { data: mentorsTracking = [], isLoading: mentorsLoading } = useQuery<any[]>({
    queryKey: ["admin-mentors-tracking"],
    queryFn: () => customFetch<any[]>("/api/admin/mentors-tracking"),
  });

  // Fetch timetables/schedules for HOD Dashboard
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<any[]>({
    queryKey: ["admin-schedules"],
    queryFn: () => customFetch<any[]>("/api/admin/schedules"),
    enabled: activeTab === "schedules",
  });

  const handleOpenAssignModal = (schedule: any) => {
    setScheduleToAssign(schedule);
    setSelectedMentorId(schedule.mentor_id || (mentorsTracking[0]?.id ?? ""));
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
      queryClient.invalidateQueries({ queryKey: ["admin-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["admin-schedules-list-status"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["admin-schedules-list-status"] });
      setNewClassModalOpen(false);
      setNewSubject("");
    } catch (err: any) {
      alert(err?.data?.error || "Failed to create class schedule");
    } finally {
      setCreatingClass(false);
    }
  };

  const studentsOnly = allUsers.filter(u => u.role === "student");

  // Helper to map section name to code (e.g. "DS II/I/A" -> "2A")
  const getSectionDisplayName = (sectionStr: string | null | undefined): { name: string; yearLabel: string } => {
    if (!sectionStr) return { name: "Other", yearLabel: "Other" };
    
    const parts = sectionStr.split("/");
    const sectionLetter = parts[parts.length - 1] || "A";
    
    if (sectionStr.includes("IV")) {
      return { name: `4${sectionLetter}`, yearLabel: "4th Year" };
    }
    if (sectionStr.includes("III")) {
      return { name: `3${sectionLetter}`, yearLabel: "3rd Year" };
    }
    if (sectionStr.includes("II")) {
      return { name: `2${sectionLetter}`, yearLabel: "2nd Year" };
    }
    
    return { name: sectionStr, yearLabel: "Other" };
  };

  // Compile section statistics
  const sectionsMap = new Map<string, SectionStats>();

  studentsOnly.forEach(s => {
    const sec = s.section || "Unassigned";
    const batch = s.batch || "Unknown";
    const { name: displayName, yearLabel } = getSectionDisplayName(s.section);
    
    if (!sectionsMap.has(sec)) {
      sectionsMap.set(sec, {
        sectionKey: sec,
        displayName,
        batch,
        yearLabel,
        totalStudents: [],
        presentStudents: [],
        absentStudents: []
      });
    }
    
    sectionsMap.get(sec)!.totalStudents.push(s);
  });

  // Map today's attendance to sections
  const attendanceByUserId = new Map<number, AttendanceRecord>();
  attendanceRecords.forEach(r => {
    attendanceByUserId.set(r.userId, r);
  });

  sectionsMap.forEach((stats) => {
    stats.totalStudents.forEach(s => {
      const record = attendanceByUserId.get(s.id);
      if (record) {
        stats.presentStudents.push({ student: s, record });
      } else {
        stats.absentStudents.push(s);
      }
    });
  });

  const allSectionsList = Array.from(sectionsMap.values());

  // Sort sections: Year 2 first (A, B, C), Year 3 next, Year 4 last
  const sortOrder = ["DS II/I/A", "DS II/I/B", "DS II/I/C", "DS III/I/A", "DS III/I/B", "DS III/I/C", "DS III/I/D", "DS IV/I/A", "DS IV/I/B", "DS IV/I/C"];
  allSectionsList.sort((a, b) => {
    const indexA = sortOrder.indexOf(a.sectionKey);
    const indexB = sortOrder.indexOf(b.sectionKey);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.sectionKey.localeCompare(b.sectionKey);
  });

  // Group by yearLabel
  const yearGroups = ["2nd Year", "3rd Year", "4th Year"];

  // Total sums
  let overallTotalPresent = 0;
  let overallTotalAbsent = 0;
  let overallTotalStudents = 0;

  allSectionsList.forEach(s => {
    overallTotalPresent += s.presentStudents.length;
    overallTotalAbsent += s.absentStudents.length;
    overallTotalStudents += s.totalStudents.length;
  });

  const overallDeptPercentage = overallTotalStudents > 0 
    ? ((overallTotalPresent / overallTotalStudents) * 100).toFixed(3) 
    : "0.000";

  // Handle cell click to open drill-down
  const handleCellClick = (type: "PR" | "AB" | "Total", sectionStats: SectionStats) => {
    let title = "";
    let description = "";
    let list: Array<{ student: StudentUser; record?: AttendanceRecord; status: "present" | "absent" }> = [];

    const secName = sectionStats.sectionKey.replace(/\//g, " ");

    if (type === "PR") {
      title = `Present Students — Section ${sectionStats.displayName}`;
      description = `Showing ${sectionStats.presentStudents.length} present students in ${secName}`;
      list = sectionStats.presentStudents.map(p => ({
        student: p.student,
        record: p.record,
        status: "present"
      }));
    } else if (type === "AB") {
      title = `Absent Students — Section ${sectionStats.displayName}`;
      description = `Showing ${sectionStats.absentStudents.length} absent students in ${secName}`;
      list = sectionStats.absentStudents.map(s => ({
        student: s,
        status: "absent"
      }));
    } else {
      title = `All Students — Section ${sectionStats.displayName}`;
      description = `Showing total roster of ${sectionStats.totalStudents.length} students in ${secName}`;
      list = sectionStats.totalStudents.map(s => {
        const pRecord = sectionStats.presentStudents.find(p => p.student.id === s.id);
        return {
          student: s,
          record: pRecord?.record,
          status: pRecord ? "present" : "absent"
        };
      });
    }

    setDrawerConfig({ title, description, studentsList: list });
    setStudentSearchQuery("");
    setDrawerOpen(true);
  };

  const filteredDrawerStudents = drawerConfig.studentsList.filter(item => {
    const q = studentSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return item.student.name.toLowerCase().includes(q) || item.student.uniqueId.toLowerCase().includes(q);
  });

  // Deduplicate and consolidate detailed logs so each student appears only once per date
  const consolidatedLogs = useMemo(() => {
    const logsMap = new Map<number, AttendanceRecord>();

    detailedLogs.forEach((log) => {
      if (!log.userId) return;

      const existing = logsMap.get(log.userId);
      if (!existing) {
        logsMap.set(log.userId, { ...log });
      } else {
        const earliestEntry = (() => {
          if (!log.entryTime) return existing.entryTime;
          if (!existing.entryTime) return log.entryTime;
          return new Date(log.entryTime).getTime() < new Date(existing.entryTime).getTime()
            ? log.entryTime
            : existing.entryTime;
        })();

        const latestExit = (() => {
          if (!log.exitTime) return existing.exitTime;
          if (!existing.exitTime) return log.exitTime;
          return new Date(log.exitTime).getTime() > new Date(existing.exitTime).getTime()
            ? log.exitTime
            : existing.exitTime;
        })();

        const isInside = existing.status === "inside" || log.status === "inside";
        const finalStatus = isInside ? "inside" : "left";
        const finalExitTime = isInside ? null : latestExit;

        let durationMinutes: number | null = null;
        if (earliestEntry && finalExitTime) {
          durationMinutes = Math.floor(Math.abs(new Date(finalExitTime).getTime() - new Date(earliestEntry).getTime()) / 60000);
        } else if (existing.durationMinutes || log.durationMinutes) {
          durationMinutes = (existing.durationMinutes || 0) + (log.durationMinutes || 0);
        }

        logsMap.set(log.userId, {
          ...existing,
          entryTime: earliestEntry,
          exitTime: finalExitTime,
          status: finalStatus,
          durationMinutes,
        });
      }
    });

    return Array.from(logsMap.values());
  }, [detailedLogs]);

  // Filter logs list based on section filter and search query
  const filteredLogs = consolidatedLogs.filter(log => {
    const sUser = log.user;
    if (!sUser) return false;
    
    // Filter section
    if (selectedSectionFilter !== "All") {
      const { name: dName } = getSectionDisplayName(sUser.section);
      if (dName !== selectedSectionFilter) return false;
    }
    
    // Filter search query
    const q = logSearchQuery.toLowerCase().trim();
    if (q) {
      return sUser.name.toLowerCase().includes(q) || sUser.uniqueId.toLowerCase().includes(q);
    }
    return true;
  });

  const formatTime = (timeStr: string | null | undefined) => {
    if (!timeStr) return "—";
    try {
      const d = new Date(timeStr);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  };

  const isExitTimeOver = (logDate: string | null | undefined, exitTime: string | null | undefined) => {
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
  };

  const getPercentageColor = (percent: number) => {
    if (percent < 40) return "text-red-500 font-bold";
    if (percent < 60) return "text-orange-400 font-semibold";
    return "text-green-400 font-semibold";
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-8 font-sans">
        
        {/* Header section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-200 tracking-tight flex items-center gap-3">
              <GraduationCap className="w-8 h-8 text-blue-500" />
              HOD Dashboard
            </h1>
            <p className="text-slate-400 font-medium mt-1">Department of Data Science (DS)</p>
          </div>
          
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 shadow-md">
            <Calendar className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-semibold text-slate-200">{activeTab === "summary" ? selectedDate : logDate}</span>
          </div>
        </div>

        {/* Tab Toggle buttons */}
        <div className="flex bg-slate-900/60 border border-slate-850 p-1.5 rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab("summary")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === "summary"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Grid3X3 className="w-4 h-4" />
            Summary Grid
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === "logs"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Detailed Logs
          </button>
          <button
            onClick={() => setActiveTab("mentors")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === "mentors"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            Mentors & Keys
          </button>
          <button
            onClick={() => setActiveTab("schedules")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === "schedules"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Calendar className="w-4 h-4" />
            Schedules (Timetable)
          </button>
        </div>

        {activeTab === "summary" ? (
          <>
            {/* Quick summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Card className="bg-slate-900 border-slate-850 p-5 shadow-xl rounded-2xl flex flex-col justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Students</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold text-slate-200">{overallTotalStudents}</span>
                  <span className="text-xs text-slate-400">enrolled</span>
                </div>
              </Card>

              <Card className="bg-slate-900 border-slate-850 p-5 shadow-xl rounded-2xl flex flex-col justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Present Today</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold text-green-400">{overallTotalPresent}</span>
                  <span className="text-xs text-slate-400">active</span>
                </div>
              </Card>

              <Card className="bg-slate-900 border-slate-850 p-5 shadow-xl rounded-2xl flex flex-col justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Absent Today</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold text-red-400">{overallTotalAbsent}</span>
                  <span className="text-xs text-slate-400">missed</span>
                </div>
              </Card>

              <Card className="bg-slate-900 border-slate-850 p-5 shadow-xl rounded-2xl flex flex-col justify-between border-l-4 border-l-blue-500">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Department %</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black text-blue-400">{overallDeptPercentage}%</span>
                  <span className="text-xs text-slate-450">attendance</span>
                </div>
              </Card>
            </div>

            {/* Main Grid View */}
            {usersLoading || attendanceLoading ? (
              <div className="bg-slate-900 border border-slate-855 p-20 flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-semibold text-slate-400">Loading student rosters & attendance records...</p>
              </div>
            ) : (
              <Card className="bg-slate-900/50 border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/80 bg-slate-900 text-slate-350 text-xs font-semibold uppercase tracking-wider">
                        <th className="py-4 px-6">DS (Section)</th>
                        <th className="py-4 px-6 text-center">PR (Present)</th>
                        <th className="py-4 px-6 text-center">AB (Absent)</th>
                        <th className="py-4 px-6 text-center">Total</th>
                        <th className="py-4 px-6 text-center">% of Present</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-855/60">
                      {yearGroups.map(year => {
                        const sectionsInYear = allSectionsList.filter(s => s.yearLabel === year);
                        if (sectionsInYear.length === 0) return null;

                        // Compute year overall
                        let yearPresent = 0;
                        let yearAbsent = 0;
                        let yearTotal = 0;

                        sectionsInYear.forEach(s => {
                          yearPresent += s.presentStudents.length;
                          yearAbsent += s.absentStudents.length;
                          yearTotal += s.totalStudents.length;
                        });

                        const yearPercentage = yearTotal > 0 
                          ? ((yearPresent / yearTotal) * 100).toFixed(3) 
                          : "0.000";

                        return (
                          <>
                            {sectionsInYear.map(s => {
                              const percent = s.totalStudents.length > 0 
                                ? (s.presentStudents.length / s.totalStudents.length) * 100 
                                : 0;

                              return (
                                <tr key={s.sectionKey} className="hover:bg-slate-800/30 transition-colors group">
                                  <td className="py-4 px-6 font-bold text-slate-200 text-base">{s.displayName}</td>
                                  
                                  <td 
                                    onClick={() => handleCellClick("PR", s)}
                                    className="py-4 px-6 text-center text-green-400 font-semibold cursor-pointer hover:bg-green-500/10 active:scale-[0.98] transition-transform text-lg"
                                  >
                                    {s.presentStudents.length}
                                  </td>
                                  
                                  <td 
                                    onClick={() => handleCellClick("AB", s)}
                                    className="py-4 px-6 text-center text-red-400 font-semibold cursor-pointer hover:bg-red-500/10 active:scale-[0.98] transition-transform text-lg"
                                  >
                                    {s.absentStudents.length}
                                  </td>
                                  
                                  <td 
                                    onClick={() => handleCellClick("Total", s)}
                                    className="py-4 px-6 text-center text-slate-300 font-medium cursor-pointer hover:bg-slate-700/20 active:scale-[0.98] transition-transform text-lg"
                                  >
                                    {s.totalStudents.length}
                                  </td>
                                  
                                  <td className="py-4 px-6 text-center font-mono">
                                    <span className={getPercentageColor(percent)}>
                                      {percent.toFixed(3)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}

                            {/* Overall row for this specific year */}
                            <tr className="bg-blue-950/20 border-y border-slate-800">
                              <td className="py-4 px-6 font-black text-blue-400 text-base italic">Overall ({year})</td>
                              <td className="py-4 px-6 text-center text-green-400 font-bold text-lg">{yearPresent}</td>
                              <td className="py-4 px-6 text-center text-red-400 font-bold text-lg">{yearAbsent}</td>
                              <td className="py-4 px-6 text-center text-slate-200 font-bold text-lg">{yearTotal}</td>
                              <td className="py-4 px-6 text-center font-mono font-black text-blue-400 text-lg">
                                {yearPercentage}
                              </td>
                            </tr>
                          </>
                        );
                      })}
                      
                      {/* Department level summary footer */}
                      <tr className="bg-slate-900 border-t border-slate-850">
                        <td colSpan={4} className="py-6 px-6 font-black text-slate-200 text-lg tracking-wider text-right pr-12">
                          Overall Department %
                        </td>
                        <td className="py-6 px-6 text-center font-mono font-black text-blue-400 text-xl border-l border-slate-850">
                          {overallDeptPercentage}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        ) : activeTab === "logs" ? (
          <>
            {/* Detailed logs filter toolbar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">Date Filter</label>
                <div className="relative">
                  <input
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">Section Filter</label>
                <select
                  value={selectedSectionFilter}
                  onChange={(e) => setSelectedSectionFilter(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 text-slate-200 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-semibold cursor-pointer"
                >
                  <option value="All">All Sections</option>
                  <option value="2A">2A CSE Data Science</option>
                  <option value="2B">2B CSE Data Science</option>
                  <option value="2C">2C CSE Data Science</option>
                  <option value="3A">3A CSE Data Science</option>
                  <option value="3B">3B CSE Data Science</option>
                  <option value="3C">3C CSE Data Science</option>
                  <option value="3D">3D CSE Data Science</option>
                  <option value="4A">4A CSE Data Science</option>
                  <option value="4B">4B CSE Data Science</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">Search Students</label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search name or roll number..."
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Detailed Logs Table */}
            {logsLoading ? (
              <div className="bg-slate-900 border border-slate-855 p-20 flex flex-col items-center justify-center gap-4 rounded-3xl">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-semibold text-slate-400">Loading attendance log registry...</p>
              </div>
            ) : (
              <Card className="bg-slate-900/50 border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/80 bg-slate-900 text-slate-350 text-xs font-semibold uppercase tracking-wider">
                        <th className="py-4 px-6">Student details</th>
                        <th className="py-4 px-6 text-center">Class / Section</th>
                        <th className="py-4 px-6 text-center">Status</th>
                        <th className="py-4 px-6 text-center">Entry Time (In)</th>
                        <th className="py-4 px-6 text-center">Exit Time (Out)</th>
                        <th className="py-4 px-6 text-center">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-855/60">
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                            No attendance logs registered for this query selection.
                          </td>
                        </tr>
                      ) : (
                        filteredLogs.map((log) => {
                          const user = log.user!;
                          const { name: sDisplayName } = getSectionDisplayName(user.section);
                          
                          return (
                            <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-4 px-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 uppercase">
                                    {user.name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-slate-200">{user.name}</p>
                                    <p className="text-xs text-slate-550 font-mono mt-0.5">{user.uniqueId}</p>
                                  </div>
                                </div>
                              </td>

                              <td className="py-4 px-6 text-center font-bold text-slate-300">
                                {sDisplayName}
                              </td>

                              <td className="py-4 px-6 text-center">
                                {isExitTimeOver(log.date, log.exitTime) ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border bg-red-950/60 text-red-400 border-red-900/40">
                                    <XCircle className="w-3 h-3 text-red-400" />
                                    Not Scanned
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                                    log.status === "inside" 
                                      ? "bg-green-950/60 text-green-400 border-green-900/40"
                                      : "bg-slate-850/80 text-slate-400 border-slate-800"
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${log.status === "inside" ? "bg-green-400" : "bg-slate-500"}`} />
                                    {log.status === "inside" ? "Still on Campus" : "Left Campus"}
                                  </span>
                                )}
                              </td>

                              <td className="py-4 px-6 text-center text-slate-300 font-mono">
                                {formatTime(log.entryTime)}
                              </td>

                              <td className="py-4 px-6 text-center text-slate-300 font-mono">
                                {isExitTimeOver(log.date, log.exitTime) ? (
                                  <span className="inline-flex items-center justify-center gap-1 text-red-400 font-semibold text-xs">
                                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                                    Not Scanned
                                  </span>
                                ) : (
                                  formatTime(log.exitTime)
                                )}
                              </td>

                              <td className="py-4 px-6 text-center text-slate-400 text-sm">
                                {log.durationMinutes ? `${log.durationMinutes} mins` : "—"}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        ) : activeTab === "mentors" ? (
          <>
            {/* Mentors Search Toolbar */}
            <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
              <div className="flex-1 min-w-0">
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search mentor name, email, or passkey..."
                    value={mentorsSearchQuery}
                    onChange={(e) => setMentorsSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Mentors Table */}
            {mentorsLoading ? (
              <div className="bg-slate-900 border border-slate-855 p-20 flex flex-col items-center justify-center gap-4 rounded-3xl">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-semibold text-slate-400">Loading department mentors registry...</p>
              </div>
            ) : (
              <Card className="bg-slate-900/50 border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/80 bg-slate-900 text-slate-350 text-xs font-semibold uppercase tracking-wider">
                        <th className="py-4 px-6">Mentor / Teacher Name</th>
                        <th className="py-4 px-6">Email Address</th>
                        <th className="py-4 px-6 text-center">Mentor Passkey (Key)</th>
                        <th className="py-4 px-6 text-center">Total Sessions Logged</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-855/60">
                      {mentorsTracking.filter((m: any) => {
                        const q = mentorsSearchQuery.toLowerCase().trim();
                        if (!q) return true;
                        return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.key && m.key.toLowerCase().includes(q));
                      }).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-12 text-center text-slate-500 text-sm">
                            No mentors found matching your query.
                          </td>
                        </tr>
                      ) : (
                        mentorsTracking.filter((m: any) => {
                          const q = mentorsSearchQuery.toLowerCase().trim();
                          if (!q) return true;
                          return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.key && m.key.toLowerCase().includes(q));
                        }).map((m: any) => (
                          <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-4 px-6 font-semibold text-slate-200 text-base">{m.name}</td>
                            <td className="py-4 px-6 text-slate-400 font-mono text-xs">{m.email}</td>
                            <td className="py-4 px-6 text-center">
                              <span className="inline-block px-3 py-1 rounded-xl bg-purple-950 border border-purple-800 text-purple-300 font-bold text-sm tracking-wider font-mono">
                                {m.key || "—"}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-center font-bold text-slate-300">
                              {m.sessions?.length || 0}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        ) : (
          <>
            {/* Timetable Schedules Search Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
              <div className="flex-1 min-w-0 w-full">
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search subject, section, day or mentor..."
                    value={schedulesSearchQuery}
                    onChange={(e) => setSchedulesSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-semibold"
                  />
                </div>
              </div>

              <button
                onClick={() => setNewClassModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-900/30 active:scale-[0.98] w-full sm:w-auto flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                Assign New Class
              </button>
            </div>

            {/* Timetable Schedules Table */}
            {schedulesLoading ? (
              <div className="bg-slate-900 border border-slate-855 p-20 flex flex-col items-center justify-center gap-4 rounded-3xl">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-semibold text-slate-400">Loading department timetables...</p>
              </div>
            ) : (
              <Card className="bg-slate-900/50 border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/80 bg-slate-900 text-slate-350 text-xs font-semibold uppercase tracking-wider">
                        <th className="py-4 px-6">Mentor / Teacher</th>
                        <th className="py-4 px-6">Day</th>
                        <th className="py-4 px-6">Time Slot</th>
                        <th className="py-4 px-6">Class / Section</th>
                        <th className="py-4 px-6">Subject</th>
                        <th className="py-4 px-6 text-center">Assign Faculty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-855/60">
                      {schedules.filter((s: any) => {
                        const q = schedulesSearchQuery.toLowerCase().trim();
                        if (!q) return true;
                        return (
                          (s.qr_mentors?.name || "").toLowerCase().includes(q) ||
                          s.day_of_week.toLowerCase().includes(q) ||
                          s.section.toLowerCase().includes(q) ||
                          s.year.toLowerCase().includes(q) ||
                          (s.subject || "").toLowerCase().includes(q)
                        );
                      }).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                            No timetable slots found matching your query.
                          </td>
                        </tr>
                      ) : (
                        schedules.filter((s: any) => {
                          const q = schedulesSearchQuery.toLowerCase().trim();
                          if (!q) return true;
                          return (
                            (s.qr_mentors?.name || "").toLowerCase().includes(q) ||
                            s.day_of_week.toLowerCase().includes(q) ||
                            s.section.toLowerCase().includes(q) ||
                            s.year.toLowerCase().includes(q) ||
                            (s.subject || "").toLowerCase().includes(q)
                          );
                        }).map((s: any) => (
                          <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-4 px-6 font-semibold text-slate-200">{s.qr_mentors?.name || "Unassigned"}</td>
                            <td className="py-4 px-6 text-slate-300 font-bold">{s.day_of_week}</td>
                            <td className="py-4 px-6 text-slate-405 font-mono text-xs">{s.start_time.slice(0,5)} - {s.end_time.slice(0,5)}</td>
                            <td className="py-4 px-6">
                              <span className="inline-block px-2.5 py-0.5 rounded-lg bg-purple-950 border border-purple-800 text-purple-300 font-bold text-xs">
                                {s.year} Yr - {s.section}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-slate-300">{s.subject || "—"}</td>
                            <td className="py-4 px-6 text-center">
                              <button
                                onClick={() => handleOpenAssignModal(s)}
                                className="px-3 py-1.5 rounded-xl bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800/80 font-bold text-xs inline-flex items-center gap-1.5 transition-colors shadow-sm"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                Assign Faculty
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}

        {/* Detailed student listing slide-over sheet */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent className="w-full sm:max-w-xl bg-slate-900 border-l border-slate-800/80 p-0 flex flex-col h-full text-slate-100">
            <SheetHeader className="p-6 border-b border-slate-800">
              <SheetTitle className="text-2xl font-bold text-slate-200 tracking-tight">
                {drawerConfig.title}
              </SheetTitle>
              <SheetDescription className="text-slate-400 text-sm mt-1">
                {drawerConfig.description}
              </SheetDescription>
            </SheetHeader>

            {/* Search filter */}
            <div className="px-6 py-4 border-b border-slate-800/50 bg-slate-900/50">
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder="Search student name or roll number..."
                  value={studentSearchQuery}
                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm"
                />
              </div>
            </div>

            {/* Students list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-855 p-2">
              {filteredDrawerStudents.length === 0 ? (
                <div className="py-20 text-center text-slate-500 text-sm">
                  No students match your query.
                </div>
              ) : (
                filteredDrawerStudents.map((item, idx) => {
                  const s = item.student;
                  const record = item.record;
                  
                  return (
                    <div key={s.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-800/20 rounded-xl transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 uppercase">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-200">{s.name}</p>
                          <p className="text-xs text-slate-550 font-mono mt-0.5">{s.uniqueId}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 text-right">
                        {item.status === "present" ? (
                          <>
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              record && isExitTimeOver(record.date, record.exitTime)
                                ? "bg-red-950/60 text-red-400 border border-red-900/40"
                                : "bg-green-950/60 text-green-400 border border-green-900/40"
                            }`}>
                              {record && isExitTimeOver(record.date, record.exitTime) ? (
                                <XCircle className="w-3 h-3 text-red-400" />
                              ) : (
                                <CheckCircle className="w-3 h-3" />
                              )}
                              {record?.exitTime
                                ? "Left Campus"
                                : record && isExitTimeOver(record.date, record.exitTime)
                                  ? "Not Scanned"
                                  : "Still on Campus"}
                            </span>
                            <div className="flex items-center gap-3 text-slate-500 text-[10px]">
                              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-blue-500" /> In: {formatTime(record?.entryTime)}</span>
                              {record?.exitTime ? (
                                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-red-500" /> Out: {formatTime(record?.exitTime)}</span>
                              ) : record && isExitTimeOver(record.date, record.exitTime) ? (
                                <span className="flex items-center gap-1 text-red-400 font-semibold"><XCircle className="w-3.5 h-3.5 text-red-500" /> Out: Not Scanned</span>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-950/60 text-red-400 border border-red-900/40">
                            <XCircle className="w-3 h-3" />
                            Absent
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
                <p className="text-slate-500 font-mono">{scheduleToAssign.start_time?.slice(0,5)} - {scheduleToAssign.end_time?.slice(0,5)}</p>
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
                    {mentorsTracking.map((m: any) => (
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
                    {mentorsTracking.map((m: any) => (
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
