const pg = require('pg');

const connectionString = "postgresql://postgres.fothvpivwytaibkdhkci:drallambalaram@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres";

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  try {
    await client.connect();
    console.log("Connected to database successfully. Adding columns to qr_users...");
    
    // Add section and batch columns if not exist
    await client.query("ALTER TABLE qr_users ADD COLUMN IF NOT EXISTS section TEXT;");
    await client.query("ALTER TABLE qr_users ADD COLUMN IF NOT EXISTS batch TEXT;");
    
    console.log("Columns added successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

main();
