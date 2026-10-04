"use client";

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
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
  className,
  variant = "page"
}: {
  takeId: string;
  sentence?: string | null;
  className?: string;
  variant?: "page" | "sheet";
}) {
  const fetchApi = useAuthedFetch();
  const [comments, setComments] = useState<ViewComment[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sheet = variant === "sheet";

  const load = useCallback(async () => {
    const d = await fetchApi<{ comments: ViewComment[] }>(`/v1/takes/${takeId}/comments`);
    setComments(
      (d.comments ?? []).filter(
        (c) => !/invalid token|"code"\s*:\s*16|Write an investment memo|You are the agent that runs this view|Comment to reply to:|\{\{view\}\}/i.test(c.body)
      )
    );
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

  const list = (
    <ul className={sheet ? "min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4" : "mt-4 space-y-4"}>
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
  );

  const form = (
    <form
      onSubmit={(e) => void post(e)}
      className={
        sheet
          ? "shrink-0 border-t border-teal/12 bg-white/80 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]"
          : "mt-5"
      }
    >
      {replyTo ? (
        <button type="button" className="mb-2 text-[12px] text-teal" onClick={() => setReplyTo(null)}>
          Cancel reply
        </button>
      ) : null}
      <div className="flex items-end gap-2 rounded-2xl border border-teal/15 bg-white/70 px-3 py-2">
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
  );

  if (sheet) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        {sentence ? (
          <p className="shrink-0 border-b border-teal/10 px-5 pb-3 text-[14px] font-medium leading-snug text-ink">
            {sentence}
          </p>
        ) : null}
        {list}
        {form}
      </div>
    );
  }

  return (
    <div className={className}>
      {sentence ? <p className="text-[15px] font-medium leading-snug text-ink">{sentence}</p> : null}
      {list}
      {form}
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
  const drag = useDragControls();

  useEffect(() => {
    if (!args) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [args, onClose]);

  return (
    <AnimatePresence>
      {args ? (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
        >
          <motion.button
            type="button"
            aria-label="Close comments"
            onClick={onClose}
            className="absolute inset-0 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="comments-title"
            initial={reduce ? false : { y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: reduce ? 0 : 0.32, ease: [0.23, 1, 0.32, 1] }}
            drag={reduce ? false : "y"}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 700) onClose();
            }}
            className="glass-sheet absolute inset-x-0 bottom-0 flex h-[min(70vh,640px)] w-full flex-col overflow-hidden rounded-t-[24px]"
          >
            <div className="mx-auto flex min-h-0 w-full max-w-[680px] flex-1 flex-col">
              <div
                className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2 active:cursor-grabbing"
                onPointerDown={(e) => drag.start(e)}
              >
                <span className="h-1 w-10 rounded-full bg-ink/18" aria-hidden />
                <div className="flex w-full items-center justify-between px-4 pb-1 pt-2">
                  <h2 id="comments-title" className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.02em] text-ink">
                    <ChatCircle size={18} />
                    Comments
                  </h2>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="grid size-9 place-items-center rounded-full text-muted hover:bg-mist hover:text-ink"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <ViewCommentsList takeId={args.takeId} sentence={args.sentence} variant="sheet" />
            </div>
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
