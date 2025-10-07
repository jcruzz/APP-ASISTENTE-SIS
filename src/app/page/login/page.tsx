"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data?.error ?? "Error al iniciar sesión");
        setLoading(false);
        return;
      }

      // Guarda el JWT (simple para desarrollo). En prod, usa cookie HttpOnly.
      localStorage.setItem("jwt", data.token);

      // Redirige a tu dashboard (ajusta la ruta si quieres)
      router.push("/page/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("No se pudo conectar");
      }
      setLoading(false);
    }
  };

  const loginWithGoogle = () => {
    // Inicia el flujo OAuth
    window.location.href = "/api/auth/oauth/google";
  };

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }} className="slide-in-fwd-center">
      <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 380, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Iniciar sesión</h1>

        <label style={{ display: "grid", gap: 4 }}>
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@dominio.com"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span>Contraseña</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>

        {errorMsg && (
          <div style={{ color: "#b00020", fontSize: 14 }}>{errorMsg}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #222",
            background: "#222",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <button
          type="button"
          onClick={loginWithGoogle}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Continuar con Google
        </button>

        <a href="/forgot-password" style={{ textAlign: "center", fontSize: 14 }}>
          ¿Olvidaste tu contraseña?
        </a>
      </form>
    </main>
  );
}
