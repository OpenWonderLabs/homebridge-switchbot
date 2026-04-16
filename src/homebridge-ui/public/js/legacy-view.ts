// legacy-view.ts
// Renders the config UI from config.schema.json and toggles between legacy and dynamic UI

import schema from '../../../../config.schema.json'

function renderLegacyView() {
  const container = document.getElementById('legacyConfigForm')
  if (!container) {
    const legacyContainer = document.getElementById('legacyViewContainer')
    if (legacyContainer) {
      legacyContainer.innerHTML = '<div style="color:red;font-weight:bold">[SwitchBot UI] Error: legacyConfigForm container not found</div>'
    }
    console.error('[SwitchBot UI] Error: legacyConfigForm container not found')
    return
  }
  container.innerHTML = ''
  const { properties } = schema.schema
  const layout = schema.layout || []
  const form = document.createElement('form')
  for (const section of layout) {
    const fieldset = document.createElement('fieldset')
    if (section.title) {
      const legend = document.createElement('legend')
      legend.textContent = section.title
      fieldset.appendChild(legend)
    }
    for (const key of section.items) {
      const prop = properties[key]
      if (!prop) {
        continue
      }
      if (prop.type === 'array' && prop.items && prop.items.properties) {
        // Render array of devices as a table
        const table = document.createElement('table')
        table.style.marginBottom = '12px'
        const thead = document.createElement('thead')
        const headerRow = document.createElement('tr')
        for (const colKey of Object.keys(prop.items.properties)) {
          const th = document.createElement('th')
          th.textContent = prop.items.properties[colKey].title || colKey
          headerRow.appendChild(th)
        }
        thead.appendChild(headerRow)
        table.appendChild(thead)
        // No data rows (read-only legacy view)
        fieldset.appendChild(table)
        continue
      }
      const label = document.createElement('label')
      label.textContent = prop.title || key
      label.style.display = 'block'
      let input: HTMLElement
      if (prop.enum) {
        const select = document.createElement('select')
        select.name = key
        for (const opt of prop.enum) {
          const option = document.createElement('option')
          option.value = opt
          option.textContent = opt
          select.appendChild(option)
        }
        input = select
      } else if (prop.type === 'boolean') {
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.name = key
        if (prop.default) {
          checkbox.checked = true
        }
        input = checkbox
      } else {
        const text = document.createElement('input')
        text.name = key
        text.type = prop.format === 'password' ? 'password' : 'text'
        if (prop.default) {
          text.value = prop.default
        }
        input = text
      }
      label.appendChild(input)
      fieldset.appendChild(label)
    }
    form.appendChild(fieldset)
  }
  container.appendChild(form)
}

export function enableLegacyView() {
  document.getElementById('dynamicUiContainer')!.style.display = 'none'
  document.getElementById('legacyViewContainer')!.style.display = 'block'
  renderLegacyView()
}

// DEBUG: assign to window for browser access
// eslint-disable-next-line ts/ban-ts-comment
// @ts-ignore
window.enableLegacyView = enableLegacyView
// eslint-disable-next-line ts/ban-ts-comment
// @ts-ignore
window.disableLegacyView = disableLegacyView

export function disableLegacyView() {
  document.getElementById('dynamicUiContainer')!.style.display = 'block'
  document.getElementById('legacyViewContainer')!.style.display = 'none'
}

// (window assignment removed; handled in .js entry point)
