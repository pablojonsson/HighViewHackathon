import { useCallback, useEffect, useMemo, useState } from "react";
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

type StudentDetailResponse = {
  student: {
    id: string;
    name: string;
    cohort: string | null;
    courseId: string;
    email: string | null;
  };
  stats: {
    totalSessions: number;
    attendanceRate: number;
    averageAttendancePoints: string;
    bonusPoints: number;
  };
  recentSessions: Array<{
    id: string;
    status: AttendanceStatus;
    occurredAt: string;
    sessionName: string;
    bonus: Array<{ code: string; points: number }>;
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

const bonusLabels: Record<string, string> = {
  participation: "Participation",
  thank_you: "Thank you notes",
  video_content: "Video content",
  additional_event: "Additional event"
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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; sessionName: string } | null>(
    null
  );

  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => courseParam ?? "");
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => studentParam ?? "");

  const openGmailCompose = useCallback((email: string | null) => {
    if (!email) {
      return;
    }
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

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
  }, [user, courseParam, selectedCourseId, setSearchParams]);

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
  }, [isTeacher, selectedCourseId, studentParam, user, setSearchParams]);

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

  const fetchStudentDetail = useCallback(async () => {
    if (!user || !selectedStudentId) {
      setDeleteError(null);
      setStudentData(null);
      return;
    }

    try {
      setStudentLoading(true);
      setStudentError(null);
      setDeleteError(null);
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
  }, [selectedStudentId, user]);

  useEffect(() => {
    fetchStudentDetail();
  }, [fetchStudentDetail]);

  const summary = useMemo(() => {
    if (!studentData) {
      return null;
    }

    const totalSessions = studentData.stats.totalSessions ?? 0;
    const attendanceRate = studentData.stats.attendanceRate ?? 0;
    const bonusPoints = studentData.stats.bonusPoints ?? 0;
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

  const handleRequestDelete = (recordId: string, sessionName: string) => {
    if (!isTeacher) {
      return;
    }
    setDeleteError(null);
    setPendingDelete({ id: recordId, sessionName });
  };

  const handleDeleteSession = async (recordId: string) => {
    if (!isTeacher || !user) {
      return;
    }

    try {
      setDeleteError(null);
      setDeletingRecordId(recordId);
      const params = new URLSearchParams({
        role: user.role,
        userId: user.id
      });
      const response = await fetch(
        `/api/attendance-records/${recordId}?${params.toString()}`,
        {
          method: "DELETE"
        }
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to delete entry");
      }

      await fetchStudentDetail();
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete entry");
    } finally {
      setDeletingRecordId(null);
    }
  };

  return (
    <div className="stack">
      <div className="card stack diagnostics-card">
        <header className="flex-between">
          <div>
            <h2>{isStudent ? "My Summary" : "Student diagnostics"}</h2>
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
              <div className="attendance-row">
                <h3>{summary ? `${summary.attendanceRate}%` : "0%"}</h3>
                {isTeacher && studentData.student.email && (
                  <button
                    type="button"
                    className={`icon-btn neutral${
                      summary?.riskLevel === "high" ? " pulse-danger" : ""
                    }`}
                    onClick={() => openGmailCompose(studentData.student.email)}
                    aria-label={`Email ${studentData.student.name}`}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M4.75 6h14.5A1.75 1.75 0 0 1 21 7.75v8.5A1.75 1.75 0 0 1 19.25 18H4.75A1.75 1.75 0 0 1 3 16.25v-8.5A1.75 1.75 0 0 1 4.75 6Zm0 .75L12 11.5l7.25-4.75H4.75Zm0 1.31v8.19h14.5V8.06l-6.9 4.53a0.75 0.75 0 0 1-.8 0L4.75 8.06Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                )}
              </div>
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
              <p className="subtle">Sessions logged</p>
              <h3>{summary?.totalSessions ?? 0}</h3>
            </div>
            <div className="stat-card">
              <p className="subtle">Bonus points</p>
              <h3>{summary?.bonusPoints ?? 0}</h3>
            </div>
          </div>

          <div className="card">
            <h3>Recent sessions</h3>
            {studentData.recentSessions.length === 0 ? (
              <p className="subtle">No sessions have been logged yet for this student.</p>
            ) : (
              <>
                {isTeacher && deleteError && <p className="error-message">{deleteError}</p>}
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Session</th>
                      <th>Status</th>
                      <th>Bonus</th>
                      {isTeacher && <th className="actions-column">Actions</th>}
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
                          <td>{bonus}</td>
                          {isTeacher && (
                            <td className="actions-column">
                              <button
                                type="button"
                                className="icon-btn danger"
                                onClick={() => handleRequestDelete(session.id, session.sessionName)}
                                disabled={deletingRecordId === session.id}
                                aria-label="Delete this entry"
                              >
                                <svg
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    d="M9 4.5h6m-8 3h10m-1 0-.666 10c-.045.687-.621 1.25-1.31 1.25H9.976c-.689 0-1.265-.563-1.31-1.25L8 7.5m3 3v6m4-6v6"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </>
      )}
      {isTeacher && pendingDelete && (
        <div className="confirm-backdrop">
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-entry-title"
            aria-describedby="delete-entry-description"
          >
            <h4 id="delete-entry-title">Delete entry?</h4>
            <p id="delete-entry-description">Are you sure you want to delete this entry?</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn neutral"
                onClick={() => setPendingDelete(null)}
                disabled={deletingRecordId === pendingDelete.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => handleDeleteSession(pendingDelete.id)}
                disabled={deletingRecordId === pendingDelete.id}
              >
                {deletingRecordId === pendingDelete.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDetailPage;
