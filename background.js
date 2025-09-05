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
    // Retrieve tasks from storage, add the new task, and save back
    chrome.storage.local.get('tasks', (data) => {
        let tasks = data.tasks || [];
        const newTask = msg.task;
        const existingTask = tasks.find(task => task.time === newTask.time);
        let message = "Task added successfully.";

        if (existingTask) {
          // If a task with the same time exists, replace it
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
            // Notification alarm (1 min before meeting)
            if (minutesUntil > 1) {
                chrome.alarms.create("notify_" + newTask.time, { delayInMinutes: minutesUntil - 1 });
            }
            // Open link at exact time
            chrome.alarms.create("task_" + newTask.time, { delayInMinutes: minutesUntil });
        }
    });
    return true; // Keep the message channel open for sendResponse
  }

  if (msg.action === "deleteTask") {
    chrome.storage.local.get('tasks', (data) => {
      let tasks = data.tasks || [];
      if (msg.index !== undefined && msg.index < tasks.length) {
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
        // Sort tasks to move completed ones to the bottom
        tasks.sort((a, b) => a.completed - b.completed);
        chrome.storage.local.set({ tasks });
      }
    });
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("timer_")) {
    // Retrieve the tabId from persistent storage
    chrome.storage.local.get(alarm.name, (data) => {
      let tabId = data[alarm.name];
      if (tabId) {
        try {
          chrome.tabs.remove(tabId);
          console.log(`Successfully closed tab with tabId: ${tabId}`);
        } catch (error) {
          console.error(`Failed to close tab with tabId: ${tabId}. Error: ${error.message}`);
        }
        // Clean up the storage entry after the timer is complete
        chrome.storage.local.remove(alarm.name);
      } else {
        console.log(`No valid tabId found in storage for alarm: ${alarm.name}`);
      }
    });
  }

  if (alarm.name.startsWith("notify_")) {
    // Get all tasks from storage to find the one that matches
    chrome.storage.local.get('tasks', (data) => {
        let tasks = data.tasks || [];
        let task = tasks.find(t => "notify_" + t.time === alarm.name);
        if (task) {
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon.png",
                title: "Upcoming Meeting",
                message: `Your meeting "${task.name}" starts in 1 minute.`,
                priority: 2
            });
        }
    });
  }

  if (alarm.name.startsWith("task_")) {
    // Get all tasks from storage
    chrome.storage.local.get('tasks', (data) => {
        let tasks = data.tasks || [];
        let task = tasks.find(t => "task_" + t.time === alarm.name);
        if (task && task.link) {
            chrome.tabs.create({ url: task.link });
        }
    });
  }
});