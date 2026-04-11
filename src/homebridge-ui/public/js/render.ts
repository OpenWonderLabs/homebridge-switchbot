// Move regexes to module scope to avoid re-compilation on every call
// import type { DEVICE_TYPES } from './constants.js' // Removed unused import

const SPACES_REGEX = /\s/g
const CAMELCASE_REGEX = /([A-Z])/g
const FIRST_CHAR_REGEX = /^./

async function copyTextWithFallback(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    document.execCommand('copy')
    textarea.remove()
  }
}

/**
 * Get RSSI signal quality level and color based on dBm value
 * @param rssi Signal strength in dBm (typically -30 to -90)
 * @returns Object with quality level, color, and description
 */
export function getRssiSignalQuality(rssi: number | undefined): {
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'
  color: string
  bgColor: string
  description: string
  bars: number
} {
  if (!rssi || rssi === 0) {
    return {
      level: 'unknown',
      color: '#999',
      bgColor: '#f5f5f5',
      description: 'Signal strength unknown',
      bars: 0,
    }
  }

  const dbm = Math.floor(rssi)

  if (dbm > -60) {
    return {
      level: 'excellent',
      color: '#34a853',
      bgColor: '#e8f5e9',
      description: `Excellent (${dbm} dBm)`,
      bars: 4,
    }
  } else if (dbm > -75) {
    return {
      level: 'good',
      color: '#fbbc04',
      bgColor: '#fffde7',
      description: `Good (${dbm} dBm)`,
      bars: 3,
    }
  } else if (dbm > -85) {
    return {
      level: 'fair',
      color: '#ff9800',
      bgColor: '#fff3e0',
      description: `Fair (${dbm} dBm)`,
      bars: 2,
    }
  } else {
    return {
      level: 'poor',
      color: '#ea4335',
      bgColor: '#ffebee',
      description: `Poor (${dbm} dBm) - unreliable`,
      bars: 1,
    }
  }
}

/**
 * Create visual signal strength indicator bars
 * @param rssi Signal strength in dBm
 * @returns HTML element showing filled bars
 */
export function renderSignalBars(rssi: number | undefined): HTMLElement {
  const quality = getRssiSignalQuality(rssi)

  const container = document.createElement('span')
  container.style.display = 'inline-flex'
  container.style.gap = '2px'
  container.style.alignItems = 'center'
  container.style.marginLeft = '8px'
  container.style.fontSize = '12px'

  // Create 4 bars
  for (let i = 1; i <= 4; i++) {
    const bar = document.createElement('span')
    bar.style.height = `${i * 3}px`
    bar.style.width = '3px'
    bar.style.borderRadius = '1px'
    bar.style.border = `1px solid ${quality.color}`

    if (i <= quality.bars) {
      bar.style.backgroundColor = quality.color
    } else {
      bar.style.backgroundColor = 'transparent'
    }

    container.appendChild(bar)
  }

  // Add tooltip
  container.title = quality.description

  return container
}

/**
 * Create signal quality badge with color
 * @param rssi Signal strength in dBm
 * @returns HTML element showing quality level
 */
export function renderSignalQualityBadge(rssi: number | undefined): HTMLElement {
  const quality = getRssiSignalQuality(rssi)

  const badge = document.createElement('span')
  badge.textContent = quality.level.charAt(0).toUpperCase() + quality.level.slice(1)
  badge.style.cssText = `
    background: ${quality.color};
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
  `
  badge.title = quality.description

  return badge
}

export function renderBadge(text: string, style: string): HTMLElement {
  const badge = document.createElement('span')
  badge.textContent = text
  badge.style.cssText = style
  return badge
}

export function renderConnectionBadge(connectionType: string): HTMLElement | null {
  if (!connectionType) {
    return null
  }

  const badge = renderBadge(connectionType, '')

  if (connectionType === 'BLE') {
    badge.style.cssText
      = 'background: #4285f4; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 8px;'
  } else if (connectionType === 'Both') {
    badge.style.cssText
      = 'background: #34a853; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 8px;'
  } else {
    badge.style.cssText
      = 'background: #9e9e9e; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 8px;'
  }

  return badge
}

export function renderIRBadge(): HTMLElement {
  return renderBadge(
    'IR',
    'background: #ff6b35; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 8px;',
  )
}

function normalizeId(value: any): string {
  return String(value ?? '').trim().toLowerCase()
}

