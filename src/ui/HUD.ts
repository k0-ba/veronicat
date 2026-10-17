/** DOM HUD: objective line, button prompts, toasts, debug readout. */
export class HUD {
  private objective = document.getElementById('objective')!;
  private prompts = document.getElementById('prompts')!;
  private toastEl = document.getElementById('toast')!;
  private debugEl = document.getElementById('debug')!;
  private lastPrompts = '';
  private toastTimer = 0;

  setObjective(html: string) {
    if (this.objective.innerHTML !== html) this.objective.innerHTML = html;
  }

  setPrompts(items: Array<{ key: string; label: string }>) {
    const sig = items.map((i) => i.key + i.label).join('|');
    if (sig === this.lastPrompts) return;
    this.lastPrompts = sig;
    this.prompts.innerHTML = items
      .map((i) => `<span class="prompt"><kbd>${i.key}</kbd>${i.label}</span>`)
      .join('');
  }

  toast(text: string, ms = 1800) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  set debugVisible(v: boolean) { this.debugEl.hidden = !v; }
  get debugVisible() { return !this.debugEl.hidden; }
  setDebug(text: string) { if (!this.debugEl.hidden) this.debugEl.textContent = text; }
}
