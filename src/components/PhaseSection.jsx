import React from "react";
import {phaseId} from "../utils/phase.js";
import {phaseStyle} from "../utils/format.js";
import {PHASE_ORDER} from "../config/constants.js";
import {matchesQuery} from "../utils/search.js";
import IssueCard from "./IssueCard.jsx";

// Renders a phase header and its list of issues.
const h = React.createElement;

export default function PhaseSection({
  phase,
  data,
  counts,
  filteredData,
  searchQuery,
  expandPhases,
  expandedPhase,
  statusConfig,
  isaFilter,
  trackFilter
}){
  const allIssues = data?.phases?.[phase] || [];
  const rawCount = typeof counts[phase] === "number" ? counts[phase] : allIssues.length;
  const issues = filteredData.phases?.[phase] || [];
  const q = searchQuery.trim().toLowerCase();
  const openPhase = expandPhases || (expandedPhase === phase) || (q && issues.length > 0);
  const isaCount = isaFilter ? allIssues.filter((i) => i && i.isa_or_non_isa && String(i.isa_or_non_isa.value || "").trim().toUpperCase() === isaFilter).length : 0;
  const trackCount = trackFilter ? allIssues.filter((i) => {
    const v = typeof (i?.is_fast_track?.value) === "string" ? i.is_fast_track.value.trim().toLowerCase() : "";
    const trackVal = (v === "yes") ? "Fast-Track" : (v === "no" ? "Regular" : "");
    return trackVal === trackFilter;
  }).length : 0;
  const filterParts = [];
  if(isaFilter) filterParts.push(`${isaCount} ${isaFilter}`);
  if(trackFilter) filterParts.push(`${trackCount} ${trackFilter}`);
  const filterLabel = filterParts.length ? ` (${filterParts.join(", ")})` : "";

  return h(
    "section",
    {className: "mb-4", key: phase, "data-phase": phase, id: phaseId(phase)},
    h(
      "details",
      {"data-role": "phase", open: openPhase},
      h(
        "summary",
        {className: "flex items-center justify-between cursor-pointer select-none px-3 py-2 rounded", style: phaseStyle(phase, rawCount === 0)},
        h(
          "div",
          {className: "flex items-center gap-2"},
          h("span", {className: "chev"}, ">"),
          h("span", {className: "font-medium"}, `${phase}${filterLabel}`)
        ),
        h(
          "div",
          {className: "summary-count text-xs", style: {color: rawCount === 0 ? "#6b7280" : "rgba(255,255,255,.9)"}},
          `${rawCount} ${rawCount === 1 ? "issue" : "issues"}`
        )
      ),
      h(
        "div",
        {className: "mt-2 space-y-2"},
        issues.length === 0
          ? h("div", {className: "text-sm text-gray-500 px-3 py-2 italic"}, "No issues")
          : issues.map((issue) => {
              const issueMatch = q && matchesQuery(q, issue);
              const subMatch = q && (issue.subtasks || []).some((st) => matchesQuery(q, issue, st));
              const openSubtasks = subMatch;
              return h(IssueCard, {issue, openSubtasks, isMatch: issueMatch || subMatch, searchQuery, statusConfig, isaFilter, trackFilter, key: issue.key || issue.summary});
            })
      )
    )
  );
}
