import * as Multisynq from 'https://cdn.jsdelivr.net/npm/@multisynq/client@1.0.4/bundled/multisynq-client.esm.js'
import { GameModel, GameView } from './game-model.js'

// Launch screen logic
const launchScreen = document.getElementById('launch-screen')
const playerNameInput = document.getElementById('player-name')
const startBtn = document.getElementById('start-btn')
const startAudio = document.getElementById('start-audio')
const themeSong = document.getElementById('theme-song')

function startGame() {
  const name = playerNameInput.value.trim()
  if (!name) {
    playerNameInput.focus()
    playerNameInput.style.border = '2px solid #e91e63'
    return
  }
  // Store name globally or in sessionStorage if needed
  window.playerName = name
  launchScreen.style.display = 'none'

  // Stop start-audio and play theme-song
  startAudio.pause()
  startAudio.currentTime = 0
  themeSong.currentTime = 0
  themeSong.play().catch(() => {})

  // Now join the game
  Multisynq.Session.join({
    appId: 'monanimals.party.prototype',
    apiKey: '2I1XIVkN7NBwSLPDZGQHsUVRQpmmOJuZCeHWujQJos',
    name: Multisynq.App.autoSession(),
    password: Multisynq.App.autoPassword(),
    model: GameModel,
    view: GameView,
  })
  Multisynq.App.makeWidgetDock()

  // Force scroll to top (fixes iOS Safari viewport bug)
  window.scrollTo(0, 0)

  // Resize canvas to fit viewport
  const canvas = document.getElementById('game-canvas')
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}

startBtn.onclick = startGame
playerNameInput.onkeydown = e => {
  if (e.key === 'Enter') startGame()
}

// Play start-audio when launch screen is shown
window.addEventListener('DOMContentLoaded', () => {
  startAudio.currentTime = 0
  console.log('Playing start audio')

  startAudio.play().catch(e => console.log(e))
  // Some browsers require user interaction
})

// Optionally, focus input on load
playerNameInput.focus()
