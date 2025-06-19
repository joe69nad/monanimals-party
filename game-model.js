import * as Multisynq from 'https://cdn.jsdelivr.net/npm/@multisynq/client@1.0.4/bundled/multisynq-client.esm.js'
import { PlayerModel } from './player.js'

// Virtual game world size (fixed for all devices)
const GAME_WIDTH = 1000
const GAME_HEIGHT = 1000

export class GameModel extends Multisynq.Model {
  init(_, persisted) {
    this.players = new Map()

    this.nameMap = persisted?.nameMap ?? {}

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

    this.subscribe(this.sessionId, 'view-join', this.viewJoined)

    this.subscribe(this.sessionId, 'view-exit', this.viewExited)

    this.subscribe(this.sessionId, 'safe-area-set', sa => (this.safeArea = sa))

    this.subscribe(this.sessionId, 'set-name', this.setName)

    this.mainLoop()
  }

  viewJoined(viewId) {
    const player = PlayerModel.create({ viewId })
    this.players.set(viewId, player)

    // if (viewId === this.viewId) {
    //   console.log(`You joined the game as ${viewId}.`)

    //   this.setName(viewId, window.playerName || viewId)
    // }

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
          const pushStrength = 8
          const popStrength = 3

          // Push both players away from each other
          p1.dx += Math.cos(angle) * pushStrength
          p1.dy += Math.sin(angle) * pushStrength

          p2.dx -= Math.cos(angle) * popStrength
          p2.dy -= Math.sin(angle) * popStrength

          // Slow down the player who pushed (p1)
          if (typeof p1.slowDown === 'function') p1.slowDown()

          // Track who pushed whom
          p2.lastPushedBy = p1.viewId
        }
      }
    }
  }
}

GameModel.register('GameModel')

export class GameView extends Multisynq.View {
  joystick = document.getElementById('joystick')
  knob = document.getElementById('knob')
  constructor(model) {
    super(model)
    this.model = model
    this.smoothing = new WeakMap()
    this.prevLost = false // <-- Add this line

    this.context = canvas.getContext('2d')
    // Set canvas size to match the display size
    canvas.width = window.innerHeight
    canvas.height = window.innerHeight

    this.safeArea = {
      x: GAME_WIDTH * 0.09,
      y: GAME_HEIGHT * 0.11,
      width: GAME_WIDTH * 0.82,
      height: GAME_HEIGHT * 0.78,
    }

    this.publish(this.sessionId, 'safe-area-set', this.safeArea)
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
      right = false,
      left = false,
      forward = false
    document.onpointerdown = e => {
      if (id === null) {
        id = e.pointerId
        x = e.clientX
        y = e.clientY
        joystick.style.left = `${x - 60}px`
        joystick.style.top = `${y - 60}px`
        joystick.style.display = 'block'
      }
    }
    document.onpointermove = e => {
      e.preventDefault()
      if (id === e.pointerId) {
        let dx = e.clientX - x
        let dy = e.clientY - y
        if (dx > 30) {
          dx = 30
          if (!right) {
            this.publish(this.viewId, 'turn-right', true)
            right = true
          }
        } else if (right) {
          this.publish(this.viewId, 'turn-right', false)
          right = false
        }
        if (dx < -30) {
          dx = -30
          if (!left) {
            this.publish(this.viewId, 'turn-left', true)
            left = true
          }
        } else if (left) {
          this.publish(this.viewId, 'turn-left', false)
          left = false
        }
        if (dy < -30) {
          dy = -30
          if (!forward) {
            this.publish(this.viewId, 'move-up', true)
            forward = true
          }
        } else if (forward) {
          this.publish(this.viewId, 'move-up', false)
          forward = false
        }
        if (dy > 0) dy = 0
        knob.style.left = `${20 + dx}px`
        knob.style.top = `${20 + dy}px`
      }
    }
    document.onpointerup = e => {
      e.preventDefault()
      if (id === e.pointerId) {
        id = null
        // if (!right && !left && !forward) {
        //   this.publish(this.viewId, 'fire-blaster')
        // }
        if (right) {
          this.publish(this.viewId, 'turn-right', false)
          right = false
        }
        if (left) {
          this.publish(this.viewId, 'turn-left', false)
          left = false
        }
        if (forward) {
          this.publish(this.viewId, 'move-up', false)
          forward = false
        }
        knob.style.left = `20px`
        knob.style.top = `20px`
      } else {
        this.publish(this.viewId, 'fire-blaster')
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
    this.context.clearRect(0, 0, canvas.width, canvas.height)

    // Calculate scale and offset to fit GAME_WIDTH × GAME_HEIGHT into canvas
    const scale = Math.min(
      canvas.width / GAME_WIDTH,
      canvas.height / GAME_HEIGHT
    )
    const offsetX = (canvas.width - GAME_WIDTH * scale) / 2
    const offsetY = (canvas.height - GAME_HEIGHT * scale) / 2

    this.context.setTransform(scale, 0, 0, scale, offsetX, offsetY)

    // Now draw in screen pixels

    // Now draw everything in virtual coordinates!
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
      // "You fell off" at the top
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

    if (myPlayer) {
      for (const [otherId, otherPlayer] of this.model.players.entries()) {
        if (otherId !== this.viewId) {
          this.context.save()
          this.context.strokeStyle = 'rgba(0,0,255,0.5)'
          this.context.lineWidth = 2
          this.context.beginPath()
          this.context.moveTo(myPlayer.x + 10, myPlayer.y + 10)
          this.context.lineTo(otherPlayer.x + 10, otherPlayer.y + 10)
          this.context.stroke()
          this.context.restore()
        }
      }
    }

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

  drawPlayer(player) {
    if (!this.playerImg) {
      this.playerImg = new Image()
      this.playerImg.src = 'img/chog.svg'
      return
    }
    // Draw the player image (with rotation)
    this.context.drawImage(this.playerImg, -24, -24, 64, 64)

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
      this.context.font = '16px "Press Start 2P", monospace'
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

    // if (x - size < 0) drawIt(x + 1000, y)
    // if (x + size > 1000) drawIt(x - 1000, y)
    // if (y - size < 0) drawIt(x, y + 1000)
    // if (y + size > 1000) drawIt(x, y - 1000)
    // if (x - size < 0 && y - size < 0) drawIt(x + 1000, y + 1000)
    // if (x + size > 1000 && y + size > 1000) drawIt(x - 1000, y - 1000)
    // if (x - size < 0 && y + size > 1000) drawIt(x + 1000, y - 1000)
    // if (x + size > 1000 && y - size < 0) drawIt(x - 1000, y + 1000)
  }

  virtualToScreen(x, y) {
    const scale = Math.min(
      canvas.width / GAME_WIDTH,
      canvas.height / GAME_HEIGHT
    )
    const offsetX = (canvas.width - GAME_WIDTH * scale) / 2
    const offsetY = (canvas.height - GAME_HEIGHT * scale) / 2
    return {
      x: x * scale + offsetX,
      y: y * scale + offsetY,
    }
  }
}
