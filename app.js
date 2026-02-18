/**
 * Умный дом — клиент в стиле приложения Яндекса
 * API: api.iot.yandex.net
 * ES5 для iPad iOS 9.3.5
 */

(function() {
  'use strict';

  var API_BASE = (typeof API_USE_PROXY !== 'undefined' && API_USE_PROXY) ? '/api' : 'https://api.iot.yandex.net';
  var API_VERSION = '/v1.0';
  var TOKEN_KEY = 'yandex_iot_token';

  var token = null;
  var userInfo = null;
  var rawApiResponse = null;
  var currentFilter = 'all';

  var TYPE_ICONS = {
    'devices.types.light': 'icon-light',
    'devices.types.socket': 'icon-socket',
    'devices.types.switch': 'icon-switch',
    'devices.types.thermostat': 'icon-thermostat',
    'devices.types.media_device': 'icon-tv',
    'devices.types.media_device.tv': 'icon-tv',
    'devices.types.media_device.tv_box': 'icon-tv-box',
    'devices.types.media_device.receiver': 'icon-remote',
    'devices.types.smart_speaker': 'icon-speaker',
    'devices.types.humidifier': 'icon-humidifier',
    'devices.types.vacuum_cleaner': 'icon-vacuum',
    'devices.types.purifier': 'icon-purifier',
    'devices.types.cooking': 'icon-cooking',
    'devices.types.openable': 'icon-door',
    'devices.types.sensor': 'icon-sensor',
    'devices.types.camera': 'icon-camera'
  };

  function $(id) {
    return typeof id === 'string' ? document.getElementById(id) : id;
  }

  function show(el) {
    if (el) el.classList.remove('hidden');
  }

  function hide(el) {
    if (el) el.classList.add('hidden');
  }

  function apiRequest(method, path, data, callback) {
    var xhr = new XMLHttpRequest();
    var url = API_BASE ? (API_BASE + API_VERSION + path) : (API_VERSION + path);

    xhr.open(method, url, true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) return;
      var result = null;
      if (xhr.responseText) {
        try {
          result = JSON.parse(xhr.responseText);
        } catch (e) {
          callback({ error: xhr.status === 401 ? 'Токен недействителен' : (xhr.responseText || 'Ошибка сервера') });
          return;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        callback(null, result);
      } else {
        var errMsg = (result && result.message) || (result && result.error) || (typeof result === 'string' ? result : null);
        if (!errMsg || typeof errMsg === 'object') errMsg = 'Ошибка ' + xhr.status;
        callback({ error: String(errMsg) });
      }
    };

    xhr.onerror = function() {
      callback({ error: 'Ошибка сети' });
    };

    if (data) {
      xhr.send(JSON.stringify(data));
    } else {
      xhr.send();
    }
  }

  function loadUserInfo(callback) {
    apiRequest('GET', '/user/info', null, function(err, data) {
      if (err) {
        if (callback) callback(err);
        return;
      }
      rawApiResponse = data;
      var raw = data.payload || data;
      userInfo = { devices: [], rooms: [], groups: [] };
      var devIds = {};
      function hasDevice(id) { return !!devIds[id]; }
      function addDevice(dev, hhId) {
        if (!dev || !dev.id) return;
        if (devIds[dev.id]) return;
        devIds[dev.id] = true;
        if (hhId && !dev.household_id) dev.household_id = hhId;
        userInfo.devices.push(dev);
      }
      if (!raw.houses || raw.houses.length === 0) {
        if (raw.devices && raw.devices.length > 0) {
          userInfo.devices = raw.devices;
          for (var dx = 0; dx < raw.devices.length; dx++) devIds[raw.devices[dx].id] = true;
        }
        if (raw.rooms && raw.rooms.length > 0) userInfo.rooms = raw.rooms;
        if (raw.groups && raw.groups.length > 0) userInfo.groups = raw.groups;
      }
      if (raw.houses && raw.houses.length > 0) {
        for (var h = 0; h < raw.houses.length; h++) {
          var house = raw.houses[h];
          var hhId = house.id || house.household_id;
          if (house.devices) {
            for (var d = 0; d < house.devices.length; d++) addDevice(house.devices[d], hhId);
          }
          if (house.groups) {
            for (var g = 0; g < house.groups.length; g++) userInfo.groups.push(house.groups[g]);
          }
          if (house.rooms) {
            for (var r = 0; r < house.rooms.length; r++) {
              userInfo.rooms.push(house.rooms[r]);
              var roomDevs = house.rooms[r].devices || [];
              for (var rd = 0; rd < roomDevs.length; rd++) addDevice(roomDevs[rd], hhId);
            }
          }
        }
      }
      if (userInfo.devices.length === 0 && raw.devices) {
        for (var d = 0; d < raw.devices.length; d++) addDevice(raw.devices[d], null);
      } else if (raw.devices) {
        for (var rd = 0; rd < raw.devices.length; rd++) addDevice(raw.devices[rd], null);
      }
      if (raw.households && raw.households.length > 0) {
        for (var hhi = 0; hhi < raw.households.length; hhi++) {
          var hh = raw.households[hhi];
          var hhDevs = hh.devices || [];
          for (var hhd = 0; hhd < hhDevs.length; hhd++) {
            var hdev = hhDevs[hhd];
            if (!hasDevice(hdev.id)) {
              if (hh.id && !hdev.household_id) hdev.household_id = hh.id;
              addDevice(hdev, null);
            }
          }
        }
      }
      if (userInfo.rooms.length === 0 && raw.rooms) userInfo.rooms = raw.rooms;
      if (userInfo.groups.length === 0 && raw.groups) userInfo.groups = raw.groups;
      for (var gi = 0; gi < userInfo.groups.length; gi++) {
        var gdevs = userInfo.groups[gi].devices || [];
        for (var gdi = 0; gdi < gdevs.length; gdi++) {
          var gd = gdevs[gdi];
          if (!hasDevice(gd.id)) addDevice(gd, null);
        }
      }
      userInfo.scenarios = raw.scenarios;
      userInfo.deviceMap = null;
      if (callback) callback(null, userInfo);
    });
  }

  function deviceAction(deviceId, actions, callback) {
    apiRequest('POST', '/devices/actions', { devices: [{ id: deviceId, actions: actions }] }, callback);
  }

  function onActionSuccess(cb) {
    return function(err) {
      if (err) showError(err.error);
      else loadUserInfo(cb || function() { renderContent(); });
    };
  }

  function getCapState(cap, key) {
    if (!cap || !cap.state) return null;
    var v = cap.state[key] !== undefined ? cap.state[key] : cap.state.value;
    if (typeof v === 'object' && v !== null && v.value !== undefined) return v.value;
    return v;
  }

  function toNumber(val, def) {
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (typeof val === 'object' && val !== null && typeof val.value === 'number') return val.value;
    if (typeof val === 'string') { var n = parseFloat(val); if (!isNaN(n)) return n; }
    return def;
  }

  function toHex(n) {
    n = Math.max(0, Math.min(255, Math.round(n)));
    var s = n.toString(16);
    return s.length === 1 ? '0' + s : s;
  }

  function getDeviceIcon(device) {
    var t = device.type || '';
    var name = (device.name || '').toLowerCase();
    if (name.indexOf('пульт') !== -1) return '<span class="icon icon-remote"></span>';
    var iconClass = TYPE_ICONS[t] || 'icon-device';
    return '<span class="icon ' + iconClass + '"></span>';
  }

  function isHubDevice(device) {
    var t = (device.type || '').toLowerCase();
    var name = (device.name || '').toLowerCase();
    return t.indexOf('hub') !== -1 || name.indexOf('пульт') !== -1;
  }

  function getDeviceTypeCategory(device) {
    var t = (device.type || '').toLowerCase();
    var name = (device.name || '').toLowerCase();
    if (t.indexOf('light') !== -1 || t.indexOf('lamp') !== -1) return 'light';
    if (t.indexOf('tv') !== -1 || t.indexOf('media') !== -1 || name.indexOf('тв') !== -1 || name.indexOf('колонк') !== -1) return 'tv';
    if (t.indexOf('socket') !== -1 || t.indexOf('switch') !== -1) return 'socket';
    if (t.indexOf('camera') !== -1) return 'camera';
    return 'other';
  }

  function isCamera(device) {
    var t = (device.type || '').toLowerCase();
    if (t.indexOf('camera') !== -1) return true;
    var caps = device.capabilities || [];
    for (var i = 0; i < caps.length; i++) {
      if (caps[i].type === 'devices.capabilities.video_stream') return true;
    }
    return false;
  }

  function getCameraStream(deviceId, callback) {
    apiRequest('POST', '/devices/actions', {
      devices: [{
        id: deviceId,
        actions: [{
          type: 'devices.capabilities.video_stream',
          state: { instance: 'get_stream', value: { protocols: ['hls'] } }
        }]
      }]
    }, function(err, data) {
      if (err) {
        callback(err);
        return;
      }
      if (data && data.devices) {
        for (var i = 0; i < data.devices.length; i++) {
          var dev = data.devices[i];
          if (dev.error_code || dev.error_message) {
            var err = dev.error_message || dev.error_code || 'Камера недоступна';
            callback({ error: translateDeviceError(err) });
            return;
          }
          var caps = dev.capabilities || [];
          for (var j = 0; j < caps.length; j++) {
            var cap = caps[j];
            var state = cap.state || {};
            var value = state.value;
            var actionResult = state.action_result;
            if (actionResult && actionResult.status === 'ERROR') {
              var actErr = actionResult.error_message || actionResult.error_code || 'Ошибка видеопотока';
              callback({ error: translateDeviceError(actErr) });
              return;
            }
            if (cap.type === 'devices.capabilities.video_stream' && value && value.stream_url) {
              callback(null, value.stream_url);
              return;
            }
          }
        }
      }
      callback({ error: 'Видеопоток недоступен' });
    });
  }

  var DEVICE_ERROR_MAP = {
    'device_unreachable': 'Устройство недоступно',
    'device_not_found': 'Устройство не найдено',
    'device_offline': 'Устройство не в сети'
  };

  function translateDeviceError(err) {
    if (typeof err !== 'string') return err;
    var key = err.trim().toLowerCase().replace(/\s+/g, '_');
    return DEVICE_ERROR_MAP[key] || err;
  }

  function isIos9OrOlder() {
    var ua = navigator.userAgent || '';
    var match = ua.match(/OS (\d+)[_.](\d+)/);
    if (match) {
      var major = parseInt(match[1], 10);
      return major <= 9;
    }
    return false;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getDeviceById(id) {
    if (!userInfo || !userInfo.devices) return null;
    var map = userInfo.deviceMap;
    if (!map) {
      map = {};
      for (var i = 0; i < userInfo.devices.length; i++) {
        map[userInfo.devices[i].id] = userInfo.devices[i];
      }
      userInfo.deviceMap = map;
    }
    return map[id] || null;
  }

  function rgbToHex(rgb) {
    var r = rgb.r !== undefined ? rgb.r : (typeof rgb === 'number' ? (rgb >> 16) & 255 : 255);
    var g = rgb.g !== undefined ? rgb.g : (typeof rgb === 'number' ? (rgb >> 8) & 255 : 255);
    var b = rgb.b !== undefined ? rgb.b : (typeof rgb === 'number' ? rgb & 255 : 255);
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  function renderGroupDeviceItemHtml(dev) {
    var icon = TYPE_ICONS[dev.type || ''] || 'icon-device';
    return '<div class="group-device-item" data-device-id="' + escapeHtml(dev.id) + '"><span class="icon ' + icon + '"></span><span class="group-device-name">' + escapeHtml(dev.name || 'Устройство') + '</span><span class="group-device-arrow">›</span></div>';
  }

  function deviceMatchesFilter(device, filter) {
    if (filter === 'all') return true;
    if (filter === 'offline') return device.state === 'offline';
    if (filter === 'light') return getDeviceTypeCategory(device) === 'light';
    if (filter === 'tv') return getDeviceTypeCategory(device) === 'tv';
    return true;
  }

  function getPropertyValue(device, instance) {
    var props = device.properties || [];
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      var pInst = (p.state && p.state.instance) || (p.parameters && p.parameters.instance);
      if (pInst === instance || (p.type && p.type.indexOf(instance) !== -1)) {
        if (p.state) {
          if (typeof p.state.value === 'number') return p.state.value;
          if (p.state.value !== undefined) return p.state.value;
          return p.state;
        }
      }
    }
    return null;
  }

  function getCap(device, type) {
    var caps = device.capabilities || [];
    for (var i = 0; i < caps.length; i++) {
      if (caps[i].type === type) return caps[i];
    }
    return null;
  }

  function getDeviceCardType(device) {
    var t = (device.type || '').toLowerCase();
    var caps = device.capabilities || [];
    for (var i = 0; i < caps.length; i++) {
      if (caps[i].type === 'devices.capabilities.toggle') {
        var inst = (caps[i].state && caps[i].state.instance) || (caps[i].parameters && caps[i].parameters.instance) || '';
        if (inst === 'backlight') return 'backlight';
      }
    }
    if (t.indexOf('humidifier') !== -1 || t.indexOf('purifier') !== -1 || t.indexOf('humid') !== -1) return 'humidifier';
    if (t.indexOf('light') !== -1 || t.indexOf('lamp') !== -1) return 'light';
    return 'default';
  }

  function renderDeviceCard(device, roomName) {
    var isOffline = device.state === 'offline';
    var caps = device.capabilities || [];
    var hasOnOff = false;
    var isOn = false;
    var capOnOff, capBrightness, capMode, capToggle, capHumidity, capColor;
    for (var i = 0; i < caps.length; i++) {
      if (caps[i].type === 'devices.capabilities.on_off') {
        hasOnOff = true;
        capOnOff = caps[i];
        isOn = getCapState(caps[i], 'value');
      } else if (caps[i].type === 'devices.capabilities.range') {
        var rInst = (caps[i].state && caps[i].state.instance) || (caps[i].parameters && caps[i].parameters.instance) || '';
        if (rInst === 'brightness') capBrightness = caps[i];
        else if (rInst === 'humidity') capHumidity = caps[i];
      } else if (caps[i].type === 'devices.capabilities.mode') {
        capMode = caps[i];
      } else if (caps[i].type === 'devices.capabilities.toggle') {
        capToggle = caps[i];
      } else if (caps[i].type === 'devices.capabilities.color_setting') {
        var cp = caps[i].parameters || {};
        var colorModel = cp.color_model || '';
        if (colorModel === 'rgb' || colorModel === 'hsv') capColor = caps[i];
      }
    }

    var statusText = '';
    if (!roomName) statusText = 'Укажите комнату';
    else if (isOffline) statusText = 'Не в сети';

    var cardType = getDeviceCardType(device);
    var html = '';
    var controlsHtml = '';

    if ((cardType === 'light' || cardType === 'backlight') && capBrightness && hasOnOff) {
      var brVal = getCapState(capBrightness, 'value');
      var brRange = capBrightness.parameters && capBrightness.parameters.range || { min: 0, max: 100 };
      var brCur = brVal !== null && brVal !== undefined ? brVal : 100;
      controlsHtml += '<div class="card-slider-wrap"><input type="range" class="card-slider" min="' + brRange.min + '" max="' + brRange.max + '" value="' + brCur + '" data-action="range" data-instance="brightness"></div>';
    }

    if (capColor) {
      var palette = (capColor.parameters && capColor.parameters.palette) || [];
      var colorList = [];
      if (palette.length > 0) {
        for (var pc = 0; pc < palette.length; pc++) colorList.push(rgbToHex(palette[pc].rgb || palette[pc]));
      }
      if (colorList.length === 0) colorList = ['#ffffff','#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#ff8800'];
      var cardColorModel = (capColor.parameters && capColor.parameters.color_model) || 'rgb';
      controlsHtml += '<div class="card-color-row" data-color-model="' + escapeHtml(cardColorModel) + '"><span class="card-label">Цвет</span><div class="card-color-presets">';
      for (var cc = 0; cc < Math.min(colorList.length, 8); cc++) {
        controlsHtml += '<button class="card-color-btn" style="background:' + colorList[cc] + '" data-action="color" data-value="' + colorList[cc] + '"></button>';
      }
      controlsHtml += '</div></div>';
    }

    if (cardType === 'humidifier') {
      if (capHumidity) {
        var humVal = getCapState(capHumidity, 'value');
        var humRange = capHumidity.parameters && capHumidity.parameters.range || { min: 30, max: 90, precision: 5 };
        var humCur = toNumber(humVal, 50);
        controlsHtml += '<div class="card-slider-wrap"><span class="card-label">Уровень влажности: ' + Math.round(humCur) + '%</span><input type="range" class="card-slider" min="' + humRange.min + '" max="' + humRange.max + '" step="' + (humRange.precision || 1) + '" value="' + humCur + '" data-action="range" data-instance="humidity"></div>';
      }
      var humidityProp = getPropertyValue(device, 'humidity') || getPropertyValue(device, 'water_level');
      if (humidityProp !== null && humidityProp !== undefined) {
        var humNum = toNumber(humidityProp, 0);
        controlsHtml = '<div class="card-humidity"><span class="card-label">Влажность</span><span class="card-value">' + Math.round(humNum) + '%</span></div><div class="card-humidity-bar"><div class="card-humidity-fill" style="width:' + Math.min(100, Math.max(0, humNum)) + '%"></div></div>' + controlsHtml;
      }
      if (capMode) {
        var modesRaw = capMode.parameters && capMode.parameters.modes;
        var modesList = [];
        if (Array.isArray(modesRaw)) {
          modesList = modesRaw;
        } else if (modesRaw && typeof modesRaw === 'object') {
          for (var mk in modesRaw) {
            if (modesRaw.hasOwnProperty(mk) && typeof modesRaw[mk] === 'string') {
              modesList.push({ value: mk, name: modesRaw[mk] });
            }
          }
        }
        var modeVal = getCapState(capMode, 'value');
        var modeValStr = (typeof modeVal === 'object' && modeVal !== null && modeVal.value !== undefined) ? modeVal.value : (modeVal !== null && modeVal !== undefined ? String(modeVal) : '');
        var modeInstance = (capMode.state && capMode.state.instance) || (capMode.parameters && capMode.parameters.instance) || 'work_speed';
        if (modesList.length > 0) {
          controlsHtml += '<div class="card-mode-row">';
          for (var m = 0; m < Math.min(modesList.length, 3); m++) {
            var md = modesList[m];
            var mv = (typeof md === 'string' ? md : (md.value || md.id || '')) + '';
            var mn = ((typeof md === 'string' ? md : (md.name || md.title || md.value || md.id || mv)) + '').substring(0, 6);
            if (!mv) continue;
            controlsHtml += '<button class="card-mode-btn' + (modeValStr === mv ? ' active' : '') + '" data-action="mode" data-instance="' + escapeHtml(modeInstance) + '" data-value="' + escapeHtml(mv) + '">' + escapeHtml(mn) + '</button>';
          }
          controlsHtml += '</div>';
        }
      }
    }

    html = '<div class="device-card-inner' + (isOffline ? ' offline' : '') + '" data-device-id="' + escapeHtml(device.id) + '">' +
      (isOffline ? '<span class="offline-icon icon icon-offline"></span>' : '') +
      (hasOnOff && !isOffline ? '<button class="power-btn' + (isOn ? ' on' : '') + '" data-action="on_off" data-value="' + !isOn + '" title="' + (isOn ? 'Выкл' : 'Вкл') + '">⏻</button>' : '') +
      '<div class="device-icon">' + getDeviceIcon(device) + '</div>' +
      '<div class="device-name">' + escapeHtml(device.name) + '</div>' +
      (statusText ? '<div class="device-status">' + escapeHtml(statusText) + '</div>' : '') +
      (controlsHtml ? '<div class="card-controls">' + controlsHtml + '</div>' : '') +
      '</div>';

    var div = document.createElement('div');
    div.className = 'device-card' + (controlsHtml ? ' has-controls' : '');
    div.innerHTML = html;

    var inner = div.querySelector('.device-card-inner');
    inner.onclick = (function(dev, cardEl, hasControls) {
      return function(e) {
        var t = e.target;
        if (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'LABEL') return;
        if (t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('toggle-switch')) return;
        var inControls = t.closest && t.closest('.card-controls');
        if (inControls) return;
        if (isCamera(dev)) {
          openCameraVideo(dev);
          return;
        }
        if (hasControls) {
          cardEl.classList.toggle('expanded');
          return;
        }
        openDeviceModal(dev);
      };
    })(device, div, !!controlsHtml);

    bindCardControls(div, device);
    return div;
  }

  function bindCardControls(container, device) {
    var powerBtn = container.querySelector('.power-btn');
    if (powerBtn) {
      powerBtn.onclick = function(e) {
        e.stopPropagation();
        deviceAction(device.id, [{ type: 'devices.capabilities.on_off', state: { instance: 'on', value: powerBtn.dataset.value === 'true' } }], onActionSuccess());
      };
    }
    var sliders = container.querySelectorAll('.card-slider[data-action="range"]');
    for (var s = 0; s < sliders.length; s++) {
      (function(slider) {
        slider.oninput = function() {
          var label = slider.parentNode.querySelector('.card-label');
          if (label) label.textContent = label.textContent.replace(/: \d+\s*%?/, ': ' + Math.round(parseFloat(slider.value)) + (slider.dataset.instance === 'humidity' ? '%' : ''));
        };
        slider.onchange = function() {
          deviceAction(device.id, [{ type: 'devices.capabilities.range', state: { instance: slider.dataset.instance, value: parseFloat(slider.value) } }], onActionSuccess());
        };
        slider.onclick = function(e) { e.stopPropagation(); };
      })(sliders[s]);
    }
    var modeBtns = container.querySelectorAll('.card-mode-btn');
    for (var mb = 0; mb < modeBtns.length; mb++) {
      (function(btn) {
        btn.onclick = function(e) {
          e.stopPropagation();
          deviceAction(device.id, [{ type: 'devices.capabilities.mode', state: { instance: btn.dataset.instance, value: btn.dataset.value } }], onActionSuccess());
        };
      })(modeBtns[mb]);
    }
    var colorBtns = container.querySelectorAll('.card-color-btn[data-action="color"]');
    for (var cb = 0; cb < colorBtns.length; cb++) {
      (function(btn) {
        btn.onclick = function(e) {
          e.stopPropagation();
          var hex = btn.dataset.value;
          var m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
          if (m) {
            var r = parseInt(m[1], 16);
            var g = parseInt(m[2], 16);
            var b = parseInt(m[3], 16);
            var colorModel = '';
            var row = btn.closest ? btn.closest('[data-color-model]') : null;
            if (row && row.getAttribute) colorModel = row.getAttribute('data-color-model') || '';
            var action;
            if (colorModel === 'hsv') {
              var hsv = rgbToHsv(r, g, b);
              action = { type: 'devices.capabilities.color_setting', state: { instance: 'hsv', value: hsv } };
            } else {
              var rgbInt = (r << 16) | (g << 8) | b;
              action = { type: 'devices.capabilities.color_setting', state: { instance: 'rgb', value: rgbInt } };
            }
            deviceAction(device.id, [action], onActionSuccess());
          }
        };
      })(colorBtns[cb]);
    }

    var toggleInputs = container.querySelectorAll('.toggle-switch input');
    for (var ti = 0; ti < toggleInputs.length; ti++) {
      (function(toggleInput) {
        toggleInput.onclick = function(e) { e.stopPropagation(); };
        toggleInput.onchange = function() {
          var val = toggleInput.checked;
          var action = toggleInput.dataset.action;
          var act = action === 'on_off' ? { type: 'devices.capabilities.on_off', state: { instance: 'on', value: val } } : { type: 'devices.capabilities.toggle', state: { instance: toggleInput.dataset.instance || 'backlight', value: val } };
          deviceAction(device.id, [act], onActionSuccess());
        };
      })(toggleInputs[ti]);
    }
  }

  function openCameraVideo(device) {
    var modal = $('cameraModal');
    var titleEl = $('cameraModalTitle');
    var videoEl = $('cameraVideo');
    var loadingEl = $('cameraLoading');
    var errorEl = $('cameraError');
    var playOverlay = $('cameraPlayOverlay');
    var playBtn = $('cameraPlayBtn');

    titleEl.textContent = device.name;
    show(modal);
    show(loadingEl);
    hide(errorEl);
    hide(playOverlay);
    videoEl.src = '';
    videoEl.pause();

    var streamReceived = false;
    var loadTimeout = setTimeout(function() {
      if (streamReceived) return;
      streamReceived = true;
      hide(loadingEl);
      errorEl.innerHTML = 'Камера долго не отвечает. <button type="button" class="retry-btn" id="cameraRetryBtn">Повторить</button>';
      show(errorEl);
      var retryBtn = $('cameraRetryBtn');
      if (retryBtn) retryBtn.onclick = function() { hide(errorEl); openCameraVideo(device); };
    }, 45000);

    getCameraStream(device.id, function(err, streamUrl) {
      if (streamReceived) return;
      streamReceived = true;
      clearTimeout(loadTimeout);
      hide(loadingEl);
      if (err) {
        var msg = (err && err.error) ? err.error : 'Не удалось загрузить видео';
        errorEl.innerHTML = msg + ' <button type="button" class="retry-btn" id="cameraRetryBtn">Повторить</button>';
        show(errorEl);
        var retryBtn = $('cameraRetryBtn');
        if (retryBtn) retryBtn.onclick = function() { hide(errorEl); openCameraVideo(device); };
        return;
      }
      if (typeof API_USE_PROXY !== 'undefined' && API_USE_PROXY && streamUrl.indexOf('http') === 0) {
        streamUrl = (window.location.origin || '') + '/api/stream?url=' + encodeURIComponent(streamUrl);
      }
      videoEl.src = streamUrl;
      videoEl.load();
      var videoLoadTimeout;
      var clearVideoTimeout = function() {
        if (videoLoadTimeout) {
          clearTimeout(videoLoadTimeout);
          videoLoadTimeout = null;
        }
      };
      videoEl.onerror = function() {
        clearVideoTimeout();
        var msg = 'Ошибка воспроизведения видео';
        if (isIos9OrOlder()) {
          msg = 'Формат видео не поддерживается на iPad с iOS 9. Используйте устройство с iOS 10 или новее.';
        }
        errorEl.textContent = msg;
        show(errorEl);
        hide(playOverlay);
      };
      show(playOverlay);
      playBtn.onclick = function() {
        hide(playOverlay);
        videoEl.play();
      };
      videoEl.onplaying = function() {
        clearVideoTimeout();
        hide(playOverlay);
      };
      videoLoadTimeout = setTimeout(function() {
        if (videoEl.readyState < 2 && !videoEl.error) {
          errorEl.textContent = isIos9OrOlder()
            ? 'Формат видео не поддерживается на iPad с iOS 9.'
            : 'Видео не загружается. Проверьте соединение.';
          show(errorEl);
          hide(playOverlay);
        }
      }, 15000);
      videoEl.oncanplay = clearVideoTimeout;
      var playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function() { show(playOverlay); });
      }
    });
  }

  function closeCameraModal() {
    var modal = $('cameraModal');
    var videoEl = $('cameraVideo');
    hide(modal);
    if (videoEl) {
      videoEl.pause();
      videoEl.src = '';
    }
  }

  function loadGroupDevices(groupIds, callback) {
    if (!groupIds || groupIds.length === 0) { callback([]); return; }
    var allDevices = [];
    var pending = groupIds.length;
    var done = function() {
      pending--;
      if (pending <= 0) callback(allDevices);
    };
    for (var g = 0; g < groupIds.length; g++) {
      (function(groupId) {
        apiRequest('GET', '/groups/' + groupId, null, function(err, data) {
          var devices = (data && (data.devices || (data.payload && data.payload.devices))) || [];
          for (var i = 0; i < devices.length; i++) {
            var gdev = devices[i];
            allDevices.push(getDeviceById(gdev.id) || { id: gdev.id, name: gdev.name, type: gdev.type });
          }
          done();
        });
      })(groupIds[g]);
    }
  }

  function openDeviceModal(device) {
    var modal = $('deviceModal');
    var title = $('modalDeviceName');
    var body = $('modalBody');

    title.textContent = device.name;
    body.innerHTML = '';

    var caps = device.capabilities || [];
    var i, cap, instance, range, value;

    for (i = 0; i < caps.length; i++) {
      cap = caps[i];
      var capType = cap.type || '';

      if (capType === 'devices.capabilities.on_off') {
        value = getCapState(cap, 'value');
        body.innerHTML += '<div class="modal-controls"><button class="ctrl-btn' + (value ? ' on' : '') + '" data-action="on_off" data-value="true">Вкл</button><button class="ctrl-btn' + (value ? '' : ' off') + '" data-action="on_off" data-value="false">Выкл</button></div>';
      }
      else if (capType === 'devices.capabilities.toggle') {
        instance = (cap.state && cap.state.instance) || (cap.parameters && cap.parameters.instance) || 'backlight';
        value = getCapState(cap, 'value');
        var lbl = instance === 'pause' ? 'Пауза' : (instance === 'mute' ? 'Звук' : 'Подсветка');
        body.innerHTML += '<button class="ctrl-btn' + (value ? ' on' : '') + '" data-action="toggle" data-instance="' + escapeHtml(instance) + '" data-value="' + (!value) + '">' + lbl + '</button>';
      }
      else if (capType === 'devices.capabilities.range') {
        instance = (cap.state && cap.state.instance) || (cap.parameters && cap.parameters.instance) || 'brightness';
        value = getCapState(cap, 'value');
        var rangeDefaults = { channel: { min: 1, max: 999, precision: 1 }, volume: { min: 0, max: 100, precision: 1 } };
        range = cap.parameters && cap.parameters.range || rangeDefaults[instance] || { min: 0, max: 100, precision: 1 };
        var label = { brightness: 'Яркость', volume: 'Громкость', channel: 'Канал', temperature: 'Температура', humidity: 'Влажность' }[instance] || instance;
        var cur = value !== null && value !== undefined ? value : range.min;
        body.innerHTML += '<div class="ctrl-slider-wrap"><span class="ctrl-slider-label">' + label + ': ' + Math.round(cur) + '</span><input type="range" class="ctrl-slider" min="' + range.min + '" max="' + range.max + '" step="' + (range.precision || 1) + '" value="' + cur + '" data-action="range" data-instance="' + escapeHtml(instance) + '"></div>';
      }
      else if (capType === 'devices.capabilities.mode') {
        instance = (cap.state && cap.state.instance) || (cap.parameters && cap.parameters.instance) || 'work_speed';
        value = getCapState(cap, 'value');
        var valueStr = (typeof value === 'object' && value !== null && value.value !== undefined) ? value.value : (value !== null && value !== undefined ? String(value) : '');
        var modesRaw = cap.parameters && cap.parameters.modes;
        var modesList = [];
        if (Array.isArray(modesRaw)) {
          modesList = modesRaw;
        } else if (modesRaw && typeof modesRaw === 'object') {
          for (var mk in modesRaw) {
            if (modesRaw.hasOwnProperty(mk) && typeof modesRaw[mk] === 'string') {
              modesList.push({ value: mk, name: modesRaw[mk] });
            }
          }
        }
        if (modesList.length > 0) {
          var modeLabel = { work_speed: 'Скорость', program: 'Программа', thermostat: 'Температура', swing: 'Направление', input_source: 'Источник' }[instance] || 'Режим';
          var inputSourceNames = { one: 'Вход 1', two: 'Вход 2', three: 'Вход 3', four: 'Вход 4', five: 'Вход 5', six: 'Вход 6', seven: 'Вход 7', eight: 'Вход 8', nine: 'Вход 9', ten: 'Вход 10' };
          var opts = '';
          for (var m = 0; m < modesList.length; m++) {
            var mode = modesList[m];
            var mv = (typeof mode === 'string' ? mode : (mode.value || mode.id || '')) + '';
            var mn = (typeof mode === 'string' ? mode : (mode.name || mode.title || mode.value || mode.id || mv)) + '';
            if (instance === 'input_source' && inputSourceNames[mv]) mn = inputSourceNames[mv];
            if (!mv) continue;
            opts += '<option value="' + escapeHtml(mv) + '"' + (valueStr === mv ? ' selected' : '') + '>' + escapeHtml(mn) + '</option>';
          }
          if (opts) {
            body.innerHTML += '<div class="ctrl-slider-wrap"><span class="ctrl-slider-label">' + modeLabel + '</span><select class="mode-select" data-action="mode" data-instance="' + escapeHtml(instance) + '">' + opts + '</select></div>';
          }
        }
      }
      else if (capType === 'devices.capabilities.color_setting') {
        var cp = cap.parameters || {};
        var tk = cp.temperature_k;
        var palette = cp.palette || [];
        var colorModel = cp.color_model || '';
        var hasTemp = tk && (tk.min || tk.max);
        var hasRgb = colorModel === 'rgb';
        var hasHsv = colorModel === 'hsv';
        if (hasTemp) {
          value = getCapState(cap, 'value');
          var stateInst = cap.state && cap.state.instance;
          var tempVal = toNumber(value, 4000);
          if (stateInst === 'rgb' || stateInst === 'hsv' || tempVal > 10000 || tempVal < 1000) tempVal = 4500;
          var tr = { min: tk.min || 2000, max: tk.max || 9000 };
          tempVal = Math.max(tr.min, Math.min(tr.max, tempVal));
          body.innerHTML += '<div class="ctrl-slider-wrap"><span class="ctrl-slider-label">Температура: ' + tempVal + 'K</span><input type="range" class="ctrl-slider" min="' + tr.min + '" max="' + tr.max + '" step="100" value="' + tempVal + '" data-action="color_temp" data-instance="temperature_k"></div>';
        }
        if (hasRgb || hasHsv) {
          var colorList = [];
        if (palette.length > 0) {
          for (var pc = 0; pc < palette.length; pc++) colorList.push(rgbToHex(palette[pc].rgb || palette[pc]));
        }
        if (colorList.length === 0) colorList = ['#ffffff','#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#ff8800'];
        body.innerHTML += '<div class="ctrl-slider-wrap" data-color-model="' + escapeHtml(colorModel) + '"><span class="ctrl-slider-label">Цвет</span><div class="color-presets">';
          for (var c = 0; c < colorList.length; c++) {
            body.innerHTML += '<button class="color-preset" style="background:' + colorList[c] + '" data-action="color" data-value="' + colorList[c] + '"></button>';
          }
          body.innerHTML += '</div></div>';
        }
      }
    }

    var groupIds = device.group_ids || device.groups || (device.groups && device.groups.length ? device.groups : null);
    var linkedFromGroup = null;
    if (!isHubDevice(device) && userInfo && userInfo.groups) {
      for (var gi = 0; gi < userInfo.groups.length; gi++) {
        var g = userInfo.groups[gi];
        if (g.id === device.id) {
          linkedFromGroup = g;
          break;
        }
        if (!groupIds) {
          var gdevs = g.devices || [];
          for (var gdi = 0; gdi < gdevs.length; gdi++) {
            if (gdevs[gdi].id === device.id) {
              linkedFromGroup = g;
              break;
            }
          }
        }
        if (linkedFromGroup) break;
      }
    }
    if (linkedFromGroup && linkedFromGroup.devices) {
      var groupDevsToShow = [];
      for (var gd = 0; gd < linkedFromGroup.devices.length; gd++) {
        var gdev = linkedFromGroup.devices[gd];
        if (gdev.id === device.id || isHubDevice(gdev)) continue;
        groupDevsToShow.push(gdev);
      }
      if (groupDevsToShow.length > 0) {
        body.innerHTML += '<div class="device-about"><div class="device-about-title">Устройства</div><div class="group-devices-list">';
        for (var gd = 0; gd < groupDevsToShow.length; gd++) body.innerHTML += renderGroupDeviceItemHtml(groupDevsToShow[gd]);
        body.innerHTML += '</div></div>';
        var items = body.querySelectorAll('.group-device-item');
        for (var ii = 0; ii < items.length; ii++) {
          (function(devId) {
            items[ii].onclick = function() {
              hide(modal);
              var dev = getDeviceById(devId);
              openDeviceModal(dev || { id: devId, name: devId, type: '' });
            };
          })(groupDevsToShow[ii].id);
        }
      }
    }
    if (groupIds && groupIds.length > 0) {
      loadGroupDevices(groupIds, function(groupDevices) {
        var grpToShow = [];
        for (var gd = 0; gd < groupDevices.length; gd++) {
          var gdev = groupDevices[gd];
          if (gdev.id === device.id || isHubDevice(gdev)) continue;
          grpToShow.push(gdev);
        }
        if (grpToShow.length > 0) {
          body.innerHTML += '<div class="device-about"><div class="device-about-title">Устройства в группе</div><div class="group-devices-list">';
          for (var gd = 0; gd < grpToShow.length; gd++) body.innerHTML += renderGroupDeviceItemHtml(grpToShow[gd]);
          body.innerHTML += '</div></div>';
          var items = body.querySelectorAll('.group-device-item');
          for (var ii = 0; ii < items.length; ii++) {
            (function(devObj) {
              items[ii].onclick = function() {
                hide(modal);
                openDeviceModal(devObj);
              };
            })(grpToShow[ii]);
          }
        }
      });
    }

    var devInfo = device.device_info || {};
    var manufacturer = device.manufacturer || device.brand || devInfo.manufacturer;
    var model = device.model || devInfo.model;
    var firmware = device.firmware_version || device.firmware || devInfo.sw_version || devInfo.hw_version;
    if (manufacturer || model || device.id || firmware) {
      body.innerHTML += '<div class="device-about"><div class="device-about-title">Об устройстве</div>';
      if (manufacturer) body.innerHTML += '<div class="device-about-row"><span class="device-about-label">Производитель</span><span class="device-about-value">' + escapeHtml(manufacturer) + '</span></div>';
      if (model) body.innerHTML += '<div class="device-about-row"><span class="device-about-label">Модель</span><span class="device-about-value">' + escapeHtml(model) + '</span></div>';
      body.innerHTML += '<div class="device-about-row"><span class="device-about-label">Оригинальное название</span><span class="device-about-value">' + escapeHtml(device.name || '') + '</span></div>';
      body.innerHTML += '<div class="device-about-row"><span class="device-about-label">Идентификатор</span><span class="device-about-value device-about-id">' + escapeHtml(device.id || '') + '</span></div>';
      if (firmware) body.innerHTML += '<div class="device-about-row"><span class="device-about-label">Версия прошивки</span><span class="device-about-value">' + escapeHtml(firmware) + '</span></div>';
      body.innerHTML += '</div>';
    }

    bindModalControls(body, device.id);
    show(modal);
  }

  function rgbToHsv(r, g, b) {
    r = r / 255;
    g = g / 255;
    b = b / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h, s, v = max * 100;
    var d = max - min;
    s = max === 0 ? 0 : (d / max) * 100;
    if (max === min) h = 0;
    else {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6;
      }
      h = Math.round(h * 360);
    }
    return { h: h, s: Math.round(s), v: Math.round(v) };
  }

  function bindModalControls(container, deviceId) {
    var btns = container.querySelectorAll('[data-action]');
    for (var i = 0; i < btns.length; i++) {
      (function(btn) {
        var action = btn.dataset.action;
        if (btn.tagName === 'BUTTON') {
          btn.onclick = function() {
            var v = btn.dataset.value;
            if (v === 'true') v = true;
            else if (v === 'false') v = false;
            var colorModel = '';
            var wrap = btn.closest ? btn.closest('[data-color-model]') : null;
            if (wrap && wrap.getAttribute) colorModel = wrap.getAttribute('data-color-model') || '';
            sendAction(deviceId, action, btn.dataset.instance, v, colorModel);
          };
        } else if (btn.tagName === 'SELECT') {
          btn.onchange = function() {
            sendAction(deviceId, action, btn.dataset.instance, btn.value, '');
          };
        } else if (btn.tagName === 'INPUT' && btn.type === 'range') {
          btn.oninput = function() {
            var lbl = btn.parentNode.querySelector('.ctrl-slider-label');
            if (lbl) lbl.textContent = lbl.textContent.replace(/: \d+/, ': ' + Math.round(parseFloat(btn.value)));
          };
          btn.onchange = function() {
            var val = parseFloat(btn.value);
            sendAction(deviceId, action === 'color_temp' ? 'color_setting' : action, action === 'color_temp' ? 'temperature_k' : btn.dataset.instance, val, '');
          };
        }
      })(btns[i]);
    }
  }

  function sendAction(deviceId, actionType, instance, value, colorModel) {
    colorModel = colorModel || '';
    var actions = [];
    if (actionType === 'on_off') {
      actions.push({ type: 'devices.capabilities.on_off', state: { instance: 'on', value: value } });
    } else if (actionType === 'toggle') {
      actions.push({ type: 'devices.capabilities.toggle', state: { instance: instance, value: value } });
    } else if (actionType === 'range') {
      actions.push({ type: 'devices.capabilities.range', state: { instance: instance, value: value } });
    } else if (actionType === 'mode') {
      actions.push({ type: 'devices.capabilities.mode', state: { instance: instance, value: value } });
    } else if (actionType === 'color_setting') {
      actions.push({ type: 'devices.capabilities.color_setting', state: { instance: instance || 'temperature_k', value: value } });
    } else if (actionType === 'color') {
      var m = value.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
      if (m) {
        var r = parseInt(m[1], 16);
        var g = parseInt(m[2], 16);
        var b = parseInt(m[3], 16);
        if (colorModel === 'hsv') {
          var hsv = rgbToHsv(r, g, b);
          actions.push({ type: 'devices.capabilities.color_setting', state: { instance: 'hsv', value: hsv } });
        } else {
          var rgbInt = (r << 16) | (g << 8) | b;
          actions.push({ type: 'devices.capabilities.color_setting', state: { instance: 'rgb', value: rgbInt } });
        }
      }
    }
    if (actions.length === 0) return;

    deviceAction(deviceId, actions, onActionSuccess(function() {
      renderContent();
      var dev = getDeviceById(deviceId);
      if (dev) openDeviceModal(dev);
    }));
  }

  function renderContent() {
    var filtersEl = $('filters');
    var roomsEl = $('rooms');

    filtersEl.innerHTML = '';
    roomsEl.innerHTML = '';

    if (!userInfo) return;

    var devices = userInfo.devices || [];
    var groups = userInfo.groups || [];
    var rooms = userInfo.rooms || [];
    var roomMap = {};
    for (var r = 0; r < rooms.length; r++) {
      roomMap[rooms[r].id] = rooms[r].name;
    }

    var offlineCount = 0, lightCount = 0, tvCount = 0;
    for (var d = 0; d < devices.length; d++) {
      var dev = devices[d];
      if (isHubDevice(dev)) continue;
      if (dev.state === 'offline') offlineCount++;
      var cat = getDeviceTypeCategory(dev);
      if (cat === 'light') lightCount++;
      else if (cat === 'tv') tvCount++;
    }

    filtersEl.innerHTML = '<button class="filter-chip' + (currentFilter === 'offline' ? ' active' : '') + '" data-filter="offline"><span class="chip-label"><span class="chip-icon icon icon-offline"></span>Не в сети</span><span class="chip-count">' + offlineCount + ' устр</span></button>' +
      '<button class="filter-chip' + (currentFilter === 'light' ? ' active' : '') + '" data-filter="light"><span class="chip-label"><span class="chip-icon icon icon-light"></span>Свет</span><span class="chip-count">' + lightCount + ' устр</span></button>' +
      '<button class="filter-chip' + (currentFilter === 'tv' ? ' active' : '') + '" data-filter="tv"><span class="chip-label"><span class="chip-icon icon icon-tv"></span>ТВ</span><span class="chip-count">' + tvCount + ' устр</span></button>' +
      '<button class="filter-chip' + (currentFilter === 'all' ? ' active' : '') + '" data-filter="all"><span class="chip-label"><span class="chip-icon icon icon-all"></span>Все</span></button>';

    for (var fi = 0; fi < filtersEl.children.length; fi++) {
      filtersEl.children[fi].onclick = (function(f) {
        return function() {
          currentFilter = f;
          renderContent();
        };
      })(filtersEl.children[fi].dataset.filter);
    }

    var byRoom = {};
    var noRoom = [];
    for (var di = 0; di < devices.length; di++) {
      var devItem = devices[di];
      if (isHubDevice(devItem)) continue;
      if (!deviceMatchesFilter(devItem, currentFilter)) continue;

      var roomIds = devItem.room_ids || devItem.room || devItem.rooms || [];
      var roomId = Array.isArray(roomIds) ? roomIds[0] : roomIds;
      var roomName = roomId ? (roomMap[roomId] || roomId) : '';

      if (roomName) {
        if (!byRoom[roomName]) byRoom[roomName] = [];
        byRoom[roomName].push(devItem);
      } else {
        noRoom.push(devItem);
      }
    }

    if (noRoom.length > 0) {
      var sec = document.createElement('div');
      sec.className = 'room-section';
      sec.innerHTML = '<div class="room-header"><span class="room-title">Без комнаты</span></div><div class="devices-grid"></div>';
      var grid = sec.querySelector('.devices-grid');
      for (var j = 0; j < noRoom.length; j++) {
        grid.appendChild(renderDeviceCard(noRoom[j], ''));
      }
      roomsEl.appendChild(sec);
    }

    var roomNames = Object.keys(byRoom).sort();
    for (var rn = 0; rn < roomNames.length; rn++) {
      var name = roomNames[rn];
      sec = document.createElement('div');
      sec.className = 'room-section';
      sec.innerHTML = '<div class="room-header"><span class="room-title">' + escapeHtml(name) + '</span><span class="room-chevron">›</span></div><div class="devices-grid"></div>';
      grid = sec.querySelector('.devices-grid');
      for (var k = 0; k < byRoom[name].length; k++) {
        grid.appendChild(renderDeviceCard(byRoom[name][k], name));
      }
      roomsEl.appendChild(sec);
    }

    for (var gi = 0; gi < groups.length; gi++) {
      var grp = groups[gi];
      var grpDevices = grp.devices || [];
      if (grpDevices.length === 0) continue;
      var grpDeviceCards = [];
      for (var gd = 0; gd < grpDevices.length; gd++) {
        var gdev = grpDevices[gd];
        var devToRender = getDeviceById(gdev.id) || { id: gdev.id, name: gdev.name || 'Устройство', type: gdev.type || '', capabilities: [], room_ids: [] };
        if (isHubDevice(devToRender)) continue;
        grpDeviceCards.push(devToRender);
      }
      var grpType = (grp.type || '').toLowerCase();
      var isMediaGroup = grpType.indexOf('media') !== -1 || grpType.indexOf('tv') !== -1 || (grp.name || '').toLowerCase().indexOf('пульт') !== -1;
      if (grpDeviceCards.length > 0 && (currentFilter === 'all' || (currentFilter === 'tv' && isMediaGroup))) {
        sec = document.createElement('div');
        sec.className = 'room-section';
        sec.innerHTML = '<div class="room-header"><span class="room-title">' + escapeHtml(grp.name || 'Группа') + '</span><span class="room-chevron">›</span></div><div class="devices-grid"></div>';
        grid = sec.querySelector('.devices-grid');
        for (var gc = 0; gc < grpDeviceCards.length; gc++) {
          grid.appendChild(renderDeviceCard(grpDeviceCards[gc], grp.name || ''));
        }
        roomsEl.appendChild(sec);
      }
    }
  }

  function showError(msg) {
    var el = $('error');
    var text = (msg && typeof msg === 'object' && msg.error) ? msg.error : (msg || 'Ошибка');
    text = typeof text === 'string' ? translateDeviceError(text) : String(text);
    el.textContent = text;
    show(el);
    setTimeout(function() { hide(el); }, 5000);
  }

  function parseOAuthHash() {
    var hash = (window.location.hash || '').replace(/^#/, '');
    if (!hash) return null;
    var params = {};
    var parts = hash.split('&');
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i];
      var eq = pair.indexOf('=');
      if (eq > 0) {
        var k = decodeURIComponent(pair.slice(0, eq));
        var v = decodeURIComponent((pair.slice(eq + 1) || '').replace(/\+/g, ' '));
        params[k] = v;
      }
    }
    return params.access_token || null;
  }

  function init() {
    var oauthToken = parseOAuthHash();
    if (oauthToken) {
      window.history.replaceState(null, '', window.location.pathname + (window.location.search || ''));
      token = oauthToken;
      localStorage.setItem(TOKEN_KEY, oauthToken);
      show($('mainScreen'));
      hide($('authScreen'));
      loadAndRender();
      return;
    }
    var savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      token = savedToken;
      show($('mainScreen'));
      hide($('authScreen'));
      loadAndRender();
    } else {
      show($('authScreen'));
      hide($('mainScreen'));
    }

    $('saveTokenBtn').onclick = function() {
      var input = $('tokenInput');
      var t = input.value.trim();
      if (!t) { showError('Введите токен'); return; }
      token = t;
      localStorage.setItem(TOKEN_KEY, t);
      show($('mainScreen'));
      hide($('authScreen'));
      loadAndRender();
    };

    $('refreshBtn').onclick = function() { loadAndRender(); };

    $('settingsBtn').onclick = function() {
      var menu = $('settingsMenu');
      menu.classList.toggle('hidden');
    };

    if ($('addBtn')) $('addBtn').onclick = function() {};

    $('logoutBtn').onclick = function() {
      localStorage.removeItem(TOKEN_KEY);
      token = null;
      hide($('settingsMenu'));
      show($('authScreen'));
      hide($('mainScreen'));
      $('tokenInput').value = '';
    };

    function showDebug(data) {
      var content = $('debugContent');
      if (!content) return;
      try {
        content.value = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      } catch (e) {
        content.value = 'Ошибка: ' + String(e);
      }
    }
    if ($('debugBtn')) {
      $('debugBtn').onclick = function() {
        hide($('settingsMenu'));
        var content = $('debugContent');
        var modal = $('debugModal');
        if (content && modal) {
          showDebug(rawApiResponse || userInfo || {});
          show(modal);
        }
      };
    }
    if ($('debugCopyBtn')) {
      $('debugCopyBtn').onclick = function() {
        var content = $('debugContent');
        if (!content) return;
        content.focus();
        content.setSelectionRange(0, (content.value || '').length);
        try {
          if (document.execCommand('copy')) {
            alert('Скопировано');
          } else {
            alert('Выделите текст вручную и скопируйте');
          }
        } catch (e) {
          alert('Выделите текст вручную и скопируйте');
        }
      };
    }
    if ($('debugFullBtn')) {
      $('debugFullBtn').onclick = function() {
        showDebug(rawApiResponse || userInfo || {});
      };
    }
    if ($('debugStructureBtn')) {
      $('debugStructureBtn').onclick = function() {
        var r = rawApiResponse || {};
        var p = r.payload || r;
        var out = {
          topLevelKeys: Object.keys(r),
          payloadKeys: Object.keys(p),
          devicesCount: (p.devices || r.devices || []).length,
          roomsCount: (p.rooms || r.rooms || []).length,
          groupsCount: (p.groups || r.groups || []).length,
          housesCount: (p.houses || r.houses || []).length,
          householdsCount: (p.households || r.households || []).length,
          deviceList: (p.devices || r.devices || []).map(function(d) { return d.id + ' ' + (d.name || ''); })
        };
        showDebug(out);
      };
    }
    if ($('debugModalClose')) $('debugModalClose').onclick = function() { hide($('debugModal')); };
    if ($('debugModalBackdrop')) $('debugModalBackdrop').onclick = function() { hide($('debugModal')); };

    $('modalClose').onclick = function() {
      hide($('deviceModal'));
    };

    $('deviceModal').querySelector('.modal-backdrop').onclick = function() {
      hide($('deviceModal'));
    };

    var cameraCloseBtn = $('cameraModalClose');
    if (cameraCloseBtn) cameraCloseBtn.onclick = closeCameraModal;
    var cameraBackdrop = $('cameraModalBackdrop');
    if (cameraBackdrop) cameraBackdrop.onclick = closeCameraModal;

    var navItems = document.querySelectorAll('.nav-item[data-tab]');
    for (var n = 0; n < navItems.length; n++) {
      navItems[n].onclick = function(e) {
        e.preventDefault();
        var tab = this.dataset.tab;
        for (var i = 0; i < navItems.length; i++) navItems[i].classList.remove('active');
        this.classList.add('active');
        if (tab === 'scenarios') {
          show($('scenariosPanel'));
          var list = $('scenariosList');
          list.innerHTML = '';
          var scenarios = (userInfo && userInfo.scenarios) || [];
          for (var s = 0; s < scenarios.length; s++) {
            var sc = scenarios[s];
            var btn = document.createElement('button');
            btn.className = 'scenario-card';
            btn.textContent = sc.name || sc.id;
            btn.onclick = (function(id) {
              return function() {
                apiRequest('POST', '/scenarios/' + id + '/actions', {}, function(err) {
                  if (err) showError(err.error);
                });
              };
            })(sc.id);
            list.appendChild(btn);
          }
        } else {
          hide($('scenariosPanel'));
        }
      };
    }

    document.addEventListener('click', function(e) {
      if ($('settingsMenu') && !$('settingsMenu').classList.contains('hidden')) {
        if (e.target !== $('settingsBtn') && !$('settingsMenu').contains(e.target)) {
          hide($('settingsMenu'));
        }
      }
    });

    $('scenariosClose').onclick = function() {
      hide($('scenariosPanel'));
      var items = document.querySelectorAll('.nav-item[data-tab="home"]');
      if (items.length) items[0].classList.add('active');
    };

    var oauthLink = $('oauthLink');
    if (oauthLink) {
      var clientId = (typeof YANDEX_OAUTH_CLIENT_ID !== 'undefined' ? YANDEX_OAUTH_CLIENT_ID : '') || '';
      var redirectUri = (typeof OAUTH_REDIRECT_URI !== 'undefined' && OAUTH_REDIRECT_URI) ? OAUTH_REDIRECT_URI : (location.origin + '/');
      oauthLink.href = clientId ? ('https://oauth.yandex.ru/authorize?response_type=token&client_id=' + encodeURIComponent(clientId) + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&force_confirm=yes') : '#';
      oauthLink.onclick = function(e) {
        if (!clientId) { e.preventDefault(); showError('Укажите YANDEX_OAUTH_CLIENT_ID в config.js'); return false; }
      };
    }
  }

  function loadAndRender() {
    show($('loading'));
    hide($('content'));
    hide($('error'));

    loadUserInfo(function(err) {
      hide($('loading'));
      if (err) {
        if (err.error && String(err.error).indexOf('401') !== -1) {
          localStorage.removeItem(TOKEN_KEY);
          token = null;
          show($('authScreen'));
          hide($('mainScreen'));
          showError('Токен недействителен');
        } else {
          showError(err.error || 'Ошибка загрузки');
        }
        return;
      }
      show($('content'));
      renderContent();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
