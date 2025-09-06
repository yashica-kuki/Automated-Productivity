// Function to create a Google Calendar event
const createCalendarEvent = (task, token) => {
  const event = {
    'summary': task.name,
    'start': {
      'dateTime': new Date(task.time).toISOString(),
      'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    'end': {
      'dateTime': new Date(new Date(task.time).getTime() + 60 * 60000).toISOString(),
      'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    'reminders': {
      'useDefault': false,
      'overrides': [
        { 'method': 'popup', 'minutes': 10 },
      ],
    },
  };

  if (task.link) {
      event.location = task.link;
      event.description = `Meeting link: ${task.link}`;
  }

  fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      console.error('Google Calendar API error:', JSON.stringify(data.error));
    } else {
      console.log('Event created:', data.htmlLink);
      // Store the Google Event ID in the local task for reliable sync
      chrome.storage.local.get('tasks', (storageData) => {
        let tasks = storageData.tasks || [];
        let updatedTasks = tasks.map(t => {
          if (t.name === task.name && t.time === task.time) {
            t.googleEventId = data.id;
          }
          return t;
        });
        chrome.storage.local.set({ tasks: updatedTasks });
      });
    }
  })
  .catch(error => {
    console.error('Failed to create Google Calendar event:', error);
  });
};

// Function to handle the authentication and API call
const authenticateAndCreateEvent = (task) => {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) {
      console.error('Authentication failed:', chrome.runtime.lastError.message);
      // If authentication fails, remove any cached token and try again
      chrome.identity.removeCachedAuthToken({ token }, () => {
        chrome.identity.getAuthToken({ interactive: true }, (newToken) => {
          if (newToken) {
            createCalendarEvent(task, newToken);
          } else {
            console.error('Re-authentication failed. Please check permissions.');
          }
        });
      });
    } else {
      createCalendarEvent(task, token);
    }
  });
};

// Function to delete a Google Calendar event
const deleteCalendarEvent = (eventId, token) => {
  fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer ' + token,
    },
  })
  .then(response => {
    if (response.ok) {
      console.log(`Event with ID ${eventId} deleted from Google Calendar.`);
    } else {
      console.error('Failed to delete Google Calendar event:', response.statusText);
    }
  })
  .catch(error => {
    console.error('Failed to delete Google Calendar event:', error);
  });
};

