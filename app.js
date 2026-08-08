const STORE_KEY = 'map-tagger-state';
  const LOCAL_STORE_KEY = 'rs3-leagues-task-planner-state-v1';
  const DEFAULT_MAP = 'assets/rs3-leagues-map.png';

  // ---------- Map / route state ----------
  let state = {
    imageDataUrl: null,
    placements: [],
    zoom: 1,
    selectedRegions: null,
    completedTaskCodes: []
  };
  let nextId = 1;
  let dragTarget = null;
  let dragOffsetX = 0, dragOffsetY = 0;
  let isPanning = false;
  let panMoved = false;
  let panStartX = 0, panStartY = 0, panScrollLeft = 0, panScrollTop = 0;
  let placingTaskCode = null;

  const mapArea = document.getElementById('mapArea');
  const mapWrapper = document.getElementById('mapWrapper');
  const mapImage = document.getElementById('mapImage');
  const taskInfoPopup = document.getElementById('taskInfoPopup');
  const taskInfoTitle = document.getElementById('taskInfoTitle');
  const taskInfoListNumber = document.getElementById('taskInfoListNumber');
  const taskInfoTier = document.getElementById('taskInfoTier');
  const taskInfoPoints = document.getElementById('taskInfoPoints');
  const taskInfoNote = document.getElementById('taskInfoNote');
  const taskInfoClose = document.getElementById('taskInfoClose');
  let openInfoPlacementId = null;
  const placeholder = document.getElementById('placeholder');
  const routeList = document.getElementById('routeList');
  const routeCount = document.getElementById('routeCount');
  const routeProgress = document.getElementById('routeProgress');
  const emptyRouteMsg = document.getElementById('empty-route-msg');
  const statusEl = document.getElementById('status');
  const zoomControls = document.getElementById('zoomControls');

  function setStatus(msg) { statusEl.textContent = msg; }

  async function loadState() {
    let hadSaved = false;
    try {
      let savedValue = localStorage.getItem(LOCAL_STORE_KEY);
      if (!savedValue && window.storage) {
        const result = await window.storage.get(STORE_KEY, false);
        savedValue = result && result.value;
      }
      if (savedValue) {
        const parsed = JSON.parse(savedValue);
        state = Object.assign(state, parsed);
        // The bundled map is restored below instead of being stored alongside
        // route data, which keeps browser storage well below its size limit.
        if (!state.imageDataUrl) state.imageDataUrl = DEFAULT_MAP;
        if (!Array.isArray(state.placements)) {
          state.placements = Array.isArray(state.tags) ? state.tags.map(t => ({
            id: t.id, taskCode: null, x: t.x, y: t.y, note: t.text || ''
          })) : [];
        }
        if (!Array.isArray(state.selectedRegions)) state.selectedRegions = REGION_CODES.map(([code]) => code);
        if (!Array.isArray(state.completedTaskCodes)) state.completedTaskCodes = [];
        doneSet = new Set(state.completedTaskCodes);
        state.zoom = Math.max(0.25, Math.min(4, Number(state.zoom) || 1));
        nextId = state.placements.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1;
        hadSaved = true;
      }
    } catch (e) {}
    if (!hadSaved) {
      state.imageDataUrl = DEFAULT_MAP;
      state.placements = [];
      state.selectedRegions = null; // initialized after REGION_CODES is declared
    }
    render();
    renderRegionFilters();
    renderTasks();
    const activePlacement = state.placements.find(p => !doneSet.has(p.taskCode)) || state.placements[0];
    if (activePlacement) {
      const centerActiveTask = () => requestAnimationFrame(() => centerPlacement(activePlacement));
      if (mapImage.complete) centerActiveTask();
      else mapImage.addEventListener('load', centerActiveTask, { once: true });
    }
  }

  async function saveState() {
    const savedState = Object.assign({}, state);
    // The default embedded map is over 5 MB and exceeds common localStorage
    // quotas. It is already bundled with this page, so there is no need to save it.
    if (savedState.imageDataUrl === DEFAULT_MAP) delete savedState.imageDataUrl;
    const serializedState = JSON.stringify(savedState);
    let savedLocally = false;
    try {
      localStorage.setItem(LOCAL_STORE_KEY, serializedState);
      savedLocally = true;
    } catch (e) {}
    try {
      if (window.storage) await window.storage.set(STORE_KEY, serializedState, false);
      setStatus('Saved.');
    } catch (e) {
      setStatus(savedLocally ? 'Saved.' : 'Save failed — changes kept in this session only.');
    }
  }

  function taskByCode(code) {
    return TASKS.find(t => t.code === code);
  }

  function taskPoints(task) {
    if (!task) return '—';
    if (task.points != null) return task.points;
    // The currently released task tiers use the point values shown by the
    // supplied task source: Easy = 10, Medium = 30.
    return task.tier === 'Easy' ? 10 : task.tier === 'Medium' ? 30 : '—';
  }

  function closeTaskInfo() {
    taskInfoPopup.classList.remove('open');
    openInfoPlacementId = null;
  }

  function showTaskInfo(placement) {
    const task = taskByCode(placement.taskCode);
    if (!task) return;
    openInfoPlacementId = placement.id;
    taskInfoTitle.textContent = '[' + task.code + '] ' + task.text;
    const routeIndex = state.placements.findIndex(p => p.id === placement.id);
    taskInfoListNumber.textContent = routeIndex >= 0 ? String(routeIndex + 1) : '—';
    taskInfoTier.textContent = task.tier;
    taskInfoPoints.textContent = taskPoints(task);
    taskInfoNote.value = placement.note || '';
    taskInfoPopup.classList.add('open');
    renderRouteList();
    setStatus('Viewing task details: ' + task.code + '.');
  }

  taskInfoClose.onclick = (e) => {
    e.stopPropagation();
    closeTaskInfo();
  };
  taskInfoNote.addEventListener('input', () => {
    if (openInfoPlacementId === null) return;
    const placement = state.placements.find(p => p.id === openInfoPlacementId);
    if (!placement) return;
    placement.note = taskInfoNote.value;
    saveState();
  });

  function renderPinsOnly() {
    document.querySelectorAll('.pin').forEach(p => p.remove());
    state.placements.forEach((placement, index) => renderPin(placement, index));
  }

  function render() {
    if (state.imageDataUrl) {
      mapImage.src = state.imageDataUrl;
      mapWrapper.style.display = 'inline-block';
      placeholder.style.display = 'none';
      zoomControls.style.display = 'flex';
    } else {
      mapWrapper.style.display = 'none';
      placeholder.style.display = 'block';
      zoomControls.style.display = 'none';
    }

    // CSS zoom scales both the image and its absolutely-positioned pins while
    // also expanding the scrollable layout, unlike transform: scale().
    mapWrapper.style.zoom = state.zoom;

    renderPinsOnly();

    renderRouteList();
    if (openInfoPlacementId !== null) {
      const openPlacement = state.placements.find(p => p.id === openInfoPlacementId);
      if (openPlacement) showTaskInfo(openPlacement); else closeTaskInfo();
    }
  }

  function renderPin(placement, index) {
    const task = taskByCode(placement.taskCode);
    const pin = document.createElement('div');
    const isDone = doneSet.has(placement.taskCode);
    const currentPlacement = state.placements.find(p => !doneSet.has(p.taskCode));
    const isCurrent = currentPlacement && currentPlacement.id === placement.id;
    pin.className = 'pin' + (isDone ? ' done' : '') + (isCurrent ? ' current' : '');
    pin.dataset.id = placement.id;
    pin.setAttribute('role', 'button');
    pin.setAttribute('tabindex', '0');
    pin.setAttribute('aria-label', task ? 'View details for ' + task.code + ': ' + task.text : 'View placed task details');
    pin.title = 'Click to view task details';
    pin.style.left = placement.x + 'px';
    pin.style.top = placement.y + 'px';
    // Keep the bubble tip anchored exactly at placement.x/y while keeping
    // its visual size constant as the map zooms.
    pin.style.transform = 'translate(-50%, -100%) scale(' + (1 / state.zoom) + ')';

    const dot = document.createElement('div');
    dot.className = 'pin-dot';
    pin.appendChild(dot);

    const number = document.createElement('div');
    number.className = 'pin-number';
    number.textContent = index + 1;
    pin.appendChild(number);

    const label = document.createElement('div');
    label.className = 'pin-label';
    label.textContent = task ? task.code : '#' + (index + 1);
    pin.appendChild(label);

    const openDetails = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.pin.selected').forEach(p => p.classList.remove('selected'));
      pin.classList.add('selected');
      showTaskInfo(placement);
    };
    pin.addEventListener('click', openDetails);
    pin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetails(e);
      }
    });

    pin.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      dragTarget = placement.id;
      pin.classList.add('dragging');
      const rect = mapImage.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / state.zoom;
      const mouseY = (e.clientY - rect.top) / state.zoom;
      dragOffsetX = mouseX - placement.x;
      dragOffsetY = mouseY - placement.y;
    });

    pin.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      showPromptModal('Note for task:', placement.note || '', (newNote) => {
        placement.note = newNote.trim();
        render();
        saveState();
      });
    });

    mapWrapper.appendChild(pin);
  }

  function renderRouteList() {
    routeList.innerHTML = '';
    routeCount.textContent = state.placements.length;
    const completedRouteTasks = state.placements.filter(p => p.taskCode && doneSet.has(p.taskCode)).length;
    routeProgress.textContent = state.placements.length > 0 ? completedRouteTasks + ' / ' + state.placements.length + ' complete' : '';
    const currentPlacement = state.placements.find(p => !doneSet.has(p.taskCode));
    const selectedPlacementId = openInfoPlacementId;

    if (state.placements.length === 0) {
      emptyRouteMsg.style.display = 'block';
      return;
    }
    emptyRouteMsg.style.display = 'none';

    state.placements.forEach((placement, index) => {
      const task = taskByCode(placement.taskCode);
      const li = document.createElement('li');
      li.className = 'route-item';
      if (currentPlacement && currentPlacement.id === placement.id) li.classList.add('current-route');
      if (selectedPlacementId === placement.id) li.classList.add('route-item-selected');

      const num = document.createElement('span');
      num.className = 'route-num';
      num.textContent = index + 1;
      li.appendChild(num);

      li.draggable = true;
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(placement.id));
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
      });
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => {
        li.classList.remove('drag-over');
      });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        const draggedId = Number(e.dataTransfer.getData('text/plain'));
        if (!Number.isFinite(draggedId)) return;
        const targetIndex = Array.from(routeList.children).indexOf(li);
        reorderPlacement(draggedId, targetIndex);
      });

      const body = document.createElement('div');
      body.className = 'route-body';

      const titleRow = document.createElement('div');
      titleRow.className = 'route-title-row';

      const done = document.createElement('input');
      done.type = 'checkbox';
      done.className = 'route-done';
      done.checked = !!(task && doneSet.has(task.code));
      done.title = 'Mark task complete';
      done.onchange = () => {
        if (!task) return;
        if (done.checked) doneSet.add(task.code); else doneSet.delete(task.code);
        saveDoneCookie();
        renderTasks();
        renderRouteList();
        renderPinsOnly();
      };

      const title = document.createElement('div');
      title.className = 'route-title' + (task && doneSet.has(task.code) ? ' done' : '');
      title.textContent = task ? '[' + task.code + '] ' + task.text : '(unknown task)';
      title.title = task ? task.text : '';
      title.onclick = () => {
        if (task) done.click();
      };

      const points = document.createElement('div');
      points.className = 'route-points';
      points.textContent = task ? taskPoints(task) + ' pts' : '';

      titleRow.append(done, title, points);
      body.appendChild(titleRow);

      const note = document.createElement('textarea');
      note.className = 'route-note';
      note.placeholder = 'Notes…';
      note.value = placement.note || '';
      note.rows = 2;
      note.addEventListener('change', () => {
        placement.note = note.value.trim();
        saveState();
      });
      body.appendChild(note);
      li.appendChild(body);

      const actions = document.createElement('div');
      actions.className = 'route-actions';

      const up = document.createElement('button');
      up.textContent = '↑';
      up.title = 'Move up';
      up.disabled = index === 0;
      up.onclick = () => movePlacement(index, -1);

      const down = document.createElement('button');
      down.textContent = '↓';
      down.title = 'Move down';
      down.disabled = index === state.placements.length - 1;
      down.onclick = () => movePlacement(index, 1);

      const center = document.createElement('button');
      center.textContent = '⌖';
      center.title = 'Center on map';
      center.onclick = () => centerPlacement(placement);

      const remove = document.createElement('button');
      remove.textContent = '×';
      remove.className = 'route-remove';
      remove.title = 'Remove from route';
      remove.onclick = () => {
        state.placements = state.placements.filter(p => p.id !== placement.id);
        render();
        saveState();
      };

      actions.append(up, down, center, remove);
      li.appendChild(actions);
      routeList.appendChild(li);
    });
  }

  function movePlacement(index, delta) {
    const other = index + delta;
    if (other < 0 || other >= state.placements.length) return;
    [state.placements[index], state.placements[other]] =
      [state.placements[other], state.placements[index]];
    render();
    saveState();
  }

  function reorderPlacement(draggedId, targetIndex) {
    const fromIndex = state.placements.findIndex(p => p.id === draggedId);
    if (fromIndex === -1 || targetIndex < 0 || targetIndex >= state.placements.length) return;
    if (fromIndex === targetIndex) return;
    const [moved] = state.placements.splice(fromIndex, 1);
    const insertIndex = targetIndex;
    state.placements.splice(insertIndex, 0, moved);
    render();
    saveState();
  }

  function centerPlacement(placement) {
    const scale = state.zoom;
    mapArea.scrollLeft = Math.max(0, placement.x * scale - mapArea.clientWidth / 2);
    mapArea.scrollTop = Math.max(0, placement.y * scale - mapArea.clientHeight / 2);
  }

  function focusPlacedTask(placement) {
    tabBtnMap.click();
    requestAnimationFrame(() => {
      centerPlacement(placement);
      document.querySelectorAll('.pin.selected').forEach(p => p.classList.remove('selected'));
      const pin = document.querySelector('.pin[data-id="' + placement.id + '"]');
      if (pin) {
        pin.classList.add('selected', 'highlighted');
        setTimeout(() => pin.classList.remove('highlighted'), 1200);
      }
      showTaskInfo(placement);
    });
  }

  function beginPlaceTask(taskCode) {
    if (state.placements.some(p => p.taskCode === taskCode)) {
      setStatus('That task is already on your route.');
      return;
    }
    placingTaskCode = taskCode;
    tabBtnMap.click();
    mapWrapper.classList.add('placing');
    const task = taskByCode(taskCode);
    setStatus('Click the map to place: ' + (task ? task.text : taskCode));
  }

  const PAN_THRESHOLD = 6;

  mapWrapper.addEventListener('mousedown', (e) => {
    if (dragTarget !== null || placingTaskCode !== null) return;
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    isPanning = true;
    panMoved = false;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panScrollLeft = mapArea.scrollLeft;
    panScrollTop = mapArea.scrollTop;
    mapWrapper.classList.add('panning');
  });

  mapWrapper.addEventListener('click', (e) => {
    if (dragTarget !== null) return;
    if (placingTaskCode === null) {
      if (panMoved) { panMoved = false; return; }
      if (!e.target.closest('.pin')) {
        document.querySelectorAll('.pin.selected').forEach(p => p.classList.remove('selected'));
        openInfoPlacementId = null;
        taskInfoPopup.classList.remove('open');
        renderRouteList();
      }
      return;
    }
    if (panMoved) { panMoved = false; return; }

    const rect = mapImage.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.zoom;
    const y = (e.clientY - rect.top) / state.zoom;
    const taskCode = placingTaskCode;
    placingTaskCode = null;
    mapWrapper.classList.remove('placing');

    state.placements.push({
      id: nextId++,
      taskCode,
      x: Math.round(x),
      y: Math.round(y),
      note: ''
    });
    render();
    saveState();
    setStatus('Task placed. Use the route list to reorder it or add notes.');
  });

  mapWrapper.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    mapWrapper.classList.add('drag-over');
  });

  mapWrapper.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    mapWrapper.classList.add('drag-over');
  });

  mapWrapper.addEventListener('dragleave', () => {
    mapWrapper.classList.remove('drag-over');
  });

  mapWrapper.addEventListener('drop', (e) => {
    if (!e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    mapWrapper.classList.remove('drag-over');

    const taskCode = e.dataTransfer.getData('text/plain');
    if (!taskCode) return;
    if (state.placements.some(p => p.taskCode === taskCode)) {
      setStatus('That task is already on your route.');
      return;
    }
    const rect = mapImage.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.zoom;
    const y = (e.clientY - rect.top) / state.zoom;
    state.placements.push({
      id: nextId++,
      taskCode,
      x: Math.round(x),
      y: Math.round(y),
      note: ''
    });
    render();
    saveState();
    setStatus('Task added to the route.');
  });

  document.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      if (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD) panMoved = true;
      mapArea.scrollLeft = panScrollLeft - dx;
      mapArea.scrollTop = panScrollTop - dy;
      return;
    }
    if (dragTarget === null) return;
    const placement = state.placements.find(p => p.id === dragTarget);
    if (!placement) return;
    const rect = mapImage.getBoundingClientRect();
    placement.x = Math.round((e.clientX - rect.left) / state.zoom - dragOffsetX);
    placement.y = Math.round((e.clientY - rect.top) / state.zoom - dragOffsetY);
    const el = document.querySelector('.pin[data-id="' + placement.id + '"]');
    if (el) {
      el.style.left = placement.x + 'px';
      el.style.top = placement.y + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      mapWrapper.classList.remove('panning');
    }
    if (dragTarget !== null) {
      const el = document.querySelector('.pin[data-id="' + dragTarget + '"]');
      if (el) el.classList.remove('dragging');
      dragTarget = null;
      dragOffsetX = 0;
      dragOffsetY = 0;
      saveState();
    }
  });

  function setZoom(value, clientX, clientY) {
    const oldZoom = state.zoom;
    const newZoom = Math.max(0.25, Math.min(4, +value.toFixed(2)));
    if (newZoom === oldZoom) return;

    // Keep the point under the cursor stationary while zooming.
    let mapX = null, mapY = null;
    if (clientX != null && clientY != null) {
      const rect = mapImage.getBoundingClientRect();
      mapX = (clientX - rect.left) / oldZoom;
      mapY = (clientY - rect.top) / oldZoom;
    }

    state.zoom = newZoom;
    render();

    if (mapX != null) {
      mapArea.scrollLeft = Math.max(0, mapX * newZoom - (clientX - mapArea.getBoundingClientRect().left));
      mapArea.scrollTop = Math.max(0, mapY * newZoom - (clientY - mapArea.getBoundingClientRect().top));
    }
    saveState();
  }

  document.getElementById('zoomIn').onclick = () => setZoom(state.zoom + 0.25);
  document.getElementById('zoomOut').onclick = () => setZoom(state.zoom - 0.25);
  document.getElementById('zoomReset').onclick = () => setZoom(1);

  mapArea.addEventListener('wheel', (e) => {
    if (!state.imageDataUrl) return;
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1;
    setZoom(state.zoom + direction * 0.1, e.clientX, e.clientY);
  }, { passive: false });

  document.getElementById('clearBtn').onclick = () => {
    if (state.placements.length === 0) return;
    showConfirmModal('Remove every task from your route? This cannot be undone.', () => {
      state.placements = [];
      render();
      saveState();
    });
  };

  document.getElementById('exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify({
      placements: state.placements,
      zoom: state.zoom,
      selectedRegions: state.selectedRegions,
      completedTaskCodes: state.completedTaskCodes
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rs3-leagues-route.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (Array.isArray(parsed.placements)) {
          state.placements = parsed.placements;
          if (Array.isArray(parsed.selectedRegions)) state.selectedRegions = parsed.selectedRegions;
          if (Array.isArray(parsed.completedTaskCodes)) {
            state.completedTaskCodes = parsed.completedTaskCodes;
            doneSet = new Set(parsed.completedTaskCodes);
          }
          if (Number.isFinite(parsed.zoom)) state.zoom = Math.max(0.25, Math.min(4, parsed.zoom));
          nextId = state.placements.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1;
          render();
          renderRegionFilters();
          saveState();
          setStatus('Route imported.');
        } else {
          setStatus('That file does not look like a valid route export.');
        }
      } catch (err) {
        setStatus('Could not parse that file as JSON.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });


  // ---------- Region / task data ----------
  const REGION_CODES = [
    ['Mi', 'Misthalin'],
    ['H', 'Havenhythe'],
    ['K', 'Karamja'],
    ['An', 'Anachronia'],
    ['As', 'Asgarnia'],
    ['D', 'Desert'],
    ['F', 'Fremennik'],
    ['Ka', 'Kandarin'],
    ['Mo', 'Morytania'],
    ['T', 'Tirannwn'],
    ['W', 'Wilderness'],
    ['G', 'Global']
  ];
  const REGION_BY_CODE = Object.fromEntries(REGION_CODES);

  // Tasks extracted from the attached Equilibrium League task page.
  // The source currently contains Easy and Medium tasks only.
  let doneSet = new Set();

  // ---------- Completion persistence ----------
  function loadTaskCookies() {
    doneSet = new Set(Array.isArray(state.completedTaskCodes) ? state.completedTaskCodes : []);
  }
  function saveDoneCookie() {
    state.completedTaskCodes = Array.from(doneSet);
    saveState();
  }

  // ---------- Tabs ----------
  const tabBtnTasks = document.getElementById('tabBtnTasks');
  const tabBtnMap = document.getElementById('tabBtnMap');
  const tabPanelTasks = document.getElementById('tabPanelTasks');
  const tabPanelMap = document.getElementById('tabPanelMap');
  tabBtnTasks.onclick = () => {
    tabBtnTasks.classList.add('active'); tabBtnMap.classList.remove('active');
    tabPanelTasks.classList.add('active'); tabPanelMap.classList.remove('active');
  };
  tabBtnMap.onclick = () => {
    tabBtnMap.classList.add('active'); tabBtnTasks.classList.remove('active');
    tabPanelMap.classList.add('active'); tabPanelTasks.classList.remove('active');
  };

  // ---------- Modals ----------
  const promptModal = document.getElementById('promptModal');
  const promptModalLabel = document.getElementById('promptModalLabel');
  const promptModalInput = document.getElementById('promptModalInput');
  const promptModalOk = document.getElementById('promptModalOk');
  const promptModalCancel = document.getElementById('promptModalCancel');
  let promptModalCallback = null;

  function showPromptModal(label, defaultValue, callback) {
    promptModalLabel.textContent = label;
    promptModalInput.value = defaultValue || '';
    promptModalCallback = callback;
    promptModal.classList.add('open');
    setTimeout(() => promptModalInput.focus(), 0);
  }
  function closePromptModal() {
    promptModal.classList.remove('open');
    promptModalCallback = null;
  }
  promptModalOk.onclick = () => {
    const val = promptModalInput.value;
    const cb = promptModalCallback;
    closePromptModal();
    if (cb) cb(val);
  };
  promptModalCancel.onclick = () => closePromptModal();
  promptModalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') promptModalOk.click();
    if (e.key === 'Escape') closePromptModal();
  });

  const confirmModal = document.getElementById('confirmModal');
  const confirmModalLabel = document.getElementById('confirmModalLabel');
  const confirmModalOk = document.getElementById('confirmModalOk');
  const confirmModalCancel = document.getElementById('confirmModalCancel');
  let confirmModalCallback = null;
  function showConfirmModal(label, callback) {
    confirmModalLabel.textContent = label;
    confirmModalCallback = callback;
    confirmModal.classList.add('open');
  }
  function closeConfirmModal() {
    confirmModal.classList.remove('open');
    confirmModalCallback = null;
  }
  confirmModalOk.onclick = () => {
    const cb = confirmModalCallback;
    closeConfirmModal();
    if (cb) cb();
  };
  confirmModalCancel.onclick = () => closeConfirmModal();

  // ---------- Task checklist ----------
  const regionChecks = document.getElementById('regionChecks');
  const tierFilter = document.getElementById('tierFilter');
  const taskListEl = document.getElementById('taskList');
  const taskProgress = document.getElementById('taskProgress');

  function renderRegionFilters() {
    if (!Array.isArray(state.selectedRegions)) {
      state.selectedRegions = REGION_CODES.map(([code]) => code);
    }
    regionChecks.innerHTML = '';
    REGION_CODES.forEach(([code, name]) => {
      const label = document.createElement('label');
      label.className = 'region-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = code;
      cb.checked = state.selectedRegions.includes(code);
      cb.onchange = () => {
        state.selectedRegions = Array.from(regionChecks.querySelectorAll('input:checked')).map(x => x.value);
        renderTasks();
        saveState();
      };
      const count = TASKS.filter(t => t.code.startsWith(code)).length;
      const text = document.createElement('span');
      text.textContent = name + ' (' + count + ')';
      label.append(cb, text);
      regionChecks.appendChild(label);
    });
  }

  function renderTasks() {
    const selected = new Set(state.selectedRegions || REGION_CODES.map(([code]) => code));
    const tier = tierFilter.value;
    taskListEl.innerHTML = '';
    const currentPlacement = state.placements.find(p => !doneSet.has(p.taskCode));

    let doneCount = 0;
    let totalCount = 0;
    TASKS.forEach(task => {
      if (!selected.has(task.code.replace(/\d+$/, ''))) return;
      if (tier !== '__all__' && task.tier !== tier) return;
      const isDone = doneSet.has(task.code);
      if (isDone) doneCount++;
      totalCount++;

      const li = document.createElement('li');
      if (isDone) li.classList.add('done');
      if (currentPlacement && currentPlacement.taskCode === task.code) li.classList.add('current-route-task');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isDone;
      cb.title = 'Mark task complete';
      cb.onchange = () => {
        if (cb.checked) doneSet.add(task.code); else doneSet.delete(task.code);
        saveDoneCookie();
        renderTasks();
        renderRouteList();
        renderPinsOnly();
      };

      const codeSpan = document.createElement('span');
      codeSpan.className = 'task-code';
      codeSpan.textContent = task.code;

      const textSpan = document.createElement('span');
      textSpan.className = 'task-text';
      textSpan.textContent = task.text;
      textSpan.title = task.text;

      const tierSpan = document.createElement('span');
      tierSpan.className = 'task-tier ' + task.tier.toLowerCase();
      tierSpan.textContent = task.tier;

      li.draggable = true;
      li.addEventListener('dragstart', (e) => {
        if (!task.code) return;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', task.code);
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
      });

      const placement = state.placements.find(p => p.taskCode === task.code);
      const placeBtn = document.createElement('button');
      placeBtn.className = 'place-task-btn';
      placeBtn.textContent = placement ? 'Focus' : 'Place';
      placeBtn.title = placement ? 'Open this task in Map tags' : 'Place this task on the map';
      placeBtn.onclick = (e) => {
        e.stopPropagation();
        if (placement) focusPlacedTask(placement); else beginPlaceTask(task.code);
      };

      textSpan.onclick = () => cb.click();

      // Hovering a task in the left task list highlights its placed marker.
      li.addEventListener('mouseenter', () => {
        const placement = state.placements.find(p => p.taskCode === task.code);
        if (!placement) return;
        const pin = document.querySelector('.pin[data-id="' + placement.id + '"]');
        if (pin) pin.classList.add('highlighted');
      });
      li.addEventListener('mouseleave', () => {
        const placement = state.placements.find(p => p.taskCode === task.code);
        if (!placement) return;
        const pin = document.querySelector('.pin[data-id="' + placement.id + '"]');
        if (pin) pin.classList.remove('highlighted');
      });

      li.append(cb, codeSpan, textSpan, tierSpan, placeBtn);
      taskListEl.appendChild(li);
    });
    taskProgress.textContent = 'Completed: ' + doneCount + ' • Showing: ' + totalCount;
  }

  tierFilter.onchange = renderTasks;

  document.getElementById('selectAllRegionsBtn').onclick = () => {
    state.selectedRegions = REGION_CODES.map(([code]) => code);
    renderRegionFilters();
    renderTasks();
    saveState();
  };
  document.getElementById('clearRegionsBtn').onclick = () => {
    state.selectedRegions = [];
    renderRegionFilters();
    renderTasks();
    saveState();
  };

  document.getElementById('clearTasksBtn').onclick = () => {
    if (doneSet.size === 0) return;
    showConfirmModal('Clear all completed tasks? This cannot be undone.', () => {
      doneSet.clear();
      saveDoneCookie();
      renderTasks();
      renderRouteList();
    });
  };

  loadTaskCookies();
  if (!Array.isArray(state.selectedRegions)) {
    state.selectedRegions = REGION_CODES.map(([code]) => code);
  }
  renderRegionFilters();
  renderTasks();
  loadState();
