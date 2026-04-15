# Advanced Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter statistiques de planéité, vis sur le graphe Plotly, workflow de sondage individuel par vis (move → probe → adjust → verify), et historique des mesh.

**Architecture:** Features A-B pures JS. Feature C (probe workflow) nécessite un hook Python pour parser G30. Feature D (historique) étend le stockage des settings. Tout est réactif via KO computed.

**Tech Stack:** Python (OctoPrint hooks), JavaScript (KnockoutJS + Plotly), Jinja2/Bootstrap2

---

## Contexte — état actuel

- `__init__.py` : `MAX_HISTORY = 10` existe (ligne 25), `process_gcode` hook existe, `re` est importé
- `bedlevelvisualizer.js` : `screw_corrections` computed retourne tableau avec `{label, x, y, z, delta, turns, ok, tier, isRef, tighten, outOfBounds, pitchZero, refInvalid}`
- `bedlevelvisualizer_tab.jinja2` : section screw guide lines 25-92, grille de cartes `foreach: $root.screw_corrections`
- `OctoPrint.control.sendGcode(["..."])` déjà utilisé dans `drawMesh` (ligne ~326)
- `self.controlViewModel.isOperational()` disponible dans le template

---

## Fichiers modifiés

| Fichier | Rôle |
|---|---|
| `octoprint_bedlevelvisualizer/__init__.py` | +regex G30 + parsing probe_result + mesh_history setting |
| `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` | +mesh_stats, +scatter3d, +probe workflow state machine, +mesh history |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` | +stats block, +boutons cartes, +barre progression workflow |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2` | +historique dans onglet Stored Data |

---

## Task 1 : Statistiques de planéité (JS + HTML)

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2`

### Step 1 : Ajouter `mesh_stats` computed après `screw_corrections`

Après `}, self);` qui ferme `screw_corrections`, ajouter :

```javascript
self.mesh_stats = ko.computed(function() {
    var zs = self.mesh_data();
    if (!zs.length) { return null; }
    var flat = [];
    for (var r = 0; r < zs.length; r++) {
        for (var c = 0; c < zs[r].length; c++) {
            flat.push(parseFloat(zs[r][c]));
        }
    }
    if (!flat.length) { return null; }
    var min = flat[0], max = flat[0], sum = 0, sumSq = 0;
    for (var i = 0; i < flat.length; i++) {
        if (flat[i] < min) min = flat[i];
        if (flat[i] > max) max = flat[i];
        sum += flat[i];
        sumSq += flat[i] * flat[i];
    }
    var mean = sum / flat.length;
    var rms = Math.sqrt(sumSq / flat.length);
    var pp = max - min;
    var nOk = 0, nWarn = 0, nCrit = 0;
    for (var j = 0; j < flat.length; j++) {
        var az = Math.abs(flat[j]);
        if (az < 0.05) nOk++;
        else if (az < 0.2) nWarn++;
        else nCrit++;
    }
    var n = flat.length;
    var grade = pp < 0.05 ? 'A' : pp < 0.1 ? 'B' : pp < 0.2 ? 'C' : 'D';
    return {
        pp: pp.toFixed(3),
        rms: rms.toFixed(3),
        mean: mean.toFixed(3),
        pctOk: Math.round(nOk / n * 100),
        pctWarn: Math.round(nWarn / n * 100),
        pctCrit: Math.round(nCrit / n * 100),
        grade: grade
    };
}, self);
```

- [ ] **Step 2 : Ajouter le bloc stats dans le tab, sous le graphe, avant le guide des vis**

Dans `bedlevelvisualizer_tab.jinja2`, après le div `id="bedlevelvisualizergraph"` (ligne ~22) et avant la section `<!-- Screw Adjustment Guide -->` (ligne ~25), ajouter :

```html
<!-- Mesh Statistics -->
<!-- ko if: $root.mesh_stats() -->
<div class="row-fluid" style="padding-top: 8px; padding-bottom: 4px;">
    <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 11px;">
        <div style="font-weight: bold; color: #aaa; margin-right: 4px;">
            <i class="fa fa-bar-chart"></i> Flatness
        </div>
        <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 3px 8px;">
            <span style="color: #888;">P-P</span>
            <span style="font-weight: bold; margin-left: 4px;"
                  data-bind="text: $root.mesh_stats().pp + 'mm',
                             style: { color: parseFloat($root.mesh_stats().pp) < 0.05 ? '#5c5' :
                                            parseFloat($root.mesh_stats().pp) < 0.2  ? '#f90' : '#e44' }"></span>
        </div>
        <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 3px 8px;">
            <span style="color: #888;">RMS</span>
            <span style="font-weight: bold; margin-left: 4px;"
                  data-bind="text: $root.mesh_stats().rms + 'mm'"></span>
        </div>
        <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 3px 8px;">
            <span style="color: #888; font-size:10px;">OK</span>
            <span style="color: #5c5; font-weight: bold; margin-left: 2px;"
                  data-bind="text: $root.mesh_stats().pctOk + '%'"></span>
            <span style="color: #f90; margin-left: 4px; font-weight: bold;"
                  data-bind="text: $root.mesh_stats().pctWarn + '%'"></span>
            <span style="color: #e44; margin-left: 4px; font-weight: bold;"
                  data-bind="text: $root.mesh_stats().pctCrit + '%'"></span>
        </div>
        <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 3px 10px; font-size: 13px; font-weight: bold;"
             data-bind="text: $root.mesh_stats().grade,
                        style: { color: $root.mesh_stats().grade === 'A' ? '#5c5' :
                                        $root.mesh_stats().grade === 'B' ? '#aacc00' :
                                        $root.mesh_stats().grade === 'C' ? '#f90' : '#e44',
                                 borderColor: $root.mesh_stats().grade === 'A' ? '#336633' :
                                              $root.mesh_stats().grade === 'B' ? '#445500' :
                                              $root.mesh_stats().grade === 'C' ? '#664400' : '#660000' }"></div>
    </div>
