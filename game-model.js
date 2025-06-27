import * as Multisynq from 'https://cdn.jsdelivr.net/npm/@multisynq/client@1.0.4/bundled/multisynq-client.esm.js'
import { PlayerModel } from './player.js'
import { POTION_TYPES } from './potion.js'

// Virtual game world size (fixed for all devices)
const GAME_WIDTH = 1000
const GAME_HEIGHT = 1000

export class GameModel extends Multisynq.Model {
  init(_, persisted) {
    this.players = new Map()

    this.safeArea = {
      x: GAME_WIDTH * 0.09,
      y: GAME_HEIGHT * 0.11,
      width: GAME_WIDTH * 0.82,
      height: GAME_HEIGHT * 0.78,
    }

    this.nameMap = persisted?.nameMap ?? {}
    this.potions = []

    // Fix: Ensure scoreboard is always a Map
    if (persisted?.scoreboard instanceof Map) {
      this.scoreboard = persisted.scoreboard
    } else if (
      persisted?.scoreboard &&
      typeof persisted.scoreboard === 'object'
    ) {
      this.scoreboard = new Map(Object.entries(persisted.scoreboard))
    } else {
      this.scoreboard = new Map()
    }

    this.potions = this.spawnPotions(3)

    this.subscribe(this.sessionId, 'view-join', this.viewJoined)

    this.subscribe(this.sessionId, 'view-exit', this.viewExited)

    this.subscribe(this.sessionId, 'set-name', this.setName)

    this.mainLoop()
  }

  viewJoined(viewId) {
    const player = PlayerModel.create({ viewId })

    // Assign a random image
    const images = ['chog.svg', 'molandak.svg']
    player.sprite = images[Math.floor(Math.random() * images.length)]

    // Spawn at random position inside safe area
    if (this.safeArea) {
      player.x = this.safeArea.x + Math.random() * this.safeArea.width
      player.y = this.safeArea.y + Math.random() * this.safeArea.height
    } else {
      // Fallback if safeArea not set yet
      player.x = 100 + Math.random() * 800
      player.y = 100 + Math.random() * 800
    }

    this.players.set(viewId, player)
    console.log(`Player ${viewId} joined the game.`)
  }

  viewExited(viewId) {
    const player = this.players.get(viewId)
    this.players.delete(viewId)
    player.destroy()

    console.log(`Player ${viewId} exited the game.`)
  }

  mainLoop() {
    for (const player of this.players.values()) {
      if (!player.lost) player.move()
    }
    this.checkPotionCollisions()
    this.checkPlayerCollisions()
    this.checkPlayerBounds() // <-- Add this line
    this.future(50).mainLoop() // move & check every 50 msdd
  }

  checkPlayerBounds() {
    for (const player of this.players.values()) {
      if (player.lost || !this.safeArea) continue
      if (
        player.x < this.safeArea.x ||
        player.x > this.safeArea.x + this.safeArea.width ||
        player.y < this.safeArea.y ||
        player.y > this.safeArea.y + this.safeArea.height
      ) {
        player.lost = true

        if (player.lastPushedBy) {
          const pusherViewId = player.lastPushedBy

          console.log(
            `Player ${player.viewId} was pushed by ${pusherViewId} and fell off.`
          )

          // Increment score for the player who pushed
          const score = this.scoreboard.get(pusherViewId) || 0
          this.setScore(pusherViewId, score + 1)
        }

        this.future(2100).resetPlayer(player) // Reset player after 1 second
      }
    }
  }

  setScore(viewId, score) {
    if (typeof score !== 'number' || score < 0) {
      console.error(`Invalid score for ${viewId}: ${score}`)
      return
    }
    this.scoreboard.set(viewId, score)
    this.persistSession({ scoreboard: this.scoreboard })
  }

  setName({ viewId, name }) {
    if (typeof name !== 'string' || name.trim() === '') {
      console.error(`Invalid name for ${viewId}: ${name}`)
      return
    }
    this.nameMap[viewId] = name.trim()
    this.persistSession({ nameMap: this.nameMap })
  }

  resetPlayer(player) {
    player.reset()
    player.lost = false
  }

