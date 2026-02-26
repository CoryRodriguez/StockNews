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
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server unavailable — please try again later");
      }
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
    <div className="min-h-screen bg-surface flex items-center justify-center font-mono">
      <div className="w-80 bg-panel border border-border rounded-lg p-8">
        <h1 className="text-white text-xl font-semibold mb-1">Day Trade Dashboard</h1>
        <p className="text-muted text-sm mb-6">
          {isSetup ? "Create your dashboard password" : "Enter your password"}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            placeholder={isSetup ? "Choose a password (min 8 chars)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface border border-border text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
            autoFocus
          />
          {error && <p className="text-down text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-surface font-semibold rounded py-2 text-sm hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "..." : isSetup ? "Set Password" : "Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}
