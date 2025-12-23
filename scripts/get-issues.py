#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Group all non-subtask Jira issues in a project by phase and output YAML/JSON + printed roll-up.

- Uses Jira Cloud Enhanced Search (/rest/api/3/search/jql) with nextPageToken pagination.
- Falls back to jira.search_issues() on Server/DC or older Cloud tenants that don’t expose enhanced search.
- Optional: --add-summary → inline "KEY — Summary" within the phase lists (legacy mode).
- Optional: --sub-tasks  → inline per-issue progress: "[done/total (pct% done) - Nd in PHASE]" (legacy string mode).
- Optional: --list-subtasks / --subtasks / --subtaks → include each subtask (key + status + summary [+ type/approval in this version]).
- Optional: --structured-output → switch to structured objects so each subtask is one item per line, indented under its parent.
- Optional: --format {yaml,json} → choose output format (default: yaml). JSON mirrors the same structure.
- Optional: --linked-issues → include linked issues (key/summary + link relationship) per issue.
- NEW (default behavior): Progress counts ONLY subtasks that belong to the parent’s CURRENT PHASE,
  detected via the leading [PhaseTag] in the subtask summary (e.g., "[Plan] - ...").
  Use --progress-all-subtasks to revert to legacy behavior.

Notes:
- Subtask summaries are included automatically when you request subtasks (legacy or structured).
- Approval subtasks are detected by issuetype using REQUIRED_APPROVAL_TYPES and are flagged in outputs.

