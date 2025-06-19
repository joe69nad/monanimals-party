import * as Multisynq from 'https://cdn.jsdelivr.net/npm/@multisynq/client@1.0.4/bundled/multisynq-client.esm.js'

class GameObject extends Multisynq.Model {
  get game() {
    return this.wellKnownModel('modelRoot')
  }
}
export default GameObject