</div>
<!-- /ko -->
```

- [ ] **Step 3 : Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2
git commit -m "feat: add mesh flatness statistics (P-P, RMS, tier %, grade A-D) under graph"
```

---

## Task 2 : Vis sur le graphe Plotly (scatter3d)

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`

Quand `screws_bed_level_guide()` est actif ET `screw_corrections()` est non vide, ajouter une trace `scatter3d` sur le graphe Plotly pour marquer les positions des vis.

- [ ] **Step 1 : Ajouter la trace scatter3d dans `drawMesh`**

Dans `drawMesh`, après `var data = [{ z: mesh_data_z, ... }];` (après la fermeture de `]`), ajouter :

```javascript
// Add screw position markers if guide is active
if (self.screws_bed_level_guide() && self.screw_corrections().length > 0) {
    var screwXs = [], screwYs = [], screwZs = [], screwTexts = [], screwColors = [];
    var corrections = self.screw_corrections();
    for (var si = 0; si < corrections.length; si++) {
        var sc = corrections[si];
        if (!sc.outOfBounds && !sc.refInvalid && !sc.pitchZero) {
            screwXs.push(sc.x);
            screwYs.push(sc.y);
            screwZs.push(parseFloat(sc.z) || 0);
            var badge = sc.isRef ? 'REF' : (sc.ok ? '✓' : (sc.tighten ? '↻' : '↺') + sc.turns);
            screwTexts.push(sc.label + '<br>' + badge + '<br>Z=' + sc.z + 'mm');
            screwColors.push(sc.tier === 'critical' ? '#ee4444' : sc.tier === 'warn' ? '#ff9900' : '#44dd66');
        }
    }
    if (screwXs.length > 0) {
        data.push({
            type: 'scatter3d',
            mode: 'markers+text',
            x: screwXs,
            y: screwYs,
            z: screwZs,
            text: screwTexts,
            textposition: 'top center',
            hoverinfo: 'text',
            marker: {
                size: 8,
                color: screwColors,
                symbol: 'circle',
                line: { color: '#ffffff', width: 1 }
            },
            showlegend: false
        });
    }
}
```

- [ ] **Step 2 : Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "feat: add screw position markers (scatter3d) on Plotly graph with tier colors"
```

---

## Task 3 : Python — Parser G30 probe result

**Files:**
- Modify: `octoprint_bedlevelvisualizer/__init__.py`

La réponse Marlin à `G30 Xx Yy` est : `Bed X: 30.00 Y: 30.00 Z: 0.125`

