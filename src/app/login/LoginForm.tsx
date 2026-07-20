"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("אימייל או סיסמה שגויים");
      return;
    }
    router.push("/contacts");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {googleEnabled && (
        <>
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/contacts" })}
            className="btn-secondary w-full"
          >
            <span className="text-lg">G</span>
            התחברות עם Google
          </button>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />
            או
            <span className="h-px flex-1 bg-gray-200" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">אימייל</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="admin@example.com"
          />
        </div>
        <div>
          <label className="label">סיסמה</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "מתחבר…" : "התחברות"}
        </button>
      </form>

      <p className="text-center text-xs text-gray-400">
        משתמש ברירת מחדל: admin@example.com / admin1234
      </p>
    </div>
  );
}
