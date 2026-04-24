import pytest
from octoprint_bedcalibrationsuite.mesh import MeshProcessor

@pytest.fixture
def processor():
    return MeshProcessor()

def test_extract_mesh_values(processor):
    line = " 0.123  -0.045   0.001   0.089  -0.112"
    values = processor.extract_values(line)
    assert len(values) == 5
    assert values[0] == pytest.approx(0.123)
    assert values[1] == pytest.approx(-0.045)

def test_mesh_variance(processor):
    mesh = [[0.1, -0.1, 0.05], [0.0, -0.05, 0.08]]
    stats = processor.compute_stats(mesh)
    assert stats["variance_mm"] == pytest.approx(0.2, abs=0.01)
    assert stats["max_deviation_mm"] == pytest.approx(0.1133, abs=0.01)

def test_is_mesh_line_true(processor):
    assert processor.is_mesh_line("  0.123  -0.045   0.001   0.089  -0.112")

def test_is_mesh_line_false(processor):
    assert not processor.is_mesh_line("ok")
    assert not processor.is_mesh_line("echo: busy")

def test_flip_x(processor):
    mesh = [[1, 2, 3], [4, 5, 6]]
    flipped = processor.flip_axis(mesh, axis="x")
    assert flipped == [[3, 2, 1], [6, 5, 4]]

def test_flip_y(processor):
    mesh = [[1, 2], [3, 4]]
    flipped = processor.flip_axis(mesh, axis="y")
    assert flipped == [[3, 4], [1, 2]]
