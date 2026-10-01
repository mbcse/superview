"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Gate } from "@/components/gate";

export default function OnboardPage() {
  return (
    <Gate>
      <OnboardInner />
    </Gate>
  );
}

function OnboardInner() {
  const fetchApi = useAuthedFetch();
  const router = useRouter();
  const [country, setCountry] = useState("SG");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    try {
      await fetchApi("/v1/me/attestation", { method: "POST", body: JSON.stringify({ country }) });
      await fetchApi("/v1/me/mode", { method: "POST", body: JSON.stringify({ mode: "WATCH" }) });
      router.push("/app");
    } catch {
      setError("Couldn’t save that. Try again.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-[min(520px,calc(100%-24px))] flex-col justify-center page-canvas py-16">
      <h1 className="display text-[28px] md:text-[32px]">Before you trade live</h1>
      <p className="mt-3 text-[16px] text-muted">Confirm your country.</p>
      <ul className="mt-8 space-y-3 text-[15px] leading-[1.5] text-muted">
        <li>Stock tokens are not shares.</li>
        <li>Not available to US persons and several other jurisdictions.</li>
        <li>Paper money first. Real money spends from your wallet.</li>
      </ul>
      <label className="mt-8 block text-[14px] font-medium">
        Country of residence
        <Input className="mt-2" value={country} onChange={(e: ChangeEvent<HTMLInputElement>) => setCountry(e.target.value.toUpperCase())} name="country" />
      </label>
      {error ? <p className="mt-3 text-down">{error}</p> : null}
      <Button className="mt-6 rounded-full" variant="primary" onClick={() => void submit()}>
        Continue
      </Button>
    </main>
  );
}
