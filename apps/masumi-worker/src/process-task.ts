import { startAgentJob, waitForAgentResult } from "./agent-client.js";
import { submitResultHash, waitUntilEscrowFunded } from "./masumi-pay.js";

export type TaskRequest = {
  /** Sokosumi Task id (or any external id you track). */
  taskId: string;
  belief: string;
  horizon?: string;
  /**
   * Masumi payment / purchase id used to OBSERVE escrow.
   * Required when MOCK_PAYMENTS=false.
   */
  paymentId?: string;
  purchaserId?: string;
};

export type TaskResult = {
  taskId: string;
  payment: { funded: boolean; source: string };
  jobId: string;
  result: string;
  resultHash?: string;
  takeId?: string;
  runId?: string;
  resultHashSubmit?: unknown;
};

/**
 * Correct paid order:
 * 1) Wait until Masumi confirms escrow (or mock for unpaid smoke test)
 * 2) Call masumi-agent → existing SuperView POST /v1/research
 * 3) Optionally submit resultHash back to MPS
 *
 * Payment status is NEVER stored in SuperView Prisma.
 */
export async function processPaidTask(req: TaskRequest): Promise<TaskResult> {
  const payment = await waitUntilEscrowFunded(req.paymentId);
  const started = await startAgentJob(req.belief, req.horizon, req.purchaserId || req.taskId);
  const done = await waitForAgentResult(started.job_id);
  const resultHashSubmit = await submitResultHash(req.paymentId, done.resultHash || "");
  return {
    taskId: req.taskId,
    payment: { funded: payment.funded, source: payment.source },
    jobId: started.job_id,
    result: done.result!,
    resultHash: done.resultHash,
    takeId: done.takeId,
    runId: done.runId,
    resultHashSubmit
  };
}
