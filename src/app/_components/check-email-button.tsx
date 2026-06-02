"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkEmailNowAction } from "@/lib/actions";

export function CheckEmailButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleClick() {
    setMessage(null);
    start(async () => {
      const result = await checkEmailNowAction();
      setMessage(result.message ?? (result.ok ? "Done." : "Something went wrong."));
      if (result.created > 0) router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {pending ? "Checking email…" : "Check email now"}
      </button>
      {message && (
        <span className="max-w-xs text-right text-xs text-zinc-500">{message}</span>
      )}
    </div>
  );
}
