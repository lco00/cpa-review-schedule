class ScrollPicker {
  constructor(container, options = {}) {
    this.container = container;
    this.itemHeight = options.itemHeight || 44;
    this.visibleCount = options.visibleCount || 5;
    this.onChange = options.onChange || (() => {});
    this.items = [];
    this.selectedIndex = 0;
    this._scrollTimer = null;
    this._build();
  }

  _build() {
    this.container.innerHTML = '';
    this.container.classList.add('scroll-picker');

    const height = this.itemHeight * this.visibleCount;
    this.container.style.height = `${height}px`;

    this.highlight = document.createElement('div');
    this.highlight.className = 'scroll-picker-highlight';

    this.list = document.createElement('div');
    this.list.className = 'scroll-picker-list';

    const pad = (this.itemHeight * (this.visibleCount - 1)) / 2;
    this.list.style.paddingTop = `${pad}px`;
    this.list.style.paddingBottom = `${pad}px`;

    this.container.appendChild(this.highlight);
    this.container.appendChild(this.list);

    this.list.addEventListener('scroll', () => this._onScroll(), { passive: true });
    this.list.addEventListener('touchend', () => this._snapSoon());
    this.list.addEventListener('touchcancel', () => this._snapSoon());
    this.list.addEventListener('mouseup', () => this._snapSoon());
    this.list.addEventListener('wheel', () => this._snapSoon(), { passive: true });
  }

  setItems(items, selectedId) {
    this.items = items;
    const idx = selectedId ? items.findIndex((i) => i.id === selectedId) : 0;
    this.selectedIndex = idx >= 0 ? idx : 0;

    this.list.innerHTML = items
      .map(
        (item, i) =>
          `<div class="scroll-picker-item${i === this.selectedIndex ? ' selected' : ''}" data-index="${i}" style="height:${this.itemHeight}px">${escapeHtml(item.label)}</div>`
      )
      .join('');

    if (items.length === 0) {
      this.list.innerHTML = `<div class="scroll-picker-empty" style="height:${this.itemHeight}px">未登録</div>`;
      return;
    }

    requestAnimationFrame(() => this._scrollToIndex(this.selectedIndex, false));
  }

  getSelected() {
    return this.items[this.selectedIndex] || null;
  }

  getSelectedIndex() {
    return this.selectedIndex;
  }

  _onScroll() {
    if (this.items.length === 0) return;
    const index = Math.round(this.list.scrollTop / this.itemHeight);
    const clamped = Math.max(0, Math.min(index, this.items.length - 1));
    if (clamped !== this.selectedIndex) {
      this._setSelectedIndex(clamped, false);
    }
  }

  _snapSoon() {
    clearTimeout(this._scrollTimer);
    this._scrollTimer = setTimeout(() => this._snap(), 80);
  }

  _snap() {
    if (this.items.length === 0) return;
    const index = Math.round(this.list.scrollTop / this.itemHeight);
    const clamped = Math.max(0, Math.min(index, this.items.length - 1));
    this._scrollToIndex(clamped, true);
    if (clamped !== this.selectedIndex) {
      this._setSelectedIndex(clamped, true);
    }
  }

  _scrollToIndex(index, smooth) {
    this.list.scrollTo({
      top: index * this.itemHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  _setSelectedIndex(index, notify) {
    const prev = this.list.querySelector('.scroll-picker-item.selected');
    if (prev) prev.classList.remove('selected');
    const next = this.list.querySelector(`.scroll-picker-item[data-index="${index}"]`);
    if (next) next.classList.add('selected');
    this.selectedIndex = index;
    if (notify) this.onChange(this.items[index], index);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
