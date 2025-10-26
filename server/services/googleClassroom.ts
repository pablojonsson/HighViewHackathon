import { google, classroom_v1 } from "googleapis";
import type { Credentials, OAuth2Client } from "google-auth-library";
import { PoolClient } from "../db";
import { withTransaction } from "../db";

type CodeExchangeRequest = {
  code: string;
};

type TeacherSyncSummary = {
  teacher: {
    id: string;
    name: string;
    email?: string | null;
  };
  courses: Array<{
    id: string;
    name: string;
    section?: string | null;
    studentCount: number;
  }>;
};

type StudentSyncSummary = {
  student: {
    id: string;
    name: string;
    email?: string | null;
  };
  courses: Array<{
    id: string;
    name: string;
    section?: string | null;
    studentRecordId: string;
  }>;
};

type SyncResult =
  | {
      user: {
        id: string;
        name: string;
        email?: string | null;
        role: "teacher";
      };
      summary: TeacherSyncSummary;
    }
  | {
      user: {
        id: string;
        name: string;
        email?: string | null;
        role: "student";
      };
      summary: StudentSyncSummary;
    };

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET ??
  process.env.VITE_GOOGLE_CLIENT_SECRET ??
  process.env.GOGLE_CLIENT_SECRET ??
  null;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "postmessage";

if (!GOOGLE_CLIENT_ID) {
  throw new Error("GOOGLE_CLIENT_ID is not configured.");
}

if (!GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_SECRET is not configured.");
}

const classroom = google.classroom("v1");

const classroomScopes = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.profile.emails",
  "https://www.googleapis.com/auth/classroom.profile.photos",
  "https://www.googleapis.com/auth/classroom.rosters.readonly"
];

const oauth2 = google.oauth2("v2");

type GoogleUserProfile = {
  googleUserId: string;
  email?: string | null;
  name: string;
  avatarUrl?: string | null;
};

type UpsertUserResult = {
  id: string;
};

const normalizeString = (value?: string | null): string | null =>
  value?.trim() ? value.trim() : null;

const getOAuthClient = () =>
  new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ?? undefined, GOOGLE_REDIRECT_URI);

const exchangeCodeForTokens = async ({
  code
}: CodeExchangeRequest): Promise<{ oauthClient: OAuth2Client; tokens: Credentials }> => {
  const oauthClient = getOAuthClient();
  const tokenResponse = await oauthClient.getToken({
    code,
    redirect_uri: GOOGLE_REDIRECT_URI
  });

  oauthClient.setCredentials(tokenResponse.tokens);
  return { oauthClient, tokens: tokenResponse.tokens };
};

const fetchUserProfile = async (authClient: OAuth2Client): Promise<GoogleUserProfile> => {
  const { data } = await oauth2.userinfo.get({
    auth: authClient
  });

  if (!data.id || !data.name) {
    throw new Error("Failed to load Google profile information.");
  }

  return {
    googleUserId: data.id,
    email: data.email,
    name: data.name,
    avatarUrl: data.picture ?? undefined
  };
};

