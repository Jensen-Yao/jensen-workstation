class ResearchBrowserPanel {
  constructor(owner, root, url) { this.owner = owner; this.root = root; this.plugin = owner.plugin; this.url = url; this.build(); }
  navigate(address) {
    const url = new URL(address); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP(S) 网页');
    this.url = url.href;
    if (this.web && this.web.getAttribute('src') !== this.url) this.web.setAttribute('src', this.url);
    this.address.textContent = url.hostname;
    this.syncNavigation();
  }
  refreshLinks() {
    if (!this.links) return;
    this.links.empty(); this.links.createEl('option', { value: '', text: '选择常用网站' });
    this.plugin.settings.commonLinks.forEach((link) => this.links.createEl('option', { value: link.url, text: link.name }));
    this.syncNavigation();
  }
  syncNavigation() {
    if (!this.links) return;
    const origin = new URL(this.url).origin;
    const known = this.plugin.settings.commonLinks.find((link) => new URL(link.url).origin === origin);
    this.links.value = known?.url || '';
    this.back.disabled = !this._ready || !this.web?.canGoBack();
    this.forward.disabled = !this._ready || !this.web?.canGoForward();
    this.reload.disabled = !this._ready;
  }
  build() {
    const root = this.root; root.empty(); root.addClass('jrs-research-browser');
    const header = root.createEl('div', { cls: 'jrs-browser-title' });
    header.createEl('strong', { text: '研究网页' });
    uiButton(header, '研究助手', 'panel-right', () => this.owner.showCompanionMode('assistant'), 'jrs-text-button');
    const bar = root.createEl('div', { cls: 'jrs-browser-toolbar' });
    this.back = uiButton(bar, '', 'arrow-left', () => { if (this.web?.canGoBack()) this.web.goBack(); }, 'od-icon-btn'); this.back.setAttribute('aria-label', '网页后退');
    this.forward = uiButton(bar, '', 'arrow-right', () => { if (this.web?.canGoForward()) this.web.goForward(); }, 'od-icon-btn'); this.forward.setAttribute('aria-label', '网页前进');
    this.reload = uiButton(bar, '', 'rotate-cw', () => this.web?.reload(), 'od-icon-btn'); this.reload.setAttribute('aria-label', '重新加载网页');
    this.links = bar.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': '在侧栏切换常用网站' } });
    this.links.onchange = () => { if (this.links.value) this.plugin.openResearchWeb(this.links.value); };
    this.refreshLinks();
    uiButton(bar, '', 'external-link', () => openResearchLink(this.url), 'od-icon-btn').setAttribute('aria-label', '改用系统浏览器打开');
    this.address = root.createEl('div', { cls: 'jrs-browser-address', text: new URL(this.url).hostname });
    this.status = root.createEl('div', { cls: 'jrs-browser-status', text: '正在加载网站…' });
    this.web = document.createElement('webview');
    if (typeof this.web.loadURL !== 'function') {
      this.web = null; this.status.textContent = '当前平台不支持内嵌网页，可在浏览器中继续使用。';
      uiButton(root, '在浏览器中打开', 'external-link', () => openResearchLink(this.url), 'od-btn'); return;
    }
    this.web.className = 'jrs-browser-webview';
    this.web.setAttribute('partition', 'persist:jensen-research');
    this.web.setAttribute('webpreferences', 'contextIsolation=yes,sandbox=yes,nodeIntegration=no');
    this.web.setAttribute('allowpopups', '');
    this.web.setAttribute('src', this.url);
    this.owner.registerDomEvent(this.web, 'dom-ready', () => { this._ready = true; this.syncNavigation(); });
    this.owner.registerDomEvent(this.web, 'did-start-loading', () => { this._failed = false; this.status.textContent = '正在加载网站…'; this.status.hidden = false; });
    this.owner.registerDomEvent(this.web, 'did-stop-loading', () => { this.status.hidden = !this._failed; this.syncNavigation(); });
    const navigate = (event) => {
      if (event.isMainFrame === false) return;
      if (!/^https?:/i.test(event.url)) return;
      this.url = event.url; this.address.textContent = new URL(event.url).hostname; this.syncNavigation();
    };
    this.owner.registerDomEvent(this.web, 'did-navigate', navigate);
    this.owner.registerDomEvent(this.web, 'did-navigate-in-page', navigate);
    this.owner.registerDomEvent(this.web, 'did-fail-load', (event) => { if (event.errorCode === -3 || event.isMainFrame === false) return; this._failed = true; this.status.hidden = false; this.status.textContent = `网站加载失败：${event.errorDescription}。可重试或使用右上角浏览器按钮。`; });
    root.appendChild(this.web);
  }
}
