const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

/**
 * Generates the contents of a .wsb configuration XML file.
 * @param {string} hostFolder - Path on the host machine to share.
 * @param {string} sandboxFolder - Destination path inside the sandbox (usually C:\SandboxTest).
 * @param {boolean} readOnly - Whether the sandbox can only read the host folder.
 * @returns {string} XML string for Windows Sandbox config.
 */
function generateWsbXml(hostFolder, sandboxFolder = 'C:\\SandboxTest', readOnly = false) {
  return `<Configuration>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>${hostFolder}</HostFolder>
      <SandboxFolder>${sandboxFolder}</SandboxFolder>
      <ReadOnly>${readOnly ? 'true' : 'false'}</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <vGPU>Enable</vGPU>
  <Networking>Disable</Networking>
</Configuration>`;
}

/**
 * Launches Windows Sandbox with the mapped folder setup.
 * @param {string} hostFolder - Host directory path.
 * @param {string} tempDir - Folder where the temp .wsb file should be written.
 * @returns {Promise<string>} Output message indicating launch success or fail.
 */
function launchWindowsSandbox(hostFolder, tempDir) {
  return new Promise((resolve, reject) => {
    // Ensure temp dir exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const xmlContent = generateWsbXml(hostFolder);
    const wsbPath = path.join(tempDir, 'sandbox_config.wsb');

    fs.writeFile(wsbPath, xmlContent, 'utf8', (writeErr) => {
      if (writeErr) {
        return reject(new Error(`Failed to write WSB configuration file: ${writeErr.message}`));
      }

      // Execute Windows Sandbox
      // wsb.exe C:\path\to\generated.wsb
      const command = `wsb.exe "${wsbPath}"`;
      
      exec(command, (execErr, stdout, stderr) => {
        if (execErr) {
          return reject(new Error(`Failed to execute Windows Sandbox: ${execErr.message}. Ensure Hyper-V and Windows Sandbox features are enabled on this system.`));
        }
        resolve(`Windows Sandbox successfully initialized with host folder "${hostFolder}" mapped to "C:\\SandboxTest".`);
      });
    });
  });
}

module.exports = {
  generateWsbXml,
  launchWindowsSandbox
};
