"""Optional ELYSIUM sigma-octo-core bridge. No-op if ELYSIUM not available."""


def emit_bed_health(score_data):
    """Emit bed health data to sigma-octo-core if available."""
    try:
        from sigma_octo_core import telemetry
        telemetry.record_bed_health(score_data)
    except ImportError:
        pass
