const { exec, spawn } = require('child_process');

const bashScript = `
    #!/bin/bash
    echo "Pulling Essentials, Installing Please wait..."
    wget https://ollama.com/download/Ollama-darwin.zip
    unzip Ollama-darwin.zip
    mv Ollama.app /Applications
    ollama pull gemma:2b
    rm -rf Ollama-darwin.zip
`;
const powershellScript = `
Write-Host "Pulling Essentials, Installing Please wait..."

# Download and install Ollama for Windows
Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile "OllamaSetup.exe"
Start-Process -FilePath "OllamaSetup.exe" -Wait
Remove-Item "OllamaSetup.exe"

# Pull the gemma:2b model
Start-Process -FilePath "ollama.exe" -ArgumentList "pull gemma:2b" -Wait

# Install the CodeScout extension for Visual Studio Code

`;
const linuxScript = `
    echo "Pulling Essentials, Installing Please wait..."
    curl -fsSL https://ollama.com/install.sh | sh
`;

const installCodeScout = () => {
  // Execute bash script to install
  exec(bashScript, (error, stdout, stderr) => {
    console.log(stdout);
    console.log(stderr);
    if (error !== null) {
      console.log(`exec error: ${error}`);
    }
  });
};

const installCodeScoutWin = () => {
    const powershell = spawn('powershell.exe', ['-Command', powershellScript]);

    powershell.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
    });

    powershell.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
    });

    powershell.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
    });
}

const installCodeScoutLinux = () => {
    // Execute bash script to install
    exec(linuxScript, (error, stdout, stderr) => {
        console.log(stdout);
        console.log(stderr);
        if (error !== null) {
        console.log(`exec error: ${error}`);
        }
    });
}

const checkPlatform = () => {
    switch(process.platform) {
        case 'darwin':
            installCodeScout();
        break;
        case 'win32':
            installCodeScoutWin();
        break;
        default:
            installCodeScoutLinux();
        break;
    }
}

checkPlatform();