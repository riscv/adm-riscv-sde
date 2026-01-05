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

  const [copied, setCopied] = React.useState(false);

  const handleCopyKeys = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const keys = allIssues.map(issue => issue.key).filter(Boolean).join(", ");

    try {
      await navigator.clipboard.writeText(keys);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

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
          {className: "flex items-center gap-2"},
          h(
            "span",
            {className: "summary-count text-xs", style: {color: rawCount === 0 ? "#6b7280" : "rgba(255,255,255,.9)"}},
            `${rawCount} ${rawCount === 1 ? "issue" : "issues"}`
          ),
          rawCount > 0 && h(
            "button",
            {
              onClick: handleCopyKeys,
              className: "copy-btn p-1 rounded hover:bg-white/20 transition-colors",
              title: copied ? "Copied!" : "Copy JIRA keys",
              "aria-label": "Copy JIRA keys"
            },
            copied ? h(
              "svg",
              {width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg"},
              h("path", {d: "M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z", fill: "rgba(255,255,255,.9)"})
            ) : h(
              "svg",
              {width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg"},
              h("path", {d: "M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z", fill: "rgba(255,255,255,.9)"}),
              h("path", {d: "M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z", fill: "rgba(255,255,255,.9)"})
            )
          )
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