// Function to sync from Google Calendar to the extension
const syncWithCalendar = () => {
  console.log("Syncing with Google Calendar...");
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    if (chrome.runtime.lastError || !token) {
      console.log("Could not get auth token for sync. User may need to log in again.");
      return;
    }

    const syncTime = new Date(new Date().getTime() - 1000 * 60 * 60 * 24 * 7).toISOString(); // Fetch events from the last 7 days

    const listEventsUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${syncTime}&orderBy=updated&singleEvents=true`;

    fetch(listEventsUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
      },
    })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        console.error('Sync error:', JSON.stringify(data.error));
        return;
      }
      
      const calendarEvents = data.items || [];
      chrome.storage.local.get('tasks', (storageData) => {
        let tasks = storageData.tasks || [];
        
        // Add or update tasks from Google Calendar
        calendarEvents.forEach(event => {
          // Use the Google Event ID for reliable matching
          const existingTaskIndex = tasks.findIndex(task => task.googleEventId === event.id);
          
          const newOrUpdatedTask = {
            name: event.summary,
            time: event.start.dateTime,
            link: event.location || '',
            googleEventId: event.id, // Store the unique ID
            completed: false,
          };
          
          if (existingTaskIndex > -1) {
            tasks[existingTaskIndex] = newOrUpdatedTask;
          } else {
            tasks.push(newOrUpdatedTask);
          }
        });

        chrome.storage.local.set({ tasks });
      });
    });
  });
};

// Create a periodic alarm for syncing
chrome.alarms.create("calendarSyncAlarm", {
  periodInMinutes: 5 // Sync every 5 minutes
});

// Handle the sync alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "calendarSyncAlarm") {
    syncWithCalendar();
  }
});

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId.startsWith("meeting_notification_")) {
    const taskTime = notificationId.replace("meeting_notification_", "");
    
    // Check which button was clicked (0 is the first button)
    if (buttonIndex === 0) { // Open Meeting
      chrome.storage.local.get('tasks', (data) => {
        let tasks = data.tasks || [];
        const task = tasks.find(t => t.time === taskTime);
        if (task && task.link) {
          chrome.tabs.create({ url: task.link });
        }
      });
    }
    
    // Clear the notification in either case
    chrome.notifications.clear(notificationId);
    
    // Also, clear the task alarm if the user cancels
    if (buttonIndex === 1) { // Cancel
        chrome.alarms.clear("task_" + taskTime);
    }
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startTimer") {
    let { tabId, minutes } = msg;
    let alarmName = "timer_" + tabId;
    
    // Create an alarm with the specified delay
    chrome.alarms.create(alarmName, { delayInMinutes: minutes });
    
    // Store the tabId persistently in storage using the alarm name as the key
    chrome.storage.local.set({ [alarmName]: tabId }, () => {
      console.log(`Timer started for tabId: ${tabId}, with alarm name: ${alarmName}`);
    });
  }

  if (msg.action === "addTask") {
    chrome.storage.local.get('tasks', (data) => {
        let tasks = data.tasks || [];
        const newTask = msg.task;
        const existingTask = tasks.find(task => task.time === newTask.time);
        let message = "Task added successfully.";

        if (existingTask) {
          tasks = tasks.filter(task => task.time !== newTask.time);
          message = "Task replaced successfully.";
        }
        
        tasks.push(newTask);
        chrome.storage.local.set({ tasks });
        sendResponse({ message });

        let taskTime = new Date(newTask.time).getTime();
        let now = Date.now();
        let minutesUntil = (taskTime - now) / 60000;

        if (minutesUntil > 0) {
            // New Notification alarm (2 minutes before meeting)
            if (minutesUntil > 2) {
                chrome.alarms.create("meeting_notification_" + newTask.time, { delayInMinutes: minutesUntil - 2 });
            }
            // Add a separate alarm to open the link at the scheduled time
            chrome.alarms.create("task_" + newTask.time, { delayInMinutes: minutesUntil });
        }
        
        authenticateAndCreateEvent(newTask);
    });
    return true;
  }
  
  if (msg.action === "syncCalendar") {
      syncWithCalendar();
  }

  if (msg.action === "deleteTask") {
    chrome.storage.local.get('tasks', (data) => {
      let tasks = data.tasks || [];
      if (msg.index !== undefined && msg.index < tasks.length) {
        const taskToDelete = tasks[msg.index];
        if (taskToDelete.googleEventId) {
          chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (token) {
              deleteCalendarEvent(taskToDelete.googleEventId, token);
            } else {
              console.error('Could not get token to delete event from Google Calendar.');
            }
          });
        }
        tasks.splice(msg.index, 1);
        chrome.storage.local.set({ tasks });
      }
    });
  }

  if (msg.action === "completeTask") {
    chrome.storage.local.get('tasks', (data) => {
      let tasks = data.tasks || [];
      if (msg.index !== undefined && msg.index < tasks.length) {
        tasks[msg.index].completed = !tasks[msg.index].completed;
        tasks.sort((a, b) => a.completed - b.completed);
        chrome.storage.local.set({ tasks });
      }
    });
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("timer_")) {
    chrome.storage.local.get(alarm.name, (data) => {
      let tabId = data[alarm.name];
      if (tabId) {
        // Get the tab's URL and title to save it for later restoration
        chrome.tabs.get(tabId, (tab) => {
          if (tab && tab.url) {
            chrome.storage.local.set({ closedTabUrl: tab.url, closedTabTitle: tab.title });
            // Create a notification for the user
            chrome.notifications.create({
              type: "basic",
              iconUrl: "icon.png",
              title: "Time's up!",
              message: `The timer for a tab has ended. Tab closed.`,
              priority: 2
            });
          }
          // Now, remove the tab
          try {
            chrome.tabs.remove(tabId);
          } catch (error) {
            console.error(`Failed to close tab with tabId: ${tabId}. Error: ${error.message}`);
          }
        });
        chrome.storage.local.remove(alarm.name);
      }
    });
  }
  
  // New handler for meeting notifications
  if (alarm.name.startsWith("meeting_notification_")) {
    const taskTime = alarm.name.replace("meeting_notification_", "");
    chrome.storage.local.get('tasks', (data) => {
      const tasks = data.tasks || [];
      const task = tasks.find(t => t.time === taskTime);
      if (task) {
        chrome.notifications.create("meeting_notification_" + taskTime, {
          type: "basic",
          iconUrl: "icon.png",
          title: "Upcoming Meeting",
          message: `Your meeting "${task.name}" is starting in 2 minutes.`,
          buttons: [
            { title: "Open Meeting" },
            { title: "Cancel" }
          ],
          priority: 2
        });
      }
    });
  }
  
  // New handler to open the link at the scheduled time
  if (alarm.name.startsWith("task_")) {
    const taskTime = alarm.name.replace("task_", "");
    chrome.storage.local.get('tasks', (data) => {
        let tasks = data.tasks || [];
        let task = tasks.find(t => t.time === taskTime);
        if (task && task.link) {
            chrome.tabs.create({ url: task.link });
        }
    });
  }
});