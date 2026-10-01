export const PROMPT_VERSION = "2026-09-30.1";

export { INTERPRETER_PROMPT, VERSION as INTERPRETER_VERSION } from "./interpreter.js";
export { SCREENER_PROMPT, VERSION as SCREENER_VERSION } from "./screener.js";
export { DILIGENCE_PROMPT, WEB_DILIGENCE_PROMPT, WEB_NEWS_PROMPT, VERSION as DILIGENCE_VERSION } from "./diligence.js";
export { discoveryObjective, WEB_DISCOVER_PROMPT, VERSION as DISCOVERY_VERSION } from "./discovery.js";
export { ANALYST_PROMPT, VERSION as ANALYST_VERSION } from "./analyst.js";
export { PORTFOLIO_MANAGER_PROMPT, VERSION as PORTFOLIO_MANAGER_VERSION } from "./portfolio-manager.js";
export { CRITIC_PROMPT, VERSION as CRITIC_VERSION } from "./critic.js";
export { MONITOR_PROMPT, VERSION as MONITOR_VERSION } from "./monitor.js";
export { THREAD_REPLY_PROMPT, VERSION as THREAD_REPLY_VERSION } from "./thread-reply.js";
export { MANUS_MEMO_PROMPT, VERSION as MANUS_MEMO_VERSION } from "./manus-memo.js";

export function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}
