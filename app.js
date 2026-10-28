"use strict";

(() => {
  const STORAGE_KEY = "simpledo.tasks.v1";
  const DEMO_KEY = "simpledo.demoRemoved.v1";
  const FOCUS_KEY = "simpledo.focusSession.v1";
  const DEFAULT_TAB_TITLE = document.title;
  const $ = (id) => document.getElementById(id);
  const els = {
    inboxTasks: $("inboxTasks"),
    importTasksButton: $("importTasksButton"),
    importTasksFile: $("importTasksFile"),
    daysRoot: $("daysRoot"),
    inboxCount: $("inboxCount"),
    sidebarInboxCount: $("sidebarInboxCount"),
    taskDialog: $("taskDialog"),
    taskEditorFocusRow: $("taskEditorFocusRow"),
    startTaskFromEditor: $("startTaskFromEditor"),
    focusDialog: $("focusDialog"),
    focusHeading: $("focusHeading"),
    focusTaskLabel: $("focusTaskLabel"),
    focusSetup: $("focusSetup"),
    focusSessionView: $("focusSessionView"),
    focusDurationSelect: $("focusDurationSelect"),
    focusCustomWrap: $("focusCustomWrap"),
    focusCustomMinutes: $("focusCustomMinutes"),
    focusCountdown: $("focusCountdown"),
    focusPhase: $("focusPhase"),
    focusProgressTrack: $("focusProgressTrack"),
    focusProgressFill: $("focusProgressFill"),
    focusSessionHint: $("focusSessionHint"),
    focusStopButton: $("focusStopButton"),
    focusPauseButton: $("focusPauseButton"),
    focusCompleteButton: $("focusCompleteButton"),
    focusFinishActions: $("focusFinishActions"),
    focusBreakButton: $("focusBreakButton"),
    globalFocusButton: $("globalFocusButton"),
    globalFocusTime: $("globalFocusTime"),
    taskForm: $("taskForm"),
    taskTitle: $("taskTitle"),
    taskNotes: $("taskNotes"),
    taskDate: $("taskDate"),
    customDateWrap: $("customDateWrap"),
    customDateInput: $("customDateInput"),
    taskMain: $("taskMain"),
    deleteTaskButton: $("deleteTaskButton"),
    demoBanner: $("demoBanner"),
    searchInput: $("searchInput"),
    moreDaysButton: $("moreDaysButton"),
  };

  const formatKey = (date) =>
    [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  const dateFromKey = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const dateAtOffset = (offset) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d;
  };
  const dateKeyAtOffset = (offset) => formatKey(dateAtOffset(offset));
  const todayKey = () => formatKey(new Date());
  const tomorrowKey = () => dateKeyAtOffset(1);
  const makeId = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "task-" + Date.now() + "-" + Math.random().toString(36).slice(2);

  let tasks = [];
  let activeView = "planner";
  let daysVisible = 30;
  const expandedDays = new Map(); // Explicit collapse/expand choices for this session
  let renderedToday = null;
  let lastObservedDay = todayKey();
  let query = "";
  // Inbox-only discovery filters stay separate from the all-task header search and tag filter.
  let inboxQuery = "";
  let inboxTag = "";
  let editingId = null;
  let editingSnapshot = null;
  let dialogOpener = null;
  let draggedId = null;
  let toastTimeout = null;
  let focusSession = null;
  let focusTargetTaskId = null;
  let focusOpener = null;

  function demoTasks() {
    const today = todayKey();
    const tomorrow = tomorrowKey();
    const afterTomorrow = dateKeyAtOffset(2);
    return [
      { title: "Write down three things to focus on this week", date: null },
      { title: "Explore your ideas for the weekend", date: null },
      { title: "Review today's priorities", date: today, main: true },
      { title: "Go for a walk and clear your head", date: today },
      { title: "Plan the next project milestone", date: tomorrow },
      { title: "Make time to read", date: afterTomorrow }
    ].map((t) => ({
      id: makeId(),
      title: t.title,
      notes: "",
      date: t.date,
      completed: false,
      main: Boolean(t.main),
      rolled: false,
      demo: true,
      createdAt: new Date().toISOString()
    }));
  }

  const store = new SimpleDoData.Store(localStorage);
  let storageReady = false;
  let cloud = null;
  let planning = null;
  let tagCatalog = null;
  let tagUI = null;
  let returnToTaskAfterTags = false;
  let snapshot = null;
  let capture = null;
  let suggestedDate = null;
  let saveFailed = false;
  function load() {
    try {
      // A newly connected device starts empty so sample IDs cannot be uploaded
      // alongside the account's real tasks. Existing storage is always retained.
      tasks = store.load(localStorage.getItem(DEMO_KEY) === "true" || window.SIMPLEDO_CONFIG?.supabaseUrl ? [] : demoTasks());
      storageReady = true;
      rollover();
    } catch (error) {
      storageReady = false;
      tasks = [];
      $("workspace").inert = true;
      $("newTaskButton").disabled = true;
      $("exportBackup").disabled = true;
      $("importBackup").disabled = true;
      $("storageError").hidden = false;
      $("storageErrorText").textContent = error.message;
      notify("Storage could not be opened. Existing data has been preserved.");
    }
  }

  function persist() {
    if (!storageReady) {
      notify("Storage is unavailable. Download recovery data from Settings first.");
      return false;
    }
    try {
      tasks = store.commit(tasks);
      saveFailed = false;
      if (cloud) cloud.schedule();
      return true;
    } catch (error) {
      saveFailed = true;
      if (cloud) { cloud.allowed = false; cloud.generation++; }
      notify("Could not save. Export a backup now before closing this page.");
      $("syncStatus").textContent = "Save failed";
      return false;
    }
  }

  // Similar matches are suggestions, never automatic merges or deletions.
  // The dialog displays only flagged lines; definite duplicates are skipped.
  function reviewSimilar(assessment, onConfirm, onCancel = () => {}) {
    const dialog = $("similarTaskDialog"), list = $("similarTaskRows");
    const selected = new Set(), count = n => n + " task" + (n === 1 ? "" : "s");
    list.replaceChildren();
    const n = assessment.similar.length, fresh = assessment.add.length;
    $("similarTaskIntro").textContent =
      count(n) + " look similar to unfinished tasks. " +
      (fresh ? count(fresh) + " can be added without changes. " : "") +
      "Tick Add anyway only for tasks that really are different.";
    $("similarTaskExact").hidden = assessment.exact.length === 0;
    $("similarTaskExact").textContent = assessment.exact.length
      ? count(assessment.exact.length) + " already match exactly and will be skipped."
      : "";
    $("similarTaskError").textContent = "";
    $("similarTaskError").hidden = true;
    const confirmButton = $("similarTaskConfirm");
    function labelConfirm() {
      const adding = fresh + selected.size;
      confirmButton.textContent = adding
        ? "Add " + count(adding) + " (skip the rest)"
        : "Skip similar tasks";
    }
    for (const item of assessment.similar) {
      const label = document.createElement("label");
      label.className = "similar-review-item";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.setAttribute("aria-label", "Add anyway: " + item.row.title);
      check.onchange = () => {
        if (check.checked) selected.add(item.index); else selected.delete(item.index);
        labelConfirm();
      };
      const content = document.createElement("span"), title = document.createElement("strong");
      title.textContent = "Add anyway: " + item.row.title;
      const match = document.createElement("small");
      match.textContent = "Similar to " + (item.match.source === "existing" ? "existing task" : "another line in this list") +
        ': “' + item.match.title + '”';
      content.append(title, match);
      label.append(check, content);
      list.append(label);
    }
    labelConfirm();
    let finished = false;
    const close = () => { if (dialog.open) dialog.close(); };
    const cancel = () => { if (finished) return; finished = true; close(); onCancel(); };
    $("similarTaskCancel").onclick = cancel;
    $("similarTaskClose").onclick = cancel;
    dialog.oncancel = event => { event.preventDefault(); cancel(); };
    confirmButton.onclick = () => {
      if (finished) return;
      finished = true;
      close();
      onConfirm(new Set(selected));
    };
    dialog.showModal();
    (list.querySelector("input") || confirmButton).focus();
  }

  function additionMessage(added, assessment, chosen, source) {
    const dupes = assessment.exact.length;
    const skipped = assessment.similar.filter(item => !chosen?.has(item.index)).length;
    const noun = n => n + " task" + (n === 1 ? "" : "s");
    let message = added
      ? (source === "import" ? "Imported " : "Added ") + noun(added) + " to Inbox."
      : "No tasks added.";
    if (dupes) {
      const example = assessment.exact[0].match.title;
      message += " " + noun(dupes) + ' already exist and were skipped (e.g. “' + example + '”).';
      if (!added && !skipped) message += " No duplicates added.";
    }
    if (skipped) message += " " + noun(skipped) + " with similar names skipped.";
    if (tagUI?.filter && added) message += " Choose All tags to see every task.";
    return message;
  }

  // Returns null when a similarity-review choice is outstanding; otherwise a
  // result message. The caller keeps the draft until the write actually succeeds.
  function addIncoming(rows, tagId = "", onFinish = () => {}, approved = null, source = "inbox") {
    if (!storageReady || saveFailed)
      throw Error("Storage is unavailable. Your task list is still here. Resolve the save error in Settings first.");
    if (!Array.isArray(rows) || rows.length > 2000) throw Error("Add no more than 2,000 tasks at a time.");
    const selectedRows = rows.filter(row => row && row.selected !== false).map(row => ({
      title: typeof row.text === "string" ? row.text : row.title,
      notes: typeof row.notes === "string" ? row.notes : ""
    }));
    if (!selectedRows.length) throw Error("Select at least one task to add.");
    const tag = tagId ? tagCatalog?.resolve(tagId) : null;
    if (tagId && (!tag || tag.unavailable)) throw Error("This tag is no longer available. Choose another tag or No tag.");
    const assessment = SimpleDoCapture.assess(selectedRows, tasks);
    if (assessment.similar.length && approved === null) {
      reviewSimilar(assessment, chosen => {
        try {
          const result = addIncoming(rows, tagId, onFinish, chosen, source);
          if (result !== null) onFinish(result);
        } catch (error) {
          if ($("captureDialog").open) $("captureMessage").textContent = error.message;
          else notify(error.message);
        }
      });
      return null;
    }
    const permitted = [...assessment.add, ...assessment.similar.filter(item => approved?.has(item.index))]
      .sort((a, b) => a.index - b.index);
    if (!permitted.length) return additionMessage(0, assessment, approved, source);
    const before = tasks, beforeState = store.state, timestamp = Date.now();
    const additions = permitted.map((item, index) => ({
      id: makeId(), title: item.row.title, notes: item.row.notes || "", date: null,
      completed: false, main: false, rolled: false, demo: false,
      createdAt: new Date(timestamp + index).toISOString(),
      ...(tag ? {tagIds:[tag.id],capacityContext:tagCatalog.context({tagIds:[tag.id]})} : {})
    }));
    tasks = [...tasks, ...additions];
    if (!persist()) {
      tasks = before; store.state = beforeState; render();
      throw Error("Could not save. Your draft is still here; free device storage, then reload and retry.");
    }
    render();
    return additionMessage(additions.length, assessment, approved, source);
  }

  function captureTasks(rows, tagId) {
    return addIncoming(rows, tagId, message => {
      capture.close(true);
      notify(message);
    });
  }

  function rollover() {
    let changed = false;
    const today = todayKey();
    for (const task of tasks) {
      if (!task.completed && task.date && task.date < today) {
        task.date = null;
        delete task.dayOrder;
        task.rolled = true;
        changed = true;
      }
    }
    if (changed) persist();
  }

  function notify(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  function matching(list) {
    list = tagUI ? list.filter(t => tagUI.matches(t)) : list;
    if (!query) return list;
    return list.filter((task) => (task.title + " " + task.notes).toLocaleLowerCase().includes(query));
  }

  const sortTasks = list => SimpleDoDaily.ordered(list);

  function toggleTask(task, daily = false) {
    task.completed = !task.completed;
    if (task.completed) clearFocusForTask(task.id);
    const saved = persist();
    render();
    if (daily) {
      const row = [...$('todayView').querySelectorAll('[data-task-id]')].find(el=>el.dataset.taskId===task.id);
      const next = row && !row.closest('details:not([open])') ? row.querySelector('input,button') : null;
      (next || $('todayFeatured').querySelector('[data-focus-task-id]') || $('todayCompleted').querySelector('summary')).focus();
    }
    if (saved) notify(task.completed ? "Task completed." : "Task marked incomplete.");
  }

  function makeTaskCard(task, mode = "card") {
    const card = document.createElement("article");
    card.className = "task-card" + (task.completed ? " is-done" : "") + (task.main ? " main-task" : "");
    if (mode === "row") card.classList.add("today-task-row");
    if (mode === "featured") card.classList.add("today-feature");
    card.draggable = true;
    card.dataset.taskId = task.id;
    card.setAttribute("aria-label", task.title);
    card.addEventListener("dragstart", (event) => {
      draggedId = task.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", task.id);
      requestAnimationFrame(() => card.classList.add("dragging"));
    });
    card.addEventListener("dragend", () => {
      draggedId = null;
      card.classList.remove("dragging");
      document.querySelectorAll(".is-over").forEach((zone) => zone.classList.remove("is-over"));
    });

    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-check";
    check.textContent = task.completed ? "✓" : "";
    check.setAttribute("aria-label", task.completed ? "Mark " + task.title + " incomplete" : "Mark " + task.title + " complete");
    check.setAttribute("aria-pressed", String(task.completed));
    check.addEventListener("click", () => toggleTask(task, mode !== "card"));

    const body = document.createElement("button");
    body.type = "button";
    body.className = "task-body";
    body.setAttribute("aria-label", "Edit " + task.title);
    body.addEventListener("click", () => openTask(task.id));
    const title = document.createElement("span");
    title.className = "task-text";
    title.textContent = task.title;
    body.append(title);
    const meta = document.createElement("span");
    meta.className = "task-meta";
    const tagBadge = tagUI?.badge(task);
    if (tagBadge) meta.append(tagBadge);
    if (task.estimateMinutes) {
      const estimate = document.createElement("span"); estimate.className = "task-estimate";
      estimate.textContent = "~" + SimpleDoCapacity.duration(task.estimateMinutes); estimate.title = "Estimated total task time"; meta.append(estimate);
    }
    if (task.conflictOf) {
      const recovered = document.createElement("span");
      recovered.className = "rolled-tag"; recovered.textContent = "Recovered edit";
      meta.append(recovered);
    }
    if (task.main) {
      const label = document.createElement("span");
      label.className = "main-tag";
      label.textContent = "✳ Main Thing";
      meta.append(label);
    }
    if (task.rolled) {
      const label = document.createElement("span");
      label.className = "rolled-tag";
      label.textContent = "↶ Returned to Inbox";
      meta.append(label);
    }
    if (task.notes) {
      const label = document.createElement("span");
      label.textContent = "≡ Has notes";
      meta.append(label);
    }
    if (meta.childNodes.length) body.append(meta);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "task-edit";
    edit.textContent = "···";
    edit.setAttribute("aria-label", "Edit " + task.title);
    edit.addEventListener("click", () => openTask(task.id));

    if (!task.completed) {
      const focusButton = document.createElement("button");
      focusButton.type = "button";
      focusButton.className = "task-focus-button";
      focusButton.dataset.focusTaskId = task.id;
      focusButton.addEventListener("click", () => openFocus(task.id));
      const current = focusSession && focusSession.taskId === task.id;
      focusButton.textContent = current ? focusButtonText() : mode === "card" ? "▶ Start" : "Start focus";
      focusButton.classList.toggle("is-timing", Boolean(current));
      focusButton.setAttribute("aria-label", current ? "Return to timer for " + task.title : (mode === "card" ? "Start task: " : "Start focus for ") + task.title);
      if (mode === "featured") {
        const label = document.createElement('h2'); label.className='today-feature-label'; label.textContent=task.main?'The Main Thing':'Up next';
        check.className='button button-outline today-done'; check.textContent='✓ Done';
        focusButton.classList.add('button','button-dark');
        const actions=document.createElement('div'); actions.className='today-feature-actions'; actions.append(focusButton,check);
        card.append(label,body,actions);
      } else card.append(check, body, focusButton, edit);
    } else {
      card.append(check, body, edit);
    }
    if (mode === 'row') {
      const label=document.createElement('label');label.className='today-check';
      const input=document.createElement('input');input.type='checkbox';input.checked=task.completed;
      input.setAttribute('aria-label',`Mark ${task.title} ${task.completed?'incomplete':'complete'}`);
      input.onchange=()=>toggleTask(task,true);label.append(input);check.replaceWith(label);
      edit.remove();
    }
    return card;
  }

  function renderToday() {
    const key=todayKey(),all=tasks.filter(t=>t.date===key),state=SimpleDoDaily.summarize(all,matching(all));
    $('todayView').classList.add('dropzone');$('todayView').dataset.date=key;
    if(renderedToday!==key){$('todayCompleted').open=false;renderedToday=key;}
    $('pageTitle').textContent=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long'}).format(dateFromKey(key));
    $('pageDescription').textContent=`${state.done} of ${state.total} completed · ${state.remaining} remaining`;
    $('pageDescription').setAttribute('aria-live','polite');
    $('todayProgress').max=state.total||1;$('todayProgress').value=state.done;
    $('todayProgress').setAttribute('aria-valuetext',`${state.done} of ${state.total} completed`);
    $('todayCapacity').replaceChildren();if(planning)$('todayCapacity').append(planning.indicator(key,all));
    $('todayFilterNote').hidden=!(query||tagUI?.filter);$('todayFilterNote').textContent=`Showing ${state.visible} of ${state.total} tasks. Progress includes all of today.`;
    $('todayFeatured').replaceChildren();
    if(state.featured)$('todayFeatured').append(makeTaskCard(state.featured,'featured'));
    else {
      const empty=document.createElement('div');empty.className='today-empty';
      const title=document.createElement('h2'),text=document.createElement('p');
      title.textContent=!state.total?'No tasks today':!state.remaining?'All tasks complete':'No matching tasks';
      text.textContent=!state.total?'Add a task for today.':!state.remaining?'All scheduled tasks are complete.':'Clear the filter to see other tasks.';
      empty.append(title,text);$('todayFeatured').append(empty);
    }
    $('todayAlsoSection').hidden=!state.others.length;$('todayAlsoCount').textContent=String(state.others.length);
    $('todayTasks').replaceChildren(...state.others.map(t=>makeTaskCard(t,'row')));
    $('todayCompleted').hidden=!state.completed.length;$('todayCompletedCount').textContent=`(${state.completed.length})`;
    // Completed rows are created only when opened, keeping the daily workspace light.
    const fillCompleted=()=>{$('todayCompletedTasks').replaceChildren(...state.completed.map(t=>makeTaskCard(t,'row')));};
    $('todayCompletedTasks').replaceChildren();if($('todayCompleted').open)fillCompleted();
    $('todayCompleted').ontoggle=()=>{if($('todayCompleted').open)fillCompleted();};
  }

  function refreshInboxTagOptions() {
    const select = $("inboxTagFilter");
    const options = [
      {id: "", name: "All tags"},
      {id: "__untagged__", name: "No tag"},
      ...(tagUI ? tagUI.tagsInUse() : []).map(tag => ({id: tag.id, name: tag.name}))
    ];
    // Keep the active native select intact while results re-render (including on each keystroke).
    const signature = JSON.stringify(options);
    if (select.dataset.optionsSignature !== signature) {
      select.replaceChildren();
      for (const entry of options) {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.name;
        select.append(option);
      }
      select.dataset.optionsSignature = signature;
    }
    if (!options.some(option => option.id === inboxTag)) inboxTag = "";
    select.value = inboxTag;
  }

  function renderInbox() {
    // Local Inbox filters do not affect dated tasks, calendar capacity, or global task counts.
    // Preserve the independent Inbox scroll position when tasks update.
    const previousScrollTop = els.inboxTasks.scrollTop;
    refreshInboxTagOptions();
    const source = tasks.filter(task => !task.date);
    const inbox = sortTasks(matching(source).filter(task => {
      const ids = SimpleDoTags.taskIds(task);
      const tagMatch = !inboxTag || (inboxTag === "__untagged__" ? ids.length === 0 : ids.includes(inboxTag));
      const text = (String(task.title || "") + " " + String(task.notes || "")).toLocaleLowerCase();
      return tagMatch && (!inboxQuery || text.includes(inboxQuery));
    }));
    const outstandingCount = source.filter(task => !task.completed).length;
    els.inboxCount.textContent = String(outstandingCount);
    els.sidebarInboxCount.textContent = String(outstandingCount);
    $("inboxFilterSummary").textContent = "Showing " + inbox.length + " of " + source.length + " tasks";
    $("clearInboxFilters").hidden = !inboxQuery && !inboxTag;
    els.inboxTasks.replaceChildren();
    if (inbox.length) {
      inbox.forEach(task => els.inboxTasks.append(makeTaskCard(task)));
    } else if (inboxQuery || inboxTag) {
      const empty = document.createElement("p");
      empty.className = "no-results";
      empty.textContent = "No Inbox tasks match these filters.";
      els.inboxTasks.append(empty);
    } else if (query || tagUI?.filter) {
      const empty = document.createElement("p");
      empty.className = "no-results";
      empty.textContent = tagUI?.filter ? "No Inbox tasks with this tag." : "No matching tasks in the Inbox.";
      els.inboxTasks.append(empty);
    } else {
      const empty = document.createElement("div");
      empty.className = "task-empty";
      const illustration = document.createElement("span");
      illustration.className = "task-empty-illustration";
      illustration.textContent = "✓";
      const heading = document.createElement("strong");
      heading.textContent = "Inbox is empty";
      const description = document.createElement("p");
      description.textContent = "Add a task above.";
      empty.append(illustration, heading, description);
      els.inboxTasks.append(empty);
    }
    if (els.inboxTasks.clientHeight > 0) {
      const maxScroll = Math.max(0, els.inboxTasks.scrollHeight - els.inboxTasks.clientHeight);
      els.inboxTasks.scrollTop = Math.min(previousScrollTop, maxScroll);
    }
  }

  function renderDays() {
    els.daysRoot.replaceChildren();
    const isOne=activeView==='one-task',visible=isOne?1:daysVisible,byDate=new Map();
    for(const task of tasks){if(!byDate.has(task.date))byDate.set(task.date,[]);byDate.get(task.date).push(task);}
    for(let offset=0;offset<visible;offset++) {
      const date=dateAtOffset(offset),key=formatKey(date),all=byDate.get(key)||[];
      const dayTasks=sortTasks(matching(isOne?all.filter(t=>!t.completed):all)),shown=isOne?dayTasks.slice(0,1):dayTasks;
      const finished=all.filter(t=>t.completed).length;
      const card=document.createElement('section');card.className='day-card dropzone'+(offset===0?' today':'');card.dataset.date=key;card.id='day-'+key;
      const header=document.createElement('div');header.className='day-header';
      const toggle=document.createElement(isOne?'div':'button');toggle.className='day-toggle';if(!isOne)toggle.type='button';
      const dateBox=document.createElement('span');dateBox.className='day-date';
      const number=document.createElement('span');number.className='day-number';number.textContent=String(date.getDate());
      const month=document.createElement('span');month.className='day-month';month.textContent=new Intl.DateTimeFormat('en-GB',{month:'short'}).format(date);dateBox.append(number,month);
      const info=document.createElement('span');info.className='day-info';
      const dayName=document.createElement('span');dayName.className='day-name';dayName.textContent=new Intl.DateTimeFormat('en-GB',{weekday:'long'}).format(date);
      if(offset===0){const tag=document.createElement('span');tag.className='today-label';tag.textContent='Today';dayName.append(tag);}
      const summary=document.createElement('span');summary.className='day-summary';
      summary.textContent=isOne?(all.some(t=>!t.completed)?all.filter(t=>!t.completed).length+' remaining today':'No unfinished tasks today'):!all.length?'No tasks scheduled':`${all.length} ${all.length===1?'task':'tasks'} · ${finished} completed`;
      info.append(dayName,summary);toggle.append(dateBox,info);
      const add=document.createElement('button');add.type='button';add.className='day-add';add.textContent='+';add.setAttribute('aria-label','Add task for '+new Intl.DateTimeFormat('en-GB',{weekday:'long'}).format(date));add.onclick=()=>openTask(null,key);
      const stack=document.createElement('div');stack.className='day-tasks'+(!shown.length?' empty':'');stack.id='tasks-'+key;
      const fill=()=>{if(stack.childNodes.length)return;if(shown.length)stack.append(...shown.map(t=>makeTaskCard(t)));else{const empty=document.createElement('div');empty.className='day-placeholder';empty.textContent=(query||tagUI?.filter)?'No matching tasks':isOne?'No unfinished tasks today.':'No tasks scheduled.';stack.append(empty);}};
      // Populated days start expanded, while empty days stay compact.
      // An explicit user collapse/expand choice wins until the page is reloaded.
      let open=isOne|| (expandedDays.has(key)?expandedDays.get(key):offset===0||shown.length>0);
      if(!isOne){
        const arrow=document.createElement('span');arrow.className='day-chevron';arrow.setAttribute('aria-hidden','true');toggle.append(arrow);
        const update=()=>{toggle.setAttribute('aria-expanded',String(open));stack.hidden=!open;card.classList.toggle('is-collapsed',!open);if(open)fill();};
        toggle.setAttribute('aria-controls',stack.id);toggle.onclick=()=>{open=!open;expandedDays.set(key,open);update();};update();
      }else fill();
      header.append(toggle,add);card.append(header);if(planning)card.append(planning.indicator(key,all));card.append(stack);els.daysRoot.append(card);
    }
    els.moreDaysButton.hidden=isOne||Boolean(query)||daysVisible>=365;
    if(daysVisible<365)els.moreDaysButton.textContent='Show another '+Math.min(30,365-daysVisible)+' days ↓';
  }

  function render() {
    const isSnapshot = activeView === "snapshot", isToday = activeView === "today";
    $("todayOverview").hidden = !isToday;
    $("todayView").hidden = !isToday; els.daysRoot.hidden = isToday;
    document.querySelector(".timeline-heading").hidden = isToday;
    $("timelinePanel").setAttribute("aria-label",isToday?"Today’s workspace":"Tasks by day");
    $("timelinePanel").removeAttribute("aria-labelledby");
    if(!isToday)$("pageDescription").removeAttribute("aria-live");
    if (!isSnapshot) rollover();
    $("workspace").hidden = isSnapshot;
    $("snapshotView").hidden = !isSnapshot;
    document.querySelector(".tag-filter-row").hidden = isSnapshot;
    els.sidebarInboxCount.textContent = String(tasks.filter(t => !t.date && !t.completed).length);
    if (isSnapshot) snapshot?.render();
    else if(isToday) { renderToday(); els.moreDaysButton.hidden=true; }
    else { renderInbox(); renderDays(); }
    const showDemo = tasks.some((task) => task.demo);
    els.demoBanner.hidden = !showDemo || isSnapshot || isToday;
    document.querySelectorAll("[data-nav]").forEach((button) => {
      const active = button.dataset.nav === activeView;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    document.body.dataset.activeView = activeView;
    updateFocusIndicator();
    if (els.taskDialog.open) updateSchedulingGuidance();
  }

  const scrollBehavior = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  function setView(view) {
    activeView = ["planner", "today", "one-task", "inbox", "snapshot"].includes(view) ? view : "planner";
    if (activeView === "one-task") {
      query = "";
      els.searchInput.value = "";
    }
    const labels = {
      snapshot: ["Snapshot", "Snapshot", "Task counts by status, tag and date."],
      planner: ["Planner", "Planner", "Schedule tasks across your days."],
      inbox: ["Inbox", "Inbox", "Tasks without a scheduled date."],
      today: ["Today", "Today", "Today's scheduled tasks."],
      "one-task": ["One task", "One task", "Your next unfinished task."]
    };
    const [crumb, heading, description] = labels[activeView];
    $("breadcrumb").textContent = crumb;
    $("pageTitle").replaceChildren(document.createTextNode(heading));
    const stop = document.createElement("span");
    stop.className = "full-stop";
    stop.textContent = ".";
    $("pageTitle").append(stop);
    $("pageDescription").textContent = description;
    $("timelineTitle").textContent = activeView === "today" ? "Your day" : activeView === "one-task" ? "Your next task" : "Your days";
    render();
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }

  function dateChoiceFor(value) {
    if (!value) return "";
    if (value === todayKey()) return "today";
    if (value === tomorrowKey()) return "tomorrow";
    return "custom";
  }

  function updateDateSelector() {
    const custom = els.taskDate.value === "custom";
    els.customDateWrap.hidden = !custom;
    els.customDateInput.required = custom;
    if (custom && !els.customDateInput.value) els.customDateInput.value = todayKey();
    updateSchedulingGuidance();
  }

  function openTask(taskId = null, defaultDate = null) {
    const task = taskId ? tasks.find((t) => t.id === taskId) : null;
    if (taskId && !task) return;
    editingId = task ? task.id : null;
    editingSnapshot = task ? JSON.parse(JSON.stringify(task)) : null;
    dialogOpener = document.activeElement;
    $("dialogHeading").textContent = task ? "Edit task" : "New task";
    els.taskTitle.value = task ? task.title : "";
    $("taskDuplicateFeedback").hidden = true;
    $("taskDuplicateFeedback").textContent = "";
    els.taskNotes.value = task ? task.notes : "";
    els.taskMain.checked = task ? task.main : false;
    tagUI?.open(task);
    const estimate = task?.estimateMinutes || "";
    $("taskEstimate").value = ["",15,30,60,120].includes(estimate) ? String(estimate) : "custom";
    $("estimateCustomMinutes").value = estimate || "";
    updateEstimate();
    const date = task ? task.date : defaultDate;
    els.taskDate.value = dateChoiceFor(date);
    els.customDateInput.min = todayKey();
    els.customDateInput.value = date || todayKey();
    updateDateSelector();
    els.deleteTaskButton.hidden = !task;
    els.taskEditorFocusRow.hidden = !task || task.completed;
    $("saveTaskButton").textContent = task ? "Save changes" : "Add task";
    updateOrderControls();
    els.taskDialog.showModal();
    els.taskTitle.focus();
  }

  function updateOrderControls() {
    const task=tasks.find(t=>t.id===editingId),list=task?.date?SimpleDoDaily.group(tasks,task):[];
    const index=list.findIndex(t=>t.id===editingId);
    $('taskOrderControls').hidden=list.length<2;
    $('taskEarlier').disabled=index<=0;$('taskLater').disabled=index<0||index>=list.length-1;
  }
  function shiftTask(direction) {
    const current=tasks.find(t=>t.id===editingId);
    if(!SimpleDoData.same(current,editingSnapshot)){notify('This task changed. Reopen it before changing its order.');return;}
    const next=SimpleDoDaily.shift(tasks,editingId,direction);if(next===tasks)return;
    tasks=next;if(!persist()){render();return;}
    editingSnapshot=JSON.parse(JSON.stringify(tasks.find(t=>t.id===editingId)));render();updateOrderControls();notify('Task order updated.');
  }

  function closeTask() {
    if (els.taskDialog.open) els.taskDialog.close();
    if (dialogOpener && typeof dialogOpener.focus === "function") dialogOpener.focus();
  }

  function chosenDate() {
    switch (els.taskDate.value) {
      case "today": return todayKey();
      case "tomorrow": return tomorrowKey();
      case "custom": return els.customDateInput.value;
      default: return null;
    }
  }

  function addOrUpdateTask(event, allowSimilar = false) {
    event?.preventDefault();
    const title = els.taskTitle.value.trim();
    if (!title) {
      els.taskTitle.focus();
      return;
    }
    const estimateMinutes = chosenEstimate();
    if (estimateMinutes !== null && (!Number.isInteger(estimateMinutes) || estimateMinutes < 1 || estimateMinutes > 10080)) { notify("Enter an estimated duration from 1 to 10,080 minutes."); return; }
    const date = chosenDate();
    if (date && date < todayKey()) {
      notify("Choose today or a future day.");
      return;
    }
    // Existing tasks can be edited in place without re-warning on their own title.
    // A newly created title, or a changed title, must pass duplicate checks.
    if (!editingId || SimpleDoCapture.key(title) !== SimpleDoCapture.key(editingSnapshot?.title || "")) {
      const checked = SimpleDoCapture.assess([{title}], tasks, editingId);
      if (checked.exact.length) {
        const match = checked.exact[0].match.title;
        $("taskDuplicateFeedback").textContent = 'Already on your list: “' + match + '”. No duplicate task added.';
        $("taskDuplicateFeedback").hidden = false;
        els.taskTitle.focus();
        return;
      }
      if (checked.similar.length && !allowSimilar) {
        reviewSimilar(checked, chosen => {
          if (chosen.has(0)) addOrUpdateTask(null, true);
          else {
            $("taskDuplicateFeedback").textContent = 'Task not added. A similar task exists: “' + checked.similar[0].match.title + '”.';
            $("taskDuplicateFeedback").hidden = false;
          }
        });
        return;
      }
    }
    $("taskDuplicateFeedback").hidden = true;
    let task = editingId ? tasks.find((t) => t.id === editingId) : null;
    if (editingSnapshot && !SimpleDoData.same(task, editingSnapshot)) {
      task = { ...editingSnapshot, id: makeId(), conflictOf: editingId, recoveredAt: new Date().toISOString() };
      tasks.push(task);
    }
    if (task) {
      task.title = title;
      task.notes = els.taskNotes.value.trim();
      if(task.date!==date)delete task.dayOrder;
      task.date = date;
      task.main = els.taskMain.checked;
      task.rolled = false;
      task.demo = false;
    } else {
      task = {
        id: makeId(), title, notes: els.taskNotes.value.trim(),
        date, completed: false, main: els.taskMain.checked, rolled: false,
        demo: false, createdAt: new Date().toISOString()
      };
      tasks.push(task);
    }
    task.estimateMinutes = estimateMinutes;
    task.tagIds = tagUI?.selection() || [];
    delete task.tagId; // An edited legacy record adopts multi-tag storage; others remain untouched.
    task.capacityContext = tagCatalog.context(task);
    if (task.main && date) {
      tasks.forEach((other) => {
        if (other.id !== task.id && other.date === date) other.main = false;
      });
    }
    const guidance = date && planning ? planning.guidance(date, estimateMinutes, tasks, task.id) : null;
    if (!persist()) { render(); return; }
    closeTask();
    render();
    if (guidance?.current && (guidance.current.free < (estimateMinutes || 0) || guidance.current.free === 0)) notify(guidance.text);
    else notify(editingId ? "Task updated." : "Task added.");
  }

  function removeTask() {
    if (!editingId) return;
    const current = tasks.find(t => t.id === editingId);
    if (!SimpleDoData.same(current, editingSnapshot)) {
      notify("This task changed while the editor was open. Reopen it before deleting.");
      closeTask(); return;
    }
    clearFocusForTask(editingId);
    tasks = tasks.filter((t) => t.id !== editingId);
    if (!persist()) { render(); return; }
    closeTask();
    render();
    notify("Task deleted.");
  }

  function moveTask(id, destination) {
    const task = tasks.find((t) => t.id === id);
    if (!task || (task.date || "inbox") === destination) return;
    const targetDate = destination === "inbox" ? null : destination;
    if (task.main && targetDate) {
      tasks.forEach((other) => {
        if (other.id !== task.id && other.date === targetDate) other.main = false;
      });
    }
    task.date = targetDate;
    delete task.dayOrder;
    task.rolled = false;
    task.demo = false;
    persist();
    render();
    const guidance = targetDate && planning ? planning.guidance(targetDate, task.estimateMinutes, tasks, task.id) : null;
    notify(guidance?.current && (guidance.current.free < (task.estimateMinutes || 0) || guidance.current.free === 0) ? guidance.text : destination === "inbox" ? "Moved back to Inbox." : "Task scheduled.");
  }

  function bindDragDrop() {
    const workspace = $("workspace");
    workspace.addEventListener("dragover", (event) => {
      const zone = event.target.closest(".dropzone");
      if (!zone || !draggedId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".is-over").forEach((el) => {
        if (el !== zone) el.classList.remove("is-over");
      });
      zone.classList.add("is-over");
    });
    workspace.addEventListener("drop", (event) => {
      const zone = event.target.closest(".dropzone");
      if (!zone) return;
      event.preventDefault();
      const id = draggedId || event.dataTransfer.getData("text/plain");
      const date = zone.dataset.date;
      const target=event.target.closest('[data-task-id]');
      const source=tasks.find(t=>t.id===id);
      if(source?.date===date&&target&&target.dataset.taskId!==id) {
        const next=SimpleDoDaily.reorder(tasks,id,target.dataset.taskId);
        if(next!==tasks){tasks=next;persist();render();notify('Task order updated.');}
      } else if(id&&date)moveTask(id,date);
      draggedId = null;
      document.querySelectorAll(".is-over").forEach((el) => el.classList.remove("is-over"));
    });
    workspace.addEventListener("dragleave", (event) => {
      if (!workspace.contains(event.relatedTarget))
        document.querySelectorAll(".is-over").forEach((el) => el.classList.remove("is-over"));
    });
  }


  // Imports are intentionally browser-only. Never upload a user's tasks to the
  // public repository or a server, and never overwrite the current task list.
  function readImportRows(source, filename) {
    const trimmed = source.trim();
    if (!trimmed) throw new Error("That file is empty.");
    const seemsJson = /\.json$/i.test(filename) || trimmed.startsWith("{") || trimmed.startsWith("[");
    let entries;
    if (seemsJson) {
      let data;
      try {
        data = JSON.parse(trimmed);
      } catch (_) {
        throw new Error("This isn't valid JSON. Try the SimpleDo import file.");
      }
      entries = Array.isArray(data) ? data
        : Array.isArray(data?.tasks) ? data.tasks
        : Array.isArray(data?.items) ? data.items
        : null;
      if (!entries) throw new Error("The JSON file needs a tasks or items list.");
    } else {
      const lines = source.split(/\r?\n/);
      entries = lines.map((raw, index) => {
        let line = raw.trim();
        const isTableRow = line.startsWith("|") && line.endsWith("|");
        if (isTableRow) line = line.slice(1, -1).trim();
        if (!line || /^[-:|\s]+$/.test(line)) return null;
        // Skip the header when importing a Markdown table.
        if (index === 0 && isTableRow && lines[1] &&
            /^\|?\s*[-: ]+\s*\|?$/.test(lines[1].trim())) return null;
        line = line.replace(/^[-*]\s+/, "").trim();
        const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(line);
        if (link) return { title: link[1], notes: "Reference link: " + link[2] };
        return { title: line, notes: "" };
      }).filter(Boolean);
    }
    if (entries.length > 2000) {
      throw new Error("Please import no more than 2,000 tasks at a time.");
    }
    return entries.map((entry) => {
      const title = typeof entry === "string" ? entry.trim()
        : entry && typeof entry.title === "string" ? entry.title.trim() : "";
      const rawNotes = entry && typeof entry === "object" && typeof entry.notes === "string"
        ? entry.notes.trim() : "";
      const notes = title.length > 180
        ? (rawNotes ? rawNotes + "\n\n" : "") + "Original task: " + title
        : rawNotes;
      return {
        title: title.length > 180 ? title.slice(0, 179) + "…" : title,
        notes: notes.slice(0, 2000)
      };
    }).filter((row) => row.title.length > 0);
  }

  async function importTasksFromFile(event) {
    const field = event.currentTarget;
    const file = field.files && field.files[0];
    field.value = "";
    if (!file) return;
    if (file.size > 2_000_000) {
      notify("That file is too large. Please choose a smaller list.");
      return;
    }
    try {
      const rows = readImportRows(await file.text(), file.name);
      if (!rows.length) { notify("No tasks found in that file."); return; }
      const finish = message => { setView("inbox"); notify(message); };
      const result = addIncoming(rows, "", finish, null, "import");
      if (result !== null) finish(result);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to import this file.");
    }
  }


  // One active focus timer is saved using an end timestamp rather than an
  // interval counter; a sleeping tab or page refresh won't reset the session.
  function saveFocusSession() {
    try {
      if (focusSession) localStorage.setItem(FOCUS_KEY, JSON.stringify(focusSession));
      else localStorage.removeItem(FOCUS_KEY);
    } catch (error) {
      console.warn("Couldn't save SimpleDo focus timer", error);
      notify("Browser storage is unavailable; timer may reset on refresh.");
    }
  }

  function focusSecondsLeft() {
    if (!focusSession || focusSession.state === "finished") return 0;
    if (focusSession.state === "paused") return focusSession.remainingSec;
    return Math.max(0, Math.ceil((focusSession.endsAt - Date.now()) / 1000));
  }

  function loadFocusSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(FOCUS_KEY) || "null");
      const valid = saved && typeof saved.taskId === "string" &&
        tasks.some((t) => t.id === saved.taskId && !t.completed) &&
        ["focus", "break"].includes(saved.mode) &&
        ["running", "paused", "finished"].includes(saved.state) &&
        Number.isFinite(saved.durationSec) && saved.durationSec >= 60 && saved.durationSec <= 10800 &&
        Number.isFinite(saved.remainingSec) && saved.remainingSec >= 0 &&
        saved.remainingSec <= saved.durationSec &&
        (saved.state !== "running" || Number.isFinite(saved.endsAt));
      focusSession = valid ? saved : null;
      if (!valid && saved) saveFocusSession();
      if (focusSession && focusSession.state === "running" && focusSecondsLeft() === 0)
        finishFocusSession(false);
    } catch (error) {
      console.warn("Couldn't restore SimpleDo focus timer", error);
      focusSession = null;
    }
  }

  function clearFocusForTask(taskId) {
    if (focusSession && focusSession.taskId === taskId) {
      focusSession = null;
      saveFocusSession();
      if (els.focusDialog.open) els.focusDialog.close();
    }
  }

  function focusClockText(seconds) {
    const safe = Math.max(0, seconds);
    return String(Math.floor(safe / 60)).padStart(2, "0") + ":" +
      String(safe % 60).padStart(2, "0");
  }

  function focusButtonText() {
    if (!focusSession) return "▶ Start";
    if (focusSession.state === "finished")
      return focusSession.mode === "break" ? "Break over" : "Time's up";
    if (focusSession.state === "paused") return "Ⅱ Paused";
    return "◷ " + focusClockText(focusSecondsLeft());
  }

  function updateFocusIndicator() {
    els.globalFocusButton.hidden = !focusSession;
    if (!focusSession) {
      document.title = DEFAULT_TAB_TITLE;
      return;
    }

    // Keep the remaining time visible while working in a different browser tab.
    // Use the existing clock and timer tick; don't create a second countdown.
    if (focusSession.state === "running") {
      document.title = focusClockText(focusSecondsLeft()) + " · SimpleDo";
    } else if (focusSession.state === "paused") {
      document.title = "Paused " + focusClockText(focusSecondsLeft()) + " · SimpleDo";
    } else {
      document.title = (focusSession.mode === "break" ? "Break finished" : "Focus finished") + " · SimpleDo";
    }

    const label = focusButtonText();
    els.globalFocusTime.textContent = focusSession.state === "running"
      ? focusClockText(focusSecondsLeft()) : label;
    els.globalFocusButton.setAttribute("aria-label",
      "Return to focus timer for " +
      (tasks.find((t) => t.id === focusSession.taskId)?.title || "task"));
    document.querySelectorAll("[data-focus-task-id]").forEach((button) => {
      if (button.dataset.focusTaskId === focusSession.taskId) button.textContent = label;
    });
  }

  function changeFocusDuration() {
    const custom = els.focusDurationSelect.value === "custom";
    els.focusCustomWrap.hidden = !custom;
    els.focusCustomMinutes.required = custom;
  }

  function openFocus(taskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.completed) {
      notify("This task is already complete.");
      return;
    }
    focusOpener = document.activeElement;
    if (focusSession) {
      if (focusSession.taskId !== taskId)
        notify("End the current timer before starting a different task.");
      focusTargetTaskId = focusSession.taskId;
    } else {
      focusTargetTaskId = task.id;
      const chosen = task.focusMinutes || 25;
      const preset = Array.from(els.focusDurationSelect.options)
        .some((opt) => opt.value === String(chosen));
      els.focusDurationSelect.value = preset ? String(chosen) : "custom";
      els.focusCustomMinutes.value = String(chosen);
      changeFocusDuration();
    }
    if (!els.focusDialog.open) els.focusDialog.showModal();
    updateFocusPanel();
    if (!focusSession) els.focusDurationSelect.focus();
  }

  function closeFocusDialog() {
    if (els.focusDialog.open) els.focusDialog.close();
  }

  function startFocus() {
    if (focusSession) return;
    const task = tasks.find((t) => t.id === focusTargetTaskId && !t.completed);
    if (!task) {
      closeFocusDialog();
      notify("That task is no longer available.");
      return;
    }
    const minutes = Number(els.focusDurationSelect.value === "custom"
      ? els.focusCustomMinutes.value : els.focusDurationSelect.value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
      notify("Enter a whole number of minutes between 1 and 180.");
      els.focusCustomMinutes.focus();
      return;
    }
    task.focusMinutes = minutes;
    task.demo = false;
    persist();
    focusSession = {
      taskId: task.id, mode: "focus", state: "running",
      durationSec: minutes * 60, remainingSec: minutes * 60,
      endsAt: Date.now() + minutes * 60000
    };
    saveFocusSession();
    render();
    updateFocusPanel();
    notify("Focus time started.");
  }

  function pauseOrResumeFocus() {
    if (!focusSession || focusSession.state === "finished") return;
    if (focusSession.state === "running") {
      focusSession.remainingSec = focusSecondsLeft();
      focusSession.endsAt = null;
      focusSession.state = "paused";
    } else {
      focusSession.endsAt = Date.now() + focusSession.remainingSec * 1000;
      focusSession.state = "running";
    }
    saveFocusSession();
    render();
    updateFocusPanel();
  }

  function finishFocusSession(showMessage = true) {
    if (!focusSession || focusSession.state === "finished") return;
    focusSession.state = "finished";
    focusSession.remainingSec = 0;
    focusSession.endsAt = null;
    saveFocusSession();
    if (showMessage) notify(focusSession.mode === "break" ?
      "Break over. Ready for the next task?" : "Focus time complete.");
  }

  function startFocusBreak() {
    if (!focusSession || focusSession.state !== "finished" || focusSession.mode !== "focus") return;
    focusSession.mode = "break";
    focusSession.state = "running";
    focusSession.durationSec = 300;
    focusSession.remainingSec = 300;
    focusSession.endsAt = Date.now() + 300000;
    saveFocusSession();
    render();
    updateFocusPanel();
  }

  function stopFocus() {
    focusSession = null;
    focusTargetTaskId = null;
    saveFocusSession();
    render();
    closeFocusDialog();
    notify("Focus session ended.");
  }

  function restartFocus() {
    if (!focusSession || focusSession.state !== "finished") return;
    const taskId = focusSession.taskId;
    focusSession = null;
    saveFocusSession();
    render();
    closeFocusDialog();
    openFocus(taskId);
  }

  function completeFocusedTask() {
    const id = focusSession?.taskId || focusTargetTaskId;
    const task = tasks.find((t) => t.id === id);
    if (!task) return stopFocus();
    clearFocusForTask(id);
    focusTargetTaskId = null;
    task.completed = true;
    persist();
    render();
    notify("Task complete. On to the next thing.");
  }

  function updateFocusPanel() {
    if (!els.focusDialog.open) return;
    const task = tasks.find((t) => t.id === (focusSession?.taskId || focusTargetTaskId));
    if (!task) {
      closeFocusDialog();
      return;
    }
    els.focusTaskLabel.textContent = task.title;
    const active = Boolean(focusSession);
    els.focusSetup.hidden = active;
    els.focusSessionView.hidden = !active;
    if (!active) {
      els.focusHeading.textContent = "Start a focus session";
      return;
    }
    const seconds = focusSecondsLeft();
    const finished = focusSession.state === "finished";
    const isBreak = focusSession.mode === "break";
    els.focusHeading.textContent = finished
      ? isBreak ? "Break finished" : "Session complete"
      : isBreak ? "Take five" : "Time to focus";
    els.focusCountdown.textContent = focusClockText(seconds);
    els.focusPhase.textContent = finished
      ? isBreak ? "Break complete" : "Focus complete"
      : focusSession.state === "paused" ? "Paused"
      : isBreak ? "5-minute break" : "Focus time";
    const progress = Math.min(100, Math.max(0,
      Math.round(100 * (1 - seconds / focusSession.durationSec))));
    els.focusProgressFill.style.width = progress + "%";
    els.focusProgressTrack.setAttribute("aria-valuenow", String(progress));
    els.focusSessionHint.textContent = finished
      ? isBreak ? "Ready for another session or to finish your task?"
                : "Nice work. Take five, focus again, or mark your task complete."
      : "You can close this window — the timer will carry on.";
    els.focusPauseButton.hidden = finished;
    els.focusPauseButton.textContent = focusSession.state === "paused" ? "▶ Resume" : "Ⅱ Pause";
    els.focusStopButton.textContent = finished ? "Dismiss timer" : "End session";
    els.focusFinishActions.hidden = !finished;
    els.focusBreakButton.hidden = !finished || isBreak;
  }

  function tickFocus() {
    // Use main's shared midnight refresh for the Planner, Today and focus timer.
    const currentDay = todayKey();
    if (currentDay !== lastObservedDay) {
      lastObservedDay = currentDay;
      rollover();
      render();
    }
    if (!focusSession) return;
    if (focusSession.state === "running" && focusSecondsLeft() === 0) {
      finishFocusSession();
      render();
    }
    updateFocusIndicator();
    updateFocusPanel();
  }

  function wireEvents() {
    $('todayAdd').onclick=()=>openTask(null,todayKey());
    $('taskEarlier').onclick=()=>shiftTask(-1);$('taskLater').onclick=()=>shiftTask(1);
    $("newTaskButton").addEventListener("click", () => openTask());
    els.importTasksButton.addEventListener("click", () => els.importTasksFile.click());
    els.importTasksFile.addEventListener("change", importTasksFromFile);
    $("createTagFromTask").addEventListener("click", () => {
      if (!tagUI || !storageReady) { notify("Tag editing is unavailable until storage is ready."); return; }
      // Preserve every unsaved task field while managing a tag.
      returnToTaskAfterTags = true;
      els.taskDialog.close();
      $("settingsDialog").showModal();
      $("tagSettingsDetails").open = true;
      $("customTagChoice").value = "";
      tagUI.editChoice();
      $("tagName").focus();
    });
    $("settingsDialog").addEventListener("close", () => {
      if (!returnToTaskAfterTags) return;
      returnToTaskAfterTags = false;
      if (!els.taskDialog.open) els.taskDialog.showModal();
      tagUI?.focus();
    });
    els.globalFocusButton.addEventListener("click", () => {
      if (focusSession) openFocus(focusSession.taskId);
    });
    els.startTaskFromEditor.addEventListener("click", () => {
      if (!editingId) return;
      const id = editingId;
      closeTask();
      openFocus(id);
    });
    $("closeFocusDialog").addEventListener("click", closeFocusDialog);
    $("focusCancelButton").addEventListener("click", closeFocusDialog);
    $("focusStartButton").addEventListener("click", startFocus);
    els.focusDurationSelect.addEventListener("change", changeFocusDuration);
    els.focusPauseButton.addEventListener("click", pauseOrResumeFocus);
    els.focusStopButton.addEventListener("click", stopFocus);
    els.focusCompleteButton.addEventListener("click", completeFocusedTask);
    els.focusBreakButton.addEventListener("click", startFocusBreak);
    $("focusAnotherButton").addEventListener("click", restartFocus);
    els.focusDialog.addEventListener("close", () => {
      if (focusOpener && document.contains(focusOpener) && typeof focusOpener.focus === "function")
        focusOpener.focus();
    });
    els.focusDialog.addEventListener("click", (event) => {
      if (event.target === els.focusDialog) closeFocusDialog();
    });
    $("brandLink").addEventListener("click", (event) => {
      event.preventDefault();
      setView("planner");
    });
    document.querySelectorAll("[data-nav]").forEach((button) =>
      button.addEventListener("click", () => setView(button.dataset.nav))
    );
    const quickField = $("quickTaskInput"), quickForm = $("quickAddForm");
    const quickSubmit = quickForm.querySelector('button[type="submit"]');
    function updateQuickField() {
      const count = quickField.value.split(/\r\n|\n|\r/).filter(line => line.trim()).length;
      quickField.style.height = "auto";
      quickField.style.height = Math.min(160, Math.max(44, quickField.scrollHeight)) + "px";
      quickSubmit.setAttribute("aria-label", count > 1 ? "Add " + count + " tasks to Inbox" : "Add task to Inbox");
      const hint = count > 1 ? count + " tasks ready — press + to add them." : "Paste a list — one task per line";
      if ($("quickAddHint").textContent !== hint) $("quickAddHint").textContent = hint;
    }
    try { quickField.value = sessionStorage.getItem("simpledo.typedDraft.v1") || ""; } catch (_) {}
    updateQuickField();
    quickField.addEventListener("input", () => {
      try { sessionStorage.setItem("simpledo.typedDraft.v1", quickField.value); } catch (_) {}
      $("quickAddFeedback").hidden = true;
      $("quickAddFeedback").textContent = "";
      updateQuickField();
    });
    quickField.addEventListener("keydown", (event) => {
      // Enter keeps single-task capture fast. Shift+Enter inserts a line break.
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        quickForm.requestSubmit();
      }
    });
    const finishQuickAdd = message => {
      quickField.value = "";
      try { sessionStorage.removeItem("simpledo.typedDraft.v1"); } catch (_) {}
      updateQuickField();
      const feedback = $("quickAddFeedback");
      feedback.textContent = message;
      feedback.hidden = !/skipped|duplicate|already exist|similar/i.test(message);
      quickField.focus();
      notify(message);
    };
    quickForm.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const titles = SimpleDoCapture.quickLines(quickField.value);
        if (!titles.length) { notify("Write a task or paste a list."); quickField.focus(); return; }
        const result = addIncoming(titles.map(title => ({title})), "", finishQuickAdd);
        if (result !== null) finishQuickAdd(result);
      } catch (error) { notify(error.message); }
    });
    els.taskTitle.addEventListener("input", () => {
      $("taskDuplicateFeedback").hidden = true;
      $("taskDuplicateFeedback").textContent = "";
    });
    els.taskDate.addEventListener("change", updateDateSelector);
    els.taskForm.addEventListener("submit", addOrUpdateTask);
    $("closeDialog").addEventListener("click", closeTask);
    $("cancelTaskButton").addEventListener("click", closeTask);
    els.deleteTaskButton.addEventListener("click", removeTask);
    els.taskDialog.addEventListener("click", (event) => {
      if (event.target === els.taskDialog) closeTask();
    });
    els.searchInput.addEventListener("input", (event) => {
      if (["one-task", "snapshot"].includes(activeView) && event.target.value.trim()) setView("planner");
      query = event.target.value.trim().toLocaleLowerCase();
      render();
    });
    // These controls filter only the Inbox list; do not redraw or hide scheduled days.
    $("inboxSearchInput").addEventListener("input", event => {
      inboxQuery = event.target.value.trim().toLocaleLowerCase();
      renderInbox();
    });
    $("inboxTagFilter").addEventListener("change", event => {
      inboxTag = event.target.value;
      renderInbox();
    });
    $("clearInboxFilters").addEventListener("click", () => {
      inboxQuery = ""; inboxTag = "";
      $("inboxSearchInput").value = "";
      $("inboxTagFilter").value = "";
      renderInbox();
      $("inboxSearchInput").focus();
    });
    els.moreDaysButton.addEventListener("click", () => {
      daysVisible = Math.min(daysVisible + 30, 365);
      planning?.calendar.range(daysVisible);
      render();
    });
    $("removeDemoButton").addEventListener("click", () => {
      tasks = tasks.filter((task) => !task.demo);
      try { localStorage.setItem(DEMO_KEY, "true"); } catch (_) { /* unavailable */ }
      const saved = persist();
      render();
      if (!saved) return;
      notify("Sample tasks removed. Make it your own.");
    });
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "/" && activeView !== "snapshot" && !els.taskDialog.open && !$("settingsDialog").open && !$("restoreDialog").open && !$("captureDialog").open &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
      ) {
        event.preventDefault();
        els.searchInput.focus();
      }
      if (
        (event.key === "n" || event.key === "N") && activeView !== "snapshot" && !els.taskDialog.open && !$("settingsDialog").open && !$("restoreDialog").open && !$("captureDialog").open &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
      ) {
        event.preventDefault();
        openTask();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        tickFocus();
        render();
      }
    });
    window.addEventListener("storage", (event) => {
      if (event.key === SimpleDoData.KEY) {
        if (saveFailed) return;
        load();
        planning?.reload();
        tagUI?.refresh();
        if (focusSession && !tasks.some((t) => t.id === focusSession.taskId && !t.completed))
          clearFocusForTask(focusSession.taskId);
        render();
      } else if (event.key === FOCUS_KEY) {
        loadFocusSession();
        render();
        updateFocusPanel();
      }
    });
    bindDragDrop();
  }

  function downloadJSON(data, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  let backupToRestore = null;
  $("settingsButton").onclick = () => $("settingsDialog").showModal();
  $("closeSettings").onclick = () => $("settingsDialog").close();
  $("exportBackup").onclick = () => {
    // Include current in-memory edits even if browser storage has become full.
    downloadJSON({ app: "SimpleDo", version: 1, exportedAt: new Date().toISOString(), tasks, tags: tagCatalog?.definitions(), planningSettings: planning?.settings },
      "SimpleDo-Backup-" + todayKey() + ".json");
  };
  $("recoveryDownload").onclick = () => downloadJSON({
    tasks: localStorage.getItem(STORAGE_KEY), data: localStorage.getItem(SimpleDoData.KEY),
    preUpgrade: localStorage.getItem("simpledo.preUpgrade.v1"), beforeRestore: localStorage.getItem("simpledo.beforeRestore.v1")
  }, "SimpleDo-Recovery-" + todayKey() + ".json");
  $("importBackup").onclick = () => $("backupFile").click();
  $("backupFile").onchange = async event => {
    const file = event.target.files[0]; event.target.value = "";
    if (!file) return;
    try {
      if (!storageReady) throw new Error("Resolve the storage error before restoring a backup.");
      if (file.size > 20_000_000) throw new Error("Please choose a backup smaller than 20 MB.");
      backupToRestore = SimpleDoData.parseBackupDocument(await file.text());
      $("restoreCount").textContent = backupToRestore.tasks.length + " tasks in this backup.";
      $("replaceConfirm").checked = false; $("replaceBackup").disabled = true;
      $("restoreError").textContent = "";
      $("settingsDialog").close(); $("restoreDialog").showModal();
    } catch (error) { notify(error.message); }
  };
  $("replaceConfirm").onchange = event => $("replaceBackup").disabled = !event.target.checked;
  $("cancelRestore").onclick = () => { backupToRestore = null; $("restoreDialog").close(); };
  function restoreBackup(replace) {
    if (!backupToRestore || (replace && !$("replaceConfirm").checked)) return;
    try {
      tasks = store.restore(backupToRestore.tasks, replace, replace ? backupToRestore.planningSettings : undefined, backupToRestore.tags);
      tagUI?.refresh();
      planning?.reload();
      if (focusSession && !tasks.some(t => t.id === focusSession.taskId && !t.completed)) clearFocusForTask(focusSession.taskId);
      localStorage.setItem(DEMO_KEY, "true");
      backupToRestore = null; $("restoreDialog").close(); render();
      cloud?.schedule(); notify("Backup restored. Existing task IDs were preserved.");
    } catch (error) { $("restoreError").textContent = "Restore could not be saved: " + error.message; }
  }
  $("mergeBackup").onclick = () => restoreBackup(false);
  $("replaceBackup").onclick = () => restoreBackup(true);

  function chosenEstimate() {
    return $("taskEstimate").value === "" ? null : Number($("taskEstimate").value === "custom" ? $("estimateCustomMinutes").value : $("taskEstimate").value);
  }
  function updateEstimate() {
    const custom = $("taskEstimate").value === "custom";
    $("estimateCustomWrap").hidden = !custom; $("estimateCustomMinutes").required = custom;
    updateSchedulingGuidance();
  }
  function updateSchedulingGuidance() {
    if (!planning) return;
    const result = planning.guidance(chosenDate(), chosenEstimate(), tasks, editingId, tagUI?.context(tagUI?.selection() || []));
    $("scheduleMessage").textContent = result.text;
    suggestedDate = result.date; $("useSuggestedDay").hidden = !suggestedDate;
  }
  $("taskEstimate").onchange = updateEstimate;
  $("estimateCustomMinutes").oninput = updateSchedulingGuidance;
  els.customDateInput.addEventListener("input", updateSchedulingGuidance);
  $("useSuggestedDay").onclick = () => {
    if (!suggestedDate) return;
    els.taskDate.value = "custom"; els.customDateInput.value = suggestedDate; updateDateSelector();
  };
  load();
  if (storageReady) {
    tagCatalog = new SimpleDoTags.Catalog(store);
    tagUI = new SimpleDoTagUI.Controller(tagCatalog, {
      tasks:()=>tasks, changed:()=>render(), saved:()=>cloud?.schedule(),
      selectionChanged:()=>updateSchedulingGuidance(),
      created: tag => {
        if (returnToTaskAfterTags) {
          tagUI.selectTag(tag.id);
          $("settingsDialog").close();
        }
      }
    });
    planning = new SimpleDoPlanning.Controller(store, {changed: () => render(), tags:tagCatalog});
  }
  snapshot = new SimpleDoSnapshot.Controller({tasks:()=>tasks,today:todayKey,catalog:()=>tagCatalog||{resolve:()=>null},palette:()=>SimpleDoTags.PALETTE});
  loadFocusSession();
  wireEvents();
  capture = new SimpleDoCaptureUI.Controller({catalog:()=>tagCatalog, add:captureTasks, notify});
  setView("planner");
  const captureShortcut = new URLSearchParams(location.search).get('capture');
  if (storageReady && ['type','speak','scan'].includes(captureShortcut)) {
    setView('inbox');
    if (captureShortcut === 'type') $('quickTaskInput').focus(); else capture.open(captureShortcut);
  }
  tickFocus();
  window.setInterval(tickFocus, 1000);
  if (storageReady) cloud = new SimpleDoCloud.Controller(store, {
    canSync: () => !saveFailed,
    tags: tagCatalog,
    tagsChanged() { tagUI.refresh(); render(); },
    accountChanged: (client, user) => { planning?.account(client, user); capture?.account(client, user); },
    changed(next) {
      if (saveFailed) return;
      tasks = next;
      tagUI?.refresh();
      if (focusSession && !tasks.some(t => t.id === focusSession.taskId && !t.completed)) clearFocusForTask(focusSession.taskId);
      render(); updateFocusPanel();
    }, notify
  });
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* Local task storage remains usable. */ });
}
