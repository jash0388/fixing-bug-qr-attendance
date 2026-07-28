import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setAuthTokenRefresher, setBaseUrl } from "@workspace/api-client-react";
import { ensureFreshToken } from "./contexts/AuthContext";
import App from "./App";
import "./index.css";

setAuthTokenGetter(() => localStorage.getItem("qr_token"));
setAuthTokenRefresher(() => ensureFreshToken());

// Production → external backend URL (dev uses Vite proxy for /api)
if (!import.meta.env.DEV && import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL);
}

createRoot(document.getElementById("root")!).render(<App />);
// force redeploy 3
// auto-deploy trigger 1
