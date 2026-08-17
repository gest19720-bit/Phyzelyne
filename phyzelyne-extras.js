/**
 * Phyzelyne Extras — phyzelyne-extras.js
 * Tiny stick figure animations (SVG, CSS-driven)
 *
 * NOTE: Store/Auth logic lives in app.js.
 * This file ONLY adds UI chrome on top.
 */

'use strict';

/* ═══════════════════════════════════════════════
   STICK FIGURES
   Tiny SVG stick figures with CSS keyframe
   animations. Rendered into a target element.
   Poses: wave | run | dance | shrug | celebrate
         | think | sit | fall | point | walk
═══════════════════════════════════════════════ */
const StickFigures = {

  /* Base dimensions */
  W: 48, H: 56,

  /* Inline SVG bodies per pose — all paths drawn at 48×56 viewBox */
  poses: {

    wave: (c) => `
      <circle cx="24" cy="8" r="6" fill="none" stroke="${c}" stroke-width="2.2"/>
      <line x1="24" y1="14" x2="24" y2="34" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="34" x2="14" y2="46" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="34" x2="34" y2="46" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="22" x2="12" y2="18" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-left" style="transform-origin:24px 22px"/>
      <line x1="24" y1="22" x2="40" y2="12" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-right" style="transform-origin:24px 22px"/>`,

    run: (c) => `
      <circle cx="24" cy="7" r="6" fill="none" stroke="${c}" stroke-width="2.2"/>
      <line x1="24" y1="13" x2="22" y2="30" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="22" y1="30" x2="30" y2="44" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-leg-right"/>
      <line x1="22" y1="30" x2="12" y2="42" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-leg-left"/>
      <line x1="24" y1="18" x2="10" y2="24" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-left"/>
      <line x1="24" y1="18" x2="36" y2="14" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-right"/>`,

    dance: (c) => `
      <circle cx="24" cy="8" r="6" fill="none" stroke="${c}" stroke-width="2.2"/>
      <line x1="24" y1="14" x2="24" y2="33" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="33" x2="14" y2="48" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-leg-left"/>
      <line x1="24" y1="33" x2="36" y2="44" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-leg-right"/>
      <line x1="24" y1="20" x2="8"  y2="12" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-left"/>
      <line x1="24" y1="20" x2="40" y2="12" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-right"/>`,

    shrug: (c) => `
      <circle cx="24" cy="8" r="6" fill="none" stroke="${c}" stroke-width="2.2"/>
      <line x1="24" y1="14" x2="24" y2="34" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="34" x2="15" y2="46" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="34" x2="33" y2="46" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="20" x2="10" y2="26" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-left"/>
      <line x1="10" y1="26" x2="6"  y2="20" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="20" x2="38" y2="26" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-right"/>
      <line x1="38" y1="26" x2="42" y2="20" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,

    celebrate: (c) => `
      <circle cx="24" cy="8" r="6" fill="none" stroke="${c}" stroke-width="2.2"/>
      <line x1="24" y1="14" x2="24" y2="33" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="33" x2="16" y2="48" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-leg-left"/>
      <line x1="24" y1="33" x2="32" y2="48" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-leg-right"/>
      <line x1="24" y1="20" x2="6"  y2="10" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-left"/>
      <line x1="24" y1="20" x2="42" y2="10" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-right"/>`,

    think: (c) => `
      <circle cx="24" cy="8" r="6" fill="none" stroke="${c}" stroke-width="2.2"/>
      <line x1="24" y1="14" x2="24" y2="34" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="34" x2="16" y2="46" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="34" x2="32" y2="46" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="20" x2="10" y2="28" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-left"/>
      <line x1="24" y1="20" x2="36" y2="16" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-right"/>
      <circle cx="37" cy="13" r="2" fill="${c}"/>`,

    sit: (c) => `
      <circle cx="24" cy="8" r="6" fill="none" stroke="${c}" stroke-width="2.2"/>
      <line x1="24" y1="14" x2="24" y2="32" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="32" x2="36" y2="32" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="36" y1="32" x2="36" y2="46" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="22" x2="12" y2="28" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-left"/>
      <line x1="24" y1="22" x2="36" y2="26" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-right"/>`,

    walk: (c) => `
      <circle cx="24" cy="7" r="6" fill="none" stroke="${c}" stroke-width="2.2"/>
      <line x1="24" y1="13" x2="24" y2="32" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="32" x2="16" y2="46" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-leg-left"/>
      <line x1="24" y1="32" x2="32" y2="44" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-leg-right"/>
      <line x1="24" y1="20" x2="12" y2="26" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-left"/>
      <line x1="24" y1="20" x2="36" y2="22" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-right"/>`,

    jump: (c) => `
      <circle cx="24" cy="6" r="6" fill="none" stroke="${c}" stroke-width="2.2"/>
      <line x1="24" y1="12" x2="24" y2="30" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="30" x2="14" y2="44" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-leg-left"/>
      <line x1="24" y1="30" x2="34" y2="44" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-leg-right"/>
      <line x1="24" y1="18" x2="8"  y2="14" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-left"/>
      <line x1="24" y1="18" x2="40" y2="14" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-right"/>`,

    point: (c) => `
      <circle cx="24" cy="8" r="6" fill="none" stroke="${c}" stroke-width="2.2"/>
      <line x1="24" y1="14" x2="24" y2="34" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="34" x2="15" y2="47" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="34" x2="33" y2="47" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="20" x2="10" y2="28" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-left"/>
      <line x1="24" y1="20" x2="44" y2="18" stroke="${c}" stroke-width="2.2" stroke-linecap="round" class="sf-arm-right"/>
      <circle cx="46" cy="18" r="2" fill="${c}"/>`,
  },

  /* CSS animations injected once */
  _cssInjected: false,
  _injectCSS() {
    if (this._cssInjected) return;
    this._cssInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .sf-arm-right { animation: sfArmRight 1.2s ease-in-out infinite alternate; transform-origin: 24px 20px; }
      .sf-arm-left  { animation: sfArmLeft  1.2s ease-in-out infinite alternate; transform-origin: 24px 20px; }
      .sf-leg-right { animation: sfLegRight 0.7s ease-in-out infinite alternate; transform-origin: 24px 32px; }
      .sf-leg-left  { animation: sfLegLeft  0.7s ease-in-out infinite alternate; transform-origin: 24px 32px; }
      @keyframes sfArmRight { from{transform:rotate(-15deg)} to{transform:rotate(25deg)} }
      @keyframes sfArmLeft  { from{transform:rotate(15deg)}  to{transform:rotate(-20deg)} }
      @keyframes sfLegRight { from{transform:rotate(-12deg)} to{transform:rotate(18deg)} }
      @keyframes sfLegLeft  { from{transform:rotate(12deg)}  to{transform:rotate(-15deg)} }

      .sf-empty-slot, .sf-card-react { display:inline-block; }
      .sf-card-react { position:absolute;top:8px;right:8px;opacity:0;transition:opacity 0.4s ease; pointer-events:none; }
    `;
    document.head.appendChild(style);
  },

  /* Render a single stick figure into a target element */
  render(target, pose = 'wave', size = 36) {
    this._injectCSS();
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    const poseFn = this.poses[pose] || this.poses.wave;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#d4a017';
    const h = Math.round(this.H * size / this.W);
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${this.H}" width="${size}" height="${h}">${poseFn(color)}</svg>`;
  },

  /* Render multiple in a row */
  renderRow(target, poses, size = 36) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    el.innerHTML = poses.map(() => `<span class="sf-slot"></span>`).join('');
    el.querySelectorAll('.sf-slot').forEach((slot, i) => {
      if (poses[i]) this.render(slot, poses[i], size);
    });
  },

  /* Attach a hover-triggered animation to any element */
  attachHover(triggerEl, containerEl, pose = 'wave', size = 36) {
    if (!triggerEl) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'sf-hover-badge';
    wrapper.style.cssText = `position:fixed;pointer-events:none;z-index:9999;opacity:0;transition:opacity 0.2s ease,transform 0.3s cubic-bezier(0.16,1,0.3,1);transform:translateY(8px)`;
    document.body.appendChild(wrapper);
    this.render(wrapper, pose, size);

    triggerEl.addEventListener('mouseenter', () => {
      const rect = triggerEl.getBoundingClientRect();
      wrapper.style.left = (rect.left + rect.width / 2 - size / 2) + 'px';
      wrapper.style.top  = (rect.top - Math.round(56 * size / 48) - 8) + 'px';
      wrapper.style.opacity = '1';
      wrapper.style.transform = 'translateY(0)';
    });
    triggerEl.addEventListener('mouseleave', () => {
      wrapper.style.opacity = '0';
      wrapper.style.transform = 'translateY(8px)';
    });
  }
};

