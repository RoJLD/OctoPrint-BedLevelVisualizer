# Phase 5a — UX & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the existing UI with configurable settings, responsive graphs, tooltips, a P-P history chart in the main tab, a degradation alert, and a diff chart in the main tab.

**Architecture:** All changes are front-end (JS + Jinja2 templates) except two new Python settings. No new files are created — all modifications to existing files. Each task is independently deployable.

**Tech Stack:** KnockoutJS, Plotly.js, Bootstrap 2, OctoPrint settings API, PNotify

---

## File Map

| File | Role |
|------|------|
| `octoprint_bedlevelvisualizer/__init__.py` | Add 3 new setting defaults |
| `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` | Logic for all new features |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` | PP chart + diff in main tab, tooltips |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2` | Margin + degradation alert settings |

---

### Task 1: Configurable auto-configure margin

**Files:**
- Modify: `octoprint_bedlevelvisualizer/__init__.py` (after line 128 `mesh_freshness_hours=24,`)
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2` (after the Auto button row)
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` (`autoConfigureScrews` function, replace hardcoded `30`)

- [ ] **Step 1: Add setting default in `__init__.py`**

Find the line `mesh_freshness_hours=24,` and add after it:

```python
auto_configure_margin=30,
```

- [ ] **Step 2: Add input field in settings template**

Find in `bedlevelvisualizer_settings.jinja2` the block that contains `safe_z_height` (around line 329-337). Add a new row immediately BEFORE that block:

```html
<div class="row-fluid" style="padding-top: 5px;" data-bind="visible: $root.screws_bed_level_guide">
    <div class="control-group span6">
        <label>Auto-configure margin (mm)</label>
        <div class="input-append">
            <input type="number" class="input-mini" min="5" max="100" step="5"
                   data-bind="value: settingsViewModel.settings.plugins.bedlevelvisualizer.auto_configure_margin"/>
            <span class="add-on">mm</span>
        </div>
        <small class="help-block">Distance from bed edges when auto-placing FL/FR/BL/BR screws.</small>
    </div>
</div>
```

- [ ] **Step 3: Use setting in `autoConfigureScrews` JS function**

In `bedlevelvisualizer.js`, find `autoConfigureScrews` and replace the line:

```javascript
var margin = 30; // mm from edge
```

with:

```javascript
var margin = parseFloat(self.settingsViewModel.settings.plugins.bedlevelvisualizer.auto_configure_margin()) || 30;
```

- [ ] **Step 4: Commit**

```bash
git add octoprint_bedlevelvisualizer/__init__.py \
        octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js \
        octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2
git commit -m "feat: configurable auto-configure margin for screw positions"
```

---

### Task 2: P-P history chart in main tab

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` (parameterize `drawPPChart`)
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` (add chart div after stats)

- [ ] **Step 1: Parameterize `drawPPChart` to accept a target div ID**

Find `self.drawPPChart = function()` in `bedlevelvisualizer.js`. Change the signature and replace the hardcoded div ID:

```javascript
self.drawPPChart = function(targetId) {
    var divId = targetId || 'bedlevelvisualizer_pp_chart';
    var hist = self.mesh_history_list();
    if (!hist.length) { return; }
    // ... rest of function unchanged ...
    // Replace all occurrences of 'bedlevelvisualizer_pp_chart' with divId in this function
```

Also update the final `Plotly.react(...)` call inside the function to use `divId` instead of `'bedlevelvisualizer_pp_chart'`.

- [ ] **Step 2: Call `drawPPChart` for main tab after mesh is drawn**

In `bedlevelvisualizer.js`, find the section in `onDataUpdaterPluginMessage` where `drawMesh` is called (after `self.mesh_data(mesh_data.mesh)`). After the `drawMesh` call, add:

```javascript
if (self.mesh_history_list().length >= 2) {
    self.drawPPChart('bedlevelvisualizer_pp_chart_tab');
}
```

- [ ] **Step 3: Add chart div in tab template**

In `bedlevelvisualizer_tab.jinja2`, find `<!-- /ko -->` that closes the `<!-- ko if: $root.mesh_stats() -->` block (around line 68). Add immediately AFTER that closing `<!-- /ko -->`:

```html
<!-- ko if: $root.mesh_history_list().length >= 2 -->
<div class="row-fluid" style="padding-top: 4px; padding-bottom: 4px;">
    <div style="font-weight: bold; color: #aaa; font-size: 11px; margin-bottom: 2px;">
        <i class="fa fa-line-chart"></i> P-P History
    </div>
    <div id="bedlevelvisualizer_pp_chart_tab" style="height: 120px;"></div>
</div>
<!-- /ko -->
```

- [ ] **Step 4: Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js \
        octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2