  checkPlayerCollisions() {
    const players = Array.from(this.players.values())
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const p1 = players[i]
        const p2 = players[j]
        const dx = p1.x + 10 - (p2.x + 10)
        const dy = p1.y + 10 - (p2.y + 10)
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = 48 // Adjust for player size

        if (dist < minDist) {
          console.log(
            `Collision detected between ${p1.viewId} and ${p2.viewId}`
          )

          // Play kick sound
          const audio = document.getElementById('kick-sound')
          if (audio) {
            audio.currentTime = 0
            audio.play().catch(() => {})
          }

          // Calculate push direction
          const angle = Math.atan2(dy, dx)
          let pushStrength = 5
          let popStrength = 5

          if (p1.activePotions.strength) {
            popStrength = 10 // Stronger push for p1
          }

          // Push both players away from each other
          p1.dx += Math.cos(angle) * pushStrength
          p1.dy += Math.sin(angle) * pushStrength

          p2.dx -= Math.cos(angle) * popStrength
          p2.dy -= Math.sin(angle) * popStrength

          // Slow down the player who pushed (p1)
          //if (typeof p1.slowDown === 'function') p1.slowDown()

          // Track who pushed whom
          p2.lastPushedBy = p1.viewId
          p1.lastPushedBy = p2.viewId
        }
      }
    }
  }

  spawnPotions(count) {
    const types = Object.keys(POTION_TYPES)
    const potions = []
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)]
      potions.push({
        id: i,
        type,
        x: this.safeArea
          ? this.safeArea.x + Math.random() * this.safeArea.width
          : 100 + Math.random() * 800,
        y: this.safeArea
          ? this.safeArea.y + Math.random() * this.safeArea.height
          : 100 + Math.random() * 800,
        takenBy: null,
        expiresAt: null,
      })
    }
    return potions
  }

  checkPotionCollisions() {
    for (const potion of this.potions) {
      if (potion.takenBy) continue
      for (const player of this.players.values()) {
        if (player.lost) continue
        const dx = player.x - potion.x
        const dy = player.y - potion.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 36 && !player.activePotions[potion.type]) {
          // Collect potion
          potion.takenBy = player.viewId
          player.activePotions[potion.type] = true

          // Schedule effect expiration
          this.future(POTION_TYPES[potion.type].duration).expirePotion(
            player,
            potion.type,
            potion.id
          )
        }
      }
    }
  }

  // Called by this.future(...) above
  expirePotion(player, type, potionId) {
    // Remove effect from player
    if (player.activePotions[type]) {
      delete player.activePotions[type]
    }
    // Respawn potion
    const potion = this.potions.find(p => p.id === potionId)
    if (potion) {
      potion.x = this.safeArea
        ? this.safeArea.x + Math.random() * this.safeArea.width
        : 100 + Math.random() * 800
      potion.y = this.safeArea
        ? this.safeArea.y + Math.random() * this.safeArea.height
        : 100 + Math.random() * 800
      potion.takenBy = null
      potion.type =
        Object.keys(POTION_TYPES)[
          Math.floor(Math.random() * Object.keys(POTION_TYPES).length)
        ]
    }
  }
}

GameModel.register('GameModel')

export class GameView extends Multisynq.View {
  joystick = document.getElementById('joystick')
  knob = document.getElementById('knob')
  canvas = document.getElementById('game-canvas')

  constructor(model) {
    super(model)
    this.model = model
    this.smoothing = new WeakMap()
    this.prevLost = false

    this.context = this.canvas.getContext('2d')
    this.canvas.width = window.innerHeight
    this.canvas.height = window.innerHeight

    // Load potion image once
    this.potionImg = new Image()
    this.potionImg.src = 'img/potion.svg'

    this.safeArea = {
      x: GAME_WIDTH * 0.09,
      y: GAME_HEIGHT * 0.11,
      width: GAME_WIDTH * 0.82,
      height: GAME_HEIGHT * 0.78,
    }

    //this.publish(this.sessionId, 'safe-area-set', this.safeArea)
    this.publish(this.sessionId, 'set-name', {
      viewId: this.viewId,
      name: window.playerName,
    })

    this.bindInputActions()
  }

