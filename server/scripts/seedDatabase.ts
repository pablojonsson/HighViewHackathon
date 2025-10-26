import "dotenv/config";

async function main() {
  console.log(
    "Database seeding skipped. Classroom sync now loads teachers and students directly from Google."
  );
}

main().catch((error) => {
  console.error("Seed script failed", error);
  process.exit(1);
});