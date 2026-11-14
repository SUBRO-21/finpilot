"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setToken } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", email: "", password: "", openingBalance: "0" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const body = mode === "login" ? { email: f.email, password: f.password } : { ...f, openingBalance: Number(f.openingBalance) || 0 };
      const r = await api(`/auth/${mode}`, { body });
      setToken(r.token);
      router.push("/");
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <form className="card" style={{ maxWidth: 380, margin: "10vh auto" }} onSubmit={submit}>
      <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
      {mode === "register" && (<><label htmlFor="name">Name</label><input id="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></>)}
      <label htmlFor="email">Email</label><input id="email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
      <label htmlFor="pw">Password</label><input id="pw" type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
      {mode === "register" && (<><label htmlFor="ob">Balance before your first imported transaction</label><input id="ob" type="number" value={f.openingBalance} onChange={(e) => setF({ ...f, openingBalance: e.target.value })} /></>)}
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ marginTop: 16 }}>
        <button disabled={busy}>{mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" className="ghost" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Create an account" : "I have an account"}
        </button>
      </div>
    </form>
  );
}
