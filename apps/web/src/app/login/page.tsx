"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setToken } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", email: "", password: "", openingBalance: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const body = mode === "login" ? { email: f.email, password: f.password } : { name: f.name, email: f.email, password: f.password, openingBalance: Number(f.openingBalance) || 0 };
      const r = await api(`/auth/${mode}`, { body });
      setToken(r.token);
      router.push("/");
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div className="logo" style={{ marginBottom: 28 }}>FinOS</div>
        <h1 className="h-lg">{mode === "login" ? <>Welcome <em>back</em>.</> : <>Know your <em>cash</em>.</>}</h1>
        <p className="lead" style={{ marginTop: 12, fontSize: 17 }}>{mode === "login" ? "Sign in to see your forecast." : "See where your money is heading and when it might run short."}</p>
        <form className="card" style={{ marginTop: 28, padding: 28 }} onSubmit={submit}>
          {mode === "register" && (<><label className="f" htmlFor="name" style={{ marginTop: 0 }}>Name</label><input id="name" autoComplete="name" value={f.name} onChange={up("name")} required /></>)}
          <label className="f" htmlFor="email" style={mode === "login" ? { marginTop: 0 } : undefined}>Email</label><input id="email" type="email" autoComplete="email" value={f.email} onChange={up("email")} required />
          <label className="f" htmlFor="pw">Password</label><input id="pw" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={f.password} onChange={up("password")} required />
          {mode === "register" && (<><label className="f" htmlFor="ob">Starting balance (₹)</label><input id="ob" type="number" placeholder="0" value={f.openingBalance} onChange={up("openingBalance")} /><p className="small tag" style={{ marginTop: 8 }}>Your balance before your first imported transaction. A statement with an opening balance row overrides this.</p></>)}
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" style={{ width: "100%", marginTop: 24 }} disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <p className="muted" style={{ marginTop: 18, textAlign: "center" }}>
          {mode === "login" ? "New here? " : "Already registered? "}
          <button className="linkbtn" style={{ textDecoration: "underline" }} onClick={() => { setErr(""); setMode(mode === "login" ? "register" : "login"); }}>{mode === "login" ? "Create an account" : "Sign in"}</button>
        </p>
      </div>
    </div>
  );
}
