/*
 * View model for OctoPrint
 *
 * Amendments by: LMS0815
 * License: AGPLv3
 *
 * http://beautifytools.com/javascript-validator.php
 *
*/

$(function () {
	function bedlevelvisualizerViewModel(parameters) {
		var self = this;

		self.settingsViewModel = parameters[0];
		self.controlViewModel = parameters[1];
		self.loginStateViewModel = parameters[2];

		self.processing = ko.observable(false);
		self.mesh_data = ko.observableArray([]);
		self.mesh_data_x = ko.observableArray([]);
		self.mesh_data_y = ko.observableArray([]);
		self.mesh_data_z_height = ko.observable();
		self.save_mesh = ko.observable();
		self.save_snapshots = ko.observable(false);
		self.selected_command = ko.observable();
		self.settings_active = ko.observable(false);
		self.webcam_streamUrl = ko.computed(function(){
			if(self.processing() && self.settingsViewModel.settings.plugins.bedlevelvisualizer.show_webcam() && (self.settingsViewModel.webcam_streamUrl() !== "")) {
				return self.settingsViewModel.webcam_streamUrl();
			} else {
				return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==";
			}
		});
		self.mesh_status = ko.computed(function(){
			if(self.processing()){
				return 'Collecting mesh data.';
			}
			if (self.save_mesh() && self.mesh_data().length > 0) {
				return 'Using saved mesh data from ' + self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_timestamp() + '.';
			} else {
				return 'Update mesh.';
			}
		});

		self.screw_hub = ko.observable();
		self.mesh_unit = ko.observable();
		self.reverse = ko.observable();
		self.showdegree = ko.observable();
		self.show_stored_mesh_on_tab = ko.observable();
		self.imperial = ko.observable();
		self.descending_x = ko.observable();
		self.descending_y = ko.observable();
		self.mesh_zero = ko.observable(0);
		self.mesh_adjustment = ko.computed(
			function() {
				var degrees = ko.utils.arrayMap(
					self.mesh_data(),
					function(line) {
					return ko.utils.arrayMap(
						line,
						function(item) {
						return ((parseFloat(item) - parseFloat(self.mesh_zero())) * parseFloat(self.mesh_unit()) * 360 / (self.imperial()?25.4/parseFloat(self.screw_hub()):parseFloat(self.screw_hub())));
						}
				);
					}
				);
				return degrees;
				},
			self);
		self.turn = ko.observable(0);
		self.graph_z_limits = ko.observable();
		self.screws_bed_level_guide = ko.observable(false);
		self.tolerance_colorscale = ko.observable(false);
		self.mesh_history_list = ko.observableArray([]);
		self.bed_info = ko.observable({});
		self.screw_probe_results = ko.observable({});
		self.screw_workflow_active = ko.observable(false);
		self.screw_workflow_step = ko.observable(-1);
		self.screw_reference_mode = ko.observable('zero');
		self.screw_reference_index = ko.observable(0);
		self.current_bed_temp = ko.observable(null);
		self.klipper_screw_results = ko.observable({});
		self.mesh_diff_index_a = ko.observable("0");
		self.mesh_diff_index_b = ko.observable("1");

		self.get_cell_text = function(item) {
			return (!item.$parentContext.$parent.len?Math.abs(parseFloat(item.$parentContext.$parent.mesh[item.$root.descending_y()?item.$root.mesh_data_y().length-1-item.$parentContext.$index():item.$parentContext.$index()][item.$root.descending_x()?item.$root.mesh_data_x().length-1-item.$index():item.$index()])):parseFloat(item.$parentContext.$parent.mesh[item.$root.descending_y()?item.$root.mesh_data_y().length-1-item.$parentContext.$index():item.$parentContext.$index()][item.$root.descending_x()?item.$root.mesh_data_x().length-1-item.$index():item.$index()])).toFixed(item.$parentContext.$parent.len);
		};

		self.onBeforeBinding = function() {
			self.mesh_data(self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh());
			self.mesh_data_x(self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh_x());
			self.mesh_data_y(self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh_y());
			self.mesh_data_z_height(self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh_z_height());
			self.save_mesh(self.settingsViewModel.settings.plugins.bedlevelvisualizer.save_mesh());
			self.save_snapshots(self.settingsViewModel.settings.plugins.bedlevelvisualizer.save_snapshots());
			self.screw_hub(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_hub());
			self.mesh_unit(self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_unit());
			self.reverse(self.settingsViewModel.settings.plugins.bedlevelvisualizer.reverse());
			self.showdegree(self.settingsViewModel.settings.plugins.bedlevelvisualizer.showdegree());
			self.show_stored_mesh_on_tab(self.settingsViewModel.settings.plugins.bedlevelvisualizer.show_stored_mesh_on_tab());
			self.imperial(self.settingsViewModel.settings.plugins.bedlevelvisualizer.imperial());
			self.descending_x(self.settingsViewModel.settings.plugins.bedlevelvisualizer.descending_x());
			self.descending_y(self.settingsViewModel.settings.plugins.bedlevelvisualizer.descending_y());
			self.graph_z_limits(self.settingsViewModel.settings.plugins.bedlevelvisualizer.graph_z_limits());
			self.screws_bed_level_guide(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screws_bed_level_guide());
			self.screw_reference_mode(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_mode());
			self.screw_reference_index(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_index());
			self.tolerance_colorscale(self.settingsViewModel.settings.plugins.bedlevelvisualizer.tolerance_colorscale());
			self.mesh_history_list(self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_history() || []);
		};

		self.onAfterBinding = function() {
			$('div#settings_plugin_bedlevelvisualizer i[data-toggle="tooltip"],div#tab_plugin_bedlevelvisualizer i[data-toggle="tooltip"],div#wizard_plugin_bedlevelvisualizer i[data-toggle="tooltip"],div#settings_plugin_bedlevelvisualizer pre[data-toggle="tooltip"],div#settings_plugin_bedlevelvisualizer input[data-toggle="tooltip"],div#settings_plugin_bedlevelvisualizer div.input-append[data-toggle="tooltip"]').tooltip();
			$('div#tab_plugin_bedlevelvisualizer [title]:not([data-toggle="tooltip"])').tooltip({ placement: 'top', trigger: 'hover', container: 'body' });
			$('#bedlevelvisualizer_tabs a').on('show.bs.tab', function(event){
				if($(event.target).text() === 'Current Mesh Data'){
					self.settings_active(true);
					return;
				}
				if ($(event.relatedTarget).text() === 'Current Mesh Data'){
					self.settings_active(false);
				}
			});
		};

		self.onSettingsBeforeSave = function() {
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_hub(self.screw_hub());
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_unit(self.mesh_unit());
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.reverse(self.reverse());
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.showdegree(self.showdegree());
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.show_stored_mesh_on_tab(self.show_stored_mesh_on_tab());
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.imperial(self.imperial());
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.descending_x(self.descending_x());
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.descending_y(self.descending_y());
			if(self.settingsViewModel.settings.plugins.bedlevelvisualizer.colorscale().length === 0) { self.settingsViewModel.settings.plugins.bedlevelvisualizer.colorscale('[[0, "rebeccapurple"],[0.4, "rebeccapurple"],[0.45, "blue"],[0.5, "green"],[0.55, "yellow"],[0.6, "red"],[1, "red"]]');}
			if(self.settingsViewModel.settings.plugins.bedlevelvisualizer.rotation().length === 0) {self.settingsViewModel.settings.plugins.bedlevelvisualizer.rotation(0);}
			if(self.settingsViewModel.settings.plugins.bedlevelvisualizer.timeout().length === 0) {self.settingsViewModel.settings.plugins.bedlevelvisualizer.timeout(1800);}
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.screws_bed_level_guide(self.screws_bed_level_guide());
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_mode(self.screw_reference_mode());
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_index(self.screw_reference_index());
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.tolerance_colorscale(self.tolerance_colorscale());
/*			if(self.settingsViewModel.settings.plugins.bedlevelvisualizer.show_prusa_adjustments()) {
				self.settingsViewModel.settings.plugins.bedlevelvisualizer.use_relative_offsets(true);
				self.settingsViewModel.settings.plugins.bedlevelvisualizer.use_center_origin(true);
			}*/
		};

		self.onSettingsHidden = function() {
			self.settings_active(false);
		};

		self.onEventSettingsUpdated = function () {
			self.mesh_data(self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh());
			self.save_mesh(self.settingsViewModel.settings.plugins.bedlevelvisualizer.save_mesh());
			self.save_snapshots(self.settingsViewModel.settings.plugins.bedlevelvisualizer.save_snapshots());
			self.graph_z_limits(self.settingsViewModel.settings.plugins.bedlevelvisualizer.graph_z_limits());
			self.screws_bed_level_guide(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screws_bed_level_guide());
			self.screw_reference_mode(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_mode());
			self.screw_reference_index(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_index());
			self.tolerance_colorscale(self.settingsViewModel.settings.plugins.bedlevelvisualizer.tolerance_colorscale());
		};

		self.onDataUpdaterPluginMessage = function (plugin, mesh_data) {
			if (plugin !== "bedlevelvisualizer") {
				return;
			}

			if (mesh_data.probe_result) {
				self.handleProbeResult(mesh_data.probe_result);
				return;
			}

				if (mesh_data.klipper_screw_result) {
					var kr = self.klipper_screw_results();
					kr[mesh_data.klipper_screw_result.name] = mesh_data.klipper_screw_result;
					self.klipper_screw_results(Object.assign({}, kr));
					return;
				}

				if (mesh_data.print_alert) {
					new PNotify({
						title: 'Bed Level Alert',
						text: mesh_data.print_alert.message,
						type: mesh_data.print_alert.type === 'high_pp' ? 'error' : 'warning',
						hide: false
					});
					return;
				}

			if (mesh_data.BLV) {
				switch(mesh_data.BLV) {
					case "BLVPROCESSINGON":
						self.processing(true);
						break;
					case "BLVPROCESSINGOFF":
						self.processing(false);
						break;
					default:
						console.log("Unknown BLV Command: " + mesh_data.BLV);
				}
			}

			var i;
			if (mesh_data.mesh) {
				if (mesh_data.mesh.length > 0) {
					var x_data = [];
					var y_data = [];

					for( i = 0;i <= (mesh_data.mesh[0].length - 1);i++) {
						if ((mesh_data.bed.type === "circular") || self.settingsViewModel.settings.plugins.bedlevelvisualizer.use_center_origin()) {
							x_data.push(Math.round(mesh_data.bed.x_min - (mesh_data.bed.x_max/2)+i/(mesh_data.mesh[0].length - 1)*(mesh_data.bed.x_max - mesh_data.bed.x_min)));
						} else {
							x_data.push(Math.round(mesh_data.bed.x_min+i/(mesh_data.mesh[0].length - 1)*(mesh_data.bed.x_max - mesh_data.bed.x_min)));
						}
					}

					for( i = 0;i <= (mesh_data.mesh.length - 1);i++) {
						if ((mesh_data.bed.type === "circular") || self.settingsViewModel.settings.plugins.bedlevelvisualizer.use_center_origin()) {
							y_data.push(Math.round(mesh_data.bed.y_min - (mesh_data.bed.y_max/2)+i/(mesh_data.mesh.length - 1)*(mesh_data.bed.y_max - mesh_data.bed.y_min)));
						} else {
							y_data.push(Math.round(mesh_data.bed.y_min+i/(mesh_data.mesh.length - 1)*(mesh_data.bed.y_max - mesh_data.bed.y_min)));
						}
					}
					self.drawMesh(mesh_data.mesh,true,x_data,y_data,mesh_data.bed.z_max);
					if (self.mesh_history_list().length >= 2) {
						self.drawPPChart('bedlevelvisualizer_pp_chart_tab');
					}
					self.mesh_data(mesh_data.mesh);
					self.mesh_data_x(x_data);
					self.mesh_data_y(y_data);
					self.mesh_data_z_height(mesh_data.bed.z_max);
					self.bed_info({
						x_max: mesh_data.bed.x_max,
						y_max: mesh_data.bed.y_max,
						type: mesh_data.bed.type,
						center_origin: (mesh_data.bed.type === 'circular') ||
									   self.settingsViewModel.settings.plugins.bedlevelvisualizer.use_center_origin()
					});
					if (mesh_data.bed_temp !== undefined && mesh_data.bed_temp !== null) {
						self.current_bed_temp(mesh_data.bed_temp);
					}
				}
				return;
			}
			if (mesh_data.error) {
				clearTimeout(self.timeout);
				self.processing(false);
				new PNotify({
					title: 'Bed Visualizer Error',
					text: '<div class="row-fluid"><p>Looks like your settings are not correct or there was an error.</p><p>Please see the <a href="https://github.com/jneilliii/OctoPrint-BedLevelVisualizer/#tips" target="_blank">Readme</a> for configuration tips.</p></div><p><pre style="padding-top: 5px;">'+_.escape(mesh_data.error)+'</pre></p>',
					hide: true
				});
				return;
			}
			if (mesh_data.processing) {
				self.processing(true);
			}
			if (mesh_data.timeout_override) {
				// console.log('Resetting timeout to ' + mesh_data.timeout_override + ' seconds.');
				clearTimeout(self.timeout);
				self.timeout = setTimeout(function() {self.cancelMeshUpdate();new PNotify({title: 'Bed Visualizer Error',text: '<div class="row-fluid">Timeout occured before processing completed. Processing may still be running or there may be a configuration error. Consider increasing the Processing Timeout value in settings and restart OctoPrint.</div>',type: 'error',hide: false});}, (mesh_data.timeout_override*1000));
			}
			return;
		};

		self.drawMesh = function (mesh_data_z,store_data,mesh_data_x,mesh_data_y,mesh_data_z_height) {
			// console.log(mesh_data_z+'\n'+store_data+'\n'+mesh_data_x+'\n'+mesh_data_y+'\n'+mesh_data_z_height);
			// console.log(mesh_data_z);
			clearTimeout(self.timeout);
			self.processing(false);
			if ( self.save_mesh()) {
				if (store_data) {
					self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh(mesh_data_z);
					self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh_x(mesh_data_x);
					self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh_y(mesh_data_y);
					self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh_z_height(mesh_data_z_height);
					if(self.settingsViewModel.settings.plugins.bedlevelvisualizer.date_locale_format().length > 0) {
						self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_timestamp(new Date().toLocaleString(self.settingsViewModel.settings.plugins.bedlevelvisualizer.date_locale_format()));
					} else {
						self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_timestamp(new Date().toLocaleString());
					}
					// Push to mesh history (max 10 entries)
					var histEntry = {
						timestamp: new Date().toLocaleString(),
						mesh_x: mesh_data_x.slice(),
						mesh_y: mesh_data_y.slice(),
						mesh: JSON.parse(JSON.stringify(mesh_data_z)),
						z_height: mesh_data_z_height,
						bed_temp: self.current_bed_temp(),
						pp: (function() {
							var flat = [];
							for (var rr = 0; rr < mesh_data_z.length; rr++)
								for (var cc = 0; cc < mesh_data_z[rr].length; cc++)
									flat.push(parseFloat(mesh_data_z[rr][cc]));
							var mn = flat[0], mx = flat[0];
							for (var ii = 0; ii < flat.length; ii++) {
								if (flat[ii] < mn) mn = flat[ii];
								if (flat[ii] > mx) mx = flat[ii];
							}
							return (mx - mn).toFixed(3);
						})()
					};
					var hist = self.mesh_history_list().slice();
					hist.unshift(histEntry);
					if (hist.length >= 2 &&
					    self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_degradation_alert &&
					    self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_degradation_alert()) {
					    var currentPP  = parseFloat(hist[0].pp);
					    var previousPP = parseFloat(hist[1].pp);
					    var degradeThreshold = parseFloat(self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_degradation_threshold()) || 20;
					    if (previousPP > 0 && !isNaN(currentPP)) {
					        var increasePercent = ((currentPP - previousPP) / previousPP) * 100;
					        if (increasePercent > degradeThreshold) {
					            new PNotify({
					                title: 'Bed Flatness Alert',
					                text: 'Flatness degraded by ' + Math.round(increasePercent) + '% since last mesh<br>' +
					                      'P-P: ' + previousPP.toFixed(3) + 'mm → ' + currentPP.toFixed(3) + 'mm',
					                type: 'warning',
					                hide: false
					            });
					        }
					    }
					}
					if (hist.length > 10) { hist = hist.slice(0, 10); }
					self.mesh_history_list(hist);
					self.settingsViewModel.settings.plugins.bedlevelvisualizer.mesh_history(hist);
					self.settingsViewModel.saveData();
				}
			}

			try {
				var graphcolorscale = (self.settingsViewModel.settings.plugins.bedlevelvisualizer.colorscale().charAt(0) === "[") ? JSON.parse(self.settingsViewModel.settings.plugins.bedlevelvisualizer.colorscale()) : self.settingsViewModel.settings.plugins.bedlevelvisualizer.colorscale();
				if (graphcolorscale.length === 0) graphcolorscale = [[0, "rebeccapurple"],[0.4, "rebeccapurple"],[0.45, "blue"],[0.5, "green"],[0.55, "yellow"],[0.6, "red"],[1, "red"]];
				var toleranceZRange = [-0.25, 0.25];
				if (self.tolerance_colorscale()) {
					graphcolorscale = [[0,"#cc3333"],[0.1,"#ee4400"],[0.3,"#ee7700"],[0.4,"#aacc00"],[0.5,"#00bb44"],[0.6,"#aacc00"],[0.7,"#ee7700"],[0.9,"#ee4400"],[1,"#cc3333"]];
					toleranceZRange = [-0.25, 0.25];
				}
				var data = [{
						z: mesh_data_z,
						x: mesh_data_x,
						y: mesh_data_y,
						type: 'surface',
						colorbar: {
							tickfont: {
								color: $('#tabs_content').css('color')
							}
						},
						autocolorscale: false,
						colorscale: graphcolorscale,
						cmin: self.tolerance_colorscale() ? toleranceZRange[0] : undefined,
						cmax: self.tolerance_colorscale() ? toleranceZRange[1] : undefined
					}
				];

				// Add screw position markers if guide is active
				if (self.screws_bed_level_guide() && self.screw_corrections().length > 0) {
					var screwXs = [], screwYs = [], screwZs = [], screwTexts = [], screwColors = [];
					var corrections = self.screw_corrections();
					for (var si = 0; si < corrections.length; si++) {
						var sc = corrections[si];
						if (!sc.outOfBounds && !sc.refInvalid && !sc.pitchZero) {
							screwXs.push(sc.x);
							screwYs.push(sc.y);
							screwZs.push(parseFloat(sc.z) || 0);
							var badge = sc.isRef ? 'REF' : (sc.ok ? '\u2713' : (sc.tighten ? '\u21bb' : '\u21ba') + ' ' + sc.turns);
							screwTexts.push(sc.label + '<br>' + badge + '<br>Z=' + sc.z + 'mm');
							screwColors.push(sc.tier === 'critical' ? '#ee4444' : sc.tier === 'warn' ? '#ff9900' : '#44dd66');
						}
					}
					if (screwXs.length > 0) {
						data.push({
							type: 'scatter3d',
							mode: 'markers+text',
							x: screwXs,
							y: screwYs,
							z: screwZs,
							text: screwTexts,
							textposition: 'top center',
							hoverinfo: 'text',
							marker: {
								size: 8,
								color: screwColors,
								symbol: 'circle',
								line: { color: '#ffffff', width: 1 }
							},
							showlegend: false
						});
					}
				}

				if (!self.tolerance_colorscale()) {
					if(self.graph_z_limits().split(",")[0] !== 'auto'){
						data[0]['cmin'] = self.graph_z_limits().split(",")[0];
						data[0]['cmax'] = self.graph_z_limits().split(",")[1];
					}
				}

				var background_color = $('#tabs_content').css('background-color');
				var foreground_color = $('#tabs_content').css('color');
				var camera_position = self.settingsViewModel.settings.plugins.bedlevelvisualizer.camera_position().split(",");

				var layout = {
					//title: 'Bed Leveling Mesh',
					autosize: true,
					plot_bgcolor: background_color,
					paper_bgcolor: background_color,
					margin: {
						l: 0,
						r: 0,
						b: 0,
						t: 0
					},
					scene: {
						camera: {
							eye: {
								x: (camera_position.length === 3) ? camera_position[0] : -1.25,
								y: (camera_position.length === 3) ? camera_position[1] : -1.25,
								z: (camera_position.length === 3) ? camera_position[2] : 0.25
							}
						},
						xaxis: {
							color: foreground_color,
							zerolinecolor: '#00FF00',
							zerolinewidth: 4
						},
						yaxis: {
							color: foreground_color,
							zerolinecolor: '#FF0000',
							zerolinewidth: 4
						},
						zaxis: {
							color: foreground_color,
							range: self.tolerance_colorscale() ? toleranceZRange : ((self.graph_z_limits().split(",")[0] !== 'auto') ? self.graph_z_limits().split(',') : [-2,2]),
							zerolinecolor: '#0000FF',
							zerolinewidth: 4
						}
					}
				};

				var config_options = {
					displaylogo: false,
					showEditInChartStudio: true,
					responsive: true,
					plotlyServerURL: "https://chart-studio.plotly.com",
					modeBarButtonsToRemove: ['resetCameraDefault3d'],
					modeBarButtonsToAdd: [{
						name: 'Move Nozzle',
						icon: Plotly.Icons.autoscale,
						toggle: true,
						click: function(gd, ev) {
								var button = ev.currentTarget;
								var button_enabled = button._previousVal || false;
								if (!button_enabled) {
									gd.on('plotly_click', function(data) {
											var gcode_command = 'G0 X' + data.points[0].x + ' Y' + data.points[0].y + ' F4000';
											OctoPrint.control.sendGcode([gcode_command]);
										});
									button._previousVal = true;
								} else {
									gd.removeAllListeners('plotly_click');
									button._previousVal = null;
								}
							}
						}]};

				// calculate min/max value.
				let s_min = Math.min(...mesh_data_z.flat());
				let s_max = Math.max(...mesh_data_z.flat());
				let s_var = s_max - s_min;

				layout.annotations = [{
					xref: 'paper',
					yref: 'paper',
					x: 1,
					xanchor: 'right',
					y: 0,
					yanchor: 'bottom',
					text: 'Min: ' + s_min + '<br>Max: ' + s_max + '<br>Var: ' + s_var,
					showarrow: false,
					font: {
						color: foreground_color
					}
				}];

				// Prusa Bed Level Correction
				if(self.settingsViewModel.settings.plugins.bedlevelvisualizer.show_prusa_adjustments()) {
					let back_half = mesh_data_z.slice(0, mesh_data_z.length/2).join().split(',');
					let front_half = mesh_data_z.slice(mesh_data_z.length/2).join().split(',');
					let left_half = (back_half.slice(0,back_half.length/2) + front_half.slice(0,front_half.length/2)).split(',');
					let right_half = (back_half.slice(back_half.length/2) + front_half.slice(front_half.length/2)).split(',');

					let back_half_total = 0;
					let front_half_total = 0;
					let left_half_total = 0;
					let right_half_total = 0;

					for(let i=0;i<back_half.length;i++){
						back_half_total += parseFloat(back_half[i]);
					}

					for(let i=0;i<front_half.length;i++){
						front_half_total += parseFloat(front_half[i]);
					}

					for(let i=0;i<left_half.length;i++){
						left_half_total += parseFloat(left_half[i]);
					}

					for(let i=0;i<right_half.length;i++){
						right_half_total += parseFloat(right_half[i]);
					}

					let back_half_um = Math.round((back_half_total/back_half.length)*1000);
					let front_half_um = Math.round((front_half_total/front_half.length)*1000);
					let left_half_um = Math.round((left_half_total/left_half.length)*1000);
					let right_half_um = Math.round((right_half_total/right_half.length)*1000);
					layout.annotations.push({xref: 'paper',
						yref: 'paper',
						x: 1,
						xanchor: 'right',
						y: 1,
						yanchor: 'top',
						text: 'Back [um]:' + back_half_um + '<br>Front [um]:' + front_half_um + '<br>Left [um]:' + left_half_um + '<br>Right [um]:' + right_half_um,
						showarrow: false,
						font: {
							color: foreground_color
						}
					});
				}

				// graph surface
				Plotly.react('bedlevelvisualizergraph', data, layout, config_options).then(self.postPlotHandler);
				// Draw 2D heatmap side-by-side
				try {
					var heatmapColorscale = self.tolerance_colorscale()
						? [[0,"#cc3333"],[0.1,"#ee4400"],[0.3,"#ee7700"],[0.4,"#aacc00"],[0.5,"#00bb44"],[0.6,"#aacc00"],[0.7,"#ee7700"],[0.9,"#ee4400"],[1,"#cc3333"]]
						: graphcolorscale;
					var heatmapZmin = self.tolerance_colorscale() ? toleranceZRange[0]
						: (self.graph_z_limits().split(",")[0] !== 'auto' ? parseFloat(self.graph_z_limits().split(",")[0]) : undefined);
					var heatmapZmax = self.tolerance_colorscale() ? toleranceZRange[1]
						: (self.graph_z_limits().split(",")[0] !== 'auto' ? parseFloat(self.graph_z_limits().split(",")[1]) : undefined);
					var heatmapData = [{
						type: 'heatmap',
						z: mesh_data_z,
						x: mesh_data_x,
						y: mesh_data_y,
						colorscale: heatmapColorscale,
						zmin: heatmapZmin,
						zmax: heatmapZmax,
						colorbar: { tickfont: { color: foreground_color } },
						hoverongaps: false
					}];
					// Add screw position markers on heatmap if guide active
					if (self.screws_bed_level_guide() && self.screw_corrections().length > 0) {
						var hScrewXs = [], hScrewYs = [], hScrewTexts = [], hScrewColors = [];
						var hCorrections = self.screw_corrections();
						for (var hsi = 0; hsi < hCorrections.length; hsi++) {
							var hsc = hCorrections[hsi];
							if (!hsc.outOfBounds && !hsc.refInvalid && !hsc.pitchZero) {
								hScrewXs.push(hsc.x);
								hScrewYs.push(hsc.y);
								hScrewColors.push(hsc.tier === 'critical' ? '#ee4444' : hsc.tier === 'warn' ? '#ff9900' : '#44dd66');
								var hbadge = hsc.isRef ? 'REF' : (hsc.ok ? '\u2713' : (hsc.tighten ? '\u21bb' : '\u21ba') + ' ' + hsc.turns);
								hScrewTexts.push(hsc.label + '<br>' + hbadge);
							}
						}
						if (hScrewXs.length > 0) {
							heatmapData.push({
								type: 'scatter',
								mode: 'markers+text',
								x: hScrewXs,
								y: hScrewYs,
								text: hScrewTexts,
								textposition: 'top center',
								hoverinfo: 'text',
								marker: { size: 10, color: hScrewColors, line: { color: '#fff', width: 1.5 } },
								showlegend: false
							});
						}
					}
					var heatmapLayout = {
						autosize: true,
						plot_bgcolor: background_color,
						paper_bgcolor: background_color,
						margin: { l: 50, r: 10, b: 50, t: 20 },
						xaxis: { color: foreground_color, title: 'X (mm)' },
						yaxis: { color: foreground_color, title: 'Y (mm)' }
					};
					Plotly.react('bedlevelvisualizerheatmap', heatmapData, heatmapLayout, { displaylogo: false, responsive: true });
				} catch(hErr) {
					console.warn('Heatmap render error:', hErr);
				}
			} catch(err) {
				new PNotify({
						title: 'Bed Visualizer Error',
						text: '<div class="row-fluid">Errors while attempting render of mesh data.</div><div class="row-fluid">Error:</div><div class="row-fluid"><pre style="padding-top: 5px;">'+_.escape(err)+'</pre></div><div class="row-fluid">Received Data:</div><div class="row-fluid"><pre style="padding-top: 5px;">'+_.escape(data)+'</pre></div>',
						type: 'error',
						hide: false
						});
			}
		};

		self.postPlotHandler = function () {
				if(self.save_snapshots()){
					var export_filename = ((self.settingsViewModel.settings.appearance.name().length > 0) ? self.settingsViewModel.settings.appearance.name() : 'OctoPrint') + '_' + moment().format('YYYY-MM-DD_HH-mm-ss');
					Plotly.downloadImage('bedlevelvisualizergraph',{filename: export_filename});
				}
		};

		self.onAfterTabChange = function (current, previous) {
			if (current === "#tab_plugin_bedlevelvisualizer" && self.loginStateViewModel.isUser() && !self.processing()) {
				if (!self.save_mesh()) {
					if (self.controlViewModel.isOperational() && !self.controlViewModel.isPrinting()) {
						self.updateMesh();
					}
				} else if (self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh().length > 0) {
					self.drawMesh(self.mesh_data(),false,self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh_x(),self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh_y(),self.settingsViewModel.settings.plugins.bedlevelvisualizer.stored_mesh_z_height());
				}
			}
		};

		self.updateMesh = function () {
			self.processing(true);
			var gcode_cmds = self.settingsViewModel.settings.plugins.bedlevelvisualizer.command().split("\n");
			if (gcode_cmds.indexOf("@BEDLEVELVISUALIZER") == -1) {
				gcode_cmds = ["@BEDLEVELVISUALIZER"].concat(gcode_cmds);
			}
			// clean extraneous code
			gcode_cmds = gcode_cmds.filter(function(array_val) {
					return Boolean(array_val) === true;
				});

			self.timeout = setTimeout(function() {self.cancelMeshUpdate();new PNotify({title: 'Bed Visualizer Error',text: '<div class="row-fluid">Timeout occured before processing completed. Processing may still be running or there may be a configuration error. Consider increasing the Processing Timeout value in settings and restart OctoPrint.</div>',type: 'error',hide: false});}, (parseInt(self.settingsViewModel.settings.plugins.bedlevelvisualizer.timeout())*1000));
			// console.log(gcode_cmds);

			OctoPrint.control.sendGcode(gcode_cmds);
		};

		self.cancelMeshUpdate = function() {
			$.ajax({
				url: API_BASEURL + "plugin/bedlevelvisualizer",
				type: "GET",
				dataType: "json",
				data: {stopProcessing:true},
				contentType: "application/json; charset=UTF-8"
			}).done(function(data){
				if(data.stopped){
					clearTimeout(self.timeout);
					self.processing(false);
				}
				});
		};

		// Custom command list

		self.showEditor = function(data) {
			self.selected_command(data);
			$('#BedLevelVisulizerCommandEditor').modal('show');
		};

		self.copyCommand = function(data) {
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.commands.push({
																					icon: ko.observable(data.icon()),
																					label: ko.observable(data.label()),
																					tooltip: ko.observable(data.tooltip()),
																					command: ko.observable(data.command()),
																					confirmation: ko.observable(data.confirmation()),
																					message: ko.observable(data.message()),
																					enabled_while_printing: ko.observable(data.enabled_while_printing()),
																					enabled_while_graphing: ko.observable(data.enabled_while_graphing()),
																					input: ko.observableArray(data.input())});
		};

		self.moveCommandUp = function(data) {
			var currentIndex = self.settingsViewModel.settings.plugins.bedlevelvisualizer.commands.indexOf(data);
			if (currentIndex > 0) {
				var queueArray = self.settingsViewModel.settings.plugins.bedlevelvisualizer.commands();
				self.settingsViewModel.settings.plugins.bedlevelvisualizer.commands.splice(currentIndex-1, 2, queueArray[currentIndex], queueArray[currentIndex - 1]);
			}
		};

		self.moveCommandDown = function(data) {
			var currentIndex = self.settingsViewModel.settings.plugins.bedlevelvisualizer.commands.indexOf(data);
			if (currentIndex < self.settingsViewModel.settings.plugins.bedlevelvisualizer.commands().length - 1) {
				var queueArray = self.settingsViewModel.settings.plugins.bedlevelvisualizer.commands();
				self.settingsViewModel.settings.plugins.bedlevelvisualizer.commands.splice(currentIndex, 2, queueArray[currentIndex + 1], queueArray[currentIndex]);
			}
		};

		self.addCommand = function() {
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.commands.push({icon: ko.observable('fas fa-gear'), label: ko.observable(''), tooltip: ko.observable(''), command: ko.observable(''), confirmation: ko.observable(false), message: ko.observable(''), input: ko.observableArray([]), enabled_while_printing: ko.observable(false), enabled_while_graphing: ko.observable(false)});
		};

		self.removeCommand = function(data) {
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.commands.remove(data);
		};

		self.addScrew = function() {
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws.push({
				label: ko.observable(''),
				x: ko.observable(0),
				y: ko.observable(0)
			});
		};

		self.removeScrew = function(data) {
			self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws.remove(data);
		};

		self.autoConfigureScrews = function() {
			var bed = self.bed_info();
			if (!bed || (!bed.x_max && !bed.y_max)) {
				new PNotify({ title: 'Auto-configure', text: 'No bed data available. Run a mesh first.', type: 'warning', hide: true });
				return;
			}
			var raw = parseFloat(self.settingsViewModel.settings.plugins.bedlevelvisualizer.auto_configure_margin());
			var margin = (isNaN(raw) || raw <= 0) ? 30 : raw;
			var xMax = bed.x_max || 200;
			var yMax = bed.y_max || 200;
			var configs;
			if (bed.center_origin) {
				var hx = xMax / 2, hy = yMax / 2;
				configs = [
					{ label: 'FL', x: Math.round(-hx + margin), y: Math.round(-hy + margin) },
					{ label: 'FR', x: Math.round( hx - margin), y: Math.round(-hy + margin) },
					{ label: 'BL', x: Math.round(-hx + margin), y: Math.round( hy - margin) },
					{ label: 'BR', x: Math.round( hx - margin), y: Math.round( hy - margin) }
				];
			} else {
				configs = [
					{ label: 'FL', x: margin,         y: margin },
					{ label: 'FR', x: xMax - margin,  y: margin },
					{ label: 'BL', x: margin,         y: yMax - margin },
					{ label: 'BR', x: xMax - margin,  y: yMax - margin }
				];
			}
			var screwsList = self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws;
			screwsList.removeAll();
			ko.utils.arrayForEach(configs, function(c) {
				screwsList.push({ label: ko.observable(c.label), x: ko.observable(c.x), y: ko.observable(c.y) });
			});
			new PNotify({ title: 'Auto-configure', text: 'Screws configured for ' + Math.round(xMax) + 'x' + Math.round(yMax) + 'mm bed (margin: ' + margin + 'mm).', type: 'success', hide: true });
		};

		self.handleProbeResult = function(result) {
			// Find nearest configured screw within 2mm tolerance
			var screws = self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws();
			var bestKey = null, bestDist = Infinity;
			for (var si = 0; si < screws.length; si++) {
				var sx = parseFloat(ko.unwrap(screws[si].x));
				var sy = parseFloat(ko.unwrap(screws[si].y));
				var dist = Math.sqrt((sx - result.x) * (sx - result.x) + (sy - result.y) * (sy - result.y));
				if (dist < bestDist) { bestDist = dist; bestKey = sx + ',' + sy; }
			}
			if (bestKey === null || bestDist > 2) { bestKey = result.x + ',' + result.y; }
			var current = self.screw_probe_results();
			current[bestKey] = { z: result.z, timestamp: new Date().toLocaleTimeString() };
			self.screw_probe_results(Object.assign({}, current));

			if (self.screw_workflow_active()) {
				var step = self.screw_workflow_step();
				var screws = self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws();
				var nextStep = step + 1;
				if (nextStep < screws.length) {
					self.screw_workflow_step(nextStep);
					var next = screws[nextStep];
					var nx = parseFloat(ko.unwrap(next.x));
					var ny = parseFloat(ko.unwrap(next.y));
					var safeZ2 = parseFloat(self.settingsViewModel.settings.plugins.bedlevelvisualizer.safe_z_height()) || 5;
					OctoPrint.control.sendGcode(['G0 Z' + safeZ2 + ' F1000', 'G0 X' + nx + ' Y' + ny + ' F4000']);
				} else {
					self.screw_workflow_step(screws.length);
					self.screw_workflow_active(false);
				}
			}
		};

		self.startScrewWorkflow = function() {
			var screws = self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws();
			if (!screws.length) { return; }
			self.screw_probe_results({});
			self.screw_workflow_step(0);
			self.screw_workflow_active(true);
			var settings = self.settingsViewModel.settings.plugins.bedlevelvisualizer;
			var doHome = settings.home_before_workflow();
			var safeZ = parseFloat(settings.safe_z_height()) || 5;
			var first = screws[0];
			var cmds = [];
			if (doHome) { cmds.push('G28 X Y'); }
			cmds.push('G0 Z' + safeZ + ' F1000');
			cmds.push('G0 X' + parseFloat(ko.unwrap(first.x)) + ' Y' + parseFloat(ko.unwrap(first.y)) + ' F4000');
			OctoPrint.control.sendGcode(cmds);
		};

		self.stopScrewWorkflow = function() {
			self.screw_workflow_active(false);
			self.screw_workflow_step(-1);
		};

		self.probeCurrentScrew = function(screw) {
			var x = parseFloat(ko.unwrap(screw.x));
			var y = parseFloat(ko.unwrap(screw.y));
			OctoPrint.control.sendGcode(['G30 X' + x + ' Y' + y]);
		};

		self.moveToScrew = function(screw) {
			var x = parseFloat(ko.unwrap(screw.x));
			var y = parseFloat(ko.unwrap(screw.y));
			var safeZ3 = parseFloat(self.settingsViewModel.settings.plugins.bedlevelvisualizer.safe_z_height()) || 5;
			OctoPrint.control.sendGcode(['G0 Z' + safeZ3 + ' F1000', 'G0 X' + x + ' Y' + y + ' F4000']);
		};

		self.bilinearInterpolate = function(x, y, xs, ys, zs) {
			// xs : tableau trié des coordonnées X du mesh (longueur = nb colonnes)
			// ys : tableau trié des coordonnées Y du mesh (longueur = nb lignes)
			// zs : tableau 2D zs[j][i] = Z à (xs[i], ys[j])
			if (xs.length < 2 || ys.length < 2) { return { outOfBounds: true }; }

			var i0 = -1, i1 = -1;
			for (var i = 0; i < xs.length - 1; i++) {
				if (xs[i] <= x && x <= xs[i + 1]) { i0 = i; i1 = i + 1; break; }
			}
			var j0 = -1, j1 = -1;
			for (var j = 0; j < ys.length - 1; j++) {
				if (ys[j] <= y && y <= ys[j + 1]) { j0 = j; j1 = j + 1; break; }
			}
			if (i0 === -1 || j0 === -1) { return { outOfBounds: true }; }

			var tx = (x - xs[i0]) / (xs[i1] - xs[i0]);
			var ty = (y - ys[j0]) / (ys[j1] - ys[j0]);

			var z00 = parseFloat(zs[j0][i0]);
			var z10 = parseFloat(zs[j0][i1]);
			var z01 = parseFloat(zs[j1][i0]);
			var z11 = parseFloat(zs[j1][i1]);

			var z = (1 - tx) * (1 - ty) * z00
				   + tx       * (1 - ty) * z10
				   + (1 - tx) * ty       * z01
				   + tx       * ty       * z11;

			return { z: z, outOfBounds: false };
		};

		self.fitReferencePlane = function(points) {
			var n = points.length;
			if (n === 0) { return function() { return 0; }; }
			if (n === 1) {
				var z0 = points[0].z;
				return function() { return z0; };
			}
			if (n === 2) {
				var dx = points[1].x - points[0].x;
				var dy = points[1].y - points[0].y;
				var dz = points[1].z - points[0].z;
				var d2 = dx * dx + dy * dy;
				if (d2 < 1e-12) {
					var zavg2 = (points[0].z + points[1].z) / 2;
					return function() { return zavg2; };
				}
				var a2 = dz * dx / d2, b2 = dz * dy / d2;
				var c2 = points[0].z - a2 * points[0].x - b2 * points[0].y;
				return function(x2, y2) { return a2 * x2 + b2 * y2 + c2; };
			}
			var sx = 0, sy = 0, sz = 0;
			var sxx = 0, sxy = 0, sxz = 0;
			var syy = 0, syz = 0;
			for (var i = 0; i < n; i++) {
				var xi = points[i].x, yi = points[i].y, zi = points[i].z;
				sx  += xi;       sy  += yi;       sz  += zi;
				sxx += xi * xi;  sxy += xi * yi;  sxz += xi * zi;
				syy += yi * yi;  syz += yi * zi;
			}
			var M = [
				[sxx, sxy, sx],
				[sxy, syy, sy],
				[sx,  sy,  n ]
			];
			var rhs = [sxz, syz, sz];
			var aug = M.map(function(row, i) { return row.concat([rhs[i]]); });
			for (var col = 0; col < 3; col++) {
				var maxRow = col;
				for (var row = col + 1; row < 3; row++) {
					if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) { maxRow = row; }
				}
				var tmp = aug[col]; aug[col] = aug[maxRow]; aug[maxRow] = tmp;
				if (Math.abs(aug[col][col]) < 1e-12) { continue; }
				for (var r = col + 1; r < 3; r++) {
					var factor = aug[r][col] / aug[col][col];
					for (var c2 = col; c2 <= 3; c2++) {
						aug[r][c2] -= factor * aug[col][c2];
					}
				}
			}
			var sol = [0, 0, 0];
			for (var i2 = 2; i2 >= 0; i2--) {
				if (Math.abs(aug[i2][i2]) < 1e-12) { sol[i2] = 0; continue; }
				sol[i2] = aug[i2][3];
				for (var j2 = i2 + 1; j2 < 3; j2++) {
					sol[i2] -= aug[i2][j2] * sol[j2];
				}
				sol[i2] /= aug[i2][i2];
			}
			var a = sol[0], b = sol[1], c = sol[2];
			return function(x, y) { return a * x + b * y + c; };
		};

		self.screw_corrections = ko.computed(function() {
			if (!self.screws_bed_level_guide()) { return []; }

			var screws = self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws();
			var xs = self.mesh_data_x();
			var ys = self.mesh_data_y();
			var zs = self.mesh_data();
			var rawHub = parseFloat(self.screw_hub());
			if (isNaN(rawHub)) { return []; }
			var pitch = self.imperial() ? (rawHub !== 0 ? 25.4 / rawHub : 0) : rawHub;
			var rev = self.reverse();
			var mode = self.screw_reference_mode();
			var refIdx = parseInt(self.screw_reference_index(), 10);

			if (!xs.length || !ys.length || !zs.length || !screws.length) { return []; }

			var bed = self.bed_info();
			var useCentered = !!(bed.center_origin);
			var probeResults = self.screw_probe_results();

			// Pass 1 : interpolate Z for each screw
			var interpolated = ko.utils.arrayMap(screws, function(screw) {
				var label = ko.unwrap(screw.label) || '?';
				var x = parseFloat(ko.unwrap(screw.x));
				var y = parseFloat(ko.unwrap(screw.y));
				var ix = useCentered ? x - bed.x_max / 2 : x;
				var iy = useCentered ? y - bed.y_max / 2 : y;
				var result = self.bilinearInterpolate(ix, iy, xs, ys, zs);
				var probeKey = x + ',' + y;
				var probeEntry = probeResults[probeKey];
				var zValue = (probeEntry !== undefined) ? probeEntry.z : (result.outOfBounds ? null : result.z);
				var outOfBounds = (probeEntry !== undefined) ? false : result.outOfBounds;
				return {
					label: label, x: x, y: y,
					z: zValue,
					outOfBounds: outOfBounds,
					isProbed: (probeEntry !== undefined),
					probedAt: probeEntry ? probeEntry.timestamp : null
				};
			});

			// If G30 probe results exist, force screw-relative mode:
			// G30 returns absolute Z heights (~-9.7mm), not deviations.
			// Comparing to Z=0 or a plane makes no sense — only relative differences matter.
			var anyProbed = interpolated.some(function(e) { return e.isProbed; });
			if (anyProbed && mode !== 'screw') {
				mode = 'screw';
				// Use first non-out-of-bounds probed screw as reference
				for (var pi = 0; pi < interpolated.length; pi++) {
					if (!interpolated[pi].outOfBounds) { refIdx = pi; break; }
				}
			}

			// Pass 2 : build reference function
			var refZAt;
			if (mode === 'screw') {
				var refEntry = (refIdx >= 0 && refIdx < interpolated.length) ? interpolated[refIdx] : null;
				if (!refEntry) {
					// Reference screw index out of bounds — return error entries
					return ko.utils.arrayMap(interpolated, function(entry) {
						return { label: entry.label, x: entry.x, y: entry.y, z: '0.000',
						         display_state: 'refInvalid',
						         refInvalid: true, outOfBounds: false, pitchZero: false,
						         ok: false, isRef: false, tier: 'ok', delta: '0.000',
						         turns: '0.00', tighten: false, isProbed: false, probedAt: null };
					});
				}
				var refZ = (!refEntry.outOfBounds) ? refEntry.z : 0;
				refZAt = function(x, y, idx) { return refZ; };
			} else if (mode === 'plane') {
				var validPoints = [];
				for (var vi = 0; vi < interpolated.length; vi++) {
					if (!interpolated[vi].outOfBounds) {
						validPoints.push({ x: interpolated[vi].x, y: interpolated[vi].y, z: interpolated[vi].z });
					}
				}
				var planeFn = self.fitReferencePlane(validPoints);
				refZAt = function(x, y) { return planeFn(x, y); };
			} else {
				refZAt = function() { return 0; };
			}

			// Pass 3 : compute corrections
			return ko.utils.arrayMap(interpolated, function(entry, idx) {
				if (pitch === 0) {
					return { label: entry.label, x: entry.x, y: entry.y, z: '0.000',
					         display_state: 'pitchZero',
					         pitchZero: true, outOfBounds: false, refInvalid: false,
					         ok: false, isRef: false, tier: 'ok', delta: '0.000',
					         turns: '0.00', tighten: false, isProbed: false, probedAt: null };
				}
				if (entry.outOfBounds) {
					return { label: entry.label, x: entry.x, y: entry.y, z: '0.000',
					         display_state: 'outOfBounds',
					         outOfBounds: true, pitchZero: false, refInvalid: false,
					         ok: false, isRef: false, tier: 'ok', delta: '0.000',
					         turns: '0.00', tighten: false, isProbed: false, probedAt: null };
				}

				var isRef = (mode === 'screw' && idx === refIdx);
				var delta = entry.z - refZAt(entry.x, entry.y, idx);
				var turns = delta / pitch;
				var absTurns = Math.abs(turns);
				var ok = isRef || absTurns < 0.05;
				var absDeltaMm = Math.abs(delta);
				var tier = absDeltaMm < 0.05 ? 'ok' : (absDeltaMm < 0.2 ? 'warn' : 'critical');
				if (isRef) tier = 'ok';
				var tighten = (delta > 0) !== rev;

				return {
					label: entry.label,
					x: entry.x,
					y: entry.y,
					z: entry.z.toFixed(3),
					display_state: isRef ? 'ref' : (ok ? 'ok' : 'adjust'),
					delta: delta.toFixed(3),
					turns: absTurns.toFixed(2),
					ok: ok,
					tier: tier,
					tighten: tighten,
					isRef: isRef,
					outOfBounds: false,
					pitchZero: false,
					refInvalid: false,
					isProbed: entry.isProbed || false,
					probedAt: entry.probedAt || null
				};
			});
		}, self);

		self.mesh_stats = ko.computed(function() {
			var zs = self.mesh_data();
			if (!zs.length) { return null; }
			var flat = [];
			for (var r = 0; r < zs.length; r++) {
				for (var c = 0; c < zs[r].length; c++) {
					flat.push(parseFloat(zs[r][c]));
				}
			}
			if (!flat.length) { return null; }
			var min = flat[0], max = flat[0], sum = 0, sumSq = 0;
			for (var i = 0; i < flat.length; i++) {
				if (flat[i] < min) min = flat[i];
				if (flat[i] > max) max = flat[i];
				sum += flat[i];
				sumSq += flat[i] * flat[i];
			}
			var rms = Math.sqrt(sumSq / flat.length);
			var pp = max - min;
			var nOk = 0, nWarn = 0, nCrit = 0;
			for (var j = 0; j < flat.length; j++) {
				var az = Math.abs(flat[j]);
				if (az < 0.05) nOk++;
				else if (az < 0.2) nWarn++;
				else nCrit++;
			}
			var n = flat.length;
			var grade = pp < 0.05 ? 'A' : pp < 0.1 ? 'B' : pp < 0.2 ? 'C' : 'D';
			return {
				pp: pp.toFixed(3),
				rms: rms.toFixed(3),
				pctOk: Math.round(nOk / n * 100),
				pctWarn: Math.round(nWarn / n * 100),
				pctCrit: Math.round(nCrit / n * 100),
				grade: grade
			};
		}, self);
		self.mesh_patterns = ko.computed(function() {
			var zs = self.mesh_data();
			var xs = self.mesh_data_x();
			var ys = self.mesh_data_y();
			if (!zs.length || !xs.length || !ys.length) { return null; }

			var flat = [];
			for (var r = 0; r < zs.length; r++)
				for (var c = 0; c < zs[r].length; c++)
					flat.push(parseFloat(zs[r][c]));

			var patterns = [];

			// Uniform tilt: fit plane and check if plane tilt dominates
			var points = [];
			for (var r2 = 0; r2 < zs.length; r2++)
				for (var c2 = 0; c2 < zs[r2].length; c2++)
					points.push({ x: xs[c2], y: ys[r2], z: parseFloat(zs[r2][c2]) });
			var planeFn = self.fitReferencePlane(points);
			var planeResiduals = points.map(function(p) { return p.z - planeFn(p.x, p.y); });
			var residualRms = Math.sqrt(planeResiduals.reduce(function(s, v) { return s + v * v; }, 0) / planeResiduals.length);
			var totalRms = Math.sqrt(flat.reduce(function(s, v) { return s + v * v; }, 0) / flat.length);
			if (totalRms > 0.01 && residualRms < totalRms * 0.4) {
				patterns.push('Uniform tilt detected');
			}

			// Center bulge/sag: compare center mean to corner mean
			var centerRows = [Math.floor(zs.length / 2 - 0.5), Math.ceil(zs.length / 2 - 0.5)];
			var centerCols = [Math.floor(zs[0].length / 2 - 0.5), Math.ceil(zs[0].length / 2 - 0.5)];
			var centerVals = [];
			centerRows.forEach(function(r3) { centerCols.forEach(function(c3) {
				if (zs[r3] !== undefined && zs[r3][c3] !== undefined) centerVals.push(parseFloat(zs[r3][c3]));
			}); });
			if (!centerVals.length) { return patterns.length > 0 ? patterns : ['No significant pattern']; }
			var cornerVals = [
				parseFloat(zs[0][0]),
				parseFloat(zs[0][zs[0].length - 1]),
				parseFloat(zs[zs.length - 1][0]),
				parseFloat(zs[zs.length - 1][zs[0].length - 1])
			];
			var centerMean = centerVals.reduce(function(s, v) { return s + v; }, 0) / centerVals.length;
			var cornerMean = cornerVals.reduce(function(s, v) { return s + v; }, 0) / cornerVals.length;
			var bulge = centerMean - cornerMean;
			if (Math.abs(bulge) > 0.05) {
				patterns.push(bulge > 0 ? 'Center bulge (+' + bulge.toFixed(3) + 'mm)' : 'Center sag (' + bulge.toFixed(3) + 'mm)');
			}

			// Dominant corner: find which corner has highest absolute value
			var cornerLabels = ['Front-Left', 'Front-Right', 'Back-Left', 'Back-Right'];
			var maxCornerIdx = 0;
			for (var ci = 1; ci < cornerVals.length; ci++) {
				if (Math.abs(cornerVals[ci]) > Math.abs(cornerVals[maxCornerIdx])) maxCornerIdx = ci;
			}
			if (Math.abs(cornerVals[maxCornerIdx]) > 0.05) {
				patterns.push('Dominant corner: ' + cornerLabels[maxCornerIdx] + ' (' + cornerVals[maxCornerIdx].toFixed(3) + 'mm)');
			}

			return patterns.length > 0 ? patterns : ['No significant pattern'];
		}, self);

		self.screw_contribution = ko.computed(function() {
			var corrections = self.screw_corrections();
			if (!corrections.length) { return []; }
			var totalAbs = corrections.reduce(function(s, sc) {
				return s + ((!sc.outOfBounds && !sc.pitchZero && !sc.refInvalid && !sc.isRef) ? Math.abs(parseFloat(sc.delta)) : 0);
			}, 0);
			if (totalAbs < 1e-9) {
				return corrections.map(function(sc) { return { label: sc.label, pct: 0, delta: sc.delta || '0.000', tier: sc.tier || 'ok', isRef: sc.isRef || false }; });
			}
			var ranked = corrections.map(function(sc) {
				var pct = (!sc.outOfBounds && !sc.pitchZero && !sc.refInvalid && !sc.isRef)
					? Math.round(Math.abs(parseFloat(sc.delta)) / totalAbs * 100)
					: 0;
				return { label: sc.label, pct: pct, delta: sc.delta || '0.000', tier: sc.tier || 'ok', isRef: sc.isRef || false };
			});
			ranked.sort(function(a, b) { return b.pct - a.pct; });
			return ranked;
		}, self);

		self.thermal_drift = ko.computed(function() {
			var hist = self.mesh_history_list();
			var cold = hist.filter(function(e) { return e.bed_temp !== null && e.bed_temp !== undefined && e.bed_temp < 40 && Array.isArray(e.mesh) && e.mesh.length > 0; });
			var hot  = hist.filter(function(e) { return e.bed_temp !== null && e.bed_temp !== undefined && e.bed_temp > 50 && Array.isArray(e.mesh) && e.mesh.length > 0; });
			if (!cold.length || !hot.length) { return null; }

			function gridMean(entries) {
				var rows = entries[0].mesh.length, cols = entries[0].mesh[0].length;
				var grid = [];
				for (var gr = 0; gr < rows; gr++) {
					grid.push([]);
					for (var gc = 0; gc < cols; gc++) {
						var vals = entries.map(function(e) { return parseFloat(e.mesh[gr][gc]); }).filter(function(v) { return !isNaN(v); });
						grid[gr].push(vals.length ? vals.reduce(function(s, v) { return s + v; }, 0) / vals.length : 0);
					}
				}
				return grid;
			}

			try {
				var coldGrid = gridMean(cold);
				var hotGrid  = gridMean(hot);
				var diffs = [];
				for (var dr = 0; dr < coldGrid.length; dr++)
					for (var dc = 0; dc < coldGrid[dr].length; dc++)
						diffs.push(hotGrid[dr][dc] - coldGrid[dr][dc]);
				var meanDrift = diffs.reduce(function(s, v) { return s + v; }, 0) / diffs.length;
				var maxDrift  = diffs.reduce(function(a, v) { return Math.abs(v) > Math.abs(a) ? v : a; }, 0);
				return {
					cold_count: cold.length,
					hot_count: hot.length,
					mean_drift: meanDrift.toFixed(3),
					max_drift: maxDrift.toFixed(3)
				};
			} catch(e) {
				return null;
			}
		}, self);

		self.mesh_diff_data = ko.computed(function() {
			var hist = self.mesh_history_list();
			var ia = parseInt(self.mesh_diff_index_a());
			var ib = parseInt(self.mesh_diff_index_b());
			if (hist.length < 2 || ia === ib || ia >= hist.length || ib >= hist.length) { return null; }
			var a = hist[ia], b = hist[ib];
			if (!a.mesh || !b.mesh || !a.mesh.length || !b.mesh.length) { return null; }
			if (a.mesh.length !== b.mesh.length || !a.mesh[0] || !b.mesh[0] || a.mesh[0].length !== b.mesh[0].length) { return null; }
			var diff = a.mesh.map(function(row, r) {
				return row.map(function(z, c) { return (parseFloat(z) - parseFloat(b.mesh[r][c])).toFixed(4); });
			});
			return { diff: diff, mesh_x: a.mesh_x, mesh_y: a.mesh_y, ts_a: a.timestamp, ts_b: b.timestamp };
		}, self);

		self.klipper_screw_results_array = ko.computed(function() {
			return Object.values(self.klipper_screw_results()).filter(function(e) {
				return e && e.name;
			});
		}, self);

		self.addParameter = function(data) {
			data.input.push({label: ko.observable(''), parameter: ko.observable(''), value: ko.observable('')});
		};

		self.insertParameter = function(data) {
			var text = self.selected_command().command();
			text += '%(' + data.parameter() + ')s';
			self.selected_command().command(text);
			// console.log(data);
		};

		self.removeParameter = function(data) {
			var text = self.selected_command().command();
			var search = '%\\(' + data.parameter() + '\\)s';
			var re = new RegExp(search,"gm");
			var new_text = text.replace(re, '');
			self.selected_command().command(new_text);
			self.selected_command().input.remove(data);
		};

		self.restoreHistoryMesh = function(entry) {
			self.mesh_data(entry.mesh);
			self.mesh_data_x(entry.mesh_x);
			self.mesh_data_y(entry.mesh_y);
			self.mesh_data_z_height(entry.z_height);
			self.drawMesh(entry.mesh, false, entry.mesh_x, entry.mesh_y, entry.z_height);
		};

		self.drawPPChart = function(targetId) {
			var divId = targetId || 'bedlevelvisualizer_pp_chart';
			var hist = self.mesh_history_list();
			if (!hist.length) { return; }
			var timestamps = hist.map(function(e) { return e.timestamp; }).reverse();
			var ppValues   = hist.map(function(e) { return parseFloat(e.pp); }).reverse();
			var colors = ppValues.map(function(v) { return v < 0.05 ? '#55cc55' : v < 0.1 ? '#aacc00' : v < 0.2 ? '#ff9900' : '#ee4444'; });
			var ppTrace = {
				x: timestamps,
				y: ppValues,
				type: 'scatter',
				mode: 'lines+markers',
				line: { color: '#4af', width: 2 },
				marker: { color: colors, size: 8 },
				name: 'P-P (mm)',
				hoverinfo: 'x+y'
			};
			var background_color = $('#tabs_content').css('background-color') || '#1a1a1a';
			var foreground_color = $('#tabs_content').css('color') || '#cccccc';
			var ppLayout = {
				autosize: true,
				plot_bgcolor: background_color,
				paper_bgcolor: background_color,
				margin: { l: 50, r: 20, b: 80, t: 20 },
				xaxis: { color: foreground_color, tickangle: -40, automargin: true },
				yaxis: { color: foreground_color, title: 'P-P (mm)', rangemode: 'tozero' },
				shapes: [
					{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0.05, y1: 0.05, line: { color: '#55cc55', dash: 'dot', width: 1 } },
					{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0.1,  y1: 0.1,  line: { color: '#aacc00', dash: 'dot', width: 1 } },
					{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0.2,  y1: 0.2,  line: { color: '#ff9900', dash: 'dot', width: 1 } }
				]
			};
			Plotly.react(divId, [ppTrace], ppLayout, { displaylogo: false, responsive: true });
		};

		self.drawDiffChart = function(targetId) {
			var divId = targetId || 'bedlevelvisualizer_diff_chart';
			var diffData = self.mesh_diff_data();
			if (!diffData) { return; }
			var diffTrace = {
				type: 'surface',
				z: diffData.diff,
				x: diffData.mesh_x,
				y: diffData.mesh_y,
				colorscale: [[0,"#cc3333"],[0.25,"#ee7700"],[0.5,"#00bb44"],[0.75,"#ee7700"],[1,"#cc3333"]],
				colorbar: { tickfont: { color: '#cccccc' } }
			};
			var background_color = $('#tabs_content').css('background-color') || '#1a1a1a';
			var foreground_color = $('#tabs_content').css('color') || '#cccccc';
			var diffLayout = {
				autosize: true,
				plot_bgcolor: background_color,
				paper_bgcolor: background_color,
				margin: { l: 0, r: 0, b: 0, t: 40 },
				title: { text: 'Diff: ' + diffData.ts_a + ' vs ' + diffData.ts_b, font: { color: foreground_color, size: 11 } },
				scene: {
					xaxis: { color: foreground_color },
					yaxis: { color: foreground_color },
					zaxis: { color: foreground_color }
				}
			};
			Plotly.react(divId, [diffTrace], diffLayout, { displaylogo: false, responsive: true });
		};

		self.mesh_diff_data.subscribe(function(newVal) {
			if (newVal) {
				if (document.getElementById('bedlevelvisualizer_diff_chart_tab')) {
					self.drawDiffChart('bedlevelvisualizer_diff_chart_tab');
				}
				if (document.getElementById('bedlevelvisualizer_diff_chart')) {
					self.drawDiffChart('bedlevelvisualizer_diff_chart');
				}
			}
		});

		self.exportReport = function() {
			var stats = self.mesh_stats();
			if (!stats) {
				new PNotify({ title: 'Export', text: 'No mesh data to export.', type: 'warning', hide: true });
				return;
			}
			Plotly.toImage('bedlevelvisualizergraph', { format: 'png', width: 700, height: 450 }).then(function(imgUrl) {
				var bed = self.bed_info();
				var corrections = self.screw_corrections();
				var patterns = self.mesh_patterns() || [];
				var hist = self.mesh_history_list();

				function gradeClass(g) { return g === 'A' || g === 'B' ? 'ok' : g === 'C' ? 'warn' : 'bad'; }

				var html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">' +
					'<title>Bed Level Report</title><style>' +
					'body{font-family:monospace;background:#111;color:#ddd;padding:24px;max-width:900px;margin:0 auto}' +
					'h1{color:#fff;border-bottom:2px solid #444;padding-bottom:8px}' +
					'h2{color:#aaa;margin-top:24px}' +
					'table{border-collapse:collapse;width:100%;margin-top:8px}' +
					'td,th{border:1px solid #444;padding:6px 12px;text-align:left}' +
					'th{background:#222;color:#aaa}' +
					'.ok{color:#5c5}.warn{color:#f90}.bad{color:#e44}' +
					'img{max-width:100%;border:1px solid #444;border-radius:4px;margin-top:8px}' +
					'.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;margin:2px}' +
					'.badge-ok{background:#1a3a1a;border:1px solid #3a7a3a}' +
					'.badge-warn{background:#3a2a00;border:1px solid #997700}' +
					'.badge-bad{background:#3a0000;border:1px solid #993333}' +
					'@media print{body{background:#fff;color:#000}td,th{border-color:#ccc}h1,h2{color:#000}}' +
					'</style></head><body>';

				var bedStr = bed && bed.x_max ? Math.round(bed.x_max) + ' × ' + Math.round(bed.y_max) + ' mm' : 'Unknown';
				html += '<h1>Bed Level Report</h1>';
				html += '<p>Generated: <strong>' + new Date().toLocaleString() + '</strong> &nbsp;|&nbsp; Bed: <strong>' + bedStr + '</strong></p>';

				html += '<h2>Flatness</h2><table><tr><th>P-P</th><th>RMS</th><th>Grade</th><th>Distribution</th></tr><tr>';
				html += '<td class="' + (parseFloat(stats.pp) < 0.1 ? 'ok' : parseFloat(stats.pp) < 0.2 ? 'warn' : 'bad') + '">' + stats.pp + ' mm</td>';
				html += '<td>' + stats.rms + ' mm</td>';
				html += '<td class="' + gradeClass(stats.grade) + '">' + stats.grade + '</td>';
				html += '<td>' + stats.pctOk + '% ok / ' + stats.pctWarn + '% warn / ' + stats.pctCrit + '% critical</td>';
				html += '</tr></table>';

				if (patterns.length) {
					html += '<h2>Patterns</h2><ul>' + patterns.map(function(p) { return '<li>' + p + '</li>'; }).join('') + '</ul>';
				}

				html += '<h2>Mesh Visualization</h2><img src="' + imgUrl + '" alt="Mesh 3D view"/>';

				if (corrections.length) {
					html += '<h2>Screw Corrections</h2><table><tr><th>Screw</th><th>Position</th><th>Z</th><th>Delta</th><th>Turns</th><th>Action</th></tr>';
					corrections.forEach(function(sc) {
						var cls = sc.display_state === 'ok' || sc.display_state === 'ref' ? 'ok' : sc.tier === 'critical' ? 'bad' : 'warn';
						var action = sc.display_state === 'ref' ? 'REF' :
									 sc.display_state === 'ok'  ? '✓ OK' :
									 sc.display_state === 'adjust' ? (sc.tighten ? '↓ Tighten' : '↑ Loosen') + ' ' + sc.turns + ' turns' : sc.display_state;
						html += '<tr><td class="' + cls + '">' + sc.label + '</td>' +
								'<td>X=' + sc.x + ' Y=' + sc.y + '</td>' +
								'<td>' + sc.z + ' mm</td>' +
								'<td>' + sc.delta + ' mm</td>' +
								'<td>' + sc.turns + '</td>' +
								'<td class="' + cls + '">' + action + '</td></tr>';
					});
					html += '</table>';
				}

				if (hist.length) {
					html += '<h2>Mesh History (last ' + hist.length + ')</h2>';
					html += '<table><tr><th>Date</th><th>P-P</th><th>Grade</th><th>Bed Temp</th></tr>';
					hist.forEach(function(e) {
						html += '<tr><td>' + e.timestamp + '</td>' +
								'<td class="' + (parseFloat(e.pp) < 0.1 ? 'ok' : parseFloat(e.pp) < 0.2 ? 'warn' : 'bad') + '">' + e.pp + ' mm</td>' +
								'<td class="' + gradeClass(e.grade || 'D') + '">' + (e.grade || '?') + '</td>' +
								'<td>' + (e.bed_temp !== null && e.bed_temp !== undefined ? e.bed_temp + ' °C' : 'N/A') + '</td></tr>';
					});
					html += '</table>';
				}

				html += '<hr style="margin-top:32px;border-color:#444"><p style="color:#666;font-size:10px">OctoPrint BedLevelVisualizer — RoJLD fork</p></body></html>';

				var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
				var url = URL.createObjectURL(blob);
				var a = document.createElement('a');
				a.href = url;
				a.download = 'bed-level-report-' + new Date().toISOString().slice(0, 10) + '.html';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
			}).catch(function() {
				new PNotify({ title: 'Export', text: 'Could not capture graph image. Report without image.', type: 'warning' });
			});
		};

		self.runCustomCommand = function(data) {
			var gcode_cmds = data.command().split("\n");
			var parameters = {};

			// clean extraneous code
			gcode_cmds = gcode_cmds.filter(function(array_val) {
					var x = Boolean(array_val);
					return x === true;
				});
			if (data.input().length > 0) {
				_.each(data.input(), function (input) {
					if (!input.hasOwnProperty("parameter") || !input.hasOwnProperty("value")) {
						return;
					}
					parameters[input.parameter()] = input.value();
				});
			}
			if (data.confirmation()) {
				showConfirmationDialog({
					message: data.message(),
					onproceed: function () {
						OctoPrint.control.sendGcodeWithParameters(gcode_cmds, parameters);
					}
				});
			} else {
				OctoPrint.control.sendGcodeWithParameters(gcode_cmds, parameters);
			}
			event.currentTarget.blur();
		};
	}

	OCTOPRINT_VIEWMODELS.push({
		construct: bedlevelvisualizerViewModel,
		dependencies: ["settingsViewModel", "controlViewModel", "loginStateViewModel"],
		elements: ["#settings_plugin_bedlevelvisualizer", "#tab_plugin_bedlevelvisualizer", "#wizard_plugin_bedlevelvisualizer"]
	});
});