function scrollToConfiguredDevice(deviceId: string): void {
  const normalizedId = normalizeId(deviceId)
  const target = document.querySelector(`[data-device-id="${normalizedId}"]`) as HTMLElement | null
  if (!target) {
    return
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const originalOutline = target.style.outline
  const originalBackground = target.style.background
  target.style.outline = '2px solid var(--switchbot-red, #ef4444)'
  target.style.background = 'rgba(239, 68, 68, 0.08)'
  setTimeout(() => {
    target.style.outline = originalOutline
    target.style.background = originalBackground
  }, 1800)
}

function createConnectionTestControls(device: any): HTMLElement {
  const controls = document.createElement('div')
  controls.style.display = 'inline-flex'
  controls.style.alignItems = 'center'
  controls.style.gap = '6px'

  const button = document.createElement('button')
  button.textContent = 'Test Connection'
  button.className = 'secondary'
  button.style.padding = '4px 9px'
  button.style.fontSize = '11px'

  const status = document.createElement('span')
  status.style.fontSize = '10px'
  status.style.opacity = '0.85'
  status.style.whiteSpace = 'normal'
  status.style.overflowWrap = 'anywhere'

  button.onclick = async () => {
    const startedAt = Date.now()
    button.disabled = true
    button.textContent = 'Testing...'
    status.textContent = 'Checking...'
    status.style.color = '#6b7280'

    try {
      const { testDeviceConnection } = await import('./api.js')
      const result = await testDeviceConnection({
        deviceId: String(device?.id || device?.deviceId || ''),
        connectionType: device?.connectionType,
        address: device?.address,
      })

      const measuredLatency = Number(result?.latencyMs) > 0
        ? Number(result.latencyMs)
        : Date.now() - startedAt

      if (result?.success) {
        const method = result?.method || 'Auto'
        status.textContent = `✓ ${method} · ${measuredLatency}ms`
        status.style.color = '#16a34a'
      } else {
        const detail = result?.message ? ` · ${result.message}` : ''
        status.textContent = `✗ Failed · ${measuredLatency}ms${detail}`
        status.style.color = '#dc2626'
      }
    } catch (e) {
      status.textContent = `✗ Failed · ${Date.now() - startedAt}ms`
      status.style.color = '#dc2626'
    } finally {
      button.disabled = false
      button.textContent = 'Test Connection'
    }
  }

  controls.appendChild(button)
  controls.appendChild(status)
  return controls
}

function formatLastSeen(value: any): string {
  if (!value) {
    return 'N/A'
  }
  try {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
  } catch (_e) {
    return String(value)
  }
}

export function renderDeviceDetailsPanel(device: any): HTMLElement {
  const details = document.createElement('div')
  details.className = 'device-details-panel'
  details.style.borderTop = '1px solid #ddd'
  details.style.padding = '8px'
  details.style.borderRadius = '4px'
  details.style.fontSize = '12px'
  details.style.marginTop = '4px'

  // --- Battery history trending ---
  // Persist battery readings in localStorage per device
  const batteryHistoryKey = `batteryHistory:${device?.id || device?.deviceId}`
  let batteryHistory: Array<{ value: number, ts: number }> = []
  try {
    const raw = localStorage.getItem(batteryHistoryKey)
    if (raw) {
      batteryHistory = JSON.parse(raw)
    }
  } catch (e) {
    // Optionally log or handle error
  }
  const now = Date.now()
  if (typeof device?.battery === 'number') {
    // Only add if different from last or >1h since last
    const last = batteryHistory.at(-1)
    if (!last || last.value !== device.battery || now - last.ts > 60 * 60 * 1000) {
      batteryHistory.push({ value: device.battery, ts: now })
      // Keep only last 30 entries (about a month if daily)
      if (batteryHistory.length > 30) {
        batteryHistory = batteryHistory.slice(-30)
      }
      try {
        localStorage.setItem(batteryHistoryKey, JSON.stringify(batteryHistory))
      } catch (e) {
        // Optionally log or handle error
      }
    }
  }

  const rows: Array<{ label: string, value: string, copyable?: boolean }> = [
    { label: 'Name', value: String(device?.name || device?.configDeviceName || 'N/A') },
    { label: 'Device ID', value: String(device?.id || device?.deviceId || 'N/A'), copyable: !!(device?.id || device?.deviceId) },
    { label: 'MAC Address', value: String(device?.address || 'N/A'), copyable: !!device?.address },
    { label: 'Device Type', value: String(device?.type || device?.configDeviceType || 'N/A') },
    { label: 'Model', value: String(device?.model || 'N/A') },
    { label: 'Hub ID', value: String(device?.hubDeviceId || 'N/A') },
    { label: 'Battery', value: device?.battery !== undefined && device?.battery !== null ? `${device.battery}%` : 'N/A' },
    { label: 'Firmware', value: String(device?.version || device?.firmware || 'N/A') },
    { label: 'Cloud Service', value: device?.enabled === false ? 'Disabled' : 'Enabled' },
    { label: 'Last Seen', value: formatLastSeen(device?.lastSeen || device?.lastseen || device?.updatedAt) },
  ]

  for (const row of rows) {
    const line = document.createElement('div')
    line.style.display = 'flex'
    line.style.alignItems = 'center'
    line.style.justifyContent = 'space-between'
    line.style.gap = '8px'
    line.style.padding = '2px 0'

    const label = document.createElement('span')
    label.style.fontWeight = '600'
    label.style.minWidth = '110px'
    label.textContent = `${row.label}:`

    const valueWrap = document.createElement('span')
    valueWrap.style.display = 'inline-flex'
    valueWrap.style.alignItems = 'center'
    valueWrap.style.gap = '6px'
    valueWrap.style.flex = '1'
    valueWrap.style.justifyContent = 'flex-end'
    valueWrap.style.minWidth = '0'

    const value = document.createElement('span')
    value.style.fontFamily = 'monospace'
    value.style.fontSize = '11px'
    value.style.opacity = '0.9'
    value.style.whiteSpace = 'normal'
    value.style.overflowWrap = 'anywhere'
    value.style.wordBreak = 'break-word'
    value.style.textAlign = 'right'
    value.textContent = row.value

    valueWrap.appendChild(value)

    if (row.copyable && row.value && row.value !== 'N/A') {
      const copyBtn = document.createElement('button')
      copyBtn.textContent = '📋'
      copyBtn.title = `Copy ${row.label}`
      copyBtn.style.padding = '2px 6px'
      copyBtn.style.fontSize = '10px'
      copyBtn.style.lineHeight = '1'
      copyBtn.style.background = '#e5e7eb'
      copyBtn.style.color = '#111827'

      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(row.value)
          copyBtn.textContent = '✓'
          setTimeout(() => {
            copyBtn.textContent = '📋'
          }, 1200)
        } catch (_e) {
          copyBtn.textContent = '!'
          setTimeout(() => {
            copyBtn.textContent = '📋'
          }, 1200)
        }
      }

      valueWrap.appendChild(copyBtn)
    }

    line.appendChild(label)
    line.appendChild(valueWrap)
    details.appendChild(line)

    // If this is the Battery row, add a sparkline chart below
    if (row.label === 'Battery' && Array.isArray(batteryHistory) && batteryHistory.length > 1) {
      const chart = document.createElement('div')
      chart.style.margin = '2px 0 8px 0'
      chart.style.width = '100%'
      chart.style.height = '28px'
      chart.style.display = 'flex'
      // SVG sparkline
      const w = 120
      const h = 24
      const pad = 2
      const min = Math.min(...batteryHistory.map(b => b.value), 100)
      const max = Math.max(...batteryHistory.map(b => b.value), 0)
      const range = max - min || 1
      const points = batteryHistory.map((b, i) => {
        const x = pad + (i * (w - 2 * pad)) / (batteryHistory.length - 1)
        const y = pad + (h - 2 * pad) * (1 - (b.value - min) / range)
        return `${x},${y}`
      }).join(' ')
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', String(w))
      svg.setAttribute('height', String(h))
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      svg.style.display = 'block'
      svg.style.background = '#f3f4f6'
      svg.style.borderRadius = '3px'
      svg.style.marginTop = '2px'
      svg.style.boxShadow = '0 1px 2px #0001'
      // Polyline for trend
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
      polyline.setAttribute('points', points)
      polyline.setAttribute('fill', 'none')
      polyline.setAttribute('stroke', '#2563eb')
      polyline.setAttribute('stroke-width', '2')
      svg.appendChild(polyline)
      // Dots for each point
      batteryHistory.forEach((b, i) => {
        const x = pad + (i * (w - 2 * pad)) / (batteryHistory.length - 1)
        const y = pad + (h - 2 * pad) * (1 - (b.value - min) / range)
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        circle.setAttribute('cx', String(x))
        circle.setAttribute('cy', String(y))
        circle.setAttribute('r', '2.5')
        circle.setAttribute('fill', '#2563eb')
        svg.appendChild(circle)
      })
      // Min/max labels
      const minLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      minLabel.setAttribute('x', '2')
      minLabel.setAttribute('y', String(h - 2))
      minLabel.setAttribute('font-size', '9')
      minLabel.setAttribute('fill', '#888')
      minLabel.textContent = `${min}%`
      svg.appendChild(minLabel)
      const maxLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      maxLabel.setAttribute('x', String(w - 18))
      maxLabel.setAttribute('y', '10')
      maxLabel.setAttribute('font-size', '9')
      maxLabel.setAttribute('fill', '#888')
      maxLabel.textContent = `${max}%`
      svg.appendChild(maxLabel)
      chart.appendChild(svg)
      details.appendChild(chart)
    }
  }

  // --- Expose advanced/extra features dynamically ---
  const featureKeys = [
    'airQuality',
    'pm25',
    'pm10',
    'voc',
    'co2',
    'humidity',
    'temperature',
    'preset',
    'mode',
    'presetMode',
    'direction',
    'calibration',
    'multiCommand',
    'extendedInfo',
    'segmentedControl',
    'features',
    'capabilities',
    'state',
  ]
  const shown = new Set(rows.map(r => r.label.toLowerCase().replace(SPACES_REGEX, '')))
  for (const key of featureKeys) {
    if (device && device[key] !== undefined && !shown.has(key.toLowerCase())) {
      const line = document.createElement('div')
      line.style.display = 'flex'
      line.style.alignItems = 'center'
      line.style.justifyContent = 'space-between'
      line.style.gap = '8px'
      line.style.padding = '2px 0'

      const label = document.createElement('span')
      label.style.fontWeight = '600'
      label.style.minWidth = '110px'
      label.textContent = `${key.replace(CAMELCASE_REGEX, ' $1').replace(FIRST_CHAR_REGEX, s => s.toUpperCase())}:`

      const value = document.createElement('span')
      value.style.fontFamily = 'monospace'
      value.style.fontSize = '11px'
      value.style.opacity = '0.9'
      value.style.whiteSpace = 'normal'
      value.style.overflowWrap = 'anywhere'
      value.style.wordBreak = 'break-word'
      value.style.textAlign = 'right'
      value.textContent = typeof device[key] === 'object' ? JSON.stringify(device[key]) : String(device[key])

      line.appendChild(label)
      line.appendChild(value)
      details.appendChild(line)
    }
  }

  return details
}

