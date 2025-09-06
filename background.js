// --- Globals & Constants ---
const GEMINI_API_KEY = "AIzaSyBE5ix4UL05HnIp5xreP5OkoALNIdQajbg";

// --- Google Docs & Auth Functions ---
const createGoogleDoc = (title, summary, token, sendResponse) => {
  const doc = {
    title: `Summary of "${title}"`,
  };

  fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(doc)
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      console.error('Google Docs API error:', data.error);
      sendResponse({ success: false, message: `Error: ${data.error.message}` });
      return;
    }
    const documentId = data.documentId;
    const requests = [{
      insertText: {
        location: { index: 1 },
        text: summary
      }
    }];
    return fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    });
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      console.error('Google Docs API update error:', data.error);
      sendResponse({ success: false, message: `Error updating doc: ${data.error.message}` });
    } else {
      console.log('Document created:', data);
      sendResponse({ success: true, message: "Successfully saved to Google Docs!" });
    }
  })
  .catch(error => {
    console.error('Failed to create Google Doc:', error);
    sendResponse({ success: false, message: "Failed to create Google Doc." });
  });
};

// --- Google Calendar & Auth Functions ---
const createCalendarEvent = (task, token) => {
  const event = {
    'summary': task.name,
    'start': { 'dateTime': new Date(task.time).toISOString(), 'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone },
    'end': { 'dateTime': new Date(new Date(task.time).getTime() + 60 * 60000).toISOString(), 'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone },
    'reminders': { 'useDefault': false, 'overrides': [{ 'method': 'popup', 'minutes': 10 }] },
  };
  if (task.link) {
    event.location = task.link;
    event.description = `Meeting link: ${task.link}`;
  }

  fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) return console.error('Google Calendar API error:', data.error);
    console.log('Event created:', data.htmlLink);
    chrome.storage.local.get('tasks', (storageData) => {
      let tasks = storageData.tasks || [];
      let updatedTasks = tasks.map(t => {
        if (t.id === task.id) t.googleEventId = data.id;
        return t;
      });
      chrome.storage.local.set({ tasks: updatedTasks });
    });
  })
  .catch(error => console.error('Failed to create Google Calendar event:', error));
};

const authenticateAndCreateEvent = (task) => {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) return console.error('Authentication failed:', chrome.runtime.lastError?.message);
    createCalendarEvent(task, token);
  });
};

const deleteCalendarEvent = (eventId, token) => {
  if (!eventId) return;
  fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token },
  })
  .then(response => {
    if (response.ok) {
      console.log(`Event with ID ${eventId} deleted.`);
    } else {
      console.error('Failed to delete Google Calendar event:', response.statusText);
    }
  })
  .catch(error => console.error('Error deleting event:', error));
};

