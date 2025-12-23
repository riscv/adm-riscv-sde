import React from "react";
import {APPROVAL_TYPES} from "../config/constants.js";
import {phaseFromSummary, phaseIndex} from "../utils/phase.js";
import {buildMailto, buildSummaryText, highlightText, issueIsaValue, issueTrackValue} from "../utils/format.js";
import {countByStatus, firstPendingApproval, rowStatusClass, statusClass} from "../utils/status.js";

// Issue card with status, approvals, actions, and subtasks.
const h = React.createElement;

function isApproval(sub){
  return sub.is_approval === true || APPROVAL_TYPES.has(sub.type || "");
}

export default function IssueCard({issue, openSubtasks, isMatch, searchQuery, statusConfig, isaFilter, trackFilter}){
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
        `${issue.days_in_phase != null ? `${issue.days_in_phase}d in ${issuePhase}` : `in ${issuePhase}`}`,
        h("span", {className: "meta-divider"}, "|"),
        `Tasks Completed: ${taskCounts.done}/${taskCounts.total}`,
        h("span", {className: "meta-divider"}, "|"),
        `Tasks in Progress: ${taskCounts.inProgress}`
      )
    : null;
  const approvalsEl = approvalCounts.total > 0
    ? h(
        "div",
        {className: "meta-line"},
        `Approvals: ${approvalCounts.done}/${approvalCounts.total}`,
        h("span", {className: "meta-divider"}, "|"),
        "Next Approval: ",
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
    leadNodes.push(h("span", {className: `${isaFilter && isaDisplay === isaFilter ? "filter-highlight" : "meta-strong"}`}, isaDisplay));
  }
  if(ftDisplayClean){
    if(leadNodes.length) leadNodes.push(", ");
    leadNodes.push(h("span", {className: `${trackFilter && ftDisplayClean === trackFilter ? "filter-highlight" : "meta-strong"}`}, ftDisplayClean));
  }
  const relationNodes = linkedRelations.map((li, idx) => {
    const jiraUrl = `https://riscv.atlassian.net/browse/${encodeURIComponent(li.key || "")}`;
    const relText = String(li.relationship || "").trim();
    return h(
      "span",
      {className: "meta-muted", key: `${li.key || ""}-${li.relationship || ""}`},
      idx > 0 ? " • " : "",
      relText ? `${relText} ` : "",
      h(
        "a",
        {className: "approval-link", href: jiraUrl, target: "_blank", rel: "noopener noreferrer"},
        li.summary || li.key || ""
      )
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

  return h(
    "div",
    {
      className: "card border border-gray-100 rounded-2xl bg-white",
      "data-match": isMatch ? "true" : "false",
      key: issue.key || issue.summary
    },
    h(
      "div",
      {className: "px-4 py-3 flex items-center justify-between bg-white rounded-t-2xl"},
      h(
        "div",
        {className: "flex flex-col gap-2 w-full"},
        h(
          "div",
          {className: "flex items-start justify-between gap-3 flex-wrap"},
          h(
            "div",
            {className: "flex items-center gap-2 min-w-0 flex-wrap"},
            h(
              "a",
              {
                className: "mono text-sm font-semibold text-blue-900 hover:underline",
                href: `https://riscv.atlassian.net/browse/${encodeURIComponent(issue.key || "")}`,
                target: "_blank",
                rel: "noopener noreferrer"
              },
              highlightText(issue.key || "", searchQuery, h)
            ),
            h("span", {className: "text-sm text-slate-800 truncate"}, highlightText(issue.summary || "", searchQuery, h))
          ),
          h(
            "div",
            {className: "flex items-center gap-1"},
            ghUrl ? h(
              "a",
              {className: "info-icon", href: ghUrl, target: "_blank", rel: "noopener noreferrer", "aria-label": "Open GitHub repository"},
              h("svg", {className: "gh-ico", viewBox: "0 0 24 24", role: "img", "aria-hidden": "true"},
                h("path", {d: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.016-2.04-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.084-.73.084-.73 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.304.762-1.604-2.665-.303-5.466-1.334-5.466-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.523.117-3.176 0 0 1.008-.322 3.301 1.23A11.52 11.52 0 0 1 12 6.844c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23 .655 1.653.243 2.873.119 3.176 .77.840 1.235 1.911 1.235 3.221 0 4.609-2.804 5.624-5.476 5.921.43.371.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.286 0 .321.216.694.825.576C20.565 22.092 24 17.592 24 12.297 24 5.373 18.627 0 12 0z"})
              )
            ) : null,
            h(
              "a",
              {className: "info-icon", href: mailto, "aria-label": "Compose status email"},
              h("svg", {className: "gh-ico", viewBox: "0 0 24 24", role: "img", "aria-hidden": "true"},
                h("path", {d: "M2 12l19-9-4 19-6-6-4 4v-6l11-7-12 5z"})
              )
            ),
            h(
              "button",
              {className: "info-icon", type: "button", onClick: handleCopy, "aria-label": "Copy summary"},
              h("svg", {className: "gh-ico", viewBox: "0 0 24 24", role: "img", "aria-hidden": "true"},
                h("path", {d: "M9 9h10v12H9zM5 3h10v4H7v10H5z"})
              )
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
                leadNodes.length && relationNodes.length ? " " : "",
                relationNodes
              )
            : null,
          phaseSummaryEl,
          approvalsEl
        )
      )
    ),
    h(
      "details",
      {className: "px-4 pb-4", open: !!openSubtasks},
      h(
        "summary",
        {className: "mt-2 cursor-pointer text-sm text-gray-700 hover:text-blue-900"},
        h(
          "span",
          {className: "subtasks-summary"},
          h("span", {className: "chev"}, ">"),
          h("span", null, "Subtasks")
        )
      ),
      h(
        "div",
        {className: "mt-2 divide-y"},
        (issue.subtasks || []).map((st) => {
          const approve = isApproval(st);
          const stPhase = phaseFromSummary(st.summary);
          const stIndex = phaseIndex(stPhase);
          const issueIndex = phaseIndex(issue.phase);
          const isCompletedPhase = stIndex > -1 && issueIndex > -1 && stIndex < issueIndex;
          const rowStatus = rowStatusClass(st.status, statusConfig);
          return h(
            "div",
            {className: `flex items-start justify-between gap-3 px-2 py-2 ${rowStatus} ${isCompletedPhase ? "done-phase-row" : ""}`, key: st.key || st.summary},
            h(
              "div",
              {className: "min-w-0"},
              h(
                "div",
                {className: "flex items-center gap-2 flex-wrap"},
                h(
                  "a",
                  {
                    className: "mono text-xs font-semibold text-blue-900 hover:underline",
                    href: `https://riscv.atlassian.net/browse/${encodeURIComponent(st.key || "")}`,
                    target: "_blank",
                    rel: "noopener noreferrer"
                  },
                  highlightText(st.key || "", searchQuery, h)
                ),
                h("span", {className: `status-chip ${statusClass(st.status, statusConfig)}`}, st.status || ""),
                h("span", {className: "badge bg-gray-200 text-gray-700"}, st.type || "")
              ),
              h("div", {className: "text-sm text-slate-800"}, highlightText(st.summary || "", searchQuery, h))
            ),
            h(
              "div",
              {className: "flex items-center gap-2"},
              approve ? h("span", {className: "badge badge-approval"}, "Approval") : null
            )
          );
        })
      )
    )
  );
}
