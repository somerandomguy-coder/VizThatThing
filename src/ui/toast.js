// Non-blocking Toast & Background Task Progress HUD (replaces window.alert / confirm)

export class ToastManager {
  constructor(containerEl) {
    this.container = containerEl;
  }

  show(message, type = 'info', durationMs = 3400) {
    if (!this.container) return;
    const el = document.createElement('div');
    el.className = `toast-item toast-${type}`;
    el.innerHTML = `
      <span class="toast-dot"></span>
      <span class="toast-msg"></span>
    `;
    el.querySelector('.toast-msg').textContent = message;
    this.container.appendChild(el);

    requestAnimationFrame(() => el.classList.add('visible'));

    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 220);
    }, durationMs);
  }
}

