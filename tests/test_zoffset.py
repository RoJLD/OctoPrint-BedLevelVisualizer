import pytest
from octoprint_bedcalibrationsuite.zoffset import (
    ZOffsetCalibrator, MATERIAL_PROFILES, PaperTestState
)

def test_material_profiles_complete():
    for mat in ["PLA", "PLA+", "PETG", "ABS", "TPU", "Nylon"]:
        assert mat in MATERIAL_PROFILES
        assert "clean_temp" in MATERIAL_PROFILES[mat]
        assert "bed_temp" in MATERIAL_PROFILES[mat]

def test_pla_temps():
    assert MATERIAL_PROFILES["PLA"]["clean_temp"] == 200
    assert MATERIAL_PROFILES["PLA"]["bed_temp"] == 60

def test_abs_temps():
    assert MATERIAL_PROFILES["ABS"]["clean_temp"] == 245
    assert MATERIAL_PROFILES["ABS"]["bed_temp"] == 100

def test_paper_test_initial_state():
    state = PaperTestState()
    assert state.current == "IDLE"

def test_paper_test_transitions():
    state = PaperTestState()
    state.advance(); assert state.current == "HEATING_NOZZLE"
    state.advance(); assert state.current == "CLEAN_NOZZLE"
    state.advance(); assert state.current == "HOMING"
    state.advance(); assert state.current == "MOVING_CENTER"
    state.advance(); assert state.current == "DESCENDING"
    state.advance(); assert state.current == "CONFIRM_OFFSET"
    state.advance(); assert state.current == "SAVING"
    state.advance(); assert state.current == "DONE"

def test_paper_test_reset():
    state = PaperTestState()
    state.advance()
    state.advance()
    state.reset()
    assert state.current == "IDLE"

def test_clean_nozzle_gcode():
    cal = ZOffsetCalibrator(build_volume=(300, 300, 400))
    gcodes = cal.clean_nozzle_gcode("PLA+", clean_pos=(0, 0, 50))
    assert any("M104" in g and "210" in g for g in gcodes)
    assert any("G1" in g and "Z50" in g for g in gcodes)

def test_paper_test_gcode_descend():
    cal = ZOffsetCalibrator(build_volume=(300, 300, 400))
    gcodes = cal.paper_test_descend_gcode(target_z=0.1)
    assert any("G1" in g and "Z0.1" in g for g in gcodes)

def test_save_zoffset_gcode():
    cal = ZOffsetCalibrator(build_volume=(300, 300, 400))
    gcodes = cal.save_zoffset_gcode(-2.35)
    assert any("M851" in g and "-2.35" in g for g in gcodes)
    assert any("M500" in g for g in gcodes)

def test_center_gcode():
    cal = ZOffsetCalibrator(build_volume=(300, 300, 400))
    gcodes = cal.center_gcode()
    assert any("G28" in g for g in gcodes)
    assert any("X150" in g and "Y150" in g for g in gcodes)
