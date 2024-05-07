const vscode = require('vscode');
const axios = require('axios');
const marked = require('marked');
const ollama_api_endpoint = 'http://localhost:11434/api/generate';

let responsePanel;

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

function storeAndShowWebPanel (context, document, code, diagnostics, refinement) {
  context.workspaceState.update(`content_${document.uri.fsPath}`, code);
  context.workspaceState.update(`response_${document.uri.fsPath}`, diagnostics);
  updateResponsePanel(diagnostics, refinement);
  if(refinement) {
    callInferenceEndpointAndUpdate(context, document, code)
  }
}

async function callInferenceEndpointAndUpdate(context, document, code, refinement=false) {
  const prompt = `Inspect for bad code and provide suggestions, also calculate score for the code out of 10 - ${code}`;
        const data = { model: 'gemma:2b', prompt };
        const statusMessage = vscode.window.setStatusBarMessage('Analyzing code...');
        try {
          const response = await axios.post(ollama_api_endpoint, data);
          const result = [];
          let done = false;
          refineData(response, result, done);
          const diagnostics = parseDiagnostics(document, result);
          vscode.window.showInformationMessage('Analysis Done');
          // vscode.languages.createDiagnosticCollection('ollama').set(document.uri, diagnostics);
          
          storeAndShowWebPanel(context, document, code, diagnostics, refinement);

        } catch (error) {
          console.log(error);
          vscode.window.showErrorMessage(`Error: ${error.message}`);
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

function activate(context) {
   console.log("here, saved");
  const disposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    const code = document.getText();
    const storedContent = context.workspaceState.get(`content_${document.uri.fsPath}`);
    if(code !== storedContent) {
        clearStoredData(document, context);
        callInferenceEndpointAndUpdate(context, document, code, true);
    } else {
      const storedResponse = context.workspaceState.get(`response_${document.uri.fsPath}`);
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
  return `Analysis for ${document.uri.fsPath}<br /> ${combinedResponse}`;
}

function stopRefinement() {
  console.log('Stop Refinement');
}

function updateResponsePanel(response, requiresRefinement = false) {
  if (responsePanel) {
    try {
      const refinementDiv = `<div style="position: fixed; width:100vw; height: 100vh; display:flex; justify-content: center; align-items:center; background:rgba(0,0,0, 0.7); top:0px; left:0px;"><span>Refining the Response for more deep analysis</span></div>`;
      const responseHtml = `<p style="width: 100%; height: auto; white-space: pre-line;">${marked.parse(response)}</p>  ${requiresRefinement ? refinementDiv: ''}`;
      responsePanel.webview.html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Ollama Response</title>
          </head>
          <body>
            ${responseHtml}
          </body>
        </html>
      `;
    } catch (error) {
      // Handle the "Webview is disposed" error
      if (error.message.includes('Webview is disposed')) {
        console.log('Webview is disposed, creating a new instance');
        responsePanel = null; 
        updateResponsePanel(response, requiresRefinement);
      } else {
        console.error('Error updating ResponsePanel:', error);
      }
    }
    responsePanel.reveal();
  } else {
    responsePanel = vscode.window.createWebviewPanel(
      'responsePanel',
      'Response',
      vscode.ViewColumn.Two,
      {}
    );
    updateResponsePanel(response, requiresRefinement);
  }
}

exports.activate = activate;
module.exports = { activate };