export async function renderDiscoveredDevices(
  devices: any[],
  options: {
    configuredIds?: Set<string>
    selectedIds?: Set<string>
    onToggleSelect?: (device: any, selected: boolean) => void
  } = {},
): Promise<HTMLElement> {
  const ul = document.createElement('ul')
  ul.className = 'device-grid'
  ul.style.maxHeight = '400px'
  ul.style.overflowY = 'auto'
  ul.style.marginTop = '12px'
  ul.style.padding = '0'
  ul.style.listStyle = 'none'

  const { addDeviceToConfig } = await import('./discovery.js')
  const { loadConfiguredDevices } = await import('./devices.js')
  const configuredIds = options.configuredIds ?? new Set<string>()
  const selectedIds = options.selectedIds ?? new Set<string>()
  const onToggleSelect = options.onToggleSelect

  for (const d of devices) {
    // Defensive check: warn if device is missing id, name, or type
    if (!d || (!d.id && !d.deviceId) || (!d.name && !d.type)) {
      console.warn('[SwitchBot][Discovery][renderDiscoveredDevices] Device missing required fields:', d)
    }
    const deviceId = normalizeId(d.id)
    const alreadyAdded = configuredIds.has(deviceId)

    const li = document.createElement('li')
    li.className = 'device-item'
    li.style.display = 'flex'
    li.style.flexDirection = 'column'
    li.style.alignItems = 'stretch'
    li.style.justifyContent = 'flex-start'
    li.style.padding = '5px 8px'
    li.style.marginBottom = '0'
    li.style.borderRadius = '5px'
    li.style.transition = 'all 0.2s ease'

    const info = document.createElement('div')
    info.style.flex = '1 1 auto'
    info.style.width = '100%'
    info.style.minWidth = '0'

    const nameContainer = document.createElement('div')
    nameContainer.style.display = 'flex'
    nameContainer.style.alignItems = 'center'
    nameContainer.style.marginBottom = '0'
    nameContainer.style.flexWrap = 'wrap'
    nameContainer.style.gap = '4px'

    const name = document.createElement('div')
    name.style.fontWeight = '500'
    name.style.fontSize = '13px'
    name.textContent = d.name || d.id

    const selectCheckbox = document.createElement('input')
    selectCheckbox.type = 'checkbox'
    selectCheckbox.style.width = 'auto'
    selectCheckbox.style.margin = '0 2px 0 0'
    selectCheckbox.checked = selectedIds.has(deviceId)
    if (alreadyAdded) {
      selectCheckbox.disabled = true
      selectCheckbox.title = 'Already configured'
    }
    selectCheckbox.onchange = () => {
      onToggleSelect?.(d, selectCheckbox.checked)
      // Notify listeners (e.g., batch buttons) of selection change
      window.dispatchEvent(new CustomEvent('discovery-selection-changed'))
    }

    nameContainer.appendChild(selectCheckbox)

    nameContainer.appendChild(name)

    // Show firmware update available indicator if present
    if (d.firmwareUpdateAvailable) {
      const fwBadge = document.createElement('span')
      fwBadge.textContent = 'Update Available'
      fwBadge.style.cssText = 'background: #fb923c; color: #111; padding: 1px 7px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 6px;'
      fwBadge.title = 'A firmware update is available for this device.'
      nameContainer.appendChild(fwBadge)
    }

    // Show offline/unreachable indicator if device is offline
    let offline = false
    const lastSeen = d.lastSeen || d.lastseen || d.updatedAt
    if (typeof d.offline === 'boolean') {
      offline = d.offline
    } else if (lastSeen) {
      try {
        const last = new Date(lastSeen).getTime()
        if (!Number.isNaN(last)) {
          if (Date.now() - last > 1000 * 60 * 60) { // 1 hour
            offline = true
          }
        }
      } catch {}
    }
    if (offline) {
      const offlineBadge = document.createElement('span')
      offlineBadge.textContent = 'Offline'
      offlineBadge.style.cssText = 'background: #dc2626; color: white; padding: 1px 7px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 6px;'
      offlineBadge.title = 'Device is offline or unreachable.'
      nameContainer.appendChild(offlineBadge)
    }

    const expandedDetails = document.createElement('div')
    expandedDetails.style.display = 'none'
    expandedDetails.appendChild(renderDeviceDetailsPanel(d))

    const expandBtn = document.createElement('button')
    expandBtn.textContent = '▾'
    expandBtn.title = 'Show details'
    expandBtn.style.padding = '2px 6px'
    expandBtn.style.fontSize = '11px'
    expandBtn.style.marginLeft = '4px'
    expandBtn.style.background = '#e5e7eb'
    expandBtn.style.color = '#111827'
    expandBtn.style.transition = 'transform 0.2s ease'
    expandBtn.onclick = () => {
      const isHidden = expandedDetails.style.display === 'none'
      expandedDetails.style.display = isHidden ? 'block' : 'none'
      expandBtn.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)'
    }
    nameContainer.appendChild(expandBtn)

    const duplicateBadge = document.createElement('span')
    duplicateBadge.textContent = alreadyAdded ? '✓ Already Added' : '➕ New Device'
    duplicateBadge.style.cssText = alreadyAdded
      ? 'background: #16a34a; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: 600;'
      : 'background: #2563eb; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: 600;'
    nameContainer.appendChild(duplicateBadge)

    // Add connection type badge
    if (d.connectionType) {
      const badge = renderConnectionBadge(d.connectionType)
      if (badge) {
        nameContainer.appendChild(badge)
      }
    }

    // Add IR badge if it's an IR device
    if (d.isIR) {
      nameContainer.appendChild(renderIRBadge())
    }

    // Add signal strength visualization (only for BLE/wireless devices)
    if (d.rssi !== undefined && d.rssi !== null && d.rssi !== 0) {
      nameContainer.appendChild(renderSignalBars(d.rssi))
      nameContainer.appendChild(renderSignalQualityBadge(d.rssi))
    }

    // Add battery warning indicator if battery < 20%
    if (typeof d.battery === 'number' && d.battery < 20) {
      const batteryWarn = document.createElement('span')
      batteryWarn.textContent = `⚠️ ${d.battery}%`
      batteryWarn.style.cssText
        = d.battery < 10
          ? 'background: #dc2626; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 6px;'
          : 'background: #fbbf24; color: #111; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 6px;'
      batteryWarn.title = d.battery < 10 ? 'Battery critically low' : 'Battery low'
      nameContainer.appendChild(batteryWarn)
    }

    // Defensive check: warn if device is missing id, name, or type (for details panel)
    if (!d || (!d.id && !d.deviceId) || (!d.name && !d.type)) {
      console.warn('[SwitchBot][Discovery][renderDeviceDetailsPanel] Device missing required fields:', d)
    }
    const details = document.createElement('div')
    details.style.fontSize = '10px'
    details.style.opacity = '0.7'
    details.style.marginTop = '0'
    details.style.fontFamily = 'monospace'
    details.style.whiteSpace = 'normal'
    details.style.overflowWrap = 'anywhere'
    details.style.wordBreak = 'break-word'

    let detailsText = `ID: ${d.id} | Type: ${d.type} | Model: ${d.model || 'N/A'}`
    if (d.hubDeviceId) {
      detailsText += ` | Hub: ${d.hubDeviceId}`
    }
    if (d.address) {
      detailsText += ` | MAC: ${d.address}`
    }
    details.textContent = detailsText

    info.appendChild(nameContainer)
    info.appendChild(details)
    info.appendChild(expandedDetails)

    const addBtn = document.createElement('button')
    addBtn.textContent = alreadyAdded ? 'Already Added' : 'Add to Config'
    addBtn.style.marginLeft = '0'
    addBtn.style.marginTop = '2px'
    addBtn.style.padding = '4px 9px'
    addBtn.style.fontSize = '11px'
    addBtn.style.whiteSpace = 'nowrap'
    addBtn.style.flexShrink = '0'
    addBtn.disabled = alreadyAdded
    if (alreadyAdded) {
      addBtn.style.opacity = '0.65'
      addBtn.style.cursor = 'not-allowed'
      addBtn.style.background = '#6b7280'
    }
    addBtn.onclick = async () => {
      if (alreadyAdded) {
        return
      }
      await addDeviceToConfig(d)
    }

    if (alreadyAdded) {
      const viewBtn = document.createElement('button')
      viewBtn.textContent = 'View in Config'
      viewBtn.className = 'secondary'
      viewBtn.style.marginLeft = '0'
      viewBtn.style.padding = '4px 9px'
      viewBtn.style.fontSize = '11px'
      viewBtn.onclick = async () => {
        await loadConfiguredDevices()
        scrollToConfiguredDevice(d.id)
      }
      li.appendChild(info)
      const actions = document.createElement('div')
      actions.className = 'device-actions'
      actions.style.display = 'flex'
      actions.style.alignItems = 'center'
      actions.style.flexWrap = 'wrap'
      actions.style.justifyContent = 'flex-start'
      actions.style.marginLeft = '0'
      actions.style.width = '100%'
      actions.style.marginTop = '2px'
      actions.style.gap = '5px'
      actions.appendChild(viewBtn)
      actions.appendChild(addBtn)
      actions.appendChild(createConnectionTestControls(d))
      li.appendChild(actions)
      ul.appendChild(li)
      continue
    }

    const actions = document.createElement('div')
    actions.className = 'device-actions'
    actions.style.display = 'flex'
    actions.style.flexWrap = 'wrap'
    actions.style.justifyContent = 'flex-start'
    actions.style.marginLeft = '0'
    actions.style.width = '100%'
    actions.style.marginTop = '2px'
    actions.style.gap = '5px'
    actions.appendChild(addBtn)
    actions.appendChild(createConnectionTestControls(d))

    li.appendChild(info)
    li.appendChild(actions)
    ul.appendChild(li)
  }

  return ul
}

