/**
 * Ultron Native Windows OS Superpowers & System Controls
 * Direct IPC control for Volume, Audio Devices, Display Brightness, Power Operations, and Media Playback.
 */
const { exec } = require('child_process');

function runPowerShell(command) {
  return new Promise((resolve) => {
    const psCommand = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '\\"')}"`;
    exec(psCommand, { windowsHide: true, timeout: 8000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr.trim() || error.message });
      } else {
        resolve({ success: true, output: stdout.trim() });
      }
    });
  });
}

// Volume Controls
async function getVolume() {
  const script = `
    $w = [System.Runtime.InteropServices.Marshal]
    $obj = New-Object -ComObject WScript.Shell
    try {
      Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        public interface IAudioEndpointVolume {
          int f(); int g(); int h(); int i();
          int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
          int j();
          int GetMasterVolumeLevelScalar(out float pfLevel);
          int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
          int GetMute(out bool pbMute);
        }
        [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        public interface IMMDevice {
          int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
        }
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        public interface IMMDeviceEnumerator {
          int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
        }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumeratorComObject { }
        public class Audio {
          public static float GetVolume() {
            var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
            IMMDevice dev = null;
            enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
            var iid = typeof(IAudioEndpointVolume).GUID;
            IAudioEndpointVolume aev = null;
            dev.Activate(ref iid, 23, 0, out aev);
            float vol = 0;
            aev.GetMasterVolumeLevelScalar(out vol);
            return vol * 100;
          }
          public static bool GetMute() {
            var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
            IMMDevice dev = null;
            enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
            var iid = typeof(IAudioEndpointVolume).GUID;
            IAudioEndpointVolume aev = null;
            dev.Activate(ref iid, 23, 0, out aev);
            bool mute = false;
            aev.GetMute(out mute);
            return mute;
          }
        }
"@
      $vol = [Audio]::GetVolume()
      $mute = [Audio]::GetMute()
      Write-Output "$([int]$vol)|$mute"
    } catch {
      Write-Output "50|False"
    }
  `;
  const res = await runPowerShell(script);
  if (res.success && res.output) {
    const parts = res.output.split('|');
    const level = parseInt(parts[0], 10) || 50;
    const isMuted = parts[1]?.toLowerCase().trim() === 'true';
    return { success: true, level, isMuted };
  }
  return { success: true, level: 50, isMuted: false };
}

async function setVolume(level) {
  const target = Math.max(0, Math.min(100, Math.round(Number(level) || 0)));
  const scalar = (target / 100).toFixed(2);
  const script = `
    try {
      Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        public interface IAudioEndpointVolume {
          int f(); int g(); int h(); int i();
          int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
          int j();
          int GetMasterVolumeLevelScalar(out float pfLevel);
          int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
          int GetMute(out bool pbMute);
        }
        [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        public interface IMMDevice {
          int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
        }
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        public interface IMMDeviceEnumerator {
          int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
        }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumeratorComObject { }
        public class AudioSet {
          public static void Set(float level) {
            var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
            IMMDevice dev = null;
            enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
            var iid = typeof(IAudioEndpointVolume).GUID;
            IAudioEndpointVolume aev = null;
            dev.Activate(ref iid, 23, 0, out aev);
            aev.SetMasterVolumeLevelScalar(level, Guid.Empty);
          }
        }
"@
      [AudioSet]::Set(${scalar}f)
      Write-Output "OK"
    } catch {
      Write-Output "FALLBACK"
    }
  `;
  const res = await runPowerShell(script);
  return { success: res.success, level: target };
}

async function toggleMute() {
  const script = `
    $wscript = New-Object -ComObject Wscript.Shell
    $wscript.SendKeys([char]173)
  `;
  const res = await runPowerShell(script);
  return { success: res.success, message: 'Audio mute toggled' };
}

// Media Playback Controls
async function sendMediaKey(action) {
  let charCode = 179; // Play/Pause
  if (action === 'next') charCode = 176;
  if (action === 'prev') charCode = 177;
  if (action === 'stop') charCode = 178;
  if (action === 'volup') charCode = 175;
  if (action === 'voldown') charCode = 174;

  const script = `
    $wscript = New-Object -ComObject Wscript.Shell
    $wscript.SendKeys([char]${charCode})
  `;
  const res = await runPowerShell(script);
  return { success: res.success, action };
}

// Power Operations
async function lockWorkstation() {
  return new Promise((resolve) => {
    exec('rundll32.exe user32.dll,LockWorkStation', { windowsHide: true }, (err) => {
      resolve({ success: !err, message: err ? err.message : 'Workstation locked' });
    });
  });
}

async function sleepSystem() {
  return new Promise((resolve) => {
    exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', { windowsHide: true }, (err) => {
      resolve({ success: !err, message: err ? err.message : 'System put to sleep' });
    });
  });
}

async function restartSystem() {
  return new Promise((resolve) => {
    exec('shutdown.exe /r /t 10 /c "Ultron initiated system restart"', { windowsHide: true }, (err) => {
      resolve({ success: !err, message: err ? err.message : 'Restarting system in 10s' });
    });
  });
}

// Display Brightness Control
async function getBrightness() {
  const script = `
    try {
      $b = (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness -ErrorAction Stop).CurrentBrightness
      Write-Output $b
    } catch {
      Write-Output "100"
    }
  `;
  const res = await runPowerShell(script);
  const val = parseInt(res.output, 10);
  return { success: true, brightness: Number.isNaN(val) ? 100 : val };
}

async function setBrightness(level) {
  const val = Math.max(0, Math.min(100, Math.round(Number(level) || 50)));
  const script = `
    try {
      (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${val})
      Write-Output "OK"
    } catch {
      Write-Output "FAIL"
    }
  `;
  const res = await runPowerShell(script);
  return { success: res.success && res.output?.includes('OK'), brightness: val };
}

module.exports = {
  getVolume,
  setVolume,
  toggleMute,
  sendMediaKey,
  lockWorkstation,
  sleepSystem,
  restartSystem,
  getBrightness,
  setBrightness
};
