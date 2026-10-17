/**
 * Subtitles + chapter cards (DOM). The cat never speaks: people get a coloured name,
 * animals (later) italic, and Szotyi's own perception is a small, nameless hint line.
 */
export const SPEAKERS: Record<string, string> = {
  Judit: '#9fc3ff',
  'Ilonka néni': '#ffb3c7',
  Robi: '#ff8a65',
  Dani: '#9be7a0',
  Kristóf: '#c8a2ff',
  Gábor: '#ffd28a',
};

export class Dialogue {
  private subs = document.getElementById('subs')!;
  private card = document.getElementById('card')!;
  private hint = document.getElementById('hint')!;
  private hintTimer = 0;
  private cardTimer = 0;

  line(speaker: string | null, text: string) {
    const color = speaker ? SPEAKERS[speaker] ?? '#fff' : '';
    const el = document.createElement('div');
    el.className = 'sub';
    el.innerHTML = speaker
      ? `<span class="who" style="color:${color}">${speaker}</span>${escape(text)}`
      : `<i>${escape(text)}</i>`;
    this.subs.appendChild(el);
    while (this.subs.children.length > 3) this.subs.firstElementChild!.remove();
    return el;
  }

  clearLine(el: HTMLElement) {
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }

  showCard(title: string, sub: string, ms = 3800) {
    this.card.innerHTML = `<div class="card-sub">${sub}</div><div class="card-title">${title}</div>`;
    this.card.classList.add('show');
    clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => this.card.classList.remove('show'), ms);
  }

  /** Szotyi's perception / tutorial hint, top-centre, no speaker. */
  showHint(html: string, ms = 4000) {
    this.hint.innerHTML = html;
    this.hint.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hint.classList.remove('show'), ms);
  }

  clearAll() {
    this.subs.innerHTML = '';
    this.card.classList.remove('show');
    this.hint.classList.remove('show');
  }
}

function escape(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}
