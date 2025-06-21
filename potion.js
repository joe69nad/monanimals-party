export const POTION_TYPES = {
  strength: {
    color: '#ff69b4',
    duration: 1 * 60 * 1000, // 3 minutes
    effect: 'strength',
  },
}

export class PotionModel {
  constructor({ id, type, x, y }) {
    this.id = id
    this.type = type
    this.x = x
    this.y = y
    this.takenBy = null
    this.expiresAt = null
  }

  isActive() {
    return !this.takenBy
  }

  respawn(area, type) {
    this.x = area.x + Math.random() * area.width
    this.y = area.y + Math.random() * area.height
    this.type = type
    this.takenBy = null
    this.expiresAt = null
  }
}
