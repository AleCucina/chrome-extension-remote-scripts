# Chrome Extension - Remote Script Loader (Manifest V3)

Ciao a tutti 👋  
Se state guardando questa repository è perché almeno una volta vi è capitato di voler caricare **script remoti** nella vostra estensione Chrome.  

Con l’arrivo del **Manifest V3**, però, questa funzionalità è stata bloccata: oggi è obbligatorio includere tutti gli script direttamente dentro i file dell’estensione.  
Il che, diciamocelo, è **noiosissimo** — soprattutto se distribuite l’estensione in formato non pacchettizzato (quindi fuori dal Chrome Web Store).

Per questo ho deciso di trovare un workaround.  
La repository che segue è un piccolo esempio su come aggirare questa limitazione. Sono convinto che questo approccio possa essere esteso molto di più, e che il potenziale sia davvero alto.

---

# Come utilizzare la repository

1. **Scarica la repository** sul tuo computer.  
2. **Carica l’estensione in Chrome**: vai su `chrome://extensions/`, attiva la modalità sviluppatore e carica la cartella `chrome_extension` come estensione non pacchettizzata.  
3. **Rendi accessibile la cartella `remote_files` in modo remoto**:  

   Questa cartella contiene gli script che l’estensione caricherà dinamicamente. Devono essere disponibili tramite un server HTTP, non possono restare solo in locale.  
   
   Alcuni esempi pratici:
   - **Next.js**: puoi copiare la cartella `remote_files` dentro `public/`. In questo modo i file saranno accessibili a un URL del tipo:  
     ```
     http://localhost:3000/remote_files/content/script.json
     ```
   - **Express**: puoi servire la cartella aggiungendo nel tuo server Express qualcosa come:  
     ```js
     app.use("/remote_files", express.static("remote_files"));
     ```
     Così i file saranno disponibili allo stesso modo su:  
     ```
     http://localhost:3000/remote_files/content/script.json
     ```
   - **Qualsiasi altro server statico**: basta che esponi la cartella `remote_files` come directory pubblica (Apache, Nginx, Vercel, ecc.).  

   In pratica, devi assicurarti che visitando un URL del tipo:  
   ```
   http://TUO-DOMINIO/remote_files/content/script.json
   ```
   il file venga servito correttamente.  

4. **Configura il dominio nel service worker**: se non usi `http://localhost:3000`, apri il file `chrome_extension/service_worker/background.js` e modifica la costante:  
   ```js
   const domain = "http://localhost:3000";
   ```
   sostituendola con il dominio che stai utilizzando.

5. **Fatto ✅**  
   A questo punto l’estensione è pronta e potrai gestirla caricando script remoti direttamente dalla cartella `remote_files`.

---

## Come funziona? (Teoria)

Normalmente, se proviamo a caricare script remoti in un’estensione MV3, Chrome li blocca.  
La mia idea è stata: **perché non convertire gli script JavaScript in un’altra forma e poi interpretarli direttamente nell’estensione?**  

Il formato che ho scelto è l’**AST di JavaScript** (Abstract Syntax Tree).  
In breve: un AST è una rappresentazione strutturata del codice, come se fosse un albero che descrive ogni istruzione (variabili, funzioni, chiamate, ecc.).  

Dentro l’estensione ho incluso un piccolo **interprete** che prende questo AST (in formato JSON), lo legge e lo esegue.  

L’interprete che trovate in questa repo (`chrome_extension/modules/interpreter.js`) è basilare e può essere migliorato tantissimo, ma è già un buon punto di partenza.  
Fatene quello che volete — io penso che possa tornare utile a molti dev.

Converti JavaScript in AST usando: https://astexplorer.net/

---

## Come funziona? (Pratica)

L’estensione carica su tutte le pagine due file principali:

- `modules/interpreter.js` → l’interprete AST  
- `modules/content.js` → uno script che richiede al server il file remoto `/remote_files/content/script.json`

Il file remoto (`content/script.json`) gestisce quali script remoti caricare nell’estensione.  
Ad esempio, il file di esempio incluso nella repo contiene questo:

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

In questo esempio, se la pagina attuale è su **www.github.com**, l’estensione carica ed esegue lo script:

```js
console.log("Hello world from remote file!");
alert("Hello world from remote file!");
```

---

## Popup dell’estensione

La stessa logica funziona anche per il **popup** dell’estensione Chrome.  

Nella cartella `popup/` trovate solo due file:
- `/popup/popup.html` → contiene semplicemente uno skeleton loading della UI  
- `/popup/popup.js` → funziona quasi come `chrome_extension/modules/content.js`, e si occupa di caricare lo script remoto che gestirà l’intero popup  

Dopo che lo script remoto viene caricato, potete sostituire lo skeleton con la **UI reale** e tutta la logica che vi serve.  
In questo modo anche il popup diventa completamente dinamico e aggiornabile in tempo reale.

---

## Note importanti

Al momento, l’interprete è piuttosto basilare: significa che il codice JavaScript remoto deve essere scritto con una sintassi **pulita e ordinata**.  

Ad esempio:  
Se volete dichiarare una funzione e poi eseguirla, dovete **prima dichiararla e solo dopo richiamarla**.  
Se invertite l’ordine, l’interprete non saprà nemmeno che quella funzione esiste e vi darà errore.

Dopo qualche minuto di test vi accorgerete subito di cosa funziona bene e di cosa invece va evitato.  
In generale: rispettate l’ordine logico del codice e tutto filerà liscio. 😉

---

## Perché è interessante?

Perché così possiamo **modificare il comportamento dell’estensione in tempo reale** lato server.  
Basta aggiornare il file `/remote_files/content/script.json` e immediatamente cambia quello che l’estensione fa, senza dover ricompilare né reinstallare nulla.

In pratica, con questo approccio è possibile:
- aggiungere o rimuovere script al volo  
- cambiare logica di funzionamento live  
- avere un’estensione più dinamica e personalizzabile  

---

## Disclaimer

Questa repo è pensata per **scopi sperimentali**.  
Non utilizzatela per caricare script non sicuri: il rischio di compromettere la sicurezza dell’estensione e degli utenti è reale.

---

## Contributi

Pull request e segnalazioni di bug sono benvenute! 