/**
 * Filter devices by connection type and search query
 * @param devices Discovered devices array
 * @param connectionType Filter: 'all' | 'ble' | 'api' | 'both' | 'ir'
 * @param searchQuery Search term to match against name/id/type
 * @returns Filtered devices array
 */
export function filterDevices(
  devices: any[],
  connectionType: 'all' | 'ble' | 'api' | 'both' | 'ir' = 'all',
  searchQuery = '',
): any[] {
  let filtered = [...devices]

  // Filter by connection type
  if (connectionType !== 'all') {
    filtered = filtered.filter((d) => {
      if (connectionType === 'ir') {
        return d.isIR === true
      }
      if (connectionType === 'ble') {
        return d.connectionType === 'BLE' || d.connectionType?.includes('BLE')
      }
      if (connectionType === 'api') {
        return d.connectionType === 'OpenAPI' || d.connectionType === 'API' || d.connectionType?.includes('API')
      }
      if (connectionType === 'both') {
        return d.connectionType === 'Both' || d.connectionType?.includes('Both')
      }
      return true
    })
  }

  // Filter by search query
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase()
    filtered = filtered.filter((d) => {
      const name = (d.name || '').toLowerCase()
      const id = (d.id || '').toLowerCase()
      const type = (d.type || '').toLowerCase()
      const model = (d.model || '').toLowerCase()
      return name.includes(query) || id.includes(query) || type.includes(query) || model.includes(query)
    })
  }

  return filtered
}

