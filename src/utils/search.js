import {issueIsaValue, issueTrackValue} from "./format.js";

// Query matching and filter predicates for issues/subtasks.

export function matchesQuery(q, issue, sub){
  if(!q) return true;
  const hay = [issue.key || "", issue.summary || "", issue.phase || ""];
  if(Array.isArray(issue.linked_issues)){
    issue.linked_issues.forEach((li) => {
      hay.push(li.key || "", li.summary || "", li.relationship || "", li.direction || "");
    });
  }
  if(sub) hay.push(sub.key || "", sub.summary || "", sub.status || "", sub.type || "");
  return hay.join(" ").toLowerCase().includes(q);
}

export function issueMatchesFilters(issue, isaFilter, trackFilter){
  if(isaFilter){
    const isaVal = issueIsaValue(issue);
    if(isaVal !== isaFilter) return false;
  }
  if(trackFilter){
    const trackVal = issueTrackValue(issue);
    if(trackVal !== trackFilter) return false;
  }
  return true;
}
