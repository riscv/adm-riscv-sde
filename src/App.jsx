import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {load as yamlLoad} from "js-yaml";
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_SRC_LOCAL,
  DEFAULT_SRC_REMOTE,
  DEFAULT_STATUS_CONFIG,
  ENV_YAML_URL,
  PHASE_COLORS,
  PHASE_ORDER
} from "./config/constants.js";
import {formatDelta, issueIsaValue, issueTrackValue, validateYamlShape} from "./utils/format.js";
import {matchesQuery, issueMatchesFilters} from "./utils/search.js";
import PhaseSection from "./components/PhaseSection.jsx";

const h = React.createElement;

// Page controller: data loading, filtering, and layout.
export default function App(){
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [metaBase, setMetaBase] = useState("Loading...");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandPhases, setExpandPhases] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState(null);
  const [isaFilter, setIsaFilter] = useState(null);
  const [trackFilter, setTrackFilter] = useState(null);
  // Show only approval subtasks; kept in the URL (?approvals=1) so the view can be shared.
  const [approvalsOnly, setApprovalsOnly] = useState(
    () => new URLSearchParams(window.location.search).get("approvals") === "1"
  );
  const toggleApprovalsOnly = () => {
    const next = !approvalsOnly;
    setApprovalsOnly(next);
    const url = new URL(window.location.href);
    if(next) url.searchParams.set("approvals", "1");
    else url.searchParams.delete("approvals");
    history.replaceState(null, "", url);
  };
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [statusConfig, setStatusConfig] = useState(DEFAULT_STATUS_CONFIG);
  const [lastSuccessAt, setLastSuccessAt] = useState(null);
  const [lastGeneratedAt, setLastGeneratedAt] = useState(null);
  const [toastMsg, setToastMsg] = useState("");

  const refreshTimerRef = useRef(null);
  const scrollLockRef = useRef(false);
  const lastDataRef = useRef(null);
  const lastGenRef = useRef(null);
  const lastGeneratedRef = useRef(null);
  const toastTimerRef = useRef(null);
  const initialPhaseRef = useRef(null);

  const fetchYaml = useCallback(async () => {
    const sources = [ENV_YAML_URL, DEFAULT_SRC_LOCAL, DEFAULT_SRC_REMOTE].filter(Boolean);
    let lastErr = null;
    for(const src of sources){
      try{
        const url = new URL(src, window.location.href);
        url.searchParams.set("_", Date.now());
        const resp = await fetch(url.toString(), {cache: "no-store"});
        if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        return yamlLoad(text);
      }catch(err){
        lastErr = err;
      }
    }
    throw lastErr || new Error("Failed to load YAML");
  }, []);

  const loadAndRender = useCallback(async () => {
    try{
      setError("");
      const nextData = await fetchYaml();
      if(!nextData){
        throw new Error("No data found.");
      }
      const validation = validateYamlShape(nextData);
      if(!validation.ok){
        throw new Error(`Invalid YAML: ${validation.errors.join(" ")}`);
      }
      setData(nextData);
      const now = new Date();
      setLastRefreshedAt(now);
      setLastSuccessAt(now);
      const generatedAt = nextData.generated_at ? new Date(nextData.generated_at) : null;
      setLastGeneratedAt(generatedAt);
      lastGeneratedRef.current = generatedAt;
      setMetaBase("");
      lastDataRef.current = nextData;
      const genKey = nextData.generated_at || JSON.stringify(nextData.counts || {});
      if(lastGenRef.current && lastGenRef.current !== genKey){
        setToastMsg("YAML updated");
        if(toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToastMsg(""), 3000);
      }
      lastGenRef.current = genKey;
    }catch(err){
      console.error(err);
      if(lastDataRef.current){
        setError(`Error loading YAML. Using last successful data. (${err.message})`);
        setData(lastDataRef.current);
        setLastGeneratedAt(lastGeneratedRef.current);
      }else{
        setError(`Error loading YAML: ${err.message}`);
        setMetaBase("Failed to load data.");
      }
      setLastRefreshedAt(null);
    }
  }, [fetchYaml]);

  // Parse URL hash (#Freeze) or query param (?expand=Freeze) to auto-expand a phase on load.
  useEffect(() => {
    const findPhase = (name) => {
      if(!name) return null;
      const lower = name.toLowerCase().replace(/^#/, "");
      return PHASE_ORDER.find(p => p.toLowerCase() === lower) || null;
    };
    const params = new URLSearchParams(window.location.search);
    const expandParam = params.get("expand");
    const hash = window.location.hash.replace(/^#/, "");
    const target = findPhase(expandParam) || findPhase(hash);
    if(target){
      setExpandedPhase(target);
      initialPhaseRef.current = target;
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput.trim()), 200);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if(refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(loadAndRender, DEFAULT_INTERVAL_MS);
    loadAndRender();
    return () => {
      if(refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [loadAndRender]);

  useEffect(() => {
    const handler = (e) => {
      if(e.key === "Escape"){
        setSearchInput("");
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Scroll to the initially targeted phase once data is available.
  useEffect(() => {
    if(!data || !initialPhaseRef.current) return;
    const phase = initialPhaseRef.current;
    initialPhaseRef.current = null;
    requestAnimationFrame(() => scrollToPhase(phase));
  }, [data]);

  useEffect(() => {
    fetch("status_config.json")
      .then((res) => res.ok ? res.json() : null)
      .then((cfg) => {
        if(cfg) setStatusConfig({...DEFAULT_STATUS_CONFIG, ...cfg});
      })
      .catch(() => {});
  }, []);

  const metaInfo = useMemo(() => {
    if(!lastGeneratedAt) return metaBase;
    const d = lastGeneratedAt;
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${metaBase}Data updated ${stamp}`;
  }, [metaBase, lastGeneratedAt]);

  const filteredData = useMemo(() => {
    if(!data) return null;
    const q = searchQuery.trim().toLowerCase();
    const phases = data.phases || {};
    const nextPhases = {};
    for(const phase of PHASE_ORDER){
      const allIssues = phases[phase] || [];
      nextPhases[phase] = allIssues.filter(issue => {
        const matchesText = !q || matchesQuery(q, issue) || (issue.subtasks || []).some(st => matchesQuery(q, issue, st));
        if(!matchesText) return false;
        return issueMatchesFilters(issue, isaFilter, trackFilter);
      });
    }
    return Object.assign({}, data, {phases: nextPhases});
  }, [data, searchQuery, isaFilter, trackFilter]);

  const matchCount = useMemo(() => {
    if(!data || !searchQuery.trim()) return 0;
    const q = searchQuery.trim().toLowerCase();
    let count = 0;
    for(const phase of PHASE_ORDER){
      const issues = data.phases?.[phase] || [];
      for(const issue of issues){
        if(matchesQuery(q, issue)) count += 1;
        const subs = issue.subtasks || [];
        for(const st of subs){
          if(matchesQuery(q, issue, st)) count += 1;
        }
      }
    }
    return count;
  }, [data, searchQuery]);

  const counts = data?.counts || {};

  const handleClear = () => {
    setSearchInput("");
    setSearchQuery("");
  };

  const toggleIsaFilter = (val) => {
    const next = isaFilter === val ? null : val;
    setIsaFilter(next);
  };

  const toggleTrackFilter = (val) => {
    const next = trackFilter === val ? null : val;
    setTrackFilter(next);
  };

  const scrollToPhase = (phase) => {
    const el = document.getElementById(`phase-${phase.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
    if(!el) return;
    // Leave room for the sticky toolbar (static on narrow screens).
    const bar = document.querySelector(".sticky-under-header");
    const sticky = bar && getComputedStyle(bar).position === "sticky";
    const offset = (sticky ? bar.offsetHeight : 0) + 12;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({top: y, behavior: "smooth"});
  };

  useEffect(() => {
    const q = searchQuery.trim();
    if(!q || !filteredData) return;
    if(scrollLockRef.current) return;
    if(matchCount !== 1) return;
    scrollLockRef.current = true;
    requestAnimationFrame(() => {
      const match = document.querySelector('[data-match="true"]');
      if(match && match.scrollIntoView){
        match.scrollIntoView({behavior: "smooth", block: "start"});
      }
      setTimeout(() => { scrollLockRef.current = false; }, 200);
    });
  }, [searchQuery, filteredData, matchCount]);

  const filterChip = (label, active, onClick) => h(
    "button",
    {type: "button", onClick, "aria-pressed": active, className: `filter-chip ${active ? "is-active" : ""}`},
    label
  );

  return h(
    "div",
    {className: "max-w-6xl mx-auto px-4 pt-8 pb-16"},
    toastMsg ? h("div", {className: "toast", role: "status"}, toastMsg) : null,
    h(
      "header",
      {className: "app-header"},
      h(
        "div",
        {className: "brand-block"},
        h("img", {src: "riscv_logo.png", alt: "RISC-V logo", className: "title-logo"}),
        h("span", {className: "brand-divider", "aria-hidden": "true"}),
        h(
          "div",
          {className: "min-w-0"},
          h("h1", {className: "page-title"}, "Specification Development Explorer"),
          h("p", {className: "app-subtitle"}, "Every RISC-V specification by lifecycle phase, with its tasks and approvals.")
        )
      ),
      h(
        "div",
        {className: "header-actions"},
        metaInfo ? h("span", {className: "data-stamp"}, metaInfo) : null,
        h(
          "a",
          {
            href: "https://riscv.github.io/adm-spec-dashboard/",
            target: "_blank",
            rel: "noreferrer",
            className: "btn sm link-out",
            title: "RISC-V Specification Dashboard"
          },
          h(
            "svg",
            {className: "btn-icon", viewBox: "0 0 24 24", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true"},
            h("path", {d: "M15 3h6v6"}),
            h("path", {d: "M10 14L21 3"}),
            h("path", {d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"})
          ),
          "Dashboard"
        )
      )
    ),
    h(
      "div",
      {className: "sticky-under-header"},
      h(
        "section",
        {className: "card"},
        h(
          "div",
          {className: "controls-toolbar"},
          h(
            "div",
            {className: "search-field min-w-0"},
            h("label", {className: "field-label", htmlFor: "searchInput"}, "Search"),
            h(
              "form",
              {onSubmit: (e) => e.preventDefault()},
              h(
                "div",
                {className: "search-shell"},
                h(
                  "svg",
                  {xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", className: "w-4 h-4 text-muted flex-none", "aria-hidden": "true"},
                  h("circle", {cx: 11, cy: 11, r: 7}),
                  h("path", {d: "m20 20-3.5-3.5"})
                ),
                h("input", {
                  id: "searchInput",
                  type: "search",
                  placeholder: "Search issues and subtasks (key, summary, status, type)...",
                  className: "search-input",
                  autoComplete: "off",
                  value: searchInput,
                  onChange: (e) => setSearchInput(e.target.value)
                }),
                searchInput ? h(
                  "button",
                  {type: "button", onClick: handleClear, className: "clear-btn", "aria-label": "Clear search"},
                  h(
                    "svg",
                    {viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", "aria-hidden": "true"},
                    h("path", {d: "M6 6l12 12M18 6 6 18"})
                  )
                ) : null
              )
            )
          ),
          h(
            "div",
            null,
            h("span", {className: "field-label"}, "Type"),
            h(
              "div",
              {className: "filter-bar"},
              filterChip("ISA", isaFilter === "ISA", () => toggleIsaFilter("ISA")),
              filterChip("NON-ISA", isaFilter === "NON-ISA", () => toggleIsaFilter("NON-ISA"))
            )
          ),
          h(
            "div",
            null,
            h("span", {className: "field-label"}, "Track"),
            h(
              "div",
              {className: "filter-bar"},
              filterChip("Regular", trackFilter === "Regular", () => toggleTrackFilter("Regular")),
              filterChip("Fast-Track", trackFilter === "Fast-Track", () => toggleTrackFilter("Fast-Track"))
            )
          ),
          h(
            "div",
            {className: "expand-field"},
            h(
              "button",
              {
                type: "button",
                onClick: () => {
                  const next = !expandPhases;
                  setExpandPhases(next);
                  setExpandedPhase(null);
                },
                className: "btn firm expand-btn"
              },
              expandPhases ? "Collapse all" : "Expand all"
            ),
            h(
              "button",
              {
                type: "button",
                "aria-pressed": approvalsOnly,
                onClick: toggleApprovalsOnly,
                title: "Show only the approval subtasks of each specification",
                className: `btn firm expand-btn approvals-toggle ${approvalsOnly ? "is-active" : ""}`
              },
              "Approvals only"
            )
          )
        ),
        h(
          "div",
          {className: "phase-toolbar"},
          PHASE_ORDER.map((phase) => {
            const isActive = expandedPhase === phase;
            return h(
              "button",
              {
                key: phase,
                type: "button",
                "aria-pressed": isActive,
                onClick: () => {
                  const next = isActive ? null : phase;
                  setExpandPhases(false);
                  setExpandedPhase(next);
                  scrollToPhase(phase);
                  history.replaceState(null, "", next ? `#${phase}` : window.location.pathname + window.location.search);
                },
                className: `phase-chip ${isActive ? "is-active" : ""}`,
                style: {"--ph": PHASE_COLORS[phase]}
              },
              h("span", {className: "dot", "aria-hidden": "true"}),
              phase,
              h("span", {className: "num"}, typeof counts[phase] === "number" ? counts[phase] : 0)
            );
          })
        )
      )
    ),
    error ? h("div", {className: "error-banner", role: "alert"}, error) : null,
    filteredData ? h(
      "main",
      {className: "flex flex-col gap-3"},
      PHASE_ORDER.map((phase) => h(PhaseSection, {
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
        approvalsOnly,
        key: phase
      }))
    ) : h("main", null, error ? "" : h("div", {className: "loading"}, "Loading specifications..."))
  );
}
