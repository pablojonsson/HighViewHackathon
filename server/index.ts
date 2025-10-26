import "dotenv/config";
import express, { Request, Response } from "express";
// eslint-disable-next-line @typescript-eslint/no-var-requires
// @ts-ignore
import cors from "cors";
import { query, withTransaction, PoolClient } from "./db";
import { syncClassroomFromCode } from "./services/googleClassroom";

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
    credentials: false
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/courses", async (req, res) => {
  const roleParam = typeof req.query.role === "string" ? req.query.role : null;
  const userId = typeof req.query.userId === "string" ? req.query.userId : null;

  try {
    let result;

    if (userId && roleParam === "teacher") {
      result = await query<{ id: string; name: string }>(
        `
          SELECT DISTINCT c.id, c.name
          FROM courses c
          JOIN course_teachers ct ON ct.course_id = c.id
          WHERE ct.user_id = $1
            AND c.google_course_id IS NOT NULL
            AND COALESCE(c.course_state, 'ACTIVE') = 'ACTIVE'
          ORDER BY c.name ASC
        `,
        [userId]
      );
    } else if (userId && roleParam === "student") {
      result = await query<{ id: string; name: string }>(
        `
          SELECT DISTINCT c.id, c.name
          FROM courses c
          JOIN students s ON s.course_id = c.id
          WHERE s.user_id = $1
            AND c.google_course_id IS NOT NULL
            AND COALESCE(c.course_state, 'ACTIVE') = 'ACTIVE'
          ORDER BY c.name ASC
        `,
        [userId]
      );
    } else {
      result = await query<{ id: string; name: string }>(
        `
          SELECT id, name
          FROM courses
          WHERE google_course_id IS NOT NULL
            AND COALESCE(course_state, 'ACTIVE') = 'ACTIVE'
          ORDER BY name ASC
        `
      );
    }

    res.json({ courses: result.rows });
  } catch (error) {
    console.error("Failed to load courses", error);
    res.status(500).send("Failed to load courses");
  }
});

