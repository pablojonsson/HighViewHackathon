CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_user_id TEXT UNIQUE,
  email TEXT UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  google_course_id TEXT UNIQUE,
  section TEXT,
  room TEXT,
  teacher_user_id UUID REFERENCES users(id),
  course_state TEXT
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cohort TEXT,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  google_user_id TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'late', 'excused', 'absent')),
  participation INTEGER NOT NULL CHECK (participation BETWEEN 0 AND 5),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bonus_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points >= 0)
);

CREATE INDEX IF NOT EXISTS idx_students_course_id ON students(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_course_id_occurred_at ON sessions(course_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_bonus_events_attendance_record ON bonus_events(attendance_record_id);

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS google_course_id TEXT,
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS room TEXT,
  ADD COLUMN IF NOT EXISTS teacher_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS course_state TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_google_course_id
  ON courses(google_course_id);

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS google_user_id TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS course_teachers (
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  scope TEXT,
  token_type TEXT,
  expiry_date TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_google_course
  ON students(google_user_id, course_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_user_course
  ON students(user_id, course_id);
