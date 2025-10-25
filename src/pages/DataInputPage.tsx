import { useMemo, useState } from "react";

type AttendanceStatus = "present" | "late" | "excused" | "absent";

interface Student {
  id: string;
  name: string;
  cohort: string;
}

interface StudentEntry {
  status: AttendanceStatus;
  participation: number;
  bonus: string[];
  notes: string;
}

const roster: Student[] = [
  { id: "stu-101", name: "Avery Johnson", cohort: "Algebra II" },
  { id: "stu-205", name: "Jordan Smith", cohort: "Algebra II" },
  { id: "stu-309", name: "Emilia Garcia", cohort: "Geometry Honors" },
  { id: "stu-412", name: "Noah Williams", cohort: "Geometry Honors" },
  { id: "stu-523", name: "Kai Thompson", cohort: "AP Calculus" }
];

const bonusOptions = [
  { key: "lead", label: "Led discussion (+2)" },
  { key: "mentor", label: "Peer mentor (+1)" },
  { key: "project", label: "Project milestone (+3)" }
];

const defaultEntry: StudentEntry = {
  status: "present",
  participation: 3,
  bonus: [],
  notes: ""
};

const DataInputPage = () => {
  const [sessionName, setSessionName] = useState("");
  const [entries, setEntries] = useState<Record<string, StudentEntry>>(
    () =>
      roster.reduce<Record<string, StudentEntry>>((acc, student) => {
        acc[student.id] = { ...defaultEntry };
        return acc;
      }, {})
  );
  const [submitted, setSubmitted] = useState(false);

  const updateEntry = (studentId: string, field: keyof StudentEntry, value: unknown) => {
    setEntries((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value
      }
    }));
  };

  const toggleBonus = (studentId: string, bonusKey: string) => {
    setEntries((prev) => {
      const current = prev[studentId];
      const hasBonus = current.bonus.includes(bonusKey);
      return {
        ...prev,
        [studentId]: {
          ...current,
          bonus: hasBonus
            ? current.bonus.filter((key) => key !== bonusKey)
            : [...current.bonus, bonusKey]
        }
      };
    });
  };

  const summary = useMemo(() => {
    const counts = {
      present: 0,
      late: 0,
      excused: 0,
      absent: 0,
      totalParticipation: 0,
      bonusPoints: 0
    };

    roster.forEach((student) => {
      const entry = entries[student.id];
      counts[entry.status] += 1;
      counts.totalParticipation += entry.participation;
      entry.bonus.forEach((bonusKey) => {
        if (bonusKey === "lead") counts.bonusPoints += 2;
        if (bonusKey === "mentor") counts.bonusPoints += 1;
        if (bonusKey === "project") counts.bonusPoints += 3;
      });
    });

    return {
      ...counts,
      avgParticipation: (counts.totalParticipation / roster.length).toFixed(1)
    };
  }, [entries]);

  const handleSave = () => {
    setSubmitted(true);
    window.setTimeout(() => setSubmitted(false), 2500);
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Session log</h2>
        <p className="subtle">
          Track attendance, participation, and bonus actions for today&apos;s session. Data is mocked for now—wire to Google Classroom once tokens are ready.
        </p>
        <label className="subtle" style={{ fontWeight: 600 }}>
          Session name
        </label>
        <input
          className="session-input"
          placeholder="e.g. Algebra II · 10/25 Morning Block"
          value={sessionName}
          onChange={(event) => setSessionName(event.target.value)}
        />
      </div>

      <div className="card roster-card">
        <div className="roster-head">
          <h2>Roster</h2>
          <div className="roster-summary">
            <span className="tag success">Present {summary.present}</span>
            <span className="tag warning">Late {summary.late}</span>
            <span className="tag info">Excused {summary.excused}</span>
            <span className="tag danger">Absent {summary.absent}</span>
            <span className="tag neutral">
              Avg participation {summary.avgParticipation}
            </span>
            <span className="tag bonus">Bonus pts {summary.bonusPoints}</span>
          </div>
        </div>

        <table className="roster-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Status</th>
              <th>Participation</th>
              <th>Bonus actions</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((student) => {
              const entry = entries[student.id];
              return (
                <tr key={student.id}>
                  <td>
                    <div className="student-cell">
                      <strong>{student.name}</strong>
                      <span className="subtle">{student.cohort}</span>
                    </div>
                  </td>
                  <td>
                    <select
                      value={entry.status}
                      onChange={(event) =>
                        updateEntry(student.id, "status", event.target.value as AttendanceStatus)
                      }
                    >
                      <option value="present">Present</option>
                      <option value="late">Late</option>
                      <option value="excused">Excused</option>
                      <option value="absent">Absent</option>
                    </select>
                  </td>
                  <td>
                    <div className="participation-cell">
                      <input
                        type="range"
                        min={0}
                        max={5}
                        step={1}
                        value={entry.participation}
                        onChange={(event) =>
                          updateEntry(student.id, "participation", Number(event.target.value))
                        }
                      />
                      <span>{entry.participation}</span>
                    </div>
                  </td>
                  <td>
                    <div className="bonus-chip-group">
                      {bonusOptions.map((bonus) => (
                        <button
                          key={bonus.key}
                          type="button"
                          className={
                            entry.bonus.includes(bonus.key)
                              ? "chip chip-active"
                              : "chip"
                          }
                          onClick={() => toggleBonus(student.id, bonus.key)}
                        >
                          {bonus.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      className="note-input"
                      placeholder="Optional quick note"
                      value={entry.notes}
                      onChange={(event) => updateEntry(student.id, "notes", event.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card stack">
        <button className="primary-btn" onClick={handleSave}>
          Save mock log
        </button>
        {submitted && <span className="tag success">Saved locally (mock)</span>}
        <p className="subtle">
          Future enhancement: push updates to Google Classroom submissions and write to DynamoDB.
        </p>
      </div>
    </div>
  );
};

export default DataInputPage;