app.get("/api/roster", async (req, res) => {
  const courseId = typeof req.query.courseId === "string" ? req.query.courseId : null;
  const roleParam = typeof req.query.role === "string" ? req.query.role : null;
  const userId = typeof req.query.userId === "string" ? req.query.userId : null;

  if (roleParam !== "teacher") {
    return res.status(403).send("Only teachers can view course rosters");
  }

  try {
    if (courseId && userId) {
      const teacherResult = await query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM course_teachers
            WHERE course_id = $1 AND user_id = $2
          ) AS exists
        `,
        [courseId, userId]
      );

      if (!teacherResult.rows[0]?.exists) {
        return res.status(403).send("Not authorized to view this roster");
      }
    }

    const result = await query<{
      id: string;
      name: string;
      cohort: string | null;
      course_id: string;
    }>(
      `
        SELECT id, name, cohort, course_id
        FROM students
        WHERE ($1::text IS NULL OR course_id = $1)
        ORDER BY name ASC
      `,
      [courseId]
    );

    res.json({
      roster: result.rows.map((row: { id: string; name: string; cohort: string | null; course_id: string }) => ({
        id: row.id,
        name: row.name,
        cohort: row.cohort,
        courseId: row.course_id
      }))
    });
  } catch (error) {
    console.error("Failed to load roster", error);
    res.status(500).send("Failed to load roster");
  }
});

app.post("/api/sessions", async (req: Request, res: Response) => {
  const payload = req.body as {
    sessionName?: string;
    courseId?: string;
    occurredAt?: string;
    entries?: Array<{
      studentId: string;
      status: string;
      participation: number;
      bonus?: string[];
      notes?: string;
    }>;
  };

  if (!payload.sessionName || typeof payload.sessionName !== "string") {
    return res.status(400).send("sessionName is required");
  }
  if (!payload.courseId || typeof payload.courseId !== "string") {
    return res.status(400).send("courseId is required");
  }
  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    return res.status(400).send("entries must be a non-empty array");
  }

  const allowedStatuses = new Set<AttendanceStatus>(["present", "late", "excused", "absent"]);

  try {
    const sessionId = await withTransaction<string>(async (client: PoolClient) => {
      const sessionResult = await client.query<{ id: string }>(
        `
          INSERT INTO sessions (course_id, name, occurred_at)
          VALUES ($1, $2, COALESCE($3::timestamptz, NOW()))
          RETURNING id
        `,
        [payload.courseId, payload.sessionName, payload.occurredAt ?? null]
      );

      const insertedSessionId = sessionResult.rows[0].id;

      if (!Array.isArray(payload.entries)) {
        throw new Error("entries must be an array");
      }

      for (const entry of payload.entries) {
        if (!entry || typeof entry.studentId !== "string") {
          throw new Error("Invalid studentId in entries");
        }

        if (!allowedStatuses.has(entry.status as AttendanceStatus)) {
          throw new Error(`Invalid attendance status for student ${entry.studentId}`);
        }

        const participation =
          typeof entry.participation === "number" && entry.participation >= 0
            ? Math.min(Math.round(entry.participation), 5)
            : 0;

        const recordResult = await client.query<{ id: string }>(
          `
            INSERT INTO attendance_records (session_id, student_id, status, participation, notes)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `,
          [
            insertedSessionId,
            entry.studentId,
            entry.status,
            participation,
            entry.notes ?? ""
          ]
        );

        const recordId = recordResult.rows[0].id;

        if (Array.isArray(entry.bonus)) {
          for (const bonusCode of entry.bonus) {
            const points = bonusPointMap[bonusCode as BonusCode];
            if (!points) {
              continue;
            }

            await client.query(
              `
                INSERT INTO bonus_events (attendance_record_id, code, points)
                VALUES ($1, $2, $3)
              `,
              [recordId, bonusCode, points]
            );
          }
        }
      }

      return insertedSessionId;
    });

    res.status(201).json({ sessionId });
  } catch (error) {
    console.error("Failed to save session", error);
    res.status(500).send(
      error instanceof Error ? error.message : "Failed to save session"
    );
  }
});

app.post("/api/classroom/sync", async (req, res) => {
  const { code } = req.body ?? {};

  if (typeof code !== "string") {
    return res.status(400).json({ error: "code is required" });
  }

  try {
    const summary = await syncClassroomFromCode({ code });
    res.json(summary);
  } catch (error) {
    console.error("Failed to sync Google Classroom data", error);
    res.status(500).json({ error: "Failed to sync Google Classroom data" });
  }
});

app.get("/api/students/by-user", async (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : null;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const result = await query<{
      id: string;
      name: string;
      cohort: string | null;
      course_id: string;
    }>(
      `
        SELECT id, name, cohort, course_id
        FROM students
        WHERE user_id = $1
        ORDER BY name ASC
      `,
      [userId]
    );

    res.json({
      students: result.rows.map((row: { id: string; name: string; cohort: string | null; course_id: string }) => ({
        id: row.id,
        name: row.name,
        cohort: row.cohort,
        courseId: row.course_id
      }))
    });
  } catch (error) {
    console.error("Failed to load students for user", error);
    res.status(500).json({ error: "Failed to load students" });
  }
});

app.get("/api/students/:studentId", async (req, res) => {
  const { studentId } = req.params;
  const roleParam = typeof req.query.role === "string" ? req.query.role : null;
  const userId = typeof req.query.userId === "string" ? req.query.userId : null;

  try {
    const studentResult = await query<{
      id: string;
      name: string;
      cohort: string | null;
      course_id: string;
      user_id: string | null;
    }>(
      `
        SELECT id, name, cohort, course_id, user_id
        FROM students
        WHERE id = $1
      `,
      [studentId]
    );

    if (studentResult.rowCount === 0) {
      return res.status(404).send("Student not found");
    }

    if (!roleParam || !userId) {
      return res.status(400).json({ error: "role and userId are required" });
    }

    const student = studentResult.rows[0];

    if (roleParam === "student") {
      if (student.user_id !== userId) {
        return res.status(403).send("Not authorized to view this summary");
      }
    } else if (roleParam === "teacher") {
      const teacherResult = await query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM course_teachers
            WHERE course_id = $1 AND user_id = $2
          ) AS exists
        `,
        [student.course_id, userId]
      );

      if (!teacherResult.rows[0]?.exists) {
        return res.status(403).send("Not authorized to view this student");
      }
    } else {
      return res.status(403).send("Not authorized");
    }

    const recordsResult = await query<{
      id: string;
      status: AttendanceStatus;
      participation: number;
      notes: string;
      occurred_at: string;
      session_name: string;
    }>(
      `
        SELECT
          ar.id,
          ar.status,
          ar.participation,
          ar.notes,
          s.occurred_at,
          s.name AS session_name
        FROM attendance_records ar
        JOIN sessions s ON s.id = ar.session_id
        WHERE ar.student_id = $1
        ORDER BY s.occurred_at DESC
        LIMIT 30
      `,
      [studentId]
    );

    const recordIds = recordsResult.rows.map((record: { id: string }) => record.id);
    const bonusResult =
      recordIds.length > 0
        ? await query<{
            attendance_record_id: string;
            code: string;
            points: number;
          }>(
            `
              SELECT attendance_record_id, code, points
              FROM bonus_events
              WHERE attendance_record_id = ANY($1::uuid[])
            `,
            [recordIds]
          )
        : { rows: [] };

    const bonusByRecord = new Map<string, Array<{ code: string; points: number }>>();
    bonusResult.rows.forEach((row: { attendance_record_id: string; code: string; points: number }) => {
      const existing = bonusByRecord.get(row.attendance_record_id) || [];
      existing.push({ code: row.code, points: row.points });
      bonusByRecord.set(row.attendance_record_id, existing);
    });

    const totalSessions = recordsResult.rowCount;
    const presentSessions = recordsResult.rows.filter((record: { status: AttendanceStatus }) => record.status === "present").length;
    const attendanceRate = totalSessions > 0 ? Math.round((presentSessions / totalSessions) * 100) : 0;
    const averageParticipation =
      totalSessions > 0
        ? (recordsResult.rows.reduce((sum: number, record: { participation: number }) => sum + record.participation, 0) /
            totalSessions
          ).toFixed(1)
        : "0.0";
    const bonusPoints = bonusResult.rows.reduce((sum: number, row: { points: number }) => sum + row.points, 0);

    res.json({
      student: {
        id: student.id,
        name: student.name,
        cohort: student.cohort,
        courseId: student.course_id
      },
      stats: {
        totalSessions,
        attendanceRate,
        averageParticipation,
        bonusPoints
      },
      recentSessions: recordsResult.rows.map((record: {
        id: string;
        status: AttendanceStatus;
        participation: number;
        notes: string;
        occurred_at: string;
        session_name: string;
      }) => ({
        id: record.id,
        status: record.status,
        participation: record.participation,
        notes: record.notes,
        occurredAt: record.occurred_at,
        sessionName: record.session_name,
        bonus: bonusByRecord.get(record.id) ?? []
      }))
    });
  } catch (error) {
    console.error(`Failed to load data for student ${req.params.studentId}`, error);
    res.status(500).send("Failed to load student data");
  }
});

