import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

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

type AttendanceStatus = "present" | "late" | "excused" | "absent";
type BonusCode = "lead" | "mentor" | "project";

type StudentDetailResponse = {
  student: {
    id: string;
    name: string;
    cohort: string | null;
    courseId: string;
  };
  stats: {
    totalSessions: number;
    attendanceRate: number;
    averageParticipation: string;
    bonusPoints: number;
  };
  recentSessions: Array<{
    id: string;
    status: AttendanceStatus;
    participation: number;
    notes: string;
    occurredAt: string;
    sessionName: string;
    bonus: Array<{ code: BonusCode; points: number }>;
  }>;
};

const statusTagClass: Record<AttendanceStatus, string> = {
  present: "tag success",
  late: "tag warning",
  excused: "tag info",
  absent: "tag danger"
};

const statusLabel: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent"
};

const bonusLabels: Record<BonusCode, string> = {
  lead: "Led discussion",
  mentor: "Peer mentor",
  project: "Project milestone"
};

const StudentDetailPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const courseParam = searchParams.get("courseId");
  const studentParam = searchParams.get("studentId");

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [roster, setRoster] = useState<Student[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [studentData, setStudentData] = useState<StudentDetailResponse | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);

  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => courseParam ?? "");
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => studentParam ?? "");

  useEffect(() => {
    const loadCourses = async () => {
      try {
        setCoursesError(null);
        const response = await fetch("/api/courses");
        if (!response.ok) {
          throw new Error("Failed to load courses");
        }
        const data = (await response.json()) as { courses: Course[] };
        setCourses(data.courses);

        if (!selectedCourseId && data.courses.length > 0) {
          const initialCourseId = courseParam ?? data.courses[0].id;
          setSelectedCourseId(initialCourseId);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("courseId", initialCourseId);
            return next;
          });
        }
      } catch (error) {
        setCoursesError(error instanceof Error ? error.message : "Unknown error loading courses");
      }
    };

    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadRoster = async () => {
      if (!selectedCourseId) {
        setRoster([]);
        return;
      }

      try {
        setRosterLoading(true);
        setRosterError(null);
        const response = await fetch(`/api/roster?courseId=${encodeURIComponent(selectedCourseId)}`);
        if (!response.ok) {
          throw new Error("Failed to load roster");
        }
        const data = (await response.json()) as { roster: Student[] };
        setRoster(data.roster);

        if (studentParam && data.roster.some((student) => student.id === studentParam)) {
          setSelectedStudentId(studentParam);
        } else if (data.roster.length > 0) {
          setSelectedStudentId(data.roster[0].id);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("studentId", data.roster[0].id);
            return next;
          });
        } else {
          setSelectedStudentId("");
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete("studentId");
            return next;
          });
        }
      } catch (error) {
        setRosterError(error instanceof Error ? error.message : "Unknown error loading roster");
      } finally {
        setRosterLoading(false);
      }
    };

    if (selectedCourseId) {
      loadRoster();
    } else {
      setRoster([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId, studentParam]);

  useEffect(() => {
    const fetchStudent = async () => {
      if (!selectedStudentId) {
        setStudentData(null);
        return;
      }

      try {
        setStudentLoading(true);
        setStudentError(null);
        const response = await fetch(`/api/students/${selectedStudentId}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Student not found");
          }
          throw new Error("Failed to load student diagnostics");
        }
        const data = (await response.json()) as StudentDetailResponse;
        setStudentData(data);
      } catch (error) {
        setStudentError(error instanceof Error ? error.message : "Unknown error loading student");
        setStudentData(null);
      } finally {
        setStudentLoading(false);
      }
    };

    fetchStudent();
  }, [selectedStudentId]);

  const summary = useMemo(() => {
    if (!studentData) {
      return null;
    }

    const attendanceRate = studentData.stats.attendanceRate;
    const participation = Number.parseFloat(studentData.stats.averageParticipation);
    const riskLevel = attendanceRate < 70 ? "high" : attendanceRate < 85 ? "medium" : "low";

    return {
      attendanceRate,
      participationScore: Number.isNaN(participation) ? 0 : participation,
      totalSessions: studentData.stats.totalSessions,
      bonusPoints: studentData.stats.bonusPoints,
      riskLevel: riskLevel as "low" | "medium" | "high"
    };
  }, [studentData]);

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedStudentId("");
    setStudentData(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("courseId", courseId);
      next.delete("studentId");
      return next;
    });
  };

  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("studentId", studentId);
      if (!selectedCourseId) {
        next.delete("courseId");
      }
      return next;
    });
  };

  return (
    <div className="stack">
      <div className="card stack">
        <div className="flex-between">
          <div>
            <h2>Student diagnostics</h2>
            <p className="subtle">Compare attendance and engagement for a single learner.</p>
          </div>
          <button className="link-btn" onClick={() => navigate("/mock/leaderboard")}>
            ← Back to leaderboard
          </button>
        </div>

        {coursesError ? (
          <div className="error-message">{coursesError}</div>
        ) : (
          <div className="selector-grid">
            <div className="selector-field">
              <label htmlFor="course">Course</label>
              <select
                id="course"
                value={selectedCourseId}
                onChange={(event) => handleCourseChange(event.target.value)}
              >
                <option value="" disabled>
                  Select course
                </option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="selector-field">
              <label htmlFor="student">Student</label>
              <select
                id="student"
                value={selectedStudentId}
                onChange={(event) => handleStudentChange(event.target.value)}
                disabled={roster.length === 0}
              >
                <option value="" disabled>
                  Select student
                </option>
                {roster.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {rosterLoading && <div className="subtle">Loading roster…</div>}
        {rosterError && <div className="error-message">{rosterError}</div>}
      </div>

      {studentLoading ? (
        <div className="card">
          <p className="subtle">Loading student diagnostics…</p>
        </div>
      ) : studentError ? (
        <div className="card">
          <p className="error-message">{studentError}</p>
        </div>
      ) : !studentData ? (
        <div className="card">
          <p className="subtle">Select a student to view detailed attendance diagnostics.</p>
        </div>
      ) : (
        <>
          <div className="card-grid stat-grid">
            <div className="stat-card">
              <p className="subtle">Attendance rate</p>
              <h3>{summary ? `${summary.attendanceRate}%` : "0%"}</h3>
              <span className={summary?.riskLevel === "high" ? "tag danger" : summary?.riskLevel === "medium" ? "tag warning" : "tag success"}>
                {summary?.riskLevel === "high"
                  ? "High risk"
                  : summary?.riskLevel === "medium"
                  ? "Watch closely"
                  : "Healthy"}
              </span>
            </div>
            <div className="stat-card">
              <p className="subtle">Participation avg</p>
              <h3>{summary ? summary.participationScore.toFixed(1) : "0.0"}</h3>
              <span className="tag neutral">Scale 0–5</span>
            </div>
            <div className="stat-card">
              <p className="subtle">Sessions logged</p>
              <h3>{summary?.totalSessions ?? 0}</h3>
              <span className="tag neutral">Last 30 sessions</span>
            </div>
            <div className="stat-card">
              <p className="subtle">Bonus points</p>
              <h3>{summary?.bonusPoints ?? 0}</h3>
              <span className="tag bonus">Mentor boosts</span>
            </div>
          </div>

          <div className="card stack">
            <header className="flex-between">
              <div>
                <h3>{studentData.student.name}</h3>
                <p className="subtle">
                  {studentData.student.cohort ?? "No cohort"} · Course {studentData.student.courseId}
                </p>
              </div>
            </header>
            <div className="recent-session-note">
              Mentor summary: students with{" "}
              <strong>
                {summary?.riskLevel === "high"
                  ? "high risk"
                  : summary?.riskLevel === "medium"
                  ? "medium risk"
                  : "healthy"}
              </strong>{" "}
              attendance should receive targeted support.
            </div>
          </div>

          <div className="card">
            <h3>Recent sessions</h3>
            {studentData.recentSessions.length === 0 ? (
              <p className="subtle">No sessions have been logged yet for this student.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Session</th>
                    <th>Status</th>
                    <th>Participation</th>
                    <th>Bonus</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {studentData.recentSessions.map((session) => {
                    const occurred = session.occurredAt
                      ? new Date(session.occurredAt).toLocaleString()
                      : "—";
                    const bonus = session.bonus.length
                      ? session.bonus
                          .map((item) => `${bonusLabels[item.code]} (+${item.points})`)
                          .join(", ")
                      : "—";
                    return (
                      <tr key={session.id}>
                        <td>{occurred}</td>
                        <td>{session.sessionName}</td>
                        <td>
                          <span className={statusTagClass[session.status]}>
                            {statusLabel[session.status]}
                          </span>
                        </td>
                        <td>{session.participation}</td>
                        <td>{bonus}</td>
                        <td>{session.notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default StudentDetailPage;
