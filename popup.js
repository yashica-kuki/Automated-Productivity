// Function to handle tab switching
const setupTabs = () => {
  const tabs = document.querySelectorAll('.tab-button');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Deactivate all tabs and hide all content
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // Activate the clicked tab and show its content
      const tabId = tab.getAttribute('data-tab');
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
            // Pass the unique task object, not a volatile index
            task: task
          });
        });
        li.appendChild(checkbox);

        const taskText = document.createElement('span');
        // FIX: Correctly use template literal with backticks
        taskText.textContent = `${task.name} @ ${new Date(task.time).toLocaleString()}`;
        li.appendChild(taskText);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.style.marginLeft = 'auto';
        deleteButton.addEventListener('click', () => {
          chrome.runtime.sendMessage({
            action: "deleteTask",
            // Pass the unique task object, not a volatile index
            task: task
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
  if (!timerDisplay) return; // Add a safeguard
  const intervalId = setInterval(() => {
    const timeLeft = endTime - Date.now();
    if (timeLeft <= 0) {
      clearInterval(intervalId);
      timerDisplay.textContent = "Time's up!";
      return;
    }

    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    // FIX: Correctly use template literal with backticks
    timerDisplay.textContent = `Time left: ${minutes}m ${seconds}s`;
  }, 1000);
}

// Add task
document.getElementById("addTask").addEventListener("click", () => {
  let taskName = document.getElementById("taskName").value.trim();
  let taskTime = document.getElementById("taskTime").value;
  let taskLink = document.getElementById("taskLink").value.trim();
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

// Summarize document
document.getElementById("summarizeDoc").addEventListener("click", async () => {
  const summaryResult = document.getElementById("summaryResult");
  summaryResult.innerText = "Summarizing...";

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body.innerText
  }, (results) => {
    const text = results[0]?.result;

    if (!text || text.trim().length === 0) {
      summaryResult.innerText = "Could not find any text to summarize on this page.";
      return;
    }

    // A simple, direct summarization function that takes a percentage of sentences.
    const sentences = text.split(/[.?!]\s*/);
    const summaryLength = Math.max(5, Math.floor(sentences.length * 0.20)); // Take 20% of sentences, but at least 5

    let summary = sentences.slice(0, summaryLength).join(". ") + (sentences.length > summaryLength ? "." : "");

    summaryResult.innerText = summary;
  });
});

// Listen for changes in the local storage and re-render the tasks if the 'tasks' key is updated
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.tasks) {
    renderTasks();
  }
});

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
});