import React from "react";
import {phaseId} from "../utils/phase.js";
import {PHASE_COLORS} from "../config/constants.js";
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
  trackFilter,
  approvalsOnly
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

  const isEmpty = rawCount === 0;
  const chevron = h(
    "span",
    {className: "chev", "aria-hidden": "true"},
    h("svg", {viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round"}, h("path", {d: "m9 6 6 6-6 6"}))
  );

  return h(
    "section",
    {
      className: `card phase-card ${isEmpty ? "is-empty" : ""}`,
      key: phase,
      "data-phase": phase,
      id: phaseId(phase),
      style: {"--ph": PHASE_COLORS[phase] || "var(--border-strong)"}
    },
    h(
      "details",
      {"data-role": "phase", open: openPhase},
      h(
        "summary",
        {className: "phase-summary"},
        h(
          "div",
          {className: "flex items-center gap-2 min-w-0"},
          chevron,
          h("span", {className: "phase-swatch", "aria-hidden": "true"}),
          h(
            "span",
            {className: "phase-name"},
            phase,
            filterLabel ? h("span", {className: "filter-note"}, filterLabel) : null
          )
        ),
        h(
          "div",
          {className: "flex items-center gap-2"},
          h(
            "span",
            {className: `count-chip summary-count ${isEmpty ? "" : "strong"}`},
            `${rawCount} ${rawCount === 1 ? "issue" : "issues"}`
          ),
          rawCount > 0 && h(
            "button",
            {
              type: "button",
              onClick: handleCopyKeys,
              className: `icon-btn copy-btn ${copied ? "is-done" : ""}`,
              title: copied ? "Copied!" : "Copy JIRA keys",
              "aria-label": "Copy JIRA keys"
            },
            copied
              ? h("svg", {width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true"}, h("path", {d: "M20 6 9 17l-5-5"}))
              : h(
                  "svg",
                  {width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true"},
                  h("rect", {x: 9, y: 9, width: 12, height: 12, rx: 2}),
                  h("path", {d: "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"})
                )
          )
        )
      ),
      h(
        "div",
        {className: "phase-body"},
        issues.length === 0
          ? h("div", {className: "empty-note"}, "No issues")
          : issues.map((issue) => {
              const issueMatch = q && matchesQuery(q, issue);
              const subMatch = q && (issue.subtasks || []).some((st) => matchesQuery(q, issue, st));
              const openSubtasks = subMatch;
              return h(IssueCard, {issue, openSubtasks, isMatch: issueMatch || subMatch, searchQuery, statusConfig, isaFilter, trackFilter, approvalsOnly, key: issue.key || issue.summary});
            })
      )
    )
  );
}
