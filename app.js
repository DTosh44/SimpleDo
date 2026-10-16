"use strict";

(() => {
  const STORAGE_KEY = "simpledo.tasks.v1";
  const DEMO_KEY = "simpledo.demoRemoved.v1";
  const FOCUS_KEY = "simpledo.focusSession.v1";
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
    jumpTodayButton: $("jumpTodayButton"),
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
  let query = "";
  let editingId = null;
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

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        tasks = Array.isArray(parsed)
          ? parsed
              .filter((t) => t && typeof t.id === "string" && typeof t.title === "string")
              .map((t) => ({
                id: t.id,
                title: t.title.slice(0, 180),
                notes: typeof t.notes === "string" ? t.notes.slice(0, 2000) : "",
                date: typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : null,
                completed: Boolean(t.completed),
                main: Boolean(t.main),
                focusMinutes: Number.isInteger(t.focusMinutes) && t.focusMinutes >= 1 && t.focusMinutes <= 180 ? t.focusMinutes : null,
                rolled: Boolean(t.rolled),
                demo: Boolean(t.demo),
                createdAt: t.createdAt || new Date().toISOString()
              }))
          : [];
      } else {
        tasks = localStorage.getItem(DEMO_KEY) === "true" ? [] : demoTasks();
        persist();
      }
    } catch (error) {
      console.warn("Could not read saved SimpleDo tasks", error);
      tasks = demoTasks();
    }
    rollover();
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.warn("Could not save SimpleDo tasks", error);
      notify("Browser storage is unavailable. Changes may not be saved.");
    }
  }

  function rollover() {
    let changed = false;
    const today = todayKey();
    for (const task of tasks) {
      if (!task.completed && task.date && task.date < today) {
        task.date = null;
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
    if (!query) return list;
    return list.filter((task) => (task.title + " " + task.notes).toLocaleLowerCase().includes(query));
  }

  function sortTasks(list) {
    return [...list].sort((a, b) =>
      Number(a.completed) - Number(b.completed) ||
      Number(b.main) - Number(a.main) ||
      String(a.createdAt).localeCompare(String(b.createdAt))
    );
  }

  function makeTaskCard(task) {
    const card = document.createElement("article");
    card.className = "task-card" + (task.completed ? " is-done" : "") + (task.main ? " main-task" : "");
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
    check.addEventListener("click", () => {
      task.completed = !task.completed;
      if (task.completed) clearFocusForTask(task.id);
      persist();
      render();
      notify(task.completed ? "Nicely done. Task completed." : "Task marked incomplete.");
    });

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
      focusButton.textContent = current ? focusButtonText() : "▶ Start";
      focusButton.classList.toggle("is-timing", Boolean(current));
      focusButton.setAttribute("aria-label", current ? "Return to timer for " + task.title : "Start task: " + task.title);
      card.append(check, body, focusButton, edit);
    } else {
      card.append(check, body, edit);
    }
    return card;
  }

  function renderInbox() {
    const inbox = sortTasks(matching(tasks.filter((t) => !t.date)));
    const outstandingCount = tasks.filter((t) => !t.date && !t.completed).length;
    els.inboxCount.textContent = String(outstandingCount);
    els.sidebarInboxCount.textContent = String(outstandingCount);
    els.inboxTasks.replaceChildren();
    if (inbox.length) {
      inbox.forEach((t) => els.inboxTasks.append(makeTaskCard(t)));
    } else if (query) {
      const empty = document.createElement("p");
      empty.className = "no-results";
      empty.textContent = "No matching tasks in the Inbox.";
      els.inboxTasks.append(empty);
    } else {
      const empty = document.createElement("div");
      empty.className = "task-empty";
      const illustration = document.createElement("span");
      illustration.className = "task-empty-illustration";
      illustration.textContent = "✓";
      const heading = document.createElement("strong");
      heading.textContent = "Your Inbox is clear";
      const description = document.createElement("p");
      description.textContent = "Add a thought whenever it pops into your head.";
      empty.append(illustration, heading, description);
      els.inboxTasks.append(empty);
    }
  }

  function renderDays() {
    els.daysRoot.replaceChildren();
    const visible = activeView === "today" || activeView === "one-task" ? 1 : daysVisible;
    for (let offset = 0; offset < visible; offset++) {
      const date = dateAtOffset(offset);
      const key = formatKey(date);
      const allForDay = tasks.filter((t) => t.date === key);
      // Main Thing wins; otherwise the oldest unfinished task is next.
      // Completing it automatically reveals the next available task.
      const dayTasks = activeView === "one-task"
        ? sortTasks(allForDay.filter((t) => !t.completed)).slice(0, 1)
        : sortTasks(matching(allForDay));
      const finished = allForDay.filter((t) => t.completed).length;

      const card = document.createElement("section");
      card.className = "day-card dropzone" + (offset === 0 ? " today" : "");
      card.dataset.date = key;
      card.id = "day-" + key;
      const header = document.createElement("div");
      header.className = "day-header";
      const dateBox = document.createElement("div");
      dateBox.className = "day-date";
      const number = document.createElement("div");
      number.className = "day-number";
      number.textContent = String(date.getDate());
      const month = document.createElement("div");
      month.className = "day-month";
      month.textContent = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date);
      dateBox.append(number, month);

      const info = document.createElement("div");
      const dayName = document.createElement("div");
      dayName.className = "day-name";
      dayName.textContent = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(date);
      if (offset === 0) {
        const todayTag = document.createElement("span");
        todayTag.className = "today-label";
        todayTag.textContent = "Today";
        dayName.append(todayTag);
      }
      const summary = document.createElement("div");
      summary.className = "day-summary";
      if (activeView === "one-task") {
        const remaining = allForDay.filter((t) => !t.completed).length;
        summary.textContent = remaining ? remaining + " " + (remaining === 1 ? "task" : "tasks") + " remaining today" : "All caught up for today";
      } else if (!allForDay.length) {
        summary.textContent = "A little breathing room";
      } else if (finished === allForDay.length) {
        summary.textContent = "All done — well played";
      } else {
        summary.textContent = allForDay.length + " " + (allForDay.length === 1 ? "task" : "tasks") +
          " · " + finished + " completed";
      }
      info.append(dayName, summary);

      const add = document.createElement("button");
      add.type = "button";
      add.className = "day-add";
      add.textContent = "+";
      add.setAttribute("aria-label", "Add task for " + dayName.firstChild.textContent);
      add.addEventListener("click", () => openTask(null, key));

      header.append(dateBox, info, add);
      const stack = document.createElement("div");
      stack.className = "day-tasks" + (!dayTasks.length ? " empty" : "");
      if (!dayTasks.length) {
        const empty = document.createElement("div");
        empty.className = "day-placeholder";
        empty.textContent = activeView === "one-task"
          ? "You\u2019re all caught up. Nothing else to do today."
          : query ? "No matching tasks" : "Nothing planned yet. Leave some room to breathe.";
        stack.append(empty);
      } else {
        dayTasks.forEach((t) => stack.append(makeTaskCard(t)));
      }
      card.append(header, stack);
      els.daysRoot.append(card);
    }
    els.moreDaysButton.hidden = activeView === "today" || activeView === "one-task" || Boolean(query) || daysVisible >= 365;
    if (daysVisible < 365) {
      const additionalDays = Math.min(30, 365 - daysVisible);
      els.moreDaysButton.textContent = "Show another " + additionalDays + " days ↓";
    }
    els.jumpTodayButton.hidden = activeView === "today" || activeView === "one-task";
  }

  function render() {
    rollover();
    renderInbox();
    renderDays();
    const showDemo = tasks.some((task) => task.demo);
    els.demoBanner.hidden = !showDemo;
    document.querySelectorAll("[data-nav]").forEach((button) => {
      const active = button.dataset.nav === activeView;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    document.body.dataset.activeView = activeView;
    updateFocusIndicator();
  }

  function setView(view) {
    activeView = ["planner", "today", "one-task", "inbox"].includes(view) ? view : "planner";
    if (activeView === "one-task") {
      query = "";
      els.searchInput.value = "";
    }
    const labels = {
      planner: ["Planner", "Make room for today", "Everything on your mind, with space to focus on what matters now.", "YOUR SPACE, YOUR PACE"],
      inbox: ["Inbox", "Clear your head", "Capture the little and the big things. Decide when to do them later.", "ROOM FOR EVERY THOUGHT"],
      today: ["Today", "Just focus on today", "No long lists. Only what deserves your attention right now.", "ONE DAY AT A TIME"],
      "one-task": ["One task", "Just one thing at a time", "Your next unfinished task. Complete it and the next one appears.", "A QUIETER WAY TO FOCUS"]
    };
    const [crumb, heading, description, eyebrow] = labels[activeView];
    $("breadcrumb").textContent = crumb;
    $("pageTitle").replaceChildren(document.createTextNode(heading));
    const stop = document.createElement("span");
    stop.className = "full-stop";
    stop.textContent = ".";
    $("pageTitle").append(stop);
    $("pageDescription").textContent = description;
    $("currentDateLabel").textContent = eyebrow;
    $("timelineTitle").textContent = activeView === "today" ? "Your day" : activeView === "one-task" ? "Your next task" : "Your days";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
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
  }

  function openTask(taskId = null, defaultDate = null) {
    const task = taskId ? tasks.find((t) => t.id === taskId) : null;
    if (taskId && !task) return;
    editingId = task ? task.id : null;
    dialogOpener = document.activeElement;
    $("dialogHeading").textContent = task ? "Edit task" : "New task";
    els.taskTitle.value = task ? task.title : "";
    els.taskNotes.value = task ? task.notes : "";
    els.taskMain.checked = task ? task.main : false;
    const date = task ? task.date : defaultDate;
    els.taskDate.value = dateChoiceFor(date);
    els.customDateInput.min = todayKey();
    els.customDateInput.value = date || todayKey();
    updateDateSelector();
    els.deleteTaskButton.hidden = !task;
    els.taskEditorFocusRow.hidden = !task || task.completed;
    $("saveTaskButton").textContent = task ? "Save changes" : "Add task";
    els.taskDialog.showModal();
    els.taskTitle.focus();
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

  function addOrUpdateTask(event) {
    event.preventDefault();
    const title = els.taskTitle.value.trim();
    if (!title) {
      els.taskTitle.focus();
      return;
    }
    const date = chosenDate();
    if (date && date < todayKey()) {
      notify("Choose today or a future day.");
      return;
    }
    let task = editingId ? tasks.find((t) => t.id === editingId) : null;
    if (task) {
      task.title = title;
      task.notes = els.taskNotes.value.trim();
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
    if (task.main && date) {
      tasks.forEach((other) => {
        if (other.id !== task.id && other.date === date) other.main = false;
      });
    }
    persist();
    closeTask();
    render();
    notify(editingId ? "Task updated." : "Task added.");
  }

  function removeTask() {
    if (!editingId) return;
    clearFocusForTask(editingId);
    tasks = tasks.filter((t) => t.id !== editingId);
    persist();
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
    task.rolled = false;
    task.demo = false;
    persist();
    render();
    notify(destination === "inbox" ? "Moved back to Inbox." : "Task scheduled.");
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
      if (id && date) moveTask(id, date);
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
    // Reset first: selecting the same file again should still trigger change.
    field.value = "";
    if (!file) return;
    if (file.size > 2_000_000) {
      notify("That file is too large. Please choose a smaller list.");
      return;
    }
    try {
      const rows = readImportRows(await file.text(), file.name);
      if (!rows.length) {
        notify("No tasks found in that file.");
        return;
      }
      const known = new Set(tasks.map((t) => t.title.trim().toLocaleLowerCase()));
      const timestamp = Date.now();
      let imported = 0;
      let duplicates = 0;
      for (const row of rows) {
        const key = row.title.trim().toLocaleLowerCase();
        if (known.has(key)) {
          duplicates++;
          continue;
        }
        known.add(key);
        tasks.push({
          id: makeId(),
          title: row.title,
          notes: row.notes,
          date: null,
          completed: false,
          main: false,
          rolled: false,
          demo: false,
          createdAt: new Date(timestamp + imported).toISOString()
        });
        imported++;
      }
      if (imported) {
        persist();
        setView("inbox");
      }
      notify(imported
        ? "Imported " + imported + " Inbox " + (imported === 1 ? "task" : "tasks") +
          (duplicates ? " (" + duplicates + " already existed)." : ".")
        : "No new tasks to add — they're already in SimpleDo.");
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
    if (!focusSession) return;
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
    if (!focusSession) return;
    if (focusSession.state === "running" && focusSecondsLeft() === 0) {
      finishFocusSession();
      render();
    }
    updateFocusIndicator();
    updateFocusPanel();
  }

  function wireEvents() {
    $("newTaskButton").addEventListener("click", () => openTask());
    els.importTasksButton.addEventListener("click", () => els.importTasksFile.click());
    els.importTasksFile.addEventListener("change", importTasksFromFile);
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
    $("quickAddForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const field = $("quickTaskInput");
      const title = field.value.trim();
      if (!title) return;
      tasks.push({
        id: makeId(), title, notes: "", date: null, completed: false,
        main: false, rolled: false, demo: false, createdAt: new Date().toISOString()
      });
      field.value = "";
      persist();
      render();
      field.focus();
      notify("Added to Inbox.");
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
      if (activeView === "one-task" && event.target.value.trim()) setView("planner");
      query = event.target.value.trim().toLocaleLowerCase();
      render();
    });
    els.moreDaysButton.addEventListener("click", () => {
      daysVisible = Math.min(daysVisible + 30, 365);
      render();
    });
    els.jumpTodayButton.addEventListener("click", () => {
      if (activeView !== "planner") setView("planner");
      requestAnimationFrame(() =>
        $("day-" + todayKey())?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    });
    $("removeDemoButton").addEventListener("click", () => {
      tasks = tasks.filter((task) => !task.demo);
      try { localStorage.setItem(DEMO_KEY, "true"); } catch (_) { /* unavailable */ }
      persist();
      render();
      notify("Sample tasks removed. Make it your own.");
    });
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "/" && !els.taskDialog.open &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
      ) {
        event.preventDefault();
        els.searchInput.focus();
      }
      if (
        (event.key === "n" || event.key === "N") && !els.taskDialog.open &&
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
      if (event.key === STORAGE_KEY) {
        load();
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

  load();
  loadFocusSession();
  wireEvents();
  setView("planner");
  tickFocus();
  window.setInterval(tickFocus, 1000);
})();
