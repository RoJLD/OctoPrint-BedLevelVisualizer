import json
import pytest
from octoprint_bedcalibrationsuite.bed_health import BedHealthScore


@pytest.fixture
def scorer():
    return BedHealthScore()


def test_perfect_tramming_score(scorer):
    assert scorer.compute_tramming_score(0.05, days_since=0) == 100

def test_good_tramming_score(scorer):
    score = scorer.compute_tramming_score(0.12, days_since=0)
    assert 55 <= score <= 85

def test_critical_tramming_score(scorer):
    score = scorer.compute_tramming_score(0.40, days_since=0)
    assert score < 30

def test_tramming_time_penalty(scorer):
    fresh = scorer.compute_tramming_score(0.10, days_since=0)
    old = scorer.compute_tramming_score(0.10, days_since=60)
    assert old < fresh

def test_zoffset_score_fresh(scorer):
    assert scorer.compute_zoffset_score(days_since=1, nozzle_changed=False, bed_changed=False) == 100

def test_zoffset_score_nozzle_change(scorer):
    score = scorer.compute_zoffset_score(days_since=1, nozzle_changed=True, bed_changed=False)
    assert score <= 90

def test_mesh_score_flat(scorer):
    assert scorer.compute_mesh_score(0.03, trend="stable") >= 95

def test_mesh_score_degrading(scorer):
    stable = scorer.compute_mesh_score(0.10, trend="stable")
    degrading = scorer.compute_mesh_score(0.10, trend="degrading")
    assert degrading < stable

def test_composite_score(scorer):
    score = scorer.compute(
        mesh_variance=0.05, days_since_tram=2,
        days_since_zoffset=1, nozzle_changed=False, bed_changed=False,
        mesh_trend="stable"
    )
    assert 85 <= score <= 100

def test_action_recommendation(scorer):
    action = scorer.recommend_action(score=40)
    assert action == "full_calibration"

def test_action_ok(scorer):
    action = scorer.recommend_action(score=75)
    assert action == "mesh_only"

def test_persistence_roundtrip(tmp_path):
    state_file = tmp_path / "calibration_state.json"
    scorer = BedHealthScore(state_path=state_file)
    scorer.update_tramming(mesh_variance=0.09, screw_adjustments={"FL": 0, "FR": "+0.25"}, iterations=2)
    scorer.save()
    scorer2 = BedHealthScore(state_path=state_file)
    scorer2.load()
    assert scorer2.state["calibration_state"]["last_tramming"]["mesh_variance_mm"] == 0.09

def test_mesh_trend_degrading():
    scorer = BedHealthScore()
    # add_mesh inserts at position 0, so add oldest first
    scorer.add_mesh(0.06, 0.09, [[0.06]])
    scorer.add_mesh(0.08, 0.12, [[0.08]])
    scorer.add_mesh(0.10, 0.15, [[0.1]])
    # history[0]=0.10 > history[1]=0.08 > history[2]=0.06 => degrading
    assert scorer.get_mesh_trend() == "degrading"
