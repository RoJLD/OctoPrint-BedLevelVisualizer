# tests/test_tramming.py
import pytest
from octoprint_bedcalibrationsuite.tramming import TrammingCalculator


@pytest.fixture
def calc():
    return TrammingCalculator(screw_pitch_mm=0.7)


def test_screw_adjustment_from_mesh_corners(calc):
    mesh = [
        [0.10, 0.05, 0.00],
        [0.08, 0.02, -0.02],
        [0.15, 0.10, 0.05],
    ]
    adjustments = calc.compute_screw_adjustments(mesh, reference="center")
    assert "FL" in adjustments
    assert "FR" in adjustments
    assert "BL" in adjustments
    assert "BR" in adjustments


def test_turns_from_offset(calc):
    turns = calc.offset_to_turns(0.35)
    assert turns == pytest.approx(0.5, abs=0.01)


def test_turns_negative(calc):
    turns = calc.offset_to_turns(-0.14)
    assert turns == pytest.approx(-0.2, abs=0.01)


def test_direction_cw(calc):
    assert calc.turns_to_direction(0.5) == "CW"


def test_direction_ccw(calc):
    assert calc.turns_to_direction(-0.3) == "CCW"


def test_human_readable(calc):
    instruction = calc.format_instruction("FL", 0.25)
    assert "1/4" in instruction or "0.25" in instruction
    assert "CW" in instruction


def test_parse_klipper_screw_line(calc):
    line = '// front_left (x=30, y=30): x=30.0, y=30.0, z=0.12500 : Adjust CW 00:03'
    result = calc.parse_klipper_screw(line)
    assert result is not None
    assert result["name"] == "front_left"
    assert result["direction"] == "CW"
    assert result["amount"] == "00:03"


def test_mesh_variance(calc):
    mesh = [[0.1, -0.1], [0.05, -0.05]]
    variance = calc.mesh_variance(mesh)
    assert variance == pytest.approx(0.2, abs=0.01)
