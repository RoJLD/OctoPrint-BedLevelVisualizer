def test_package_imports():
    from octoprint_bedcalibrationsuite import bed_health
    from octoprint_bedcalibrationsuite import tramming
    from octoprint_bedcalibrationsuite import zoffset
    from octoprint_bedcalibrationsuite import mesh
    from octoprint_bedcalibrationsuite import scheduler
    from octoprint_bedcalibrationsuite import elysium_hook
    assert bed_health.BedHealthScore is not None
    assert tramming.TrammingCalculator is not None
    assert zoffset.MATERIAL_PROFILES["PLA"]["clean_temp"] == 200
