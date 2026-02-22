# PIM-to-PIM Sync

An Akeneo PIM extension that synchronizes products and product models from one PIM environment to another. Select items in the product grid, configure sync options, optionally check and resolve missing dependencies in the target, then push everything in a single workflow.

## Features

- **Bulk sync** — push any number of selected products and product models to a second Akeneo PIM
- **Automatic hierarchy handling** — parent and grandparent product models are included automatically so variant products land in the correct structure
- **Dependency check** — detect missing families, attributes, attribute options, family variants, categories, association types, and groups in the destination before syncing
- **Auto-create dependencies** — missing entities can be copied from source to destination in the correct order (attributes before options, families before variants, parent categories before children)
- **Attribute filter** — exclude specific attributes from the sync payload, with missing attributes highlighted so you can easily skip those that failed to create
- **Retry on failure** — retry only the failed items without re-running the entire sync
- **Real-time progress** — each item shows live status (pending, in progress, created, updated, failed) with expandable error details and payload inspection

## Prerequisites

- Two Akeneo PIM environments (source and destination)
- An **App Token** (Bearer Token) for the destination PIM with read/write access to products, product models, families, attributes, categories, and association types
- The [Akeneo Extension SDK](../../) set up in the parent directory

## Quick Start

```bash
# 1. Install dependencies
make install

# 2. Interactive first-time setup (configures .env and deploys)
make start
```

`make start` will prompt you for:
- Your source PIM host URL
- An API token (or OAuth credentials to generate one)

It then deploys the extension to your PIM.

### Manual Setup

If you prefer manual configuration:

1. Copy `.env.example` to `.env` and fill in your source PIM host and API token
2. Edit `extension_configuration.json`:
   - Set `custom_variables.destination_pim_url` to your destination PIM URL
   - Set `credentials[0].value` to your destination PIM App Token
3. Run `make create` to deploy for the first time, or `make update` for subsequent deploys

## Commands

| Command | Description |
|---|---|
| `make install` | Install npm dependencies |
| `make build` | Production build (minified, tree-shaken) |
| `make build-dev` | Development build (inline sourcemaps) |
| `make dev` | Start Vite dev server |
| `make watch` | Watch mode — rebuilds and redeploys on file change |
| `make create` | Deploy a new extension to PIM (production) |
| `make create-dev` | Deploy a new extension to PIM (development) |
| `make update` | Update the deployed extension (production) |
| `make update-dev` | Update the deployed extension (development) |

## Configuration

### extension_configuration.json

```json
{
  "position": "pim.product-grid.action-bar",
  "name": "pim_to_pim_sync",
  "type": "sdk_script",
  "file": "dist/pim-to-pim-sync-v0.0.37-20260221-2226.js",
  "configuration": {
    "default_label": "Sync to other PIM",
    "labels": { "en_US": "Sync to other PIM" }
  },
  "custom_variables": {
    "destination_pim_url": "https://your-env2.cloud.akeneo.com"
  },
  "credentials": [
    {
      "code": "env2_app_token",
      "type": "Bearer Token",
      "value": "REPLACE_WITH_YOUR_ENV2_APP_TOKEN"
    }
  ]
}
```

| Field | Description |
|---|---|
| `position` | `pim.product-grid.action-bar` — the extension appears as a button in the product grid toolbar |
| `custom_variables.destination_pim_url` | URL of the target PIM. Can be overridden by admins in the PIM UI without redeployment |
| `credentials[0].value` | Bearer token for the destination PIM API. Stored securely and injected by the PIM gateway |

## Architecture

```
src/
  main.tsx                          # Entry point — mounts React app
  App.tsx                           # 4-step workflow orchestration

  components/
    StepIndicator.tsx               # Visual step progress bar
    steps/
      ConfigStep.tsx                # Step 1: selection summary + sync options
      DependencyCheckStep.tsx       # Step 2: analyze + report + resolve
      FilterStep.tsx                # Step 3: dep results + attribute filter
      SyncStep.tsx                  # Step 4: sync progress + retry

  hooks/
    useProductSelection.ts          # Loads selected products/models from PIM context
    useDependencyCheck.ts           # Dependency check state machine
    useSyncExecution.ts             # Sync runner with retry support

  sync/
    types.ts                        # TypeScript type definitions
    productFetcher.ts               # Fetches product/model data from source PIM
    payloadBuilder.ts               # Builds clean API payloads (strips read-only fields, media, etc.)
    env2Client.ts                   # PATCH products/models to destination
    destinationClient.ts            # Low-level HTTP helpers for destination PIM
    dependencyExtractor.ts          # Scans products for referenced entities
    dependencyChecker.ts            # Checks destination for missing entities
    dependencyCreator.ts            # Creates missing entities in dependency order
    dependencyResolver.ts           # Topological sort for sync order
```

### Sync Flow

```
Product grid selection
  → Step 1: Configure (sync options, item summary)
  → Step 2: Dependencies (analyze → report → resolve)     [if enabled]
  → Step 3: Filter (dep results + attribute exclusion)     [if enabled]
  → Step 4: Sync (push items with real-time progress)
```

When "Check destination dependencies" is disabled, the flow skips directly from Step 1 to Step 4.

### Dependency Resolution Order

When auto-creating missing entities, the extension respects dependency ordering:

1. Attributes (and their attribute groups if missing)
2. Attribute options
3. Families
4. Family variants
5. Categories (parents created recursively before children)
6. Association types

Groups cannot be created via the API and are always stripped from payloads.
