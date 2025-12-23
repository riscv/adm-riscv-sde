import {PHASE_ALIASES, PHASE_LOOKUP, PHASE_ORDER} from "../config/constants.js";

// Phase parsing helpers from subtask summary prefixes.

export function phaseFromSummary(summary){
  const match = /^\s*\[([^\]]+)\]/.exec(summary || "");
  if(!match) return null;
  const label = match[1].trim().toLowerCase();
  if(Object.prototype.hasOwnProperty.call(PHASE_ALIASES, label)){
    return PHASE_ALIASES[label];
  }
  return PHASE_LOOKUP[label] || null;
}

export function phaseIndex(phase){
  if(!phase) return -1;
  return PHASE_ORDER.indexOf(phase);
}

export function phaseId(phase){
  return `phase-${String(phase || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
