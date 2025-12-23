# RVS Explorer

Static React UI for browsing RISC-V phase rollups from a YAML file. It supports:
- Phase browsing with expand/collapse
- Search across issues, subtasks, and linked issues
- ISA/track filters
- Status summaries and approval next-step links
- Email/clipboard export actions

## Run Locally

### Install + build
```
npm install
npm run build
```

### Dev server
```
npm run dev
```

### Preview build
```
npm run preview
```

## Docker (Nginx)

Build and run via compose:
```
docker compose up --build
```

The container listens on port `5038`.

## Data Sources

The app attempts to load YAML from:
1) `VITE_YAML_URL` (if provided)
2) `DEFAULT_SRC_REMOTE` (GitHub release URL placeholder in `src/config/constants.js`)
3) Local file `public/RVS_phase_rollup.yaml` (mounted into the container)

Update the placeholder URL in `src/config/constants.js` to your release URL.

### Host-mounted YAML

`docker-compose.yml` mounts:
- `public/RVS_phase_rollup.yaml` -> `/usr/share/nginx/html/RVS_phase_rollup.yaml`
- `public/status_config.json` -> `/usr/share/nginx/html/status_config.json`

This allows regenerating the YAML every 10 minutes without rebuilding the image.

## Status Configuration

`status_config.json` controls status semantics:
- `doneStatuses`
- `notStartedStatuses`

Update this file and refresh the page to apply changes.

## YAML Format (expected)

Top-level:
- `schema_version` (string or number)
- `project` (string)
- `generated_at` (ISO timestamp)
- `counts` (map of phase -> count)
- `phases` (map of phase -> list of issues)

Issue fields used:
- `key`, `summary`, `phase`, `days_in_phase`
- `isa_or_non_isa.value`
- `is_fast_track.value`
- `github`
- `subtasks[]`: `key`, `summary`, `status`, `type`, `is_approval`
- `linked_issues[]`: `key`, `summary`, `relationship`, `direction`

Linked issues shown in the header use only relationships:
- `is developed by`
- `is governed by`

## UI Filters

- Phase pills filter by phase only (no additional filters implied).
- ISA / NON-ISA and Regular / Fast-Track filters combine with phase selection.

## Build Notes

The UI is bundled with Vite and served as static assets by Nginx. The page is `index.html`.

## Repo Layout

- `public/`: Static assets and runtime config (`RVS_phase_rollup.yaml`, `status_config.json`, `riscv_logo.png`).
- `src/`: React source code and UI logic.
- `scripts/`: Helper scripts (for example `run_get_issues.sh`).
- `docs/`: Documentation artifacts (for example `task_spec.json`).

## GitHub Pages

This repo is configured to deploy to GitHub Pages on every YAML release. The Vite build sets `base` to `/riscv-sde/` when `GITHUB_PAGES=true`.

## YAML Release Workflow

`Release YAML` runs hourly and on manual dispatch. It executes `scripts/run_get_issues.sh` (in single-run mode) and uploads `public/RVS_phase_rollup.yaml` to a timestamped GitHub release.

The workflow expects `get-issues.py` to exist in the repo root; if the generator lives elsewhere, update `scripts/run_get_issues.sh` or the workflow to point at it.
