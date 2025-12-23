import {DEFAULT_STATUS_CONFIG} from "../config/constants.js";

// Status normalization and counting utilities.

export function normalizeStatusConfig(cfg){
  const doneStatuses = Array.isArray(cfg?.doneStatuses) ? cfg.doneStatuses : DEFAULT_STATUS_CONFIG.doneStatuses;
  const notStartedStatuses = Array.isArray(cfg?.notStartedStatuses) ? cfg.notStartedStatuses : DEFAULT_STATUS_CONFIG.notStartedStatuses;
  return {
    doneStatuses: doneStatuses.map((s) => String(s).toLowerCase()),
    notStartedStatuses: notStartedStatuses.map((s) => String(s).toLowerCase())
  };
}

export function statusClass(status, statusConfig){
  if(!status) return "status-neutral";
  const s = status.toLowerCase();
  const cfg = normalizeStatusConfig(statusConfig);
  const doneSet = new Set(cfg.doneStatuses);
  const notStartedSet = new Set(cfg.notStartedStatuses);
  if(doneSet.has(s)) return "status-done";
  if(notStartedSet.has(s)) return "status-not-started";
  return "status-in-progress";
}

export function rowStatusClass(status, statusConfig){
  const badge = statusClass(status, statusConfig);
  if(badge === "status-done") return "row-status-done";
  if(badge === "status-in-progress") return "row-status-in-progress";
  if(badge === "status-not-started") return "row-status-not-started";
  return "";
}

export function countByStatus(items, opts){
  const doneStatuses = new Set((opts?.doneStatuses || []).map((s) => s.toLowerCase()));
  const notStartedStatuses = new Set((opts?.notStartedStatuses || []).map((s) => s.toLowerCase()));
  let done = 0;
  let notStarted = 0;
  for(const item of items){
    const status = (item.status || "").toLowerCase();
    if(status === "done" || doneStatuses.has(status)) done += 1;
    else if(notStartedStatuses.has(status) || ["not started", "to do", "open", "backlog"].includes(status)) notStarted += 1;
  }
  const total = items.length;
  const inProgress = Math.max(0, total - done - notStarted);
  const pct = total ? Math.round((done / total) * 100) : 0;
  return {done, total, notStarted, inProgress, pct};
}

export function firstPendingApproval(approvals, doneStatuses){
  const doneSet = new Set(doneStatuses.map((s) => s.toLowerCase()));
  for(const item of approvals){
    const status = (item.status || "").toLowerCase();
    if(status !== "done" && !doneSet.has(status)) return item;
  }
  return null;
}
