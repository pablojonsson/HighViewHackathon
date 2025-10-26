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
  attendancePointsAvg: number;
  bonusPoints: number;
  sessionNames: string[];
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
  const sectionParam = searchParams.get("section");
  const normalizedSectionParam =
    sectionParam && sectionParam.trim().length > 0 ? sectionParam.trim() : null;
  const { user } = useAuth();
  const role = user?.role ?? null;

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => courseParam ?? "");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [myStudentIds, setMyStudentIds] = useState<string[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>(normalizedSectionParam ?? "all");
  const [availableSections, setAvailableSections] = useState<string[]>(() =>
    normalizedSectionParam && normalizedSectionParam !== "all"
      ? ["all", normalizedSectionParam]
      : ["all"]
  );
  const [hasFetchedSections, setHasFetchedSections] = useState(false);

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
          const initial = courseParam ?? data.courses[0].id;
          setSelectedCourseId(initial);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("courseId", initial);
            return next;
          });
        }
      } catch (err) {
        setCoursesError(err instanceof Error ? err.message : "Unknown error loading companies");
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
        if (selectedSection !== "all") {
          params.set("sessionName", selectedSection);
        }
        const query = params.toString() ? `?${params.toString()}` : "";
        const response = await fetch(`/api/leaderboard${query}`);
        if (!response.ok) {
          throw new Error("Failed to load leaderboard");
        }
        const data = (await response.json()) as { leaderboard: LeaderboardEntry[] };
        const normalizedEntries = data.leaderboard.map((entry) => ({
          ...entry,
          sessionNames: (entry.sessionNames ?? [])
            .map((name) => name.trim())
            .filter((name) => name.length > 0)
        }));
        setEntries(normalizedEntries);
        const uniqueSessions = new Set<string>();
        normalizedEntries.forEach((entry) => {
          entry.sessionNames.forEach((session) => {
            if (session.toLowerCase() === "all") {
              return;
            }
            uniqueSessions.add(session);
          });
        });
        if (selectedSection === "all") {
          const sorted = Array.from(uniqueSessions).sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: "base" })
          );
          setAvailableSections(["all", ...sorted]);
        } else {
          setAvailableSections((prev) => {
            const merged = new Set(prev);
            if (uniqueSessions.size === 0 && selectedSection) {
              merged.add(selectedSection);
            } else {
              uniqueSessions.forEach((session) => merged.add(session));
            }
            const sorted = Array.from(merged)
              .filter((name) => name !== "all")
              .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
            return ["all", ...sorted];
          });
        }
        setHasFetchedSections(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error loading leaderboard");
        setEntries([]);
        if (selectedSection !== "all") {
          setSelectedSection("all");
        }
      } finally {
        setLoading(false);
      }
    };

    if (user && selectedCourseId) {
      loadLeaderboard();
    } else if (!selectedCourseId) {
      setEntries([]);
      setAvailableSections(["all"]);
      setHasFetchedSections(false);
      if (selectedSection !== "all") {
        setSelectedSection("all");
      }
    }
  }, [selectedCourseId, selectedSection, user]);

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

  useEffect(() => {
    if (
      hasFetchedSections &&
      selectedSection !== "all" &&
      !availableSections.includes(selectedSection)
    ) {
      setSelectedSection("all");
    }
  }, [availableSections, hasFetchedSections, selectedSection]);

  const filteredEntries = useMemo(() => {
    if (selectedSection === "all") {
      return entries;
    }

    return entries.filter((entry) => entry.sessionNames.includes(selectedSection));
  }, [entries, selectedSection]);

  const summary = useMemo(() => {
    if (!filteredEntries.length) {
      return null;
    }

    const totalStudents = filteredEntries.length;
    const highRisk = filteredEntries.filter((entry) => entry.riskLevel === "high").length;
    const averageAttendance = Math.round(
      filteredEntries.reduce((sum, entry) => sum + entry.attendanceRate, 0) / totalStudents
    );
    const averageAttendancePoints = (
      filteredEntries.reduce((sum, entry) => sum + entry.attendancePointsAvg, 0) / totalStudents
    ).toFixed(1);
    const bonusPoints = filteredEntries.reduce((sum, entry) => sum + entry.bonusPoints, 0);

    return {
      totalStudents,
      highRisk,
      averageAttendance,
      averageAttendancePoints,
      bonusPoints
    };
  }, [filteredEntries]);

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedSection("all");
    setAvailableSections(["all"]);
    setHasFetchedSections(false);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("courseId", courseId);
      next.delete("section");
      return next;
    });
  };

  useEffect(() => {
    setSearchParams((prev) => {
      const current = prev.get("section");
      if (selectedSection === "all") {
        if (!current) {
          return prev;
        }
        const next = new URLSearchParams(prev);
        next.delete("section");
        return next;
      }
      if (current === selectedSection) {
        return prev;
      }
      const next = new URLSearchParams(prev);
      next.set("section", selectedSection);
      return next;
    });
  }, [selectedSection, setSearchParams]);

  const showRiskColumn = role === "teacher";

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
            <h2>Leaderboard</h2>
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
            <div className="selector-field">
              <label htmlFor="section-select">Section</label>
              <select
                id="section-select"
                value={selectedSection}
                onChange={(event) => setSelectedSection(event.target.value)}
                disabled={availableSections.length <= 1}
              >
                {availableSections.map((section) => (
                  <option key={section} value={section}>
                    {section === "all" ? "All sections" : section}
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
            {role === "teacher" && (
              <>
                <span className="tag neutral">
                  Avg attendance pts {summary.averageAttendancePoints}
                </span>
                <span className="tag bonus">Bonus total {summary.bonusPoints}</span>
                {summary.highRisk > 0 && (
                  <span className="tag danger">{summary.highRisk} high risk</span>
                )}
              </>
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
        ) : filteredEntries.length === 0 ? (
          <p className="subtle">
            {selectedSection === "all"
              ? "No entries yet. Log attendance to populate standings."
              : "No entries for this section yet."}
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Attendance</th>
                <th>Bonus</th>
                {showRiskColumn && <th>Risk</th>}
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry, index) => {
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
                      </div>
                    </td>
                    <td>{entry.attendanceRate}%</td>
                    <td>{entry.bonusPoints}</td>
                    {showRiskColumn && (
                      <td>
                        <span className={riskTagClass[entry.riskLevel]}>
                          {entry.riskLevel === "high"
                            ? "High"
                            : entry.riskLevel === "medium"
                              ? "Medium"
                              : "Low"}
                        </span>
                      </td>
                    )}
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
