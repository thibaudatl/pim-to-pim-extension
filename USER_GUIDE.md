# PIM-to-PIM Sync — User Guide

This guide explains how to install, configure, and use the PIM-to-PIM Sync extension to push products and product models from one Akeneo PIM to another.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Configuration](#2-configuration)
3. [Using the Extension](#3-using-the-extension)
4. [Step 1 — Configure](#step-1--configure)
5. [Step 2 — Dependencies](#step-2--dependencies)
6. [Step 3 — Filter](#step-3--filter)
7. [Step 4 — Sync](#step-4--sync)
8. [Troubleshooting](#4-troubleshooting)

---

## 1. Installation

### What you need

- A **source PIM** environment (where your products live)
- A **destination PIM** environment (where you want to push products)
- An **App Token** for the destination PIM with API permissions for products, product models, families, attributes, categories, and association types
- Node.js installed on your machine

### Deploy the extension

From the `pim-to-pim-sync/` directory:

```bash
# Option A: Interactive setup (recommended for first time)
make start

# Option B: Manual setup
make install
# Edit .env with your source PIM credentials
# Edit extension_configuration.json with destination PIM URL and token
make create
```

The `make start` command walks you through:
1. Entering your source PIM host URL (e.g. `https://my-pim.cloud.akeneo.com`)
2. Providing an API token or OAuth credentials
3. Building and deploying the extension

Once deployed, the extension appears as a button in the **product grid action bar** of your source PIM.

---

## 2. Configuration

### Destination PIM URL

Set the destination PIM URL in `extension_configuration.json`:

```json
"custom_variables": {
  "destination_pim_url": "https://your-destination-pim.cloud.akeneo.com"
}
```

PIM admins can also change this value directly in the PIM UI under the extension settings — no redeployment needed.

### Destination PIM Token

The extension needs an App Token (Bearer Token) for the destination PIM. Set it in the credentials section of `extension_configuration.json`:

```json
"credentials": [
  {
    "code": "env2_app_token",
    "type": "Bearer Token",
    "value": "your-destination-app-token-here"
  }
]
```

This token is stored securely by the PIM and injected automatically into API calls — it never appears in the extension code at runtime.

**Required permissions on the destination PIM token:**
- Products: read + write
- Product models: read + write
- Families and family variants: read + write (if using dependency check)
- Attributes and attribute options: read + write (if using dependency check)
- Categories: read + write (if using dependency check)
- Association types: read + write (if using dependency check)

### Updating the extension

After making changes to configuration or code:

```bash
make update       # production build + deploy
make update-dev   # development build + deploy (with sourcemaps)
```

---

## 3. Using the Extension

### Opening the extension

1. Go to the **Products** grid in your source PIM
2. Select the products and/or product models you want to sync using the checkboxes
3. Click the **"Sync to other PIM"** button in the action bar above the grid

The extension opens and loads your selected items.

---

### Step 1 — Configure

This step shows what will be synced and lets you choose how.

#### Selection summary

At the top you'll see a count of selected items (e.g. "5 item(s) selected: 3 products, 2 product models") with a scrollable list showing each item's identifier/UUID or code.

#### Target environment

Displays the destination PIM URL. If it's not configured, you'll see a warning.

#### Sync options

| Option | Default | What it does |
|---|---|---|
| **Include parent product models** | On | Automatically includes direct parent models of any selected variant products, so the hierarchy exists in the destination |
| **Include grandparent models** | On | Also includes root-level models in 2-level variant hierarchies |
| **Overwrite existing products** | On | Updates products/models that already exist in the destination (via PATCH). When off, existing items would be skipped |
| **Skip assets & medias** | On | Strips image, file, and asset collection attribute values from the payload. Useful because media files can't be transferred via API |
| **Skip associations** | On | Strips association and quantified association data from the payload |
| **Check destination dependencies** | Off | Enables the dependency check workflow (Steps 2 and 3) to detect and auto-create missing families, attributes, categories, etc. before syncing |

#### When to enable "Check destination dependencies"

Enable this when:
- The destination PIM is a fresh or partial environment
- You're syncing products that use families, attributes, or categories that may not exist in the destination
- You want to avoid sync errors caused by missing references

You can leave it off when:
- The destination PIM already has the same catalog structure (families, attributes, categories)
- You're re-syncing products that have been pushed before

Click **"Next"** (if dependency check is on) or **"Start Sync"** (if off) to proceed.

---

### Step 2 — Dependencies

> This step only appears when "Check destination dependencies" is enabled.

The extension scans your selected products and product models for every entity they reference, then checks the destination PIM to see what's missing.

#### Analysis phase

A progress bar shows the check progressing through:
- Loading attribute definitions from the source PIM
- Extracting dependencies from products (attributes, families, categories, etc.)
- Checking each entity type against the destination PIM

#### If nothing is missing

If all dependencies exist in the destination, the extension automatically advances to Step 3.

#### Report phase

If missing dependencies are found, you see a card for each entity type:

| Entity type | What's checked |
|---|---|
| **Attributes** | Every attribute code used in product/model values |
| **Attribute options** | All option values for select and multiselect attributes |
| **Families** | The family of each product and product model |
| **Family variants** | The variant structure of each product model |
| **Categories** | All categories assigned to products and models |
| **Association types** | All association types used in associations |
| **Groups** | All groups assigned to products (always stripped — no creation API) |

Each card shows:
- How many entities exist vs. how many are missing
- A **resolution strategy** dropdown:
  - **Auto-create** — copy the entity from source to destination
  - **Strip** — remove references from the product payload (the product syncs without them)
  - **Skip** — do nothing (products referencing them will likely fail)

You can expand each card to see the individual missing items. For attributes and categories, you can exclude specific items with checkboxes (excluded items won't be created and will be stripped from payloads).

Click **"Resolve & Proceed"** to start creating the missing entities.

#### Resolving phase

A progress bar shows each entity being created in the destination. Entities are created in dependency order (attributes before options, families before variants, parent categories before children).

When resolving finishes, the extension advances to Step 3.

---

### Step 3 — Filter

> This step only appears when "Check destination dependencies" is enabled.

This step has two sections:

#### Dependency creation results

At the top you'll see the outcome of the dependency creation:
- Green badge: how many entities were successfully created
- Red badge: how many failed

If there were failures, a scrollable list shows each item with its status and error message. A warning reminds you that products referencing failed dependencies may fail during sync.

#### Attribute filter

Below the results, a full list of every attribute present in your selected products and models is displayed, with:

- **A search bar** to quickly find attributes by code or type
- **Missing attributes** highlighted in red at the top of the list, with a "missing" badge — these don't exist in the destination
- **Attribute type** displayed next to each attribute (e.g. text, simpleselect, boolean, textarea)
- **Checkboxes** to include or exclude each attribute — unchecked attributes will have their values stripped from the sync payload
- **Select all / Deselect all** toggle

This is useful when:
- Some attributes failed to create in the destination — uncheck them so the product sync doesn't fail
- You want to sync only a subset of attribute values
- Certain attributes are irrelevant to the destination environment

Click **"Start Sync"** to proceed, or **"← Dependencies"** to go back to the report (all data is preserved — no re-analysis needed).

---

### Step 4 — Sync

The extension pushes each item to the destination PIM one at a time in the correct order:

1. **Grandparent product models** (root-level models)
2. **Parent product models** (sub-models)
3. **Selected product models**
4. **Products**

This ordering ensures parent models exist before their children are pushed.

#### During sync

A progress bar shows overall progress. Each item in the list displays:
- **Status icon**: pending (○), in progress (◑), success (✓), or failed (✗)
- **Type badge**: "product" or "model"
- **Identifier**: product identifier + UUID, or model code
- **HTTP result**: "created" (201), "updated" (204), or the HTTP error code

#### When sync completes

A summary shows the total counts:
- **Created** — new items in the destination (HTTP 201)
- **Updated** — existing items overwritten (HTTP 204)
- **Failed** — items that encountered an error
- **Skipped** — items that were skipped

For failed items, the error message is shown below the item. You can click **"Show payload"** to inspect the exact JSON that was sent — helpful for debugging.

#### Actions after sync

- **Retry failed** — re-runs only the items that failed, without touching successful ones
- **Close** — refreshes the PIM page
- **← Filter** / **← Configure** — go back to adjust settings and re-sync

---

## 4. Troubleshooting

### "Not configured" warning for target environment

The destination PIM URL is not set. Edit `extension_configuration.json` and set `custom_variables.destination_pim_url`, then redeploy with `make update`. Alternatively, a PIM admin can set it in the extension settings UI.

### Access denied errors during dependency check

The destination PIM token doesn't have read permissions for that resource type. The extension will skip checking those resources and show an "access denied" note. To fix:
- Generate a new App Token on the destination PIM with broader permissions
- Update the credential value in the PIM extension settings or in `extension_configuration.json`

### Products fail with "property X does not exist"

The destination PIM is missing an attribute, family, or other entity that the product references. Enable **"Check destination dependencies"** in Step 1 to detect and auto-create missing entities before syncing.

### Products fail with validation errors

The payload may contain values that don't pass the destination PIM's validation rules (e.g. required attributes missing, invalid option codes). Check the error message and payload details in Step 4. You can:
- Use the attribute filter in Step 3 to exclude problematic attributes
- Fix the data in the source PIM and re-sync

### Media/image attributes cause errors

Image and file attributes can't be transferred via API between PIM environments. Keep **"Skip assets & medias"** enabled (the default) to strip these values from the payload.

### Extension button doesn't appear in the product grid

- Verify the extension is deployed: check the Extensions page in the PIM admin
- Verify `position` is set to `pim.product-grid.action-bar` in `extension_configuration.json`
- Make sure you have at least one product selected in the grid — the action bar buttons appear when items are checked

### Sync succeeds but products are incomplete

Check your sync options:
- If associations are missing, disable "Skip associations"
- If attribute values are missing, check the attribute filter in Step 3 — some attributes may have been excluded
- If categories/groups are missing, they may have been stripped during dependency resolution
