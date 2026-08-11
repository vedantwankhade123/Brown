/**
 * Windows native geolocation via WinRT Geolocator (GPS / Wi‑Fi / cell tower).
 * Falls back gracefully when location services are disabled or denied.
 */

const WINDOWS_GEO_SCRIPT = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
Function Await($WinRTTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRTTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
[Windows.Devices.Geolocation.Geolocator,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
$geo = New-Object Windows.Devices.Geolocation.Geolocator
$geo.DesiredAccuracy = [Windows.Devices.Geolocation.PositionAccuracy]::High
try {
  $access = Await ([Windows.Devices.Geolocation.Geolocator]::RequestAccessAsync()) ([Windows.Devices.Geolocation.GeolocationAccessStatus])
  if ($access -ne [Windows.Devices.Geolocation.GeolocationAccessStatus]::Allowed) {
    @{ success = $false; error = "access_denied"; access = [string]$access } | ConvertTo-Json -Compress
    exit 0
  }
} catch {
  # Continue — some desktop hosts still return a position
}
$pos = Await ($geo.GetGeopositionAsync()) ([Windows.Devices.Geolocation.Geoposition])
$coord = $pos.Coordinate
@{
  success = $true
  latitude = $coord.Latitude
  longitude = $coord.Longitude
  accuracy = $coord.Accuracy
  altitude = $coord.Altitude
  timestamp = $pos.Coordinate.Timestamp.ToString('o')
} | ConvertTo-Json -Compress
`.trim();

async function reverseGeocode(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const providers = [
    {
      url: `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
      parse: (d) => {
        if (!d || !d.address) return null;
        const a = d.address;
        return {
          city: a.city || a.town || a.village || a.suburb || a.county || '',
          region: a.state || a.region || '',
          country: a.country || '',
          countryCode: (a.country_code || '').toUpperCase()
        };
      }
    },
    {
      url: `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      parse: (d) => (d && (d.city || d.countryName)) ? {
        city: d.city || d.locality || '',
        region: d.principalSubdivision || '',
        country: d.countryName || '',
        countryCode: d.countryCode || ''
      } : null
    }
  ];

  for (const provider of providers) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(provider.url, {
        headers: {
          'User-Agent': 'Ultron/1.0 (Electron; geolocation reverse geocode)',
          Accept: 'application/json'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const raw = await res.json();
      const parsed = provider.parse(raw);
      if (parsed && (parsed.city || parsed.country)) return parsed;
    } catch (e) {
      // try next provider
    }
  }
  return null;
}

/**
 * @param {(script: string) => Promise<{ stdout?: string, stderr?: string }>} runPowerShell
 */
async function getWindowsNativeLocation(runPowerShell) {
  if (process.platform !== 'win32' || typeof runPowerShell !== 'function') {
    return null;
  }

  try {
    const result = await runPowerShell(WINDOWS_GEO_SCRIPT);
    const combined = `${result?.stdout || ''}\n${result?.stderr || ''}`.trim();
    const jsonLine = combined.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('{')).pop();
    if (!jsonLine) return null;

    const parsed = JSON.parse(jsonLine);
    if (!parsed?.success || parsed.latitude == null || parsed.longitude == null) {
      return null;
    }

    const reverse = await reverseGeocode(parsed.latitude, parsed.longitude);
    return {
      city: reverse?.city || '',
      region: reverse?.region || '',
      country: reverse?.country || '',
      countryCode: reverse?.countryCode || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      accuracy: parsed.accuracy,
      source: 'windows-gps'
    };
  } catch (e) {
    return null;
  }
}

module.exports = { getWindowsNativeLocation, reverseGeocode };
