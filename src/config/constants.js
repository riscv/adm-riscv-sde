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

export const PHASE_COLORS = {
  Inception: "#003262",
  Planning: "#1f5aa8",
  Development: "#0f766e",
  Stabilization: "#b91c1c",
  Freeze: "#f59e0b",
  "Ratification-Ready": "#dc2626",
  Publication: "#2563eb",
  Ratified: "#0f766e",
  Cancelled: "#6b7280"
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