/* ═══════════════════════════════════════════════
   PHYZELYNE INTERACTIONS
   Wires stick figures to specific UI moments.
═══════════════════════════════════════════════ */
const PhyzelyneInteractions = {

  init() {
    this._injectEmptyStates();
    this._wireNavItems();
    this._wireStatCards();
    this._wireTransactionItems();
    this._wireButtons();
  },

  _injectEmptyStates() {
    document.querySelectorAll('.empty-state').forEach(el => {
      if (el.querySelector('.stick-figure')) return;
      const sfSlot = document.createElement('div');
      sfSlot.className = 'sf-empty-slot';
      el.prepend(sfSlot);
      StickFigures.render(sfSlot, 'sit', 44);
    });
  },

  _wireNavItems() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      StickFigures.attachHover(item, item, 'walk', 32);
    });
    document.querySelectorAll('.bottom-nav-item[data-page]').forEach(item => {
      StickFigures.attachHover(item, item, 'run', 28);
    });
  },

  _wireStatCards() {
    document.addEventListener('click', e => {
      const card = e.target.closest('.stat-card');
      if (!card) return;
      let slot = card.querySelector('.sf-card-react');
      if (!slot) {
        slot = document.createElement('div');
        slot.className = 'sf-card-react';
        slot.style.cssText = 'position:absolute;top:8px;right:8px;opacity:0;transition:opacity 0.4s ease;pointer-events:none;';
        card.appendChild(slot);
      }
      StickFigures.render(slot, 'celebrate', 32);
      slot.style.opacity = '1';
      setTimeout(() => { slot.style.opacity = '0'; }, 1800);
    });
  },

  _wireTransactionItems() {
    document.addEventListener('mouseenter', e => {
      const item = e.target.closest('.txn-item');
      if (!item || item.dataset.sfWired) return;
      item.dataset.sfWired = '1';
      StickFigures.attachHover(item, item, 'wave', 28);
    }, true);
  },

  _wireButtons() {
    document.querySelectorAll('.btn-gold').forEach(btn => {
      StickFigures.attachHover(btn, btn, 'jump', 30);
    });
  }
};

