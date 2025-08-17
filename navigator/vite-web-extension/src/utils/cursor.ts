interface CursorOptions {
  cursorSize?: number;
}

export class CursorManager {
  private posX = 12;
  private posY = 12;
  private visible = false;
  private readonly size: number;
  public cursorElement: HTMLDivElement;

  constructor(opts?: CursorOptions) {
    this.size = opts?.cursorSize ?? 24;
    this.cursorElement = this.createCursor();
    document.body.appendChild(this.cursorElement);
    this.hide();
  }

  show() {
    this.visible = true;
    this.cursorElement.style.opacity = "1";
  }

  hide() {
    this.visible = false;
    this.cursorElement.style.opacity = "0";
  }

  async moveCursorToElement(element: HTMLElement): Promise<void> {
    const rect = element.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    await this.animateTo(targetX, targetY, 350 + Math.random() * 300);
  }

  private async animateTo(x: number, y: number, durationMs: number): Promise<void> {
    const startX = this.posX;
    const startY = this.posY;
    const dx = x - startX;
    const dy = y - startY;
    const start = performance.now();

    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = easeInOutCubic(t);
        this.posX = startX + dx * eased;
        this.posY = startY + dy * eased;
        this.render();
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  private render() {
    this.cursorElement.style.transform = `translate(${this.posX - this.size / 2}px, ${this.posY - this.size / 2}px)`;
  }

  private createCursor(): HTMLDivElement {
    const el = document.createElement("div");
    el.id = "navigator-ai-cursor";
    el.style.position = "fixed";
    el.style.left = "0";
    el.style.top = "0";
    el.style.width = `${this.size}px`;
    el.style.height = `${this.size}px`;
    el.style.borderRadius = "50%";
    el.style.background = "radial-gradient(circle at 30% 30%, #fff, #4f46e5)";
    el.style.boxShadow = "0 4px 16px rgba(79,70,229,0.45)";
    el.style.pointerEvents = "none";
    el.style.transform = "translate(-9999px, -9999px)";
    el.style.transition = "opacity 180ms ease";
    el.style.zIndex = "2147483646";
    return el;
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}


