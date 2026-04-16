import { disableLegacyView, enableLegacyView } from './legacy-view.js'

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
