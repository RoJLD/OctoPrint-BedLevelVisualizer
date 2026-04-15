# Phase 4 — Analysis, Firmware & Visualization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter analyse thermique, détection de patterns, heatmap 2D side-by-side, graphe d'évolution P-P, diff visuel de mesh, alertes pré-impression, support Klipper SCREWS_TILT_CALCULATE, bouton M420 V, et classement par contribution des vis.

**Architecture:** Task 1 étend le Python (nouveaux regex, temp, Klipper, alertes). Task 2 ajoute des KO computeds JS (patterns, ranking, thermal drift, diff). Task 3 ajoute la heatmap 2D side-by-side dans `drawMesh`. Task 4 ajoute P-P evolution chart et mesh diff UI dans les settings. Task 5 affiche les nouvelles données dans le tab HTML.

**Tech Stack:** Python (OctoPrint hooks + `re`), JavaScript (KnockoutJS computeds + Plotly.js), Jinja2/Bootstrap2

---

## Contexte — état actuel (commits phase 1-3)

- `__init__.py` ligne 57-59 : `regex_probe_result` existe, `current_bed_temp` **absent**
- `__init__.py` ligne 113-118 : settings `screws_bed_level_guide`, `bed_level_screws`, `screw_reference_mode`, `screw_reference_index`, `tolerance_colorscale`, `mesh_history` existent
- `__init__.py` ligne 471-473 : envoie `dict(mesh=self.mesh, bed=self.bed)` — pas de `bed_temp`
- `bedlevelvisualizer.js` ligne 73-81 : observables existants
- `bedlevelvisualizer.js` ligne 866-902 : `mesh_stats` computed existe
- `bedlevelvisualizer.js` ligne 924-930 : `restoreHistoryMesh` existe
- `bedlevelvisualizer.js` ligne 487 : `Plotly.react('bedlevelvisualizergraph', data, layout, config_options)`
- `bedlevelvisualizer_tab.jinja2` ligne 22 : `<div id="bedlevelvisualizergraph" ...>` dans un `div.row-fluid`
- `bedlevelvisualizer_settings.jinja2` ligne 140-185 : onglet "Data" avec historique (foreach `mesh_history_list`)

---

## Fichiers modifiés

| Fichier | Rôle |
|---|---|
| `octoprint_bedlevelvisualizer/__init__.py` | +regex bed_temp, +regex Klipper, +tracking temp, +Klipper parser, +pre-print alert, +settings |
| `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` | +observables, +computeds patterns/ranking/thermal/diff, +Klipper handler, +heatmap drawMesh |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` | +heatmap div side-by-side, +patterns block, +screw ranking, +M420 V button |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2` | +P-P evolution chart, +mesh diff UI, +alert settings |

---

## Task 1 : Python — température, Klipper, alertes

**Files:**
- Modify: `octoprint_bedlevelvisualizer/__init__.py`

### Step 1 : Ajouter 3 nouveaux settings dans `get_settings_defaults`

Dans `get_settings_defaults` (ligne ~77), après `mesh_history=[],`, ajouter :

```python
print_start_alert=False,
print_start_alert_threshold=0.2,
mesh_freshness_hours=24,
```

### Step 2 : Ajouter `current_bed_temp` et 2 nouveaux regex dans `__init__`

Après la ligne `self.regex_probe_result = re.compile(...)` (ligne ~57), ajouter :

```python
self.regex_bed_temp = re.compile(
    r"B:\s*([-\d.]+)\s*/\s*[-\d.]+"
)
self.regex_klipper_screw = re.compile(
    r"//\s*(\S+)\s*(?:\([^)]*\))?\s*:\s*x=([\d.]+),\s*y=([\d.]+),\s*z=([\d.]+)\s*:\s*Adjust\s+(CW|CCW)\s+([\d:]+)"
)
self.current_bed_temp = None
```

### Step 3 : Tracker la température dans `process_gcode`

Dans `process_gcode`, après le bloc `probe_match` (après `return line` ligne ~259) et AVANT `if not self.processing:`, ajouter :

```python
# Track bed temperature (always, regardless of processing state)
temp_match = self.regex_bed_temp.search(line)
if temp_match:
    try:
        self.current_bed_temp = float(temp_match.group(1))
    except (ValueError, IndexError):
        pass

# Detect Klipper SCREWS_TILT_CALCULATE output
klipper_screw_match = self.regex_klipper_screw.search(line)
if klipper_screw_match:
    try:
        self._plugin_manager.send_plugin_message(
            self._identifier,
            {"klipper_screw_result": {
                "name": klipper_screw_match.group(1),
                "x": float(klipper_screw_match.group(2)),
                "y": float(klipper_screw_match.group(3)),
                "z": float(klipper_screw_match.group(4)),
                "direction": klipper_screw_match.group(5),
                "amount": klipper_screw_match.group(6)
            }}
        )
    except (ValueError, IndexError):
        pass
```

### Step 4 : Inclure `bed_temp` dans le message mesh

