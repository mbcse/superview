"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { Notice, PageHeader, Surface } from "@/components/ui/surface";

export default function SettingsPage() {
  const { logout, displayName } = useAuth();
  const fetchApi = useAuthedFetch();
  const [msg, setMsg] = useState("");
  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader title="Settings" description="Account and deletion." />
      <Surface className="p-5">
        <p className="text-[13px] text-muted">Signed in as</p>
        <p className="mt-1 display text-[22px]">{displayName}</p>
        <Button className="mt-4" variant="ghost" onClick={() => void logout()}>
          Log out
        </Button>
      </Surface>
      <Surface className="p-5">
        <h2 className="text-[20px] font-semibold">Delete account</h2>
        <p className="mt-2 max-w-[42rem] text-muted">
          Deletes access immediately. You can start deletion now. If you have live activity, cancel it first.
        </p>
        {msg ? (
          <div className="mt-3">
            <Notice tone="warn">{msg}</Notice>
          </div>
        ) : null}
        <Button
          className="mt-4"
          variant="danger"
          onClick={async () => {
            if (!confirm("Delete this account?")) return;
            const res = await fetchApi<{ message: string }>("/v1/me/delete", { method: "POST" });
            setMsg(res.message);
            await logout();
          }}
        >
          Delete account
        </Button>
      </Surface>
    </div>
  );
}
