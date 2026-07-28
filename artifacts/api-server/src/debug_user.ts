
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  const { data: users } = await supabase.from("qr_users").select("*").eq("name", "VUPPALA PRANITHA").limit(1);
  if (!users?.[0]) { console.log("User not found"); return; }
  const user = users[0];
  
  const { data: records } = await supabase
    .from("qr_attendance")
    .select("*")
    .eq("user_id", user.id)
    .order("last_scan_at", { ascending: false });

  console.log("User:", user.id, user.name);
  console.log("Records:", JSON.stringify(records, null, 2));
}

debug();
