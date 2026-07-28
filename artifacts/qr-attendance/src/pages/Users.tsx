import { useState } from "react";
import {
  useListUsers,
  useCreateUser,
  useDeleteUser,
  useGetQrCode,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { BackButton } from "@/components/BackButton";
import { UserPlus, Trash2, QrCode, Download, Search, X } from "lucide-react";

type NewUser = { name: string; uniqueId: string; role: "student" | "staff" };

function QrModal({ userId, name, onClose }: { userId: number; name: string; onClose: () => void }) {
  const { data, isLoading } = useGetQrCode(userId);

  const handleDownload = () => {
    if (!data?.qrCodeDataUrl) return;
    
    // Create a canvas to combine QR and labels
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const qrSize = img.width;
      const labelHeight = 80;
      canvas.width = qrSize;
      canvas.height = qrSize + labelHeight;

      // Fill white background
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw QR Code
      ctx.drawImage(img, 0, 0);

      // Draw Labels
      ctx.fillStyle = "black";
      ctx.textAlign = "center";
      
      // Roll Number
      ctx.font = "bold 20px Helvetica, Arial, sans-serif";
      ctx.fillText(data.uniqueId, qrSize / 2, qrSize + 25);
      
      // Name
      ctx.font = "16px Helvetica, Arial, sans-serif";
      ctx.fillText(name, qrSize / 2, qrSize + 55);

      // Trigger Download
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `QR_${data.uniqueId}_${name.replace(/\s+/g, "_")}.png`;
      link.click();
    };
    img.src = data.qrCodeDataUrl;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">QR Code — {name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : data ? (
          <div className="flex flex-col items-center gap-4">
            <div className="p-3 bg-white rounded-xl">
              <img src={data.qrCodeDataUrl} alt="QR Code" className="w-48 h-48" />
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">Unique ID</p>
              <p className="text-lg font-mono font-bold text-white mt-1">{data.uniqueId}</p>
            </div>
            <button
              data-testid="download-qr"
              onClick={handleDownload}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Users() {
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<"" | "student" | "staff">("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [qrUserId, setQrUserId] = useState<number | null>(null);
  const [qrUserName, setQrUserName] = useState("");
  const [newUser, setNewUser] = useState<NewUser>({ name: "", uniqueId: "", role: "student" });

  const { data: users = [], isLoading } = useListUsers(
    roleFilter ? { role: roleFilter } : undefined,
    {
      query: { queryKey: getListUsersQueryKey(roleFilter ? { role: roleFilter } : undefined) }
    }
  );

  const createMutation = useCreateUser();
  const deleteMutation = useDeleteUser();

  const filteredUsers = search
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.uniqueId.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const trimmedName = newUser.name.trim();
    if (!trimmedName) {
      setCreateError("Please enter a name.");
      return;
    }
    createMutation.mutate(
      { data: { name: trimmedName, ...(newUser.uniqueId.trim() ? { uniqueId: newUser.uniqueId.trim() } : {}), role: newUser.role } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setNewUser({ name: "", uniqueId: "", role: "student" });
          setShowForm(false);
          setCreateError(null);
        },
        onError: async (err: any) => {
          let msg = "Failed to create user.";
          try {
            if (err?.data?.error) msg = err.data.error;
            else if (err?.response) {
              const json = await err.response.clone().json();
              if (json?.error) msg = json.error;
            } else if (err?.message) msg = err.message;
          } catch {}
          setCreateError(msg);
        },
      }
    );
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
      }
    );
  };

  const [isPrinting, setIsPrinting] = useState(false);

  return (
    <Layout>
      {qrUserId !== null && (
        <QrModal userId={qrUserId} name={qrUserName} onClose={() => setQrUserId(null)} />
      )}
      <div className="p-6 max-w-6xl mx-auto">
        <BackButton />
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Users</h1>
            <p className="text-sm text-slate-400 mt-1">Manage students and staff</p>
          </div>
          <div className="flex gap-2">
            <button
              disabled={isPrinting || !users.length}
              onClick={async () => {
                try {
                  setIsPrinting(true);
                  const { jsPDF } = await import("jspdf");
                  const doc = new jsPDF();
                  const margin = 10;
                  const qrSize = 40;
                  const spacing = 10;
                  const labelSpace = 15;
                  const cols = 4;
                  const rows = 4;
                  const perPage = cols * rows;
                  
                  let currentIdx = 0;
                  
                  for (const user of users) {
                    if (currentIdx > 0 && currentIdx % perPage === 0) doc.addPage();
                    
                    const pageIdx = currentIdx % perPage;
                    const col = pageIdx % cols;
                    const row = Math.floor(pageIdx / cols);
                    
                    const x = margin + col * (qrSize + spacing);
                    const y = margin + row * (qrSize + spacing + labelSpace);

                    try {
                      const res = await fetch(`/api/qrcode/${user.id}`, {
                        headers: { 
                          "Authorization": `Bearer ${localStorage.getItem("token") || "bypass-token"}` 
                        }
                      });
                      if (res.ok) {
                        const { qrCodeDataUrl } = await res.json();
                        if (qrCodeDataUrl) {
                          doc.addImage(qrCodeDataUrl, "PNG", x, y, qrSize, qrSize);
                          doc.setFontSize(8);
                          doc.text(user.uniqueId, x + qrSize / 2, y + qrSize + 4, { align: "center" });
                          doc.setFontSize(6);
                          const displayName = user.name.length > 25 ? user.name.substring(0, 22) + "..." : user.name;
                          doc.text(displayName, x + qrSize / 2, y + qrSize + 8, { align: "center" });
                        }
                      }
                    } catch (e) {
                      console.error("Error adding QR to PDF:", e);
                    }
                    
                    currentIdx++;
                  }
                  
                  doc.save(`SPHN_All_Student_QR_Codes_${new Date().getTime()}.pdf`);
                } catch (err) {
                  console.error("PDF Export failed:", err);
                  alert("Failed to export PDF. Please try again.");
                } finally {
                  setIsPrinting(false);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {isPrinting ? "Generating PDF..." : "Print All"}
            </button>
            <button
              data-testid="add-user-button"
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add User
            </button>
          </div>
        </div>

        {/* Add user form */}
        {showForm && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-white mb-4">Add New User</h2>
            {createError && (
              <div data-testid="create-user-error" className="mb-4 px-3 py-2 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm">
                {createError}
              </div>
            )}
            <form onSubmit={handleCreate} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name *</label>
                <input
                  data-testid="user-name-input"
                  type="text"
                  required
                  value={newUser.name}
                  onChange={(e) => { setCreateError(null); setNewUser((p) => ({ ...p, name: e.target.value })); }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Unique ID (optional)</label>
                <input
                  data-testid="user-uid-input"
                  type="text"
                  value={newUser.uniqueId}
                  onChange={(e) => { setCreateError(null); setNewUser((p) => ({ ...p, uniqueId: e.target.value })); }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Auto-generated if blank"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Role *</label>
                <select
                  data-testid="user-role-select"
                  value={newUser.role}
                  onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value as "student" | "staff" }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="student">Student</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  data-testid="create-user-submit"
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-semibold transition-colors"
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="py-2 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              data-testid="user-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or ID..."
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            {(["", "student", "staff"] as const).map((r) => (
              <button
                key={r}
                data-testid={`filter-${r || "all"}`}
                onClick={() => setRoleFilter(r)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  roleFilter === r
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {r === "" ? "All" : r === "student" ? "Students" : "Staff"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table data-testid="users-table" className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Unique ID</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">Added</th>
                  <th className="text-right text-xs font-medium text-slate-400 px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(5)].map((_, j) => (
                        <td key={j} className="px-5 py-4">
                          <div className="h-4 bg-slate-800 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !filteredUsers.length ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-500">
                      No users found
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-300 flex-shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-white">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-sm text-slate-300">{user.uniqueId}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            user.role === "student"
                              ? "bg-blue-900/40 text-blue-400"
                              : "bg-purple-900/40 text-purple-400"
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-400">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            data-testid={`view-qr-${user.id}`}
                            onClick={() => { setQrUserId(user.id); setQrUserName(user.name); }}
                            className="p-2 rounded-lg bg-slate-700 hover:bg-blue-900/40 text-slate-400 hover:text-blue-400 transition-colors"
                            title="View QR Code"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          <button
                            data-testid={`delete-user-${user.id}`}
                            onClick={() => handleDelete(user.id, user.name)}
                            className="p-2 rounded-lg bg-slate-700 hover:bg-red-900/40 text-slate-400 hover:text-red-400 transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
