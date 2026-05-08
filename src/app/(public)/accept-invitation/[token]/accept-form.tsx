"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitationAction } from "@/features/team/actions";

export function AcceptForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    const password = String(formData.get("password") ?? "");
    const fullName = String(formData.get("fullName") ?? "").trim();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!fullName) {
      setError("Please tell us your name.");
      return;
    }
    startTransition(async () => {
      const r = await acceptInvitationAction({
        token,
        password,
        fullName,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(r.redirectUrl);
    });
  }

  return (
    <form action={submit} className="mt-8 space-y-4">
      <div>
        <label className="text-sm text-ink-secondary block mb-1">Email</label>
        <input
          type="email"
          value={email}
          readOnly
          className="w-full rounded border border-stone-300 bg-stone-50 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm text-ink-secondary block mb-1">Your name</label>
        <input
          type="text"
          name="fullName"
          required
          className="w-full rounded border border-stone-300 px-3 py-2"
          placeholder="Jane Operator"
        />
      </div>
      <div>
        <label className="text-sm text-ink-secondary block mb-1">Password</label>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          className="w-full rounded border border-stone-300 px-3 py-2"
          placeholder="At least 8 characters"
        />
      </div>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-stone-900 text-white py-3 rounded hover:bg-stone-700 disabled:opacity-60"
      >
        {pending ? "Activating…" : "Accept invitation"}
      </button>
    </form>
  );
}
