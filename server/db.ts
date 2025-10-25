import "dotenv/config";
import { Pool, PoolClient, QueryResult } from "pg";

const { DATABASE_URL, PGSSLMODE } = process.env;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in environment variables.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl:
    PGSSLMODE === "require"
      ? {
          rejectUnauthorized: false
        }
      : undefined
});

export const query = <T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>> =>
  pool.query<T>(text, params);

export const withTransaction = async <T>(
  handler: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export type { PoolClient } from "pg";