/**
 * Sort devices by specified criteria
 * @param devices Devices array to sort
 * @param sortBy Sort criterion: 'name' | 'signal' | 'type' | 'connection'
 * @returns Sorted devices array
 */
export function sortDevices(
  devices: any[],
  sortBy: 'name' | 'signal' | 'type' | 'connection' = 'name',
): any[] {
  const sorted = [...devices]

  switch (sortBy) {
    case 'signal': {
      // Sort by RSSI descending (strongest signal first)
      sorted.sort((a, b) => {
        const aRssi = a.rssi || 0
        const bRssi = b.rssi || 0
        return bRssi - aRssi // Descending order (higher is stronger)
      })
      break
    }
    case 'type': {
      // Sort by device type alphabetically
      sorted.sort((a, b) => {
        const aType = (a.type || '').localeCompare(b.type || '')
        return aType
      })
      break
    }
    case 'connection': {
      // Sort by connection type: Both > BLE > OpenAPI > Others
      const connectionOrder: Record<string, number> = {
        Both: 0,
        BLE: 1,
        OpenAPI: 2,
        API: 2,
        Unknown: 3,
      }
      sorted.sort((a, b) => {
        const aOrder = connectionOrder[a.connectionType || 'Unknown'] ?? 3
        const bOrder = connectionOrder[b.connectionType || 'Unknown'] ?? 3
        return aOrder - bOrder
      })
      break
    }
    case 'name':
    default: {
      // Sort by name alphabetically
      sorted.sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || ''))
      break
    }
  }

  return sorted
}