git commit -m "feat: show P-P history chart in main tab"
```

---

### Task 3: Tooltips on stat badges

**Files:**
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` (add `title` attributes)
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` (extend tooltip init selector)

- [ ] **Step 1: Add `title` attributes to stat badge containers in tab template**

In `bedlevelvisualizer_tab.jinja2`, find the stats bar divs and add `title` attributes:

For the P-P badge div, add `title="Peak-to-Peak: max minus min mesh value. Lower = flatter bed."`:
```html
<div title="Peak-to-Peak: max minus min mesh value. Lower = flatter bed." style="background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 3px 8px;">
    <span style="color: #888;">P-P</span>
```

For the RMS badge, add `title="Root Mean Square: average deviation across all mesh points."`:
```html
<div title="Root Mean Square: average deviation across all mesh points." style="background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 3px 8px;">
    <span style="color: #888;">RMS</span>
```

For the grade badge, add `title="Grade: A=excellent (<0.05mm), B=good (<0.1mm), C=fair (<0.2mm), D=poor (≥0.2mm)."`:
```html
<div title="Grade: A=excellent (&lt;0.05mm), B=good (&lt;0.1mm), C=fair (&lt;0.2mm), D=poor (≥0.2mm)." ...>
```

For the % distribution badges, add `title="Distribution: % of points within ok/warn/critical thresholds (±0.05mm / ±0.2mm)."`.

- [ ] **Step 2: Initialize Bootstrap tooltips for tab elements**

In `bedlevelvisualizer.js`, find `onAfterBinding`. The existing tooltip init selector includes `div#tab_plugin_bedlevelvisualizer i[data-toggle="tooltip"]`. Add a new line after the existing tooltip init:

```javascript
$('div#tab_plugin_bedlevelvisualizer [title]').tooltip({ placement: 'top', trigger: 'hover', container: 'body' });
```

- [ ] **Step 3: Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js \
        octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2
git commit -m "feat: add tooltips to mesh stat badges in main tab"
```

---

### Task 4: Responsive Plotly graphs

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` (add `responsive: true` to all `Plotly.react` calls)

- [ ] **Step 1: Add `responsive: true` to 3D graph**

In `bedlevelvisualizer.js`, find the `Plotly.react('bedlevelvisualizergraph', ...)` call in `drawMesh`. The last argument is a config object. Change it to include `responsive: true`:

```javascript
Plotly.react('bedlevelvisualizergraph', data, layout, {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ['sendDataToCloud']
});
```

- [ ] **Step 2: Add `responsive: true` to heatmap**

Find the `Plotly.react('bedlevelvisualizerheatmap', ...)` call and apply the same change:

```javascript
Plotly.react('bedlevelvisualizerheatmap', heatmapData, heatmapLayout, {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ['sendDataToCloud']
});
```

- [ ] **Step 3: Add `responsive: true` to PP chart and diff chart**

In `drawPPChart`, update the Plotly config:

```javascript
Plotly.react(divId, [ppTrace], layout, { displaylogo: false, responsive: true });
```

In `drawDiffChart`, same:

```javascript
Plotly.react('bedlevelvisualizer_diff_chart', [diffTrace], layout, { displaylogo: false, responsive: true });
```

- [ ] **Step 4: Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "fix: make all Plotly charts responsive to container size"
```

---

### Task 5: Mesh degradation alert

**Files:**
- Modify: `octoprint_bedlevelvisualizer/__init__.py` (2 new settings)
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` (comparison logic)
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2` (settings UI)

- [ ] **Step 1: Add settings defaults in `__init__.py`**

After `auto_configure_margin=30,` add:

```python
mesh_degradation_alert=False,
mesh_degradation_threshold=20,
```

- [ ] **Step 2: Add degradation check in JS after saving history**

In `bedlevelvisualizer.js`, find the block that does `hist.unshift(histEntry)` (in the mesh processing code). Immediately AFTER `hist.unshift(histEntry)` and BEFORE `if (hist.length > 10)`, add:

```javascript
if (hist.length >= 2 &&
    self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_degradation_alert &&
    self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_degradation_alert()) {
    var currentPP  = parseFloat(hist[0].pp);
    var previousPP = parseFloat(hist[1].pp);
    var degradeThreshold = parseFloat(self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_degradation_threshold()) || 20;
    if (previousPP > 0) {
        var increasePercent = ((currentPP - previousPP) / previousPP) * 100;
        if (increasePercent > degradeThreshold) {
            new PNotify({
                title: 'Bed Flatness Alert',
                text: 'Flatness degraded by ' + Math.round(increasePercent) + '% since last mesh<br>' +
                      'P-P: ' + previousPP.toFixed(3) + 'mm → ' + currentPP.toFixed(3) + 'mm',
                type: 'warning',
                hide: false
            });
        }
    }
}
```

- [ ] **Step 3: Add settings UI**

In `bedlevelvisualizer_settings.jinja2`, find the pre-print alert section (containing `print_start_alert`). Add a similar section AFTER it:

```html
<div class="row-fluid" style="padding-top: 10px;">
    <hr/>
    <div class="control-group span12">
        <label style="font-weight: bold;">Mesh Degradation Alert</label>
        <div>
            <input class="input-checkbox" type="checkbox"
                   data-bind="checked: settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_degradation_alert"
                   style="display: inline-block; margin-bottom: 5px;"/>
            Alert when flatness degrades between meshes
        </div>
        <div style="margin-top: 4px;">
            <label>Threshold (%)</label>
            <div class="input-append" style="display: inline-block; margin-left: 8px;">
                <input type="number" class="input-mini" min="5" max="200" step="5"
                       data-bind="value: settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_degradation_threshold,
                                  enable: settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_degradation_alert()"/>
                <span class="add-on">%</span>
            </div>
            <small class="help-block">Show warning if P-P increases by more than this percentage.</small>
        </div>
    </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add octoprint_bedlevelvisualizer/__init__.py \
        octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js \
        octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2