app.get("/api/leaderboard", async (req, res) => {
  const courseId = typeof req.query.courseId === "string" ? req.query.courseId : null;
  const roleParam = typeof req.query.role === "string" ? req.query.role : null;
  const userId = typeof req.query.userId === "string" ? req.query.userId : null;

  try {
    let allowedCourseIds: string[] | null = null;

    if (roleParam === "teacher" && userId) {
      const allowed = await query<{ course_id: string }>(
        `
          SELECT course_id
          FROM course_teachers
          WHERE user_id = $1
        `,
        [userId]
      );
      allowedCourseIds = allowed.rows.map((row: { course_id: string }) => row.course_id);
    } else if (roleParam === "student" && userId) {
      const allowed = await query<{ course_id: string }>(
        `
          SELECT DISTINCT course_id
          FROM students
          WHERE user_id = $1
        `,
        [userId]
      );
      allowedCourseIds = allowed.rows.map((row: { course_id: string }) => row.course_id);
    }

    if (allowedCourseIds && allowedCourseIds.length === 0) {
      return res.json({ leaderboard: [] });
    }

    if (courseId && allowedCourseIds && !allowedCourseIds.includes(courseId)) {
      return res.status(403).json({ error: "Not authorized to view this course" });
    }

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (courseId) {
      whereClauses.push(`st.course_id = $${params.length + 1}`);
      params.push(courseId);
    }

    if (allowedCourseIds) {
      whereClauses.push(`st.course_id = ANY($${params.length + 1}::text[])`);
      params.push(allowedCourseIds);
    }

    const whereSql = whereClauses.length > 0 ? whereClauses.join(" AND ") : "TRUE";

    const result = await query<{
      student_id: string;
      name: string;
      cohort: string | null;
      course_id: string;
      total_sessions: number;
      attendance_rate: number;
      avg_participation: number;
      bonus_points: number;
    }>(
      `
        SELECT
          st.id AS student_id,
          st.name,
          st.cohort,
          st.course_id,
          COUNT(DISTINCT s.id) AS total_sessions,
          COALESCE(AVG(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END)::float * 100, 0) AS attendance_rate,
          COALESCE(AVG(ar.participation)::float, 0) AS avg_participation,
          COALESCE(SUM(be.points)::float, 0) AS bonus_points
        FROM students st
        LEFT JOIN attendance_records ar ON ar.student_id = st.id
        LEFT JOIN sessions s ON s.id = ar.session_id
        LEFT JOIN bonus_events be ON be.attendance_record_id = ar.id
        WHERE ${whereSql}
        GROUP BY st.id
        ORDER BY avg_participation DESC, attendance_rate DESC, st.name ASC
      `,
      params
    );

    const leaderboard = result.rows.map((row: {
      student_id: string;
      name: string;
      cohort: string | null;
      course_id: string;
      total_sessions: number;
      attendance_rate: number;
      avg_participation: number;
      bonus_points: number;
    }) => ({
      studentId: row.student_id,
      name: row.name,
      cohort: row.cohort,
      courseId: row.course_id,
      attendanceRate: Math.round(row.attendance_rate),
      participationScore: Number(row.avg_participation.toFixed(1)),
      bonusPoints: Number(row.bonus_points),
      riskLevel:
        row.attendance_rate < 0.7 * 100
          ? "high"
          : row.attendance_rate < 0.85 * 100
          ? "medium"
          : "low"
    }));

    res.json({ leaderboard });
  } catch (error) {
    console.error("Failed to load leaderboard", error);
    res.status(500).send("Failed to load leaderboard");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

type AttendanceStatus = "present" | "late" | "excused" | "absent";
type BonusCode = "lead" | "mentor" | "project";

const bonusPointMap: Record<BonusCode, number> = {
  lead: 2,
  mentor: 1,
  project: 3
};