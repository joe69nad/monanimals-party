class Game extends Croquet.Model {
  init(_, persisted) {
    this.highscores = persisted?.highscores ?? {}
    this.ships = new Map()
    this.asteroids = new Set()
    this.blasts = new Set()
    this.subscribe(this.sessionId, 'view-join', this.viewJoined)
    this.subscribe(this.sessionId, 'view-exit', this.viewExited)
    Asteroid.create({})
    this.mainLoop()
  }

  viewJoined(viewId) {
    const ship = Ship.create({ viewId })
    this.ships.set(viewId, ship)
  }

  viewExited(viewId) {
    const ship = this.ships.get(viewId)
    this.ships.delete(viewId)
    ship.destroy()
  }

  setHighscore(initials, score) {
    if (this.highscores[initials] >= score) return
    this.highscores[initials] = score
    this.persistSession({ highscores: this.highscores })
  }

  mainLoop() {
    for (const ship of this.ships.values()) ship.move()
    for (const asteroid of this.asteroids) asteroid.move()
    for (const blast of this.blasts) blast.move()
    this.checkCollisions()
    this.future(50).mainLoop() // move & check every 50 ms
  }

  checkCollisions() {
    for (const asteroid of this.asteroids) {
      if (asteroid.wasHit) continue
      const minx = asteroid.x - asteroid.size
      const maxx = asteroid.x + asteroid.size
      const miny = asteroid.y - asteroid.size
      const maxy = asteroid.y + asteroid.size
      for (const blast of this.blasts) {
        if (
          blast.x > minx &&
          blast.x < maxx &&
          blast.y > miny &&
          blast.y < maxy
        ) {
          asteroid.hitBy(blast)
          break
        }
      }
      for (const ship of this.ships.values()) {
        if (
          !ship.wasHit &&
          ship.x + 10 > minx &&
          ship.x - 10 < maxx &&
          ship.y + 10 > miny &&
          ship.y - 10 < maxy
        ) {
          if (
            !ship.score &&
            Math.abs(ship.x - 500) + Math.abs(ship.y - 500) < 40
          )
            continue // no hit if just spawned
          ship.hitBy(asteroid)
          break
        }
      }
    }
  }
}
Game.register('Game')

class SpaceObject extends Croquet.Model {
  get game() {
    return this.wellKnownModel('modelRoot')
  }

  move() {
    // drift through space
    this.x += this.dx
    this.y += this.dy
    if (this.x < 0) this.x += 1000
    if (this.x > 1000) this.x -= 1000
    if (this.y < 0) this.y += 1000
    if (this.y > 1000) this.y -= 1000
    if (this.a < 0) this.a += 2 * Math.PI
    if (this.a > 2 * Math.PI) this.a -= 2 * Math.PI
  }
}

class Ship extends SpaceObject {
  init({ viewId }) {
    super.init()
    this.viewId = viewId
    this.initials = ''
    this.subscribe(viewId, 'left-thruster', this.leftThruster)
    this.subscribe(viewId, 'right-thruster', this.rightThruster)
    this.subscribe(viewId, 'forward-thruster', this.forwardThruster)
    this.subscribe(viewId, 'fire-blaster', this.fireBlaster)
    this.subscribe(viewId, 'set-initials', this.setInitials)
    this.reset()
  }

  reset() {
    this.x = 480 + 40 * Math.random()
    this.y = 480 + 40 * Math.random()
    this.a = -Math.PI / 2
    this.dx = 0
    this.dy = 0
    this.left = false
    this.right = false
    this.forward = false
    this.score = 0
    this.wasHit = 0
  }

  leftThruster(active) {
    this.left = active
  }

  rightThruster(active) {
    this.right = active
  }

  forwardThruster(active) {
    this.forward = active
  }

  fireBlaster() {
    if (this.wasHit) return
    // create blast moving at speed 20 in direction of ship
    const dx = Math.cos(this.a) * 20
    const dy = Math.sin(this.a) * 20
    const x = this.x + dx
    const y = this.y + dy
    Blast.create({ x, y, dx, dy, ship: this })
    // kick ship back a bit
    this.accelerate(-0.5)
  }

  move() {
    if (this.wasHit) {
      // keep drifting as debris for 3 seconds
      if (++this.wasHit > 60) this.reset()
    } else {
      // process thruster controls
      if (this.forward) this.accelerate(0.5)
      if (this.left) this.a -= 0.2
      if (this.right) this.a += 0.2
    }
    super.move()
  }

