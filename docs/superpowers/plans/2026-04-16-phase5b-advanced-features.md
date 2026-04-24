# Phase 5b — Advanced Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an HTML export report, a step-by-step leveling wizard, and a better Klipper SCREWS_TILT_CALCULATE display.

**Architecture:** All front-end except the export (pure JS Blob download). The wizard is an inline expandable section using KO observables. Klipper display improves the existing `klipper_screw_results_array` rendering.

**Tech Stack:** KnockoutJS, Plotly.js (toImage for export), Bootstrap 2, OctoPrint control API

---

## File Map

| File | Role |
|------|------|
| `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` | exportReport, wizard logic, Klipper parsing |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` | Export button, wizard UI, Klipper cards |

---

### Task 7: Export HTML Report

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` (add `exportReport` function)
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` (add export button)

- [ ] **Step 1: Add `exportReport` function in JS**

Add after `self.drawDiffChart` function:

```javascript
self.exportReport = function() {
    var stats = self.mesh_stats();
    if (!stats) {
        new PNotify({ title: 'Export', text: 'No mesh data to export.', type: 'warning', hide: true });
        return;
    }
    Plotly.toImage('bedlevelvisualizergraph', { format: 'png', width: 700, height: 450 }).then(function(imgUrl) {
        var bed = self.bed_info();
        var corrections = self.screw_corrections();
        var patterns = self.mesh_patterns() || [];
        var hist = self.mesh_history_list();

        function gradeClass(g) { return g === 'A' || g === 'B' ? 'ok' : g === 'C' ? 'warn' : 'bad'; }

        var html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">' +
            '<title>Bed Level Report</title><style>' +
            'body{font-family:monospace;background:#111;color:#ddd;padding:24px;max-width:900px;margin:0 auto}' +
            'h1{color:#fff;border-bottom:2px solid #444;padding-bottom:8px}' +
            'h2{color:#aaa;margin-top:24px}' +
            'table{border-collapse:collapse;width:100%;margin-top:8px}' +
            'td,th{border:1px solid #444;padding:6px 12px;text-align:left}' +
            'th{background:#222;color:#aaa}' +
            '.ok{color:#5c5}.warn{color:#f90}.bad{color:#e44}' +
            'img{max-width:100%;border:1px solid #444;border-radius:4px;margin-top:8px}' +
            '.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;margin:2px}' +
            '.badge-ok{background:#1a3a1a;border:1px solid #3a7a3a}' +
            '.badge-warn{background:#3a2a00;border:1px solid #997700}' +
            '.badge-bad{background:#3a0000;border:1px solid #993333}' +
            '@media print{body{background:#fff;color:#000}td,th{border-color:#ccc}h1,h2{color:#000}}' +
            '</style></head><body>';

        var bedStr = bed.x_max ? Math.round(bed.x_max) + ' × ' + Math.round(bed.y_max) + ' mm' : 'Unknown';
        html += '<h1>Bed Level Report</h1>';
        html += '<p>Generated: <strong>' + new Date().toLocaleString() + '</strong> &nbsp;|&nbsp; Bed: <strong>' + bedStr + '</strong></p>';

        html += '<h2>Flatness</h2><table><tr><th>P-P</th><th>RMS</th><th>Grade</th><th>Distribution</th></tr><tr>';
        html += '<td class="' + (parseFloat(stats.pp) < 0.1 ? 'ok' : parseFloat(stats.pp) < 0.2 ? 'warn' : 'bad') + '">' + stats.pp + ' mm</td>';
        html += '<td>' + stats.rms + ' mm</td>';
        html += '<td class="' + gradeClass(stats.grade) + '">' + stats.grade + '</td>';
        html += '<td>' + stats.pct_ok + '% ok / ' + stats.pct_warn + '% warn / ' + stats.pct_crit + '% critical</td>';
        html += '</tr></table>';

        if (patterns.length) {
            html += '<h2>Patterns</h2><ul>' + patterns.map(function(p) { return '<li>' + p + '</li>'; }).join('') + '</ul>';
        }

        html += '<h2>Mesh Visualization</h2><img src="' + imgUrl + '" alt="Mesh 3D view"/>';

        if (corrections.length) {
            html += '<h2>Screw Corrections</h2><table><tr><th>Screw</th><th>Position</th><th>Z</th><th>Delta</th><th>Turns</th><th>Action</th></tr>';
            corrections.forEach(function(sc) {
                var cls = sc.display_state === 'ok' || sc.display_state === 'ref' ? 'ok' : sc.tier === 'critical' ? 'bad' : 'warn';
                var action = sc.display_state === 'ref' ? 'REF' :
                             sc.display_state === 'ok'  ? '✓ OK' :
                             sc.display_state === 'adjust' ? (sc.tighten ? '↓ Tighten' : '↑ Loosen') + ' ' + sc.turns + ' turns' : sc.display_state;
                html += '<tr><td class="' + cls + '">' + sc.label + '</td>' +
                        '<td>X=' + sc.x + ' Y=' + sc.y + '</td>' +
                        '<td>' + sc.z + ' mm</td>' +
                        '<td>' + sc.delta + ' mm</td>' +
                        '<td>' + sc.turns + '</td>' +
                        '<td class="' + cls + '">' + action + '</td></tr>';
            });
            html += '</table>';
        }

        if (hist.length) {
            html += '<h2>Mesh History (last ' + hist.length + ')</h2>';
            html += '<table><tr><th>Date</th><th>P-P</th><th>Grade</th><th>Bed Temp</th></tr>';
            hist.forEach(function(e) {
                html += '<tr><td>' + e.timestamp + '</td>' +
                        '<td class="' + (parseFloat(e.pp) < 0.1 ? 'ok' : parseFloat(e.pp) < 0.2 ? 'warn' : 'bad') + '">' + e.pp + ' mm</td>' +
                        '<td class="' + gradeClass(e.grade || 'D') + '">' + (e.grade || '?') + '</td>' +
                        '<td>' + (e.bed_temp !== null && e.bed_temp !== undefined ? e.bed_temp + ' °C' : 'N/A') + '</td></tr>';
            });
            html += '</table>';
        }

        html += '<hr style="margin-top:32px;border-color:#444"><p style="color:#666;font-size:10px">OctoPrint BedLevelVisualizer — RoJLD fork</p></body></html>';

        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'bed-level-report-' + new Date().toISOString().slice(0, 10) + '.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }).catch(function() {
        new PNotify({ title: 'Export', text: 'Could not capture graph image. Report without image.', type: 'warning' });
    });
};
```

- [ ] **Step 2: Add export button in tab template**

In `bedlevelvisualizer_tab.jinja2`, find the button row (`bedlevelvisualizerbutton` div) and add an export button after the M420 V button:

```html
<button class="btn btn-mini" style="margin-left: 6px;"
    data-bind="click: $root.exportReport,
               enable: $root.mesh_stats() && !$root.processing(),
               visible: $root.mesh_stats()"
    title="Export HTML report with mesh data, corrections and history">
    <i class="fa fa-download"></i> Export
