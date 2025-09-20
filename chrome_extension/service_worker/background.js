const domain = "http://localhost:3000"

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {

    console.log("\n\n------------------\n\n");
    console.log(JSON.stringify(message, null, 2));
    console.log(JSON.stringify(sender, null, 2));
    console.log("\n\n-----------------\n\n");

    try {

        if (message.type === "load_script") {

            const tabId = sender.tab?.id ?? message.tabId;

            if (!tabId) return sendResponse({ error: "No target tabId" });

            const from = sender.tab?.id ? "content" : "popup"

            const path = message.path;

            if (!path) {
                return sendResponse({ error: "Missing path" });
            }

            const key = `online_script_cache_${path}`;
            // Cache TTL in ms
            const cacheTTL = 0;//15 * 60 * 1000;

            (async () => {
                const cached = await chrome.storage.local.get([key]);
                const cachedData = cached[key];

                const now = Date.now();

                if (cachedData && now - cachedData.timestamp < cacheTTL) {

                    if (from == "content") {
                        chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            func: executeScript,
                            args: [cachedData.script]
                        });
                    }

                    return sendResponse({ success: true, cached: true, script: from == "popup" ? cachedData.script : '' });

                }

                const response = await fetch(domain + path);
                if (response.status !== 200) {
                    return sendResponse({ success: false });
                }

                const result = await response.text();

                try {
                    JSON.parse(result)
                } catch (error) {
                    return sendResponse({ success: false });
                }

                await chrome.storage.local.set({
                    [key]: {
                        script: result,
                        timestamp: now
                    }
                });

                if (from == "content") {
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: executeScript,
                        args: [result]
                    });
                }

                return sendResponse({ success: true, cached: false, script: from == "popup" ? result : '' });

            })();

        } else if (message.type == "request") {

            (async () => {

                const headers = message.payload.headers
                const body = message.payload.body
                const url = message.payload.url
                const method = message.payload.method

                if (!headers || !body || !url || !method) {
                    return sendResponse({ status: 0, error: "Missing request parameters" });
                }

                const response = await fetch(url, {
                    headers: headers,
                    "referrerPolicy": "strict-origin-when-cross-origin",
                    "body": body,
                    "method": method,
                    "mode": "cors",
                    "credentials": "include"
                })

                const result = await response.text()
                const result_headers = {}

                for (const [key, value] of response.headers.entries()) {
                    result_headers[key] = value;
                }

                sendResponse({
                    url: response.url,
                    status: response.status,
                    ok: response.ok,
                    body: result,
                    headers: result_headers,
                    redirected: response.redirected,
                    statusText: response.statusText,
                    type: response.type
                })

            })()

        } else if (message.type == "localstorage") {

            (async () => {

                const method = message.method
                const name = message.name
                const value = message.value

                if (!method || !name) {
                    return sendResponse({ error: "Missing localstorage parameters" });
                }

                if (method === "GET") {
                    const response = await chrome.storage.local.get([name]);
                    sendResponse({ ...response });
                } else if (method === "POST") {
                    const response = await chrome.storage.local.set({ [name]: value });
                    sendResponse({ ...response });
                } else {
                    return sendResponse({ error: "Invalid method" });
                }

            })()

        } else if (message.type == "cookies") {

            (async () => {

                const method = message.method
                const name = message.name
                const domain = message.domain

                if (!method || !name) {
                    return sendResponse({ error: "Missing localstorage parameters" });
                }

                if (method === "GET") {

                    const cookies = await chrome.cookies.getAll({
                        domain: domain,
                        name: name
                    });

                    sendResponse({ cookies: cookies ?? [] });

                } else {
                    return sendResponse({ error: "Invalid method" });
                }

            })()

        }

    } catch (error) {
        console.log(error);
    }

    return true
})

async function executeScript(ast) {
    await executeAST(JSON.parse(ast));
}