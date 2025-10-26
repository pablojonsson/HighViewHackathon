import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

type AttendanceStatus = "present" | "late" | "excused" | "absent";

type Course = {
  id: string;
  name: string;
};

type Student = {
  id: string;
  name: string;
  cohort: string | null;
  courseId: string;
};

type StudentEntry = {
  status: AttendanceStatus;
  bonus: string[];
};

type RosterResponse = {
  roster: Student[];
};

type CoursesResponse = {
  courses: Course[];
};

type SaveSessionPayload = {
  sessionName: string;
  courseId: string;
  occurredAt?: string;
  entries: Array<{
    studentId: string;
    status: AttendanceStatus;
    bonus?: string[];
  }>;
};

const attendancePoints: Record<AttendanceStatus, number> = {
  present: 5,
  late: 3.5,
  excused: 2.5,
  absent: 0
};

const bonusOptions = [
  { key: "participation", label: "Participation (+1)" },
  { key: "thank_you", label: "Thank you notes (+1)" },
  { key: "video_content", label: "Video content (+1)" },
  { key: "additional_event", label: "Additional event (+1)" }
] as const;

const bonusPointMap: Record<(typeof bonusOptions)[number]["key"], number> = {
  participation: 1,
  thank_you: 1,
  video_content: 1,
  additional_event: 1
};

const createDefaultEntry = (): StudentEntry => ({
  status: "present",
  bonus: []
});

