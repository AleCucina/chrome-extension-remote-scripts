import { executeAST } from '../modules/interpreter.js';

(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) return;

    const response = await chrome.runtime.sendMessage({ type: "load_script", path: "/remote_files/popup/script.json", tabId: tab.id });

    if (!response.success) return

    executeAST(JSON.parse(response.script))
})()