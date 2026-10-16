"use strict";

(() => {
  const STORAGE_KEY = "simpledo.tasks.v1";
  const DEMO_KEY = "simpledo.demoRemoved.v1";
  const $ = (id) => document.getElementById(id);
  const els = {
    inboxTasks: $("inboxTasks"),
    daysRoot: $("daysRoot"),
    inboxCount: $("inboxCount"),
    sidebarInboxCount: $("sidebarInboxCount"),
    taskDialog: $("taskDialog"),
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
  let daysVisible = 7;
  let query = "";
  let editingId = null;
  let dialogOpener = null;
  let draggedId = null;
  let toastTimeout = null;

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

    card.append(check, body, edit);
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
    const visible = activeView === "today" ? 1 : daysVisible;
    for (let offset = 0; offset < visible; offset++) {
      const date = dateAtOffset(offset);
      const key = formatKey(date);
      const dayTasks = sortTasks(matching(tasks.filter((t) => t.date === key)));
      const allForDay = tasks.filter((t) => t.date === key);
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
      if (!allForDay.length) {
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
        empty.textContent = query ? "No matching tasks" : "Nothing planned yet. Leave some room to breathe.";
        stack.append(empty);
      } else {
        dayTasks.forEach((t) => stack.append(makeTaskCard(t)));
      }
      card.append(header, stack);
      els.daysRoot.append(card);
    }
    els.moreDaysButton.hidden = activeView === "today" || Boolean(query);
    els.jumpTodayButton.hidden = activeView === "today";
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
  }

  function setView(view) {
    activeView = ["planner", "today", "inbox"].includes(view) ? view : "planner";
    const labels = {
      planner: ["Planner", "Make room for today", "Everything on your mind, with space to focus on what matters now.", "YOUR SPACE, YOUR PACE"],
      inbox: ["Inbox", "Clear your head", "Capture the little and the big things. Decide when to do them later.", "ROOM FOR EVERY THOUGHT"],
      today: ["Today", "Just focus on today", "No long lists. Only what deserves your attention right now.", "ONE DAY AT A TIME"]
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
    $("timelineTitle").textContent = activeView === "today" ? "Your day" : "Your days";
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

  function wireEvents() {
    $("newTaskButton").addEventListener("click", () => openTask());
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
      query = event.target.value.trim().toLocaleLowerCase();
      render();
    });
    els.moreDaysButton.addEventListener("click", () => {
      daysVisible = Math.min(daysVisible + 7, 365);
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
      if (!document.hidden) render();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) {
        load();
        render();
      }
    });
    bindDragDrop();
  }

  load();
  wireEvents();
  setView("planner");
})();
