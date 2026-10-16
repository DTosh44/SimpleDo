# SimpleDo

A quiet, minimal task planner that starts with an Inbox and gives the right work the right day.

**Visual style:** black-and-white with restrained colour accents — a narrow multicolour stripe and selective pink, blue, and violet cues. No green UI theme.

## Try the preview

**GitHub Pages:** https://dtosh44.github.io/SimpleDo/

GitHub Pages must be enabled once in this repository. Go to **Settings → Pages**. Under **Build and deployment**, select **Deploy from a branch**, choose **main** and **/(root)**, then press **Save**. GitHub may take a few minutes to publish the first deployment.

To test locally, open \`index.html\` in a browser after downloading the repository. There is no build process or package installation.

## What works

- Quick-capture Inbox for unscheduled tasks
- 30-day rolling planner on the left, with additional 30-day periods on demand (up to 365 days)
- Inbox on the right in desktop Planner view
- **One task** focus view below Today, showing the Main Thing or first unfinished task for today (the next appears when completed)
- Add, edit, delete, complete, and reschedule tasks
- Drag a task onto a date or back to the Inbox (desktop)
- Task editing/scheduling on mobile
- Highlight one **Main Thing** per date
- Automatic return of unfinished past tasks to Inbox
- Instant task search
- Save tasks in this browser's local storage
- Sample tasks for first-time exploration, which you can remove

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
