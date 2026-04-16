"""Z-offset calibration: material profiles, paper test wizard, nozzle cleaning."""

MATERIAL_PROFILES = {
    "PLA":   {"clean_temp": 200, "bed_temp": 60},
    "PLA+":  {"clean_temp": 210, "bed_temp": 60},
    "PETG":  {"clean_temp": 235, "bed_temp": 80},
    "ABS":   {"clean_temp": 245, "bed_temp": 100},
    "TPU":   {"clean_temp": 220, "bed_temp": 50},
    "Nylon": {"clean_temp": 250, "bed_temp": 80},
}


class ZOffsetCalibrator:
    """Manages z-offset calibration workflows."""
    pass