const DataInputPage = () => {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [sessionName, setSessionName] = useState("");
  const [roster, setRoster] = useState<Student[]>([]);
  const [entries, setEntries] = useState<Record<string, StudentEntry>>({});
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isTeacher || !user) {
      setCourses([]);
      return;
    }

    const loadCourses = async () => {
      try {
        setCoursesError(null);
        const params = new URLSearchParams({
          role: user.role,
          userId: user.id
        });
        const response = await fetch(`/api/courses?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Failed to load companies");
        }
        const data = (await response.json()) as CoursesResponse;
        setCourses(data.courses);
        if (data.courses.length && !selectedCourseId) {
          setSelectedCourseId(data.courses[0].id);
        }
      } catch (error) {
        setCoursesError(error instanceof Error ? error.message : "Unknown error loading companies");
      }
    };

    loadCourses();
  }, [user, isTeacher, selectedCourseId]);

  useEffect(() => {
    const loadRoster = async () => {
      if (!selectedCourseId || !user || !isTeacher) {
        setRoster([]);
        return;
      }

      try {
        setRosterLoading(true);
        setRosterError(null);
        const params = new URLSearchParams({
          courseId: selectedCourseId,
          role: user.role,
          userId: user.id
        });
        const response = await fetch(`/api/roster?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Failed to load roster");
        }
        const data = (await response.json()) as RosterResponse;
        setRoster(data.roster);
      } catch (error) {
        setRosterError(error instanceof Error ? error.message : "Unknown error loading roster");
      } finally {
        setRosterLoading(false);
      }
    };

    loadRoster();
  }, [selectedCourseId, user, isTeacher]);

  useEffect(() => {
    setEntries((prev) => {
      const next: Record<string, StudentEntry> = {};
      roster.forEach((student) => {
        next[student.id] = prev[student.id] ? { ...prev[student.id] } : createDefaultEntry();
      });
      return next;
    });
  }, [roster]);

  const updateStatus = (studentId: string, status: AttendanceStatus) => {
    setEntries((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? createDefaultEntry()),
        status
      }
    }));
  };

  const toggleBonus = (studentId: string, bonusKey: string) => {
    setEntries((prev) => {
      const current = prev[studentId] ?? createDefaultEntry();
      const hasBonus = current.bonus.includes(bonusKey);
      return {
        ...prev,
        [studentId]: {
          ...current,
          bonus: hasBonus
            ? current.bonus.filter((key) => key !== bonusKey)
            : [...current.bonus, bonusKey]
        }
      };
    });
  };

  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      late: 0,
      excused: 0,
      absent: 0
    };
    let totalAttendancePoints = 0;
    let totalBonusPoints = 0;

    roster.forEach((student) => {
      const entry = entries[student.id];
      if (!entry) {
        return;
      }

      counts[entry.status] += 1;
      totalAttendancePoints += attendancePoints[entry.status];
      totalBonusPoints += entry.bonus.reduce((sum, key) => sum + (bonusPointMap[key as keyof typeof bonusPointMap] ?? 0), 0);
    });

    const averageAttendancePoints =
      roster.length > 0 ? (totalAttendancePoints / roster.length).toFixed(1) : "0.0";

    return {
      present: counts.present,
      late: counts.late,
      excused: counts.excused,
      absent: counts.absent,
      averageAttendancePoints,
      bonusPoints: totalBonusPoints
    };
  }, [entries, roster]);

  const handleSave = async () => {
    if (!user || !isTeacher) {
      setSaveError("Only teachers can record attendance sessions.");
      return;
    }

    if (!selectedCourseId) {
      setSaveError("Select a company before saving.");
      return;
    }

    if (!sessionName.trim()) {
      setSaveError("Section name is required.");
      return;
    }

    setSaveError(null);
    setSubmitted(false);

    const payload: SaveSessionPayload = {
      sessionName: sessionName.trim(),
      courseId: selectedCourseId,
      entries: roster.map((student) => {
        const entry = entries[student.id] ?? createDefaultEntry();
        return {
          studentId: student.id,
          status: entry.status,
          bonus: entry.bonus
        };
      })
    };

    try {
      setSaving(true);
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save session");
      }

      setSubmitted(true);
      window.setTimeout(() => setSubmitted(false), 2500);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unknown error during save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Session log</h2>
        <p className="subtle">
          Track attendance and bonus actions for today&apos;s session. Data now persists via the
          Node/Express + PostgreSQL backend.
        </p>

        {coursesError ? (
          <div className="error-message">{coursesError}</div>
        ) : (
          <div className="course-picker">
            <label htmlFor="course" className="subtle" style={{ fontWeight: 600 }}>
              Company
            </label>
            <select
              id="course"
              value={selectedCourseId}
              onChange={(event) => setSelectedCourseId(event.target.value)}
            >
              <option value="" disabled>
                Select a company
              </option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="subtle" style={{ fontWeight: 600 }}>
          Section name
        </label>
        <input
          className="session-input"
          placeholder="e.g. Section 2 - 10/25"
          value={sessionName}
          onChange={(event) => setSessionName(event.target.value)}
        />
      </div>

      <div className="card roster-card">
        <div className="roster-head">
          <h2>Roster</h2>
          <div className="roster-summary">
            <span className="tag success">Present {summary.present}</span>
            <span className="tag warning">Late {summary.late}</span>
            <span className="tag info">Excused {summary.excused}</span>
            <span className="tag danger">Absent {summary.absent}</span>
            <span className="tag neutral">
              Avg attendance pts {summary.averageAttendancePoints}
            </span>
            <span className="tag bonus">Bonus pts {summary.bonusPoints}</span>
          </div>
        </div>

        {rosterLoading ? (
          <div className="subtle">Loading roster...</div>
        ) : rosterError ? (
          <div className="error-message">{rosterError}</div>
        ) : roster.length === 0 ? (
          <div className="subtle">No students on this roster yet.</div>
        ) : (
          <table className="roster-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Status</th>
                <th>Attendance pts</th>
                <th>Bonus actions</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((student) => {
                const entry = entries[student.id] ?? createDefaultEntry();
                return (
                  <tr key={student.id}>
                    <td>
                      <div className="student-cell">
                        <strong>{student.name}</strong>
                      </div>
                    </td>
                    <td>
                      <select
                        value={entry.status}
                        onChange={(event) =>
                          updateStatus(student.id, event.target.value as AttendanceStatus)
                        }
                      >
                        <option value="present">Present</option>
                        <option value="late">Late</option>
                        <option value="excused">Excused</option>
                        <option value="absent">Absent</option>
                      </select>
                    </td>
                    <td>
                      <span className="attendance-points">
                        {attendancePoints[entry.status]} pts
                      </span>
                    </td>
                    <td>
                      <div className="bonus-chip-group">
                        {bonusOptions.map((bonus) => (
                          <button
                            key={bonus.key}
                            type="button"
                            className={
                              entry.bonus.includes(bonus.key) ? "chip chip-active" : "chip"
                            }
                            onClick={() => toggleBonus(student.id, bonus.key)}
                          >
                            {bonus.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card stack">
        <button
          className="primary-btn"
          onClick={handleSave}
          disabled={saving || roster.length === 0 || !selectedCourseId}
        >
          {saving ? "Saving..." : "Save session"}
        </button>
        {saveError && <span className="tag danger">{saveError}</span>}
        {submitted && <span className="tag success">Saved to database</span>}
        <p className="subtle">
          After connecting Google Classroom, the roster endpoint will pull live data before writing
          to Postgres.
        </p>
      </div>
    </div>
  );
};

export default DataInputPage;
