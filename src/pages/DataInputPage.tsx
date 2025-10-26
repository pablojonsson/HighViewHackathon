import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

type AttendanceStatus = "present" | "late" | "excused" | "absent";

interface Course {
  id: string;
  name: string;
}

interface Student {
  id: string;
  name: string;
  cohort: string | null;
  courseId: string;
}

interface StudentEntry {
  status: AttendanceStatus;
  participation: number;
  bonus: string[];
  notes: string;
}

interface RosterResponse {
  roster: Student[];
}

interface CoursesResponse {
  courses: Course[];
}

interface SaveSessionPayload {
  sessionName: string;
  courseId: string;
  occurredAt?: string;
  entries: Array<StudentEntry & { studentId: string }>;
}

const bonusOptions = [
  { key: "lead", label: "Led discussion (+2)" },
  { key: "mentor", label: "Peer mentor (+1)" },
  { key: "project", label: "Project milestone (+3)" }
] as const;

const bonusPointMap: Record<(typeof bonusOptions)[number]["key"], number> = {
  lead: 2,
  mentor: 1,
  project: 3
};

const createDefaultEntry = (): StudentEntry => ({
  status: "present",
  participation: 3,
  bonus: [],
  notes: ""
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
          throw new Error("Failed to load courses");
        }
        const data = (await response.json()) as CoursesResponse;
        setCourses(data.courses);
        if (data.courses.length && !selectedCourseId) {
          setSelectedCourseId(data.courses[0].id);
        }
      } catch (error) {
        setCoursesError(error instanceof Error ? error.message : "Unknown error loading courses");
      }
    };

    loadCourses();
  }, [user]);

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
  }, [selectedCourseId, user]);

  useEffect(() => {
    setEntries((prev) => {
      const next: Record<string, StudentEntry> = {};
      roster.forEach((student) => {
        next[student.id] = prev[student.id] ? { ...prev[student.id] } : createDefaultEntry();
      });
      return next;
    });
  }, [roster]);

  const updateEntry = (studentId: string, field: keyof StudentEntry, value: unknown) => {
    setEntries((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? createDefaultEntry()),
        [field]: value
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
    const counts = {
      present: 0,
      late: 0,
      excused: 0,
      absent: 0,
      totalParticipation: 0,
      bonusPoints: 0
    };

    roster.forEach((student) => {
      const entry = entries[student.id];
      if (!entry) {
        return;
      }

      const statusKey = entry.status as keyof typeof counts;
      counts[statusKey] += 1;
      counts.totalParticipation += entry.participation;
      entry.bonus.forEach((bonusKey) => {
        counts.bonusPoints += bonusPointMap[bonusKey as keyof typeof bonusPointMap] ?? 0;
      });
    });

    return {
      ...counts,
      avgParticipation:
        roster.length > 0 ? (counts.totalParticipation / roster.length).toFixed(1) : "0.0"
    };
  }, [entries, roster]);

  const handleSave = async () => {
    if (!user || !isTeacher) {
      setSaveError("Only teachers can record attendance sessions.");
      return;
    }

    if (!selectedCourseId) {
      setSaveError("Select a course before saving.");
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
      entries: roster.map((student) => ({
        studentId: student.id,
        ...(entries[student.id] ?? createDefaultEntry())
      }))
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
          Track attendance, participation, and bonus actions for today&apos;s session. Data now
          persists via the Node/Express + PostgreSQL backend.
        </p>

        {coursesError ? (
          <div className="error-message">{coursesError}</div>
        ) : (
          <div className="course-picker">
            <label htmlFor="course" className="subtle" style={{ fontWeight: 600 }}>
              Course
            </label>
            <select
              id="course"
              value={selectedCourseId}
              onChange={(event) => setSelectedCourseId(event.target.value)}
            >
              <option value="" disabled>
                Select a course
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
          placeholder="e.g. Algebra II - Section 2 - 10/25 Morning Block"
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
              Avg participation {summary.avgParticipation}
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
                <th>Participation</th>
                <th>Bonus actions</th>
                <th>Notes</th>
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
                        <span className="subtle">{student.cohort ?? "No cohort"}</span>
                      </div>
                    </td>
                    <td>
                      <select
                        value={entry.status}
                        onChange={(event) =>
                          updateEntry(student.id, "status", event.target.value as AttendanceStatus)
                        }
                      >
                        <option value="present">Present</option>
                        <option value="late">Late</option>
                        <option value="excused">Excused</option>
                        <option value="absent">Absent</option>
                      </select>
                    </td>
                    <td>
                      <div className="participation-cell">
                        <input
                          type="range"
                          min={0}
                          max={5}
                          step={1}
                          value={entry.participation}
                          onChange={(event) =>
                            updateEntry(student.id, "participation", Number(event.target.value))
                          }
                        />
                        <span>{entry.participation}</span>
                      </div>
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
                    <td>
                      <input
                        className="note-input"
                        placeholder="Optional quick note"
                        value={entry.notes}
                        onChange={(event) => updateEntry(student.id, "notes", event.target.value)}
                      />
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