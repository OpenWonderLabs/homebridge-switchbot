// --- Inlined legacy view logic to avoid ES module import/export issues ---

let legacySchema = null
async function loadLegacySchema() {
  if (legacySchema) {
    return legacySchema
  }
  const resp = await fetch('config.schema.json')
  if (!resp.ok) {
    throw new Error('Failed to load config.schema.json')
  }
  legacySchema = await resp.json()
  return legacySchema
}

async function renderLegacyView() {
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
  const schema = await loadLegacySchema()
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
      let input
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

async function enableLegacyView() {
  document.getElementById('dynamicUiContainer').style.display = 'none'
  document.getElementById('legacyViewContainer').style.display = 'block'
  await renderLegacyView()
}

function disableLegacyView() {
  document.getElementById('dynamicUiContainer').style.display = 'block'
  document.getElementById('legacyViewContainer').style.display = 'none'
}

// Toggle button visibility and view containers
function updateViewButtons() {
  const legacyBtn = document.getElementById('legacyViewBtn')
  const dynamicBtn = document.getElementById('dynamicViewBtn')
  const legacyContainer = document.getElementById('legacyViewContainer')
  if (legacyContainer && legacyContainer.style.display === 'block') {
    if (legacyBtn) {
      legacyBtn.style.display = 'none'
    }
    if (dynamicBtn) {
      dynamicBtn.style.display = 'inline-block'
    }
  } else {
    if (legacyBtn) {
      legacyBtn.style.display = 'inline-block'
    }
    if (dynamicBtn) {
      dynamicBtn.style.display = 'none'
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const legacyBtn = document.getElementById('legacyViewBtn')
  const dynamicBtn = document.getElementById('dynamicViewBtn')
  if (legacyBtn) {
    legacyBtn.addEventListener('click', () => {
      // eslint-disable-next-line no-console
      console.log('[SwitchBot UI] Legacy View button clicked')
      enableLegacyView()
      updateViewButtons()
    })
  }
  if (dynamicBtn) {
    dynamicBtn.addEventListener('click', () => {
      // eslint-disable-next-line no-console
      console.log('[SwitchBot UI] Dynamic View button clicked')
      disableLegacyView()
      updateViewButtons()
    })
  }
  updateViewButtons()
})