/* ═══════════════════════════════════════════════
   TOAST CELEBRATION — fire stick figures from toast
═══════════════════════════════════════════════ */
const _origShowToast = window.showToast;
if (typeof _origShowToast === 'function') {
  window.showToast = function(msg, type = 'success') {
    _origShowToast(msg, type);
    if (type === 'success') {
      let sfToast = document.getElementById('sf-toast-figure');
      if (!sfToast) {
        sfToast = document.createElement('div');
        sfToast.id = 'sf-toast-figure';
        sfToast.style.cssText = 'position:fixed;bottom:90px;right:32px;z-index:99999;opacity:0;transition:opacity 0.3s ease,transform 0.4s cubic-bezier(0.16,1,0.3,1);transform:translateY(20px);pointer-events:none;';
        document.body.appendChild(sfToast);
      }
      StickFigures.render(sfToast, 'celebrate', 36);
      sfToast.style.opacity = '1';
      sfToast.style.transform = 'translateY(0)';
      setTimeout(() => { sfToast.style.opacity = '0'; sfToast.style.transform = 'translateY(20px)'; }, 2800);
    }
  };
}

/* ═══════════════════════════════════════════════
   GLOBAL BROADCAST BANNER (Sync from Admin)
═══════════════════════════════════════════════ */
function initGlobalBroadcastBanner() {
  try {
    const raw = localStorage.getItem('phyzelyne_admin_broadcast');
    if (!raw) return;
    const b = JSON.parse(raw);
    if (!b.active || !b.message) return;

    let banner = document.getElementById('phyzelyne-app-broadcast-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'phyzelyne-app-broadcast-banner';
      banner.style.cssText = 'background:linear-gradient(90deg, #b45309, #d97706, #b45309); color:#fff; padding:10px 24px; font-size:0.85rem; font-weight:600; text-align:center; display:flex; align-items:center; justify-content:center; gap:12px; position:sticky; top:0; z-index:99999; box-shadow:0 4px 18px rgba(0,0,0,0.3);';
      document.body.prepend(banner);
    }
    banner.innerHTML = `
      <span><i class="fas fa-bullhorn"></i> <strong>ANNOUNCEMENT:</strong> ${b.message}</span>
      <button onclick="this.parentElement.remove()" style="background:transparent; border:none; color:#fff; cursor:pointer; font-size:1.1rem; padding:0 6px;"><i class="fas fa-times"></i></button>
    `;
  } catch(e) {}
}

/* ═══════════════════════════════════════════════
   AUTO-INIT on DOMContentLoaded
═══════════════════════════════════════════════ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    PhyzelyneInteractions.init();
    initGlobalBroadcastBanner();
  });
} else {
  setTimeout(() => {
    PhyzelyneInteractions.init();
    initGlobalBroadcastBanner();
  }, 100);
}