À la ligne 471-473 dans `process_gcode`, remplacer :

```python
self._plugin_manager.send_plugin_message(
    self._identifier, dict(mesh=self.mesh, bed=self.bed)
)
```

par :

```python
self._plugin_manager.send_plugin_message(
    self._identifier, dict(mesh=self.mesh, bed=self.bed, bed_temp=self.current_bed_temp)
)
```

### Step 5 : Alerte pré-impression dans `on_event`

Dans `on_event`, remplacer le bloc `PRINT_STARTED` :

```python
if event == Events.PRINT_STARTED:
    self.printing = True
```

par :

```python
if event == Events.PRINT_STARTED:
    self.printing = True
    if self._settings.get_boolean(["print_start_alert"]):
        mesh_history = self._settings.get(["mesh_history"]) or []
        if not mesh_history:
            self._plugin_manager.send_plugin_message(
                self._identifier,
                {"print_alert": {"type": "no_mesh", "message": "No mesh recorded. Run a mesh update before printing."}}
            )
        else:
            import datetime, json
            latest = mesh_history[0]
            # Freshness check
            freshness_hours = self._settings.get_float(["mesh_freshness_hours"]) or 24
            try:
                ts = latest.get("timestamp", "")
                mesh_time = datetime.datetime.strptime(ts, "%x, %X")
                age_hours = (datetime.datetime.now() - mesh_time).total_seconds() / 3600
                if age_hours > freshness_hours:
                    self._plugin_manager.send_plugin_message(
                        self._identifier,
                        {"print_alert": {"type": "stale_mesh", "message": "Mesh is {:.1f}h old (threshold: {}h). Consider re-leveling.".format(age_hours, freshness_hours)}}
                    )
            except Exception:
                pass
            # P-P threshold check
            threshold = self._settings.get_float(["print_start_alert_threshold"]) or 0.2
            try:
                pp = float(latest.get("pp", 0))
                if pp > threshold:
                    self._plugin_manager.send_plugin_message(
                        self._identifier,
                        {"print_alert": {"type": "high_pp", "message": "Mesh P-P is {:.3f}mm (threshold: {}mm). Bed may not be leveled.".format(pp, threshold)}}
                    )
            except Exception:
                pass
```

### Step 6 : Commit

```bash
git add octoprint_bedlevelvisualizer/__init__.py
git commit -m "feat: add bed temp tracking, Klipper screw parser, pre-print alert system"
```

---

## Task 2 : JS — computeds patterns, ranking, thermal drift, diff, Klipper

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`

### Step 1 : Ajouter les nouveaux observables dans le bloc d'initialisation

Après `self.screw_reference_index = ko.observable(0);` (ligne ~81), ajouter :

```javascript
self.current_bed_temp = ko.observable(null);
self.klipper_screw_results = ko.observable({});
self.mesh_diff_index_a = ko.observable(0);
self.mesh_diff_index_b = ko.observable(1);
```

### Step 2 : Mettre à jour `onDataUpdaterPluginMessage` pour les nouveaux messages

Dans `onDataUpdaterPluginMessage`, après le bloc `probe_result` (ligne ~165-168), ajouter :

```javascript
if (mesh_data.klipper_screw_result) {
    var kr = self.klipper_screw_results();
    kr[mesh_data.klipper_screw_result.name] = mesh_data.klipper_screw_result;
    self.klipper_screw_results(Object.assign({}, kr));
    return;
}

