import {PHASE_COLORS} from "../config/constants.js";

// Formatting helpers used by UI rendering and exports.

export function hexToRgb(hex){
  const h = hex.replace("#", "");
  const b = parseInt(h, 16);
  return {r: (b >> 16) & 255, g: (b >> 8) & 255, b: b & 255};
}

export function rgbToHex(r, g, b){
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

export function lighten(hex, f = 0.75){
  const {r, g, b} = hexToRgb(hex);
  return rgbToHex(Math.round(r + (255 - r) * f), Math.round(g + (255 - g) * f), Math.round(b + (255 - b) * f));
}

export function phaseStyle(phase, isEmpty){
  const has = Object.prototype.hasOwnProperty.call(PHASE_COLORS, phase);
  let bg, fg, border;
  if(has){
    bg = isEmpty ? lighten(PHASE_COLORS[phase], 0.85) : PHASE_COLORS[phase];
    fg = isEmpty ? "#1f2937" : "#fff";
    border = isEmpty ? "1px solid #e5e7eb" : "1px solid transparent";
  }else{
    bg = isEmpty ? "#f8fafc" : "#f3f4f6";
    fg = "#111827";
    border = "1px solid #e5e7eb";
  }
  return {background: bg, color: fg, border};
}

export function highlightText(text, query, h){
  if(!query) return text || "";
  const lower = String(text || "");
  const idx = lower.toLowerCase().indexOf(query.toLowerCase());
  if(idx === -1) return text || "";
  const before = lower.slice(0, idx);
  const match = lower.slice(idx, idx + query.length);
  const after = lower.slice(idx + query.length);
  return [before, h("mark", {className: "match"}, match), after];
}

export function formatDelta(ms){
  const sec = Math.max(0, Math.floor(ms / 1000));
  if(sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if(min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if(hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function issueIsaValue(issue){
  const isaRaw = issue?.isa_or_non_isa && (issue.isa_or_non_isa.value ?? null);
  return isaRaw ? String(isaRaw).trim().toUpperCase() : "";
}

export function issueTrackValue(issue){
  const ftRaw = issue?.is_fast_track && (issue.is_fast_track.value ?? null);
  const v = typeof ftRaw === "string" ? ftRaw.trim().toLowerCase() : "";
  return (v === "yes") ? "Fast-Track" : (v === "no" ? "Regular" : "");
}

export function buildMailto(issue, issuePhase, taskCounts, phaseTasks, isaDisplay, ftDisplay, ghUrl){
  const jiraUrl = `https://riscv.atlassian.net/browse/${encodeURIComponent(issue.key || "")}`;
  const lines = [];
  lines.push(`Item: ${issue.summary || ""}`.trim());
  lines.push(`Jira: ${jiraUrl}`);
  lines.push(`Phase: ${issuePhase}`);
  lines.push(`Tasks (${issuePhase}): ${taskCounts.done}/${taskCounts.total} (${taskCounts.pct}%)`);
  lines.push(`ISA: ${isaDisplay || "Unknown"}`);
  lines.push(`Track: ${ftDisplay || "Unknown"}`);
  lines.push(`GitHub: ${ghUrl || "N/A"}`);
  lines.push("");
  lines.push("Tasks:");
  if(phaseTasks.length === 0){
    lines.push("- None");
  }else{
    phaseTasks.forEach((st) => {
      const status = st.status || "Unknown";
      const key = st.key || "";
      const summary = st.summary || "";
      lines.push(`- ${status}: ${key} ${summary}`.trim());
    });
  }
  const subject = `RISC-V Spec Update: ${issue.key || ""} ${issue.summary || ""}`.trim();
  const body = lines.join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildSummaryText(issue, issuePhase, taskCounts, phaseTasks, isaDisplay, ftDisplay, ghUrl){
  const jiraUrl = `https://riscv.atlassian.net/browse/${encodeURIComponent(issue.key || "")}`;
  const lines = [];
  lines.push(`Item: ${issue.summary || ""}`.trim());
  lines.push(`Jira: ${jiraUrl}`);
  lines.push(`Phase: ${issuePhase}`);
  lines.push(`Tasks (${issuePhase}): ${taskCounts.done}/${taskCounts.total} (${taskCounts.pct}%)`);
  lines.push(`ISA: ${isaDisplay || "Unknown"}`);
  lines.push(`Track: ${ftDisplay || "Unknown"}`);
  lines.push(`GitHub: ${ghUrl || "N/A"}`);
  lines.push("");
  lines.push("Tasks:");
  if(phaseTasks.length === 0){
    lines.push("- None");
  }else{
    phaseTasks.forEach((st) => {
      const status = st.status || "Unknown";
      const key = st.key || "";
      const summary = st.summary || "";
      lines.push(`- ${status}: ${key} ${summary}`.trim());
    });
  }
  return lines.join("\n");
}

export function validateYamlShape(data){
  const errors = [];
  if(!data || typeof data !== "object"){
    errors.push("YAML root must be an object.");
    return {ok: false, errors};
  }
  if(data.schema_version == null){
    errors.push("Missing schema_version.");
  }
  if(!data.counts || typeof data.counts !== "object"){
    errors.push("Missing counts object.");
  }
  if(!data.phases || typeof data.phases !== "object"){
    errors.push("Missing phases object.");
  }
  return {ok: errors.length === 0, errors};
}
