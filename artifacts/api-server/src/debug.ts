
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  const { count: userCount } = await supabase.from("qr_users").select("*", { count: "exact", head: true });
  const { data: students } = await supabase.from("qr_users").select("id, role");
  
  const { data: latestRecords } = await supabase
    .from("qr_attendance")
    .select("user_id, entry_time, exit_time")
    .order("date", { ascending: false })
    .order("last_scan_at", { ascending: false });

  console.log("Total Users (count):", userCount);
  console.log("Total Students fetched:", students?.length);
  
  const latestStatusMap = new Map();
  if (latestRecords) {
    for (const r of latestRecords) {
      if (!latestStatusMap.has(r.user_id)) {
        const entry = r.entry_time ? new Date(r.entry_time).getTime() : 0;
        const exit = r.exit_time ? new Date(r.exit_time).getTime() : 0;
        latestStatusMap.set(r.user_id, entry >= exit);
      }
    }
  }
  
  console.log("Latest records found:", latestRecords?.length);
  
  let insideCount = 0;
  if (students) {
    for (const s of students) {
      if (latestStatusMap.get(s.id) !== false) insideCount++;
    }
  }
  
  console.log("Calculated Inside Count:", insideCount);
}

debug();
