## Overview
Productivity Pro Suite is an all-in-one Chrome extension designed to streamline your daily workflow and keep you in a state of flow. We believe that essential tools shouldn't force you to leave your work. This extension bundles a website timer, a smart task scheduler, and an AI-powered document summarizer directly into your browser, available on any webpage with a single click.

Our solution is better than a separate website or app because it eliminates the need for context switching. You can summarize a lengthy news article or set a focus timer for a research task without ever leaving the page. This seamless integration provides instant utility, saves time, and keeps you focused on what matters most.

## ✨ Key Features
⏰ Website Timer: Set a focus timer for any website. When time is up, the tab closes automatically, and you get an option to easily restore the tab if you need more time.

📅 Smart Task Scheduler: Schedule your tasks and meetings with optional links. It fully integrates with your Google Calendar, automatically syncing events to keep you organized.

✍️ AI-Powered Summarizer: Instantly get a concise summary of any webpage or article using the power of the Gemini API. Perfect for quick research and absorbing key information.

## 🚀 Installation and Setup
To run this extension on your local machine, follow these simple steps:

Download the Code: Download and unzip all the project files into a single folder on your computer.

Open Chrome Extensions: Open Google Chrome, type chrome://extensions into the address bar, and press Enter.

Enable Developer Mode: In the top-right corner of the Extensions page, turn on the Developer mode switch. This will reveal a new set of buttons.

Load the Extension: Click the Load unpacked button that appeared on the top-left.

Select the Folder: In the file selection window that opens, navigate to the folder where you saved the project files and click Select Folder.

Your extension should now appear in your list of extensions and be ready to use!

## 🛠️ Configuration
For the Summarizer and Google Calendar Sync features to work, you must configure two things:

### 1. Gemini API Key
You need a free API key from Google AI Studio to power the summarizer.

Go to Google AI Studio to get your key.

Open the background.js file.

Replace the placeholder text "YOUR_GEMINI_API_KEY" with your actual key.

JavaScript

// in background.js
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"; // <-- PASTE YOUR KEY HERE
### 2. Google OAuth 2.0 Client ID
To sync with Google Calendar, the extension needs a Client ID.

Follow the instructions on the Chrome Developers Guide to create one.

Open the manifest.json file.

Replace the existing client_id with your own.

JSON

// in manifest.json
"oauth2": {
  "client_id": "YOUR_OWN_CLIENT_ID.apps.googleusercontent.com", // <-- PASTE YOUR ID HERE
  "scopes": [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/documents"
  ]
}
