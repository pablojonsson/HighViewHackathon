import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { Pool } from "pg";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in environment variables.");
  }

  const schemaPath = path.resolve(__dirname, "../schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");

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
    await pool.query(schema);
    console.log("Database schema applied successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to initialize database", error);
  process.exit(1);
});