</button>
```

- [ ] **Step 3: Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js \
        octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2
git commit -m "feat: export HTML bed level report with graph, corrections and history"
```

---

### Task 8: Step-by-step leveling wizard

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` (wizard observables + functions)
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` (wizard UI)

The wizard is an inline collapsible section with 4 steps:
1. Heat bed (optional)
2. Run G29 (calls `updateMesh`)
3. Adjust screws (shows guide, waits for user confirmation)
4. Re-run G29 to verify

- [ ] **Step 1: Add wizard observables in JS**

After `self.screw_workflow_step = ko.observable(-1);` add:

```javascript
self.wizard_active = ko.observable(false);
self.wizard_step = ko.observable(0); // 0=heat, 1=mesh1, 2=adjust, 3=mesh2, 4=done
self.wizard_bed_temp_target = ko.observable(60);
```

- [ ] **Step 2: Add wizard functions in JS**

Add after `self.stopScrewWorkflow`:

```javascript
self.startWizard = function() {
    self.wizard_step(0);
    self.wizard_active(true);
};

self.wizardNext = function() {
    var step = self.wizard_step();
    if (step === 1 || step === 3) {
        // Steps 1 and 3 trigger mesh update
        self.updateMesh();
    }
    if (step === 0) {
        // Heat bed if target > 0
        var temp = parseFloat(self.wizard_bed_temp_target());
        if (temp > 0) {
            OctoPrint.control.sendGcode(['M140 S' + temp, 'M190 S' + temp]);
        }
    }
    self.wizard_step(step + 1);
};

self.wizardSkip = function() {
    self.wizard_step(self.wizard_step() + 1);
};

self.cancelWizard = function() {
    self.wizard_active(false);
    self.wizard_step(0);
};
```

