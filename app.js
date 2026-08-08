const STORE_KEY = 'map-tagger-state';
  const LOCAL_STORE_KEY = 'rs3-leagues-task-planner-state-v1';
  const DEFAULT_MAP = 'assets/rs3-leagues-map.png';

  // ---------- Map / route state ----------
  let state = {
    imageDataUrl: null,
    placements: [],
    zoom: 1,
    selectedRegions: null,
    completedTaskCodes: [],
    showCompleted: true,
    hidePlacedTasks: false,
    activeTab: 'tasks'
  };
  let nextId = 1;
  let dragTarget = null;
  let dragOffsetX = 0, dragOffsetY = 0;
  let isPanning = false;
  let panMoved = false;
  let draggingTaskCode = null;
  let dragPreviewPin = null;
  let panStartX = 0, panStartY = 0, panScrollLeft = 0, panScrollTop = 0;
  let placingTaskCode = null;
  let placingCustomMarker = false;

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
  const taskInfoDoneBtn = document.getElementById('taskInfoDoneBtn');
  const taskInfoRemoveBtn = document.getElementById('taskInfoRemoveBtn');
  const addCustomMarkerBtn = document.getElementById('addCustomMarkerBtn');
  const mapContextMenu = document.getElementById('mapContextMenu');
  let openInfoPlacementId = null;
  let openInfoReadOnly = false;
  const placeholder = document.getElementById('placeholder');
  
  const routeList = document.getElementById('routeList');
  let routeSorter = null;
  const routeCount = document.getElementById('routeCount');
  const routeProgress = document.getElementById('routeProgress');
  const emptyRouteMsg = document.getElementById('empty-route-msg');
  const statusEl = document.getElementById('status');
  const zoomControls = document.getElementById('zoomControls');
  const routeFocusPanel = document.getElementById('routeFocusPanel');
  const routeFocusCurrent = document.getElementById('routeFocusCurrent');
  const routeFocusNext = document.getElementById('routeFocusNext');
  const routeFocusEmpty = document.getElementById('routeFocusEmpty');
  const routeFocusCurrentCode = document.getElementById('routeFocusCurrentCode');
  const routeFocusCurrentTier = document.getElementById('routeFocusCurrentTier');
  const routeFocusCurrentPoints = document.getElementById('routeFocusCurrentPoints');
  const routeFocusCurrentText = document.getElementById('routeFocusCurrentText');
  const routeFocusCurrentDoneBtn = document.getElementById('routeFocusCurrentDoneBtn');
  const routeFocusNextCode = document.getElementById('routeFocusNextCode');
  const routeFocusNextTier = document.getElementById('routeFocusNextTier');
  const routeFocusNextPoints = document.getElementById('routeFocusNextPoints');
  const routeFocusNextText = document.getElementById('routeFocusNextText');

  function setStatus(msg) { statusEl.textContent = msg; }

  function getActiveRoutePlacements() {
    return state.placements.filter(p => {
      if (p.customMarker) {
        return !doneSet.has('custom-' + p.id);
      }
      return p.taskCode && !doneSet.has(p.taskCode);
    });
  }

  function getCurrentPlacement() {
    return getActiveRoutePlacements()[0] || null;
  }

  function getNextPlacement() {
    return getActiveRoutePlacements()[1] || null;
  }

  function setRouteFocusMeta(tierEl, pointsEl, task) {
    if (!tierEl || !pointsEl) return;
    if (!task) {
      tierEl.textContent = '';
      tierEl.className = 'route-focus-tier task-tier';
      pointsEl.textContent = '';
      return;
    }
    tierEl.textContent = task.tier || '';
    tierEl.className = 'route-focus-tier task-tier' + (task.tier ? ' ' + task.tier.toLowerCase() : '');
    const pts = taskPoints(task);
    pointsEl.textContent = pts === '—' ? '' : pts + ' pts';
  }

  function formatFocusTaskLabel(placement) {
    if (!placement) return { code: '—', text: '', task: null };
    const task = taskByCode(placement.taskCode);
    const routeIndex = state.placements.findIndex(p => p.id === placement.id);
    const order = routeIndex >= 0 ? '#' + (routeIndex + 1) + ' · ' : '';
    if (!task) return { code: order + (placement.taskCode || 'Task'), text: '', task: null };
    return { code: order + task.code, text: task.text, task };
  }

  function updateRouteFocusPanel() {
    if (!routeFocusPanel) return;
    const current = getCurrentPlacement();
    const next = getNextPlacement();
    const hasRoute = state.placements.some(p => p.customMarker || p.taskCode);

    if (!hasRoute) {
      routeFocusPanel.style.display = 'none';
      return;
    }

    routeFocusPanel.style.display = 'block';

    if (current) {
      const currentLabel = formatFocusTaskLabel(current);
      routeFocusCurrent.hidden = false;
      routeFocusCurrentCode.textContent = currentLabel.code;
      setRouteFocusMeta(routeFocusCurrentTier, routeFocusCurrentPoints, currentLabel.task);
      routeFocusCurrentText.textContent = currentLabel.text;
      routeFocusEmpty.hidden = true;
      
      // Setup done button for current task
      if (routeFocusCurrentDoneBtn) {
        let isDone = false;
        if (current.customMarker) {
          isDone = doneSet.has('custom-' + current.id);
        } else if (currentLabel.task) {
          isDone = doneSet.has(currentLabel.task.code);
        }
        routeFocusCurrentDoneBtn.textContent = isDone ? 'Mark as not done' : 'Mark as done';
        routeFocusCurrentDoneBtn.style.display = 'block';
      }
    } else {
      routeFocusCurrent.hidden = true;
      routeFocusEmpty.hidden = false;
    }

    if (next) {
      const nextLabel = formatFocusTaskLabel(next);
      routeFocusNext.hidden = false;
      routeFocusNextCode.textContent = nextLabel.code;
      setRouteFocusMeta(routeFocusNextTier, routeFocusNextPoints, nextLabel.task);
      routeFocusNextText.textContent = nextLabel.text;
    } else {
      routeFocusNext.hidden = true;
    }
  }

  routeFocusCurrent.onclick = () => {
    const current = getCurrentPlacement();
    if (current) focusPlacedTask(current);
  };
  routeFocusNext.onclick = () => {
    const next = getNextPlacement();
    if (next) focusPlacedTask(next);
  };
  
  routeFocusCurrentDoneBtn.onclick = (e) => {
    e.stopPropagation();
    const current = getCurrentPlacement();
    if (current) {
      if (current.taskCode) {
        const task = taskByCode(current.taskCode);
        if (task) {
          if (doneSet.has(task.code)) {
            doneSet.delete(task.code);
          } else {
            doneSet.add(task.code);
          }
        }
      } else if (current.customMarker) {
        if (doneSet.has('custom-' + current.id)) {
          doneSet.delete('custom-' + current.id);
        } else {
          doneSet.add('custom-' + current.id);
        }
      }
      saveDoneCookie();
      renderTasks();
      renderRouteList();
      renderPinsOnly();
      updateRouteFocusPanel();
    }
  };

  function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    // compute extra buffer based on borders to avoid clipped content
    const cs = window.getComputedStyle(el);
    const borderTop = parseInt(cs.borderTopWidth || '0', 10) || 0;
    const borderBottom = parseInt(cs.borderBottomWidth || '0', 10) || 0;
    const paddingTop = parseInt(cs.paddingTop || '0', 10) || 0;
    const paddingBottom = parseInt(cs.paddingBottom || '0', 10) || 0;
    const extra = Math.max(8, borderTop + borderBottom + Math.round((paddingTop + paddingBottom) / 4));
    el.style.height = (el.scrollHeight + extra) + 'px';
  }

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
        state.showCompleted = typeof state.showCompleted === 'boolean' ? state.showCompleted : true;
        state.hidePlacedTasks = typeof state.hidePlacedTasks === 'boolean' ? state.hidePlacedTasks : false;
        state.activeTab = state.activeTab === 'map' ? 'map' : 'tasks';
        nextId = state.placements.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1;
        hadSaved = true;
      }
    } catch (e) {}
    if (!hadSaved) {
      state.imageDataUrl = DEFAULT_MAP;
      state.placements = [];
      state.selectedRegions = null; // initialized after REGION_CODES is declared
    }
    if (showCompletedCheck) showCompletedCheck.checked = state.showCompleted;
    if (hidePlacedCheck) hidePlacedCheck.checked = state.hidePlacedTasks;
    if (state.activeTab === 'map') tabBtnMap.click(); else tabBtnTasks.click();
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
    if (!placement) return;
    openInfoPlacementId = placement.id;
    const task = taskByCode(placement.taskCode);
    const isCustom = !!placement.customMarker;
    const routeIndex = state.placements.findIndex(p => p.id === placement.id);
    taskInfoListNumber.textContent = routeIndex >= 0 ? String(routeIndex + 1) : '—';

    if (placement.customMarker) {
      taskInfoTitle.textContent = 'Custom marker';
      taskInfoRegion.textContent = '—';
      taskInfoTier.textContent = 'Custom';
      taskInfoTier.className = 'task-tier custom';
      taskInfoPoints.textContent = '—';
    } else if (task) {
      taskInfoTitle.textContent = '[' + task.code + '] ' + task.text;
      taskInfoRegion.textContent = task.region || 'Unknown';
      taskInfoTier.textContent = task.tier;
      taskInfoTier.className = 'task-tier ' + (task.tier ? task.tier.toLowerCase() : '');
      taskInfoPoints.textContent = taskPoints(task);
    } else {
      taskInfoTitle.textContent = 'Marker';
      taskInfoRegion.textContent = '—';
      taskInfoTier.textContent = 'Custom';
      taskInfoTier.className = 'task-tier custom';
      taskInfoPoints.textContent = '—';
    }

    taskInfoNote.value = placement.note || '';
    taskInfoNote.readOnly = !!openInfoReadOnly;
    
    // Setup done button
    if (taskInfoDoneBtn) {
      let isDone = false;
      if (isCustom) {
        isDone = doneSet.has('custom-' + placement.id);
      } else if (task) {
        isDone = doneSet.has(task.code);
      }
      taskInfoDoneBtn.textContent = isDone ? 'Mark as not done' : 'Mark as done';
      taskInfoDoneBtn.style.display = 'block';
      taskInfoDoneBtn.onclick = () => {
        if (isCustom) {
          if (doneSet.has('custom-' + placement.id)) {
            doneSet.delete('custom-' + placement.id);
          } else {
            doneSet.add('custom-' + placement.id);
          }
        } else if (task) {
          if (doneSet.has(task.code)) {
            doneSet.delete(task.code);
          } else {
            doneSet.add(task.code);
          }
        }
        saveDoneCookie();
        renderTasks();
        renderRouteList();
        updateRouteFocusPanel();
        renderPinsOnly();
        // Update button text
        let newIsDone = false;
        if (isCustom) {
          newIsDone = doneSet.has('custom-' + placement.id);
        } else if (task) {
          newIsDone = doneSet.has(task.code);
        }
        taskInfoDoneBtn.textContent = newIsDone ? 'Mark as not done' : 'Mark as done';
      };
    }
    
    const removeBtn = document.getElementById('taskInfoRemoveBtn');
    if (removeBtn) {
      removeBtn.onclick = () => {
        state.placements = state.placements.filter(p => p.id !== placement.id);
        renderTasks();
        render();
        saveState();
        closeTaskInfo();
      };
    }
    requestAnimationFrame(() => autoResizeTextarea(taskInfoNote));
    taskInfoPopup.classList.add('open');
    renderRouteList();
    setStatus('Viewing task details: ' + (task ? task.code : 'marker') + '.');
  }

  taskInfoClose.onclick = (e) => {
    e.stopPropagation();
    closeTaskInfo();
  };
  taskInfoNote.addEventListener('input', () => {
    if (openInfoPlacementId === null) return;
    const placement = state.placements.find(p => p.id === openInfoPlacementId);
    if (openInfoReadOnly) return;
    if (!placement) return;
    placement.note = taskInfoNote.value;
    const noteEl = document.querySelector('.route-note[data-placement-id="' + placement.id + '"]');
    if (placement.note.trim()) {
      if (noteEl) {
        noteEl.textContent = placement.note;
      } else {
        const row = document.querySelector('li[data-placement-id="' + placement.id + '"] .route-body');
        if (row) {
          const note = document.createElement('div');
          note.className = 'route-note';
          note.dataset.placementId = placement.id;
          note.textContent = placement.note;
          note.title = 'Click to open editor';
          note.addEventListener('click', (e) => {
            e.stopPropagation();
            openInfoReadOnly = false;
            showTaskInfo(placement);
          });
          row.appendChild(note);
        }
      }
    } else if (noteEl) {
      noteEl.remove();
    }
    requestAnimationFrame(() => autoResizeTextarea(taskInfoNote));
    saveState();
  });

  function renderPinsOnly() {
    document.querySelectorAll('.pin').forEach(p => p.remove());
    const currentId = getCurrentPlacement()?.id ?? null;
    const ordered = currentId === null
      ? state.placements
      : [
          ...state.placements.filter(p => p.id !== currentId),
          ...state.placements.filter(p => p.id === currentId)
        ];
    ordered.forEach((placement) => {
      const index = state.placements.findIndex(p => p.id === placement.id);
      renderPin(placement, index);
    });
    renderRouteConnector();
  }

  function renderRouteConnector() {
    const existing = document.querySelector('.route-connector');
    if (existing) existing.remove();
    const current = getCurrentPlacement();
    const next = getNextPlacement();
    if (!current || !next) return;
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const line = document.createElement('div');
    line.className = 'route-connector';
    line.style.left = current.x + 'px';
    line.style.top = current.y-10 + 'px';
    line.style.width = length + 'px';
    line.style.transform = 'rotate(' + angle + 'deg)';
    mapWrapper.insertBefore(line, mapImage.nextSibling);
  }

  function render() {
    if (state.imageDataUrl) {
      mapImage.src = state.imageDataUrl;
      mapWrapper.style.display = 'inline-block';
      placeholder.style.display = 'none';
      zoomControls.style.display = 'flex';
      if (routeFocusPanel) routeFocusPanel.style.display = 'block';
    } else {
      mapWrapper.style.display = 'none';
      placeholder.style.display = 'block';
      zoomControls.style.display = 'none';
      if (routeFocusPanel) routeFocusPanel.style.display = 'none';
    }

    // CSS zoom scales both the image and its absolutely-positioned pins while
    // also expanding the scrollable layout, unlike transform: scale().
    mapWrapper.style.zoom = state.zoom;

    renderPinsOnly();

    renderRouteList();
    if (openInfoPlacementId !== null) {
      const openPlacement = state.placements.find(p => p.id === openInfoPlacementId);
      if (openPlacement) { openInfoReadOnly = false; showTaskInfo(openPlacement); } else closeTaskInfo();
    }
  }

  function renderPin(placement, index) {
    const task = taskByCode(placement.taskCode);
    const pin = document.createElement('div');
    let isDone = false;
    if (placement.customMarker) {
      isDone = doneSet.has('custom-' + placement.id);
    } else if (placement.taskCode) {
      isDone = doneSet.has(placement.taskCode);
    }
    const currentPlacement = getCurrentPlacement();
    const nextPlacement = getNextPlacement();
    const isCurrent = currentPlacement && currentPlacement.id === placement.id;
    const isNext = !isCurrent && nextPlacement && nextPlacement.id === placement.id;
    const isCustom = !!placement.customMarker;
    pin.className = 'pin' + (isDone ? ' done' : '') + (isCurrent ? ' current' : '') + (isNext ? ' next' : '') + (isCustom ? ' custom-marker' : '');
    pin.dataset.id = placement.id;
    // Route-order-based stacking: tasks earlier in the route sit above
    // tasks done later, so upcoming pins are never buried under future ones.
    // Done pins are pinned to the lowest layer via the .pin.done CSS rule.
    pin.style.setProperty('--order-z', String(100 + (state.placements.length - index)));
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
    label.textContent = isCustom ? '' : (task ? task.code : '#' + (index + 1));
    pin.appendChild(label);

    const openDetails = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.pin.selected').forEach(p => p.classList.remove('selected'));
      pin.classList.add('selected');
      // Always allow editing when the top-left info pane is opened via marker click.
      openInfoReadOnly = false;
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
      // Open the task info popup in editable mode for quick note editing
      openInfoReadOnly = false;
      showTaskInfo(placement);
    });

    mapWrapper.appendChild(pin);
  }

  function renderRouteList() {
    routeList.innerHTML = '';
    routeCount.textContent = state.placements.length;
    const completedRouteTasks = state.placements.filter(p => {
      if (p.customMarker) return doneSet.has('custom-' + p.id);
      return p.taskCode && doneSet.has(p.taskCode);
    }).length;
    routeProgress.textContent = state.placements.length > 0 ? completedRouteTasks + ' / ' + state.placements.length + ' complete' : '';
    // compute points summary
    let totalPoints = 0, completedPoints = 0;
    state.placements.forEach(p => {
      const t = taskByCode(p.taskCode);
      const pts = Number(taskPoints(t)) || 0;
      totalPoints += pts;
      if (p.taskCode && doneSet.has(p.taskCode)) completedPoints += pts;
    });
    routeProgress.textContent = state.placements.length > 0 ?
      (completedRouteTasks + ' / ' + state.placements.length + ' complete • ' + completedPoints + ' / ' + totalPoints + ' pts') : '';
    const currentPlacement = getCurrentPlacement();
    const selectedPlacementId = openInfoPlacementId;

    if (state.placements.length === 0) {
      emptyRouteMsg.style.display = 'block';
      updateRouteFocusPanel();
      return;
    }
    emptyRouteMsg.style.display = 'none';

    state.placements.forEach((placement, index) => {
      const task = taskByCode(placement.taskCode);
      let isDone = false;
      if (placement.customMarker) {
        isDone = doneSet.has('custom-' + placement.id);
      } else if (task) {
        isDone = doneSet.has(task.code);
      }
      const isCustom = !!placement.customMarker;
      const li = document.createElement('li');
      li.className = 'route-item' + (isDone ? ' done' : '');
      if (currentPlacement && currentPlacement.id === placement.id) li.classList.add('current-route');
      if (selectedPlacementId === placement.id) li.classList.add('route-item-selected');

      const numCol = document.createElement('div');
      numCol.className = 'route-num-col';

      const orderNum = document.createElement('span');
      orderNum.className = 'route-order';
      orderNum.textContent = '#' + (index + 1);
      numCol.appendChild(orderNum);

      const num = document.createElement('span');
      num.className = 'route-num';
      num.textContent = isCustom ? '' : (task ? task.code : '?');
      if (isCustom) num.classList.add('route-num-custom');
      numCol.appendChild(num);

      li.appendChild(numCol);

      li.addEventListener('click', (e) => {
        // don't treat clicks on controls as selection
        if (e.target.closest('button') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        focusPlacedTask(placement);
      });

      const body = document.createElement('div');
      body.className = 'route-body';
      li.dataset.placementId = placement.id;

      const titleRow = document.createElement('div');
      titleRow.className = 'route-title-row';

      const done = document.createElement('input');
      done.type = 'checkbox';
      done.className = 'route-done';
      let doneChecked = false;
      if (placement.customMarker) {
        doneChecked = doneSet.has('custom-' + placement.id);
      } else if (task) {
        doneChecked = doneSet.has(task.code);
      }
      done.checked = doneChecked;
      done.title = 'Mark task complete';
      done.setAttribute('aria-hidden', 'true');
      done.style.position = 'absolute';
      done.style.opacity = '0';
      done.style.pointerEvents = 'none';
      done.onchange = () => {
        if (placement.customMarker) {
          if (done.checked) doneSet.add('custom-' + placement.id); else doneSet.delete('custom-' + placement.id);
        } else if (task) {
          if (done.checked) doneSet.add(task.code); else doneSet.delete(task.code);
        }
        saveDoneCookie();
        renderTasks();
        renderRouteList();
        renderPinsOnly();
      };

      const title = document.createElement('div');
      let titleDone = false;
      if (placement.customMarker) {
        titleDone = doneSet.has('custom-' + placement.id);
      } else if (task) {
        titleDone = doneSet.has(task.code);
      }
      title.className = 'route-title' + (titleDone ? ' done' : '');
      title.textContent = isCustom ? 'Custom marker' : (task ? task.text : '(unknown task)');
      title.title = isCustom ? 'Custom marker' : (task ? task.text : '');
      title.addEventListener('click', (e) => {
        e.stopPropagation();
        done.checked = !done.checked;
        done.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const points = document.createElement('div');
      points.className = 'route-points' + (task ? ' task-tier ' + task.tier.toLowerCase() : (isCustom ? ' task-tier custom' : ''));
      points.textContent = task ? taskPoints(task) + ' pts' : '0 pts';

      titleRow.append(done, title, points);
      body.appendChild(titleRow);

      if (placement.note && String(placement.note).trim() !== '') {
        const note = document.createElement('div');
        note.className = 'route-note';
        note.dataset.placementId = placement.id;
        note.textContent = placement.note || '';
        note.title = 'Click to open editor';
        note.addEventListener('click', (e) => {
          e.stopPropagation();
          openInfoReadOnly = false;
          showTaskInfo(placement);
        });
        body.appendChild(note);
      }
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
        renderTasks();
        render();
        saveState();
      };

      actions.append(remove);
      // actions.append(up, down, center, remove);
      li.appendChild(actions);
      routeList.appendChild(li);
    });
    // route-list notes are simple spans; no resizing required here
    initRouteListSorting();
    updateRouteFocusPanel();
  }

  function initRouteListSorting() {
    if (!window.Sortable) return;
    if (routeSorter) routeSorter.destroy();
    routeSorter = Sortable.create(routeList, {
      animation: 150,
      ghostClass: 'route-item-ghost',
      onEnd: (evt) => {
        if (evt.oldIndex === evt.newIndex || evt.oldIndex == null || evt.newIndex == null) return;
        const dragged = state.placements[evt.oldIndex];
        if (!dragged) return;
        reorderPlacement(dragged.id, evt.newIndex);
      }
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
    if (fromIndex === -1 || targetIndex < 0 || targetIndex > state.placements.length) return false;
    if (fromIndex === targetIndex) return false;
    const [moved] = state.placements.splice(fromIndex, 1);
    const insertIndex = targetIndex > state.placements.length ? state.placements.length : targetIndex;
    state.placements.splice(insertIndex, 0, moved);
    render();
    saveState();
    return true;
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
      const routeLi = routeList.querySelector('li[data-placement-id="' + placement.id + '"]');
      if (routeLi) routeLi.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      // If this placement is already open in the info pane, avoid
      // calling showTaskInfo again — that triggers a full route-list
      // re-render and textarea auto-resize which causes a visual jitter.
      if (openInfoPlacementId === placement.id) {
        // ensure info pane is visible but don't re-render route list
        taskInfoPopup.classList.add('open');
        openInfoReadOnly = false;
      } else {
        openInfoReadOnly = false;
        showTaskInfo(placement);
      }
    });
  }

  function beginPlaceTask(taskCode) {
    if (state.placements.some(p => p.taskCode === taskCode)) {
      setStatus('That task is already on your route.');
      return;
    }
    placingTaskCode = taskCode;
    placingCustomMarker = false;
    tabBtnMap.click();
    mapWrapper.classList.add('placing');
    const task = taskByCode(taskCode);
    setStatus('Click the map to place: ' + (task ? task.text : taskCode));
    // create a preview pin that follows the cursor while placing
    try {
      if (dragPreviewPin) dragPreviewPin.remove();
      const preview = document.createElement('div');
      preview.className = 'pin drag-preview';
      const pdot = document.createElement('div'); pdot.className = 'pin-dot'; preview.appendChild(pdot);
      const plabel = document.createElement('div'); plabel.className = 'pin-label'; plabel.textContent = task ? task.code : taskCode; preview.appendChild(plabel);
      mapWrapper.appendChild(preview);
      dragPreviewPin = preview;
    } catch (err) { dragPreviewPin = null; }
  }

  function beginCustomMarkerPlacement() {
    placingTaskCode = null;
    placingCustomMarker = true;
    tabBtnMap.click();
    mapWrapper.classList.add('placing');
    setStatus('Click the map to place a custom marker. Press Escape to cancel.');
    try {
      if (dragPreviewPin) dragPreviewPin.remove();
      const preview = document.createElement('div');
      preview.className = 'pin drag-preview custom-marker';
      const pdot = document.createElement('div'); pdot.className = 'pin-dot'; preview.appendChild(pdot);
      const plabel = document.createElement('div'); plabel.className = 'pin-label'; preview.appendChild(plabel);
      mapWrapper.appendChild(preview);
      dragPreviewPin = preview;
    } catch (err) { dragPreviewPin = null; }
  }

  function cancelPlacementMode() {
    placingTaskCode = null;
    placingCustomMarker = false;
    mapWrapper.classList.remove('placing');
    if (dragPreviewPin) { dragPreviewPin.remove(); dragPreviewPin = null; }
    hideMapContextMenu();
  }

  function hideMapContextMenu() {
    if (mapContextMenu) {
      mapContextMenu.hidden = true;
      mapContextMenu.innerHTML = '';
    }
  }

  function showMapContextMenu(x, y) {
    if (!mapContextMenu) return;
    mapContextMenu.innerHTML = '';
    const button = document.createElement('button');
    button.textContent = 'Create marker';
    button.onclick = () => {
      hideMapContextMenu();
      const rect = mapImage.getBoundingClientRect();
      const px = (x - rect.left) / state.zoom;
      const py = (y - rect.top) / state.zoom;
      state.placements.push({
        id: nextId++,
        taskCode: null,
        customMarker: true,
        x: Math.round(px),
        y: Math.round(py),
        note: ''
      });
      render();
      renderTasks();
      saveState();
      setStatus('Custom marker placed.');
    };
    mapContextMenu.appendChild(button);
    mapContextMenu.style.left = x + 'px';
    mapContextMenu.style.top = y + 'px';
    mapContextMenu.hidden = false;
  }

  const PAN_THRESHOLD = 6;

  addCustomMarkerBtn.onclick = () => {
    cancelPlacementMode();
    beginCustomMarkerPlacement();
  };

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

  mapWrapper.addEventListener('contextmenu', (e) => {
    if (dragTarget !== null || placingTaskCode !== null || placingCustomMarker) return;
    e.preventDefault();
    showMapContextMenu(e.clientX, e.clientY);
  });

  mapWrapper.addEventListener('click', (e) => {
    if (dragTarget !== null) return;
    hideMapContextMenu();
    if (placingTaskCode === null && !placingCustomMarker) {
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

    if (placingCustomMarker) {
      placingCustomMarker = false;
      mapWrapper.classList.remove('placing');
      state.placements.push({
        id: nextId++,
        taskCode: null,
        customMarker: true,
        x: Math.round(x),
        y: Math.round(y),
        note: ''
      });
      render();
      renderTasks();
      saveState();
      setStatus('Custom marker placed.');
      if (dragPreviewPin) { dragPreviewPin.remove(); dragPreviewPin = null; }
      return;
    }

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
    renderTasks();
    saveState();
    setStatus('Task placed. Use the route list to reorder it or add notes.');
    if (dragPreviewPin) { dragPreviewPin.remove(); dragPreviewPin = null; }
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
    renderTasks();
    saveState();
    setStatus('Task added to the route.');
    if (dragPreviewPin) { dragPreviewPin.remove(); dragPreviewPin = null; }
    draggingTaskCode = null;
  });

  // Move drag clone with the mouse so user sees the element following cursor
  document.addEventListener('dragover', (e) => {
    // position the preview pin over the map while dragging from task list
    if (dragPreviewPin) {
      const rect = mapImage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / state.zoom;
      const y = (e.clientY - rect.top) / state.zoom;
      dragPreviewPin.style.left = Math.round(x) + 'px';
      dragPreviewPin.style.top = Math.round(y + (10 / state.zoom)) + 'px';
      // keep preview scaled to current zoom
      dragPreviewPin.style.transform = 'translate(-50%, -100%) scale(' + (1 / state.zoom) + ')';
    }
  });

  document.addEventListener('mousemove', (e) => {
    // update preview pin position while in placing mode
    if ((placingTaskCode || placingCustomMarker) && dragPreviewPin) {
      const rect = mapImage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / state.zoom;
      const y = (e.clientY - rect.top) / state.zoom;
      dragPreviewPin.style.left = Math.round(x) + 'px';
      dragPreviewPin.style.top = Math.round(y + (10 / state.zoom)) + 'px';
      dragPreviewPin.style.transform = 'translate(-50%, -100%) scale(' + (1 / state.zoom) + ')';
    }
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
    renderRouteConnector();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (placingTaskCode !== null || placingCustomMarker || mapContextMenu && !mapContextMenu.hidden)) {
      e.preventDefault();
      cancelPlacementMode();
      hideMapContextMenu();
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
    // ensure any dangling preview is removed when mouse released
    if (dragPreviewPin) { dragPreviewPin.remove(); dragPreviewPin = null; }
    draggingTaskCode = null;
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
    state.activeTab = 'tasks';
    saveState();
  };
  tabBtnMap.onclick = () => {
    tabBtnMap.classList.add('active'); tabBtnTasks.classList.remove('active');
    tabPanelMap.classList.add('active'); tabPanelTasks.classList.remove('active');
    state.activeTab = 'map';
    saveState();
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
  const taskSearch = document.getElementById('taskSearch');
  const taskListEl = document.getElementById('taskList');
  const taskProgress = document.getElementById('taskProgress');
  const showCompletedCheck = document.getElementById('showCompletedCheck');
  const hidePlacedCheck = document.getElementById('hidePlacedCheck');

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
    const searchQuery = taskSearch.value.trim().toLowerCase();
    taskListEl.innerHTML = '';
    const currentPlacement = getCurrentPlacement();

    let doneCount = 0;
    let totalCount = 0;
    TASKS.forEach(task => {
      if (!selected.has(task.code.replace(/\d+$/, ''))) return;
      if (tier !== '__all__' && task.tier !== tier) return;
      if (searchQuery) {
        const text = (task.code + ' ' + task.text).toLowerCase();
        if (!text.includes(searchQuery)) return;
      }
      const isDone = doneSet.has(task.code);
      if (isDone) doneCount++;
      if (isDone && !state.showCompleted) return;
      const placement = state.placements.find(p => p.taskCode === task.code);
      const isPlaced = !!placement;
      if (isPlaced && state.hidePlacedTasks) return;
      totalCount++;

      const li = document.createElement('li');
      if (isDone) li.classList.add('done');
      if (currentPlacement && currentPlacement.taskCode === task.code) li.classList.add('current-route-task');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isDone;
      cb.title = 'Mark task complete';
      cb.setAttribute('aria-hidden', 'true');
      cb.style.position = 'absolute';
      cb.style.opacity = '0';
      cb.style.pointerEvents = 'none';

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

      li.draggable = true;
      li.addEventListener('dragstart', (e) => {
        if (!task.code) return;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', task.code);
        li.classList.add('dragging');
        // prepare live preview pin for map-drop
        draggingTaskCode = task.code;
        try {
          if (dragPreviewPin) dragPreviewPin.remove();
          const preview = document.createElement('div');
          preview.className = 'pin drag-preview';
          preview.style.left = '0px'; preview.style.top = '0px';
          preview.style.transform = 'translate(-50%, -100%) scale(' + (1 / state.zoom) + ')';
          const pdot = document.createElement('div'); pdot.className = 'pin-dot'; preview.appendChild(pdot);
          const plabel = document.createElement('div'); plabel.className = 'pin-label'; plabel.textContent = task.code; preview.appendChild(plabel);
          mapWrapper.appendChild(preview);
          dragPreviewPin = preview;
          // hide the browser's default drag image
          try {
            const img = new Image();
            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
            e.dataTransfer.setDragImage(img, 0, 0);
          } catch (err) {}
        } catch (err) { dragPreviewPin = null; }
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        if (dragPreviewPin) { dragPreviewPin.remove(); dragPreviewPin = null; }
        draggingTaskCode = null;
      });

      if (isPlaced) li.classList.add('task-placed');

      const difficultyRow = document.createElement('div');
      difficultyRow.className = 'task-difficulty-row';
      const tierSpan = document.createElement('span');
      tierSpan.className = 'task-tier ' + task.tier.toLowerCase();
      tierSpan.textContent = task.tier;
      difficultyRow.appendChild(tierSpan);

      const placeBtn = document.createElement('button');
      placeBtn.className = 'place-task-btn';
      placeBtn.textContent = placement ? 'Focus' : 'Place';
      placeBtn.title = placement ? 'Open this task in Route' : 'Place this task on the map';
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

      li.append(cb, codeSpan, textSpan, difficultyRow, placeBtn);
      taskListEl.appendChild(li);
    });
    taskProgress.textContent = 'Completed: ' + doneCount + ' • Showing: ' + totalCount;
  }

  tierFilter.onchange = renderTasks;
  taskSearch.addEventListener('input', renderTasks);
  showCompletedCheck.onchange = () => {
    state.showCompleted = showCompletedCheck.checked;
    renderTasks();
    saveState();
  };
  hidePlacedCheck.onchange = () => {
    state.hidePlacedTasks = hidePlacedCheck.checked;
    renderTasks();
    saveState();
  };


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
      renderPinsOnly();
    });
  };

  loadTaskCookies();
  if (!Array.isArray(state.selectedRegions)) {
    state.selectedRegions = REGION_CODES.map(([code]) => code);
  }
  renderRegionFilters();
  renderTasks();
  loadState();