- [ ] **Step 1 : Ajouter `regex_probe_result` dans `__init__()`**

Dans `__init__()`, après `self.regex_mesh_data_extraction = re.compile(...)` (ligne ~56), ajouter :

```python
self.regex_probe_result = re.compile(
    r"Bed X:\s*([-\d.]+)\s+Y:\s*([-\d.]+)\s+Z:\s*([-\d.]+)"
)
```

- [ ] **Step 2 : Détecter et envoyer le probe_result dans `process_gcode`**

Dans `process_gcode`, AVANT la ligne `if not self.processing:` (ligne ~242), ajouter :

```python
# Detect single-point probe result (G30 response — Marlin)
probe_match = self.regex_probe_result.search(line)
if probe_match:
    try:
        px = float(probe_match.group(1))
        py = float(probe_match.group(2))
        pz = float(probe_match.group(3))
        self._plugin_manager.send_plugin_message(
            self._identifier,
            {"probe_result": {"x": px, "y": py, "z": pz}}
        )
    except (ValueError, IndexError):
        pass
    return line
```

- [ ] **Step 3 : Commit**

```bash
git add octoprint_bedlevelvisualizer/__init__.py
git commit -m "feat: parse Marlin G30 probe result and send probe_result plugin message"
```

---

## Task 4 : JS — Stockage des probe results + mise à jour des corrections

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`

- [ ] **Step 1 : Ajouter observables pour le workflow**

Après `self.bed_info = ko.observable({});`, ajouter :

```javascript
self.screw_probe_results = ko.observable({});  // keyed by "x,y" -> {z, timestamp}
self.screw_workflow_active = ko.observable(false);
self.screw_workflow_step = ko.observable(-1);  // -1=idle, 0..N-1=moving to screw, N=all done
```

- [ ] **Step 2 : Ajouter `handleProbeResult` et helpers workflow**

Après `self.removeScrew`, ajouter :

```javascript
self.handleProbeResult = function(result) {
    var key = result.x + ',' + result.y;
    var current = self.screw_probe_results();
    current[key] = { z: result.z, timestamp: new Date().toLocaleTimeString() };
    self.screw_probe_results(Object.assign({}, current)); // trigger KO update

    // Auto-advance workflow if active
    if (self.screw_workflow_active()) {
        var step = self.screw_workflow_step();
        var screws = self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws();
        var nextStep = step + 1;
        if (nextStep < screws.length) {
            self.screw_workflow_step(nextStep);
            var next = screws[nextStep];
            var nx = parseFloat(ko.unwrap(next.x));
            var ny = parseFloat(ko.unwrap(next.y));
            OctoPrint.control.sendGcode(['G0 X' + nx + ' Y' + ny + ' F4000']);
        } else {
            self.screw_workflow_step(screws.length); // done
        }
    }
};

self.startScrewWorkflow = function() {
    var screws = self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws();
    if (!screws.length) { return; }
    self.screw_probe_results({});
    self.screw_workflow_step(0);
    self.screw_workflow_active(true);
    var first = screws[0];
    var fx = parseFloat(ko.unwrap(first.x));
    var fy = parseFloat(ko.unwrap(first.y));
    OctoPrint.control.sendGcode(['G0 X' + fx + ' Y' + fy + ' F4000']);
};

self.stopScrewWorkflow = function() {
    self.screw_workflow_active(false);
    self.screw_workflow_step(-1);
};

self.probeCurrentScrew = function(screw) {
    var x = parseFloat(ko.unwrap(screw.x));
    var y = parseFloat(ko.unwrap(screw.y));
    OctoPrint.control.sendGcode(['G30 X' + x + ' Y' + y]);
};

self.moveToScrew = function(screw) {
    var x = parseFloat(ko.unwrap(screw.x));
    var y = parseFloat(ko.unwrap(screw.y));
    OctoPrint.control.sendGcode(['G0 X' + x + ' Y' + y + ' F4000']);
};
```

- [ ] **Step 3 : Brancher `handleProbeResult` dans `onDataUpdaterPluginMessage`**

Dans `onDataUpdaterPluginMessage` (début de la fonction, avant la gestion de `mesh_data.BLV`), ajouter :

```javascript
if (data.probe_result) {
    self.handleProbeResult(data.probe_result);
    return;
}
```

- [ ] **Step 4 : Mettre à jour `screw_corrections` pour utiliser les probe results**

Dans `screw_corrections`, dans la Pass 1 (interpolation Z), dans le `arrayMap`, APRÈS le calcul `bilinearInterpolate`, ajouter une logique pour utiliser le probe result si disponible :

```javascript
// Use live probe result if available (overrides mesh interpolation)
var probeKey = x + ',' + y;
var probeResults = self.screw_probe_results();
var probeEntry = probeResults[probeKey];
var zValue, isProbed;
if (probeEntry !== undefined) {
    zValue = probeEntry.z;
    isProbed = true;
} else if (!result.outOfBounds) {
    zValue = result.z;
    isProbed = false;
}
return {
    label: label, x: x, y: y,
    z: (zValue !== undefined) ? zValue : null,
    outOfBounds: (probeEntry === undefined) ? result.outOfBounds : false,
    isProbed: isProbed || false,
    probedAt: probeEntry ? probeEntry.timestamp : null
};
```

Attention : la Pass 1 doit aussi lire `self.screw_probe_results()` pour créer une dépendance KO — ainsi `screw_corrections` se recalcule à chaque nouveau probe result.

Dans l'en-tête de `screw_corrections`, après `var bed = self.bed_info();`, ajouter :
```javascript
var probeResults = self.screw_probe_results(); // KO dependency
```

Et dans le `arrayMap` de la Pass 1, remplacer les lignes :
```javascript
var result = self.bilinearInterpolate(ix, iy, xs, ys, zs);
return {
    label: label, x: x, y: y,
    z: result.outOfBounds ? null : result.z,
    outOfBounds: result.outOfBounds
};
```
par :
```javascript
var result = self.bilinearInterpolate(ix, iy, xs, ys, zs);
var probeKey = x + ',' + y;
var probeEntry = probeResults[probeKey];
var zValue = (probeEntry !== undefined) ? probeEntry.z : (result.outOfBounds ? null : result.z);
var outOfBounds = (probeEntry !== undefined) ? false : result.outOfBounds;
return {
    label: label, x: x, y: y,
    z: zValue,
    outOfBounds: outOfBounds,
    isProbed: (probeEntry !== undefined),
    probedAt: probeEntry ? probeEntry.timestamp : null
};
```

Et dans l'objet retourné de la Pass 3, ajouter `isProbed: entry.isProbed, probedAt: entry.probedAt`.

- [ ] **Step 5 : Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "feat: add probe workflow state machine and live probe result integration in screw_corrections"
```

---

## Task 5 : HTML — Boutons Move/Probe + barre progression workflow

**Files:**
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2`

- [ ] **Step 1 : Ajouter la barre de progression du workflow sous le titre "Screw Adjustment Guide"**

Dans la section `<!-- Screw Adjustment Guide -->`, après le bloc `<!-- ko if: $root.screw_reference_mode() !== 'zero' -->` (ligne ~37), ajouter :

```html
<!-- Workflow controls -->
<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
    <!-- ko ifnot: $root.screw_workflow_active() -->
    <button class="btn btn-mini btn-primary"
            data-bind="click: $root.startScrewWorkflow,
                       enable: $root.controlViewModel.isOperational() && !$root.processing() && $root.screw_corrections().length > 0"
            title="Move to each screw, probe, then verify globally">
        <i class="fa fa-play"></i> Start screw workflow
    </button>
    <!-- /ko -->
    <!-- ko if: $root.screw_workflow_active() -->
    <button class="btn btn-mini btn-danger"
            data-bind="click: $root.stopScrewWorkflow">
        <i class="fa fa-stop"></i> Stop
    </button>
    <span style="font-size: 10px; color: #aaa;"
          data-bind="text: $root.screw_workflow_step() < $root.screw_corrections().length
              ? 'Step ' + ($root.screw_workflow_step() + 1) + '/' + $root.screw_corrections().length + ' — adjust then probe'
              : 'All screws probed ✓'"></span>
    <!-- /ko -->
    <!-- ko if: $root.screw_workflow_step() >= $root.screw_corrections().length && !$root.screw_workflow_active() || $root.screw_workflow_step() >= $root.screw_corrections().length -->
    <button class="btn btn-mini btn-success"
            data-bind="click: $root.updateMesh,
                       enable: $root.controlViewModel.isOperational() && !$root.processing()"
            title="Run a full mesh update to verify the result globally">
        <i class="fa fa-check-circle"></i> Global mesh verify
    </button>
    <!-- /ko -->
</div>
```

- [ ] **Step 2 : Ajouter les boutons Move/Probe sur chaque carte de vis**

Dans le `foreach: $root.screw_corrections`, à la fin du contenu de chaque carte (avant le `</div>` de la carte), ajouter :

```html
<!-- Action buttons -->
<div style="display: flex; gap: 4px; justify-content: center; margin-top: 8px; flex-wrap: wrap;"
     data-bind="with: $root.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws()[$index()]">
    <button class="btn btn-mini"
            data-bind="click: $root.moveToScrew,
                       enable: $root.controlViewModel.isOperational() && !$root.processing()"
            title="Move nozzle above this screw">
        <i class="fa fa-crosshairs"></i> Move
    </button>
    <button class="btn btn-mini btn-info"
            data-bind="click: $root.probeCurrentScrew,
                       enable: $root.controlViewModel.isOperational() && !$root.processing()"
            title="Probe Z at this screw position (G30)">
        <i class="fa fa-dot-circle-o"></i> Probe
    </button>
</div>
```

**Note :** `$index()` est disponible dans le contexte `foreach`. Le `with:` permet de passer l'objet screw (depuis `bed_level_screws`) à `moveToScrew`/`probeCurrentScrew` qui en ont besoin.

Alternative plus simple si le `with:` cause des problèmes de scope :

```html
<div style="display: flex; gap: 4px; justify-content: center; margin-top: 8px;">
    <button class="btn btn-mini"
            data-bind="click: function(){ $root.moveToScrew($root.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws()[$index()]); },
                       enable: $root.controlViewModel.isOperational() && !$root.processing()"
            title="Move nozzle above this screw">
        <i class="fa fa-crosshairs"></i> Move
    </button>
    <button class="btn btn-mini btn-info"
            data-bind="click: function(){ $root.probeCurrentScrew($root.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws()[$index()]); },
                       enable: $root.controlViewModel.isOperational() && !$root.processing()"
            title="Probe Z at this screw position (G30)">
        <i class="fa fa-dot-circle-o"></i> Probe
    </button>
</div>
```

- [ ] **Step 3 : Afficher le timestamp du dernier probe sur la carte**

Dans le bloc `<!-- ko if: !outOfBounds && !refInvalid && !pitchZero && ok -->` et le bloc `!ok`, ajouter après le div Z :

```html
<!-- ko if: isProbed -->
<div style="color: #4af; font-size: 9px; margin-top: 2px;"
     data-bind="text: '⊙ probed ' + probedAt"></div>
<!-- /ko -->
```

- [ ] **Step 4 : Commit**

```bash
git add octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2
git commit -m "feat: add Move/Probe buttons, workflow progress bar, and probed timestamp on screw cards"
```

---

## Task 6 : Historique des mesh

**Files:**
- Modify: `octoprint_bedlevelvisualizer/__init__.py`
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2`

- [ ] **Step 1 : Ajouter `mesh_history=[]` dans `get_settings_defaults()`**

Dans `__init__.py`, dans `get_settings_defaults()`, après `tolerance_colorscale=False,`, ajouter :

```python
mesh_history=[],
```

- [ ] **Step 2 : Ajouter `mesh_history` observable en JS**

Dans `bedlevelvisualizer.js`, après `self.tolerance_colorscale = ko.observable(false);`, ajouter :

```javascript
self.mesh_history_list = ko.observableArray([]);
```

Charger dans `onBeforeBinding` :
```javascript
self.mesh_history_list(self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_history() || []);
```

- [ ] **Step 3 : Pousser dans l'historique lors de `drawMesh`**

Dans `drawMesh`, après `self.settingsViewModel.saveData();` (dans le bloc `if (store_data)`), ajouter :

```javascript
// Push to mesh history
var histEntry = {
    timestamp: new Date().toLocaleString(),
    mesh_x: mesh_data_x.slice(),
    mesh_y: mesh_data_y.slice(),
    mesh: JSON.parse(JSON.stringify(mesh_data_z)),
    z_height: mesh_data_z_height,
    pp: (function() {
        var flat = [];
        for (var r = 0; r < mesh_data_z.length; r++)
            for (var c = 0; c < mesh_data_z[r].length; c++)
                flat.push(parseFloat(mesh_data_z[r][c]));
        var mn = flat[0], mx = flat[0];
        for (var i = 0; i < flat.length; i++) {
            if (flat[i] < mn) mn = flat[i];
            if (flat[i] > mx) mx = flat[i];
        }
        return (mx - mn).toFixed(3);
    })()
};
var hist = self.mesh_history_list().slice();
hist.unshift(histEntry);
if (hist.length > 10) { hist = hist.slice(0, 10); }
self.mesh_history_list(hist);
self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_history(hist);
self.settingsViewModel.saveData();
```

- [ ] **Step 4 : Afficher l'historique dans Settings → Stored Data**

Dans `bedlevelvisualizer_settings.jinja2`, dans l'onglet `bedlevelvisualizer_stored_data`, ajouter après le bloc de mesh table existant (après la dernière `</div>` de l'onglet) :

```html
<hr/>
<div class="row-fluid" style="padding-top: 5px;">
    <div class="control-group">
        <label style="font-weight: bold; margin-bottom: 4px; display: block;">
            <i class="fa fa-history"></i> Mesh History
            <small class="muted" style="font-weight: normal; margin-left: 6px;"
                   data-bind="text: '(' + $root.mesh_history_list().length + '/10)'"></small>
        </label>
        <!-- ko if: $root.mesh_history_list().length === 0 -->
        <p class="muted" style="font-size: 12px;">No history yet. Run a mesh update to start recording.</p>
        <!-- /ko -->
        <div data-bind="foreach: $root.mesh_history_list">
            <div style="display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #333; font-size: 11px;">
                <span style="color: #888; flex: 1 1 auto;" data-bind="text: timestamp"></span>
                <span style="background: #222; border: 1px solid #444; border-radius: 3px; padding: 1px 6px;"
                      data-bind="text: 'P-P: ' + pp + 'mm',
                                 style: { color: parseFloat(pp) < 0.05 ? '#5c5' : parseFloat(pp) < 0.2 ? '#f90' : '#e44' }"></span>
                <button class="btn btn-mini"
                        data-bind="click: function(){ $root.restoreHistoryMesh($data); }"
                        title="Restore this mesh as the current displayed mesh">
                    <i class="fa fa-undo"></i> Restore
                </button>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 5 : Ajouter `restoreHistoryMesh` en JS**

Après `self.moveToScrew`, ajouter :

```javascript
self.restoreHistoryMesh = function(entry) {
    self.mesh_data(entry.mesh);
    self.mesh_data_x(entry.mesh_x);
    self.mesh_data_y(entry.mesh_y);
    self.mesh_data_z_height(entry.z_height);
    self.drawMesh(entry.mesh, false, entry.mesh_x, entry.mesh_y, entry.z_height);
};
```

- [ ] **Step 6 : Commit**

```bash
git add octoprint_bedlevelvisualizer/__init__.py octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2
git commit -m "feat: add mesh history (last 10 meshes with P-P stats and restore button)"
```

---

## Vérification finale

- [ ] Stats flatness visibles sous le graphe après un mesh update
- [ ] Marqueurs vis visibles sur le graphe Plotly (avec couleurs tier)
- [ ] Bouton "Move" déplace la tête au-dessus de la vis
- [ ] Bouton "Probe" envoie G30 et la carte se met à jour avec le Z mesuré (badge "⊙ probed")
- [ ] Workflow "Start screw workflow" : move screw0 → probe screw0 → move screw1 → ...
- [ ] Après le dernier probe : bouton "Global mesh verify" visible
- [ ] "Global mesh verify" lance le mesh update complet
- [ ] Historique : chaque mesh update ajoute une entrée dans Settings → Stored Data
- [ ] "Restore" dans l'historique recharge un mesh ancien dans le graphe
- [ ] Console navigateur sans erreurs JS
