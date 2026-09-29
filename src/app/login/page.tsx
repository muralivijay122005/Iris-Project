"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { LuBrain, LuCommand, LuEye, LuEyeOff, LuLock, LuMail, LuPaperclip, LuUser } from "react-icons/lu";
import { IrisMark } from "../../components/ui/brand";
import { cn } from "../../components/ui/primitives";

const OAUTH_ERRORS: Record<string, string> = {
  AccessDenied: "Google sign-in was blocked. If this keeps happening, the account may already exist with a different sign-in method.",
  OAuthSignin: "Couldn't start Google sign-in. Please try again.",
  OAuthCallback: "Google sign-in was interrupted. Please try again.",
  OAuthAccountNotLinked: "This email is already registered with a password. Log in with your password instead.",
  CredentialsSignin: "Incorrect username or password.",
  SessionRequired: "Please log in to continue.",
};

function Field({
  label,
  icon,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  icon: React.ReactNode;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle">{icon}</span>
        <input
          type={isPassword && show ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="h-11 w-full rounded-xl border border-line-strong bg-elevated pl-10 pr-10 text-[15px] text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-fg-subtle hover:text-fg"
          >
            {show ? <LuEyeOff size={16} /> : <LuEye size={16} />}
          </button>
        )}
      </span>
    </label>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"form" | "google" | null>(null);

  useEffect(() => {
    const code = params.get("error");
    if (code) setError(OAUTH_ERRORS[code] ?? "Sign-in failed. Please try again.");
  }, [params]);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const switchMode = (m: "login" | "signup") => {
    setMode(m);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (mode === "signup") {
      if (password.length < 6) return setError("Use at least 6 characters for your password.");
      if (password !== confirmPassword) return setError("Passwords don't match.");
      setBusy("form");
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      }).catch(() => null);
      setBusy(null);
      if (res?.ok) {
        switchMode("login");
        setNotice("Account created. Log in to continue.");
      } else {
        const data = await res?.json().catch(() => ({}));
        setError(data?.error === "User exists" ? "That username or email is already taken." : data?.error || "Something went wrong.");
      }
      return;
    }

    setBusy("form");
    const res = await signIn("credentials", { username, password, redirect: false });
    setBusy(null);
    if (res?.ok) router.replace("/");
    else setError("Incorrect username or password.");
  };

  return (
    <div className="w-full max-w-[380px]">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-fg">
          <IrisMark size={18} />
        </span>
        <span className="text-lg font-minecraft tracking-tight">iris</span>
      </div>

      <h1 className="text-[28px] font-semibold tracking-tight text-fg">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-1.5 text-[15px] text-fg-muted">
        {mode === "login" ? "Log in to continue to Iris." : "Start chatting with Iris in seconds."}
      </p>

      <button
        type="button"
        disabled={busy !== null}
        onClick={() => {
          setBusy("google");
          signIn("google", { callbackUrl: "/" });
        }}
        className="mt-8 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-elevated text-[15px] font-medium text-fg transition-colors hover:bg-surface disabled:opacity-60"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Google_Logo.svg" alt="" className="h-[18px] w-[18px]" />
        {busy === "google" ? "Redirecting…" : "Continue with Google"}
      </button>

      <div className="my-6 flex items-center gap-3 text-xs text-fg-subtle">
        <span className="h-px flex-1 bg-line-strong" />
        or
        <span className="h-px flex-1 bg-line-strong" />
      </div>

      {error && (
        <div className="animate-fade-in mb-4 rounded-xl border border-danger/25 bg-danger/8 px-3.5 py-2.5 text-sm text-danger" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="animate-fade-in mb-4 rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-sm text-fg" role="status">
          {notice}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && (
          <Field label="Email" icon={<LuMail size={16} />} type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
        )}
        <Field
          label={mode === "login" ? "Username or email" : "Username"}
          icon={<LuUser size={16} />}
          value={username}
          onChange={setUsername}
          placeholder={mode === "login" ? "Enter your username or email" : "Choose a username"}
          autoComplete="username"
        />
        <Field
          label="Password"
          icon={<LuLock size={16} />}
          type="password"
          value={password}
          onChange={setPassword}
          placeholder={mode === "login" ? "Enter your password" : "At least 6 characters"}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {mode === "signup" && (
          <Field label="Confirm password" icon={<LuLock size={16} />} type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter your password" autoComplete="new-password" />
        )}
        <button
          type="submit"
          disabled={busy !== null}
          className="h-11 w-full rounded-xl bg-accent text-[15px] font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy === "form" ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-fg-muted">
        {mode === "login" ? "New to Iris? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => switchMode(mode === "login" ? "signup" : "login")}
          className="font-medium text-accent hover:underline"
        >
          {mode === "login" ? "Create an account" : "Log in"}
        </button>
      </p>
    </div>
  );
}

function BrandPanel() {
  const features = [
    { icon: LuBrain, title: "Remembers you", body: "Iris learns your preferences across chats — you stay in control." },
    { icon: LuPaperclip, title: "Reads any file", body: "PDF, Word, Excel, slides, code and more." },
    { icon: LuCommand, title: "Built for speed", body: "Streaming replies and a ⌘K command palette." },
  ];
  return (
    <div className="relative hidden overflow-hidden border-l border-line bg-sidebar lg:flex lg:flex-col lg:justify-center lg:px-16">
      <div
        aria-hidden
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(38rem 26rem at 85% 10%, color-mix(in oklch, var(--accent) 30%, transparent), transparent 70%), radial-gradient(30rem 24rem at 5% 95%, color-mix(in oklch, var(--accent) 18%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative mx-auto w-full max-w-[460px]">
        {/* Mini conversation preview */}
        <div className="rounded-3xl border border-line bg-elevated/80 p-5 shadow-dialog backdrop-blur">
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-3xl rounded-br-lg bg-surface-2 px-4 py-2.5 text-sm text-fg">
              Summarize this quarterly report in 3 bullets
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-elevated px-2.5 py-1.5 text-xs text-fg-muted">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-red-500/12 text-[10px] font-bold text-red-500">PDF</span>
              Q3-report.pdf
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-accent">
              <IrisMark size={13} />
            </span>
            <div className="space-y-1.5 text-sm leading-6 text-fg">
              <p>Here&rsquo;s the gist:</p>
              <ul className="list-disc space-y-1 pl-5 marker:text-fg-subtle">
                <li>Revenue grew <strong>18%</strong> quarter over quarter</li>
                <li>Churn fell to <strong>2.1%</strong> after the pricing change</li>
                <li>Hiring is focused on support and data</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg-muted">
            <LuBrain size={12} className="text-accent" /> Memory updated
          </div>
        </div>

        <div className="mt-10 space-y-5">
          {features.map((f) => (
            <div key={f.title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-elevated text-accent">
                <f.icon size={18} />
              </span>
              <div>
                <div className="text-[15px] font-semibold text-fg">{f.title}</div>
                <div className="text-sm text-fg-muted">{f.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className={cn("grid min-h-dvh bg-bg text-fg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]")}>
      <div className="flex items-center justify-center px-6 py-12">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
      <BrandPanel />
    </div>
  );
}
