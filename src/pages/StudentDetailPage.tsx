import React, { useMemo, useState } from "react";

type Badge = {
  label: string;
  description: string;
};

type Student = {
  id: string;
  name: string;
  email: string;
  attendanceTotal: number;
  attendancePossible: number;
  recentPresenceSummary: string;
  bonusPointsTotal: number;
  leaderboardScore: number;
  riskLevel: "OK" | "WARNING" | "AT_RISK";
  riskMessage: string;
  badges: Badge[];
};

const students: Student[] = [
  {
    id: "1",
    name: "Avery Johnson",
    email: "avery.johnson@classroom.edu",
    attendanceTotal: 62.5,
    attendancePossible: 65,
    recentPresenceSummary: "Present 5 / 5 most recent sessions",
    bonusPointsTotal: 6,
    leaderboardScore: 68.5,
    riskLevel: "OK",
    riskMessage: "Strong attendance and engagement. Keep encouraging leadership.",
    badges: [
      { label: "Perfect Week", description: "Attended all sessions this week." },
      { label: "Active Participant", description: "Consistently engages with the cohort." },
      { label: "Consistency Streak", description: "Maintained high reliability scores." },
    ],
  },
  {
    id: "2",
    name: "Devon Carter",
    email: "devon.carter@classroom.edu",
    attendanceTotal: 45,
    attendancePossible: 65,
    recentPresenceSummary: "Present 3 / 5 most recent sessions",
    bonusPointsTotal: 3,
    leaderboardScore: 48,
    riskLevel: "WARNING",
    riskMessage: "Attendance is slipping; missed communication twice this month.",
    badges: [
      { label: "Communicator", description: "Notifies mentors about schedule conflicts." },
      { label: "Active Participant", description: "Shares thoughtful questions during sessions." },
    ],
  },
  {
    id: "3",
    name: "Jordan Lee",
    email: "jordan.lee@classroom.edu",
    attendanceTotal: 32.5,
    attendancePossible: 65,
    recentPresenceSummary: "Present 2 / 5 most recent sessions",
    bonusPointsTotal: 1,
    leaderboardScore: 33.5,
    riskLevel: "AT_RISK",
    riskMessage: "Multiple uncommunicated absences. Needs immediate outreach.",
    badges: [
      { label: "Communicator", description: "Has reached out about scheduling in the past." },
    ],
  },
];

const pageStyle: React.CSSProperties = {
  display: "flex",
  gap: "24px",
  padding: "32px",
  minHeight: "100vh",
  backgroundColor: "#0f172a",
  color: "#f8fafc",
  flexWrap: "wrap",
  boxSizing: "border-box",
  fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const leftColumnStyle: React.CSSProperties = {
  flex: "1 1 340px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  minWidth: "300px",
};

const rightColumnStyle: React.CSSProperties = {
  flex: "2 1 480px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  minWidth: "320px",
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "#1e293b",
  borderRadius: "12px",
  border: "1px solid #334155",
  padding: "20px",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const studentListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  maxHeight: "520px",
  overflowY: "auto",
  paddingRight: "4px",
};

const studentRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.5fr 0.8fr 0.9fr 0.9fr",
  alignItems: "center",
  gap: "12px",
  padding: "14px 16px",
  backgroundColor: "#1f2937",
  borderRadius: "10px",
  border: "1px solid transparent",
  cursor: "pointer",
  transition: "border-color 0.2s ease, background-color 0.2s ease",
  position: "relative",
};

const selectedRowStyle: React.CSSProperties = {
  ...studentRowStyle,
  backgroundColor: "#111827",
  outline: "2px solid rgba(56, 189, 248, 0.8)",
  outlineOffset: "3px",
};

const riskLabelColors: Record<Student["riskLevel"], { bg: string; text: string }> = {
  OK: { bg: "rgba(16, 185, 129, 0.15)", text: "#34d399" },
  WARNING: { bg: "rgba(234, 179, 8, 0.15)", text: "#facc15" },
  AT_RISK: { bg: "rgba(248, 113, 113, 0.18)", text: "#f87171" },
};

const riskLabelDisplay: Record<Student["riskLevel"], string> = {
  OK: "OK",
  WARNING: "WARNING",
  AT_RISK: "AT RISK",
};

function riskPillStyle(level: Student["riskLevel"]): React.CSSProperties {
  const colors = riskLabelColors[level];
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    backgroundColor: colors.bg,
    color: colors.text,
    textTransform: "uppercase",
  };
}

const subtleTextStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "14px",
  lineHeight: 1.5,
};

const headerStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  marginBottom: "4px",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  marginBottom: "6px",
};

const metricsRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  flexWrap: "wrap",
};

const largeMetricStyle: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 700,
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#38bdf8",
  color: "#0f172a",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: 600,
  textAlign: "center",
  cursor: "pointer",
  transition: "transform 0.15s ease, box-shadow 0.15s ease",
  boxShadow: "0 10px 20px rgba(56, 189, 248, 0.25)",
};

const badgePillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 12px",
  borderRadius: "999px",
  backgroundColor: "#0f172a",
  border: "1px solid #38bdf8",
  color: "#e0f2fe",
  fontWeight: 600,
  marginBottom: "4px",
  fontSize: "14px",
};

