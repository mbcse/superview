import { api } from "@/lib/api";
import { PublicTake } from "./public-take";
import { decisionLabel } from "@/lib/agent-copy";

export default async function PublicTakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data: {
      take: {
        chainId?: number;
        lens?: string;
        astrologySystem?: string | null;
        author?: { handle?: string };
        revisions?: Array<{
          sentence?: string;
          astrologyChart?: string | null;
          target?: { holdings?: Array<{ id?: string; token?: { symbol?: string; logoUrl?: string | null; chainId?: number }; weightBps: number; rationale?: string; role?: string }> };
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
        chart={data.take.lens === "SKY" ? rev?.astrologyChart ?? null : null}
        lens={data.take.lens}
        astrologySystem={data.take.astrologySystem}
        vs={vs}
        agentLine={agentLine}
        holdings={holdings}
        chainId={data.take.chainId}
      />
    );
  } catch {
    return <p className="text-muted">View not found.</p>;
  }
}
