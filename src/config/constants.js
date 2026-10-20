export const APPROVAL_TYPES = new Set(["BoD Approval", "Approval", "ARC Review"]);
export const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_SRC_LOCAL = "RVS_phase_rollup.yaml";
export const DEFAULT_SRC_REMOTE = "https://github.com/riscv-admin/riscv-sde/releases/latest/download/RVS_phase_rollup.yaml";
export const ENV_YAML_URL = import.meta.env.VITE_YAML_URL || "";

export const DEFAULT_STATUS_CONFIG = {
  doneStatuses: [
    "done",
    "approved",
    "not required to freeze",
    "ar review not require",
    "ar review not required",
    "approval not required",
    "arc review not required"
  ],
  notStartedStatuses: ["not started", "to do", "open", "backlog"]
};

// Lifecycle phase colours shared with the Spec Plan Editor and the Dashboard.
export const PHASE_COLORS = {
  Inception: "#8b5cf6",
  Planning: "#3b82f6",
  Development: "#10b981",
  Stabilization: "#ec4899",
  Freeze: "#f59e0b",
  "Ratification-Ready": "#ef4444",
  Publication: "#6366f1",
  Ratified: "#283272",
  Cancelled: "#94a3b8"
};

export const PHASE_ORDER = [
  "Inception",
  "Planning",
  "Development",
  "Stabilization",
  "Freeze",
  "Ratification-Ready",
  "Publication",
  "Ratified",
  "Cancelled"
];

export const PHASE_LOOKUP = PHASE_ORDER.reduce((acc, phase) => {
  acc[phase.toLowerCase()] = phase;
  return acc;
}, {});

export const PHASE_ALIASES = {
  "plan": "Planning",
  "ratification ready": "Ratification-Ready",
  "ratification-ready": "Ratification-Ready",
  "fast-track": null,
  "ecosystem": null
};
