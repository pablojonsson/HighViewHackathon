import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type Course = {
  id: string;
  name: string;
};

type LeaderboardEntry = {
  studentId: string;
  name: string;
  cohort: string | null;
  courseId: string;
  attendanceRate: number;
  participationScore: number;
  bonusPoints: number;
  riskLevel: "low" | "medium" | "high";
};

const riskTagClass: Record<LeaderboardEntry["riskLevel"], string> = {
  low: "tag success",
  medium: "tag warning",
  high: "tag danger"
};

const LeaderboardPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const courseParam = searchParams.get("courseId");
  const { user } = useAuth();
  const role = user?.role ?? null;

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => courseParam ?? "");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [myStudentIds, setMyStudentIds] = useState<string[]>([]);

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
          throw new Error("Failed to load courses");
        }
        const data = (await response.json()) as { courses: Course[] };
        setCourses(data.courses);

        if (!selectedCourseId && data.courses.length > 0) {
          const initial = courseParam ?? data.courses[0].id;
          setSelectedCourseId(initial);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("courseId", initial);
            return next;
          });
        }
      } catch (err) {
        setCoursesError(err instanceof Error ? err.message : "Unknown error loading courses");
      }
    };

    loadCourses();
  }, [user]);

  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (selectedCourseId) {
          params.set("courseId", selectedCourseId);
        }
        if (user) {
          params.set("role", user.role);
          params.set("userId", user.id);
        }
        const query = params.toString() ? `?${params.toString()}` : "";
        const response = await fetch(`/api/leaderboard${query}`);
        if (!response.ok) {
          throw new Error("Failed to load leaderboard");
        }
        const data = (await response.json()) as { leaderboard: LeaderboardEntry[] };
        setEntries(data.leaderboard);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error loading leaderboard");
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadLeaderboard();
    }
  }, [selectedCourseId, user]);

  useEffect(() => {
    const loadMyStudentIds = async () => {
      if (!user || user.role !== "student") {
        setMyStudentIds([]);
        return;
      }

      try {
        const response = await fetch(`/api/students/by-user?userId=${encodeURIComponent(user.id)}`);
        if (!response.ok) {
          throw new Error("Failed to load student records");
        }
        const data = (await response.json()) as { students: Array<{ id: string }> };
        setMyStudentIds(data.students.map((student) => student.id));
      } catch (err) {
        console.error("Failed to load student records", err);
        setMyStudentIds([]);
      }
    };

    loadMyStudentIds();
  }, [user]);

  const summary = useMemo(() => {
    if (!entries.length) {
      return null;
    }

    const totalStudents = entries.length;
    const highRisk = entries.filter((entry) => entry.riskLevel === "high").length;
    const averageAttendance = Math.round(
      entries.reduce((sum, entry) => sum + entry.attendanceRate, 0) / totalStudents
    );
    const averageParticipation = (
      entries.reduce((sum, entry) => sum + entry.participationScore, 0) / totalStudents
    ).toFixed(1);
    const bonusPoints = entries.reduce((sum, entry) => sum + entry.bonusPoints, 0);

    return {
      totalStudents,
      highRisk,
      averageAttendance,
      averageParticipation,
      bonusPoints
    };
  }, [entries]);

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("courseId", courseId);
      return next;
    });
  };

  const handleRowClick = (entry: LeaderboardEntry) => {
    const canOpen =
      role === "teacher" || (role === "student" && myStudentIds.includes(entry.studentId));

    if (!canOpen) {
      return;
    }

    navigate(`/mock/student?courseId=${entry.courseId}&studentId=${entry.studentId}`);
  };

  return (
    <div className="stack">
      <div className="card stack">
        <header className="flex-between">
          <div>
            <h2>Class leaderboard</h2>
            <p className="subtle">
              Attendance and participation standings update as teachers log sessions.
            </p>
          </div>
        </header>

        {coursesError ? (
          <div className="error-message">{coursesError}</div>
        ) : (
          <div className="selector-grid">
            <div className="selector-field">
              <label htmlFor="course-select">Course</label>
              <select
                id="course-select"
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
          </div>
        )}

        {summary && (
          <div className="leaderboard-summary">
            <span className="tag neutral">Students {summary.totalStudents}</span>
            <span className="tag success">Avg attendance {summary.averageAttendance}%</span>
            <span className="tag neutral">Avg participation {summary.averageParticipation}</span>
            <span className="tag bonus">Bonus total {summary.bonusPoints}</span>
            {summary.highRisk > 0 && (
              <span className="tag danger">{summary.highRisk} high risk</span>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Leaderboard</h3>
        {loading ? (
          <p className="subtle">Loading leaderboard...</p>
        ) : error ? (
          <p className="error-message">{error}</p>
        ) : entries.length === 0 ? (
          <p className="subtle">No entries yet. Log attendance to populate standings.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Attendance</th>
                <th>Participation</th>
                <th>Bonus</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => {
                const canOpen =
                  role === "teacher" || (role === "student" && myStudentIds.includes(entry.studentId));

                return (
                  <tr
                    key={entry.studentId}
                    className={canOpen ? "clickable-row" : undefined}
                    onClick={canOpen ? () => handleRowClick(entry) : undefined}
                    style={canOpen ? undefined : { cursor: "default" }}
                  >
                    <td>{index + 1}</td>
                    <td>
                      <div className="student-cell">
                        <strong>{entry.name}</strong>
                        <span className="subtle">{entry.cohort ?? "No cohort"}</span>
                      </div>
                    </td>
                    <td>{entry.attendanceRate}%</td>
                    <td>{entry.participationScore.toFixed(1)}</td>
                    <td>{entry.bonusPoints}</td>
                    <td>
                      <span className={riskTagClass[entry.riskLevel]}>
                        {entry.riskLevel === "high"
                          ? "High"
                          : entry.riskLevel === "medium"
                          ? "Medium"
                          : "Low"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LeaderboardPage;