"""Bed health scoring engine and calibration state persistence."""
import json
from datetime import datetime, timezone
from pathlib import Path

WEIGHT_TRAMMING = 0.35
WEIGHT_ZOFFSET = 0.30
WEIGHT_MESH = 0.35

THRESHOLD_OK = 70
THRESHOLD_CRITICAL = 50


class BedHealthScore:
    def __init__(self, state_path=None):
        self.state_path = Path(state_path) if state_path else None
        self.state = self._empty_state()

    def _empty_state(self):
        return {
            "calibration_state": {
                "last_tramming": None,
                "last_zoffset": None,
                "nozzle_change_since_zoffset": False,
                "bed_surface_change_since_zoffset": False,
                "current_material": "PLA",
            },
            "mesh_history": [],
            "print_count_since_tram": 0,
            "bed_health_score": 0,
            "score_breakdown": {"tramming": 0, "zoffset": 0, "mesh": 0},
        }

    def compute_tramming_score(self, mesh_variance, days_since=0):
        if mesh_variance < 0.08:
            base = 100
        elif mesh_variance < 0.12:
            base = 80 + (0.12 - mesh_variance) / 0.04 * 20
        elif mesh_variance < 0.15:
            base = 60 + (0.15 - mesh_variance) / 0.03 * 20
        elif mesh_variance < 0.30:
            base = 30 + (0.30 - mesh_variance) / 0.15 * 30
        else:
            base = max(0, 30 - (mesh_variance - 0.30) / 0.10 * 30)
        penalty = max(0, days_since - 30)
        return max(0, min(100, base - penalty))

    def compute_zoffset_score(self, days_since=0, nozzle_changed=False, bed_changed=False):
        if days_since > 7:
            base = max(50, 100 - (days_since - 7) * 2)
        else:
            base = 100
        if nozzle_changed:
            base -= 10
        if bed_changed:
            base -= 10
        return max(0, min(100, base))

    def compute_mesh_score(self, mesh_variance, trend="stable"):
        if mesh_variance < 0.05:
            base = 100
        elif mesh_variance < 0.15:
            base = 60 + (0.15 - mesh_variance) / 0.10 * 40
        else:
            base = max(0, 60 - (mesh_variance - 0.15) / 0.15 * 60)
        if trend == "stable":
            base = min(100, base + 10)
        elif trend == "degrading":
            base -= 10
        return max(0, min(100, base))

    def compute(self, mesh_variance, days_since_tram, days_since_zoffset,
                nozzle_changed, bed_changed, mesh_trend):
        t = self.compute_tramming_score(mesh_variance, days_since_tram)
        z = self.compute_zoffset_score(days_since_zoffset, nozzle_changed, bed_changed)
        m = self.compute_mesh_score(mesh_variance, mesh_trend)
        composite = t * WEIGHT_TRAMMING + z * WEIGHT_ZOFFSET + m * WEIGHT_MESH
        self.state["bed_health_score"] = round(composite)
        self.state["score_breakdown"] = {"tramming": round(t), "zoffset": round(z), "mesh": round(m)}
        return round(composite)

    def recommend_action(self, score=None):
        if score is None:
            score = self.state["bed_health_score"]
        if score >= 90:
            return "none"
        elif score >= THRESHOLD_OK:
            return "mesh_only"
        elif score >= THRESHOLD_CRITICAL:
            return "zoffset_and_mesh"
        else:
            return "full_calibration"

    def update_tramming(self, mesh_variance, screw_adjustments=None, iterations=1):
        self.state["calibration_state"]["last_tramming"] = {
            "date": datetime.now(timezone.utc).isoformat(),
            "mesh_variance_mm": mesh_variance,
            "screw_adjustments": screw_adjustments or {},
            "iterations": iterations,
        }
        self.state["print_count_since_tram"] = 0

    def update_zoffset(self, method, value_mm, probe_baseline=None):
        self.state["calibration_state"]["last_zoffset"] = {
            "date": datetime.now(timezone.utc).isoformat(),
            "method": method,
            "value_mm": value_mm,
            "probe_baseline": probe_baseline,
        }
        self.state["calibration_state"]["nozzle_change_since_zoffset"] = False
        self.state["calibration_state"]["bed_surface_change_since_zoffset"] = False

    def add_mesh(self, variance_mm, max_deviation_mm, grid):
        entry = {
            "date": datetime.now(timezone.utc).isoformat(),
            "variance_mm": variance_mm,
            "max_deviation_mm": max_deviation_mm,
            "grid": grid,
        }
        self.state["mesh_history"].insert(0, entry)
        self.state["mesh_history"] = self.state["mesh_history"][:10]

    def get_mesh_trend(self):
        history = self.state["mesh_history"]
        if len(history) < 3:
            return "unknown"
        recent = [h["variance_mm"] for h in history[:3]]
        if recent[0] > recent[1] > recent[2]:
            return "degrading"
        if recent[0] < recent[1] < recent[2]:
            return "improving"
        return "stable"

    def save(self):
        if self.state_path:
            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            self.state_path.write_text(json.dumps(self.state, indent=2), encoding="utf-8")

    def load(self):
        if self.state_path and self.state_path.exists():
            self.state = json.loads(self.state_path.read_text(encoding="utf-8"))