const cardContainerStyle: React.CSSProperties = {
  ...cardStyle,
  gap: "16px",
};

const backLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  color: "#38bdf8",
  cursor: "pointer",
  fontWeight: 600,
};

const badgeListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

export default function StudentDetailPage() {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id ?? "");

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? students[0],
    [selectedStudentId]
  );

  return (
    <div style={pageStyle}>
      <div style={leftColumnStyle}>
        <div style={{ ...cardStyle, flex: "0 0 auto" }}>
          <div style={headerStyle}>Your Class</div>
          <div style={{ ...subtleTextStyle, marginBottom: "8px" }}>
            Quick attendance + engagement summary across enrolled students.
          </div>
        </div>
        <div style={{ ...cardStyle, flex: "1 1 auto", gap: "16px" }}>
          <div style={sectionTitleStyle}>Class Roster / Summary</div>
          <div style={studentListStyle}>
            {students.map((student) => {
              const rowIsSelected = student.id === selectedStudent?.id;
              return (
                <div
                  key={student.id}
                  onClick={() => setSelectedStudentId(student.id)}
                  style={rowIsSelected ? selectedRowStyle : studentRowStyle}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{student.name}</div>
                    <div style={{ ...subtleTextStyle, fontSize: "12px" }}>{student.email}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <span style={riskPillStyle(student.riskLevel)}>
                      {riskLabelDisplay[student.riskLevel]}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      {student.attendanceTotal.toFixed(1)}
                      <span style={{ fontWeight: 400 }}> / {student.attendancePossible}</span>
                    </div>
                    <div style={{ ...subtleTextStyle, fontSize: "12px" }}>Attendance</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{student.leaderboardScore.toFixed(1)}</div>
                    <div style={{ ...subtleTextStyle, fontSize: "12px" }}>Leaderboard</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={rightColumnStyle}>
        <div style={cardContainerStyle}>
          <div style={backLinkStyle}>
            <span style={{ fontSize: "18px" }}>{"<"}</span>
            <span>Back to Class</span>
          </div>
          <div>
            <div style={{ fontSize: "28px", fontWeight: 700 }}>
              {selectedStudent?.name ?? "Select a student"}
            </div>
            <div style={{ ...subtleTextStyle }}>{selectedStudent?.email}</div>
          </div>
          <div style={{ ...subtleTextStyle, fontStyle: "italic" }}>
            HighView student profile / diagnostic
          </div>
        </div>

        <div style={cardContainerStyle}>
          <div style={sectionTitleStyle}>Attendance / Reliability</div>
          <div style={metricsRowStyle}>
            <div>
              <div style={subtleTextStyle}>Total Points Earned</div>
              <div style={{ ...largeMetricStyle, whiteSpace: "nowrap" }}>
                {selectedStudent?.attendanceTotal.toFixed(1)}
                <span style={{ fontSize: "18px", fontWeight: 400 }}>
                  {" "}
                  / {selectedStudent?.attendancePossible ?? 0}
                </span>
              </div>
            </div>
            <div>
              <div style={subtleTextStyle}>Recent Presence</div>
              <div style={{ fontSize: "18px", fontWeight: 600 }}>
                {selectedStudent?.recentPresenceSummary}
              </div>
            </div>
          </div>
          <div style={{ ...subtleTextStyle, marginTop: "4px" }}>
            5 = attended, 2.5 = communicated absence, 0 = no show
          </div>
        </div>

        <div style={cardContainerStyle}>
          <div style={sectionTitleStyle}>Engagement / Bonus Points</div>
          <div style={metricsRowStyle}>
            <div>
              <div style={subtleTextStyle}>Bonus Points</div>
              <div style={largeMetricStyle}>{selectedStudent?.bonusPointsTotal ?? 0}</div>
            </div>
            <div>
              <div style={subtleTextStyle}>Leaderboard Score</div>
              <div style={largeMetricStyle}>{selectedStudent?.leaderboardScore.toFixed(1) ?? "0.0"}</div>
            </div>
          </div>
          <div style={{ ...subtleTextStyle, marginTop: "4px" }}>
            Bonus points come from participation, thank-yous, reflections, and extra events.
          </div>
        </div>

        <div style={cardContainerStyle}>
          <div style={sectionTitleStyle}>Status / Intervention</div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={riskPillStyle(selectedStudent?.riskLevel ?? "OK")}>
              {selectedStudent ? riskLabelDisplay[selectedStudent.riskLevel] : "OK"}
            </span>
            <span style={{ fontSize: "18px", fontWeight: 600, color: "#e2e8f0" }}>
              {selectedStudent?.riskMessage}
            </span>
          </div>
          <div style={{ ...subtleTextStyle }}>
            Suggested next step: Reach out before removal.
          </div>
          <div style={buttonStyle}>Generate Outreach Message</div>
        </div>

        <div style={cardContainerStyle}>
          <div style={sectionTitleStyle}>Badges</div>
          <div style={badgeListStyle}>
            {selectedStudent?.badges.map((badge) => (
              <div key={badge.label}>
                <div style={badgePillStyle}>{badge.label}</div>
                <div style={subtleTextStyle}>{badge.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
