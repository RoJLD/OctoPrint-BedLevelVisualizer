"""OctoPrint-BedCalibrationSuite - Unified bed calibration plugin."""
from __future__ import absolute_import

import logging
from pathlib import Path

from .mesh import MeshProcessor
from .bed_health import BedHealthScore
from .tramming import TrammingCalculator
from .zoffset import ZOffsetCalibrator, MATERIAL_PROFILES
from .elysium_hook import emit_bed_health

try:
    import octoprint.plugin
    from octoprint.events import Events
    import flask

    class BedCalibrationSuitePlugin(
        octoprint.plugin.StartupPlugin,
        octoprint.plugin.TemplatePlugin,
        octoprint.plugin.AssetPlugin,
        octoprint.plugin.SettingsPlugin,
        octoprint.plugin.SimpleApiPlugin,
        octoprint.plugin.EventHandlerPlugin,
    ):
        def __init__(self):
            self._logger = logging.getLogger("octoprint.plugins.bedcalibrationsuite")
            self.processing = False
            self.printing = False
            self._mesh_processor = MeshProcessor()
            self._tramming = None
            self._zoffset = None
            self._health = None

        def on_after_startup(self):
            self._logger.info("BedCalibrationSuite loaded!")
            data_dir = Path(self.get_plugin_data_folder())
            self._health = BedHealthScore(state_path=data_dir / "calibration_state.json")
            self._health.load()
            pitch = self._settings.get_float(["screw_pitch_mm"]) or 0.7
            self._tramming = TrammingCalculator(screw_pitch_mm=pitch)
            profile = self._printer_profile_manager.get_current()
            volume = profile.get("volume", {})
            bv = (volume.get("width", 300), volume.get("depth", 300), volume.get("height", 400))
            self._zoffset = ZOffsetCalibrator(build_volume=bv)

        def get_settings_defaults(self):
            return dict(
                command="",
                stored_mesh=[],
                stored_mesh_x=[],
                stored_mesh_y=[],
                stored_mesh_z_height=2,
                save_mesh=True,
                mesh_timestamp="",
                flipX=False,
                flipY=False,
                stripFirst=False,
                use_center_origin=False,
                use_relative_offsets=False,
                timeout=1800,
                rotation=0,
                ignore_correction_matrix=False,
                screw_hub=0.5,
                mesh_unit=1,
                reverse=False,
                showdegree=False,
                show_stored_mesh_on_tab=False,
                imperial=False,
                descending_y=False,
                descending_x=False,
                debug_logging=False,
                commands=[],
                show_labels=True,
                show_webcam=False,
                graph_z_limits="-2,2",
                colorscale='[[0, "rebeccapurple"],[0.4, "rebeccapurple"],[0.45, "blue"],[0.5, "green"],[0.55, "yellow"],[0.6, "red"],[1, "red"]]',
                save_snapshots=False,
                camera_position="-1.25,-1.25,0.25",
                date_locale_format="",
                graph_height="450px",
                show_prusa_adjustments=False,
                screws_bed_level_guide=False,
                bed_level_screws=[],
                screw_reference_mode="zero",
                screw_reference_index=0,
                home_before_workflow=True,
                safe_z_height=5,
                tolerance_colorscale=False,
                mesh_history=[],
                print_start_alert=False,
                print_start_alert_threshold=0.2,
                mesh_freshness_hours=24,
                auto_configure_margin=30,
                mesh_degradation_alert=False,
                mesh_degradation_threshold=20,
                screw_pitch_mm=0.7,
                tramming_threshold_mm=0.12,
                fade_height_mm=10.0,
                current_material="PLA",
                clean_position_x=0,
                clean_position_y=0,
                clean_position_z=50,
                zoffset_method="paper_test",
                drift_threshold_mm=0.05,
                health_weight_tramming=0.35,
                health_weight_zoffset=0.30,
                health_weight_mesh=0.35,
                health_threshold_ok=70,
                health_threshold_critical=50,
                mesh_history_size=10,
                firmware_type="auto",
                nozzle_change_since_zoffset=False,
                bed_surface_change_since_zoffset=False,
            )

        def get_assets(self):
            return dict(
                js=[
                    "js/jquery-ui.min.js",
                    "js/knockout-sortable.1.2.0.js",
                    "js/fontawesome-iconpicker.js",
                    "js/ko.iconpicker.js",
                    "js/plotly.min.js",
                    "js/bedcalibrationsuite.js",
                ],
                css=[
                    "css/font-awesome.min.css",
                    "css/font-awesome-v4-shims.min.css",
                    "css/fontawesome-iconpicker.css",
                    "css/bedcalibrationsuite.css",
                ],
            )

        def get_template_vars(self):
            return {"plugin_version": self._plugin_version}

        def get_api_commands(self):
            return dict(
                stopProcessing=[],
                getHealthScore=[],
                startFullCalibration=[],
                startTramming=[],
                startZOffset=[],
                startMeshOnly=[],
                cleanNozzle=["material"],
            )

        def on_api_command(self, command, data):
            if command == "getHealthScore":
                return flask.jsonify(self._health.state if self._health else {})
            if command == "cleanNozzle":
                material = data.get("material", self._settings.get(["current_material"]))
                pos = (
                    self._settings.get_float(["clean_position_x"]),
                    self._settings.get_float(["clean_position_y"]),
                    self._settings.get_float(["clean_position_z"]),
                )
                gcodes = self._zoffset.clean_nozzle_gcode(material, clean_pos=pos)
                self._printer.commands(gcodes)
                return flask.jsonify({"status": "cleaning", "material": material})
            return flask.jsonify({"status": "ok"})

        def on_event(self, event, payload):
            if event == Events.PRINT_STARTED:
                self.printing = True
            elif event in (Events.PRINT_DONE, Events.PRINT_FAILED):
                self.printing = False

        def get_update_information(self):
            return dict(
                bedcalibrationsuite=dict(
                    displayName="Bed Calibration Suite",
                    displayVersion=self._plugin_version,
                    type="github_commit",
                    user="RoJLD",
                    repo="OctoPrint-BedCalibrationSuite",
                    branch="master",
                    current=self._plugin_version,
                    pip="https://github.com/RoJLD/OctoPrint-BedCalibrationSuite/archive/{target_version}.zip",
                )
            )

    def __plugin_load__():
        global __plugin_implementation__
        __plugin_implementation__ = BedCalibrationSuitePlugin()

        global __plugin_hooks__
        __plugin_hooks__ = {
            "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information,
        }

except ImportError:
    # OctoPrint not installed — sub-modules remain importable for testing
    pass


__plugin_name__ = "Bed Calibration Suite"
__plugin_pythoncompat__ = ">=3,<4"
