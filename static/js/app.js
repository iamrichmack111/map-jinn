(() => {
  'use strict';

  const MAP_SERVICE = 'https://gis.atlantaga.gov/dpcd/rest/services/OpenDataService1/MapServer';
  const FEATURE_SERVICE = 'https://gis.atlantaga.gov/dpcd/rest/services/OpenDataService1/FeatureServer';
  const NATIONAL_BUILDINGS_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/ArcGIS/rest/services/USA_Structures_View/FeatureServer/0';
  const FOOTPRINT_DETAIL_SCALE = 55000;
  const NATIONAL_FOOTPRINT_DETAIL_SCALE = 10000;
  const NATIONAL_RENDER_SCALE_LIMIT = 70000;
  const REFERENCE_ROADS_SCALE_LIMIT = 22000;
  const NATIONAL_VISIBLE_FEATURE_CAP = 1200;
  const NATIONAL_ZIPS = 'https://services.arcgis.com/V6ZHFr6zdgNZuVG0/ArcGIS/rest/services/USA_Zip_codes_polygons/FeatureServer/0';
  const NATIONAL_PLACES = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Census_Populated_Places/FeatureServer/0';
  const NATIONAL_ROADS = 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Transportation/MapServer';
  const US_GEOCODER = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

  const $ = (id) => document.getElementById(id);
  const state = {
    mode: 'auto',
    style: 'filled',
    theme: 'dark',
    selectionGeometry: null,
    selectionName: 'City of Atlanta',
    selectionType: 'CITY LIMITS',
    exportBusy: false,
    source: 'atlanta',
    atlantaExtent: null,
    footprintAreas: [],
    activeAreaId: null,
    nextAreaId: 1,
  };

  const dom = {
    areaInput: $('areaInput'), goBtn: $('goBtn'), atlantaBtn: $('atlantaBtn'), themeBtn: $('themeBtn'), focusBtn: $('focusBtn'),
    modeBtns: [...document.querySelectorAll('.mode-btn')], styleBtns: [...document.querySelectorAll('.style-btn')],
    footprintsToggle: $('footprintsToggle'), streetsToggle: $('streetsToggle'), boundaryToggle: $('boundaryToggle'),
    opacityRange: $('opacityRange'), opacityValue: $('opacityValue'), mapLoading: $('mapLoading'),
    searchMessage: $('searchMessage'), searchModeBadge: $('searchModeBadge'),
    areaName: $('areaName'), areaType: $('areaType'), buildingCount: $('buildingCount'), footprintArea: $('footprintArea'), mapScale: $('mapScale'), mapTitle: $('mapTitle'),
    pngBtn: $('pngBtn'), geojsonBtn: $('geojsonBtn'), csvBtn: $('csvBtn'), exportMessage: $('exportMessage'),
    toast: $('toast'), neighborhoodList: $('neighborhoodList'),
    footprintAreaList: $('footprintAreaList'), footprintAreaCount: $('footprintAreaCount'), clearFootprintAreasBtn: $('clearFootprintAreasBtn'),
    locationLabelToggle: $('locationLabelToggle'), coordsLabelToggle: $('coordsLabelToggle'), customLabelInput: $('customLabelInput'),
    labelPosition: $('labelPosition'), labelCase: $('labelCase'), labelSizeRange: $('labelSizeRange'), labelSizeValue: $('labelSizeValue'), labelBadge: $('labelBadge'),
  };

  let toastTimer;
  function toast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 2800);
  }

  function setSearchStatus(message, busy = false) {
    dom.searchMessage.innerHTML = `<span class="status-dot"></span>${message}`;
    dom.goBtn.disabled = busy;
    dom.goBtn.textContent = busy ? '...' : 'Go';
  }

  function humanNumber(value) {
    const n = Number(value || 0);
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
  }

  function humanAreaSqft(value) {
    const sqft = Number(value || 0);
    if (!sqft) return '—';
    const acres = sqft / 43560;
    if (acres >= 1000) return `${(acres / 640).toLocaleString('en-US', { maximumFractionDigits: 1 })} mi²`;
    return `${acres.toLocaleString('en-US', { maximumFractionDigits: acres < 100 ? 1 : 0 })} ac`;
  }

  window.require([
    'esri/Map',
    'esri/views/MapView',
    'esri/layers/MapImageLayer',
    'esri/layers/FeatureLayer',
    'esri/layers/TileLayer',
    'esri/layers/GraphicsLayer',
    'esri/Graphic',
    'esri/geometry/Extent',
    'esri/geometry/geometryEngine',
    'esri/widgets/Home',
    'esri/widgets/Zoom',
    'esri/widgets/Compass',
    'esri/widgets/ScaleBar'
  ], function(Map, MapView, MapImageLayer, FeatureLayer, TileLayer, GraphicsLayer, Graphic, Extent, geometryEngine, Home, Zoom, Compass, ScaleBar) {

    const map = new Map({ basemap: null });

    const view = new MapView({
      container: 'viewDiv',
      map,
      center: [-84.388, 33.749],
      scale: FOOTPRINT_DETAIL_SCALE,
      ui: { components: [] },
      constraints: { minZoom: 3, maxZoom: 20, rotationEnabled: false },
      highlightOptions: { color: '#8dffa5', fillOpacity: 0.08, haloOpacity: 0.9 },
    });

    function backgroundForTheme() {
      return state.theme === 'dark' ? { color: [18, 23, 20, 1] } : { color: [247, 249, 247, 1] };
    }
    try { view.background = backgroundForTheme(); } catch (_) {}

    const streetsLayer = new MapImageLayer({
      url: MAP_SERVICE,
      title: 'Atlanta Street Centerlines',
      sublayers: [{
        id: 33,
        visible: true,
        labelsVisible: true,
        renderer: {
          type: 'simple',
          symbol: { type: 'simple-line', color: [116, 145, 124, 0.42], width: 0.55 }
        },
        labelingInfo: [{
          labelExpressionInfo: { expression: '$feature.LABEL' },
          labelPlacement: 'above-along',
          minScale: 28000,
          symbol: {
            type: 'text', color: [181, 196, 185, 0.68], haloColor: [14, 18, 16, 0.96], haloSize: 1,
            font: { family: 'Arial', size: 7.5, weight: 'normal' }
          }
        }]
      }]
    });

    const footprintsLayer = new MapImageLayer({
      url: MAP_SERVICE,
      title: 'Atlanta Building Footprints',
      sublayers: [{ id: 10, visible: true }]
    });

    const cityBoundaryLayer = new MapImageLayer({
      url: MAP_SERVICE,
      title: 'Atlanta City Boundary',
      sublayers: [{
        id: 1,
        visible: true,
        renderer: {
          type: 'simple',
          symbol: { type: 'simple-fill', color: [0,0,0,0], outline: { color: [123,255,151,0.88], width: 1.4, style: 'dash' } }
        }
      }]
    });

    const nationalRoadsLayer = new TileLayer({
      url: NATIONAL_ROADS,
      title: 'Clean National Street Reference',
      visible: false,
      opacity: 0.36,
    });

    // IMPORTANT: do not add the nationwide FeatureLayer directly to the map.
    // A direct nationwide FeatureLayer can ask the browser to retain far too
    // many polygons and can freeze lower-memory machines. Instead, query only
    // the current viewport into this lightweight GraphicsLayer.
    const nationalFootprintsLayer = new GraphicsLayer({
      title: 'USA Building Footprints',
      visible: false,
      opacity: 0.78,
    });

    const footprintAreasLayer = new GraphicsLayer({ title: 'Chosen footprint areas' });
    const selectionLayer = new GraphicsLayer({ title: 'Selected area' });
    const apparelLabelsLayer = new GraphicsLayer({ title: 'Apparel labels' });
    map.addMany([nationalRoadsLayer, streetsLayer, footprintAreasLayer, nationalFootprintsLayer, footprintsLayer, cityBoundaryLayer, selectionLayer, apparelLabelsLayer]);

    const buildingsQuery = new FeatureLayer({ url: `${FEATURE_SERVICE}/10`, outFields: ['*'], visible: false });
    const cityQuery = new FeatureLayer({ url: `${FEATURE_SERVICE}/1`, outFields: ['*'], visible: false });
    const zipQuery = new FeatureLayer({ url: `${FEATURE_SERVICE}/6`, outFields: ['NAME'], visible: false });
    const neighborhoodQuery = new FeatureLayer({ url: `${FEATURE_SERVICE}/3`, outFields: ['NAME'], visible: false });
    // Current public USA Structures polygon service (FEMA/ORNL data in ArcGIS Living Atlas).
    // Query it directly so the app does not depend on portal-item resolution.
    const nationalBuildingsQuery = new FeatureLayer({
      url: NATIONAL_BUILDINGS_URL,
      outFields: ['OBJECTID', 'SQFEET'],
      visible: false
    });
    const nationalZipQuery = new FeatureLayer({ url: NATIONAL_ZIPS, outFields: ['ZIP_CODE','PO_NAME','STATE'], visible: false });
    const nationalPlaceQuery = new FeatureLayer({ url: NATIONAL_PLACES, outFields: ['NAME','ST','POPULATION','POP_CLASS'], visible: false });

    function viewingOutsideAtlanta() {
      if (!state.atlantaExtent || !view.center) return false;
      try { return !state.atlantaExtent.contains(view.center); }
      catch (_) { return false; }
    }

    function activeFootprintArea() {
      return state.footprintAreas.find(area => area.id === state.activeAreaId) || null;
    }

    function normalizeAreaKey(name, type) {
      return `${String(type || '').trim().toUpperCase()}::${String(name || '').trim().toLowerCase()}`;
    }

    function areaContainsPoint(area, point) {
      if (!area?.geometry || !point) return false;
      try {
        if (area.geometry.type === 'extent') return area.geometry.contains(point);
        return geometryEngine.contains(area.geometry, point) || Boolean(area.geometry.extent?.contains(point));
      } catch (_) {
        try { return Boolean(area.geometry.extent?.contains(point)); } catch (_) { return false; }
      }
    }

    function selectedAreaAtCenter() {
      if (!view.center) return null;
      const active = activeFootprintArea();
      if (active && areaContainsPoint(active, view.center)) return active;
      return state.footprintAreas.find(area => areaContainsPoint(area, view.center)) || null;
    }

    function syncLayerVisibility() {
      const active = activeFootprintArea();
      const activeAtlanta = active?.source === 'atlanta';
      const activeNational = active?.source === 'national';
      const activeHere = Boolean(active && view.center && areaContainsPoint(active, view.center));
      const closeEnoughForRoads = Number(view.scale || Infinity) <= REFERENCE_ROADS_SCALE_LIMIT;

      // Footprint-only rule: when zoomed out, reference roads disappear instead
      // of taking over the canvas. The selected footprint-area outlines remain.
      // Panning into an unselected place also stays blank instead of showing a
      // conventional road map.
      footprintsLayer.visible = Boolean(activeAtlanta && activeHere && dom.footprintsToggle.checked);
      streetsLayer.visible = Boolean(activeAtlanta && activeHere && dom.streetsToggle.checked && closeEnoughForRoads);
      cityBoundaryLayer.visible = Boolean(activeAtlanta && dom.boundaryToggle.checked);
      nationalFootprintsLayer.visible = Boolean(activeNational && activeHere && dom.footprintsToggle.checked);
      nationalRoadsLayer.visible = Boolean(activeNational && activeHere && dom.streetsToggle.checked && closeEnoughForRoads);
      footprintAreasLayer.visible = Boolean(dom.boundaryToggle.checked);
    }

    function useAtlantaLayers() {
      state.source = 'atlanta';
      syncLayerVisibility();
      nationalLoadToken++;
      if (nationalAbortController) { nationalAbortController.abort(); nationalAbortController = null; }
      nationalFootprintsLayer.removeAll();
    }

    function useNationalLayers() {
      state.source = 'national';
      syncLayerVisibility();
      scheduleNationalFootprintsRefresh(40);
    }

    function drawFootprintAreas() {
      footprintAreasLayer.removeAll();
      const dark = state.theme === 'dark';
      for (const area of state.footprintAreas) {
        if (!area.geometry) continue;
        const active = area.id === state.activeAreaId;
        footprintAreasLayer.add(new Graphic({
          geometry: area.geometry,
          symbol: {
            type: 'simple-fill',
            color: active ? (dark ? [87,240,124,0.055] : [22,168,63,0.045]) : [0,0,0,0],
            outline: {
              color: active ? (dark ? [123,255,151,0.92] : [14,142,49,0.9]) : (dark ? [123,255,151,0.52] : [14,142,49,0.48]),
              width: active ? 2 : 1,
              style: active ? 'solid' : 'dash'
            }
          },
          attributes: { areaId: area.id, label: area.name }
        }));
      }
    }

    function renderFootprintAreaList() {
      dom.footprintAreaCount.textContent = String(state.footprintAreas.length);
      if (!state.footprintAreas.length) {
        dom.footprintAreaList.innerHTML = '<div class="footprint-area-empty">Search a ZIP, city, town, county, street, or address to save it here.</div>';
        return;
      }
      dom.footprintAreaList.innerHTML = state.footprintAreas.map(area => {
        const safeName = String(area.name).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
        const safeType = String(area.type || 'AREA').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
        const activeClass = area.id === state.activeAreaId ? ' active' : '';
        return `<div class="footprint-area-item${activeClass}" data-area-id="${area.id}"><button class="footprint-area-select" data-action="select" type="button"><span class="footprint-area-copy"><strong>${safeName}</strong><small>${safeType}</small></span><span class="footprint-area-arrow">›</span></button><button class="footprint-area-remove" data-action="remove" type="button" aria-label="Remove ${safeName}">×</button></div>`;
      }).join('');
    }

    function rememberFootprintArea({ name, type, source, geometry, mapTitle }) {
      if (!geometry) return null;
      const key = normalizeAreaKey(name, type);
      let area = state.footprintAreas.find(item => item.key === key);
      if (!area) {
        area = { id: `area-${state.nextAreaId++}`, key, name, type, source, geometry, mapTitle: mapTitle || name };
        state.footprintAreas.push(area);
      } else {
        Object.assign(area, { name, type, source, geometry, mapTitle: mapTitle || name });
      }
      state.activeAreaId = area.id;
      drawFootprintAreas();
      renderFootprintAreaList();
      return area;
    }

    async function activateFootprintArea(area, navigate = true) {
      if (!area) return;
      state.activeAreaId = area.id;
      state.source = area.source;
      state.selectionGeometry = area.geometry;
      state.selectionName = area.name;
      state.selectionType = area.type;
      dom.areaName.textContent = area.name;
      dom.areaType.textContent = area.type;
      dom.mapTitle.textContent = area.mapTitle || area.name;
      drawSelection(area.source === 'atlanta' && area.type === 'CITY LIMITS' ? null : area.geometry, area.name);
      drawFootprintAreas();
      renderFootprintAreaList();
      syncLayerVisibility();
      if (navigate) await goToFootprintView(area.geometry, 1.08);
      if (area.source === 'national') scheduleNationalFootprintsRefresh(60);
      queryStats(area.geometry);
      refreshApparelLabels();
      setSearchStatus(`${area.name} selected. Zoom and pan normally; footprints stay primary.`);
    }

    function removeFootprintArea(id) {
      const wasActive = state.activeAreaId === id;
      state.footprintAreas = state.footprintAreas.filter(area => area.id !== id);
      if (wasActive) state.activeAreaId = state.footprintAreas[0]?.id || null;
      drawFootprintAreas();
      renderFootprintAreaList();
      if (!state.activeAreaId) {
        nationalLoadToken++;
        if (nationalAbortController) { nationalAbortController.abort(); nationalAbortController = null; }
        nationalFootprintsLayer.removeAll();
        footprintsLayer.visible = false;
        streetsLayer.visible = false;
        nationalRoadsLayer.visible = false;
        cityBoundaryLayer.visible = false;
        selectionLayer.removeAll();
        state.selectionGeometry = null;
        dom.areaName.textContent = 'No area selected';
        dom.areaType.textContent = 'FOOTPRINT ONLY';
        dom.buildingCount.textContent = '—';
        dom.footprintArea.textContent = '—';
        dom.mapTitle.textContent = 'Choose a footprint area';
        setSearchStatus('Search a place to add it to Footprint Areas.');
      } else if (wasActive) {
        activateFootprintArea(activeFootprintArea(), true).catch(console.error);
      }
      syncLayerVisibility();
    }

    function labelAnchorPoint() {
      if (!view?.width || !view?.height) return view.center;
      const position = dom.labelPosition?.value || 'bottom';
      const y = position === 'top' ? view.height * 0.17 : position === 'center' ? view.height * 0.50 : view.height * 0.82;
      try { return view.toMap({ x: view.width * 0.50, y }); }
      catch (_) { return view.center; }
    }

    function formatLabelText(text) {
      const value = String(text || '').trim();
      return dom.labelCase?.value === 'normal' ? value : value.toUpperCase();
    }

    function currentCoordinateLabel() {
      const point = view.center;
      if (!point) return '';
      const lat = Number(point.latitude);
      const lon = Number(point.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
      const ns = lat >= 0 ? 'N' : 'S';
      const ew = lon >= 0 ? 'E' : 'W';
      return `${Math.abs(lat).toFixed(4)}° ${ns}  ·  ${Math.abs(lon).toFixed(4)}° ${ew}`;
    }

    function refreshApparelLabels() {
      apparelLabelsLayer.removeAll();
      const lines = [];
      if (dom.locationLabelToggle?.checked && state.selectionName) lines.push(formatLabelText(state.selectionName));
      const custom = formatLabelText(dom.customLabelInput?.value || '');
      if (custom) lines.push(custom);
      if (dom.coordsLabelToggle?.checked) {
        const coords = currentCoordinateLabel();
        if (coords) lines.push(formatLabelText(coords));
      }
      const enabled = lines.length > 0;
      if (dom.labelBadge) dom.labelBadge.textContent = enabled ? 'ON' : 'OFF';
      if (!enabled) return;

      const size = Number(dom.labelSizeRange?.value || 28);
      const dark = state.theme === 'dark';
      const point = labelAnchorPoint();
      if (!point) return;
      const gap = Math.max(18, Math.round(size * 0.95));
      const total = lines.length;
      lines.forEach((line, index) => {
        const isPrimary = index === 0;
        const offset = ((total - 1) / 2 - index) * gap;
        apparelLabelsLayer.add(new Graphic({
          geometry: point,
          symbol: {
            type: 'text',
            text: line,
            color: dark ? [237,245,239,0.98] : [19,31,23,0.98],
            haloColor: dark ? [10,14,12,0.96] : [248,250,248,0.96],
            haloSize: Math.max(1.2, size / 14),
            yoffset: offset,
            horizontalAlignment: 'center',
            verticalAlignment: 'middle',
            font: {
              family: 'Arial',
              size: isPrimary ? size : Math.max(11, Math.round(size * 0.54)),
              weight: isPrimary ? 'bold' : 'normal'
            }
          }
        }));
      });
    }

    async function goToFootprintView(geometry, paddingFactor = 1.08) {
      // Footprint map rule: never animate through a regional/road-map view.
      // Every selected place opens directly at a building-readable scale.
      const targetExtent = geometry?.extent || geometry;
      if (!targetExtent) return;
      const center = targetExtent.center || view.center;
      const detailScale = state.source === 'national' ? NATIONAL_FOOTPRINT_DETAIL_SCALE : FOOTPRINT_DETAIL_SCALE;
      await view.goTo({ center, scale: detailScale }, { duration: 550 });
    }

    function footprintRenderer() {
      const dark = state.theme === 'dark';
      if (state.style === 'outline') {
        return {
          type: 'simple',
          symbol: {
            type: 'simple-fill', color: [0,0,0,0],
            outline: { color: dark ? [95,255,128,0.96] : [12,146,49,0.92], width: 0.8 }
          }
        };
      }
      if (state.style === 'dense') {
        return {
          type: 'simple',
          symbol: {
            type: 'simple-fill', color: dark ? [18,154,59,0.76] : [40,178,72,0.66],
            outline: { color: dark ? [115,255,145,0.86] : [7,123,37,0.82], width: 0.35 }
          }
        };
      }
      return {
        type: 'simple',
        symbol: {
          type: 'simple-fill', color: dark ? [44,205,82,0.36] : [58,190,83,0.38],
          outline: { color: dark ? [103,255,133,0.92] : [8,139,40,0.88], width: 0.55 }
        }
      };
    }

    function applyStyle() {
      const fp = footprintsLayer.findSublayerById(10);
      if (fp) {
        fp.renderer = footprintRenderer();
        fp.opacity = Number(dom.opacityRange.value) / 100;
      }
      const street = streetsLayer.findSublayerById(33);
      if (street) {
        const dark = state.theme === 'dark';
        street.renderer = {
          type: 'simple',
          symbol: { type: 'simple-line', color: dark ? [116,145,124,0.42] : [100,118,104,0.38], width: 0.55 }
        };
        street.labelingInfo = [{
          labelExpressionInfo: { expression: '$feature.LABEL' },
          labelPlacement: 'above-along', minScale: 28000,
          symbol: {
            type: 'text', color: dark ? [181,196,185,0.68] : [74,84,77,0.64],
            haloColor: dark ? [15,19,17,0.96] : [249,250,248,0.98], haloSize: 1,
            font: { family: 'Arial', size: 7.5 }
          }
        }];
      }
      const city = cityBoundaryLayer.findSublayerById(1);
      if (city) {
        city.renderer = {
          type: 'simple',
          symbol: { type: 'simple-fill', color: [0,0,0,0], outline: { color: state.theme === 'dark' ? [139,255,163,0.88] : [15,134,45,0.82], width: 1.4, style: 'dash' } }
        };
      }
      nationalFootprintsLayer.opacity = Number(dom.opacityRange.value) / 100;
      nationalRoadsLayer.opacity = state.theme === 'dark' ? 0.36 : 0.30;
      const nationalSymbol = footprintRenderer().symbol;
      nationalFootprintsLayer.graphics.forEach(graphic => { graphic.symbol = nationalSymbol; });
      try { view.background = backgroundForTheme(); } catch (_) {}
      drawFootprintAreas();
      refreshApparelLabels();
    }

    let nationalLoadToken = 0;
    let nationalRefreshTimer = null;
    let nationalLastCapToast = 0;
    let nationalAbortController = null;

    function scheduleNationalFootprintsRefresh(delay = 180) {
      clearTimeout(nationalRefreshTimer);
      nationalRefreshTimer = setTimeout(() => refreshNationalFootprints().catch(error => {
        if (error?.name === 'AbortError') return;
        console.error('National footprint refresh failed', error);
        setSearchStatus('National footprints could not load. Pan/zoom or try the search again.');
      }), delay);
    }

    async function refreshNationalFootprints() {
      const token = ++nationalLoadToken;
      const active = activeFootprintArea();
      if (!active || active.source !== 'national' || !nationalFootprintsLayer.visible || !dom.footprintsToggle.checked || !view.extent || !view.stationary) {
        nationalFootprintsLayer.removeAll();
        return;
      }

      // Never become a conventional map at regional scale. At wide zoom we
      // keep only the chosen footprint-area outlines on the dark/paper canvas.
      if (view.scale > NATIONAL_RENDER_SCALE_LIMIT) {
        nationalFootprintsLayer.removeAll();
        nationalRoadsLayer.visible = false;
        setSearchStatus('Footprint overview. Zoom in to see individual building polygons.');
        return;
      }

      let queryGeometry = null;
      try { queryGeometry = geometryEngine.intersect(view.extent, active.geometry); } catch (_) {}
      if (!queryGeometry) {
        nationalFootprintsLayer.removeAll();
        setSearchStatus('Move into the selected footprint area or choose another place.');
        return;
      }

      await nationalBuildingsQuery.load();
      const q = nationalBuildingsQuery.createQuery();
      q.where = '1=1';
      q.geometry = queryGeometry;
      q.spatialRelationship = 'intersects';
      q.returnGeometry = true;
      q.outFields = ['OBJECTID'];
      q.outSpatialReference = view.spatialReference;
      q.num = NATIONAL_VISIBLE_FEATURE_CAP;
      q.start = 0;
      q.maxAllowableOffset = Math.max(0.35, Math.min(1.5, Number(view.resolution || 1) * 0.25));

      if (nationalAbortController) nationalAbortController.abort();
      nationalAbortController = new AbortController();
      let result;
      try {
        result = await nationalBuildingsQuery.queryFeatures(q, { signal: nationalAbortController.signal });
      } catch (error) {
        if (error?.name === 'AbortError') return;
        throw error;
      } finally {
        if (token === nationalLoadToken) nationalAbortController = null;
      }
      if (token !== nationalLoadToken || !nationalFootprintsLayer.visible) return;

      const symbol = footprintRenderer().symbol;
      const features = (result.features || []).slice(0, NATIONAL_VISIBLE_FEATURE_CAP);
      for (const feature of features) {
        feature.symbol = symbol;
        feature.popupTemplate = null;
      }

      // Replace the old viewport in one operation so memory stays bounded.
      nationalFootprintsLayer.removeAll();
      if (features.length) nationalFootprintsLayer.addMany(features);
      if (features.length) setSearchStatus(`${humanNumber(features.length)} visible U.S. footprints loaded.`);
      else setSearchStatus('No building footprints returned for this view. Try zooming or moving slightly.');

      if (result.exceededTransferLimit || features.length >= NATIONAL_VISIBLE_FEATURE_CAP) {
        const now = Date.now();
        if (now - nationalLastCapToast > 5000) {
          toast('Dense area: zoom in for complete footprint detail');
          nationalLastCapToast = now;
        }
      }
    }

    function drawSelection(geometry, label) {
      selectionLayer.removeAll();
      if (!geometry) return;
      selectionLayer.add(new Graphic({
        geometry,
        symbol: {
          type: 'simple-fill',
          color: state.theme === 'dark' ? [84,255,119,0.025] : [15,170,55,0.025],
          outline: { color: state.theme === 'dark' ? [160,255,180,0.95] : [5,125,35,0.9], width: 2, style: 'dash' }
        },
        attributes: { label },
        popupTemplate: { title: label, content: 'Selected analysis area' }
      }));
    }

    async function queryStats(geometry) {
      dom.buildingCount.textContent = '…';
      dom.footprintArea.textContent = '…';
      const layer = state.source === 'national' ? nationalBuildingsQuery : buildingsQuery;
      const areaField = state.source === 'national' ? 'SQFEET' : 'AREASQFT';
      // National city/ZIP polygons can contain hundreds of thousands of structures.
      // Keep stats lightweight by reporting the current rendered viewport in national mode.
      const statsGeometry = state.source === 'national' ? view.extent : geometry;
      try {
        const countQuery = layer.createQuery();
        countQuery.where = '1=1';
        if (statsGeometry) { countQuery.geometry = statsGeometry; countQuery.spatialRelationship = 'intersects'; }
        const count = await layer.queryFeatureCount(countQuery);
        dom.buildingCount.textContent = humanNumber(count);

        const statQuery = layer.createQuery();
        statQuery.where = '1=1';
        if (statsGeometry) { statQuery.geometry = statsGeometry; statQuery.spatialRelationship = 'intersects'; }
        statQuery.returnGeometry = false;
        statQuery.outStatistics = [{ statisticType: 'sum', onStatisticField: areaField, outStatisticFieldName: 'total_sqft' }];
        const result = await layer.queryFeatures(statQuery);
        const total = result.features[0]?.attributes?.total_sqft || 0;
        dom.footprintArea.textContent = humanAreaSqft(total);
      } catch (error) {
        console.error(error);
        dom.buildingCount.textContent = '—';
        dom.footprintArea.textContent = '—';
      }
    }

    async function showAtlanta() {
      useAtlantaLayers();
      setSearchStatus('Loading the official City of Atlanta boundary…', true);
      const q = cityQuery.createQuery();
      q.where = '1=1'; q.returnGeometry = true; q.outFields = ['NAME']; q.outSpatialReference = view.spatialReference;
      const res = await cityQuery.queryFeatures(q);
      if (!res.features.length) throw new Error('City boundary was not returned.');
      let geometry = res.features[0].geometry;
      if (res.features.length > 1) {
        geometry = res.features[0].geometry; // dataset normally returns the municipal geometry as one feature
      }
      state.selectionGeometry = geometry;
      state.atlantaExtent = geometry.extent.expand(1.08);
      state.selectionName = 'City of Atlanta';
      state.selectionType = 'CITY LIMITS';
      const area = rememberFootprintArea({ name: 'City of Atlanta', type: 'CITY LIMITS', source: 'atlanta', geometry, mapTitle: 'City of Atlanta, Georgia' });
      state.activeAreaId = area.id;
      dom.areaName.textContent = state.selectionName;
      dom.areaType.textContent = state.selectionType;
      dom.mapTitle.textContent = 'City of Atlanta, Georgia';
      drawSelection(null, ''); // city boundary is already rendered by its official layer
      syncLayerVisibility();
      await goToFootprintView(geometry, 1.035);
      queryStats(geometry);
      setSearchStatus('City of Atlanta footprint map is ready.');
    }

    function sqlEscape(text) { return String(text).replaceAll("'", "''"); }

    async function findZip(value) {
      const q = zipQuery.createQuery();
      q.where = `NAME = '${sqlEscape(value)}'`;
      q.outFields = ['NAME']; q.returnGeometry = true; q.outSpatialReference = view.spatialReference;
      const res = await zipQuery.queryFeatures(q);
      return res.features[0] || null;
    }

    async function findNeighborhood(value) {
      const q = neighborhoodQuery.createQuery();
      const upper = sqlEscape(value.toUpperCase());
      q.where = `UPPER(NAME) = '${upper}'`;
      q.outFields = ['NAME']; q.returnGeometry = true; q.outSpatialReference = view.spatialReference;
      let res = await neighborhoodQuery.queryFeatures(q);
      if (res.features.length) return res.features[0];
      q.where = `UPPER(NAME) LIKE '%${upper}%'`;
      res = await neighborhoodQuery.queryFeatures(q);
      return res.features[0] || null;
    }

    async function findNationalZip(value) {
      try {
        const q = nationalZipQuery.createQuery();
        q.where = `ZIP_CODE = '${sqlEscape(value)}'`;
        q.outFields = ['ZIP_CODE','PO_NAME','STATE']; q.returnGeometry = true; q.outSpatialReference = view.spatialReference;
        const res = await nationalZipQuery.queryFeatures(q);
        return res.features[0] || null;
      } catch (error) {
        console.warn('National ZIP boundary service unavailable; using geocoder fallback.', error);
        return null;
      }
    }

    function parseCitySearch(value) {
      const parts = String(value).split(',').map(v => v.trim()).filter(Boolean);
      const city = parts[0] || value;
      const state = parts.length > 1 && /^[A-Za-z]{2}$/.test(parts[parts.length - 1]) ? parts[parts.length - 1].toUpperCase() : null;
      return { city, state };
    }

    async function findNationalCity(value) {
      try {
        const { city, state } = parseCitySearch(value);
        const upper = sqlEscape(city.toUpperCase());
        const stateWhere = state ? ` AND UPPER(ST) = '${sqlEscape(state)}'` : '';
        const q = nationalPlaceQuery.createQuery();
        q.where = `UPPER(NAME) = '${upper}'${stateWhere}`;
        q.outFields = ['NAME','ST','POPULATION','POP_CLASS'];
        q.returnGeometry = true; q.outSpatialReference = view.spatialReference;
        q.orderByFields = ['POPULATION DESC'];
        let res = await nationalPlaceQuery.queryFeatures(q);
        if (res.features.length) return res.features[0];
        q.where = `UPPER(NAME) LIKE '%${upper}%'${stateWhere} AND POP_CLASS >= 6`;
        res = await nationalPlaceQuery.queryFeatures(q);
        return res.features[0] || null;
      } catch (error) {
        console.warn('National city service unavailable; using geocoder fallback.', error);
        return null;
      }
    }

    async function geocodeUS(value) {
      // Single-line U.S. geocoding lets the exact same search box reach rural
      // towns, counties, streets, addresses, landmarks, and other places too.
      const params = new URLSearchParams({
        SingleLine: value,
        countryCode: 'USA',
        outFields: 'Match_addr,LongLabel,ShortLabel,Addr_type,Type,PlaceName,City,Subregion,Region,RegionAbbr,Postal,CountryCode',
        maxLocations: '5',
        forStorage: 'false',
        outSR: '3857',
        f: 'json'
      });
      const response = await fetch(`${US_GEOCODER}?${params.toString()}`);
      if (!response.ok) throw new Error(`U.S. location search failed (${response.status}).`);
      const payload = await response.json();
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      return candidates.find(c => {
        const a = c.attributes || {};
        const cc = String(a.CountryCode || '').toUpperCase();
        return Number(c.score || 0) >= 65 && (!cc || cc === 'USA' || cc === 'US');
      }) || null;
    }

    function geocoderExtent(candidate) {
      const sr = { wkid: 3857 };
      const e = candidate?.extent;
      const loc = candidate?.location;
      if (e && [e.xmin,e.ymin,e.xmax,e.ymax].every(Number.isFinite)) {
        let extent = new Extent({ xmin: e.xmin, ymin: e.ymin, xmax: e.xmax, ymax: e.ymax, spatialReference: sr });
        const type = String(candidate?.attributes?.Addr_type || '').toLowerCase();
        // Address/street candidates often return a tiny locator box. Give the
        // footprint map enough neighborhood context to be useful immediately.
        if (/pointaddress|subaddress|streetaddress|streetname|streetint|postalext/.test(type)) {
          const cx = (extent.xmin + extent.xmax) / 2;
          const cy = (extent.ymin + extent.ymax) / 2;
          const half = Math.max(900, extent.width / 2, extent.height / 2);
          extent = new Extent({ xmin: cx-half, ymin: cy-half, xmax: cx+half, ymax: cy+half, spatialReference: sr });
        }
        return extent;
      }
      if (loc && Number.isFinite(loc.x) && Number.isFinite(loc.y)) {
        const half = 1200;
        return new Extent({ xmin: loc.x-half, ymin: loc.y-half, xmax: loc.x+half, ymax: loc.y+half, spatialReference: sr });
      }
      return null;
    }

    async function selectGeocodedArea(candidate) {
      const geometry = geocoderExtent(candidate);
      if (!geometry) throw new Error('The U.S. location was found, but no map extent was returned.');
      useNationalLayers();
      const attrs = candidate.attributes || {};
      const label = attrs.Match_addr || attrs.LongLabel || candidate.address || attrs.ShortLabel || 'U.S. location';
      const addrType = String(attrs.Addr_type || attrs.Type || 'LOCATION').toUpperCase();
      state.selectionGeometry = geometry;
      state.selectionName = label;
      state.selectionType = addrType;
      rememberFootprintArea({ name: label, type: addrType, source: 'national', geometry, mapTitle: label });
      syncLayerVisibility();
      dom.areaName.textContent = label;
      dom.areaType.textContent = addrType;
      dom.mapTitle.textContent = label;
      drawSelection(geometry, label);
      drawFootprintAreas();
      await goToFootprintView(geometry, 1.08);
      queryStats(geometry);
      setSearchStatus(`${label} selected. Building footprints are the map.`);
      toast(`${label} loaded`);
    }

    async function selectArea(feature, type, source = 'atlanta') {
      const geometry = feature.geometry;
      const attrs = feature.attributes || {};
      if (source === 'national') useNationalLayers(); else useAtlantaLayers();

      let name;
      let mapTitle;
      if (source === 'national' && type === 'ZIP') {
        const zip = String(attrs.ZIP_CODE || '').trim();
        const place = String(attrs.PO_NAME || '').trim();
        const st = String(attrs.STATE || '').trim();
        name = zip || 'ZIP area';
        state.selectionName = `ZIP ${name}`;
        state.selectionType = 'ZIP';
        mapTitle = [place, st].filter(Boolean).join(', ');
        dom.mapTitle.textContent = mapTitle ? `${mapTitle} · ZIP ${name}` : `ZIP ${name}`;
      } else if (source === 'national') {
        name = String(attrs.NAME || '').trim() || 'City';
        const st = String(attrs.ST || '').trim();
        state.selectionName = name;
        state.selectionType = 'CITY';
        dom.mapTitle.textContent = st ? `${name}, ${st}` : name;
      } else {
        name = String(attrs.NAME || '').trim() || (type === 'ZIP' ? 'ZIP area' : 'Neighborhood');
        state.selectionName = type === 'ZIP' ? `ZIP ${name}` : name;
        state.selectionType = type;
        dom.mapTitle.textContent = type === 'ZIP' ? `Atlanta ZIP ${name}` : `${name}, Atlanta`;
      }

      rememberFootprintArea({ name: state.selectionName, type: state.selectionType, source, geometry, mapTitle: dom.mapTitle.textContent });
      syncLayerVisibility();
      state.selectionGeometry = geometry;
      dom.areaName.textContent = state.selectionName;
      dom.areaType.textContent = state.selectionType;
      drawSelection(geometry, state.selectionName);
      await goToFootprintView(geometry, 1.08);
      queryStats(geometry);
      refreshApparelLabels();
      setSearchStatus(`${state.selectionName} selected. Building footprints are the map.`);
      toast(`${state.selectionName} loaded`);
    }

    async function searchArea() {
      const value = dom.areaInput.value.trim();
      if (!value) { dom.areaInput.focus(); return; }
      setSearchStatus('Finding area…', true);
      try {
        let feature = null;
        let type = state.mode;
        const lower = value.toLowerCase();
        if (lower === 'atlanta' || lower === 'city of atlanta' || lower === 'atlanta, ga') {
          await showAtlanta(); return;
        }

        if (state.mode === 'zip' || (state.mode === 'auto' && /^\d{5}$/.test(value))) {
          feature = await findZip(value);
          if (feature) { await selectArea(feature, 'ZIP', 'atlanta'); return; }
          feature = await findNationalZip(value);
          if (feature) { await selectArea(feature, 'ZIP', 'national'); return; }
        } else if (state.mode === 'neighborhood') {
          feature = await findNeighborhood(value);
          if (feature) { await selectArea(feature, 'NEIGHBORHOOD', 'atlanta'); return; }
          feature = await findNationalCity(value);
          if (feature) { await selectArea(feature, 'CITY', 'national'); return; }
        } else {
          feature = await findNeighborhood(value);
          if (feature) { await selectArea(feature, 'NEIGHBORHOOD', 'atlanta'); return; }
          feature = await findNationalCity(value);
          if (feature) { await selectArea(feature, 'CITY', 'national'); return; }
          if (/^\d{5}$/.test(value)) {
            feature = await findNationalZip(value);
            if (feature) { await selectArea(feature, 'ZIP', 'national'); return; }
          }
        }
        const geocoded = await geocodeUS(value);
        if (geocoded) { await selectGeocodedArea(geocoded); return; }
        throw new Error('No matching U.S. location found. Try a ZIP, city, town, county, street, or address.');
      } catch (error) {
        console.error(error);
        setSearchStatus(error.message || 'Area could not be found.');
        toast(error.message || 'Area not found');
      } finally {
        dom.goBtn.disabled = false;
        dom.goBtn.textContent = 'Go';
      }
    }

    async function loadNeighborhoodNames() {
      try {
        const q = neighborhoodQuery.createQuery();
        q.where = '1=1'; q.outFields = ['NAME']; q.returnGeometry = false; q.orderByFields = ['NAME'];
        const res = await neighborhoodQuery.queryFeatures(q);
        const names = res.features.map(f => f.attributes?.NAME).filter(Boolean);

        const cq = nationalPlaceQuery.createQuery();
        cq.where = 'POP_CLASS >= 8'; cq.outFields = ['NAME','ST','POPULATION']; cq.returnGeometry = false; cq.orderByFields = ['POPULATION DESC'];
        const cities = await nationalPlaceQuery.queryFeatures(cq);
        const cityNames = cities.features.map(f => {
          const name = f.attributes?.NAME; const st = f.attributes?.ST;
          return name ? `${name}${st ? `, ${st}` : ''}` : null;
        }).filter(Boolean);

        const suggestions = [...new Set([...names, ...cityNames])];
        dom.neighborhoodList.innerHTML = suggestions.map(name => `<option value="${String(name).replaceAll('&','&amp;').replaceAll('"','&quot;')}"></option>`).join('');
      } catch (e) { console.warn('Area suggestions unavailable', e); }
    }

    function currentExportGeometry() {
      if (state.selectionGeometry) return state.selectionGeometry;
      return view.extent;
    }

    async function fetchFootprintsGeoJSON() {
      const geometry = currentExportGeometry();
      if (!geometry) throw new Error('No map area available.');
      const geomJSON = geometry.toJSON();
      const wkid = geometry.spatialReference?.wkid || geometry.spatialReference?.latestWkid || 3857;
      const isExtent = geometry.type === 'extent';
      const geometryType = isExtent ? 'esriGeometryEnvelope' : 'esriGeometryPolygon';
      const national = state.source === 'national';
      let base;
      if (national) {
        await nationalBuildingsQuery.load();
        base = `${nationalBuildingsQuery.url}/query`;
      } else {
        base = `${FEATURE_SERVICE}/10/query`;
      }
      const outFields = national
        ? '*'
        : 'OBJECTID,FEATUREID,FEATTYPE,STRUCTFORM,STORIES,YEARBUILT,AREASQFT,LUCDESC';
      const all = [];
      let offset = 0;
      const pageSize = 2000;
      while (true) {
        const params = new URLSearchParams({
          where: '1=1', outFields,
          returnGeometry: 'true', f: 'geojson', outSR: '4326', inSR: String(wkid),
          geometryType, spatialRel: 'esriSpatialRelIntersects', geometry: JSON.stringify(geomJSON),
          resultOffset: String(offset), resultRecordCount: String(pageSize), orderByFields: 'OBJECTID'
        });
        const response = await fetch(`${base}?${params.toString()}`);
        if (!response.ok) throw new Error(`Footprint export failed (${response.status}).`);
        const page = await response.json();
        const features = page.features || [];
        all.push(...features);
        const exceeded = Boolean(page.properties?.exceededTransferLimit || page.exceededTransferLimit);
        if (features.length < pageSize && !exceeded) break;
        offset += features.length;
        if (!features.length || offset > 150000) break;
        dom.exportMessage.textContent = `Collecting footprints… ${humanNumber(all.length)}`;
      }
      return { type: 'FeatureCollection', name: state.selectionName, features: all };
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    function safeFileName() {
      return state.selectionName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'atlanta';
    }

    async function exportGeoJSON() {
      if (state.exportBusy) return;
      state.exportBusy = true; dom.exportMessage.textContent = 'Preparing GeoJSON…';
      try {
        const fc = await fetchFootprintsGeoJSON();
        downloadBlob(new Blob([JSON.stringify(fc)], { type: 'application/geo+json' }), `${safeFileName()}-building-footprints.geojson`);
        dom.exportMessage.textContent = `Exported ${humanNumber(fc.features.length)} footprints.`;
      } catch (e) { console.error(e); dom.exportMessage.textContent = e.message; toast(e.message); }
      finally { state.exportBusy = false; }
    }

    function csvCell(value) {
      if (value == null) return '';
      const s = String(value);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
    }

    async function exportCSV() {
      if (state.exportBusy) return;
      state.exportBusy = true; dom.exportMessage.textContent = 'Preparing CSV…';
      try {
        const fc = await fetchFootprintsGeoJSON();
        const headers = state.source === 'national'
          ? Array.from(new Set(fc.features.flatMap(f => Object.keys(f.properties || {})))).sort()
          : ['OBJECTID','FEATUREID','FEATTYPE','STRUCTFORM','STORIES','YEARBUILT','AREASQFT','LUCDESC'];
        const rows = [headers.join(',')];
        for (const f of fc.features) rows.push(headers.map(h => csvCell(f.properties?.[h])).join(','));
        downloadBlob(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }), `${safeFileName()}-building-footprints.csv`);
        dom.exportMessage.textContent = `Exported ${humanNumber(fc.features.length)} footprint records.`;
      } catch (e) { console.error(e); dom.exportMessage.textContent = e.message; toast(e.message); }
      finally { state.exportBusy = false; }
    }

    async function exportPNG() {
      try {
        dom.exportMessage.textContent = 'Capturing map…';
        const shot = await view.takeScreenshot({ format: 'png', quality: 100 });
        const response = await fetch(shot.dataUrl);
        downloadBlob(await response.blob(), `${safeFileName()}-footprint-map.png`);
        dom.exportMessage.textContent = 'PNG exported.';
      } catch (e) { console.error(e); dom.exportMessage.textContent = 'PNG export failed.'; }
    }

    dom.modeBtns.forEach(btn => btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      dom.modeBtns.forEach(b => b.classList.toggle('active', b === btn));
      dom.searchModeBadge.textContent = state.mode.toUpperCase();
    }));
    dom.styleBtns.forEach(btn => btn.addEventListener('click', () => {
      state.style = btn.dataset.style;
      dom.styleBtns.forEach(b => b.classList.toggle('active', b === btn));
      applyStyle();
    }));
    dom.opacityRange.addEventListener('input', () => { dom.opacityValue.textContent = `${dom.opacityRange.value}%`; applyStyle(); });
    dom.footprintsToggle.addEventListener('change', () => { syncLayerVisibility(); if (dom.footprintsToggle.checked) scheduleNationalFootprintsRefresh(40); else { nationalLoadToken++; if (nationalAbortController) { nationalAbortController.abort(); nationalAbortController = null; } nationalFootprintsLayer.removeAll(); } });
    dom.streetsToggle.addEventListener('change', syncLayerVisibility);
    dom.boundaryToggle.addEventListener('change', () => {
      syncLayerVisibility();
      selectionLayer.visible = dom.boundaryToggle.checked;
    });
    dom.footprintAreaList.addEventListener('click', async event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const item = button.closest('[data-area-id]');
      const area = state.footprintAreas.find(entry => entry.id === item?.dataset.areaId);
      if (!area) return;
      if (button.dataset.action === 'remove') { removeFootprintArea(area.id); return; }
      if (button.dataset.action === 'select') {
        try { await activateFootprintArea(area, true); toast(`${area.name} footprint view`); }
        catch (error) { console.error(error); toast(error.message || 'Could not show area'); }
      }
    });
    dom.clearFootprintAreasBtn.addEventListener('click', () => {
      state.footprintAreas = [];
      state.activeAreaId = null;
      drawFootprintAreas();
      renderFootprintAreaList();
      nationalLoadToken++;
      if (nationalAbortController) { nationalAbortController.abort(); nationalAbortController = null; }
      nationalFootprintsLayer.removeAll();
      selectionLayer.removeAll();
      footprintsLayer.visible = false; streetsLayer.visible = false; nationalRoadsLayer.visible = false; cityBoundaryLayer.visible = false;
      state.selectionGeometry = null;
      dom.areaName.textContent = 'No area selected';
      dom.areaType.textContent = 'FOOTPRINT ONLY';
      dom.buildingCount.textContent = '—';
      dom.footprintArea.textContent = '—';
      dom.mapTitle.textContent = 'Choose a footprint area';
      setSearchStatus('Search a place to add it to Footprint Areas.');
      toast('Selected footprint places cleared');
    });
    dom.goBtn.addEventListener('click', searchArea);
    dom.areaInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchArea(); });
    dom.atlantaBtn.addEventListener('click', () => showAtlanta().catch(e => toast(e.message)));
    dom.focusBtn.addEventListener('click', () => {
      document.body.classList.toggle('focus');
      dom.focusBtn.textContent = document.body.classList.contains('focus') ? 'Show panel' : 'Focus map';
      setTimeout(() => view.resize(), 280);
    });
    dom.themeBtn.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'paper' : 'dark';
      document.documentElement.dataset.theme = state.theme;
      dom.themeBtn.textContent = state.theme === 'dark' ? 'Paper mode' : 'Dark mode';
      applyStyle(); drawSelection(state.selectionGeometry && !(state.source === 'atlanta' && state.selectionType === 'CITY LIMITS') ? state.selectionGeometry : null, state.selectionName);
    });
    const labelControls = [dom.locationLabelToggle, dom.coordsLabelToggle, dom.customLabelInput, dom.labelPosition, dom.labelCase, dom.labelSizeRange].filter(Boolean);
    labelControls.forEach(control => {
      const eventName = control.tagName === 'INPUT' && control.type === 'text' ? 'input' : (control.tagName === 'INPUT' && control.type === 'range' ? 'input' : 'change');
      control.addEventListener(eventName, () => {
        if (dom.labelSizeValue) dom.labelSizeValue.textContent = `${dom.labelSizeRange.value} px`;
        refreshApparelLabels();
      });
    });

    dom.pngBtn.addEventListener('click', exportPNG);
    dom.geojsonBtn.addEventListener('click', exportGeoJSON);
    dom.csvBtn.addEventListener('click', exportCSV);

    view.watch('stationary', (stationary) => {
      if (stationary) refreshApparelLabels();
    });
    view.watch('size', () => refreshApparelLabels());

    view.ui.add(new Zoom({ view }), 'top-right');
    view.ui.add(new Home({ view }), 'top-right');
    view.ui.add(new Compass({ view }), 'top-right');
    view.ui.add(new ScaleBar({ view, unit: 'dual' }), 'bottom-right');

    view.watch('scale', scale => {
      dom.mapScale.textContent = scale >= 1000 ? `1:${humanNumber(Math.round(scale / 100) * 100)}` : `1:${humanNumber(scale)}`;
      // Free zoom is intentional. Wide views stay footprint-only: reference
      // roads are never allowed to become the background map.
      if (scale > NATIONAL_RENDER_SCALE_LIMIT) {
        nationalLoadToken++;
        if (nationalAbortController) { nationalAbortController.abort(); nationalAbortController = null; }
        nationalFootprintsLayer.removeAll();
        nationalRoadsLayer.visible = false;
        streetsLayer.visible = false;
      }
    });

    view.watch('stationary', stationary => {
      if (!stationary) {
        // Invalidate stale results while the map is moving. The next refresh
        // happens only after movement ends, preventing request/render storms.
        nationalLoadToken++;
        if (nationalAbortController) { nationalAbortController.abort(); nationalAbortController = null; }
        return;
      }

      // Manual panning can enter another saved footprint area. Activate it
      // without changing zoom. Unsaved geography stays blank/footprint-only.
      const centeredArea = selectedAreaAtCenter();
      if (centeredArea && centeredArea.id !== state.activeAreaId) {
        state.activeAreaId = centeredArea.id;
        state.source = centeredArea.source;
        state.selectionGeometry = centeredArea.geometry;
        state.selectionName = centeredArea.name;
        state.selectionType = centeredArea.type;
        dom.areaName.textContent = centeredArea.name;
        dom.areaType.textContent = centeredArea.type;
        dom.mapTitle.textContent = centeredArea.mapTitle || centeredArea.name;
        drawFootprintAreas();
        renderFootprintAreaList();
      }

      syncLayerVisibility();
      if (nationalFootprintsLayer.visible) scheduleNationalFootprintsRefresh(180);
      else if (nationalFootprintsLayer.graphics.length) nationalFootprintsLayer.removeAll();

      const active = activeFootprintArea();
      if (!active) {
        streetsLayer.visible = false; nationalRoadsLayer.visible = false; footprintsLayer.visible = false; cityBoundaryLayer.visible = false;
        setSearchStatus('No footprint area selected. Search a place to add one.');
      } else if (view.scale > NATIONAL_RENDER_SCALE_LIMIT) {
        streetsLayer.visible = false; nationalRoadsLayer.visible = false; nationalFootprintsLayer.removeAll();
        setSearchStatus('Footprint overview — selected places stay outlined. Zoom in for building detail.');
      }
    });

    Promise.all([view.when(), footprintsLayer.when(), streetsLayer.when(), cityBoundaryLayer.when(), nationalFootprintsLayer.when(), footprintAreasLayer.when()])
      .then(async () => {
        applyStyle();
        await showAtlanta();
        loadNeighborhoodNames();
        dom.mapLoading.classList.add('hidden');
        toast('Footprint map loaded');
      })
      .catch(error => {
        console.error(error);
        dom.mapLoading.querySelector('strong').textContent = 'Atlanta GIS could not load';
        dom.mapLoading.querySelector('small').textContent = 'Check your internet connection and reload. No API key is required.';
      });
  });
})();