  bindInputActions() {
    const handlePlayerNavInput = (e, isPressingKey) => {
      this.joystick.style.display = 'none'
      if (e.repeat) return
      switch (e.key) {
        case 'a':
        case 'A':
        case 'ArrowLeft':
          this.publish(this.viewId, 'turn-left', isPressingKey)
          break
        case 'd':
        case 'D':
        case 'ArrowRight':
          this.publish(this.viewId, 'turn-right', isPressingKey)
          break
        case 'w':
        case 'W':
        case 'ArrowUp':
          this.publish(this.viewId, 'move-up', isPressingKey)
          break
        case 's':
        case 'S':
        case ' ':
          this.publish(this.viewId, 'move-down', isPressingKey)
          break
      }
    }

    document.onkeydown = e => handlePlayerNavInput(e, true)
    document.onkeyup = e => handlePlayerNavInput(e, false)

    let x = 0,
      y = 0,
      id = null,
      joystickInterval = null,
      lastVector = { dx: 0, dy: 0 }

    document.onpointerdown = e => {
      if (id === null) {
        id = e.pointerId
        x = e.clientX
        y = e.clientY
        joystick.style.left = `${x - 60}px`
        joystick.style.top = `${y - 60}px`
        joystick.style.display = 'block'
        // Start interval for continuous emission
        joystickInterval = setInterval(() => {
          if (lastVector.dx !== 0 || lastVector.dy !== 0) {
            this.publish(this.viewId, 'joystick', lastVector)
          }
        }, 50) // 20 times per second
      }
    }
    document.onpointermove = e => {
      if (id === e.pointerId) {
        let dx = e.clientX - x
        let dy = e.clientY - y
        const maxDist = 40
        const dist = Math.sqrt(dx * dx + dy * dy)
        let vx, vy
        if (dist >= maxDist) {
          vx = dx / dist
          vy = dy / dist
          dx = vx * maxDist
          dy = vy * maxDist
        } else {
          vx = dx / maxDist
          vy = dy / maxDist
        }
        knob.style.left = `${20 + dx}px`
        knob.style.top = `${20 + dy}px`
        lastVector = { dx: vx, dy: vy }
        this.publish(this.viewId, 'joystick', lastVector)
      }
    }
    document.onpointerup = e => {
      if (id === e.pointerId) {
        id = null
        knob.style.left = `20px`
        knob.style.top = `20px`
        lastVector = { dx: 0, dy: 0 }
        // Stop interval
        if (joystickInterval) clearInterval(joystickInterval)
        joystickInterval = null
        // Send zero vector when released
        this.publish(this.viewId, 'joystick', lastVector)
      }
    }
  }

  drawPlayArea() {
    this.context.save()
    this.context.strokeStyle = 'red'
    this.context.lineWidth = 4
    this.context.strokeRect(
      this.safeArea.x,
      this.safeArea.y,
      this.safeArea.width,
      this.safeArea.height
    )

    this.context.restore()
  }

  update() {
    // Clear and set up scaling
    this.context.setTransform(1, 0, 0, 1, 0, 0) // Reset transform
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Calculate scale and offset to fit GAME_WIDTH × GAME_HEIGHT into this.canvas
    const scale = Math.min(
      this.canvas.width / GAME_WIDTH,
      this.canvas.height / GAME_HEIGHT
    )
    const offsetX = (this.canvas.width - GAME_WIDTH * scale) / 2
    const offsetY = (this.canvas.height - GAME_HEIGHT * scale) / 2

    this.context.setTransform(scale, 0, 0, scale, offsetX, offsetY)

    // Now draw in screen pixels

    // Now draw everything in virtual coordinates!
    this.drawPotions()
    this.drawPlayArea()

    const myPlayer = this.model.players.get(this.viewId)

    // --- Play sound when player just fell off ---
    if (myPlayer) {
      if (myPlayer.lost && !this.prevLost) {
        const audio = document.getElementById('fallsound')
        if (audio) {
          audio.currentTime = 0
          audio.play()
        }
      }
      this.prevLost = myPlayer.lost
    }

    if (myPlayer && myPlayer.lost) {
      this.drawFallText()
    }

    // if (myPlayer) {
    //   for (const [otherId, otherPlayer] of this.model.players.entries()) {
    //     if (otherId !== this.viewId) {
    //       this.context.save()
    //       this.context.strokeStyle = 'rgba(0,0,255,0.5)'
    //       this.context.lineWidth = 2
    //       this.context.beginPath()
    //       this.context.moveTo(myPlayer.x + 10, myPlayer.y + 10)
    //       this.context.lineTo(otherPlayer.x + 10, otherPlayer.y + 10)
    //       this.context.stroke()
    //       this.context.restore()
    //     }
    //   }
    // }

    for (const player of this.model.players.values()) {
      // Draw player
      const { x, y, a } = this.smoothPosAndAngle(player)

      this.drawWrapped(x, y, 300, () => {
        this.context.rotate(a)
        this.drawPlayer(player)
      })
    }

    // Draw other game elements like asteroids, blasts, etc.
    this.drawPlayerScore()
  }

  drawFallText() {
    this.context.save()
    this.context.font = '24px "Press Start 2P", monospace'
    this.context.fillStyle = 'red'
    this.context.textAlign = 'center'
    this.context.shadowBlur = 8
    this.context.shadowOffsetX = 2
    this.context.shadowOffsetY = 2
    this.context.fillText('You fell off', 500, 450)
    // "Respawning..." in the centerd
    this.context.font = '32px "Press Start 2P", monospace'
    this.context.fillStyle = 'blue'
    this.context.fillText('Respawning', 500, 500)
    this.context.restore()
  }

