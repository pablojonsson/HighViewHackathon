import "dotenv/config";
import { Pool } from "pg";

const courses = [
  { id: "course-101", name: "Algebra II" },
  { id: "course-205", name: "Geometry Honors" },
  { id: "course-309", name: "AP Calculus" }
] as const;

const students = [
  { id: "stu-101", name: "Avery Johnson", cohort: "Algebra II", courseId: "course-101" },
  { id: "stu-205", name: "Jordan Smith", cohort: "Algebra II", courseId: "course-101" },
  { id: "stu-309", name: "Emilia Garcia", cohort: "Geometry Honors", courseId: "course-205" },
  { id: "stu-412", name: "Noah Williams", cohort: "Geometry Honors", courseId: "course-205" },
  { id: "stu-523", name: "Kai Thompson", cohort: "AP Calculus", courseId: "course-309" },
  { id: "stu-624", name: "Mia Patel", cohort: "AP Calculus", courseId: "course-309" }
] as const;

async function main() {
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in environment variables.");
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl:
      process.env.PGSSLMODE === "require"
        ? {
            rejectUnauthorized: false
          }
        : undefined
  });

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const course of courses) {
        await client.query(
          `INSERT INTO courses (id, name) VALUES ($1, $2)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
          [course.id, course.name]
        );
      }

      for (const student of students) {
        await client.query(
          `INSERT INTO students (id, name, cohort, course_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name,
               cohort = EXCLUDED.cohort,
               course_id = EXCLUDED.course_id`,
          [student.id, student.name, student.cohort, student.courseId]
        );
      }

      await client.query("COMMIT");
      console.log("Seed data inserted.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to seed database", error);
  process.exit(1);
});
