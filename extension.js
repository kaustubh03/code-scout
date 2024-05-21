const vscode = require('vscode');
const fs = require('fs');
const https = require('https');
const path = require('path');
const axios = require('axios');
const marked = require('marked');
const ollama_api_endpoint = 'http://localhost:11434/api/generate';


let responsePanel;

async function downloadFile(url, filename) {
  try {
    const downloadDir = vscode.Uri.file(path.join(vscode.workspace.rootPath || '', 'downloads'));
    const downloadPath = vscode.Uri.joinPath(downloadDir, filename);

    await new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(downloadPath.fsPath);

      https.get(url, (response) => {
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(downloadPath.fsPath); // Delete the file if there was an error
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(downloadPath.fsPath); // Delete the file if there was an error
        reject(err);
      });
    });

    vscode.window.showInformationMessage(`File downloaded: ${downloadPath.fsPath}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Error downloading file: ${error.message}`);
  }
}

function refineData(response, result, done) {
  response.data.split("\n").map(objString => {
            if (!done) {
              let modifiedString = objString.startsWith(',') ? objString.slice(1) : objString;
              modifiedString = modifiedString.endsWith(',') ? modifiedString.slice(0, -1) : modifiedString;
              try {
                const outputJson = JSON.parse(modifiedString);
                if (outputJson.done) {
                  done = true;
                }
                result.push(outputJson);
              } catch (err) {
                console.log(err, objString);
              }
            }
            else {
              console.log(objString);
            }
          });
}

function storeAndShowWebPanel (context, document, code, diagnostics) {
  context.workspaceState.update(`content_${document.uri.fsPath}`, code);
  context.workspaceState.update(`response_${document.uri.fsPath}`, diagnostics);
  updateResponsePanel(diagnostics);
}

async function callInferenceEndpointAndUpdate(context, document, code) {
  const prompt = `inspect and analyze for bad code - ${code}, Also score out of 10, with below guidelines
  - Dont suggest Linters, code formatters etc, Its already in place in Browserstack
  - DesignStack is Browserstack's Design System
  - Check for in depth analysis of the code and check if the logic is superfine or not
  `;
        const data = { model: 'gemma:2b', prompt };
        const statusMessage = vscode.window.setStatusBarMessage('Analyzing code...');
        try {
          const response = await axios.post(ollama_api_endpoint, data);
          const result = [];
          let done = false;
          refineData(response, result, done);
          const diagnostics = parseDiagnostics(document, result);
        
          showInfoMessageAndAction(context, document, code);
          
          storeAndShowWebPanel(context, document, code, diagnostics);

        } catch (error) {
           if (error.message.includes('connect ECONNREFUSED')) {
            const dialogResult = await vscode.window.showInformationMessage(
              'First Time using? Ollama and other dependencies are not installed or running. Please install them before using CodeScout.',
              { modal: true },
              'Install'
            );

            if (dialogResult === 'Install Ollama') {
              const url = '';
              const filename = 'installer.js';
              downloadFile(url, filename);
            }
            return;
          } else {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
            return;
          }
        }
        finally {
          // Hide the loader in the status bar
          statusMessage.dispose();
        }
}

function clearStoredData(document, context) {
  const fileKey = `content_${document.uri.fsPath}`;
  const responseKey = `response_${document.uri.fsPath}`;

  context.workspaceState.update(fileKey, undefined);
  context.workspaceState.update(responseKey, undefined);
}

function showInfoMessageAndAction(context, document, code) {
  // Show the notification with the "Regenerate" button
  const regenerateAction = { title: 'Regenerate' };
  const analysisDoneMessage = 'Analysis Done';
  vscode.window.showInformationMessage(analysisDoneMessage, regenerateAction, { isCloseAffordanceVisible: true })
    .then(selectedAction => {
      if (selectedAction === regenerateAction) {
        callInferenceEndpointAndUpdate(context, document, code);
      }
    });
}

function activate(context) {
   const disposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    const code = document.getText();
    const storedContent = context.workspaceState.get(`content_${document.uri.fsPath}`);
    if(code !== storedContent) {
        clearStoredData(document, context);
        callInferenceEndpointAndUpdate(context, document, code);
    } else {
      const storedResponse = context.workspaceState.get(`response_${document.uri.fsPath}`);
      showInfoMessageAndAction(context, document, code);
      updateResponsePanel(storedResponse);
    }
  });

  context.subscriptions.push(disposable);
}

function parseDiagnostics(document, analysis) {
  // let combinedResponse = "";
  const combinedResponse = `${analysis.map(textNode => textNode.response).join("")}`;
  console.log(combinedResponse);
  
  if(!analysis.length) {
    console.log('No Response Received');
  }
  return `${combinedResponse}
  <br />
  <br />
  <br />
  <small>Analysis for ${document.uri.fsPath}</small>`;
}