- [ ] **Step 3: Add wizard UI in tab template**

In `bedlevelvisualizer_tab.jinja2`, find the stats section opening. Add BEFORE the `<!-- Mesh Statistics -->` comment:

```html
<!-- Leveling Wizard -->
<!-- ko if: $root.wizard_active() -->
<div class="row-fluid" style="background: #1a1a2a; border: 1px solid #334; border-radius: 6px; padding: 12px; margin-top: 8px;">
    <div style="font-size: 13px; font-weight: bold; color: #aad; margin-bottom: 10px;">
        <i class="fa fa-magic"></i> Leveling Wizard
        <button class="btn btn-mini btn-danger pull-right" data-bind="click: $root.cancelWizard">
            <i class="fa fa-times"></i> Cancel
        </button>
    </div>

    <!-- Step 0: Heat bed -->
    <!-- ko if: $root.wizard_step() === 0 -->
    <div>
        <p><strong>Step 1/4 — Heat bed</strong></p>
        <p style="color: #aaa; font-size: 11px;">Heat the bed to printing temperature before leveling for accurate results.</p>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <div class="input-prepend input-append">
                <span class="add-on">Target</span>
                <input type="number" class="input-mini" min="0" max="120" step="5"
                       data-bind="value: $root.wizard_bed_temp_target"/>
                <span class="add-on">°C</span>
            </div>
            <button class="btn btn-primary btn-small"
                    data-bind="click: $root.wizardNext, enable: $root.controlViewModel.isOperational() && !$root.processing()">
                <i class="fa fa-thermometer-half"></i> Heat &amp; Continue
            </button>
            <button class="btn btn-small" data-bind="click: $root.wizardSkip">
                Skip (already hot)
            </button>
        </div>
    </div>
    <!-- /ko -->

    <!-- Step 1: First mesh -->
    <!-- ko if: $root.wizard_step() === 1 -->
    <div>
        <p><strong>Step 2/4 — Run bed leveling (G29)</strong></p>
        <p style="color: #aaa; font-size: 11px;">This will run your configured bed leveling command and capture the mesh.</p>
        <button class="btn btn-primary btn-small"
                data-bind="click: $root.wizardNext, enable: $root.controlViewModel.isOperational() && !$root.processing()">
            <i class="fa fa-play"></i> Start Mesh Leveling
        </button>
    </div>
    <!-- /ko -->

    <!-- Step 2: Adjust screws (waiting for mesh to complete) -->
    <!-- ko if: $root.wizard_step() === 2 -->
    <div>
        <p><strong>Step 3/4 — Adjust screws</strong></p>
        <p style="color: #aaa; font-size: 11px;">Use the Screw Adjustment Guide below to level each corner. When done, click Continue.</p>
        <button class="btn btn-primary btn-small" data-bind="click: $root.wizardNext">
            <i class="fa fa-check"></i> Screws adjusted — Continue
        </button>
    </div>
    <!-- /ko -->

    <!-- Step 3: Verification mesh -->
    <!-- ko if: $root.wizard_step() === 3 -->
    <div>
        <p><strong>Step 4/4 — Verify result</strong></p>
        <p style="color: #aaa; font-size: 11px;">Run a second mesh to confirm the bed is now leveled.</p>
        <button class="btn btn-primary btn-small"
                data-bind="click: $root.wizardNext, enable: $root.controlViewModel.isOperational() && !$root.processing()">
            <i class="fa fa-refresh"></i> Run Verification Mesh
        </button>
    </div>
    <!-- /ko -->

    <!-- Step 4: Done -->
    <!-- ko if: $root.wizard_step() >= 4 -->
    <div>
        <p><strong style="color: #5c5;"><i class="fa fa-check-circle"></i> Leveling complete!</strong></p>
        <p style="color: #aaa; font-size: 11px;" data-bind="if: $root.mesh_stats()">
            Final P-P: <strong data-bind="text: $root.mesh_stats().pp + 'mm'"></strong>
            &nbsp; Grade: <strong data-bind="text: $root.mesh_stats().grade"></strong>
        </p>
        <button class="btn btn-success btn-small" data-bind="click: $root.cancelWizard">
            <i class="fa fa-flag-checkered"></i> Finish
        </button>
    </div>
    <!-- /ko -->
</div>
<!-- /ko -->
<!-- ko ifnot: $root.wizard_active() -->
<div style="text-align: right; margin-bottom: 4px;" data-bind="visible: $root.controlViewModel.isOperational() && !$root.processing()">
    <button class="btn btn-mini btn-default" data-bind="click: $root.startWizard" title="Step-by-step leveling guide">
        <i class="fa fa-magic"></i> Leveling Wizard
    </button>
</div>
<!-- /ko -->
```

