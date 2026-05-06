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

document.getElementById('legacyViewBtn')?.addEventListener('click', () => {
  enableLegacyView()
  updateViewButtons()
})
document.getElementById('dynamicViewBtn')?.addEventListener('click', () => {
  disableLegacyView()
  updateViewButtons()
})

document.addEventListener('DOMContentLoaded', updateViewButtons)
