import * as Multisynq from 'https://cdn.jsdelivr.net/npm/@multisynq/client@1.0.4/bundled/multisynq-client.esm.js'
import GameObject from './game-object.js'

export class PlayerModel extends GameObject {
  init({ viewId }) {
    super.init()
    this.viewId = viewId
    this.slowTimer = 0
    this.lost = false
    this.respawnTimer = 0
    this.joystickVector = { dx: 0, dy: 0 } // Add this line
    this.activePotions = {} // { type: true }

    this.subscribe(viewId, 'turn-left', this.turnLeft)
    this.subscribe(viewId, 'turn-right', this.turnRight)
    this.subscribe(viewId, 'move-up', this.moveUp)

    this.subscribe(viewId, 'joystick', this.moveByJoystick)

    this.reset()
  }

  turnLeft(active) {
    this.left = active
    //this.move()
  }

  turnRight(active) {
    this.right = active
    //this.move()
  }

  moveUp(active) {
    this.up = active
    //this.move()
  }

  move() {
    if (this.lost ?? false) return

    if (this.slowTimer > 0) {
      this.slowTimer--
      this.dx *= 0.7
      this.dy *= 0.7
    } else {
      this.dx *= 0.98
      this.dy *= 0.98
    }

    // Keyboard controls
    if (this.up) this.accelerate(0.4)
    if (this.left) this.a -= 0.16
    if (this.right) this.a += 0.16

    // Joystick acceleration (continuous)
    if (this.joystickVector.dx !== 0 || this.joystickVector.dy !== 0) {
      // You can adjust the acceleration factor (e.g. 0.5)
      this.dx += this.joystickVector.dx * 0.8
      this.dy += this.joystickVector.dy * 0.8
      // Optionally update angle for facing direction
      this.a = Math.atan2(this.joystickVector.dy, this.joystickVector.dx)
    }

    const limit = 8.6
    if (this.dx > limit) this.dx = limit
    if (this.dx < -limit) this.dx = -limit
    if (this.dy > limit) this.dy = limit
    if (this.dy < -limit) this.dy = -limit

    this.x += this.dx
    this.y += this.dy
  }

  accelerate(force) {
    this.dx += Math.cos(this.a) * force
    this.dy += Math.sin(this.a) * force
  }

  moveByJoystick({ dx, dy }) {
    // Just store the vector, don't apply it directly
    this.joystickVector = { dx, dy }
  }

  slowDown() {
    this.slowTimer = 15 // Slow for 15 frames
  }

  reset() {
    this.x = 300
    this.y = 600
    this.a = 0
    this.lastPushedBy = null

    this.dx = 0
    this.dy = 0
    this.activePotions = {}
  }
}

PlayerModel.register('PlayerModel')
