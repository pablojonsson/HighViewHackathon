import "dotenv/config";
import express, { Request, Response } from "express";
// eslint-disable-next-line @typescript-eslint/no-var-requires
// @ts-ignore
import cors from "cors";
import {
  attendancePoints,
  bonusPointMap,
  query,
  withTransaction,
  type PoolClient
} from "./db";
import { refreshTeacherCourseRoster, syncClassroomFromCode } from "./services/googleClassroom";

class DuplicateSessionEntryError extends Error {
  duplicates: string[];

  constructor(duplicateNames: string[]) {
    const uniqueNames = Array.from(new Set(duplicateNames));
    const message =
      uniqueNames.length === 1
        ? `${uniqueNames[0]} already has a record for this section and company.`
        : `The following students already have records for this section and company: ${uniqueNames.join(", ")}.`;
    super(message);
    this.name = "DuplicateSessionEntryError";
    this.duplicates = uniqueNames;
    Object.setPrototypeOf(this, DuplicateSessionEntryError.prototype);
  }
}

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

      try {
        await refreshTeacherCourseRoster({ userId, courseId });
      } catch (error) {
        console.error("Failed to refresh roster before response", error);
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
      bonus?: string[];
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
  const trimmedSessionName = payload.sessionName.trim();
  if (!trimmedSessionName) {
    return res.status(400).send("sessionName is required");
  }
  const uniqueStudentIds = Array.from(
    new Set(
      (payload.entries ?? [])
        .map((entry) => entry?.studentId)
        .filter((studentId): studentId is string => typeof studentId === "string" && studentId.length > 0)
    )
  );

  try {
    const sessionId = await withTransaction<string>(async (client: PoolClient) => {
      if (uniqueStudentIds.length > 0) {
        const duplicateResult = await client.query<{
          student_id: string;
          student_name: string | null;
        }>(
          `
            SELECT ar.student_id, COALESCE(st.name, ar.student_id) AS student_name
            FROM attendance_records ar
            JOIN sessions s ON s.id = ar.session_id
            LEFT JOIN students st ON st.id = ar.student_id
            WHERE s.course_id = $1
              AND LOWER(TRIM(s.name)) = LOWER($2)
              AND ar.student_id = ANY($3::text[])
          `,
          [payload.courseId, trimmedSessionName, uniqueStudentIds]
        );

        if (duplicateResult.rowCount > 0) {
          const duplicateNames = duplicateResult.rows.map((row) => row.student_name ?? row.student_id);
          throw new DuplicateSessionEntryError(duplicateNames);
        }
      }

      const sessionResult = await client.query<{ id: string }>(
        `
          INSERT INTO sessions (course_id, name, occurred_at)
          VALUES ($1, $2, COALESCE($3::timestamptz, NOW()))
          RETURNING id
        `,
        [payload.courseId, trimmedSessionName, payload.occurredAt ?? null]
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

        const attendanceValue =
          attendancePoints[entry.status as AttendanceStatus] ?? attendancePoints.absent;

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
            attendanceValue,
            ""
          ]
        );

        const recordId = recordResult.rows[0].id;

        if (Array.isArray(entry.bonus)) {
          for (const bonusCode of entry.bonus) {
            const points = bonusPointMap[bonusCode] ?? 0;
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
    if (error instanceof DuplicateSessionEntryError) {
      return res.status(409).send(error.message);
    }
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
    const averageAttendancePoints =
      totalSessions > 0
        ? (
            recordsResult.rows.reduce(
              (sum: number, record: { participation: number }) => sum + record.participation,
              0
            ) / totalSessions
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
        averageAttendancePoints,
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

app.delete("/api/attendance-records/:recordId", async (req: Request, res: Response) => {
  const { recordId } = req.params;
  const roleParam = typeof req.query.role === "string" ? req.query.role : null;
  const userId = typeof req.query.userId === "string" ? req.query.userId : null;

  if (!recordId) {
    return res.status(400).send("recordId is required");
  }

  if (!roleParam || !userId) {
    return res.status(400).send("role and userId are required");
  }

  if (roleParam !== "teacher") {
    return res.status(403).send("Only teachers can delete entries");
  }

  const isPotentialUuid = /^[0-9a-fA-F-]{32,36}$/.test(recordId);
  if (!isPotentialUuid) {
    return res.status(400).send("Invalid recordId");
  }

  try {
    const recordResult = await query<{ session_id: string; course_id: string }>(
      `
        SELECT ar.session_id, s.course_id
        FROM attendance_records ar
        JOIN sessions s ON s.id = ar.session_id
        WHERE ar.id = $1
      `,
      [recordId]
    );

    if (recordResult.rowCount === 0) {
      return res.status(404).send("Attendance record not found");
    }

    const { session_id: sessionId, course_id: courseId } = recordResult.rows[0];

    const teacherResult = await query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM course_teachers
          WHERE course_id = $1
            AND user_id = $2
        ) AS exists
      `,
      [courseId, userId]
    );

    if (!teacherResult.rows[0]?.exists) {
      return res.status(403).send("Not authorized to delete this entry");
    }

    await withTransaction(async (client: PoolClient) => {
      await client.query(
        `
          DELETE FROM attendance_records
          WHERE id = $1
        `,
        [recordId]
      );

      const remainingResult = await client.query<{ remaining: string }>(
        `
          SELECT COUNT(*)::int AS remaining
          FROM attendance_records
          WHERE session_id = $1
        `,
        [sessionId]
      );

      const remaining = Number(remainingResult.rows[0]?.remaining ?? 0);

      if (remaining === 0) {
        await client.query(
          `
            DELETE FROM sessions
            WHERE id = $1
          `,
          [sessionId]
        );
      }
    });

    res.status(204).send();
  } catch (error) {
    console.error(`Failed to delete attendance record ${recordId}`, error);
    res.status(500).send("Failed to delete attendance record");
  }
});

app.get("/api/leaderboard", async (req, res) => {
  const courseId = typeof req.query.courseId === "string" ? req.query.courseId : null;
  const sessionNameRaw = typeof req.query.sessionName === "string" ? req.query.sessionName : null;
  const sessionName =
    sessionNameRaw && sessionNameRaw.trim().length > 0 ? sessionNameRaw.trim() : null;
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

    if (sessionName) {
      whereClauses.push(`TRIM(s.name) = $${params.length + 1}`);
      params.push(sessionName);
    }

    const whereSql = whereClauses.length > 0 ? whereClauses.join(" AND ") : "TRUE";

    const result = await query<{
      student_id: string;
      name: string;
      cohort: string | null;
      course_id: string;
      total_sessions: number;
      attendance_rate: number;
      avg_attendance_points: number;
      bonus_points: number;
      session_names: Array<string | null>;
    }>(
      `
        SELECT
          st.id AS student_id,
          st.name,
          st.cohort,
          st.course_id,
          COUNT(DISTINCT s.id) AS total_sessions,
          COALESCE(AVG(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END)::float * 100, 0) AS attendance_rate,
          COALESCE(SUM(ar.participation)::float, 0) AS attendance_points_total,
          COALESCE(SUM(be.points)::float, 0) AS bonus_points,
          COALESCE(SUM(ar.participation)::float, 0) + COALESCE(SUM(be.points)::float, 0) AS total_points,
          ARRAY_REMOVE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT TRIM(s.name)), ''), NULL) AS session_names
        FROM students st
        LEFT JOIN attendance_records ar ON ar.student_id = st.id
        LEFT JOIN sessions s ON s.id = ar.session_id
        LEFT JOIN bonus_events be ON be.attendance_record_id = ar.id
        WHERE ${whereSql}
        GROUP BY st.id
        ORDER BY total_points DESC, attendance_rate DESC, st.name ASC
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
      attendance_points_total: number;
      bonus_points: number;
      total_points: number;
      session_names: Array<string | null>;
    }) => ({
      studentId: row.student_id,
      name: row.name,
      cohort: row.cohort,
      courseId: row.course_id,
      attendanceRate: Math.round(row.attendance_rate),
      attendancePointsTotal: Number(row.attendance_points_total.toFixed(1)),
      bonusPoints: Number(row.bonus_points),
      totalPoints: Number(row.total_points.toFixed(1)),
      sessionNames: row.session_names.filter(
        (sessionName): sessionName is string =>
          Boolean(sessionName && sessionName.trim().length)
      ),
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
