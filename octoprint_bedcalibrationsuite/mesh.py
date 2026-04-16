"""Mesh parsing, GCode response processing, statistics."""
import re


class MeshProcessor:
    def __init__(self):
        self._regex_values = re.compile(r"(\+?-?\d*\.\d+)")
        self._regex_mesh_line = re.compile(
            r"^((G33.+)|(Bed.+)|(Llit.+)|(\d+\s)|(\|\s*)|(\s*\[\s+)|(\[?\s?\+?-?\d+?\.\d+\]?\s*,?)|(\s?\.\s*)|(NAN,"
            r"?)|(nan\s?,?)|(=======\s?,?))+(\s+\],?)?$"
        )

    def extract_values(self, line):
        matches = self._regex_values.findall(line)
        return [float(v) for v in matches]

    def is_mesh_line(self, line):
        stripped = line.strip()
        if not stripped or stripped == "ok":
            return False
        return bool(self._regex_mesh_line.match(stripped))

    def compute_stats(self, mesh):
        flat = [v for row in mesh for v in row if v is not None]
        if not flat:
            return {"variance_mm": 0.0, "max_deviation_mm": 0.0, "mean_mm": 0.0}
        mean = sum(flat) / len(flat)
        max_val = max(flat)
        min_val = min(flat)
        variance = max_val - min_val
        max_deviation = max(abs(max_val - mean), abs(min_val - mean))
        return {
            "variance_mm": round(variance, 4),
            "max_deviation_mm": round(max_deviation, 4),
            "mean_mm": round(mean, 4),
        }

    def flip_axis(self, mesh, axis="x"):
        if axis == "x":
            return [list(reversed(row)) for row in mesh]
        elif axis == "y":
            return list(reversed(mesh))
        return mesh
