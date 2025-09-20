console.log("content_local.js");

let executeAST
(async () => {
    const url = chrome.runtime.getURL('modules/interpreter.js');
    const module = await import(url);
    executeAST = module.executeAST
    chrome.runtime.sendMessage({
        type: "load_script",
        path: "/remote_files/content/script.json"
    });
})()