Custom fields added for parent issues only:
- ISA or NON-ISA: customfield_10042 → serialized as `isa_or_non_isa`
- GitHub: customfield_10043 → serialized as `github`
- Is Fast Track?: customfield_10041 → serialized as `is_fast_track`
"""

import argparse
import os
import sys
import json
import re
from datetime import datetime, timezone
from collections import defaultdict, OrderedDict
from types import SimpleNamespace
from typing import List, Optional, Dict, Any

from jira import JIRA
import yaml


PHASE_ORDER = [
    "Inception",
    "Planning",
    "Development",
    "Stabilization",
    "Freeze",
    "Ratification-Ready",
    "Publication",
    "Ratified",
    "Cancelled"
]

STATUS_TO_PHASE: Dict[str, str] = {
    "specification inception": "Inception",
    "specification in planning": "Planning",
    "specification under development": "Development",
    "specification under stabilization": "Stabilization",
    "specification in freeze": "Freeze",
    "specification in ratification-ready": "Ratification-Ready",
    "specification in publication": "Publication",
    "specification ratified": "Ratified",
    "specification cancelled": "Cancelled",
    "cancelled": "Cancelled",
}

# Subtask issuetypes that count as approvals
REQUIRED_APPROVAL_TYPES = ["BoD Approval", "Approval", "ARC Review"]

# Map parent issue phase to the tags seen in subtask summaries (inside [ ... ])
PHASE_SUMMARY_ALIASES: Dict[str, list] = {
    "Inception": ["Inception"],
    "Planning": ["Plan", "Planning"],
    "Development": ["Development", "Dev"],
    "Stabilization": ["Stabilization", "Stabilisation"],
    "Freeze": ["Freeze"],
    "Ratification-Ready": ["Ratification-Ready", "Ratification Ready"],
    "Publication": ["Publication", "Publish"],
    "Ratified": ["Ratified"],
    "Cancelled": ["Cancelled"]
}

_PHASE_TAG_RE = re.compile(r"^\s*\[([^\]]+)\]\s*-\s*", flags=re.IGNORECASE)

# -------- Custom Field IDs (parent issues only) --------
CF_ISA_NONISA = "customfield_10042"  # ISA or NON-ISA
CF_GITHUB = "customfield_10043"      # GitHub
CF_FASTTRACK = "customfield_10041"   # Is Fast Track?


def get_jira_client() -> JIRA:
    server = os.getenv("JIRA_SERVER_URL", "https://riscv.atlassian.net")
    user_email = os.getenv("JIRA_USER_EMAIL")
    api_token = os.getenv("JIRA_API_TOKEN")

    if not user_email or not api_token:
        print("❌ Missing JIRA_USER_EMAIL / JIRA_API_TOKEN", file=sys.stderr)
        sys.exit(1)

    try:
        return JIRA(
            options={"server": server, "api_version": "3"},
            basic_auth=(user_email, api_token),
        )
    except Exception as e:
        print(f"❌ Error connecting to Jira: {e}", file=sys.stderr)
        sys.exit(1)


def _issue_stub(
    key: str,
    status_name: Optional[str],
    summary: Optional[str],
    cf_isa_nonisa: Optional[Any] = None,
    cf_github: Optional[Any] = None,
    cf_fasttrack: Optional[Any] = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        key=key,
        fields=SimpleNamespace(
            status=SimpleNamespace(name=status_name),
            summary=summary,
            # Parent-only custom fields normalized under stable names
            isa_or_non_isa=cf_isa_nonisa,
            github=cf_github,
            is_fast_track=cf_fasttrack,
        ),
        # enrichment placeholders
        _progress=None,           # tuple(done, total, pct_int)
        _days_in_phase=None,      # int days
        # list of tuples: (key, status_name, summary, issuetype)
        _subtasks_detail=None,
        # list of dicts: {key, summary, relationship, direction, url}
        _linked_issues=None,
    )


def _fetch_enhanced_search(jira: JIRA, jql: str, page_size: int, want_summary: bool) -> List[SimpleNamespace]:
    """Enhanced search: POST /rest/api/3/search/jql with nextPageToken / isLast."""
    issues: List[SimpleNamespace] = []
    next_token: Optional[str] = None
    server = jira._options.get("server", "").rstrip("/")
    url = f"{server}/rest/api/3/search/jql"

    # Parent fields only (no subtasks here)
    fields = ["status", CF_ISA_NONISA, CF_GITHUB, CF_FASTTRACK]
    if want_summary:
        fields.append("summary")

    while True:
        payload: Dict[str, Any] = {
            "jql": jql,
            "maxResults": page_size,
            "fields": fields,
        }
        if next_token:
            payload["nextPageToken"] = next_token

        resp = jira._session.post(url, json=payload)
        if resp.status_code in (404, 405):
            raise NotImplementedError("Enhanced search not supported")
        if resp.status_code == 429:
            import time
            retry_after = int(resp.headers.get("Retry-After", "2"))
            time.sleep(max(1, retry_after))
            continue
        if resp.status_code != 200:
            raise RuntimeError(f"Enhanced search failed: {resp.status_code} {resp.text}")

        data = resp.json() or {}
        for it in data.get("issues", []):
            f = it.get("fields") or {}
            status_name = (f.get("status") or {}).get("name")
            summary = f.get("summary") if want_summary else None
            issues.append(
                _issue_stub(
                    it.get("key"),
                    status_name,
                    summary,
                    cf_isa_nonisa=f.get(CF_ISA_NONISA),
                    cf_github=f.get(CF_GITHUB),
                    cf_fasttrack=f.get(CF_FASTTRACK),
                )
            )

        if data.get("isLast", False):
            break
        next_token = data.get("nextPageToken")
        if not next_token:
            break

    return issues


def _fetch_legacy_with_v3(jira: JIRA, jql: str, page_size: int, want_summary: bool) -> List[SimpleNamespace]:
    """Legacy fallback via python-jira search_issues; returns compatible stubs."""
    # Match fields pulled by enhanced search
    fields = f"key,status,{CF_ISA_NONISA},{CF_GITHUB},{CF_FASTTRACK}"
    if want_summary:
        fields += ",summary"

    results: List[SimpleNamespace] = []
    start_at = 0
    while True:
        batch = jira.search_issues(
            jql,
            startAt=start_at,
            maxResults=page_size,
            fields=fields,
        )
        if not batch:
            break

        for issue in batch:
            key = getattr(issue, "key", None)
            status_obj = getattr(issue.fields, "status", None)
            status_name = getattr(status_obj, "name", None) if status_obj else None
            summary = getattr(issue.fields, "summary", None) if want_summary else None
            if key:
                results.append(
                    _issue_stub(
                        key,
                        status_name,
                        summary,
                        cf_isa_nonisa=getattr(issue.fields, CF_ISA_NONISA, None),
                        cf_github=getattr(issue.fields, CF_GITHUB, None),
                        cf_fasttrack=getattr(issue.fields, CF_FASTTRACK, None),
                    )
                )

        if len(batch) < page_size:
            break
        start_at += page_size

    return results


def fetch_project_issues(
    jira: JIRA,
    project_key: str,
    jql_extra: Optional[str] = None,
    page_size: int = 100,
    want_summary: bool = False,
):
    """Fetch issues via enhanced search with fallback; returns SimpleNamespace stubs."""
    base_jql = f'project = "{project_key}" AND issuetype in standardIssueTypes()'
    if jql_extra:
        base_jql = f"{base_jql} AND ({jql_extra})"

    try:
        return _fetch_enhanced_search(jira, base_jql, page_size, want_summary)
    except NotImplementedError:
        return _fetch_legacy_with_v3(jira, base_jql, page_size, want_summary)
    except Exception:
        try:
            return _fetch_legacy_with_v3(jira, base_jql, page_size, want_summary)
        except Exception:
            raise


def phase_for_status(status_name: Optional[str]) -> str:
    if not status_name:
        return "Other"
    return STATUS_TO_PHASE.get(status_name.strip().lower(), "Other")


def group_issues_by_phase(issues: List[SimpleNamespace]) -> "OrderedDict[str, List[str]]":
    """Return OrderedDict keyed by PHASE_ORDER + optional 'Other' with sorted issue keys."""
    buckets: Dict[str, List[str]] = defaultdict(list)
    for issue in issues:
        status_obj = getattr(issue.fields, "status", None)
        phase = phase_for_status(getattr(status_obj, "name", None))
        buckets[phase].append(issue.key)

    for k in buckets:
        buckets[k].sort()

    ordered = OrderedDict()
    for p in PHASE_ORDER:
        if buckets.get(p):
            ordered[p] = buckets[p]
    if buckets.get("Other"):
        ordered["Other"] = buckets["Other"]
    return ordered


# -------- Sub-task progress + days-in-phase enrichment --------

def _parse_iso8601(s: str) -> Optional[datetime]:
    try:
        # Jira returns timestamps like "2025-10-28T23:37:03.123+0000" or "Z"
        # Normalize by stripping the last 2 colon-less TZ digits if present.
        if s.endswith("Z"):
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        if s[-5] in ["+", "-"] and s[-3] != ":":
            s = f"{s[:-2]}:{s[-2:]}"
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _days_since(dt: Optional[datetime]) -> Optional[int]:
    if not dt:
        return None
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = now - dt
    return max(0, delta.days)


def _compute_days_in_phase(current_phase: str, changelog: Dict[str, Any]) -> Optional[int]:
    """
    Walk changelog backwards; find the most recent transition into any status that maps to current_phase.
    """
    histories = changelog.get("histories", []) if changelog else []
    for h in sorted(histories, key=lambda x: x.get("created", ""), reverse=True):
        items = h.get("items", [])
        for it in items:
            if it.get("field") == "status":
                to_string = it.get("toString") or it.get("to")
                if phase_for_status(to_string) == current_phase:
                    return _days_since(_parse_iso8601(h.get("created")))
    return None


def _summary_has_phase_tag(summary: Optional[str], phase_name: str) -> bool:
    """
    Returns True if the subtask summary begins with a bracket tag whose value
    matches one of the aliases for the given phase (case-insensitive).
    Example summary: "[Plan] - Present Plan to Chairs"
    """
    if not summary:
        return False
    m = _PHASE_TAG_RE.match(summary)
    if not m:
        return False

    tag = m.group(1).strip().lower()
    aliases = [a.lower() for a in PHASE_SUMMARY_ALIASES.get(phase_name, [phase_name])]
    return tag in aliases


def enrich_subtask_progress_and_phase_days(
    jira: JIRA,
    issues: List[SimpleNamespace],
    progress_all_subtasks: bool = False,
) -> None:
    """
    For each issue: fetch subtasks + changelog, compute:
      - progress: (done, total, pct)
      - days_in_phase: days since transition to current phase
      - subtasks_detail: list of (key, current status_name, summary, issuetype)
    Mutates issue objects: issue._progress, issue._days_in_phase, issue._subtasks_detail

    NEW: If progress_all_subtasks is False (default), only counts subtasks whose summary
         tag matches the parent's current phase (via [PhaseTag] - ... convention).
    """
    server = jira._options.get("server", "").rstrip("/")

    for issue in issues:
        key = issue.key
        url = f"{server}/rest/api/3/issue/{key}"
        params = {
            # include parent summary + custom fields; ensure subtask 'fields.summary' exists
            "fields": f"subtasks,status,summary,{CF_ISA_NONISA},{CF_GITHUB},{CF_FASTTRACK}",
            "expand": "changelog",
        }
        resp = jira._session.get(url, params=params)
        if resp.status_code != 200:
            # best-effort: leave metrics empty
            continue
        data = resp.json() or {}
        fields = data.get("fields") or {}

        # Determine current phase from parent status
        current_status_name = (fields.get("status") or {}).get("name")
        current_phase = phase_for_status(current_status_name)

        # Subtask progress + details
        subtasks = fields.get("subtasks") or []
        total = 0
        done = 0
        detail = []
        for st in subtasks:
            st_fields = st.get("fields") or {}
            st_status = st_fields.get("status") or {}
            st_cat = (st_status.get("statusCategory") or {}).get("key")
            st_type = (st_fields.get("issuetype") or {}).get("name")
            st_summary = st_fields.get("summary")

            # Always keep full detail list
            detail.append(
                (
                    st.get("key"),
                    (st_status or {}).get("name"),
                    st_summary,
                    st_type,
                )
            )

            # Decide if this subtask is counted towards progress
            count_this = progress_all_subtasks or _summary_has_phase_tag(st_summary, current_phase)
            if not count_this:
                continue

            total += 1
            if (st_cat or "").lower() == "done":
                done += 1

        pct = int(round((done / total) * 100)) if total > 0 else 0
        issue._progress = (done, total, pct)
        issue._subtasks_detail = detail

        # Days in current phase
        days = _compute_days_in_phase(current_phase, data.get("changelog"))
        issue._days_in_phase = days

        # Keep/refresh parent custom fields (if not already set via search)
        issue.fields.isa_or_non_isa = fields.get(CF_ISA_NONISA, getattr(issue.fields, "isa_or_non_isa", None))
        issue.fields.github = fields.get(CF_GITHUB, getattr(issue.fields, "github", None))
        issue.fields.is_fast_track = fields.get(CF_FASTTRACK, getattr(issue.fields, "is_fast_track", None))


# -------- Linked issues enrichment --------

def _chunked(items: List[str], size: int) -> List[List[str]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def _fetch_issue_summaries(jira: JIRA, issue_keys: List[str]) -> Dict[str, Optional[str]]:
    """
    Fetch summaries for a list of issue keys.
    Uses jira.search_issues for compatibility across Cloud/Server.
    """
    summaries: Dict[str, Optional[str]] = {}
    if not issue_keys:
        return summaries

    for chunk in _chunked(issue_keys, 100):
        jql = f'key in ({", ".join(chunk)})'
        try:
            results = jira.search_issues(jql, fields="summary", maxResults=100)
        except Exception:
            continue
        for issue in results:
            key = getattr(issue, "key", None)
            summary = getattr(getattr(issue, "fields", None), "summary", None)
            if key:
                summaries[key] = summary
    return summaries


def enrich_linked_issues(jira: JIRA, issues: List[SimpleNamespace]) -> None:
    """
    For each issue: fetch issuelinks and populate issue._linked_issues with:
      {key, summary, relationship, direction, url}
    """
    server = jira._options.get("server", "").rstrip("/")
    linked_keys: List[str] = []

    for issue in issues:
        key = issue.key
        url = f"{server}/rest/api/3/issue/{key}"
        params = {"fields": "issuelinks"}
        resp = jira._session.get(url, params=params)
        if resp.status_code != 200:
            issue._linked_issues = []
            continue
        data = resp.json() or {}
        fields = data.get("fields") or {}
        links = fields.get("issuelinks") or []

        collected = []
        for link in links:
            link_type = link.get("type") or {}
            if link.get("outwardIssue"):
                linked_key = (link.get("outwardIssue") or {}).get("key")
                relationship = link_type.get("outward")
                direction = "outward"
            elif link.get("inwardIssue"):
                linked_key = (link.get("inwardIssue") or {}).get("key")
                relationship = link_type.get("inward")
                direction = "inward"
            else:
                continue

            if not linked_key:
                continue
            collected.append(
                {
                    "key": linked_key,
                    "summary": None,
                    "relationship": relationship,
                    "direction": direction,
                    "url": f"{server}/browse/{linked_key}",
                }
            )
            linked_keys.append(linked_key)

        issue._linked_issues = collected

    summary_map = _fetch_issue_summaries(jira, sorted(set(linked_keys)))
    for issue in issues:
        for link in issue._linked_issues or []:
            link["summary"] = summary_map.get(link["key"])


# -------- Formatting / Output --------

def _format_issue_line_legacy(
    issue: SimpleNamespace,
    phase_name: str,
    want_summary: bool,
    want_subtasks: bool,
    want_list_subtasks: bool = False,
    want_linked_issues: bool = False,
) -> str:
    """Legacy single-line-with-appendages formatting (backward compatible)."""
    line = issue.key
    if want_summary:
        summary = getattr(issue.fields, "summary", None)
        if summary:
            line += f" — {summary}"
    if want_subtasks:
        done, total, pct = issue._progress or (0, 0, 0)
        days = issue._days_in_phase
        days_str = f"{days}d" if isinstance(days, int) else "?d"
        line += f" [{done}/{total} ({pct}% done) - {days_str} in {phase_name}]"
    if want_list_subtasks:
        items = issue._subtasks_detail or []
        if items:
            pretty_parts = []
            for (k, s, summ, t) in items:
                if not k:
                    continue
                status_label = s if s else "?"
                summary_label = f" — {summ}" if summ else ""
                type_label = f" [{t}]" if t else ""
                is_approval = (t or "").strip() in REQUIRED_APPROVAL_TYPES
                badge = " {APPROVAL}" if is_approval else ""
                pretty_parts.append(f"{k}({status_label}{summary_label}){type_label}{badge}")
            pretty = "; ".join(pretty_parts)
            if pretty:
                line += f" → subtasks: {pretty}"
    if want_linked_issues:
        links = issue._linked_issues or []
        if links:
            pretty_parts = []
            for link in links:
                key = link.get("key")
                rel = link.get("relationship") or "linked"
                summary = link.get("summary")
                summary_label = f" — {summary}" if summary else ""
                url_label = f" [{link.get('url')}]" if link.get("url") else ""
                if key:
                    pretty_parts.append(f"{key}({rel}{summary_label}){url_label}")
            pretty = "; ".join(pretty_parts)
            if pretty:
                line += f" → links: {pretty}"
    return line


def _issue_obj_structured(
    issue: SimpleNamespace,
    phase_name: str,
    include_summary: bool,
    include_progress: bool,
    include_subtasks: bool,
    include_linked_issues: bool,
) -> Dict[str, Any]:
    """Structured dict for an issue suitable for YAML/JSON, with subtasks as one-per-line list."""
    obj: Dict[str, Any] = {
        "key": issue.key,
        "phase": phase_name,
    }
    if include_summary:
        summary = getattr(issue.fields, "summary", None)
        if summary:
            obj["summary"] = summary
    # Always include parent custom fields (requested)
    obj["isa_or_non_isa"] = getattr(issue.fields, "isa_or_non_isa", None)
    obj["github"] = getattr(issue.fields, "github", None)
    obj["is_fast_track"] = getattr(issue.fields, "is_fast_track", None)
    if include_progress:
        done, total, pct = issue._progress or (0, 0, 0)
        obj["progress"] = {"done": done, "total": total, "pct": pct}
        days = issue._days_in_phase
        obj["days_in_phase"] = days if isinstance(days, int) else None
    if include_subtasks:
        details = issue._subtasks_detail or []
        subs: List[Dict[str, Any]] = []
        for (k, s, summ, t) in details:
            if not k:
                continue
            subs.append({
                "key": k,
                "status": s or None,
                "summary": summ or None,
                "type": t or None,
                "is_approval": (t or "").strip() in REQUIRED_APPROVAL_TYPES,
            })
        obj["subtasks"] = subs
    if include_linked_issues:
        obj["linked_issues"] = issue._linked_issues or []
    return obj


def write_output(
    ordered_buckets: "OrderedDict[str, List[str]]",
    issues: List[SimpleNamespace],
    project_key: str,
    out_path: Optional[str],
    want_summary: bool,
    want_subtasks: bool,
    want_list_subtasks: bool,
    want_linked_issues: bool,
    structured_output: bool,
    out_format: str,
) -> None:
    """
    When structured_output=True:
      phases[phase] is a list of objects:
        - key, summary?, phase,
          isa_or_non_isa?, github?, is_fast_track?,
          progress?, days_in_phase?, subtasks?[] (each subtask has key/status/summary/type/is_approval)
    Otherwise (legacy):
      phases[phase] is a list of strings as before, but subtask listing will include summary and annotate approvals.
    """
    if not out_path:
        ext = "json" if out_format == "json" else "yaml"
        out_path = f"{project_key}_phase_rollup.{ext}"

    # Fast lookup
    by_key: Dict[str, SimpleNamespace] = {i.key: i for i in issues}

    if structured_output:
        phases_out: Dict[str, List[Dict[str, Any]]] = {}
        for phase, keys in ordered_buckets.items():
            enriched: List[Dict[str, Any]] = []
            for k in keys:
                issue = by_key.get(k)
                if issue is None:
                    enriched.append({"key": k, "phase": phase})
                    continue
                enriched.append(
                    _issue_obj_structured(
                        issue,
                        phase,
                        include_summary=want_summary,
                        include_progress=want_subtasks,
                        include_subtasks=want_list_subtasks,
                        include_linked_issues=want_linked_issues,
                    )
                )
            phases_out[phase] = enriched
    else:
        phases_out: Dict[str, List[str]] = {}
        for phase, keys in ordered_buckets.items():
            enriched: List[str] = []
            for k in keys:
                issue = by_key.get(k)
                if issue is None:
                    enriched.append(k)
                    continue
                enriched.append(
                    _format_issue_line_legacy(
                        issue,
                        phase,
                        want_summary,
                        want_subtasks,
                        want_list_subtasks,
                        want_linked_issues,
                    )
                )
            phases_out[phase] = enriched

    payload: Dict[str, Any] = {
        "schema_version": 1,
        "project": project_key,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {phase: len(keys) for phase, keys in ordered_buckets.items()},
        "phases": phases_out,
    }

    # Serialize
    if out_format == "json":
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    else:
        with open(out_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(payload, f, sort_keys=False, default_flow_style=False, allow_unicode=True)

    print(f"📄 {out_format.upper()} written: {out_path}")


def print_rollup(ordered_buckets: "OrderedDict[str, List[str]]", project_key: str, total: int) -> None:
    print(f"\n📊 Phase Roll-Up for {project_key} (non-subtasks) — {total} issues\n" + "-" * 72)
    for p in PHASE_ORDER:
        if p in ordered_buckets:
            print(f"{p}: {', '.join(ordered_buckets[p])}")
    if "Other" in ordered_buckets:
        print(f"Other: {', '.join(ordered_buckets['Other'])}")
    print("-" * 72)


def main():
    parser = argparse.ArgumentParser(
        description="Group Jira issues by phase and export rollup YAML/JSON."
    )
    parser.add_argument("project_key")
    parser.add_argument("--jql-extra")
    parser.add_argument("--yaml-out", help="Legacy name; if --format=json we will still honor this path.")
    parser.add_argument("--page-size", type=int, default=100)
    parser.add_argument(
        "--add-summary",
        action="store_true",
        help="Inline summaries into the 'phases' lists (legacy) or include 'summary' field (structured).",
    )
    parser.add_argument(
        "--sub-tasks",
        action="store_true",
        help="Include per-issue progress (legacy: appended string; structured: progress fields).",
    )
    parser.add_argument(
        "--list-subtasks",
        "--subtasks",
        "--subtaks",
        dest="list_subtasks",
        action="store_true",
        help="Include each issue's subtasks (key, status, summary; annotated with type/approval).",
    )
    parser.add_argument(
        "--structured-output",
        action="store_true",
        help="Emit structured objects per issue with `subtasks` as an array (1 per line in YAML).",
    )
    parser.add_argument(
        "--linked-issues",
        action="store_true",
        help="Include linked issues (relationship + summary) for each parent issue.",
    )
    parser.add_argument(
        "--format",
        choices=["yaml", "json"],
        default="yaml",
        help="Output format (default: yaml).",
    )
    parser.add_argument(
        "--progress-all-subtasks",
        action="store_true",
        help="Compute progress using ALL subtasks (legacy behavior). Default: count only subtasks tagged for the parent's current phase.",
    )

    args = parser.parse_args()
    jira = get_jira_client()

    # Fetch base issues (parents only via standardIssueTypes())
    try:
        issues = fetch_project_issues(
            jira,
            args.project_key,
            args.jql_extra,
            page_size=args.page_size,
            want_summary=args.add_summary,  # only fetch summaries if needed for parents
        )
    except Exception as e:
        print(f"❌ Failed to fetch issues: {e}", file=sys.stderr)
        sys.exit(2)

    # Optional enrichment: subtasks + days in phase (needed for progress and/or listing or structured mode)
    if args.sub_tasks or args.list_subtasks or args.structured_output:
        enrich_subtask_progress_and_phase_days(
            jira,
            issues,
            progress_all_subtasks=args.progress_all_subtasks,
        )
    if args.linked_issues:
        enrich_linked_issues(jira, issues)

    ordered = group_issues_by_phase(issues)

    # Determine output path honoring legacy flag name
    out_path = args.yaml_out
    if out_path and args.format == "json" and not out_path.lower().endswith(".json"):
        out_path = out_path.rsplit(".", 1)[0] + ".json"

    print_rollup(ordered, args.project_key, total=len(issues))
    write_output(
        ordered_buckets=ordered,
        issues=issues,
        project_key=args.project_key,
        out_path=out_path,
        want_summary=args.add_summary,
        want_subtasks=args.sub_tasks,
        want_list_subtasks=args.list_subtasks,
        want_linked_issues=args.linked_issues,
        structured_output=args.structured_output,
        out_format=args.format,
    )


if __name__ == "__main__":
    main()
