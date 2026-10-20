import React from "react";
import {APPROVAL_TYPES, PHASE_COLORS} from "../config/constants.js";
import {phaseFromSummary, phaseIndex} from "../utils/phase.js";
import {buildMailto, buildSummaryText, highlightText, issueIsaValue, issueTrackValue} from "../utils/format.js";
import {countByStatus, firstPendingApproval, rowStatusClass, statusClass} from "../utils/status.js";

// Issue card with status, approvals, actions, and subtasks.
const h = React.createElement;

function isApproval(sub){
  return sub.is_approval === true || APPROVAL_TYPES.has(sub.type || "");
}

export default function IssueCard({issue, openSubtasks, isMatch, searchQuery, statusConfig, isaFilter, trackFilter, approvalsOnly}){
  const issuePhase = issue.phase || "";
  const phaseTasks = (issue.subtasks || []).filter((st) => phaseFromSummary(st.summary) === issuePhase);
  const taskOnly = phaseTasks.filter((st) => !isApproval(st));
  const taskCounts = countByStatus(taskOnly);
  const approvalTasks = phaseTasks.filter((st) => isApproval(st));
  const approvalDoneStatuses = ["approved", "approval not required", "ar review not required", "arc review not required"];
  const approvalCounts = countByStatus(approvalTasks, {
    doneStatuses: approvalDoneStatuses
  });
  const nextApproval = firstPendingApproval(approvalTasks, approvalDoneStatuses);
  const phaseSummaryEl = taskCounts.total > 0
    ? h(
        "div",
        {className: "meta-line"},
        issue.days_in_phase != null
          ? [h("span", {className: "meta-strong", key: "d"}, `${issue.days_in_phase}d`), ` in ${issuePhase}`]
          : `in ${issuePhase}`,
        h("span", {className: "meta-divider"}, "|"),
        h("span", {className: "meta-label"}, "Tasks Completed: "),
        h("span", {className: "meta-strong"}, `${taskCounts.done}/${taskCounts.total}`),
        h("span", {className: "meta-divider"}, "|"),
        h("span", {className: "meta-label"}, "Tasks in Progress: "),
        h("span", {className: "meta-strong"}, taskCounts.inProgress)
      )
    : null;
  const approvalsEl = approvalCounts.total > 0
    ? h(
        "div",
        {className: "meta-line"},
        h("span", {className: "meta-label"}, "Approvals: "),
        h("span", {className: "meta-strong"}, `${approvalCounts.done}/${approvalCounts.total}`),
        h("span", {className: "meta-divider"}, "|"),
        h("span", {className: "meta-label"}, "Next Approval: "),
        nextApproval
          ? h(
              "a",
              {
                className: "approval-link",
                href: `https://riscv.atlassian.net/browse/${encodeURIComponent(nextApproval.key || "")}`,
                target: "_blank",
                rel: "noopener noreferrer"
              },
              `${nextApproval.summary || ""} (${nextApproval.key || ""})`.trim()
            )
          : "None"
      )
    : null;
  const isaDisplay = issueIsaValue(issue) || null;
  const ftDisplayClean = issueTrackValue(issue) || null;
  const ghUrl = issue.github || null;
  const linkedIssues = Array.isArray(issue.linked_issues) ? issue.linked_issues : [];
  const linkedRelations = linkedIssues.filter((li) => {
    const rel = String(li.relationship || "").toLowerCase();
    return rel === "is developed by" || rel === "is governed by";
  });
  const leadNodes = [];
  if(isaDisplay){
    leadNodes.push(h("span", {key: "isa", className: `tag-pill ${isaFilter && isaDisplay === isaFilter ? "filter-highlight" : ""}`}, isaDisplay));
  }
  if(ftDisplayClean){
    leadNodes.push(h("span", {key: "track", className: `tag-pill ${trackFilter && ftDisplayClean === trackFilter ? "filter-highlight" : ""}`}, ftDisplayClean));
  }
  const relationNodes = linkedRelations.map((li, idx) => {
    const jiraUrl = `https://riscv.atlassian.net/browse/${encodeURIComponent(li.key || "")}`;
    const relText = String(li.relationship || "").trim();
    const summaryText = String(li.summary || "").trim();
    const keyText = String(li.key || "").trim();
    const linkLabel = summaryText || keyText || "";
    return h(
      "span",
      {className: "meta-muted", key: `${li.key || ""}-${li.relationship || ""}`},
      idx > 0 ? " • " : "",
      relText ? `${relText} ` : "",
      h(
        "a",
        {className: "approval-link", href: jiraUrl, target: "_blank", rel: "noopener noreferrer"},
        linkLabel
      ),
      summaryText && keyText ? ` (${keyText})` : ""
    );
  });
  const mailto = buildMailto(issue, issuePhase, taskCounts, taskOnly, isaDisplay, ftDisplayClean, ghUrl);
  const summaryText = buildSummaryText(issue, issuePhase, taskCounts, taskOnly, isaDisplay, ftDisplayClean, ghUrl);

  const handleCopy = async () => {
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(summaryText);
      }else{
        const area = document.createElement("textarea");
        area.value = summaryText;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
    }catch{}
  };

  const stroke = {viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", role: "img", "aria-hidden": "true", className: "gh-ico"};
  // With "Approvals only" on, the list shows just the approval subtasks and opens.
  const allSubtasks = issue.subtasks || [];
  const subtasks = approvalsOnly ? allSubtasks.filter(isApproval) : allSubtasks;
  const chevron = h(
    "span",
    {className: "chev", "aria-hidden": "true"},
    h("svg", {viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round"}, h("path", {d: "m9 6 6 6-6 6"}))
  );

  return h(
    "div",
    {
      className: "issue-card",
      "data-match": isMatch ? "true" : "false",
      key: issue.key || issue.summary
    },
    h(
      "div",
      {className: "issue-head"},
      h(
        "div",
        {className: "flex items-start justify-between gap-3"},
        h(
          "div",
          {className: "flex items-baseline gap-2 min-w-0 flex-wrap"},
          h(
            "a",
            {
              className: "mono issue-key",
              href: `https://riscv.atlassian.net/browse/${encodeURIComponent(issue.key || "")}`,
              target: "_blank",
              rel: "noopener noreferrer"
            },
            highlightText(issue.key || "", searchQuery, h)
          ),
          h("span", {className: "issue-title"}, highlightText(issue.summary || "", searchQuery, h))
        ),
        h(
          "div",
          {className: "flex items-center gap-1.5 flex-none"},
          ghUrl ? h(
            "a",
            {className: "icon-btn", href: ghUrl, target: "_blank", rel: "noopener noreferrer", "aria-label": "Open GitHub repository", title: "GitHub repository"},
            h("svg", {className: "gh-ico", viewBox: "0 0 24 24", fill: "currentColor", role: "img", "aria-hidden": "true"},
              h("path", {d: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.016-2.04-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.084-.73.084-.73 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.304.762-1.604-2.665-.303-5.466-1.334-5.466-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.523.117-3.176 0 0 1.008-.322 3.301 1.23A11.52 11.52 0 0 1 12 6.844c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23 .655 1.653.243 2.873.119 3.176 .77.840 1.235 1.911 1.235 3.221 0 4.609-2.804 5.624-5.476 5.921.43.371.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.286 0 .321.216.694.825.576C20.565 22.092 24 17.592 24 12.297 24 5.373 18.627 0 12 0z"})
            )
          ) : null,
          h(
            "a",
            {className: "icon-btn", href: mailto, "aria-label": "Compose status email", title: "Compose status email"},
            h("svg", stroke, h("path", {d: "M22 2 11 13"}), h("path", {d: "M22 2 15 22l-4-9-9-4 20-7z"}))
          ),
          h(
            "button",
            {className: "icon-btn", type: "button", onClick: handleCopy, "aria-label": "Copy summary", title: "Copy summary"},
            h("svg", stroke, h("rect", {x: 9, y: 9, width: 12, height: 12, rx: 2}), h("path", {d: "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"}))
          )
        )
      ),
      h(
        "div",
        {className: "info-bar"},
        leadNodes.length || relationNodes.length
          ? h(
              "div",
              {className: "meta-line"},
              leadNodes,
              relationNodes
            )
          : null,
        phaseSummaryEl,
        approvalsEl
      )
    ),
    h(
      "details",
      {className: "subtasks", open: !!openSubtasks || !!approvalsOnly},
      h(
        "summary",
        {className: "subtasks-summary"},
        chevron,
        h("span", null, approvalsOnly ? "Approvals" : "Subtasks"),
        h("span", {className: "count-chip"}, subtasks.length)
      ),
      h(
        "div",
        {className: "subtask-list"},
        approvalsOnly && subtasks.length === 0
          ? h("div", {className: "empty-note"}, "No approval subtasks")
          : null,
        subtasks.map((st) => {
          const approve = isApproval(st);
          const stPhase = phaseFromSummary(st.summary);
          const stIndex = phaseIndex(stPhase);
          const issueIndex = phaseIndex(issue.phase);
          const isCompletedPhase = stIndex > -1 && issueIndex > -1 && stIndex < issueIndex;
          const rowStatus = rowStatusClass(st.status, statusConfig);
          const chipClass = statusClass(st.status, statusConfig);
          const markColor = PHASE_COLORS[stPhase] || PHASE_COLORS[issuePhase];
          const mark = chipClass === "status-done"
            ? h("span", {className: "bg-completed", title: "Done"}, "\u2713")
            : chipClass === "status-in-progress"
              ? h("span", {className: "in-progress", title: "In progress"}, "\u231B")
              : h("span", {className: "bg-upcoming", title: "Not started"}, "\u2022");
          return h(
            "div",
            {className: `subtask-row ${rowStatus} ${isCompletedPhase ? "done-phase-row" : ""}`, key: st.key || st.summary},
            h("span", {className: "st-mark", style: markColor ? {"--ph": markColor} : undefined}, mark),
            h(
              "div",
              {className: "min-w-0 flex-1"},
              h(
                "div",
                {className: "flex items-center gap-2 flex-wrap"},
                h(
                  "a",
                  {
                    className: "mono subtask-key",
                    href: `https://riscv.atlassian.net/browse/${encodeURIComponent(st.key || "")}`,
                    target: "_blank",
                    rel: "noopener noreferrer"
                  },
                  highlightText(st.key || "", searchQuery, h)
                ),
                h("span", {className: `status-chip ${chipClass}`}, st.status || ""),
                st.type ? h("span", {className: "badge"}, st.type) : null
              ),
              h("div", {className: "subtask-summary"}, highlightText(st.summary || "", searchQuery, h))
            ),
            approve ? h("span", {className: "badge badge-approval flex-none"}, "Approval") : null
          );
        })
      )
    )
  );
}