/**
 * Get filter/sort preferences from localStorage
 * @returns Object with current filter and sort preferences
 */
export function getDiscoveryPreferences(): {
  connectionType: 'all' | 'ble' | 'api' | 'both' | 'ir'
  sortBy: 'name' | 'signal' | 'type' | 'connection'
  searchQuery: string
} {
  try {
    const stored = localStorage.getItem('discoveryPreferences')
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (_e) {
    // Ignore parse errors
  }

  return {
    connectionType: 'all',
    sortBy: 'name',
    searchQuery: '',
  }
}

/**
 * Save filter/sort preferences to localStorage
 * @param preferences Preferences object to save
 * @param preferences.connectionType Connection type filter
 * @param preferences.sortBy Sort criterion
 * @param preferences.searchQuery Search query string
 */
export function setDiscoveryPreferences(preferences: {
  connectionType: 'all' | 'ble' | 'api' | 'both' | 'ir'
  sortBy: 'name' | 'signal' | 'type' | 'connection'
  searchQuery: string
}): void {
  try {
    localStorage.setItem('discoveryPreferences', JSON.stringify(preferences))
  } catch (_e) {
    // Ignore storage errors
  }
}

export function renderDeviceList(list: any[]): void {
  const ul = document.getElementById('devices')
  const status = document.getElementById('status')
  const removeAllContainer = document.getElementById('removeAllContainer')

  if (!ul || !status) {
    return
  }

  if (!list.length) {
    status.textContent = 'No devices found in config.'
    ul.innerHTML = ''
    // Hide remove all button when no devices
    if (removeAllContainer) {
      removeAllContainer.style.display = 'none'
    }
    return
  }

  status.textContent = `Found ${list.length} device(s)`
  ul.classList.add('device-grid')
  ul.style.padding = '0'
  ul.innerHTML = ''

  // Show remove all button when devices exist
  if (removeAllContainer) {
    removeAllContainer.style.display = 'block'
  }

  for (const d of list) {
    const li = document.createElement('li')
    li.className = 'device-item'
    li.setAttribute('data-device-id', normalizeId(d.id))
    li.style.display = 'flex'
    li.style.flexDirection = 'column'
    li.style.alignItems = 'stretch'
    li.style.padding = '5px 8px'
    li.style.marginBottom = '0'

    const info = document.createElement('div')
    info.style.flex = '1 1 auto'
    info.style.width = '100%'
    info.style.minWidth = '0'

    const nameContainer = document.createElement('div')
    nameContainer.style.display = 'flex'
    nameContainer.style.alignItems = 'center'
    nameContainer.style.marginBottom = '0'
    nameContainer.style.flexWrap = 'wrap'
    nameContainer.style.gap = '4px'

    const name = document.createElement('div')
    name.style.fontWeight = '500'
    name.style.fontSize = '13px'
    name.textContent = d.configDeviceName || d.name || d.id

    const expandedDetails = document.createElement('div')
    expandedDetails.style.display = 'none'
    expandedDetails.appendChild(renderDeviceDetailsPanel(d))

    const expandBtn = document.createElement('button')
    expandBtn.textContent = '▾'
    expandBtn.title = 'Show details'
    expandBtn.style.padding = '2px 6px'
    expandBtn.style.fontSize = '11px'
    expandBtn.style.marginLeft = '4px'
    expandBtn.style.background = '#e5e7eb'
    expandBtn.style.color = '#111827'
    expandBtn.style.transition = 'transform 0.2s ease'
    expandBtn.onclick = () => {
      const isHidden = expandedDetails.style.display === 'none'
      expandedDetails.style.display = isHidden ? 'block' : 'none'
      expandBtn.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)'
    }

    nameContainer.appendChild(name)
    nameContainer.appendChild(expandBtn)

    // Add signal strength visualization if RSSI is available
    if (d.rssi !== undefined && d.rssi !== null && d.rssi !== 0) {
      nameContainer.appendChild(renderSignalBars(d.rssi))
      nameContainer.appendChild(renderSignalQualityBadge(d.rssi))
    }

    const meta = document.createElement('div')
    meta.style.opacity = '0.7'
    meta.style.fontSize = '10px'
    meta.style.fontFamily = 'monospace'

    const deviceIdentifier = d.deviceId || d.id
    const id = `ID: ${deviceIdentifier}`
    const typeText = d.configDeviceType || d.type ? `Type: ${d.configDeviceType || d.type}` : ''
    const connText = d.connectionPreference ? `Conn: ${d.connectionPreference}` : ''
    const extText = d.externalPublishProtocol && d.externalPublishProtocol !== 'none' ? `external: ${d.externalPublishProtocol}` : ''
    const roomText = d.room ? `Room: ${d.room}` : ''
    meta.textContent = [id, typeText, connText, extText, roomText].filter(Boolean).join(' | ')

    info.appendChild(nameContainer)
    info.appendChild(meta)
    info.appendChild(expandedDetails)

    const buttons = document.createElement('div')
    buttons.className = 'device-actions'
    buttons.style.display = 'flex'
    buttons.style.flexWrap = 'wrap'
    buttons.style.justifyContent = 'flex-start'
    buttons.style.marginLeft = '0'
    buttons.style.width = '100%'
    buttons.style.marginTop = '2px'
    buttons.style.gap = '5px'

    const editBtn = document.createElement('button')
    editBtn.textContent = '✏️ Edit'
    editBtn.style.padding = '4px 9px'
    editBtn.style.fontSize = '11px'
    editBtn.onclick = async () => {
      const { editDevice } = await import('./modals.js')
      await editDevice(d)
    }

    const copyBtn = document.createElement('button')
    copyBtn.textContent = 'Copy ID'
    copyBtn.style.padding = '4px 9px'
    copyBtn.style.fontSize = '11px'
    copyBtn.addEventListener('click', async () => {
      try {
        if (deviceIdentifier) {
          await copyTextWithFallback(deviceIdentifier)
        }
        copyBtn.textContent = 'Copied'
        copyBtn.classList.add('success')
        setTimeout(() => {
          copyBtn.textContent = 'Copy ID'
          copyBtn.classList.remove('success')
        }, 1200)
      } catch (e) {
        copyBtn.textContent = 'Failed'
        copyBtn.classList.add('error')
        setTimeout(() => {
          copyBtn.textContent = 'Copy ID'
          copyBtn.classList.remove('error')
        }, 1200)
      }
    })

    const deleteBtn = document.createElement('button')
    deleteBtn.textContent = '🗑️ Delete'
    deleteBtn.style.padding = '4px 9px'
    deleteBtn.style.fontSize = '11px'
    deleteBtn.style.background = '#ef4444'
    deleteBtn.onclick = async () => {
      const { deleteDeviceFromConfig } = await import('./devices-delete.js')
      await deleteDeviceFromConfig(d.id || d.deviceId, d.name || d.id || d.deviceId)
    }

    buttons.appendChild(editBtn)
    buttons.appendChild(copyBtn)
    buttons.appendChild(deleteBtn)
    buttons.appendChild(createConnectionTestControls(d))

    li.appendChild(info)
    li.appendChild(buttons)
    ul.appendChild(li)
  }

  // No return value needed for void function
}