  drawPlayerScore() {
    // Draw current player's score at the top
    this.context.setTransform(1, 0, 0, 1, 0, 0) // Reset to screen coordinates
    const score = this.model.scoreboard?.get(this.viewId) || 0
    this.context.save()
    this.context.font = '20px "Press Start 2P", monospace'
    this.context.fillStyle = '#ffe600'
    this.context.textAlign = 'left'
    this.context.textBaseline = 'top'
    this.context.shadowColor = 'black'
    this.context.shadowBlur = 4
    this.context.fillText(`Your score: ${score}`, 24, 24)
    this.context.restore()
  }

  drawPotions() {
    for (const potion of this.model.potions) {
      if (potion.takenBy) continue

      // Draw SVG image if loaded, else fallback to circle
      if (this.potionImg.complete && this.potionImg.naturalWidth > 0) {
        this.context.save()
        this.context.translate(potion.x, potion.y)
        this.context.drawImage(this.potionImg, -18, -18, 36, 36)
        this.context.restore()
      } else {
        // Fallback: draw a colored circle
        const color = POTION_TYPES[potion.type]?.color || '#fff'
        this.context.save()
        this.context.beginPath()
        this.context.arc(potion.x, potion.y, 18, 0, 2 * Math.PI)
        this.context.fillStyle = color
        this.context.shadowColor = '#fff'
        this.context.shadowBlur = 12
        this.context.fill()
        this.context.restore()
      }
    }
  }

  drawPlayer(player) {
    // Load and cache player image based on player.sprite
    if (!player.sprite) player.sprite = 'chog.svg' // fallback

    if (!this.playerImgs) this.playerImgs = {}
    if (!this.playerImgs[player.sprite]) {
      const img = new Image()
      img.src = 'img/' + player.sprite
      this.playerImgs[player.sprite] = img
      // Wait for image to load before drawing
      return
    }
    const img = this.playerImgs[player.sprite]
    if (img.complete && img.naturalWidth > 0) {
      this.context.drawImage(img, -24, -24, 64, 64)
    }

    if (player.activePotions && player.activePotions.strength) {
      this.context.save()
      this.context.beginPath()
      this.context.arc(8, -28, 10, 0, 2 * Math.PI)
      this.context.fillStyle = '#a259ff' // purple
      this.context.shadowColor = '#fff'
      this.context.shadowBlur = 8
      this.context.fill()
      this.context.restore()
    }

    // --- Draw name after restoring rotation ---
    this.context.save()
    this.context.setTransform(1, 0, 0, 1, 0, 0) // Reset any rotation/translation

    // Convert virtual coordinates to screen coordinates
    const { x: screenX, y: screenY } = this.virtualToScreen(
      player.x,
      player.y + 48
    )

    const name = this.model.nameMap[player.viewId] || player.viewId
    if (player.viewId === this.viewId) {
      // Highlighted: purple and smaller
      this.context.font = '12px "Press Start 2P", monospace'
      this.context.fillStyle = '#a259ff'
    } else {
      this.context.font = '12px "Press Start 2P", monospace'
      this.context.fillStyle = '#fff'
    }
    this.context.textAlign = 'center'
    this.context.textBaseline = 'top'
    this.context.fillText(name, screenX, screenY)
    this.context.restore()
  }

  smoothPos(obj) {
    if (!this.smoothing.has(obj)) {
      this.smoothing.set(obj, {
        x: obj.x,
        y: obj.y,
        a: obj.a,
      })
    }
    const smoothed = this.smoothing.get(obj)
    const dx = obj.x - smoothed.x
    const dy = obj.y - smoothed.y
    if (Math.abs(dx) < 50) smoothed.x += dx * 0.3
    else smoothed.x = obj.x
    if (Math.abs(dy) < 50) smoothed.y += dy * 0.3
    else smoothed.y = obj.y
    return smoothed
  }

  smoothPosAndAngle(obj) {
    const smoothed = this.smoothPos(obj)
    const da = obj.a - smoothed.a
    if (Math.abs(da) < 1) smoothed.a += da * 0.3
    else smoothed.a = obj.a
    return smoothed
  }

  drawWrapped(x, y, size, draw) {
    const drawIt = (x, y) => {
      this.context.save()
      this.context.translate(x, y)
      draw()
      this.context.restore()
    }
    drawIt(x, y)
  }

  virtualToScreen(x, y) {
    const scale = Math.min(
      this.canvas.width / GAME_WIDTH,
      this.canvas.height / GAME_HEIGHT
    )
    const offsetX = (this.canvas.width - GAME_WIDTH * scale) / 2
    const offsetY = (this.canvas.height - GAME_HEIGHT * scale) / 2
    return {
      x: x * scale + offsetX,
      y: y * scale + offsetY,
    }
  }
}
