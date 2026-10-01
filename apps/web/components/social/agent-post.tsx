export function AgentPost({ body, at }: { body: string; at?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-secondary px-4 py-3">
      <p className="text-[12px] font-medium text-lime">Agent</p>
      <p className="mt-1 text-[14px] leading-[1.55]">{body}</p>
      {at ? <p className="mt-2 text-[12px] text-muted">{new Date(at).toLocaleString()}</p> : null}
    </div>
  );
}
