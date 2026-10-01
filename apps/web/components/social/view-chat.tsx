"use client";

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChatCircle, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { AgentPost } from "@/components/social/agent-post";
import { cn } from "@/lib/cn";

export type ViewComment = {
  id: string;
  body: string;
  createdAt: string;
  parentId?: string | null;
  authorType: string;
  user?: { id?: string; handle?: string | null; displayName?: string | null; avatar?: string | null } | null;
  isAuthor?: boolean;
};

type OpenArgs = { takeId: string; sentence?: string | null; authorHandle?: string | null };

const Ctx = createContext<{
  openComments: (args: OpenArgs) => void;
  closeComments: () => void;
}>({ openComments: () => {}, closeComments: () => {} });

export function useViewComments() {
  return useContext(Ctx);
}

export function ViewCommentsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenArgs | null>(null);
  return (
    <Ctx.Provider value={{ openComments: setOpen, closeComments: () => setOpen(null) }}>
      {children}
      <ViewCommentsSheet args={open} onClose={() => setOpen(null)} />
    </Ctx.Provider>
  );
}

function initialsOf(name?: string | null) {
  const parts = (name ?? "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function ViewCommentsList({
  takeId,
  sentence,
  className
}: {
  takeId: string;
  sentence?: string | null;
  className?: string;
}) {
  const fetchApi = useAuthedFetch();
  const [comments, setComments] = useState<ViewComment[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await fetchApi<{ comments: ViewComment[] }>(`/v1/takes/${takeId}/comments`);
    setComments((d.comments ?? []).filter((c) => !/invalid token|"code"\s*:\s*16/i.test(c.body)));
  }, [fetchApi, takeId]);

  useEffect(() => {
    void load().catch(() => setComments([]));
  }, [load]);

  async function post(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      await fetchApi(`/v1/takes/${takeId}/comments`, {
        method: "POST",
        body: JSON.stringify({ kind: "UPDATE", body: text, parentId: replyTo ?? undefined })
      });
      setBody("");
      setReplyTo(null);
      await load();
    } catch {
      /* keep draft */
    }
    setBusy(false);
  }

  const roots = comments.filter((c) => !c.parentId);
  const byParent = new Map<string, ViewComment[]>();
  for (const c of comments) {
    if (!c.parentId) continue;
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }

  return (
    <div className={className}>
      {sentence ? <p className="text-[15px] font-medium leading-snug text-ink">“{sentence}”</p> : null}
      <ul className="mt-4 space-y-4">
        {roots.length ? (
          roots.map((c) => (
            <li key={c.id}>
              <CommentRow comment={c} onReply={() => setReplyTo(c.id)} />
              {(byParent.get(c.id) ?? []).map((r) => (
                <div key={r.id} className="ml-8 mt-3">
                  <CommentRow comment={r} onReply={() => setReplyTo(r.id)} />
                </div>
              ))}
            </li>
          ))
        ) : (
          <li className="text-[14px] text-muted">Be the first to comment.</li>
        )}
      </ul>
      <form onSubmit={(e) => void post(e)} className="mt-5">
        {replyTo ? (
          <button type="button" className="mb-2 text-[12px] text-teal" onClick={() => setReplyTo(null)}>
            Cancel reply
          </button>
        ) : null}
        <div className="flex items-end gap-2 rounded-2xl border border-teal/15 bg-glass/70 px-3 py-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            className="min-h-10 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
          />
          <Button type="submit" size="icon" variant="primary" disabled={busy || !body.trim()} aria-label="Post comment">
            <PaperPlaneTilt size={16} />
          </Button>
        </div>
      </form>
    </div>
  );
}

function CommentRow({ comment, onReply }: { comment: ViewComment; onReply: () => void }) {
  if (comment.authorType === "AGENT") {
    return <AgentPost body={comment.body} at={comment.createdAt} />;
  }
  const name = comment.user?.displayName ?? comment.user?.handle ?? "Member";
  return (
    <div className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-teal/15 bg-mist text-[10px] font-semibold">
        {initialsOf(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="font-medium text-ink">{name}</span>
          {comment.user?.handle ? <span className="text-muted">{comment.user.handle}</span> : null}
          {comment.isAuthor ? (
            <span className="rounded-full bg-mist px-2 py-0.5 text-[11px] font-medium text-teal">Author</span>
          ) : null}
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-ink">{comment.body}</p>
        <button type="button" onClick={onReply} className="mt-1 text-[12px] text-muted hover:text-ink">
          Reply
        </button>
      </div>
    </div>
  );
}

function ViewCommentsSheet({ args, onClose }: { args: OpenArgs | null; onClose: () => void }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!args) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [args, onClose]);

  return (
    <AnimatePresence>
      {args ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="comments-title"
            initial={reduce ? false : { y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="glass-sheet relative max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] p-6 pb-8 md:max-w-[520px] md:rounded-[28px] md:p-8"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-mist hover:text-ink"
            >
              <X size={16} />
            </button>
            <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
              <ChatCircle size={16} /> Comments
            </p>
            <h2 id="comments-title" className="sr-only">
              Comments
            </h2>
            <ViewCommentsList takeId={args.takeId} sentence={args.sentence} className="mt-4" />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function CommentsButton({
  takeId,
  sentence,
  count,
  className,
  children
}: {
  takeId: string;
  sentence?: string | null;
  count?: number;
  className?: string;
  children?: ReactNode;
}) {
  const { openComments } = useViewComments();
  return (
    <button
      type="button"
      onClick={() => openComments({ takeId, sentence })}
      className={cn("flex items-center gap-1", className)}
      aria-label={`${count ?? 0} comments`}
    >
      {children ?? (
        <>
          <ChatCircle size={13} />
          {count ?? 0}
        </>
      )}
    </button>
  );
}
