"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { ConfirmButton } from "@/components/ui";

interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin" | "user";
  hasPassword: boolean;
  hasGoogle: boolean;
  createdAt: string;
}

const EMPTY = { email: "", displayName: "", role: "user" as "admin" | "user", password: "" };

export function UsersManager({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-row "set new password" input.
  const [pwEdit, setPwEdit] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setUsers(await api<User[]>("/api/users"));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/api/users", { method: "POST", body: form });
      setForm({ ...EMPTY });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function setRole(id: string, role: "admin" | "user") {
    await api(`/api/users/${id}`, { method: "PATCH", body: { role } });
    load();
  }

  async function setPassword(id: string) {
    const password = pwEdit[id]?.trim();
    if (!password) return;
    await api(`/api/users/${id}`, { method: "PATCH", body: { password } });
    setPwEdit((p) => ({ ...p, [id]: "" }));
    load();
  }

  async function remove(id: string) {
    await api(`/api/users/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      {/* Add new user */}
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold">הוספת משתמש</h2>
        <form onSubmit={addUser} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600">אימייל</label>
            <input
              type="email"
              className="input"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">שם לתצוגה</label>
            <input
              type="text"
              className="input"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">סיסמה</label>
            <input
              type="text"
              className="input"
              placeholder="להתחברות עם אימייל וסיסמה"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">הרשאה</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "user" })}
            >
              <option value="user">משתמש</option>
              <option value="admin">מנהל</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex items-center justify-between">
            {error ? <p className="text-sm text-red-600">{error}</p> : <span />}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "מוסיף…" : "+ הוסף משתמש"}
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-gray-400">
          ניתן להשאיר סיסמה ריקה אם המשתמש יתחבר עם Google בלבד (חשבון ה-Google חייב להיות עם אותו
          אימייל).
        </p>
      </div>

      {/* Existing users */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">טוען…</div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="th">שם / אימייל</th>
                <th className="th">התחברות</th>
                <th className="th">הרשאה</th>
                <th className="th">סיסמה חדשה</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <tr key={u.id} className="hover:bg-gray-50 align-top">
                    <td className="td">
                      <div className="font-medium text-gray-800">{u.displayName ?? "—"}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {u.hasPassword && <span className="badge bg-gray-100 text-gray-600">סיסמה</span>}
                        {u.hasGoogle && <span className="badge bg-blue-50 text-blue-600">Google</span>}
                        {!u.hasPassword && !u.hasGoogle && (
                          <span className="badge bg-amber-50 text-amber-600">אין</span>
                        )}
                      </div>
                    </td>
                    <td className="td">
                      <select
                        className="input !py-1 text-sm"
                        value={u.role}
                        disabled={isSelf}
                        onChange={(e) => setRole(u.id, e.target.value as "admin" | "user")}
                      >
                        <option value="user">משתמש</option>
                        <option value="admin">מנהל</option>
                      </select>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          className="input !py-1 text-sm max-w-[9rem]"
                          placeholder="סיסמה חדשה"
                          value={pwEdit[u.id] ?? ""}
                          onChange={(e) => setPwEdit((p) => ({ ...p, [u.id]: e.target.value }))}
                        />
                        <button
                          className="btn-secondary !py-1 text-xs"
                          disabled={!pwEdit[u.id]?.trim()}
                          onClick={() => setPassword(u.id)}
                        >
                          עדכן
                        </button>
                      </div>
                    </td>
                    <td className="td text-left">
                      {isSelf ? (
                        <span className="text-xs text-gray-400">אתה</span>
                      ) : (
                        <ConfirmButton
                          className="text-sm text-red-600 hover:underline"
                          message={`למחוק את ${u.email}?`}
                          onConfirm={() => remove(u.id)}
                        >
                          מחיקה
                        </ConfirmButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
