import { api } from "@/lib/api";
import { PublicTake } from "./public-take";
import { decisionLabel } from "@/lib/agent-copy";

export default async function PublicTakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data: {
      take: {
        author?: { handle?: string };
        revisions?: Array<{
          sentence?: string;
          target?: { holdings?: Array<{ id?: string; token?: { symbol?: string; logoUrl?: string | null }; weightBps: number; rationale?: string; role?: string }> };
        }>;
        valuations?: Array<{ indexValue: unknown; benchmarkIndex: unknown }>;
      };
    } = await api(`/v1/takes/${id}`);
    const rev = data.take.revisions?.[0];
    const holdings = rev?.target?.holdings ?? [];
    const val = data.take.valuations?.[data.take.valuations.length - 1];
    const vs = val ? Number(val.indexValue) - Number(val.benchmarkIndex) : null;
    let agentLine = "Checked today. No change.";
    try {
      const agent = await api<{ brief: { summary: string } | null; decisions: Array<{ status: string }> }>(`/v1/takes/${id}/agent`);
      agentLine = agent.brief?.summary ?? decisionLabel(agent.decisions[0]?.status);
    } catch {
      /* public */
    }
    return (
      <PublicTake
        takeId={id}
        handle={data.take.author?.handle ?? ""}
        sentence={rev?.sentence ?? "Untitled view"}
        vs={vs}
        agentLine={agentLine}
        holdings={holdings}
      />
    );
  } catch {
    return <p className="text-muted">View not found.</p>;
  }
}