if (mesh_data.print_alert) {
    new PNotify({
        title: 'Bed Level Alert',
        text: mesh_data.print_alert.message,
        type: mesh_data.print_alert.type === 'high_pp' ? 'error' : 'warning',
        hide: false
    });
    return;
}
```

### Step 3 : Stocker `bed_temp` dans l'entrée d'historique

Dans `drawMesh`, dans le bloc de création de `histEntry` (ligne ~257-275), remplacer :

```javascript
var histEntry = {
    timestamp: new Date().toLocaleString(),
    mesh_x: mesh_data_x.slice(),
    mesh_y: mesh_data_y.slice(),
    mesh: JSON.parse(JSON.stringify(mesh_data_z)),
    z_height: mesh_data_z_height,
    pp: (function() {
```

par :

```javascript
var histEntry = {
    timestamp: new Date().toLocaleString(),
    mesh_x: mesh_data_x.slice(),
    mesh_y: mesh_data_y.slice(),
    mesh: JSON.parse(JSON.stringify(mesh_data_z)),
    z_height: mesh_data_z_height,
    bed_temp: self.current_bed_temp(),
    pp: (function() {
```

### Step 4 : Mettre à jour `current_bed_temp` quand le mesh arrive

Dans `onDataUpdaterPluginMessage`, dans le bloc `if (mesh_data.mesh)` (ligne ~184), après la ligne qui set `self.bed_info({...})`, ajouter :

```javascript
if (mesh_data.bed_temp !== undefined && mesh_data.bed_temp !== null) {
    self.current_bed_temp(mesh_data.bed_temp);
}
```

### Step 5 : Ajouter `mesh_patterns` computed

Après le computed `mesh_stats` (après la ligne ~902), ajouter :

```javascript
self.mesh_patterns = ko.computed(function() {
    var zs = self.mesh_data();
    var xs = self.mesh_data_x();
    var ys = self.mesh_data_y();
    if (!zs.length || !xs.length || !ys.length) { return null; }

    var flat = [];
    for (var r = 0; r < zs.length; r++)
        for (var c = 0; c < zs[r].length; c++)
            flat.push(parseFloat(zs[r][c]));

    var patterns = [];

    // Uniform tilt: fit plane and check if plane tilt dominates
    var n = flat.length;
    var points = [];
    for (var r2 = 0; r2 < zs.length; r2++)
        for (var c2 = 0; c2 < zs[r2].length; c2++)
            points.push({ x: xs[c2], y: ys[r2], z: parseFloat(zs[r2][c2]) });
    var planeFn = self.fitReferencePlane(points);
    var planeResiduals = points.map(function(p) { return p.z - planeFn(p.x, p.y); });
    var residualRms = Math.sqrt(planeResiduals.reduce(function(s, v) { return s + v * v; }, 0) / planeResiduals.length);
    var totalRms = Math.sqrt(flat.reduce(function(s, v) { return s + v * v; }, 0) / flat.length);
    if (totalRms > 0.01 && residualRms < totalRms * 0.4) {
        patterns.push('Uniform tilt detected');
    }

    // Center bulge/sag: compare center mean to corner mean
    var centerRows = [Math.floor(zs.length / 2 - 0.5), Math.ceil(zs.length / 2 - 0.5)];
    var centerCols = [Math.floor(zs[0].length / 2 - 0.5), Math.ceil(zs[0].length / 2 - 0.5)];
    var centerVals = [];
    centerRows.forEach(function(r3) { centerCols.forEach(function(c3) {
        if (zs[r3] !== undefined && zs[r3][c3] !== undefined) centerVals.push(parseFloat(zs[r3][c3]));
    }); });
    var cornerVals = [
        parseFloat(zs[0][0]),
        parseFloat(zs[0][zs[0].length - 1]),
        parseFloat(zs[zs.length - 1][0]),
        parseFloat(zs[zs.length - 1][zs[0].length - 1])
    ];
    var centerMean = centerVals.reduce(function(s, v) { return s + v; }, 0) / centerVals.length;
    var cornerMean = cornerVals.reduce(function(s, v) { return s + v; }, 0) / cornerVals.length;
    var bulge = centerMean - cornerMean;
    if (Math.abs(bulge) > 0.05) {
        patterns.push(bulge > 0 ? 'Center bulge (+' + bulge.toFixed(3) + 'mm)' : 'Center sag (' + bulge.toFixed(3) + 'mm)');
    }

    // Dominant corner: find which corner is highest
    var cornerLabels = ['Front-Left', 'Front-Right', 'Back-Left', 'Back-Right'];
    var maxCornerIdx = 0;
    for (var ci = 1; ci < cornerVals.length; ci++) {
        if (Math.abs(cornerVals[ci]) > Math.abs(cornerVals[maxCornerIdx])) maxCornerIdx = ci;
    }
    if (Math.abs(cornerVals[maxCornerIdx]) > 0.05) {
        patterns.push('Dominant corner: ' + cornerLabels[maxCornerIdx] + ' (' + cornerVals[maxCornerIdx].toFixed(3) + 'mm)');
    }

    return patterns.length > 0 ? patterns : ['No significant pattern'];
}, self);
```

### Step 6 : Ajouter `screw_contribution` computed

Après `mesh_patterns`, ajouter :

```javascript
self.screw_contribution = ko.computed(function() {
    var corrections = self.screw_corrections();
    if (!corrections.length) { return []; }
    var totalAbs = corrections.reduce(function(s, sc) {
        return s + ((!sc.outOfBounds && !sc.pitchZero && !sc.refInvalid && !sc.isRef) ? Math.abs(parseFloat(sc.delta)) : 0);
    }, 0);
    if (totalAbs < 1e-9) { return corrections.map(function(sc) { return { label: sc.label, pct: 0, delta: sc.delta, tier: sc.tier }; }); }
    var ranked = corrections.map(function(sc) {
        var pct = (!sc.outOfBounds && !sc.pitchZero && !sc.refInvalid && !sc.isRef)
            ? Math.round(Math.abs(parseFloat(sc.delta)) / totalAbs * 100)
            : 0;
        return { label: sc.label, pct: pct, delta: sc.delta || '0.000', tier: sc.tier || 'ok', isRef: sc.isRef || false };
    });
    ranked.sort(function(a, b) { return b.pct - a.pct; });
    return ranked;
}, self);
```

### Step 7 : Ajouter `thermal_drift` computed

Après `screw_contribution`, ajouter :

```javascript
self.thermal_drift = ko.computed(function() {
    var hist = self.mesh_history_list();
    var cold = hist.filter(function(e) { return e.bed_temp !== null && e.bed_temp !== undefined && e.bed_temp < 40; });
    var hot  = hist.filter(function(e) { return e.bed_temp !== null && e.bed_temp !== undefined && e.bed_temp > 50; });
    if (!cold.length || !hot.length) { return null; }

    // Compute mean Z per grid cell for each group
    function gridMean(entries) {
        var rows = entries[0].mesh.length, cols = entries[0].mesh[0].length;
        var grid = [];
        for (var r = 0; r < rows; r++) {
            grid.push([]);
            for (var c = 0; c < cols; c++) {
                var vals = entries.map(function(e) { return parseFloat(e.mesh[r][c]); }).filter(function(v) { return !isNaN(v); });
                grid[r].push(vals.length ? vals.reduce(function(s, v) { return s + v; }, 0) / vals.length : 0);
            }
        }
        return grid;
    }

    try {
        var coldGrid = gridMean(cold);
        var hotGrid  = gridMean(hot);
        var diffs = [];
        for (var r2 = 0; r2 < coldGrid.length; r2++)
            for (var c2 = 0; c2 < coldGrid[r2].length; c2++)
                diffs.push(hotGrid[r2][c2] - coldGrid[r2][c2]);
        var meanDrift = diffs.reduce(function(s, v) { return s + v; }, 0) / diffs.length;
        var maxDrift  = diffs.reduce(function(a, v) { return Math.abs(v) > Math.abs(a) ? v : a; }, 0);
        return {
            cold_count: cold.length,
            hot_count: hot.length,
            mean_drift: meanDrift.toFixed(3),
            max_drift: maxDrift.toFixed(3)
        };
    } catch(e) {
        return null;
    }
}, self);
```

### Step 8 : Ajouter `mesh_diff_data` computed

Après `thermal_drift`, ajouter :

```javascript
self.mesh_diff_data = ko.computed(function() {
    var hist = self.mesh_history_list();
    var ia = parseInt(self.mesh_diff_index_a());
    var ib = parseInt(self.mesh_diff_index_b());
    if (hist.length < 2 || ia === ib || ia >= hist.length || ib >= hist.length) { return null; }
    var a = hist[ia], b = hist[ib];
    if (a.mesh.length !== b.mesh.length || a.mesh[0].length !== b.mesh[0].length) { return null; }
    var diff = a.mesh.map(function(row, r) {
        return row.map(function(z, c) { return (parseFloat(z) - parseFloat(b.mesh[r][c])).toFixed(4); });
    });
    return { diff: diff, mesh_x: a.mesh_x, mesh_y: a.mesh_y, ts_a: a.timestamp, ts_b: b.timestamp };
}, self);
```

### Step 9 : Commit

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "feat: add mesh_patterns, screw_contribution, thermal_drift, mesh_diff_data computeds"
```

---

## Task 3 : 2D Heatmap side-by-side

**Files:**
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2`
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`

### Step 1 : Modifier le tab — wrapper flex autour du graphe 3D + div heatmap

Dans `bedlevelvisualizer_tab.jinja2`, remplacer ligne 22 :

```html
<div class="row-fluid" id="bedlevelvisualizergraph" data-bind="visible: !processing(), style: {'min-height': settingsViewModel.settings.plugins.bedlevelvisualizer.graph_height()}"></div>
```

par :

```html
<div class="row-fluid" data-bind="visible: !processing()" style="display: flex; gap: 8px; align-items: stretch;">
    <div id="bedlevelvisualizergraph" style="flex: 1; min-width: 0;" data-bind="style: {'min-height': settingsViewModel.settings.plugins.bedlevelvisualizer.graph_height()}"></div>
    <div id="bedlevelvisualizerheatmap" style="flex: 1; min-width: 0;" data-bind="style: {'min-height': settingsViewModel.settings.plugins.bedlevelvisualizer.graph_height()}"></div>
</div>
```

### Step 2 : Ajouter le rendu heatmap dans `drawMesh`

Dans `bedlevelvisualizer.js`, après la ligne `Plotly.react('bedlevelvisualizergraph', data, layout, config_options).then(self.postPlotHandler);` (ligne ~487), ajouter :

```javascript
// Draw 2D heatmap side-by-side
try {
    var heatmapColorscale = self.tolerance_colorscale()
        ? [[0,"#cc3333"],[0.1,"#ee4400"],[0.3,"#ee7700"],[0.4,"#aacc00"],[0.5,"#00bb44"],[0.6,"#aacc00"],[0.7,"#ee7700"],[0.9,"#ee4400"],[1,"#cc3333"]]
        : graphcolorscale;
    var heatmapData = [{
        type: 'heatmap',
        z: mesh_data_z,
        x: mesh_data_x,
        y: mesh_data_y,
        colorscale: heatmapColorscale,
        zmin: self.tolerance_colorscale() ? toleranceZRange[0] : (self.graph_z_limits().split(",")[0] !== 'auto' ? parseFloat(self.graph_z_limits().split(",")[0]) : undefined),
        zmax: self.tolerance_colorscale() ? toleranceZRange[1] : (self.graph_z_limits().split(",")[0] !== 'auto' ? parseFloat(self.graph_z_limits().split(",")[1]) : undefined),
        colorbar: { tickfont: { color: foreground_color } },
        hoverongaps: false
    }];
    // Add screw position markers on heatmap if guide active
    if (self.screws_bed_level_guide() && self.screw_corrections().length > 0) {
        var hScrewXs = [], hScrewYs = [], hScrewTexts = [], hScrewColors = [];
        var hCorrections = self.screw_corrections();
        for (var hsi = 0; hsi < hCorrections.length; hsi++) {
            var hsc = hCorrections[hsi];
            if (!hsc.outOfBounds && !hsc.refInvalid && !hsc.pitchZero) {
                hScrewXs.push(hsc.x);
                hScrewYs.push(hsc.y);
                hScrewColors.push(hsc.tier === 'critical' ? '#ee4444' : hsc.tier === 'warn' ? '#ff9900' : '#44dd66');
                var hbadge = hsc.isRef ? 'REF' : (hsc.ok ? '\u2713' : (hsc.tighten ? '\u21bb' : '\u21ba') + ' ' + hsc.turns);
                hScrewTexts.push(hsc.label + '<br>' + hbadge);
            }
        }
        if (hScrewXs.length > 0) {
            heatmapData.push({
                type: 'scatter',
                mode: 'markers+text',
                x: hScrewXs,
                y: hScrewYs,
                text: hScrewTexts,
                textposition: 'top center',
                hoverinfo: 'text',
                marker: { size: 10, color: hScrewColors, line: { color: '#fff', width: 1.5 } },
                showlegend: false
            });
        }
    }
    var heatmapLayout = {
        autosize: true,
        plot_bgcolor: background_color,
        paper_bgcolor: background_color,
        margin: { l: 40, r: 10, b: 40, t: 20 },
        xaxis: { color: foreground_color, title: 'X (mm)' },
        yaxis: { color: foreground_color, title: 'Y (mm)' }
    };
    Plotly.react('bedlevelvisualizerheatmap', heatmapData, heatmapLayout, { displaylogo: false, responsive: true });
} catch(hErr) {
    console.warn('Heatmap render error:', hErr);
}
```

**Important:** La variable `toleranceZRange` est déjà définie plus haut dans `drawMesh` (ligne ~288). La variable `graphcolorscale` aussi (ligne ~286). `background_color` et `foreground_color` sont définis à la ligne ~353. Ce bloc doit être placé APRÈS ces définitions.

### Step 3 : Commit

```bash
git add octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2 octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "feat: add 2D heatmap side-by-side with 3D Plotly graph, with screw markers"
```

---

## Task 4 : P-P evolution chart + mesh diff UI + alert settings

**Files:**
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2`
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`

### Step 1 : Ajouter la fonction `drawPPChart` dans le JS

Après `self.restoreHistoryMesh` (ligne ~924-930), ajouter :

```javascript
self.drawPPChart = function() {
    var hist = self.mesh_history_list();
    if (!hist.length) { return; }
    var timestamps = hist.map(function(e) { return e.timestamp; }).reverse();
    var ppValues   = hist.map(function(e) { return parseFloat(e.pp); }).reverse();
    var colors = ppValues.map(function(v) { return v < 0.05 ? '#55cc55' : v < 0.1 ? '#aacc00' : v < 0.2 ? '#ff9900' : '#ee4444'; });
    var ppTrace = {
        x: timestamps,
        y: ppValues,
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#4af', width: 2 },
        marker: { color: colors, size: 8 },
        name: 'P-P (mm)',
        hoverinfo: 'x+y'
    };
    var background_color = $('#tabs_content').css('background-color') || '#1a1a1a';
    var foreground_color = $('#tabs_content').css('color') || '#cccccc';
    var ppLayout = {
        autosize: true,
        plot_bgcolor: background_color,
        paper_bgcolor: background_color,
        margin: { l: 50, r: 20, b: 80, t: 20 },
        xaxis: { color: foreground_color, tickangle: -40, automargin: true },
        yaxis: { color: foreground_color, title: 'P-P (mm)', rangemode: 'tozero' },
        shapes: [
            { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0.05, y1: 0.05, line: { color: '#55cc55', dash: 'dot', width: 1 } },
            { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0.1,  y1: 0.1,  line: { color: '#aacc00', dash: 'dot', width: 1 } },
            { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0.2,  y1: 0.2,  line: { color: '#ff9900', dash: 'dot', width: 1 } }
        ]
    };
    Plotly.react('bedlevelvisualizer_pp_chart', [ppTrace], ppLayout, { displaylogo: false, responsive: true });
};

self.drawDiffChart = function() {
    var diffData = self.mesh_diff_data();
    if (!diffData) { return; }
    var diffTrace = {
        type: 'surface',
        z: diffData.diff,
        x: diffData.mesh_x,
        y: diffData.mesh_y,
        colorscale: [[0,"#cc3333"],[0.25,"#ee7700"],[0.5,"#00bb44"],[0.75,"#ee7700"],[1,"#cc3333"]],
        colorbar: { tickfont: { color: '#cccccc' } }
    };
    var background_color = $('#tabs_content').css('background-color') || '#1a1a1a';
    var foreground_color = $('#tabs_content').css('color') || '#cccccc';
    var diffLayout = {
        autosize: true,
        plot_bgcolor: background_color,
        paper_bgcolor: background_color,
        margin: { l: 0, r: 0, b: 0, t: 40 },
        title: { text: 'Diff: ' + diffData.ts_a + ' vs ' + diffData.ts_b, font: { color: foreground_color, size: 11 } },
        scene: {
            xaxis: { color: foreground_color },
            yaxis: { color: foreground_color },
            zaxis: { color: foreground_color }
        }
    };
    Plotly.react('bedlevelvisualizer_diff_chart', [diffTrace], diffLayout, { displaylogo: false, responsive: true });
};
```

### Step 2 : Ajouter le bloc P-P evolution chart dans l'onglet "Data" des settings

Dans `bedlevelvisualizer_settings.jinja2`, dans `<div id="bedlevelvisualizer_stored_data" class="tab-pane">`, après la div `row-fluid` avec les checkboxes (ligne ~158, après `</div>` qui ferme le row avec Display/Descending), remplacer `</div>` (fin du tab-pane ligne 159) par :

```html
    <!-- P-P Evolution Chart -->
    <hr/>
    <div class="row-fluid" style="padding-top: 5px;">
        <div class="control-group">
            <label style="font-weight: bold; margin-bottom: 4px; display: block;">
                <i class="fa fa-line-chart"></i> P-P Evolution
            </label>
            <!-- ko if: $root.mesh_history_list().length < 2 -->
            <p class="muted" style="font-size: 12px;">At least 2 mesh entries required for the chart.</p>
            <!-- /ko -->
            <!-- ko if: $root.mesh_history_list().length >= 2 -->
            <div>
                <button class="btn btn-mini" data-bind="click: $root.drawPPChart">
                    <i class="fa fa-refresh"></i> Draw / Refresh
                </button>
            </div>
            <div id="bedlevelvisualizer_pp_chart" style="height: 200px; margin-top: 8px;"></div>
            <!-- /ko -->
        </div>
    </div>
    <!-- Mesh Diff -->
    <hr/>
    <div class="row-fluid" style="padding-top: 5px;">
        <div class="control-group">
            <label style="font-weight: bold; margin-bottom: 4px; display: block;">
                <i class="fa fa-exchange"></i> Mesh Diff
            </label>
            <!-- ko if: $root.mesh_history_list().length < 2 -->
            <p class="muted" style="font-size: 12px;">At least 2 mesh entries required.</p>
            <!-- /ko -->
            <!-- ko if: $root.mesh_history_list().length >= 2 -->
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <span style="font-size: 11px; color: #888;">Mesh A:</span>
                <select data-bind="value: $root.mesh_diff_index_a,
                                   foreach: $root.mesh_history_list">
                    <option data-bind="text: timestamp + ' (P-P: ' + pp + 'mm)', value: $index()"></option>
                </select>
                <span style="font-size: 11px; color: #888;">vs B:</span>
                <select data-bind="value: $root.mesh_diff_index_b,
                                   foreach: $root.mesh_history_list">
                    <option data-bind="text: timestamp + ' (P-P: ' + pp + 'mm)', value: $index()"></option>
                </select>
                <button class="btn btn-mini btn-primary"
                        data-bind="click: $root.drawDiffChart,
                                   enable: $root.mesh_diff_data() !== null">
                    <i class="fa fa-eye"></i> Compare
                </button>
            </div>
            <!-- ko if: $root.mesh_diff_data() -->
            <div id="bedlevelvisualizer_diff_chart" style="height: 250px; margin-top: 8px;"></div>
            <!-- /ko -->
            <!-- ko ifnot: $root.mesh_diff_data() -->
            <p class="muted" style="font-size: 11px; margin-top: 4px;">Select two different entries to compare.</p>
            <!-- /ko -->
        </div>
    </div>
</div>
```

**Important:** Ce bloc REMPLACE le `</div>` fermant du tab-pane `bedlevelvisualizer_stored_data` à la ligne 159. Le `</div>` final ci-dessus ferme le tab-pane.

### Step 3 : Ajouter les alert settings dans l'onglet "Corrections" des settings

Dans `bedlevelvisualizer_settings.jinja2`, l'onglet Corrections se termine par `</div>` à la ligne 335. Avant ce `</div>` final, insérer :

```html
                <!-- Pre-print alert settings -->
                <hr/>
                <div class="row-fluid" style="padding-top: 5px;">
                    <div class="control-group span12">
                        <label style="font-weight: bold; margin-bottom: 4px; display: block;">Pre-print Alerts</label>
                        <input class="input-checkbox" type="checkbox"
                               data-bind="checked: settingsViewModel.settings.plugins.bedlevelvisualizer.print_start_alert"
                               style="display: inline-block; margin-bottom: 5px;"/> Enable pre-print mesh alerts
                    </div>
                    <div class="control-group span12" style="margin-top: 4px;"
                         data-bind="visible: settingsViewModel.settings.plugins.bedlevelvisualizer.print_start_alert()">
                        <div class="input-prepend input-append" style="margin-bottom: 4px;">
                            <span class="add-on">P-P alert threshold</span>
                            <input type="number" min="0.01" max="5" step="0.05" class="input-mini text-right"
                                   data-bind="value: settingsViewModel.settings.plugins.bedlevelvisualizer.print_start_alert_threshold"/>
                            <span class="add-on">mm</span>
                        </div>
                        <div class="input-prepend input-append">
                            <span class="add-on">Mesh freshness</span>
                            <input type="number" min="1" max="720" step="1" class="input-mini text-right"
                                   data-bind="value: settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_freshness_hours"/>
                            <span class="add-on">hours</span>
                        </div>
                        <small class="help-block" style="margin-top: 4px;">
                            Alert if P-P exceeds threshold or mesh is older than specified hours when a print starts.
                        </small>
                    </div>
                </div>
```

### Step 4 : Commit

```bash
git add octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2 octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "feat: add P-P evolution chart, mesh diff UI, pre-print alert settings"
```

---

## Task 5 : Tab HTML — patterns, ranking, Klipper, M420 V

**Files:**
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2`

### Step 1 : Ajouter le bloc patterns + thermal drift sous les stats

Dans `bedlevelvisualizer_tab.jinja2`, après `<!-- /ko -->` qui ferme le bloc `mesh_stats` (ligne ~62), ajouter :

```html
<!-- Pattern Detection & Thermal Drift -->
<!-- ko if: $root.mesh_patterns() -->
<div class="row-fluid" style="padding-top: 4px; padding-bottom: 4px;">
    <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 10px;">
        <div style="font-weight: bold; color: #aaa; margin-right: 4px;">
            <i class="fa fa-search"></i> Patterns
        </div>
        <!-- ko foreach: $root.mesh_patterns() -->
        <div style="background: #1a1a1a; border: 1px solid #444; border-radius: 3px; padding: 2px 7px; color: #ccc;"
             data-bind="text: $data"></div>
        <!-- /ko -->
    </div>
</div>
<!-- /ko -->
<!-- ko if: $root.thermal_drift() -->
<div class="row-fluid" style="padding-bottom: 4px;">
    <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 10px;">
        <div style="font-weight: bold; color: #aaa; margin-right: 4px;">
            <i class="fa fa-thermometer-half"></i> Thermal drift
        </div>
        <div style="background: #1a1a1a; border: 1px solid #444; border-radius: 3px; padding: 2px 7px;"
             data-bind="text: 'Mean: ' + $root.thermal_drift().mean_drift + 'mm'"></div>
        <div style="background: #1a1a1a; border: 1px solid #444; border-radius: 3px; padding: 2px 7px;"
             data-bind="text: 'Max: ' + $root.thermal_drift().max_drift + 'mm'"></div>
        <div style="color: #888;"
             data-bind="text: '(' + $root.thermal_drift().cold_count + ' cold / ' + $root.thermal_drift().hot_count + ' hot mesh)'"></div>
    </div>
</div>
<!-- /ko -->
```

### Step 2 : Ajouter le bouton M420 V

Dans `bedlevelvisualizer_tab.jinja2`, dans `<div id="bedlevelvisualizerbutton" ...>`, après le bouton "Update Mesh Now" et avant `</div>`, ajouter :

```html
<button class="btn btn-mini" style="margin-left: 6px;"
        data-bind="click: function(){ OctoPrint.control.sendGcode(['M420 V']); },
                   enable: $root.controlViewModel.isOperational() && !$root.processing()"
        title="Request Marlin M420 V — dumps stored bed mesh to terminal (re-parses it)">
    M420 V
</button>
```

Localiser le `</div>` du bouton de commit: ligne 24, le `<div class="row-fluid" id="bedlevelvisualizerbutton"...>` se termine par `</div>`. Trouver le bouton admin settings à droite (`pull-right`). Ajouter le bouton M420 V juste avant ce bouton pull-right.

### Step 3 : Ajouter le bloc screw contribution ranking dans le screw guide

Dans `bedlevelvisualizer_tab.jinja2`, après `<!-- /ko -->` qui ferme `$root.screws_bed_level_guide() && ...` (ligne 182), MAIS à l'intérieur de ce bloc, juste avant la fermeture `<!-- /ko -->` finale, ajouter (à l'intérieur du `<!-- ko if: $root.screws_bed_level_guide() && ... -->`):

Chercher le commentaire `<!-- /ko -->` qui ferme le bloc screw guide principal (ligne 182). La structure est :
```
<!-- ko if: $root.screws_bed_level_guide() && $root.screw_corrections().length > 0 -->
    <div class="row-fluid" ...>  <!-- screw guide div -->
        ... screw cards ...
    </div>
<!-- /ko -->
```

Insérer ce bloc AVANT le `</div>` qui ferme le `<div class="row-fluid" style="padding-top: 12px;">` du screw guide (avant la ligne 181 `</div>`):

```html
        <!-- Screw Contribution Ranking -->
        <!-- ko if: $root.screw_contribution().length > 0 -->
        <div style="margin-top: 12px;">
            <div style="font-size: 10px; font-weight: bold; color: #888; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px;">
                Deviation ranking
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                <!-- ko foreach: $root.screw_contribution() -->
                <!-- ko ifnot: isRef -->
                <div style="background: #1a1a1a; border-radius: 4px; padding: 2px 8px; font-size: 10px; border: 1px solid #333;">
                    <span style="color: #888;" data-bind="text: label"></span>
                    <span style="margin-left: 4px; font-weight: bold;"
                          data-bind="text: pct + '%',
                                     style: { color: tier === 'critical' ? '#ee4444' : tier === 'warn' ? '#ff9900' : '#55cc55' }"></span>
                    <span style="color: #666; margin-left: 2px;" data-bind="text: '(' + delta + 'mm)'"></span>
                </div>
                <!-- /ko -->
                <!-- ko if: isRef -->
                <div style="background: #1a1a1a; border-radius: 4px; padding: 2px 8px; font-size: 10px; border: 1px solid #555; color: #888;">
                    <span data-bind="text: label"></span>
                    <span style="margin-left: 4px; color: #aaa;">REF</span>
                </div>
                <!-- /ko -->
                <!-- /ko -->
            </div>
        </div>
        <!-- /ko -->
        <!-- Klipper SCREWS_TILT_CALCULATE results -->
        <!-- ko if: Object.keys($root.klipper_screw_results()).length > 0 -->
        <div style="margin-top: 10px;">
            <div style="font-size: 10px; font-weight: bold; color: #888; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px;">
                Klipper screw tilt results
                <button class="btn btn-mini" style="margin-left: 8px;"
                        data-bind="click: function(){ $root.klipper_screw_results({}); }">
                    <i class="fa fa-times"></i>
                </button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                <!-- ko foreach: Object.values($root.klipper_screw_results()) -->
                <div style="background: #1a1a1a; border-radius: 4px; padding: 2px 8px; font-size: 10px; border: 1px solid #333;">
                    <span style="color: #888;" data-bind="text: name"></span>
                    <span style="margin-left: 4px; font-weight: bold; color: #4af;"
                          data-bind="text: direction + ' ' + amount"></span>
                    <span style="color: #666; margin-left: 2px;" data-bind="text: '(z=' + z.toFixed(3) + ')'"></span>
                </div>
                <!-- /ko -->
            </div>
        </div>
        <!-- /ko -->
```

**Note KO:** `Object.keys()` et `Object.values()` ne sont pas directement observables dans KO foreach. Pour les Klipper results, utiliser un computed array :

Ajouter dans le JS (Task 2 Step 1 étendu, dans `__init__` des observables) :

```javascript
self.klipper_screw_results_array = ko.computed(function() {
    return Object.values(self.klipper_screw_results());
}, self);
```

Et dans le template remplacer `Object.keys($root.klipper_screw_results()).length > 0` par `$root.klipper_screw_results_array().length > 0` et `foreach: Object.values(...)` par `foreach: $root.klipper_screw_results_array`.

### Step 4 : Commit

```bash
git add octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2 octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "feat: add pattern detection display, screw ranking, Klipper results, M420 V button"
```

---

## Notes d'implémentation importantes

### Ordre de placement du code JS

Dans `drawMesh`, les variables `toleranceZRange`, `graphcolorscale`, `background_color`, `foreground_color` sont définies AVANT le `Plotly.react(...)`. Le bloc heatmap (Task 3 Step 2) doit être placé APRÈS `Plotly.react('bedlevelvisualizergraph', ...)` et AVANT le `} catch(err)` de fermeture.

### Correctif pour `foreach: Object.values(...)` dans KO

KO ne peut pas itérer sur `Object.values()` directement dans un binding `foreach` si l'objet n'est pas observableArray. Le computed `klipper_screw_results_array` (Task 5 Step 3) doit être ajouté dans la même session que Task 2 Step 1.

### Test des alertes pré-impression

Tester l'alerte pré-impression en déclenchant un `PRINT_STARTED` event manuellement via OctoPrint API n'est pas trivial. Le moyen le plus simple est de lancer une impression simulée avec un mesh P-P > threshold configuré.

### Marlin M420 V

M420 V demande à Marlin d'envoyer la mesh stockée en EEPROM sur le terminal. Le plugin parse déjà ces lignes si elles ressemblent à du mesh data. Pas de parsing supplémentaire nécessaire.
