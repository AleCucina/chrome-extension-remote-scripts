
(async () => {

    console.log("popup.js")

    function LoadCss() {
        const style = document.createElement("style");
        style.textContent = `

        html,
        body {
            width: 100%;
            height: 100%;
            padding: 0px;
            margin: 0px;
        }

        main{
            width: 400px;
            height: 550px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }

        .title{
            font-size: 18px;
            font-weight: 600;
            color: #222222;
            margin: 0px;
            text-align: center;
        }

        .description{
            font-size: 14px;
            color: #555555;
            margin: 0px;
            margin-top: 10px;
            text-align: center;
            max-width: 300px;
        }

        `;
        document.head.appendChild(style);
    }

    async function LoadHtml() {

        document.getElementById("skeleton_main").classList.add("hide")

        const body = `
        
    <main>

        <p class="title">Chrome Extension - Remote Script Loader (Manifest V3)</p>
        <p class="description">Chrome Extension - Remote Script Loader (Manifest V3)</p>

    </main>

        `;

        document.body.innerHTML = body
    }

    async function SimpleScript() {

        await chrome.runtime.sendMessage({
            type: "localstorage",
            method: "POST",
            name: "example",
            value: "example_value"
        });

        const payload = {
            type: "localstorage",
            method: "GET",
            name: "example"
        }

        const response = await chrome.runtime.sendMessage(payload);

        console.log(response);
        
    }

    LoadCss()

    LoadHtml()

    SimpleScript()

})()