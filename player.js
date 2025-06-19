import * as Multisynq from 'https://cdn.jsdelivr.net/npm/@multisynq/client@1.0.4/bundled/multisynq-client.esm.js'
import GameObject from './game-object.js'

export class PlayerModel extends GameObject {
  init({ viewId }) {
    super.init()
    this.viewId = viewId
    this.slowTimer = 0
    this.lost = false
    this.respawnTimer = 0
    // wherever you create/add a player
    //this.name = viewId === this.viewId ? window.playerName : 'Player'
    // if (viewId === this.viewId) {
    //   this.game.setName(viewId, window.playerName || viewId)
    // }

    this.subscribe(viewId, 'turn-left', this.turnLeft)
    this.subscribe(viewId, 'turn-right', this.turnRight)
    this.subscribe(viewId, 'move-up', this.moveUp)

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
    if (this.slowTimer > 0) {
      this.slowTimer--
      this.dx *= 0.7 // Stronger friction when slowed
      this.dy *= 0.7
    } else {
      this.dx *= 0.96
      this.dy *= 0.96
    }

    if (this.up) this.accelerate(0.7)
    if (this.left) this.a -= 0.2
    if (this.right) this.a += 0.2

    this.x += this.dx
    this.y += this.dy
  }

  accelerate(force) {
    this.dx += Math.cos(this.a) * force
    this.dy += Math.sin(this.a) * force

    // Limit the speed
    // if (this.dx > 20) this.dx = 20
    // if (this.dx < -20) this.dx = -20
    // if (this.dy > 20) this.dy = 20
    // if (this.dy < -20) this.dy = -20
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
  }
}

PlayerModel.register('PlayerModel')
