const pg = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = "postgresql://postgres:drallambalaram@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";
const sqlPath = path.resolve(__dirname, '../../scratch/supabase_migration.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
    servername: 'db.fothvpivwytaibkdhkci.supabase.co'
  }
});

async function main() {
  try {
    await client.connect();
    console.log("Connected to database successfully using SNI! Running migration...");
    await client.query(sql);
    console.log("Migration completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

main();
