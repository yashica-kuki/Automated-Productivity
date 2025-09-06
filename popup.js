// --- Globals ---
let timerIntervalId = null;

// --- UI Setup & Rendering ---
const setupTabs = () => {
  const tabs = document.querySelectorAll('.tab-button');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      const tabId = tab.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
      tab.classList.add('active');
    });
  });
};

const renderTasks = () => {
  const taskList = document.getElementById("taskList");
  taskList.innerHTML = '';
  chrome.storage.local.get('tasks', (data) => {
    let tasks = data.tasks || [];
    tasks.sort((a, b) => a.completed - b.completed || new Date(a.time) - new Date(b.time));

    if (tasks.length === 0) {
      taskList.innerHTML = '<li>No tasks scheduled.</li>';
    } else {
      tasks.forEach((task, index) => {
        let li = document.createElement("li");
        li.className = task.completed ? 'completed' : '';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.addEventListener('change', () => {
          tasks[index].completed = checkbox.checked;
          chrome.storage.local.set({ tasks });
        });
        const taskText = document.createElement('span');
        taskText.textContent = `${task.name} @ ${new Date(task.time).toLocaleString()}`;
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: "deleteTask", task: tasks[index] });
          tasks.splice(index, 1);
          chrome.storage.local.set({ tasks });
        });
        li.appendChild(checkbox);
        li.appendChild(taskText);
        li.appendChild(deleteButton);
        taskList.appendChild(li);
      });
    }
  });
};

const restoreLastClosedTab = () => {
  const restoreContainer = document.getElementById("restoreContainer");
  const restoreButton = document.getElementById("restoreTabButton");
  const restoreMessage = document.getElementById("restoreMessage");
  chrome.storage.local.get(['closedTabUrl', 'closedTabTitle'], (data) => {
    if (data.closedTabUrl) {
      restoreContainer.style.display = 'block';
      restoreMessage.textContent = `A timer has closed "${data.closedTabTitle || 'a tab'}".`;
      restoreButton.onclick = () => {
        chrome.runtime.sendMessage({ action: "restoreTab", url: data.closedTabUrl });
        chrome.storage.local.remove(['closedTabUrl', 'closedTabTitle']);
        restoreContainer.style.display = 'none';
      };
    }
  });
};


// --- Action Handlers ---
function startTimerDisplay(endTime) {
  if (timerIntervalId) clearInterval(timerIntervalId);
  const timerDisplay = document.getElementById("timerDisplay");
  timerIntervalId = setInterval(() => {
    const timeLeft = endTime - Date.now();
    if (timeLeft <= 0) {
      clearInterval(timerIntervalId);
      timerDisplay.textContent = "Time's up!";
      return;
    }
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    timerDisplay.textContent = `Time left: ${minutes}m ${seconds}s`;
  }, 1000);
}

const handleStartTimer = (minutesStr) => {
  const minutes = parseFloat(minutesStr);
  if (!minutes || minutes <= 0) {
    document.getElementById("timerMessage").textContent = "Please enter a positive number of minutes.";
    return;
  }
  document.getElementById("timerMessage").textContent = "";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const [tab] = tabs;
    const endTime = Date.now() + minutes * 60000;
    chrome.storage.local.set({ timerEndTime: endTime });
    chrome.runtime.sendMessage({ action: "startTimer", tabId: tab.id, minutes });
    startTimerDisplay(endTime);
  });
};

const handleSummarizeDoc = () => {
  const summaryResult = document.getElementById("summaryResult");
  summaryResult.innerText = "Summarizing page content...";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => document.body.innerText
    }, (results) => {
      if (chrome.runtime.lastError || !results || !results[0]?.result) {
        summaryResult.innerText = "Could not access page content.";
        return;
      }
      chrome.runtime.sendMessage({ action: "summarizeText", text: results[0].result }, (response) => {
        summaryResult.innerText = response?.summary || "Failed to generate summary.";
      });
    });
  });
};

const handleAddTask = (taskName, taskTime, taskLink) => {
  const schedulerMessage = document.getElementById("schedulerMessage");
  if (!taskName || !taskTime) {
    schedulerMessage.textContent = "Task name and time are required.";
    return;
  }
  chrome.runtime.sendMessage({
    action: "addTask",
    task: { name: taskName, time: taskTime, link: taskLink, completed: false }
  }, (response) => {
    if (response?.message) {
      schedulerMessage.textContent = response.message;
      document.getElementById("taskName").value = '';
      document.getElementById("taskTime").value = '';
      document.getElementById("taskLink").value = '';
    }
  });
};


// --- Event Listeners ---
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.tasks) {
    renderTasks();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  renderTasks();
  restoreLastClosedTab();

  chrome.storage.local.get('timerEndTime', (data) => {
    if (data.timerEndTime && data.timerEndTime > Date.now()) {
      startTimerDisplay(data.timerEndTime);
    }
  });

  document.getElementById("startTimer").addEventListener("click", () => handleStartTimer(document.getElementById("timerMinutes").value));
  document.getElementById("summarizeDoc").addEventListener("click", handleSummarizeDoc);
  document.getElementById("addTask").addEventListener("click", () => handleAddTask(
    document.getElementById("taskName").value,
    document.getElementById("taskTime").value,
    document.getElementById("taskLink").value
  ));
  document.getElementById("syncCalendarButton").addEventListener("click", () => chrome.runtime.sendMessage({ action: "syncCalendar" }));
  document.getElementById("clearCompletedTasks").addEventListener("click", () => chrome.runtime.sendMessage({ action: "clearCompletedTasks" }));
});