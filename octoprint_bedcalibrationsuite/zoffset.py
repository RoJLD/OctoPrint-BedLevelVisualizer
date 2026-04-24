"""Z-offset calibration: material profiles, paper test wizard, nozzle cleaning."""

MATERIAL_PROFILES = {
    "PLA":   {"clean_temp": 200, "bed_temp": 60},
    "PLA+":  {"clean_temp": 210, "bed_temp": 60},
    "PETG":  {"clean_temp": 235, "bed_temp": 80},
    "ABS":   {"clean_temp": 245, "bed_temp": 100},
    "TPU":   {"clean_temp": 220, "bed_temp": 50},
    "Nylon": {"clean_temp": 250, "bed_temp": 80},
}

PAPER_TEST_STATES = [
    "IDLE", "HEATING_NOZZLE", "CLEAN_NOZZLE", "HOMING",
    "MOVING_CENTER", "DESCENDING", "CONFIRM_OFFSET", "SAVING", "DONE",
]


class PaperTestState:
    def __init__(self):
        self._index = 0

    @property
    def current(self):
        return PAPER_TEST_STATES[self._index]

    def advance(self):
        if self._index < len(PAPER_TEST_STATES) - 1:
            self._index += 1

    def reset(self):
        self._index = 0


class ZOffsetCalibrator:
    def __init__(self, build_volume=(300, 300, 400)):
        self.build_volume = build_volume
        self.state = PaperTestState()

    def clean_nozzle_gcode(self, material, clean_pos=(0, 0, 50)):
        profile = MATERIAL_PROFILES.get(material, MATERIAL_PROFILES["PLA"])
        temp = profile["clean_temp"]
        x, y, z = clean_pos
        return [
            f"M104 S{temp}",
            f"M109 S{temp}",
            f"G1 X{x} Y{y} Z{z} F3000",
        ]

    def paper_test_descend_gcode(self, target_z=0.1):
        return [f"G1 Z{target_z} F60"]

    def center_gcode(self):
        cx = self.build_volume[0] / 2
        cy = self.build_volume[1] / 2
        return ["G28", f"G1 X{cx:.0f} Y{cy:.0f} Z10 F3000"]

    def save_zoffset_gcode(self, offset_mm):
        return [f"M851 Z{offset_mm}", "M500"]

    def probe_baseline_gcode(self):
        cx = self.build_volume[0] / 2
        cy = self.build_volume[1] / 2
        return [f"G1 X{cx:.0f} Y{cy:.0f} F3000", "G30", "G30", "G30"]
