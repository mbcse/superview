import { api } from "@/lib/api";
import { PageHeader, Surface } from "@/components/ui/surface";
import { Chip } from "@/components/ui/surface";

export default async function AdminPage() {
  let flags: Array<{ key: string; enabled: boolean }> = [];
  try {
    const data = await api<{ flags: typeof flags }>("/v1/flags");
    flags = data.flags;
  } catch {}
  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader title="Control" description="Flags." />
      <div className="grid gap-3 sm:grid-cols-2">
        {flags.map((f) => (
          <Surface key={f.key} className="flex items-center justify-between p-5">
            <p className="font-medium">{f.key}</p>
            <Chip tone={f.enabled ? "live" : "neutral"}>{f.enabled ? "on" : "off"}</Chip>
          </Surface>
        ))}
      </div>
    </div>
  );
}