git commit -m "feat: mesh degradation alert when flatness worsens between meshes"
```

---

### Task 6: Diff chart in main tab

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` (parameterize `drawDiffChart`, call it from tab)
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` (add diff section after screw guide)

- [ ] **Step 1: Parameterize `drawDiffChart`**

Find `self.drawDiffChart = function()` in `bedlevelvisualizer.js`. Change signature and replace the hardcoded div ID:

```javascript
self.drawDiffChart = function(targetId) {
    var divId = targetId || 'bedlevelvisualizer_diff_chart';
    var diffData = self.mesh_diff_data();
    if (!diffData) { return; }
    // ... rest unchanged, replace 'bedlevelvisualizer_diff_chart' with divId
    Plotly.react(divId, [diffTrace], layout, { displaylogo: false, responsive: true });
};
```

- [ ] **Step 2: Add subscription to redraw diff in tab when `mesh_diff_data` changes**

In `bedlevelvisualizer.js`, after the `mesh_diff_data` computed is defined, add:

```javascript
self.mesh_diff_data.subscribe(function(newVal) {
    if (newVal) {
        self.drawDiffChart('bedlevelvisualizer_diff_chart_tab');
        self.drawDiffChart('bedlevelvisualizer_diff_chart');
    }
});
```

- [ ] **Step 3: Add diff section in tab template**

In `bedlevelvisualizer_tab.jinja2`, find the closing `<!-- /ko -->` of the screw guide section (`<!-- ko if: $root.screws_bed_level_guide() && ... -->`). Add AFTER it:

```html
<!-- ko if: $root.mesh_history_list().length >= 2 -->
<div class="row-fluid" style="padding-top: 12px;">
    <hr style="margin: 8px 0;"/>
    <div style="font-size: 12px; font-weight: bold; color: #aaa; margin-bottom: 6px;">
        <i class="fa fa-code-fork"></i> Mesh Diff
    </div>
    <div style="display: flex; gap: 8px; align-items: center; font-size: 11px; flex-wrap: wrap; margin-bottom: 4px;">
        <span style="color: #888;">Compare</span>
        <select class="input-mini" data-bind="
            options: $root.mesh_history_list(),
            optionsText: function(e){ return e.timestamp; },
            optionsValue: function(e,i){ return $root.mesh_history_list.indexOf(e); },
            value: $root.mesh_diff_index_a"></select>
        <span style="color: #888;">vs</span>
        <select class="input-mini" data-bind="
            options: $root.mesh_history_list(),
            optionsText: function(e){ return e.timestamp; },
            optionsValue: function(e,i){ return $root.mesh_history_list.indexOf(e); },
            value: $root.mesh_diff_index_b"></select>
    </div>
    <!-- ko if: $root.mesh_diff_data() -->
    <div id="bedlevelvisualizer_diff_chart_tab" style="height: 200px;"></div>
    <!-- /ko -->
    <!-- ko ifnot: $root.mesh_diff_data() -->
    <p class="muted" style="font-size: 11px;">Select two different entries to compare.</p>
    <!-- /ko -->
</div>
<!-- /ko -->
```

Note: The `optionsValue` binding with index won't work directly — use a simpler approach with `optionsCaption` and numeric index. A cleaner workaround: use `$index()` in the template or store the index differently. The simplest approach that works with KO:

```html
<select class="input-mini" data-bind="value: $root.mesh_diff_index_a">
    <!-- ko foreach: $root.mesh_history_list() -->
    <option data-bind="value: $index(), text: timestamp"></option>
    <!-- /ko -->
</select>
```

- [ ] **Step 4: Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js \
        octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2
git commit -m "feat: mesh diff chart visible in main tab with entry selectors"
```
