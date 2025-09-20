# Chrome Extension - Remote Script Loader (Manifest V3)

Hello everyone 👋  
If you are looking at this repository, it’s probably because at some point you tried to load **remote scripts** into your Chrome extension.  

With the arrival of **Manifest V3**, however, this functionality has been blocked: now it’s mandatory to include all scripts directly inside the extension files.  
And let’s be honest, this is **super annoying** — especially if you distribute the extension in unpacked format (so, outside the Chrome Web Store).

That’s why I decided to find a workaround.  
This repository is a small example of how to bypass this limitation. I’m convinced this approach can be extended much further, and its potential is really high.

---

# How to use this repository

1. **Download the repository** to your computer.  
2. **Load the extension in Chrome**: go to `chrome://extensions/`, enable developer mode, and load the `chrome_extension` folder as an unpacked extension.  
3. **Make the `remote_files` folder accessible remotely**:  

   This folder contains the scripts that the extension will dynamically load. They must be served over HTTP, they cannot just sit locally.  
   
   Some practical examples:
   - **Next.js**: copy the `remote_files` folder inside `public/`. This way the files will be accessible at a URL like:  
     ```
     http://localhost:3000/remote_files/content/script.json
     ```
   - **Express**: serve the folder by adding to your Express server:  
     ```js
     app.use("/remote_files", express.static("remote_files"));
     ```
     This way, the files will be available at:  
     ```
     http://localhost:3000/remote_files/content/script.json
     ```
   - **Any other static server**: just expose the `remote_files` folder as a public directory (Apache, Nginx, Vercel, etc.).  

   In short, you need to make sure that visiting a URL like:  
   ```
   http://YOUR-DOMAIN/remote_files/content/script.json
   ```
   correctly serves the file.  

4. **Configure the domain in the service worker**: if you’re not using `http://localhost:3000`, open `chrome_extension/service_worker/background.js` and edit the constant:  
   ```js
   const domain = "http://localhost:3000";
   ```
   replacing it with the domain you are using.

5. **Done ✅**  
   At this point the extension is ready, and you can manage it by loading remote scripts directly from the `remote_files` folder.

---

## How does it work? (Theory)

Normally, if we try to load remote scripts in a MV3 extension, Chrome blocks them.  
My idea was: **why not convert the JavaScript scripts into another form and then interpret them directly in the extension?**  

The format I chose is the **JavaScript AST** (Abstract Syntax Tree).  
In short: an AST is a structured representation of code, like a tree that describes each instruction (variables, functions, calls, etc.).  

Inside the extension I included a small **interpreter** that takes this AST (in JSON format), reads it, and executes it.  

The interpreter you’ll find in this repo (`chrome_extension/modules/interpreter.js`) is quite simple and can be greatly improved, but it’s already a good starting point.  
Do what you want with it — I think it can be useful to many devs.

Convert JavaScript to AST using: https://astexplorer.net/

---

## How does it work? (Practice)

The extension loads two main files on every page:

- `modules/interpreter.js` → the AST interpreter  
- `modules/content.js` → a script that requests the remote file `/remote_files/content/script.json`

The remote file (`content/script.json`) defines which remote scripts to load into the extension.  
For example, the sample file included in this repo contains:

```js
console.log("content_online.js");

async function LoadContent() {
  const url = window.location.href;

  if (/^https:\/\/(www\.)?github\.com/.test(url)) {
    await chrome.runtime.sendMessage({
      type: "load_script",
      path: "/remote_files/example/script.json"
    });
  }
}

LoadContent();
```

In this example, if the current page is **www.github.com**, the extension loads and executes the script:

```js
console.log("Hello world from remote file!");
alert("Hello world from remote file!");
```

---

## Extension popup

The same logic also applies to the **Chrome extension popup**.  

In the `popup/` folder you’ll only find two files:
- `/popup/popup.html` → contains just a skeleton loading UI  
- `/popup/popup.js` → works almost like `chrome_extension/modules/content.js`, and loads the remote script that will handle the entire popup  

Once the remote script is loaded, you can replace the skeleton with the **real UI** and all the logic you need.  
This way, even the popup becomes completely dynamic and updatable in real time.

---

## Important notes

Currently, the interpreter is quite basic: this means that remote JavaScript code must be written with **clean and correct syntax**.  

For example:  
If you want to declare a function and then run it, you must **declare it first and only then call it**.  
If you invert the order, the interpreter won’t even know that the function exists and will throw an error.

After a few minutes of testing, you’ll quickly see what works and what doesn’t.  
In general: respect the logical order of the code, and everything will run smoothly. 😉

---

## Why is this interesting?

Because this way we can **change the behavior of the extension in real time** from the server side.  
Just update the file `/remote_files/content/script.json` and the extension’s behavior changes immediately, without having to recompile or reinstall anything.

In practice, with this approach you can:
- add or remove scripts on the fly  
- change extension logic live  
- have a more dynamic and customizable extension  

---

## Disclaimer

This repo is intended for **experimental purposes**.  
Do not use it to load untrusted scripts: the risk of compromising the extension’s and users’ security is real.

---

## Contributing

Pull requests and bug reports are welcome! 🚀
