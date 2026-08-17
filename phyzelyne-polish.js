/* ═══════════════════════════════════════════════════════════════
   PHYZELYNE POLISH — shared interaction layer
   Loads after app.js (or standalone on static pages). Additive:
   auto-detects existing DOM structure, adds no required markup.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function(){

    /* ── 1. Auto-tag scroll-reveal candidates ─────────────────
       Section-level blocks and card grids get a gentle rise-in
       the first time they cross into view. */
    if (!reduceMotion){
      var revealSelectors = [
        '.glass-card', '.stat-card', '.card:not(.modal-content)',
        '.auth-card', '.testimonial', '.faq-item', '.expectation',
        '.legal-content > *', 'section', '.chart-container'
      ];
      var seen = new Set();
      var candidates = [];
      revealSelectors.forEach(function(sel){
        document.querySelectorAll(sel).forEach(function(el){
          if (seen.has(el)) return;
          // Skip elements already inside a modal (hidden until opened)
          if (el.closest('.modal, .modal-overlay, [hidden]')) return;
          seen.add(el);
          candidates.push(el);
        });
      });

      if ('IntersectionObserver' in window && candidates.length){
        var io = new IntersectionObserver(function(entries){
          entries.forEach(function(entry){
            if (entry.isIntersecting){
              entry.target.classList.add('pz-in');
              io.unobserve(entry.target);
            }
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

        candidates.forEach(function(el){
          el.classList.add('pz-reveal');
          io.observe(el);
        });
      }
    }

    /* ── 2. Cursor-follow spotlight on cards ──────────────────── */
    if (!reduceMotion && window.matchMedia && window.matchMedia('(hover: hover)').matches){
      var spotlightTargets = document.querySelectorAll('.glass-card, .stat-card, .card, .auth-card');
      spotlightTargets.forEach(function(el){
        el.addEventListener('mousemove', function(e){
          var r = el.getBoundingClientRect();
          el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
          el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
        });
      });
    }

    /* ── 3. Count-up on stat values ────────────────────────────
       Applies to .stat-value / [data-countup] whose text is a
       plain number (optionally with currency symbol / commas / %). */
    function countUp(el){
      var raw = el.textContent.trim();
      var match = raw.match(/^([^\d\-]*)([\d,]+(?:\.\d+)?)(.*)$/);
      if (!match) return;
      var prefix = match[1], numStr = match[2], suffix = match[3];
      var target = parseFloat(numStr.replace(/,/g, ''));
      if (isNaN(target)) return;
      var decimals = (numStr.split('.')[1] || '').length;
      var duration = 900, start = null;
      function frame(ts){
        if (!start) start = ts;
        var p = Math.min((ts - start) / duration, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = target * eased;
        el.textContent = prefix + val.toLocaleString(undefined, {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals
        }) + suffix;
        if (p < 1) requestAnimationFrame(frame);
        else el.textContent = prefix + target.toLocaleString(undefined, {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals
        }) + suffix;
      }
      requestAnimationFrame(frame);
    }

    if (!reduceMotion){
      var statTargets = document.querySelectorAll('.stat-value, [data-countup]');
      if ('IntersectionObserver' in window && statTargets.length){
        var statIo = new IntersectionObserver(function(entries){
          entries.forEach(function(entry){
            if (entry.isIntersecting){
              countUp(entry.target);
              statIo.unobserve(entry.target);
            }
          });
        }, { threshold: 0.4 });
        statTargets.forEach(function(el){ statIo.observe(el); });
      }
    }

    /* ── 4. Magnetic pull on primary buttons ──────────────────── */
    if (!reduceMotion && window.matchMedia && window.matchMedia('(hover: hover)').matches){
      var magnetTargets = document.querySelectorAll('.btn-gold, .button, .btn:not(.btn-glass)');
      magnetTargets.forEach(function(el){
        el.addEventListener('mousemove', function(e){
          var r = el.getBoundingClientRect();
          var mx = (e.clientX - r.left - r.width / 2) * 0.12;
          var my = (e.clientY - r.top - r.height / 2) * 0.25;
          el.style.transform = 'translate(' + mx.toFixed(1) + 'px,' + my.toFixed(1) + 'px)';
        });
        el.addEventListener('mouseleave', function(){
          el.style.transform = '';
        });
      });
    }

    /* ── 5. Click ripple feedback on buttons ──────────────────── */
    document.addEventListener('click', function(e){
      var el = e.target.closest('.btn, .button, .btn-gold');
      if (!el) return;
      var ripple = document.createElement('span');
      var r = el.getBoundingClientRect();
      var size = Math.max(r.width, r.height);
      ripple.style.cssText = [
        'position:absolute', 'border-radius:50%', 'pointer-events:none',
        'width:' + size + 'px', 'height:' + size + 'px',
        'left:' + (e.clientX - r.left - size / 2) + 'px',
        'top:' + (e.clientY - r.top - size / 2) + 'px',
        'background:rgba(255,255,255,.35)', 'transform:scale(0)',
        'opacity:1', 'transition:transform .5s ease-out, opacity .5s ease-out'
      ].join(';');
      var pos = getComputedStyle(el).position;
      if (pos === 'static' || !pos) el.style.position = 'relative';
      var prevOverflow = el.style.overflow;
      el.style.overflow = 'hidden';
      el.appendChild(ripple);
      requestAnimationFrame(function(){
        ripple.style.transform = 'scale(2.2)';
        ripple.style.opacity = '0';
      });
      setTimeout(function(){
        ripple.remove();
        el.style.overflow = prevOverflow;
      }, 520);
    });

  });
})();
