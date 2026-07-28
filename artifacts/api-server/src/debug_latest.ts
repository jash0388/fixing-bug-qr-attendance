
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  const { data: records } = await supabase
    .from("qr_attendance")
    .select("*, qr_users(name)")
    .order("last_scan_at", { ascending: false })
    .limit(10);

  console.log("Latest 10 records:");
  records?.forEach(r => {
    console.log(`${r.qr_users?.name} | Date: ${r.date} | Entry: ${r.entry_time} | Exit: ${r.exit_time} | Last: ${r.last_scan_at}`);
  });
}

debug();