const upsertUser = async (
  client: PoolClient,
  profile: GoogleUserProfile,
  role: "teacher" | "student"
): Promise<UpsertUserResult> => {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO users (google_user_id, email, name, role, avatar_url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (google_user_id) DO UPDATE
      SET email = COALESCE(EXCLUDED.email, users.email),
          name = EXCLUDED.name,
          role = CASE
            WHEN users.role = 'teacher' THEN users.role
            ELSE EXCLUDED.role
          END,
          avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url)
      RETURNING id
    `,
    [profile.googleUserId, normalizeString(profile.email), profile.name, role, profile.avatarUrl]
  );

  return { id: result.rows[0].id };
};

const upsertCourse = async (
  client: PoolClient,
  course: classroom_v1.Schema$Course,
  primaryTeacherId: string | null
) => {
  const courseId = course.id;
  if (!courseId || !course.name) {
    return;
  }

  await client.query(
    `
      INSERT INTO courses (id, name, google_course_id, section, room, teacher_user_id, course_state)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          google_course_id = EXCLUDED.google_course_id,
          section = EXCLUDED.section,
          room = EXCLUDED.room,
          teacher_user_id = COALESCE(EXCLUDED.teacher_user_id, courses.teacher_user_id),
          course_state = EXCLUDED.course_state
    `,
    [
      courseId,
      course.name,
      course.id,
      course.section ?? null,
      course.room ?? null,
      primaryTeacherId,
      course.courseState ?? null
    ]
  );
};

const upsertCourseTeachers = async (
  client: PoolClient,
  courseId: string,
  teacherIds: string[]
) => {
  await client.query(`DELETE FROM course_teachers WHERE course_id = $1`, [courseId]);
  for (const teacherId of teacherIds) {
    await client.query(
      `
        INSERT INTO course_teachers (course_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (course_id, user_id) DO NOTHING
      `,
      [courseId, teacherId]
    );
  }
};

const upsertStudent = async (
  client: PoolClient,
  student: classroom_v1.Schema$Student,
  course: classroom_v1.Schema$Course,
  userId: string
) => {
  if (!student.userId || !course.id) {
    return;
  }

  const studentRowId = `gcls-${course.id}-${student.userId}`;
  const fullName =
    student.profile?.name?.fullName ??
    student.profile?.name?.givenName ??
    student.profile?.name?.familyName ??
    "Unnamed student";
  const cohort = course.section ?? course.name ?? null;
  const email = normalizeString(student.profile?.emailAddress ?? null);

  await client.query(
    `
      INSERT INTO students (id, name, cohort, course_id, user_id, google_user_id, email)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          cohort = EXCLUDED.cohort,
          course_id = EXCLUDED.course_id,
          user_id = EXCLUDED.user_id,
          google_user_id = EXCLUDED.google_user_id,
          email = EXCLUDED.email
    `,
    [studentRowId, fullName, cohort, course.id, userId, student.userId, email]
  );
};

const storeUserTokens = async (
  client: PoolClient,
  userId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    scope?: string | null;
    token_type?: string | null;
    expiry_date?: number | null;
  }
) => {
  if (!tokens.access_token) {
    return;
  }

  const scopeValue =
    typeof tokens.scope === "string"
      ? tokens.scope
      : Array.isArray(tokens.scope)
      ? tokens.scope.join(" ")
      : classroomScopes.join(" ");

  await client.query(
    `
      INSERT INTO user_tokens (user_id, access_token, refresh_token, scope, token_type, expiry_date)
      VALUES ($1, $2, $3, $4, $5, TO_TIMESTAMP($6))
      ON CONFLICT (user_id) DO UPDATE
      SET access_token = EXCLUDED.access_token,
          refresh_token = COALESCE(EXCLUDED.refresh_token, user_tokens.refresh_token),
          scope = COALESCE(EXCLUDED.scope, user_tokens.scope),
          token_type = COALESCE(EXCLUDED.token_type, user_tokens.token_type),
          expiry_date = COALESCE(EXCLUDED.expiry_date, user_tokens.expiry_date)
    `,
    [
      userId,
      tokens.access_token,
      tokens.refresh_token ?? null,
      scopeValue,
      tokens.token_type ?? null,
      tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null
    ]
  );
};

const loadCourseTeachers = async (
  authClient: OAuth2Client,
  courseId: string
): Promise<classroom_v1.Schema$Teacher[]> => {
  const teachers: classroom_v1.Schema$Teacher[] = [];
  let nextPageToken: string | undefined;

  do {
    const response = await classroom.courses.teachers.list({
      auth: authClient,
      courseId,
      pageToken: nextPageToken ?? undefined,
      pageSize: 100
    });
    if (response.data.teachers) {
      teachers.push(...response.data.teachers);
    }
    nextPageToken = response.data.nextPageToken ?? undefined;
  } while (nextPageToken);

  return teachers;
};

const loadCourseStudents = async (
  authClient: OAuth2Client,
  courseId: string
): Promise<classroom_v1.Schema$Student[]> => {
  const students: classroom_v1.Schema$Student[] = [];
  let nextPageToken: string | undefined;

  do {
    const response = await classroom.courses.students.list({
      auth: authClient,
      courseId,
      pageToken: nextPageToken ?? undefined,
      pageSize: 100
    });
    if (response.data.students) {
      students.push(...response.data.students);
    }
    nextPageToken = response.data.nextPageToken ?? undefined;
  } while (nextPageToken);

  return students;
};

const toProfile = (person: classroom_v1.Schema$UserProfile | undefined | null): GoogleUserProfile | null => {
  if (!person?.id || !person.name?.fullName) {
    return null;
  }

  return {
    googleUserId: person.id,
    email: normalizeString(person.emailAddress ?? null),
    name: person.name.fullName,
    avatarUrl: normalizeString(person.photoUrl ?? null)
  };
};

export const syncClassroomFromCode = async (
  payload: CodeExchangeRequest
): Promise<SyncResult> => {
  const { oauthClient, tokens } = await exchangeCodeForTokens(payload);
  const userProfile = await fetchUserProfile(oauthClient);

  const teacherCourseResponse = await classroom.courses
    .list({
      auth: oauthClient,
      teacherId: "me",
      courseStates: ["ACTIVE"],
      pageSize: 20
    })
    .catch((error) => {
      if ((error as { code?: number }).code === 403) {
        return { data: { courses: [] } };
      }
      throw error;
    });

  const teacherCourses = teacherCourseResponse.data.courses ?? [];

  if (teacherCourses.length > 0) {
    const courseBundles: Array<{
      course: classroom_v1.Schema$Course;
      teachers: classroom_v1.Schema$Teacher[];
      students: classroom_v1.Schema$Student[];
    }> = [];

    for (const course of teacherCourses) {
      if (!course.id || !course.name) {
        continue;
      }

      const [teachers, students] = await Promise.all([
        loadCourseTeachers(oauthClient, course.id),
        loadCourseStudents(oauthClient, course.id)
      ]);

      courseBundles.push({ course, teachers, students });
    }

    return withTransaction<SyncResult>(async (client) => {
      const teacherUser = await upsertUser(client, userProfile, "teacher");
      await storeUserTokens(client, teacherUser.id, tokens);

      const summary: TeacherSyncSummary = {
        teacher: {
          id: teacherUser.id,
          name: userProfile.name,
          email: userProfile.email ?? null
        },
        courses: []
      };

      for (const { course, teachers, students } of courseBundles) {
        const teacherIds: string[] = [];
        for (const teacher of teachers) {
          const profile = toProfile(teacher.profile);
          if (!profile) {
            continue;
          }
          const upserted = await upsertUser(client, profile, "teacher");
          teacherIds.push(upserted.id);
        }

        const primaryTeacherId = teacherIds[0] ?? teacherUser.id;
        await upsertCourse(client, course, primaryTeacherId);
        await upsertCourseTeachers(client, course.id, teacherIds.length > 0 ? teacherIds : [teacherUser.id]);

        for (const student of students) {
          const profile = toProfile(student.profile);
          if (!profile) {
            continue;
          }
          const upserted = await upsertUser(client, profile, "student");
          await upsertStudent(client, student, course, upserted.id);
        }

        summary.courses.push({
          id: course.id,
          name: course.name,
          section: course.section ?? null,
          studentCount: students.length
        });
      }

      return {
        user: {
          id: teacherUser.id,
          name: userProfile.name,
          email: userProfile.email ?? null,
          role: "teacher"
        },
        summary
      };
    });
  }

  const studentCourseResponse = await classroom.courses
    .list({
      auth: oauthClient,
      studentId: "me",
      courseStates: ["ACTIVE"],
      pageSize: 100
    })
    .catch((error) => {
      if ((error as { code?: number }).code === 403) {
        return { data: { courses: [] } };
      }
      throw error;
    });

  const studentCourses = studentCourseResponse.data.courses ?? [];

  return withTransaction<SyncResult>(async (client) => {
    const studentUser = await upsertUser(client, userProfile, "student");
    await storeUserTokens(client, studentUser.id, tokens);

    for (const course of studentCourses) {
      if (!course.id || !course.name) {
        continue;
      }

      await upsertCourse(client, course, null);

      const stubStudent: classroom_v1.Schema$Student = {
        userId: userProfile.googleUserId,
        profile: {
          id: userProfile.googleUserId,
          name: {
            fullName: userProfile.name
          },
          emailAddress: userProfile.email ?? undefined,
          photoUrl: userProfile.avatarUrl ?? undefined
        }
      };

      await upsertStudent(client, stubStudent, course, studentUser.id);
    }

    const studentsResult = await client.query<{
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
      [studentUser.id]
    );

    const summary: StudentSyncSummary = {
      student: {
        id: studentUser.id,
        name: userProfile.name,
        email: userProfile.email ?? null
      },
      courses: studentsResult.rows.map((row) => ({
        id: row.course_id,
        name: row.cohort ?? row.course_id,
        section: row.cohort,
        studentRecordId: row.id
      }))
    };

    return {
      user: {
        id: studentUser.id,
        name: userProfile.name,
        email: userProfile.email ?? null,
        role: "student"
      },
      summary
    };
  });
};