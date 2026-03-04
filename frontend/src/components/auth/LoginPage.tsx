import { useState } from "react";
import { useAuthStore } from "../../store/authStore";

interface Props {
  isSetup: boolean;
}

export function LoginPage({ isSetup }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const endpoint = isSetup ? "/api/auth/setup" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setToken(data.token!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base flex items-center justify-center">
      <div className="w-80 bg-panel border border-border rounded-lg p-8">
        <h1 className="text-white text-lg font-bold mb-0.5 tracking-tight">IsItaBuy?</h1>
        <p className="text-muted text-xs mb-6">
          {isSetup ? "Create your dashboard password" : "Enter your password to continue"}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-[9px] font-semibold uppercase tracking-wider text-muted block mb-1.5">
              Password
            </label>
            <input
              type="password"
              placeholder={isSetup ? "Choose a password (min 8 chars)" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface border border-border text-white font-mono rounded px-3 py-2.5 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-down text-xs bg-red-soft border border-down/20 rounded px-2.5 py-1.5">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-white font-semibold rounded py-2.5 text-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "..." : isSetup ? "Set Password" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