const syncWithCalendar = (sendResponse) => {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) {
        console.error("Could not get auth token for sync:", chrome.runtime.lastError.message);
        sendResponse({ success: false, message: "Sync failed: Could not log in." });
        return;
    }
    const syncTime = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString();
    const listEventsUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${syncTime}&orderBy=updated&singleEvents=true`;

    fetch(listEventsUrl, { method: 'GET', headers: { 'Authorization': 'Bearer ' + token } })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        console.error('Sync error:', data.error);
        sendResponse({ success: false, message: `Sync failed: ${data.error.message}` });
        return;
      }
      const calendarEvents = data.items || [];
      chrome.storage.local.get('tasks', (storageData) => {
        let tasks = storageData.tasks || [];
        calendarEvents.forEach(event => {
          const existingTaskIndex = tasks.findIndex(task => task.googleEventId === event.id);
          const newOrUpdatedTask = {
            id: `task_${event.id}`,
            name: event.summary,
            time: event.start.dateTime,
            link: event.location || '',
            googleEventId: event.id,
            completed: false,
          };
          if (existingTaskIndex > -1) tasks[existingTaskIndex] = newOrUpdatedTask;
          else tasks.push(newOrUpdatedTask);
        });
        chrome.storage.local.set({ tasks }, () => {
          sendResponse({ success: true, message: "Sync successful!" });
        });
      });
    })
    .catch(error => {
      console.error("Fetch error during sync:", error);
      sendResponse({ success: false, message: "Sync failed: Network error." });
    });
  });
};


// --- Alarms & Listeners ---
chrome.alarms.create("calendarSyncAlarm", { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "calendarSyncAlarm") {
    syncWithCalendar(() => {}); // Background sync doesn't need to send a response
  } else if (alarm.name.startsWith("timer_")) {
    const tabId = parseInt(alarm.name.split("_")[1], 10);
    chrome.tabs.get(tabId, (tab) => {
      if (tab && tab.url) {
        chrome.storage.local.set({ closedTabUrl: tab.url, closedTabTitle: tab.title });
        chrome.notifications.create({
          type: "basic", iconUrl: "icon.png",
          title: "Time's Up!", message: `The timer for "${tab.title}" has ended.`
        });
        chrome.tabs.remove(tabId);
      }
    });
  } else if (alarm.name.startsWith("notification_")) {
    const taskId = alarm.name.split("_")[1];
    chrome.storage.local.get('tasks', (data) => {
      const task = (data.tasks || []).find(t => t.id === `task_${taskId}`);
      if (task) {
        chrome.notifications.create(`notification_${task.id}`, {
          type: "basic", iconUrl: "icon.png",
          title: "Upcoming Task", message: `Your task "${task.name}" is scheduled now.`,
          buttons: task.link ? [{ title: "Open Link" }, { title: "Dismiss" }] : []
        });
      }
    });
  }
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId.startsWith("notification_") && buttonIndex === 0) {
    const taskId = notificationId.split("_")[1];
    chrome.storage.local.get('tasks', (data) => {
      const task = (data.tasks || []).find(t => t.id === `task_${taskId}`);
      if (task && task.link) chrome.tabs.create({ url: task.link });
    });
    chrome.notifications.clear(notificationId);
  }
});


// In demo-CYHI/background.js

// --- Central Message Handler ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "startTimer":
      chrome.alarms.create(`timer_${request.tabId}`, { delayInMinutes: request.minutes });
      break;

    case "addTask":
      chrome.storage.local.get({ tasks: [] }, (data) => {
        const newTaskId = Date.now();
        const newTask = { ...request.task, id: `task_${newTaskId}` };
        chrome.storage.local.set({ tasks: [...data.tasks, newTask] }, () => {
          authenticateAndCreateEvent(newTask);
          sendResponse({ message: "Task added." });
        });
      });
      return true;

    case "completeTask":
    case "deleteTask":
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          return console.error("Could not get token to delete event:", chrome.runtime.lastError.message);
        }
        if (request.task.googleEventId) {
          deleteCalendarEvent(request.task.googleEventId, token);
        }
      });
      // If deleting, also remove from storage
      if (request.action === 'deleteTask' || request.action === 'completeTask') {
          chrome.storage.local.get({ tasks: [] }, (data) => {
              const newTasks = data.tasks.filter(t => t.id !== request.task.id);
              chrome.storage.local.set({ tasks: newTasks });
          });
      }
      break;

    case "summarizeText":
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `Summarize this text: ${request.text}` }] }] })
      })
      .then(response => response.json())
      .then(data => sendResponse({ summary: data?.candidates?.[0]?.content?.parts?.[0]?.text || "Summary not available." }))
      .catch(error => sendResponse({ summary: "Error generating summary." }));
      return true;
      
    case "saveSummaryToDocs":
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          sendResponse({ success: false, message: "Authentication failed." });
          return;
        }
        createGoogleDoc(request.title, request.summary, token, sendResponse);
      });
      return true;

    case "syncCalendar":
      syncWithCalendar(sendResponse);
      return true;
      
    case "restoreTab":
      if (request.url) chrome.tabs.create({ url: request.url });
      break;
  }
  return true;
});