Note: The wizard step progression for step 1 (mesh) works because when `wizardNext()` is called with step=1, it calls `updateMesh()` AND advances `wizard_step` to 2. The mesh runs asynchronously. The user sees step 3 (Adjust screws) instructions while waiting for the mesh to complete — which is correct behavior since they should wait for the mesh anyway.

- [ ] **Step 4: Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js \
        octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2
git commit -m "feat: step-by-step leveling wizard (heat, G29, adjust, verify)"
```

---

### Task 9: Klipper SCREWS_TILT_CALCULATE improved display

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` (add `klipperTurnsToDecimal` helper)
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` (replace flat list with cards)

Klipper outputs amounts like `"0:30"` (turns:seconds-of-clock-face). `0:30` = 30/60 = 0.5 turns. `1:15` = 1 + 15/60 = 1.25 turns.

- [ ] **Step 1: Add `klipperTurnsToDecimal` helper in JS**

Add near `self.klipper_screw_results_array`:

```javascript
self.klipperTurnsToDecimal = function(amountStr) {
    if (!amountStr) { return 0; }
    var parts = amountStr.split(':');
    var turns = parseInt(parts[0]) || 0;
    var seconds = parseInt(parts[1]) || 0;
    return (turns + seconds / 60).toFixed(2);
};
```

Also add a computed `klipper_screw_results_display` that maps the raw results to display-ready objects:

```javascript
self.klipper_screw_results_display = ko.computed(function() {
    return self.klipper_screw_results_array().map(function(e) {
        return {
            name: e.name,
            x: e.x,
            y: e.y,
            direction: e.direction,
            amount: e.amount,
            turns: self.klipperTurnsToDecimal(e.amount),
            isCW: e.direction === 'CW',
            ok: e.amount === '0:00' || e.amount === '00:00'
        };
    });
}, self);
```

- [ ] **Step 2: Replace Klipper flat list with cards in tab template**

Find the Klipper results section in `bedlevelvisualizer_tab.jinja2` (currently using `klipper_screw_results_array`). Replace with:

```html
<!-- ko if: $root.klipper_screw_results_display().length > 0 -->
<div style="margin-top: 12px;">
    <div style="font-size: 11px; font-weight: bold; color: #aaa; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px;">
        <i class="fa fa-wrench"></i> Klipper SCREWS_TILT Results
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 6px;" data-bind="foreach: $root.klipper_screw_results_display()">
        <div data-bind="style: { borderColor: ok ? '#336633' : isCW ? '#996600' : '#334466' }"
             style="border: 1px solid #555; border-radius: 6px; padding: 8px 12px; text-align: center; min-width: 100px;">
            <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px;"
                 data-bind="text: name"></div>
            <!-- ko if: ok -->
            <div style="font-size: 18px; color: #5c5; margin: 4px 0;">✓</div>
            <div style="font-size: 10px; color: #5c5;">OK</div>
            <!-- /ko -->
            <!-- ko ifnot: ok -->
            <div style="font-size: 20px; font-weight: bold; margin: 4px 0;"
                 data-bind="text: turns + ' turns',
                            style: { color: isCW ? '#f90' : '#88aaff' }"></div>
            <div style="font-size: 11px;"
                 data-bind="text: isCW ? '↓ CW (Tighten)' : '↑ CCW (Loosen)',
                            style: { color: isCW ? '#f90' : '#88aaff' }"></div>
            <!-- /ko -->
            <div style="font-size: 9px; color: #555; margin-top: 4px;"
                 data-bind="text: 'X=' + x + ' Y=' + y"></div>
        </div>
    </div>
</div>
<!-- /ko -->
```

- [ ] **Step 3: Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js \
        octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2
git commit -m "feat: Klipper SCREWS_TILT results shown as visual cards with direction and turns"
```