  accelerate(force) {
    this.dx += Math.cos(this.a) * force
    this.dy += Math.sin(this.a) * force
    if (this.dx > 10) this.dx = 10
    if (this.dx < -10) this.dx = -10
    if (this.dy > 10) this.dy = 10
    if (this.dy < -10) this.dy = -10
  }

  setInitials(initials) {
    if (!initials) return
    for (const ship of this.game.ships.values()) {
      if (ship.initials === initials) return
    }
    const highscore = this.game.highscores[this.initials]
    if (highscore !== undefined) delete this.game.highscores[this.initials]
    this.initials = initials
    this.game.setHighscore(this.initials, Math.max(this.score, highscore || 0))
  }

  scored() {
    this.score++
    if (this.initials) this.game.setHighscore(this.initials, this.score)
  }

  hitBy(asteroid) {
    // turn both into debris
    this.wasHit = 1
    asteroid.wasHit = 1
  }
}
Ship.register('Ship')

class Asteroid extends SpaceObject {
  init({ size, x, y, a, dx, dy, da }) {
    super.init()
    if (size) {
      // init second asteroid after spliting
      this.size = size
      this.x = x
      this.y = y
      this.a = a
      this.dx = dx
      this.dy = dy
      this.da = da
    } else {
      // init new large asteroid
      this.size = 40
      this.x = Math.random() * 400 - 200
      this.y = Math.random() * 400 - 200
      this.a = Math.random() * Math.PI * 2
      const speed = Math.random() * 4 + 1
      this.dx = Math.cos(this.a) * speed
      this.dy = Math.sin(this.a) * speed
      this.da = (0.02 + Math.random() * 0.03) * (Math.random() < 0.5 ? 1 : -1)
      this.wasHit = 0
      this.move() // random (x,y) is around top-left corner, wrap to other corners
    }
    this.game.asteroids.add(this)
  }

  move() {
    if (this.wasHit) {
      // keep drifting as debris, larger pieces drift longer
      if (++this.wasHit > this.size) return this.destroy()
    } else {
      // spin
      this.a += this.da
    }
    super.move()
  }

  hitBy(blast) {
    if (!blast.ship.wasHit) blast.ship.scored()
    if (this.size > 20) {
      // split into two smaller faster asteroids
      this.size *= 0.7
      this.da *= 1.5
      this.dx = (-blast.dy * 10) / this.size
      this.dy = (blast.dx * 10) / this.size
      Asteroid.create({
        size: this.size,
        x: this.x,
        y: this.y,
        a: this.a,
        dx: -this.dx,
        dy: -this.dy,
        da: this.da,
      })
    } else {
      // turn into debris
      this.wasHit = 1
      this.ship = blast.ship
    }
    blast.destroy()
  }

  destroy() {
    this.game.asteroids.delete(this)
    super.destroy()
    // keep at least 5 asteroids around
    if (this.game.asteroids.size < 5) Asteroid.create({})
  }
}
Asteroid.register('Asteroid')

class Blast extends SpaceObject {
  init({ x, y, dx, dy, ship }) {
    super.init()
    this.ship = ship
    this.x = x
    this.y = y
    this.dx = dx
    this.dy = dy
    this.t = 0
    this.game.blasts.add(this)
  }

  move() {
    // move for 1.5 second before disappearing
    if (++this.t > 30) return this.destroy()
    super.move()
  }

  destroy() {
    this.game.blasts.delete(this)
    super.destroy()
  }
}
Blast.register('Blast')

/////////// Code below is executed outside of synced VM ///////////

