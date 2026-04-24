"""Tramming wizard logic: Klipper SCREWS_TILT + Marlin screw calculation."""
import re


class TrammingCalculator:
    CORNER_MAP = {
        "FL": (0, 0),
        "FR": (0, -1),
        "BL": (-1, 0),
        "BR": (-1, -1),
    }

    FRACTION_MAP = {
        0.25: "1/4",
        0.50: "1/2",
        0.75: "3/4",
        1.0: "1",
    }

    def __init__(self, screw_pitch_mm=0.7):
        self.screw_pitch_mm = screw_pitch_mm
        self._klipper_regex = re.compile(
            r"//\s*(\S+)\s*(?:\([^)]*\))?\s*:\s*x=([\d.]+),\s*y=([\d.]+),\s*z=([\d.]+)\s*:\s*Adjust\s+(CW|CCW)\s+([\d:]+)"
        )

    def mesh_variance(self, mesh):
        flat = [v for row in mesh for v in row if v is not None]
        if not flat:
            return 0.0
        return max(flat) - min(flat)

    def compute_screw_adjustments(self, mesh, reference="center"):
        if not mesh or not mesh[0]:
            return {}
        if reference == "center":
            rows, cols = len(mesh), len(mesh[0])
            ref_val = float(mesh[rows // 2][cols // 2])
        else:
            ref_val = float(mesh[0][0])

        adjustments = {}
        for name, (row, col) in self.CORNER_MAP.items():
            corner_val = float(mesh[row][col])
            offset = corner_val - ref_val
            turns = self.offset_to_turns(offset)
            adjustments[name] = {
                "offset_mm": round(offset, 4),
                "turns": round(turns, 2),
                "direction": self.turns_to_direction(turns),
                "instruction": self.format_instruction(name, turns),
            }
        return adjustments

    def offset_to_turns(self, offset_mm):
        return offset_mm / self.screw_pitch_mm

    def turns_to_direction(self, turns):
        return "CW" if turns >= 0 else "CCW"

    def format_instruction(self, screw_name, turns):
        direction = self.turns_to_direction(turns)
        abs_turns = abs(turns)
        closest = min(self.FRACTION_MAP.keys(), key=lambda x: abs(x - abs_turns))
        if abs(closest - abs_turns) < 0.05:
            human = self.FRACTION_MAP[closest] + " turn"
        else:
            human = f"{abs_turns:.2f} turns"
        return f"{screw_name}: {human} {direction}"

    def parse_klipper_screw(self, line):
        match = self._klipper_regex.search(line)
        if not match:
            return None
        return {
            "name": match.group(1),
            "x": float(match.group(2)),
            "y": float(match.group(3)),
            "z": float(match.group(4)),
            "direction": match.group(5),
            "amount": match.group(6),
        }
