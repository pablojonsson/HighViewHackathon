type LeaderboardEntry = {
  id: number;
  name: string;
  points: number;
  streak: number;
  group: string;
};
const leaderboardData: LeaderboardEntry[] = [
  { id: 1, name: "Alex Johnson", points: 1280, streak: 12, group: "Hillside HS" },
  { id: 2, name: "Maya Chen", points: 1195, streak: 9, group: "Ridgeview Prep" },
  { id: 3, name: "Jordan Smith", points: 1080, streak: 10, group: "Summit Academy" },
  { id: 4, name: "Priya Patel", points: 1045, streak: 7, group: "Hillside HS" },
  { id: 5, name: "Diego Ramirez", points: 1002, streak: 5, group: "Eastview STEM" },
  { id: 6, name: "Alicia Gomez", points: 984, streak: 6, group: "North Ridge" },
  { id: 7, name: "Samir Ali", points: 955, streak: 4, group: "Summit Academy" },
  { id: 8, name: "Emily Turner", points: 930, streak: 5, group: "Ridgeview Prep" },
  { id: 9, name: "Noah Daniels", points: 910, streak: 3, group: "Hillside HS" },
  { id: 10, name: "Layla Scott", points: 898, streak: 2, group: "Harbor Charter" },
  { id: 11, name: "Owen Blake", points: 870, streak: 4, group: "North Ridge" },
  { id: 12, name: "Sofia Martinez", points: 848, streak: 3, group: "Eastview STEM" },
];
const formatInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const LeaderboardPage = () => {
  const podium = leaderboardData.slice(0, 3);
  const remainder = leaderboardData.slice(3);
  const podiumOrder = [
    { entry: podium[1], placement: 2 },
    { entry: podium[0], placement: 1 },
    { entry: podium[2], placement: 3 },
  ];
  return (
    <div className="card leaderboard-card stack">
      <header className="leaderboard-header">
        <div>
          <h2>Program Leaderboard</h2>
          <p className="subtle">
            Top performers based on weekly engagement points across partner schools.
          </p>
        </div>
        <span className="leaderboard-period">Week 12</span>
      </header>
      <section className="leaderboard-podium" aria-label="Top three students">
        {podiumOrder.map(({ entry, placement }) =>
          entry ? (
            <article key={entry.id} className={`podium-place rank-${placement}`}>
              <span className="podium-label">{placement === 1 ? "1st" : placement === 2 ? "2nd" : "3rd"}</span>
              <div className="podium-avatar">{formatInitials(entry.name)}</div>
              <h3 className="podium-name">{entry.name}</h3>
              <p className="podium-meta subtle">{entry.group}</p>
              <p className="podium-points">{entry.points.toLocaleString()} pts</p>
              <span className="podium-streak">🔥 {entry.streak}-week streak</span>
              <div className={`podium-base base-${placement}`} />
            </article>
          ) : (
            <div key={`podium-empty-${placement}`} className="podium-placeholder" />
          ),
        )}
      </section>
      <section className="leaderboard-table">
        <header className="leaderboard-table-header subtle">
          <span className="col-rank">Rank</span>
          <span className="col-name">Name</span>
          <span className="col-group">Group</span>
          <span className="col-points">Points</span>
          <span className="col-streak">Streak</span>
        </header>
        <ol className="leaderboard-list">
          {remainder.map((entry, index) => (
            <li key={entry.id} className="leaderboard-row">
              <span className="col-rank">{index + 4}</span>
              <span className="col-name">
                <span className="row-avatar">{formatInitials(entry.name)}</span>
                {entry.name}
              </span>
              <span className="col-group subtle">{entry.group}</span>
              <span className="col-points">{entry.points.toLocaleString()} pts</span>
              <span className="col-streak subtle">{entry.streak}-week</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
};
export default LeaderboardPage;