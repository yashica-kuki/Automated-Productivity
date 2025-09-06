// Function to handle tab switching
const setupTabs = () => {
  const tabs = document.querySelectorAll('.tab-button');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Get the ID of the tab to show from the data-tab attribute
      const tabId = tab.getAttribute('data-tab');

      // Deactivate all tabs and hide all content
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // Activate the clicked tab and show its content
      document.getElementById(tabId).classList.add('active');
      tab.classList.add('active');
    });
  });
};

// Function to update the task list UI from storage
const renderTasks = () => {
  const taskList = document.getElementById("taskList");
  taskList.innerHTML = '';
  chrome.storage.local.get('tasks', (data) => {
    let tasks = data.tasks || [];
    // Sort tasks: uncompleted first, then completed
    tasks.sort((a, b) => a.completed - b.completed);

    if (tasks.length === 0) {
      taskList.innerHTML = '<li style="font-style: italic; color: #777;">No tasks scheduled.</li>';
    } else {
      tasks.forEach((task, index) => {
        let li = document.createElement("li");
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '10px';
        // Add the cut line and reduce opacity if the task is completed
        li.style.textDecoration = task.completed ? 'line-through' : 'none';
        li.style.opacity = task.completed ? '0.6' : '1';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.addEventListener('change', () => {
          chrome.runtime.sendMessage({
            action: "completeTask",
            index: index
          });
        });
        li.appendChild(checkbox);

        const taskText = document.createElement('span');
        taskText.textContent = `${task.name} @ ${new Date(task.time).toLocaleString()}`;
        li.appendChild(taskText);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.style.marginLeft = 'auto';
        deleteButton.addEventListener('click', () => {
          chrome.runtime.sendMessage({
            action: "deleteTask",
            index: index
          });
        });
        li.appendChild(deleteButton);

        taskList.appendChild(li);
      });
    }
  });
};

// Start timer for current website
document.getElementById("startTimer").addEventListener("click", async () => {
  let minutes = parseInt(document.getElementById("timerMinutes").value);
  if (!minutes || minutes <= 0) {
    document.getElementById("timerMessage").textContent = "Please enter a positive number of minutes.";
    return;
  }
  document.getElementById("timerMessage").textContent = ""; // Clear message

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const endTime = Date.now() + minutes * 60000;
  chrome.storage.local.set({ timerEndTime: endTime });
  
  chrome.runtime.sendMessage({ action: "startTimer", tabId: tab.id, minutes });
  
  startTimerDisplay(endTime);
});

// Function to start the timer countdown display
function startTimerDisplay(endTime) {
  const timerDisplay = document.getElementById("timerDisplay");
  const intervalId = setInterval(() => {
    const timeLeft = endTime - Date.now();
    if (timeLeft <= 0) {
      clearInterval(intervalId);
      timerDisplay.textContent = "Time's up!";
      return;
    }

    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    timerDisplay.textContent = `Time left: ${minutes}m ${seconds}s`;
  }, 1000);
}

// Add task
document.getElementById("addTask").addEventListener("click", () => {
  let taskName = document.getElementById("taskName").value;
  let taskTime = document.getElementById("taskTime").value;
  let taskLink = document.getElementById("taskLink").value;
  const schedulerMessage = document.getElementById("schedulerMessage");

  if (!taskName || !taskTime) {
    schedulerMessage.textContent = "Task name and time are required.";
    return;
  }
  schedulerMessage.textContent = ""; // Clear message

  // Send a message to the background script to handle adding the task
  chrome.runtime.sendMessage({
    action: "addTask",
    task: { name: taskName, time: taskTime, link: taskLink, completed: false }
  }, (response) => {
    if (response && response.message) {
      schedulerMessage.textContent = response.message;
    }
    // Clear input fields after the task has been processed
    document.getElementById("taskName").value = '';
    document.getElementById("taskTime").value = '';
    document.getElementById("taskLink").value = '';
  });
});

// Manually trigger a sync with Google Calendar
document.getElementById("syncCalendarButton").addEventListener("click", () => {
    const schedulerMessage = document.getElementById("schedulerMessage");
    schedulerMessage.textContent = "Syncing with Google Calendar...";
    chrome.runtime.sendMessage({ action: "syncCalendar" }, () => {
        schedulerMessage.textContent = "Sync complete.";
    });
});

// Summarize document using the Gemini API
document.getElementById("summarizeDoc").addEventListener("click", async () => {
  const summaryResult = document.getElementById("summaryResult");
  summaryResult.innerText = "Summarizing with Gemini AI...";

  // Replace with your actual Gemini API Key
  const API_KEY = "AIzaSyD3txTEBjDLVkncKPEOEkECstpHBzBwppo";
  const MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Use a different function to get selected text or full page text
  const getPageText = (tabId) => {
    return new Promise((resolve) => {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const selection = window.getSelection().toString();
          return selection.length > 0 ? selection : document.body.innerText;
        },
      }, (results) => {
        resolve(results[0].result);
      });
    });
  };

  const textToSummarize = await getPageText(tab.id);
    
  if (!textToSummarize || textToSummarize.trim().length === 0) {
    summaryResult.innerText = "Could not find any text to summarize on this page.";
    return;
  }

  const prompt = `Please provide a concise summary of the following text. The summary should be a few paragraphs long and capture the main points:\n\n${textToSummarize}`;
  
  fetch(MODEL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    })
  })
  .then(response => {
    if (!response.ok) {
      return response.json().then(errorData => {
        throw new Error(`API error: ${JSON.stringify(errorData)}`);
      });
    }
    return response.json();
  })
  .then(data => {
    if (data.candidates && data.candidates.length > 0) {
      const summary = data.candidates[0].content.parts[0].text;
      summaryResult.innerText = summary;
    } else {
      summaryResult.innerText = "Failed to generate a summary.";
    }
  })
  .catch(error => {
    console.error("Error with Gemini API:", error);
    summaryResult.innerText = "An error occurred with the AI summarizer. Please check your API key and permissions.";
  });
});

// Listen for changes in the local storage and re-render the tasks if the 'tasks' key is updated
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.tasks) {
    renderTasks();
  }
});

// Check for and handle restoring the last closed tab
const restoreLastClosedTab = () => {
  const restoreContainer = document.getElementById("restoreContainer");
  const restoreButton = document.getElementById("restoreTabButton");
  const restoreMessage = document.getElementById("restoreMessage");

  chrome.storage.local.get(['closedTabUrl', 'closedTabTitle'], (data) => {
    if (data.closedTabUrl) {
      restoreContainer.style.display = 'block';
      const urlTitle = data.closedTabTitle ? `"${data.closedTabTitle}"` : "the last tab";
      restoreMessage.textContent = `A timer has closed ${urlTitle}.`;
      restoreButton.addEventListener('click', () => {
        chrome.tabs.create({ url: data.closedTabUrl });
        // Clear the stored URL after restoring
        chrome.storage.local.remove(['closedTabUrl', 'closedTabTitle']);
        restoreContainer.style.display = 'none';
      });
    }
  });
};

// Delete completed tasks when the popup UI closes
window.addEventListener('unload', () => {
  chrome.storage.local.get('tasks', (data) => {
    let tasks = data.tasks || [];
    // Filter out completed tasks
    const updatedTasks = tasks.filter(task => !task.completed);
    chrome.storage.local.set({ tasks: updatedTasks });
  });
});

// Initial setup when the popup opens
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  renderTasks();
  chrome.storage.local.get('timerEndTime', (data) => {
    if (data.timerEndTime) {
      startTimerDisplay(data.timerEndTime);
    }
  });
  restoreLastClosedTab();
});