import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {load as yamlLoad} from "js-yaml";
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_SRC_LOCAL,
  DEFAULT_SRC_REMOTE,
  DEFAULT_STATUS_CONFIG,
  ENV_YAML_URL,
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
    return `${metaBase}Data Updated on ${lastGeneratedAt.toLocaleString()}`;
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
    const y = el.getBoundingClientRect().top + window.scrollY - 140;
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

  return h(
    "div",
    null,
    h("div", {className: "page-bg"}),
    h(
      "section",
      {className: "max-w-6xl mx-auto px-4 pt-4"},
      h(
        "div",
        {className: "text-xs text-gray-500 text-right"},
        metaInfo
      )
    ),
    toastMsg ? h("div", {className: "toast"}, toastMsg) : null,
    h(
      "header",
      {className: "sticky top-0 z-10 glass border-b border-gray-100"},
      h(
        "div",
        {className: "max-w-6xl mx-auto px-4 py-5 flex flex-wrap items-center gap-4"},
        h(
          "div",
          {className: "flex items-center gap-3"},
          h("img", {src: "riscv_logo.png", alt: "RISC-V", className: "h-8 w-auto"}),
          h(
            "div",
            {className: "text-sm font-bold tracking-[0.2em] text-blue-900"},
            h("span", {className: "block"}, "Specification"),
            h("span", {className: "block"}, "Development"),
            h("span", {className: "block"}, "Explorer")
          )
        )
      )
    ),
    h(
      "div",
      {className: "sticky-under-header"},
      h(
        "section",
        {className: "max-w-6xl mx-auto px-4 pt-4 pb-2 flex flex-col items-center gap-2"},
        h(
          "div",
          {className: "search-wrap w-full"},
          h(
            "form",
            {onSubmit: (e) => e.preventDefault()},
            h(
              "div",
              {className: "search-shell flex items-center gap-2 bg-white pl-4 pr-2 py-3 search-shadow"},
              h(
                "svg",
                {xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "currentColor", className: "w-5 h-5 text-gray-400"},
                h("path", {fillRule: "evenodd", d: "M10.5 3.75a6.75 6.75 0 1 0 4.221 11.973l3.778 3.778a.75.75 0 1 0 1.06-1.06l-3.778-3.778A6.75 6.75 0 0 0 10.5 3.75Zm-5.25 6.75a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0Z", clipRule: "evenodd"})
              ),
              h("input", {
                type: "search",
                placeholder: "Search issues and subtasks (key, summary, status, type)...",
                className: "search-input w-full outline-none text-[15px] bg-transparent",
                autoComplete: "off",
                value: searchInput,
                onChange: (e) => setSearchInput(e.target.value)
              }),
              h(
                "div",
                {className: "flex items-center gap-2"},
                h(
                  "button",
                  {type: "button", onClick: handleClear, className: "clear-btn", "aria-label": "Clear search"},
                  "x"
                )
              )
            )
          )
        )
      ),
      h(
        "section",
        {className: "max-w-6xl mx-auto px-4 pb-4 pt-1"},
        h(
          "div",
          {className: "flex flex-wrap items-center justify-center gap-3"},
          h(
            "div",
            {className: "filter-bar"},
            h(
              "button",
              {
                onClick: () => toggleIsaFilter("ISA"),
                className: `filter-btn ${isaFilter === "ISA" ? "is-active" : ""}`
              },
              h("span", {className: "filter-box"}, isaFilter === "ISA" ? "x" : ""),
              "ISA"
            ),
            h(
              "button",
              {
                onClick: () => toggleIsaFilter("NON-ISA"),
                className: `filter-btn ${isaFilter === "NON-ISA" ? "is-active" : ""}`
              },
              h("span", {className: "filter-box"}, isaFilter === "NON-ISA" ? "x" : ""),
              "NON-ISA"
            )
          ),
          h(
            "div",
            {className: "filter-bar"},
            h(
              "button",
              {
                onClick: () => toggleTrackFilter("Regular"),
                className: `filter-btn ${trackFilter === "Regular" ? "is-active" : ""}`
              },
              h("span", {className: "filter-box"}, trackFilter === "Regular" ? "x" : ""),
              "Regular"
            ),
            h(
              "button",
              {
                onClick: () => toggleTrackFilter("Fast-Track"),
                className: `filter-btn ${trackFilter === "Fast-Track" ? "is-active" : ""}`
              },
              h("span", {className: "filter-box"}, trackFilter === "Fast-Track" ? "x" : ""),
              "Fast-Track"
            )
          )
        )
      ),
      h(
        "section",
        {className: "max-w-6xl mx-auto px-4 pb-4 pt-1"},
        h(
          "div",
          {className: "flex flex-wrap items-center justify-center gap-2"},
          PHASE_ORDER.map((phase) => {
            const isActive = expandedPhase === phase;
            return h(
              "button",
              {
                key: phase,
                onClick: () => {
                  setExpandPhases(false);
                  setExpandedPhase(isActive && expandedPhase === phase ? null : phase);
                  scrollToPhase(phase);
                },
                className: `chip phase-chip ${isActive ? "is-active" : ""}`
              },
              `${phase}: ${typeof counts[phase] === "number" ? counts[phase] : 0}`
            );
          }),
          h(
            "button",
            {
              onClick: () => {
                const next = !expandPhases;
                setExpandPhases(next);
                setExpandedPhase(null);
              },
              className: "phase-action expand-emphasis rounded-full px-4 py-2 text-xs ml-2"
            },
            expandPhases ? "Collapse all" : "Expand all"
          )
        )
      )
    ),
    error ? h("div", {className: "max-w-6xl mx-auto px-4 mb-3 text-sm text-red-600"}, error) : null,
    filteredData ? h(
      "main",
      {className: "max-w-6xl mx-auto px-4 pb-16"},
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
        key: phase
      }))
    ) : h("main", {className: "max-w-6xl mx-auto px-4 pb-16"}, "")
  );
}
