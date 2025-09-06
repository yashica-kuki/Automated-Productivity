// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showRestorePrompt") {
    const restoreUrl = request.url;
    
    // Check if the prompt already exists
    if (document.getElementById('extension-restore-prompt')) {
      return;
    }

    // Create the UI element (a div with a button)
    const promptDiv = document.createElement('div');
    promptDiv.id = 'extension-restore-prompt';
    promptDiv.style.position = 'fixed';
    promptDiv.style.bottom = '20px';
    promptDiv.style.right = '20px';
    promptDiv.style.backgroundColor = '#2c3e50';
    promptDiv.style.color = 'white';
    promptDiv.style.padding = '15px';
    promptDiv.style.borderRadius = '8px';
    promptDiv.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
    promptDiv.style.zIndex = '10000';
    promptDiv.style.fontFamily = 'Arial, sans-serif';
    promptDiv.style.display = 'flex';
    promptDiv.style.alignItems = 'center';
    promptDiv.style.gap = '15px';

    const message = document.createElement('span');
    message.textContent = 'A timer for this site expired. Would you like to restore the page?';

    const restoreButton = document.createElement('button');
    restoreButton.textContent = 'Restore';
    restoreButton.style.padding = '8px 12px';
    restoreButton.style.border = 'none';
    restoreButton.style.borderRadius = '5px';
    restoreButton.style.backgroundColor = '#3498db';
    restoreButton.style.color = 'white';
    restoreButton.style.cursor = 'pointer';
    restoreButton.style.fontWeight = 'bold';

    // Event listener for the restore button
    restoreButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "restoreTab", url: restoreUrl });
      promptDiv.remove();
    });

    promptDiv.appendChild(message);
    promptDiv.appendChild(restoreButton);
    
    // Append the UI to the page body
    document.body.appendChild(promptDiv);
  }
});