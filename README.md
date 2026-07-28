# QR Attendance System — Fixed & Production-Ready Codebase

A high-performance, offline-ready QR code attendance management system built for campus entry/exit tracking, faculty mentor rosters, and HOD departmental oversight.

---

## 🏛️ System Architecture Overview

This project is structured as a **pnpm monorepo** consisting of two main modules:

1. **`artifacts/qr-attendance`** (Frontend):
   - Built with **React**, **Vite**, **TypeScript**, and **TailwindCSS**.
   - Progressive Web App (PWA) with offline scanning support (`offlineScanner.ts`).
   - Scanner Pages: Gate Security Scanner (`/security`), Quick Scanner (`/scanner`), HOD Dashboard (`/hod`), Mentor Roster (`/mentor`), and Admin Control Panel (`/admin`).

2. **`artifacts/api-server`** (Backend API):
   - Built with **Node.js**, **Express**, and **TypeScript**.
   - Uses **Supabase (PostgreSQL)** for persistence.
   - Express API routes for batch QR scanning, daily attendance calculation, section stats, mentor schedule management, and bulk log operations.

---

## 🔑 Access Codes & Login Credentials

| Portal / Function | Access Code / Passkey | URL Path | Description |
| :--- | :---: | :--- | :--- |
| **Admin Panel** | `038899` | `/login` | Full system control (user rosters, daily gate logs, timetable scheduler) |
| **Security Gate Scanner** | `038899` | `/security` | Offline-ready gate camera scanner for campus entry/exit |
| **HOD Dashboard** | `038811` | `/login` | Departmental summary grid, section attendance %, detailed logs |
| **Mentor Roster Passkeys** | `101` – `114` | `/mentor` | Teacher 3-digit passkeys to open section rosters |

---

## 📦 Database Schema (Supabase)

### 1. `qr_users` Table
Stores student and faculty profile information:
* `id` (Primary Key, Integer)
* `name` (String, e.g. "POOJARI REDDI RANI")
* `unique_id` (String, Roll Number / Identifier, e.g. "24N81A67E1")
* `role` (Enum: `"student"` | `"staff"`)
* `section` (String, e.g. "DS II/I/A", "DS III/I/B")
* `batch` (String, e.g. "2025")

### 2. `qr_attendance` Table
Stores raw attendance scan records:
* `id` (Primary Key, Integer)
* `user_id` (Foreign Key -> `qr_users.id`)
* `date` (String, YYYY-MM-DD, calculated via IST hostel day logic)
* `entry_time` (Timestamp, IST entry scan time)
* `exit_time` (Timestamp, IST exit scan time)
* `status` (Enum: `"inside"` | `"left"`)
* `scan_count` (Integer)
* `last_scan_at` (Timestamp)

---

## ⚙️ How the Offline QR Scanner & Queue Work

1. **Local Scanning**:
   - When a gate security guard scans a student's QR code on `/security`, the app validates the QR code against a locally cached list of students in `localStorage` (`secapp.users.v1`).
   - If valid, the scan is immediately enqueued locally into `localStorage` (`secapp.queue.v1`).
   - Each scan object is secured using a **SHA-256 tamper-evident hash chain**.

2. **Background Batch Sync**:
   - The app runs a background sync worker (`syncQueue()`) every 3 seconds when an internet connection is detected.
   - It sends queued scans to `/api/scan/batch` in small **50-scan chunks**.
   - Upon receiving HTTP 200 from the server, processed scans are evicted from local storage.

---

## 🛠️ Key Fixes Implemented in this Repository

### 1. Supabase 1,000-Row Limit Resolution
- **Problem**: Supabase API caps unpaginated `select()` queries at 1,000 records. Once daily total scans exceeded 1,000, older records were cut off, causing the dashboard present count to drop.
- **Fix**: Updated `/api/attendance/today`, `/api/attendance`, and `/api/attendance/dashboard-stats` in `attendance.ts` to auto-paginate using chunked range queries (`range(from, from + 999)`). 100% of all student records are now retrieved and displayed.

### 2. Batch Replay Protection (HTTP 409) Fix
- **Problem**: Retrying failed batch IDs returned an HTTP 409 Conflict error, causing client `customFetch` to throw an exception and lock offline queues.
- **Fix**: Updated `/api/scan/batch` to return HTTP 200 OK with `{ alreadyProcessed: true }` when duplicate batch IDs are received, allowing client apps to clear their queues safely.

### 3. Camera Frame Multi-Scan Debouncing
- **Problem**: Video camera feeds (15–30 fps) generated multiple scan entries if a QR card was held for 1–2 seconds.
- **Fix**: Increased camera scan debounce window from `1.2s` to `4s` in `Scanner.tsx` and 10s in `SecurityApp.tsx`.

---

## 🚀 Running Locally & Deploying

### Running Locally
```bash
# 1. Install dependencies
pnpm install

# 2. Start development servers
pnpm dev
```

### Deploying to Vercel
```bash
# Deploy to Production
npx vercel --prod --yes
```
