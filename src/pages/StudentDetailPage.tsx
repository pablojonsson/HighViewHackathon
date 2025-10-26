import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const isTeacher = user?.role === "teacher";
  const isStudent = user?.role === "student";

  const courseParam = searchParams.get("courseId");
  const studentParam = searchParams.get("studentId");

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [roster, setRoster] = useState<Student[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [myStudents, setMyStudents] = useState<Student[]>([]);
  const [studentData, setStudentData] = useState<StudentDetailResponse | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);

  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => courseParam ?? "");
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => studentParam ?? "");

  useEffect(() => {
    if (!user) {
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
        setCoursesError(error instanceof Error ? error.message : "Unknown error loading companies");
      }
    };

    loadCourses();
  }, [user]);

  useEffect(() => {
    const loadMyStudents = async () => {
      if (!user || !isStudent) {
        setMyStudents([]);
        return;
      }

      try {
        const response = await fetch(`/api/students/by-user?userId=${encodeURIComponent(user.id)}`);
        if (!response.ok) {
          throw new Error("Failed to load students");
        }
        const data = (await response.json()) as { students: Student[] };
        setMyStudents(data.students);
      } catch (error) {
        console.error("Failed to load students for user", error);
        setMyStudents([]);
      }
    };

    loadMyStudents();
  }, [user, isStudent]);

  useEffect(() => {
    const loadRoster = async () => {
      if (!isTeacher || !selectedCourseId || !user) {
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
        const data = (await response.json()) as { roster: Student[] };
        setRoster(data.roster);

        if (studentParam && data.roster.some((student) => student.id === studentParam)) {
          setSelectedStudentId(studentParam);
        } else if (data.roster.length > 0) {
          const initialStudentId = data.roster[0].id;
          setSelectedStudentId(initialStudentId);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("studentId", initialStudentId);
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

    loadRoster();
  }, [isTeacher, selectedCourseId, studentParam, user]);

  useEffect(() => {
    if (!isStudent) {
      return;
    }

    const matching =
      selectedCourseId === ""
        ? myStudents
        : myStudents.filter((student) => student.courseId === selectedCourseId);

    setRoster(matching);

    if (matching.length === 0) {
      setSelectedStudentId("");
      return;
    }

    if (!selectedCourseId) {
      const initialCourseId = matching[0].courseId;
      setSelectedCourseId(initialCourseId);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("courseId", initialCourseId);
        return next;
      });
    }

    if (!selectedStudentId || !matching.some((student) => student.id === selectedStudentId)) {
      const initialStudentId = matching[0].id;
      setSelectedStudentId(initialStudentId);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("studentId", initialStudentId);
        return next;
      });
    }
  }, [isStudent, myStudents, selectedCourseId, selectedStudentId, setSearchParams]);

  useEffect(() => {
    const loadStudent = async () => {
      if (!user || !selectedStudentId) {
        setStudentData(null);
        return;
      }

      try {
        setStudentLoading(true);
        setStudentError(null);
        const params = new URLSearchParams({
          role: user.role,
          userId: user.id
        });
        const response = await fetch(`/api/students/${selectedStudentId}?${params.toString()}`);
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

    loadStudent();
  }, [user, selectedStudentId]);

  const summary = useMemo(() => {
    if (!studentData) {
      return null;
    }

    const totalSessions = studentData.stats.totalSessions ?? 0;
    const attendanceRate = studentData.stats.attendanceRate ?? 0;
    const bonusPoints = studentData.stats.bonusPoints ?? 0;
    const participationScore = Number(studentData.stats.averageParticipation ?? 0);
    const riskLevel =
      attendanceRate < 70
        ? "high"
        : attendanceRate < 85
        ? "medium"
        : "low";

    return {
      totalSessions,
      attendanceRate,
      bonusPoints,
      participationScore,
      riskLevel
    };
  }, [studentData]);

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("courseId", courseId);
      return next;
    });
  };

  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("studentId", studentId);
      return next;
    });
  };

  return (
    <div className="stack">
      <div className="card stack">
        <header className="flex-between">
          <div>
            <h2>{isStudent ? "My summary" : "Student diagnostics"}</h2>
            <p className="subtle">
              {isStudent
                ? "Review your attendance and participation trend."
                : "Drill into attendance trends, participation, and support needs for a single learner."}
            </p>
          </div>
        </header>

        {coursesError ? (
          <div className="error-message">{coursesError}</div>
        ) : (
          <div className="selector-grid">
            <div className="selector-field">
              <label htmlFor="course-select">Company</label>
              <select
                id="course-select"
                value={selectedCourseId}
                onChange={(event) => handleCourseChange(event.target.value)}
              >
                <option value="" disabled>
                  Select company
                </option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>
            {isTeacher && (
              <div className="selector-field">
                <label htmlFor="student-select">Student</label>
                <select
                  id="student-select"
                  value={selectedStudentId}
                  onChange={(event) => handleStudentChange(event.target.value)}
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
            )}
          </div>
        )}

        {isTeacher && rosterLoading && <div className="subtle">Loading roster...</div>}
        {isTeacher && rosterError && <div className="error-message">{rosterError}</div>}
      </div>

      {studentLoading ? (
        <div className="card">
          <p className="subtle">Loading student diagnostics...</p>
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
              <span
                className={
                  summary?.riskLevel === "high"
                    ? "tag danger"
                    : summary?.riskLevel === "medium"
                    ? "tag warning"
                    : "tag success"
                }
              >
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
              <span className="tag neutral">Scale 0-5</span>
            </div>
            <div className="stat-card">
              <p className="subtle">Sessions logged</p>
              <h3>{summary?.totalSessions ?? 0}</h3>
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
                  {studentData.student.cohort ?? "No cohort"} · Company {studentData.student.courseId}
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
                      : "-";
                    const bonus = session.bonus.length
                      ? session.bonus
                          .map((item) => `${bonusLabels[item.code]} (+${item.points})`)
                          .join(", ")
                      : "-";
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
                        <td>{session.notes || "-"}</td>
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