class Display extends Croquet.View {
  constructor(model) {
    super(model)
    this.model = model

    const joystick = document.getElementById('joystick')
    const knob = document.getElementById('knob')

    document.onkeydown = e => {
      joystick.style.display = 'none'
      if (e.repeat) return
      switch (e.key) {
        case 'a':
        case 'A':
        case 'ArrowLeft':
          this.publish(this.viewId, 'left-thruster', true)
          break
        case 'd':
        case 'D':
        case 'ArrowRight':
          this.publish(this.viewId, 'right-thruster', true)
          break
        case 'w':
        case 'W':
        case 'ArrowUp':
          this.publish(this.viewId, 'forward-thruster', true)
          break
        case 's':
        case 'S':
        case ' ':
          this.publish(this.viewId, 'fire-blaster')
          break
      }
    }
    document.onkeyup = e => {
      if (e.repeat) return
      switch (e.key) {
        case 'a':
        case 'A':
        case 'ArrowLeft':
          this.publish(this.viewId, 'left-thruster', false)
          break
        case 'd':
        case 'D':
        case 'ArrowRight':
          this.publish(this.viewId, 'right-thruster', false)
          break
        case 'w':
        case 'W':
        case 'ArrowUp':
          this.publish(this.viewId, 'forward-thruster', false)
          break
      }
    }

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
            this.publish(this.viewId, 'right-thruster', true)
            right = true
          }
        } else if (right) {
          this.publish(this.viewId, 'right-thruster', false)
          right = false
        }
        if (dx < -30) {
          dx = -30
          if (!left) {
            this.publish(this.viewId, 'left-thruster', true)
            left = true
          }
        } else if (left) {
          this.publish(this.viewId, 'left-thruster', false)
          left = false
        }
        if (dy < -30) {
          dy = -30
          if (!forward) {
            this.publish(this.viewId, 'forward-thruster', true)
            forward = true
          }
        } else if (forward) {
          this.publish(this.viewId, 'forward-thruster', false)
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
        if (!right && !left && !forward) {
          this.publish(this.viewId, 'fire-blaster')
        }
        if (right) {
          this.publish(this.viewId, 'right-thruster', false)
          right = false
        }
        if (left) {
          this.publish(this.viewId, 'left-thruster', false)
          left = false
        }
        if (forward) {
          this.publish(this.viewId, 'forward-thruster', false)
          forward = false
        }
        knob.style.left = `20px`
        knob.style.top = `20px`
      } else {
        this.publish(this.viewId, 'fire-blaster')
      }
    }
    document.onpointercancel = document.onpointerup
    document.oncontextmenu = e => {
      e.preventDefault()
      this.publish(this.viewId, 'fire-blaster')
    }
    document.ontouchend = e => e.preventDefault() // prevent double-tap zoom on iOS
    codelink.ontouchend = () => codelink.click() // but allow clicking link ¯\_(ツ)_/¯

    initials.ontouchend = () => initials.focus() // and allow input ¯\_(ツ)_/¯
    initials.onchange = () => {
      this.publish(this.viewId, 'set-initials', initials.value)
      localStorage.setItem('io.croquet.multiblaster.initials', initials.value)
    }
    if (localStorage.getItem('io.croquet.multiblaster.initials')) {
      initials.value = localStorage.getItem('io.croquet.multiblaster.initials')
      this.publish(this.viewId, 'set-initials', initials.value)
      // after reloading, our previous ship with initials is still there, so just try again once
      setTimeout(
        () => this.publish(this.viewId, 'set-initials', initials.value),
        1000
      )
    }
    initials.onkeydown = e => {
      if (e.key === 'Enter') {
        initials.blur()
        e.preventDefault()
      }
    }

    this.smoothing = new WeakMap() // position cache for interpolated rendering

    this.context = canvas.getContext('2d')
  }

  // update is called once per render frame
  // read from shared model, interpolate, render
  update() {
    this.context.clearRect(0, 0, 1000, 1000)
    this.context.fillStyle = 'rgba(255, 255, 255, 0.5)'
    this.context.lineWidth = 3
    this.context.strokeStyle = 'white'
    this.context.font = '30px sans-serif'
    this.context.textAlign = 'left'
    this.context.textBaseline = 'middle'
    // model highscore only keeps players with initials, merge with unnamed players
    const highscore = Object.entries(this.model.highscores)
    const labels = new Map()
    const emojis = new Map()
    for (const ship of this.model.ships.values()) {
      let label = ship.initials
      if (!label) {
        label = `Player ${labels.size + 1}`
        highscore.push([label, ship.score])
      } else if (window.EMOJI_REGEX) {
        const emoji = label.match(EMOJI_REGEX)
        if (emoji?.length) emojis.set(ship, emoji[emoji.length >> 1])
      }
      labels.set(ship, label)
    }
    // draw sorted highscore
    for (const [i, [label, score]] of highscore
      .sort((a, b) => b[1] - a[1])
      .entries()) {
      this.context.fillText(`${i + 1}. ${label}: ${score}`, 10, 30 + i * 35)
    }
    // draw ships, asteroids, and blasters
    this.context.font = '40px sans-serif'
    for (const ship of this.model.ships.values()) {
      const { x, y, a } = this.smoothPosAndAngle(ship)
      this.drawWrapped(x, y, 300, () => {
        this.context.textAlign = 'right'
        this.context.fillText(labels.get(ship), -30 + ship.wasHit * 2, 0)
        this.context.textAlign = 'left'
        this.context.fillText(ship.score, 30 - ship.wasHit * 2, 0)
        this.context.rotate(a)
        if (ship.wasHit) this.drawShipDebris(ship.wasHit)
        else this.drawShip(ship, ship.viewId === this.viewId)
      })
    }
    this.context.textAlign = 'center'
    this.context.fillStyle = 'white'
    for (const asteroid of this.model.asteroids) {
      const { x, y, a } = this.smoothPosAndAngle(asteroid)
      this.drawWrapped(x, y, 60, () => {
        if (asteroid.wasHit && emojis.get(asteroid.ship)) {
          this.context.font = `${asteroid.wasHit * 4}px sans-serif`
          this.context.fillText(emojis.get(asteroid.ship), 0, 0)
        }
        this.context.rotate(a)
        if (asteroid.wasHit)
          this.drawAsteroidDebris(asteroid.size, asteroid.wasHit * 2)
        else this.drawAsteroid(asteroid.size)
      })
    }
    this.context.font = '20px sans-serif'
    for (const blast of this.model.blasts) {
      const { x, y } = this.smoothPos(blast)
      this.drawWrapped(x, y, 10, () => {
        this.drawBlast(emojis.get(blast.ship))
      })
    }
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
    // draw again on opposite sides if object is near edge
    if (x - size < 0) drawIt(x + 1000, y)
    if (x + size > 1000) drawIt(x - 1000, y)
    if (y - size < 0) drawIt(x, y + 1000)
    if (y + size > 1000) drawIt(x, y - 1000)
    if (x - size < 0 && y - size < 0) drawIt(x + 1000, y + 1000)
    if (x + size > 1000 && y + size > 1000) drawIt(x - 1000, y - 1000)
    if (x - size < 0 && y + size > 1000) drawIt(x + 1000, y - 1000)
    if (x + size > 1000 && y - size < 0) drawIt(x - 1000, y + 1000)
  }

  drawShip(ship, highlight) {
    this.context.beginPath()
    this.context.moveTo(+20, 0)
    this.context.lineTo(-20, +10)
    this.context.lineTo(-20, -10)
    this.context.closePath()
    this.context.stroke()
    if (highlight) {
      this.context.fill()
    }
    if (ship.forward) {
      this.context.moveTo(-20, +5)
      this.context.lineTo(-30, 0)
      this.context.lineTo(-20, -5)
      this.context.stroke()
    }
    if (ship.left) {
      this.context.moveTo(-18, -9)
      this.context.lineTo(-13, -15)
      this.context.lineTo(-10, -7)
      this.context.stroke()
    }
    if (ship.right) {
      this.context.moveTo(-18, +9)
      this.context.lineTo(-13, +15)
      this.context.lineTo(-10, +7)
      this.context.stroke()
    }
  }

  drawShipDebris(t) {
    this.context.beginPath()
    this.context.moveTo(+20 + t, 0 + t)
    this.context.lineTo(-20 + t, +10 + t)
    this.context.moveTo(-20 - t * 1.4, +10)
    this.context.lineTo(-20 - t * 1.4, -10)
    this.context.moveTo(-20 + t, -10 - t)
    this.context.lineTo(+20 + t, 0 - t)
    this.context.stroke()
  }

  drawAsteroid(size) {
    this.context.beginPath()
    this.context.moveTo(+size, 0)
    this.context.lineTo(0, +size)
    this.context.lineTo(-size, 0)
    this.context.lineTo(0, -size)
    this.context.closePath()
    this.context.stroke()
  }

  drawAsteroidDebris(size, t) {
    this.context.beginPath()
    this.context.moveTo(+size + t, 0 + t)
    this.context.lineTo(0 + t, +size + t)
    this.context.moveTo(-size - t, 0 - t)
    this.context.lineTo(0 - t, -size - t)
    this.context.moveTo(-size - t, 0 + t)
    this.context.lineTo(0 - t, +size + t)
    this.context.moveTo(+size + t, 0 - t)
    this.context.lineTo(0 + t, -size - t)
    this.context.stroke()
  }

  drawBlast(emoji = null) {
    if (emoji) {
      this.context.fillText(emoji, 0, 0)
    } else {
      this.context.beginPath()
      this.context.ellipse(0, 0, 2, 2, 0, 0, 2 * Math.PI)
      this.context.closePath()
      this.context.stroke()
    }
  }
}

Croquet.App.makeWidgetDock() // shows QR code

Croquet.Session.join({
  apiKey: '1_i65fcn11n7lhrb5n890hs3dhj11hfzfej57pvlrx', // get your own from croquet.io/keys
  appId: 'io.croquet.multiblaster',
  name: Croquet.App.autoSession(),
  password: Croquet.App.autoPassword(),
  model: Game,
  view: Display,
})
