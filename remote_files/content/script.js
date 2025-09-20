console.log("content_online.js");

async function LoadContent() {

    const url = window.location.href

    if (/^https:\/\/(www\.)?github\.com/.test(url)) {
        await chrome.runtime.sendMessage({
            type: "load_script",
            path: "/remote_files/example/script.json"
        });
    }

}

LoadContent()