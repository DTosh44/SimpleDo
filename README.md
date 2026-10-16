# SimpleDo

A quiet, minimal task planner that starts with an Inbox and gives the right work the right day.

**Visual style:** black-and-white with restrained colour accents — a narrow multicolour stripe and selective pink, blue, and violet cues. No green UI theme.

## Try the preview

**GitHub Pages:** https://dtosh44.github.io/SimpleDo/

GitHub Pages must be enabled once in this repository. Go to **Settings → Pages**. Under **Build and deployment**, select **Deploy from a branch**, choose **main** and **/(root)**, then press **Save**. GitHub may take a few minutes to publish the first deployment.

To test locally, open \`index.html\` in a browser after downloading the repository. There is no build process or package installation.

## What works

- Quick-capture Inbox for unscheduled tasks
- Local bulk import into Inbox from a `.json`, `.md`, or `.txt` file; duplicate task titles are skipped
- 30-day rolling planner on the left, with additional 30-day periods on demand (up to 365 days)
- Inbox on the right in desktop Planner view
- **One task** focus view below Today, showing the Main Thing or first unfinished task for today (the next appears when completed)
- **Start task** Pomodoro-style timer for each unfinished task: adjustable focus length (25 minutes default), pause/resume, optional 5-minute break, and explicit task completion
- Add, edit, delete, complete, and reschedule tasks
- Drag a task onto a date or back to the Inbox (desktop)
- Task editing/scheduling on mobile
- Highlight one **Main Thing** per date
- Automatic return of unfinished past tasks to Inbox
- Instant task search
- Save tasks in this browser's local storage
- Sample tasks for first-time exploration, which you can remove

## Focus timer

Choose **Start** on an unfinished task (or open the task and select **Start task with a focus timer**). Pick a duration of 10, 15, 20, 25, 30, 45 or 60 minutes, or a custom duration from 1 to 180 minutes. The default is the traditional **25-minute Pomodoro**, and each task remembers the last duration you chose.

The timer appears at the top of the app **and in the browser tab title** (for example, `24:36 · SimpleDo`). When paused, the tab shows the paused time; when finished, it shows a completion label; and after ending the session, it returns to the normal SimpleDo title. The timer can be paused or resumed, and keeps its place when the timer window is closed or the page is refreshed. Only one timer runs at once. When a session finishes, you can start another, take an optional 5-minute break, or mark the task complete. **Running out of time never automatically marks a task done.**

The timer uses browser-local data and an end timestamp. It is not a background service; it will show that time has elapsed when you return, but it cannot deliver notifications if the website is closed.

## Importing a task list

1. Open SimpleDo and select **Inbox** (or use the Inbox panel in Planner).
2. Click **Import tasks** underneath the quick-add field.
3. Choose a SimpleDo JSON file or a Markdown/plain-text list.
4. The importer creates one unscheduled Inbox task per unique item, without deleting or changing any existing tasks.

JSON can be `{"tasks":[{"title":"Task name","notes":"Optional details"}]}` or an array of task names. Imports happen only inside your own browser; the file and tasks are **never uploaded** to GitHub or to another server. Re-importing the same file won't create duplicates.

## Important limitations

This is an early **browser-only prototype**. There is no account, cloud sync, shared data, reminders, AI assistance, or calendar integration. Tasks are private to the current browser profile and device, and clearing website data may remove them. Export/backup is not included yet. Avoid storing irreplaceable task data in this version.

The source repository and preview are public; your entered tasks are not stored in the repository or sent to a server.

## Technology

Plain HTML, CSS, and JavaScript. No dependencies, no cookies, no external trackers, no build tool.

## Project goals

1. Make capturing tasks effortless.
2. Keep future work out of the way until its day.
3. Return unfinished tasks to Inbox rather than creating an overdue pile.
4. Help people focus on what matters today.

## Suggested next features

- Task export/import and optional account sync
- Reordering tasks within each day
- Date navigation and history
- Reminder and recurring task support
- Calendar-aware scheduling