function updateResponsePanel(response) {
  if (responsePanel) {
    try {
      const responseHtml = `<p style="width: 100%; height: auto; white-space: pre-line;">${marked.parse(response)}</p>`;
      responsePanel.webview.html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>CodeScout Analysis</title>
            <style>
              body {
                background: #000000;  /* fallback for old browsers */
                background: -webkit-linear-gradient(to bottom, #434343, #000000);  /* Chrome 10-25, Safari 5.1-6 */
                background: linear-gradient(to bottom, #434343, #000000); /* W3C, IE 10+/ Edge, Firefox 16+, Chrome 26+, Opera 12+, Safari 7+ */
                min-height: 100vh;
                height: auto;
              }

              .logo {
                position: absolute;
                top:0px;
                z-index:1;
                opacity: 0.2;
                width:100%;
                display: flex;
                justify-content: flex-end;
                right: 20px;
              }
              .logo svg{
                width: 100px;
                height: 100px;
              }
              .result {
                z-index:99;
                width: 100%; 
                height: auto;
              }
            </style>
          </head>
          <body>
            <div class="logo">
              <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path fill="#000000" d="M256.3 19.42C204 57.2 177.2 111 152.5 160.7c43.4-24.6 101.7-32.9 126.9-28.7-63.8 10.6-108 25.8-144.4 64.3-2.2 4.5-4.1 8.3-6.4 13.1 115.4-27.8 134.4-27 250.9-.7C368 158.6 343 126.6 304 65.83 345.9 118.4 428.1 208.1 424.3 190.6 401.4 85.73 324.2 23.49 256.3 19.42zM88 231.3c-31 7.4-53.9 17.5-62.8 26.7.9 11.7 6.7 22.1 17.5 32 11.8 10.8 29.6 20.4 51.3 28.1 2.69.9 5.39 1.8 8.1 2.7-8.4-11-11.2-26.3-13-41.1 0-15.4-3-33.5-1.1-48.4zm336 0c2.2 16.2.6 34.5-1.1 48.4-1.8 14.8-4.6 30.1-13 41.1 20.2-7 44.6-17.6 59.4-30.8 10.8-9.9 16.6-20.3 17.5-32-8.9-9.2-31.7-19.3-62.8-26.7zm-274.4.3l-7 14h98.8l-7-14zm128 0l-7 14h98.8l-7-14zM119 241c-4.7 1.3-9.4 2.6-14 4.1 1 19.9.6 47.6 11.6 64.5h2.4zm274 0v68.6h2.4c10.5-20.7 11.3-41.8 11.6-64.5-4.6-1.5-9.3-2.8-14-4.1zm-255.9 22.6c-.3 18.8 2 39.5 6.2 55.7 21.1-14.1 41.9-25.7 64.7-25.7 3.2 0 6.4.2 9.4.4l5.2-15.7c-5.6 5.7-12.9 8.9-23.2 8.5-25.2-.8-33.9-11.1-37.5-23.2zm109.4 0l-12.4 37.2 21.9 27.4 21.9-27.4-12.4-37.2zm103.6 0c-3.6 12.1-12.3 22.4-37.5 23.2-10.3.4-17.6-2.8-23.2-8.5l5.2 15.7c3.1-.3 6.3-.4 9.4-.4 22.8 0 43.6 11.6 64.7 25.7 4.4-20.1 6.8-37.6 6.2-55.7zm-142.1 48c-20 0-43 14.5-68.9 32.4-19.2 13.3-39.9 28.1-63.3 38.4 28.6 6.1 65.8 4.8 98.2-2.6 21.3-4.8 40.5-12.1 53.7-20.5 8.5-5.5 14.1-11.1 17-16.4l-24.2-30.3c-3.7-.6-7.9-1-12.5-1zm96 0c-4.6 0-8.8.4-12.5 1l-24.2 30.3c2.9 5.3 8.5 10.9 17 16.4 13.2 8.4 32.4 15.7 53.7 20.5 32.4 7.4 69.6 8.7 98.2 2.6-23.4-10.3-44.1-25.1-63.3-38.4-25.9-17.9-48.9-32.4-68.9-32.4zm-48 46.7c-4.6 5.7-10.6 10.8-17.4 15.3h34.8c-6.8-4.5-12.8-9.6-17.4-15.3zm-56.7 33.3c-6.9 2.2-14 4.1-21.3 5.8-9.5 2.2-19.2 3.9-28.9 5.1 6.1 19.6 14.1 39.5 23 58.2l.1.2c4.3-6.7 9.4-13.1 13.5-19.8-2.4 13.9-3.3 27.9-2.3 41.8 1.7 3.3 3.5 6.5 5.3 9.7h134.6c3.6-6.3 7-12.7 10.3-19.2 5.4-21.9 3.9-42.8 5.4-64.2 3.1 11.5 6.1 23 8.5 34.7 5.8-13.6 11.1-27.6 15.4-41.4-9.7-1.2-19.4-2.9-28.9-5.1-7.3-1.7-14.4-3.6-21.3-5.8z"/></svg>
            </div>
            <div class="result">${responseHtml}</div>
          </body>
        </html>
      `;
    } catch (error) {
      // Handle the "Webview is disposed" error
      if (error.message.includes('Webview is disposed')) {
        console.log('Webview is disposed, creating a new instance');
        responsePanel = null; 
        updateResponsePanel(response);
      } else {
        console.error('Error updating ResponsePanel:', error);
      }
    }
    responsePanel.reveal();
  } else {
    responsePanel = vscode.window.createWebviewPanel(
      'responsePanel',
      'CodeScout Analysis',
      vscode.ViewColumn.Two,
      {}
    );
    updateResponsePanel(response);
  }
}

exports.activate = activate;
module.exports = { activate };