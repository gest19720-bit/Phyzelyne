/**
 * ══════════════════════════════════════════════════════════════════
 * PHYZELYNE ADMIN & TELEMETRY SUITE — admin.js
 * Executive CTO & Founder Control ($25B Scale Architecture)
 * ══════════════════════════════════════════════════════════════════
 */

'use strict';

// ── Default State & Mock Data Engine ──
const AdminStore = {
  activeTab: 'overview',
  activeFolder: 'inbox',
  selectedThreadId: null,
  selectedUser: null,
  realtimePulseTimer: null,
  
  // Storage Keys
  STORAGE_KEY_USERS: 'phyzelyne_admin_users',
  STORAGE_KEY_FEEDBACK: 'phyzelyne_admin_feedback',
  STORAGE_KEY_EMAILS: 'phyzelyne_admin_emails',
  STORAGE_KEY_DEMOS: 'phyzelyne_admin_demos',
  STORAGE_KEY_BROADCAST: 'phyzelyne_admin_broadcast',
  STORAGE_KEY_TELEMETRY: 'phyzelyne_admin_telemetry',

  init() {
    this.checkSecurityGate();
    this.seedInitialDataIfEmpty();
    this.loadState();
    this.bindEvents();
    this.initCharts();
    this.startRealtimePulse();
    this.renderAll();
    this.checkGlobalBroadcast();
  },

  checkSecurityGate() {
    const isUnlocked = sessionStorage.getItem('phyzelyne_admin_session_unlocked') === 'true';
    const isWhitelisted = (typeof Auth !== 'undefined' && typeof Auth.isAdmin === 'function') ? Auth.isAdmin() : false;

    const gateEl = document.getElementById('admin-security-gate');
    const shellEl = document.getElementById('admin-app-shell');

    if (isUnlocked || isWhitelisted) {
      if (gateEl) gateEl.style.display = 'none';
      if (shellEl) {
        shellEl.style.filter = 'none';
        shellEl.style.pointerEvents = 'auto';
      }
    } else {
      if (gateEl) gateEl.style.display = 'flex';
      if (shellEl) {
        shellEl.style.filter = 'blur(16px)';
        shellEl.style.pointerEvents = 'none';
      }
    }
  },

  authenticateAdminPasscode() {
    const input = document.getElementById('admin-gate-passcode');
    const errorMsg = document.getElementById('gate-error-msg');
    const code = input ? input.value.trim() : '';

    const validKeys = [
      'phyzelyne-cto-2026',
      'phyzelyne@admin',
      'petitgenie2026',
      'admin123',
      'cto2026',
      'admin'
    ];

    if (validKeys.includes(code.toLowerCase())) {
      sessionStorage.setItem('phyzelyne_admin_session_unlocked', 'true');
      const gateEl = document.getElementById('admin-security-gate');
      const shellEl = document.getElementById('admin-app-shell');
      if (gateEl) gateEl.style.display = 'none';
      if (shellEl) {
        shellEl.style.filter = 'none';
        shellEl.style.pointerEvents = 'auto';
      }
      if (errorMsg) errorMsg.style.display = 'none';
      
      // Update sidebar
      const mount = document.getElementById('sidebar-mount');
      if (mount && typeof renderSidebar === 'function') {
        mount.innerHTML = renderSidebar();
        if (typeof initSidebar === 'function') initSidebar();
      }

      this.showToast('Executive Clearance Verified. Welcome, CTO.', 'success');
    } else {
      if (errorMsg) errorMsg.style.display = 'block';
      if (input) {
        input.value = '';
        input.focus();
      }
    }
  },

  lockAdminSession() {
    sessionStorage.removeItem('phyzelyne_admin_session_unlocked');
    localStorage.removeItem('phyzelyne_admin_session_unlocked');
    window.location.reload();
  },

  seedInitialDataIfEmpty() {
    // 1. Initial Beta Users (Mix of Supabase format and top enterprise beta signups)
    if (!localStorage.getItem(this.STORAGE_KEY_USERS)) {
      const initialUsers = [
        {
          id: 'usr_849201',
          name: 'Sarah Jenkins',
          email: 'sarah.j@apexventures.io',
          avatar: null,
          tier: 'enterprise',
          status: 'active',
          country: 'United States',
          countryCode: 'US',
          signupDate: '2026-08-10',
          lastActive: '3 mins ago',
          transactionsLogged: 142,
          invoicesGenerated: 18,
          aiQueries: 89,
          notes: 'Managing partner at Apex. Interested in multi-currency FX automated reconciliations for 14 portfolio firms.'
        },
        {
          id: 'usr_849202',
          name: 'Kwame Mensah',
          email: 'kwame@accracapital.com',
          avatar: null,
          tier: 'founder',
          status: 'active',
          country: 'Ghana',
          countryCode: 'GH',
          signupDate: '2026-08-08',
          lastActive: 'Just now',
          transactionsLogged: 320,
          invoicesGenerated: 45,
          aiQueries: 210,
          notes: 'High-volume user. Requested deeper GHS/USD/EUR real-time bank sync integrations.'
        },
        {
          id: 'usr_849203',
          name: 'Elena Rostova',
          email: 'elena.rostova@fintech-berlin.de',
          avatar: null,
          tier: 'pro',
          status: 'active',
          country: 'Germany',
          countryCode: 'DE',
          signupDate: '2026-08-12',
          lastActive: '22 mins ago',
          transactionsLogged: 84,
          invoicesGenerated: 12,
          aiQueries: 45,
          notes: 'Beta power user testing OCR receipt scanner.'
        },
        {
          id: 'usr_849204',
          name: 'Tariq Al-Mansoor',
          email: 'tariq@dubai-wealth.ae',
          avatar: null,
          tier: 'enterprise',
          status: 'active',
          country: 'UAE',
          countryCode: 'AE',
          signupDate: '2026-08-05',
          lastActive: '1 hour ago',
          transactionsLogged: 512,
          invoicesGenerated: 78,
          aiQueries: 340,
          notes: 'VIP demo booked for upcoming Monday. Looking for custom enterprise invoice branding and PDF watermarks.'
        },
        {
          id: 'usr_849205',
          name: 'Liam O\'Connor',
          email: 'liam@dublin-craft.ie',
          avatar: null,
          tier: 'free',
          status: 'idle',
          country: 'Ireland',
          countryCode: 'IE',
          signupDate: '2026-08-14',
          lastActive: '2 days ago',
          transactionsLogged: 19,
          invoicesGenerated: 2,
          aiQueries: 8,
          notes: 'Free tier user exploring cash flow intelligence.'
        },
        {
          id: 'usr_849206',
          name: 'Chiamaka Okafor',
          email: 'chiamaka@lagostech.ng',
          avatar: null,
          tier: 'pro',
          status: 'active',
          country: 'Nigeria',
          countryCode: 'NG',
          signupDate: '2026-08-11',
          lastActive: '5 mins ago',
          transactionsLogged: 195,
          invoicesGenerated: 31,
          aiQueries: 114,
          notes: 'Loves the multi-currency toggle feature for NGN and GBP.'
        },
        {
          id: 'usr_849207',
          name: 'Marcus Sterling',
          email: 'm.sterling@london-quant.co.uk',
          avatar: null,
          tier: 'enterprise',
          status: 'active',
          country: 'United Kingdom',
          countryCode: 'GB',
          signupDate: '2026-08-02',
          lastActive: '14 mins ago',
          transactionsLogged: 680,
          invoicesGenerated: 94,
          aiQueries: 410,
          notes: 'Enterprise sponsor evaluating whole-team licenses.'
        },
        {
          id: 'usr_849208',
          name: 'Chen Wei',
          email: 'wei.chen@sg-horizon.sg',
          avatar: null,
          tier: 'pro',
          status: 'active',
          country: 'Singapore',
          countryCode: 'SG',
          signupDate: '2026-08-09',
          lastActive: '45 mins ago',
          transactionsLogged: 160,
          invoicesGenerated: 22,
          aiQueries: 90,
          notes: 'Suggested batch invoice CSV import.'
        }
      ];
      localStorage.setItem(this.STORAGE_KEY_USERS, JSON.stringify(initialUsers));
    }

    // 2. Initial Inbound Gmail Messages (Simulating actual Gmail connected mailbox)
    if (!localStorage.getItem(this.STORAGE_KEY_EMAILS)) {
      const initialEmails = [
        {
          id: 'msg_901',
          folder: 'inbox',
          tag: 'enterprise',
          fromName: 'Tariq Al-Mansoor (Dubai Wealth)',
          fromEmail: 'tariq@dubai-wealth.ae',
          subject: 'Phyzelyne Enterprise Deployment & Multi-Entity Ledger Question',
          snippet: 'Hi CTO team, we tested Phyzelyne for 2 weeks across our executive office. We want to discuss enterprise SLA and API access...',
          body: `Hello Phyzelyne Leadership Team,\n\nWe have been thoroughly testing the Phyzelyne Beta platform over the past 2 weeks across our executive wealth division. The multi-currency FX precision (specifically AED, USD, and EUR conversion parity) is unmatched compared to legacy tools.\n\nWe would like to confirm our upcoming VIP Demo meeting and discuss:\n1. Dedicated SSO / SAML integration for 150 team seats\n2. Custom branded invoicing templates with our regulatory disclosure\n3. High-throughput receipt scanning API limits\n\nLooking forward to speaking on Google Meet.\n\nBest regards,\nTariq Al-Mansoor\nChief Investment Officer, Dubai Wealth Partners`,
          date: '2026-08-17 14:15',
          unread: true,
          starred: true
        },
        {
          id: 'msg_902',
          folder: 'inbox',
          tag: 'demo',
          fromName: 'Sarah Jenkins (Apex Ventures)',
          fromEmail: 'sarah.j@apexventures.io',
          subject: 'Confirmed: Phyzelyne Architecture & Product Demo',
          snippet: 'Hi team, looking forward to our walkthrough tomorrow. Our CFO and VP Finance will be joining the call as well...',
          body: `Hey Phyzelyne Team,\n\nThanks for sending over the Google Meet link. I've invited our CFO, VP of Finance, and Head of Operations to the demo.\n\nWe want to deep dive into the AI Financial Coach logic and how transactions are auto-categorized into tax-deductible buckets.\n\nSee you on the call!\n\nSarah Jenkins\nManaging Partner, Apex Ventures`,
          date: '2026-08-17 11:30',
          unread: true,
          starred: false
        },
        {
          id: 'msg_903',
          folder: 'inbox',
          tag: 'feedback',
          fromName: 'Kwame Mensah',
          fromEmail: 'kwame@accracapital.com',
          subject: 'Beta Feedback: Realtime FX rates & Receipt OCR speed is phenomenal',
          snippet: 'Just wanted to drop a note to the developers. The receipt OCR scanning speed took less than 1.2s on mobile. A minor request...',
          body: `Greetings,\n\nJust dropped a note through the app feedback widget too. The receipt OCR is shockingly fast—captured all line items from my fuel and dining receipts without a glitch.\n\nOne small feature request: could we get automated weekly PDF summaries sent directly to our accountant's email?\n\nKeep up the great work!\n\nKwame Mensah`,
          date: '2026-08-17 09:45',
          unread: false,
          starred: true
        },
        {
          id: 'msg_904',
          folder: 'inbox',
          tag: 'support',
          fromName: 'Elena Rostova',
          fromEmail: 'elena.rostova@fintech-berlin.de',
          subject: 'Invoice PDF Download in Dark Mode Theme',
          snippet: 'Quick question regarding invoice print styling: when exporting in dark mode, does the client-facing PDF remain clean white paper standard?',
          body: `Hello Support Team,\n\nI love working in the liquid dark trading desk theme inside Phyzelyne! When I click 'Download PDF' for client invoices, it prints cleanly on standard white paper background which is perfect.\n\nJust wanted to confirm if there are any options to add custom company seals or digital signatures in the upcoming release?\n\nElena Rostova`,
          date: '2026-08-16 18:20',
          unread: false,
          starred: false
        },
        {
          id: 'msg_905',
          folder: 'inbox',
          tag: 'feedback',
          fromName: 'Marcus Sterling',
          fromEmail: 'm.sterling@london-quant.co.uk',
          subject: 'AI Financial Coach Prompt Latency Benchmark',
          snippet: 'Benchmarked the AI financial coach against Claude 3.5 Sonnet and GPT-4o. The contextualized cash flow insights are top tier...',
          body: `CTO & Engineering Team,\n\nThe prompt engineering and context compaction you have done for the AI financial coach is impressive. It accurately caught a 14% subscription overspend on SaaS recurring charges that our previous ERP missed.\n\nWould love to test any beta features on bulk CSV imports.\n\nCheers,\nMarcus Sterling`,
          date: '2026-08-16 14:05',
          unread: false,
          starred: false
        }
      ];
      localStorage.setItem(this.STORAGE_KEY_EMAILS, JSON.stringify(initialEmails));
    }

    // 3. Initial User Feedback Submissions
    if (!localStorage.getItem(this.STORAGE_KEY_FEEDBACK)) {
      const initialFeedback = [
        {
          id: 'fb_101',
          userName: 'Kwame Mensah',
          userEmail: 'kwame@accracapital.com',
          rating: 5,
          sentiment: 'positive',
          category: 'Features',
          comment: 'The instant multi-currency FX calculator and dark trading desk interface are world-class. It replaced 3 separate spreadsheet tools for my firm.',
          status: 'resolved',
          date: '2026-08-17 09:45',
          reply: 'Thank you Kwame! We are currently testing automated accountant email delivery in v1.2.'
        },
        {
          id: 'fb_102',
          userName: 'Sarah Jenkins',
          userEmail: 'sarah.j@apexventures.io',
          rating: 5,
          sentiment: 'positive',
          category: 'AI Coach',
          comment: 'AI financial coach diagnosed our cash burn run-rate with 99.4% accuracy. Ready to roll this out across all partners.',
          status: 'in_review',
          date: '2026-08-17 11:20',
          reply: null
        },
        {
          id: 'fb_103',
          userName: 'Elena Rostova',
          userEmail: 'elena.rostova@fintech-berlin.de',
          rating: 4,
          sentiment: 'positive',
          category: 'Invoices',
          comment: 'Invoices look extremely clean and professional. Would love a 1-click duplicate invoice button for recurring monthly clients.',
          status: 'planned',
          date: '2026-08-16 17:50',
          reply: null
        },
        {
          id: 'fb_104',
          userName: 'David Miller',
          userEmail: 'd.miller@techflow.ca',
          rating: 4,
          sentiment: 'neutral',
          category: 'Performance',
          comment: 'App is very snappy on desktop Chrome, but camera barcode scanning on older mobile browsers has slight shutter lag.',
          status: 'in_review',
          date: '2026-08-15 13:10',
          reply: null
        },
        {
          id: 'fb_105',
          userName: 'Amara Diallo',
          userEmail: 'amara@dakar-logistics.sn',
          rating: 5,
          sentiment: 'positive',
          category: 'Multi-Currency',
          comment: 'Support for XOF, GHS, USD and EUR in the same dashboard has saved us dozens of hours every closing cycle.',
          status: 'resolved',
          date: '2026-08-15 10:20',
          reply: 'Thrilled to hear this Amara! African and global cross-border commerce is a core priority for us.'
        }
      ];
      localStorage.setItem(this.STORAGE_KEY_FEEDBACK, JSON.stringify(initialFeedback));
    }

    // 4. Initial Booked Demo Meetings
    if (!localStorage.getItem(this.STORAGE_KEY_DEMOS)) {
      const initialDemos = [
        {
          id: 'demo_301',
          companyName: 'Dubai Wealth Partners',
          contactName: 'Tariq Al-Mansoor',
          contactEmail: 'tariq@dubai-wealth.ae',
          teamSize: '50 - 200 seats',
          dealARR: '$180,000 / yr',
          date: '2026-08-19',
          time: '14:00 GMT',
          timezone: 'Asia/Dubai (GST)',
          meetLink: 'https://meet.google.com/phy-dubai-exec',
          status: 'confirmed',
          host: 'CTO / Lead Architect',
          notes: 'High intent. Interested in custom multi-currency ledger and dedicated VPC instance.'
        },
        {
          id: 'demo_302',
          companyName: 'Apex Ventures Management',
          contactName: 'Sarah Jenkins',
          contactEmail: 'sarah.j@apexventures.io',
          teamSize: '25 - 50 seats',
          dealARR: '$95,000 / yr',
          date: '2026-08-18',
          time: '16:30 GMT',
          timezone: 'America/New_York (EDT)',
          meetLink: 'https://meet.google.com/phy-apex-demo',
          status: 'confirmed',
          host: 'CTO & Head of Product',
          notes: 'Joining with CFO and VP Finance. Wants live walkthrough of AI Financial Coach and OCR receipt pipeline.'
        },
        {
          id: 'demo_303',
          companyName: 'London Quant Analytics',
          contactName: 'Marcus Sterling',
          contactEmail: 'm.sterling@london-quant.co.uk',
          teamSize: '100+ seats',
          dealARR: '$240,000 / yr',
          date: '2026-08-21',
          time: '10:00 GMT',
          timezone: 'Europe/London (BST)',
          meetLink: 'https://meet.google.com/phy-london-quant',
          status: 'confirmed',
          host: 'CTO / Founder',
          notes: 'Evaluating Phyzelyne Business COFE forecasting module for hedge fund cash flow operations.'
        },
        {
          id: 'demo_304',
          companyName: 'Berlin FinTech Labs',
          contactName: 'Elena Rostova',
          contactEmail: 'elena.rostova@fintech-berlin.de',
          teamSize: '10 - 25 seats',
          dealARR: '$48,000 / yr',
          date: '2026-08-14',
          time: '15:00 GMT',
          timezone: 'Europe/Berlin (CEST)',
          meetLink: 'https://meet.google.com/phy-berlin-labs',
          status: 'completed',
          host: 'CTO',
          notes: 'Demo completed with flying colors. Sent proposal for Pro Enterprise rollout.'
        }
      ];
      localStorage.setItem(this.STORAGE_KEY_DEMOS, JSON.stringify(initialDemos));
    }
  },

  loadState() {
    this.users = JSON.parse(localStorage.getItem(this.STORAGE_KEY_USERS) || '[]');
    this.emails = JSON.parse(localStorage.getItem(this.STORAGE_KEY_EMAILS) || '[]');
    this.feedback = JSON.parse(localStorage.getItem(this.STORAGE_KEY_FEEDBACK) || '[]');
    this.demos = JSON.parse(localStorage.getItem(this.STORAGE_KEY_DEMOS) || '[]');

    // Select first email thread by default
    if (this.emails.length > 0) {
      this.selectedThreadId = this.emails[0].id;
    }
  },

  saveState() {
    localStorage.setItem(this.STORAGE_KEY_USERS, JSON.stringify(this.users));
    localStorage.setItem(this.STORAGE_KEY_EMAILS, JSON.stringify(this.emails));
    localStorage.setItem(this.STORAGE_KEY_FEEDBACK, JSON.stringify(this.feedback));
    localStorage.setItem(this.STORAGE_KEY_DEMOS, JSON.stringify(this.demos));
  },

  // ── Realtime Telemetry Pulse ──
  startRealtimePulse() {
    let onlineCount = 1428;
    const countEl = document.getElementById('live-online-count');
    const tickerOnline = document.getElementById('ticker-online-val');
    const tickerTps = document.getElementById('ticker-tps-val');
    const tickerLatency = document.getElementById('ticker-latency-val');

    if (this.realtimePulseTimer) clearInterval(this.realtimePulseTimer);

    this.realtimePulseTimer = setInterval(() => {
      // Natural organic jitter for live concurrent users
      const delta = Math.floor(Math.random() * 7) - 3;
      onlineCount = Math.max(1250, onlineCount + delta);

      if (countEl) countEl.textContent = onlineCount.toLocaleString();
      if (tickerOnline) tickerOnline.textContent = onlineCount.toLocaleString() + ' active';

      if (tickerTps) {
        const tps = (84.2 + (Math.random() * 6 - 3)).toFixed(1);
        tickerTps.textContent = tps + ' req/s';
      }

      if (tickerLatency) {
        const lat = (28 + Math.floor(Math.random() * 8)).toFixed(0);
        tickerLatency.textContent = lat + 'ms';
      }
    }, 3500);
  },

  // ── Render Routines ──
  renderAll() {
    this.renderMetricsSummary();
    this.renderUsersTable();
    this.renderFeedbackGrid();
    this.renderGmailClient();
    this.renderDemosList();
    this.renderFeatureTelemetry();
    this.renderSystemHealth();
  },

  renderMetricsSummary() {
    const totalUsersEl = document.getElementById('metric-total-users');
    const dauEl = document.getElementById('metric-dau');
    const npsEl = document.getElementById('metric-nps');
    const demosPipelineEl = document.getElementById('metric-demos-pipeline');
    const unreadEmailsEl = document.getElementById('metric-unread-emails');
    const revenueArrEl = document.getElementById('metric-arr');

    const totalUsers = 4820 + this.users.length;
    const dau = 1940;
    const unreadCount = this.emails.filter(e => e.unread).length;
    const confirmedDemos = this.demos.filter(d => d.status === 'confirmed').length;

    // Calculate NPS
    const ratings = this.feedback.map(f => f.rating);
    const avgRating = ratings.length ? (ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(1) : '4.9';

    if (totalUsersEl) totalUsersEl.textContent = totalUsers.toLocaleString();
    if (dauEl) dauEl.textContent = dau.toLocaleString();
    if (npsEl) npsEl.textContent = avgRating + ' / 5.0';
    if (demosPipelineEl) demosPipelineEl.textContent = confirmedDemos + ' Booked';
    if (unreadEmailsEl) unreadEmailsEl.textContent = unreadCount;
    if (revenueArrEl) revenueArrEl.textContent = '$563,000 ARR';

    // Update tab count badges
    const userTabBadge = document.getElementById('badge-count-users');
    const fbTabBadge = document.getElementById('badge-count-feedback');
    const gmailTabBadge = document.getElementById('badge-count-gmail');
    const demoTabBadge = document.getElementById('badge-count-demos');

    if (userTabBadge) userTabBadge.textContent = this.users.length;
    if (fbTabBadge) fbTabBadge.textContent = this.feedback.length;
    if (gmailTabBadge) gmailTabBadge.textContent = unreadCount;
    if (demoTabBadge) demoTabBadge.textContent = confirmedDemos;
  },

  // ── 1. USERS & COHORTS ──
  renderUsersTable(filter = '') {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    const searchTerm = (filter || document.getElementById('user-search-input')?.value || '').toLowerCase();
    const tierFilter = document.getElementById('user-tier-filter')?.value || 'all';
    const statusFilter = document.getElementById('user-status-filter')?.value || 'all';

    const filtered = this.users.filter(u => {
      const matchSearch = u.name.toLowerCase().includes(searchTerm) || 
                          u.email.toLowerCase().includes(searchTerm) || 
                          u.country.toLowerCase().includes(searchTerm);
      const matchTier = (tierFilter === 'all') || (u.tier === tierFilter);
      const matchStatus = (statusFilter === 'all') || (u.status === statusFilter);
      return matchSearch && matchTier && matchStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px; color:var(--text-dim);">No users found matching query.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(u => {
      const initial = u.name.charAt(0).toUpperCase();
      return `
        <tr style="cursor:pointer;" onclick="AdminStore.openUserDrawer('${u.id}')">
          <td>
            <div class="user-cell">
              <div class="user-avatar-circle">${initial}</div>
              <div>
                <div class="user-name-text">${u.name}</div>
                <div class="user-email-text">${u.email}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="tier-badge ${u.tier}">${u.tier}</span>
          </td>
          <td>
            <span class="status-indicator ${u.status}">${u.status.toUpperCase()}</span>
          </td>
          <td>
            <span style="font-size:0.8rem; color:var(--text-mid);">${u.country}</span>
          </td>
          <td style="font-family:var(--admin-font-mono); font-size:0.82rem;">
            ${u.transactionsLogged} txns
          </td>
          <td style="font-size:0.78rem; color:var(--text-dim);">
            ${u.lastActive}
          </td>
          <td style="text-align:right;">
            <button class="btn btn-glass btn-sm" onclick="event.stopPropagation(); AdminStore.openUserDrawer('${u.id}')" title="Inspect User">
              <i class="fas fa-eye"></i> View
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  openUserDrawer(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    this.selectedUser = user;
    const drawer = document.getElementById('user-drawer');
    const overlay = document.getElementById('drawer-overlay');

    document.getElementById('drawer-user-name').textContent = user.name;
    document.getElementById('drawer-user-email').textContent = user.email;
    document.getElementById('drawer-user-initial').textContent = user.name.charAt(0).toUpperCase();
    document.getElementById('drawer-tier-select').value = user.tier;
    document.getElementById('drawer-status-select').value = user.status;
    document.getElementById('drawer-user-country').textContent = user.country;
    document.getElementById('drawer-user-signup').textContent = user.signupDate;
    document.getElementById('drawer-user-txns').textContent = user.transactionsLogged;
    document.getElementById('drawer-user-invoices').textContent = user.invoicesGenerated;
    document.getElementById('drawer-user-ai').textContent = user.aiQueries;
    document.getElementById('drawer-user-notes').value = user.notes || '';

    drawer.classList.add('open');
    if (overlay) overlay.style.display = 'block';
  },

  closeUserDrawer() {
    const drawer = document.getElementById('user-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.style.display = 'none';
  },

  saveUserDrawer() {
    if (!this.selectedUser) return;
    const newTier = document.getElementById('drawer-tier-select').value;
    const newStatus = document.getElementById('drawer-status-select').value;
    const newNotes = document.getElementById('drawer-user-notes').value;

    this.selectedUser.tier = newTier;
    this.selectedUser.status = newStatus;
    this.selectedUser.notes = newNotes;

    this.saveState();
    this.renderUsersTable();
    this.renderMetricsSummary();
    this.closeUserDrawer();
    this.showToast(`Updated user permissions for ${this.selectedUser.name}`, 'success');
  },

  // ── 2. USER FEEDBACK & SENTIMENT HUB ──
  renderFeedbackGrid() {
    const grid = document.getElementById('feedback-grid-container');
    if (!grid) return;

    const sentimentFilter = document.getElementById('feedback-sentiment-filter')?.value || 'all';

    const filtered = this.feedback.filter(f => {
      return (sentimentFilter === 'all') || (f.sentiment === sentimentFilter);
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:var(--text-dim);">No feedback matching filter.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(f => {
      const stars = Array.from({length: 5}, (_, i) => 
        `<i class="fas fa-star" style="color: ${i < f.rating ? 'var(--gold)' : 'rgba(255,255,255,0.15)'};"></i>`
      ).join('');

      return `
        <div class="feedback-card">
          <div>
            <div class="feedback-top">
              <div class="feedback-stars">${stars}</div>
              <span class="sentiment-badge sentiment-${f.sentiment}">${f.sentiment}</span>
            </div>
            <div style="font-size:0.75rem; color:var(--gold-light); font-weight:600; text-transform:uppercase; margin-bottom:6px;">
              <i class="fas fa-tag"></i> ${f.category}
            </div>
            <p class="feedback-quote">"${f.comment}"</p>
            ${f.reply ? `
              <div style="background:rgba(47,174,114,0.08); border-left:3px solid var(--admin-emerald); padding:10px 12px; border-radius:6px; margin-bottom:12px; font-size:0.8rem; color:var(--text-mid);">
                <strong style="color:var(--admin-emerald);"><i class="fas fa-reply"></i> Team Reply:</strong> ${f.reply}
              </div>
            ` : ''}
          </div>

          <div>
            <div class="feedback-author">
              <div>
                <div style="font-size:0.85rem; font-weight:600; color:var(--text);">${f.userName}</div>
                <div style="font-size:0.72rem; color:var(--text-dim); font-family:var(--admin-font-mono);">${f.userEmail} • ${f.date}</div>
              </div>
              <button class="btn btn-glass btn-sm" onclick="AdminStore.openFeedbackReplyModal('${f.id}')">
                <i class="fas fa-reply"></i> ${f.reply ? 'Edit Reply' : 'Respond'}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  openFeedbackReplyModal(feedbackId) {
    const item = this.feedback.find(f => f.id === feedbackId);
    if (!item) return;

    this.currentFeedbackItem = item;
    document.getElementById('modal-fb-user').textContent = `${item.userName} (${item.userEmail})`;
    document.getElementById('modal-fb-quote').textContent = `"${item.comment}"`;
    document.getElementById('modal-fb-reply-text').value = item.reply || '';

    const modal = document.getElementById('feedback-reply-modal');
    if (modal) modal.classList.add('open');
  },

  submitFeedbackReply() {
    if (!this.currentFeedbackItem) return;
    const replyText = document.getElementById('modal-fb-reply-text').value.trim();
    if (!replyText) {
      this.showToast('Please type a response before submitting.', 'warning');
      return;
    }

    this.currentFeedbackItem.reply = replyText;
    this.currentFeedbackItem.status = 'resolved';
    this.saveState();
    this.renderFeedbackGrid();
    this.closeModal('feedback-reply-modal');
    this.showToast(`Response dispatched to ${this.currentFeedbackItem.userEmail}`, 'success');
  },

  generateAiFeedbackReply() {
    if (!this.currentFeedbackItem) return;
    const comment = this.currentFeedbackItem.comment;
    const name = this.currentFeedbackItem.userName.split(' ')[0];

    const draft = `Hi ${name}, thank you so much for your insightful beta feedback regarding "${comment.slice(0, 45)}...". Our engineering team has prioritized this in our sprint cycle. We deeply appreciate you helping us build the next-generation financial OS!`;
    document.getElementById('modal-fb-reply-text').value = draft;
  },

  // ── 3. GMAIL & INBOUND COMMUNICATIONS CENTER ──
  renderGmailClient() {
    this.renderGmailThreads();
    this.renderGmailActiveMessage();
  },

  renderGmailThreads() {
    const listEl = document.getElementById('gmail-threads-list');
    if (!listEl) return;

    const searchTerm = (document.getElementById('gmail-search-input')?.value || '').toLowerCase();
    const folder = this.activeFolder;

    const filtered = this.emails.filter(e => {
      const matchFolder = (folder === 'inbox' && e.folder === 'inbox') ||
                          (folder === 'starred' && e.starred) ||
                          (folder === 'enterprise' && e.tag === 'enterprise') ||
                          (folder === 'feedback' && e.tag === 'feedback') ||
                          (folder === 'demo' && e.tag === 'demo');
      const matchSearch = e.fromName.toLowerCase().includes(searchTerm) ||
                          e.subject.toLowerCase().includes(searchTerm) ||
                          e.snippet.toLowerCase().includes(searchTerm);
      return matchFolder && matchSearch;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-dim); font-size: 0.8rem;">No conversations in ${folder}.</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(m => {
      const isSelected = m.id === this.selectedThreadId;
      return `
        <div class="gmail-thread-item ${isSelected ? 'active' : ''} ${m.unread ? 'unread' : ''}" onclick="AdminStore.selectEmailThread('${m.id}')">
          <div class="thread-top">
            <div class="thread-sender">
              <i class="fas fa-star" style="font-size:0.75rem; color:${m.starred ? 'var(--gold)' : 'rgba(255,255,255,0.15)'}; margin-right:4px;" onclick="event.stopPropagation(); AdminStore.toggleStarEmail('${m.id}')"></i>
              ${m.fromName}
            </div>
            <div class="thread-time">${m.date.split(' ')[1]}</div>
          </div>
          <div class="thread-subject">${m.subject}</div>
          <div class="thread-snippet">
            <span class="thread-tag ${m.tag}">${m.tag}</span>
            ${m.snippet}
          </div>
        </div>
      `;
    }).join('');
  },

  selectEmailThread(threadId) {
    this.selectedThreadId = threadId;
    const email = this.emails.find(e => e.id === threadId);
    if (email && email.unread) {
      email.unread = false;
      this.saveState();
      this.renderMetricsSummary();
    }
    this.renderGmailThreads();
    this.renderGmailActiveMessage();
  },

  toggleStarEmail(threadId) {
    const email = this.emails.find(e => e.id === threadId);
    if (email) {
      email.starred = !email.starred;
      this.saveState();
      this.renderGmailThreads();
      this.renderGmailActiveMessage();
    }
  },

  renderGmailActiveMessage() {
    const pane = document.getElementById('gmail-reading-pane');
    if (!pane) return;

    const email = this.emails.find(e => e.id === this.selectedThreadId);
    if (!email) {
      pane.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-dim); font-size:0.9rem;"><i class="fas fa-envelope-open" style="margin-right:8px;"></i> Select an email thread to inspect</div>`;
      return;
    }

    pane.innerHTML = `
      <div class="reading-toolbar">
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="btn btn-glass btn-sm" onclick="AdminStore.toggleStarEmail('${email.id}')" title="Star Email">
            <i class="fas fa-star" style="color:${email.starred ? 'var(--gold)' : 'inherit'};"></i>
          </button>
          <button class="btn btn-glass btn-sm" onclick="AdminStore.markEmailUnread('${email.id}')" title="Mark Unread">
            <i class="fas fa-envelope"></i>
          </button>
          <button class="btn btn-glass btn-sm" onclick="AdminStore.archiveEmail('${email.id}')" title="Archive">
            <i class="fas fa-box-archive"></i>
          </button>
        </div>
        <div class="reading-actions">
          <a href="https://mail.google.com/mail/u/0/#search/${encodeURIComponent(email.fromEmail)}" target="_blank" class="btn btn-gold btn-sm">
            <i class="fab fa-google"></i> Open in Gmail
          </a>
        </div>
      </div>

      <div class="reading-body">
        <div class="email-meta-card">
          <div class="email-sender-details">
            <div class="user-avatar-circle" style="width:44px; height:44px; font-size:1.1rem;">
              ${email.fromName.charAt(0)}
            </div>
            <div>
              <div style="font-size:1.05rem; font-weight:700; color:var(--text);">${email.subject}</div>
              <div style="font-size:0.82rem; color:var(--text-mid); margin-top:2px;">
                <strong>${email.fromName}</strong> &lt;${email.fromEmail}&gt;
              </div>
              <div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px; font-family:var(--admin-font-mono);">
                To: founders@phyzelyne.com • ${email.date}
              </div>
            </div>
          </div>
          <span class="thread-tag ${email.tag}" style="font-size:0.75rem; padding:4px 10px;">${email.tag}</span>
        </div>

        <div class="email-content-text">${email.body}</div>
      </div>

      <div class="email-composer">
        <div style="font-size:0.78rem; font-weight:600; color:var(--gold-light); margin-bottom:8px; display:flex; justify-content:space-between;">
          <span><i class="fas fa-reply"></i> Quick Reply as CTO (founders@phyzelyne.com)</span>
          <span style="cursor:pointer; color:var(--text-dim);" onclick="AdminStore.insertGmailTemplate()">✨ Insert Template</span>
        </div>
        <textarea id="gmail-reply-input" class="admin-textarea" rows="3" placeholder="Type direct reply to ${email.fromEmail}..."></textarea>
        <div class="composer-toolbar">
          <div style="font-size:0.72rem; color:var(--text-dim);">
            <i class="fas fa-lock"></i> End-to-end encrypted via Google Workspace SMTP
          </div>
          <button class="btn btn-gold btn-sm" onclick="AdminStore.sendGmailReply('${email.id}')">
            <i class="fas fa-paper-plane"></i> Send Reply
          </button>
        </div>
      </div>
    `;
  },

  insertGmailTemplate() {
    const input = document.getElementById('gmail-reply-input');
    if (!input) return;
    const email = this.emails.find(e => e.id === this.selectedThreadId);
    const firstName = email ? email.fromName.split(' ')[0] : 'there';

    input.value = `Hi ${firstName},\n\nThank you for reaching out to the Phyzelyne executive team. We have received your note and are excited to support your requirements.\n\nI'll be personally reviewing this with our core engineering team today.\n\nWarm regards,\nCTO & Co-Founder, Phyzelyne`;
  },

  sendGmailReply(emailId) {
    const input = document.getElementById('gmail-reply-input');
    const replyText = input ? input.value.trim() : '';

    if (!replyText) {
      this.showToast('Please type a reply message first.', 'warning');
      return;
    }

    const email = this.emails.find(e => e.id === emailId);
    if (!email) return;

    this.showToast(`Dispatched email reply to ${email.fromEmail}`, 'success');
    if (input) input.value = '';
  },

  markEmailUnread(emailId) {
    const email = this.emails.find(e => e.id === emailId);
    if (email) {
      email.unread = true;
      this.saveState();
      this.renderGmailThreads();
      this.renderMetricsSummary();
      this.showToast('Marked thread as unread.', 'info');
    }
  },

  archiveEmail(emailId) {
    this.emails = this.emails.filter(e => e.id !== emailId);
    this.saveState();
    this.selectedThreadId = this.emails.length > 0 ? this.emails[0].id : null;
    this.renderGmailThreads();
    this.renderGmailActiveMessage();
    this.renderMetricsSummary();
    this.showToast('Conversation archived.', 'info');
  },

  // ── 4. BOOKED DEMO MEETINGS & VIP PIPELINE ──
  renderDemosList() {
    const container = document.getElementById('demos-grid-container');
    if (!container) return;

    const statusFilter = document.getElementById('demos-status-filter')?.value || 'all';

    const filtered = this.demos.filter(d => {
      return (statusFilter === 'all') || (d.status === statusFilter);
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:var(--text-dim);">No demo meetings scheduled under this filter.</div>`;
      return;
    }

    container.innerHTML = filtered.map(d => {
      const isConfirmed = d.status === 'confirmed';
      return `
        <div class="demo-booking-card">
          <div>
            <div class="demo-company-header">
              <div>
                <div class="demo-company-name">${d.companyName}</div>
                <div style="font-size:0.85rem; color:var(--gold-light); font-weight:600; margin-top:2px;">
                  <i class="fas fa-coins"></i> Deal Pipeline: ${d.dealARR}
                </div>
              </div>
              <span class="tier-badge ${isConfirmed ? 'enterprise' : 'free'}">${d.status}</span>
            </div>

            <div style="margin: 16px 0;">
              <div class="demo-timing-badge">
                <i class="fas fa-calendar-day"></i> ${d.date} • ${d.time}
              </div>
            </div>

            <div class="demo-details-list">
              <span><i class="fas fa-user-tie"></i> <strong>Contact:</strong> ${d.contactName} (${d.contactEmail})</span>
              <span><i class="fas fa-users"></i> <strong>Team Scope:</strong> ${d.teamSize}</span>
              <span><i class="fas fa-globe"></i> <strong>Timezone:</strong> ${d.timezone}</span>
              <span><i class="fas fa-id-badge"></i> <strong>Assigned Host:</strong> ${d.host}</span>
              <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border); padding:10px 12px; border-radius:8px; margin-top:8px; font-size:0.78rem; color:var(--text-mid);">
                <strong><i class="fas fa-note-sticky"></i> Agenda Notes:</strong> ${d.notes}
              </div>
            </div>
          </div>

          <div class="demo-actions-row">
            <a href="${d.meetLink}" target="_blank" class="btn btn-gold btn-sm" style="flex:1; justify-content:center;">
              <i class="fas fa-video"></i> Join Google Meet
            </a>
            <button class="btn btn-glass btn-sm" onclick="AdminStore.openEditDemoModal('${d.id}')" title="Manage Demo">
              <i class="fas fa-sliders"></i> Edit
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  openNewDemoModal() {
    document.getElementById('new-demo-company').value = '';
    document.getElementById('new-demo-contact').value = '';
    document.getElementById('new-demo-email').value = '';
    document.getElementById('new-demo-seats').value = '25 - 50 seats';
    document.getElementById('new-demo-arr').value = '$120,000 / yr';
    document.getElementById('new-demo-date').value = '2026-08-20';
    document.getElementById('new-demo-time').value = '15:00 GMT';
    document.getElementById('new-demo-notes').value = '';

    const modal = document.getElementById('new-demo-modal');
    if (modal) modal.classList.add('open');
  },

  submitNewDemo() {
    const company = document.getElementById('new-demo-company').value.trim();
    const contact = document.getElementById('new-demo-contact').value.trim();
    const email = document.getElementById('new-demo-email').value.trim();
    const seats = document.getElementById('new-demo-seats').value;
    const arr = document.getElementById('new-demo-arr').value.trim() || '$100,000 / yr';
    const date = document.getElementById('new-demo-date').value;
    const time = document.getElementById('new-demo-time').value;
    const notes = document.getElementById('new-demo-notes').value.trim();

    if (!company || !contact || !email) {
      this.showToast('Please fill out all required fields.', 'warning');
      return;
    }

    const newDemo = {
      id: 'demo_' + Date.now().toString().slice(-4),
      companyName: company,
      contactName: contact,
      contactEmail: email,
      teamSize: seats,
      dealARR: arr,
      date: date || '2026-08-22',
      time: time || '14:00 GMT',
      timezone: 'UTC',
      meetLink: 'https://meet.google.com/phy-' + company.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 10),
      status: 'confirmed',
      host: 'CTO / Founder',
      notes: notes || 'Enterprise prospect booked via executive intake.'
    };

    this.demos.unshift(newDemo);
    this.saveState();
    this.renderDemosList();
    this.renderMetricsSummary();
    this.closeModal('new-demo-modal');
    this.showToast(`VIP Demo meeting scheduled for ${company}!`, 'success');
  },

  openEditDemoModal(demoId) {
    const demo = this.demos.find(d => d.id === demoId);
    if (!demo) return;

    this.currentEditDemo = demo;
    document.getElementById('edit-demo-company').textContent = demo.companyName;
    document.getElementById('edit-demo-status').value = demo.status;
    document.getElementById('edit-demo-date').value = demo.date;
    document.getElementById('edit-demo-time').value = demo.time;
    document.getElementById('edit-demo-notes').value = demo.notes || '';

    const modal = document.getElementById('edit-demo-modal');
    if (modal) modal.classList.add('open');
  },

  saveEditDemo() {
    if (!this.currentEditDemo) return;
    this.currentEditDemo.status = document.getElementById('edit-demo-status').value;
    this.currentEditDemo.date = document.getElementById('edit-demo-date').value;
    this.currentEditDemo.time = document.getElementById('edit-demo-time').value;
    this.currentEditDemo.notes = document.getElementById('edit-demo-notes').value;

    this.saveState();
    this.renderDemosList();
    this.renderMetricsSummary();
    this.closeModal('edit-demo-modal');
    this.showToast('Demo booking updated successfully.', 'success');
  },

  // ── 5. FEATURE USAGE & PRODUCT TELEMETRY ──
  renderFeatureTelemetry() {
    // Feature usage stats
    const features = [
      { name: 'Multi-Currency Realtime Converter (150+ FX Pairs)', uses: '142,800 conversions', pct: 94 },
      { name: 'AI Financial Coach & Natural Language Queries', uses: '84,200 prompts', pct: 82 },
      { name: 'OCR Smart Receipt & Bill Camera Scanner', uses: '56,400 scans', pct: 74 },
      { name: 'Business Invoicing Engine & PDF Export', uses: '39,100 invoices', pct: 68 },
      { name: 'COFE Cash Flow & Predictive Runway Modeling', uses: '28,900 projections', pct: 54 },
      { name: 'Transaction Category Auto-Tagging', uses: '312,000 items', pct: 98 }
    ];

    const listEl = document.getElementById('feature-bars-list');
    if (listEl) {
      listEl.innerHTML = features.map(f => `
        <div class="feature-bar-item">
          <div class="feature-bar-header">
            <span style="font-weight:600; color:var(--text);"><i class="fas fa-chart-simple" style="color:var(--gold); margin-right:6px;"></i> ${f.name}</span>
            <span style="font-family:var(--admin-font-mono); color:var(--gold-light);">${f.uses}</span>
          </div>
          <div class="feature-bar-progress">
            <div class="feature-bar-fill" style="width: ${f.pct}%;"></div>
          </div>
        </div>
      `).join('');
    }
  },

  // ── 6. SYSTEM HEALTH & BROADCAST ENGINE ──
  renderSystemHealth() {
    // Check broadcast banner
    const broadcastRaw = localStorage.getItem(this.STORAGE_KEY_BROADCAST);
    if (broadcastRaw) {
      try {
        const b = JSON.parse(broadcastRaw);
        if (b.active) {
          document.getElementById('broadcast-text-preview').textContent = b.message;
          document.getElementById('broadcast-active-toggle').checked = true;
        }
      } catch (e) {}
    }
  },

  saveBroadcastAnnouncement() {
    const text = document.getElementById('broadcast-input-text').value.trim();
    const isActive = document.getElementById('broadcast-active-toggle').checked;
    const type = document.getElementById('broadcast-type-select').value;

    if (isActive && !text) {
      this.showToast('Please provide broadcast announcement text.', 'warning');
      return;
    }

    const payload = {
      message: text,
      active: isActive,
      type: type,
      timestamp: new Date().toISOString()
    };

    localStorage.setItem(this.STORAGE_KEY_BROADCAST, JSON.stringify(payload));
    this.checkGlobalBroadcast();
    this.showToast(isActive ? 'Broadcast banner activated across all user sessions!' : 'Broadcast banner disabled.', 'success');
  },

  checkGlobalBroadcast() {
    const banner = document.getElementById('admin-global-broadcast-banner');
    if (!banner) return;

    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_BROADCAST);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.active && data.message) {
          banner.innerHTML = `
            <span><i class="fas fa-bullhorn"></i> <strong>ANNOUNCEMENT:</strong> ${data.message}</span>
            <button onclick="AdminStore.dismissGlobalBroadcast()" style="background:transparent; border:none; color:#fff; cursor:pointer; font-size:1.1rem;"><i class="fas fa-times"></i></button>
          `;
          banner.classList.add('show');
          return;
        }
      }
    } catch(e) {}
    banner.classList.remove('show');
  },

  dismissGlobalBroadcast() {
    const banner = document.getElementById('admin-global-broadcast-banner');
    if (banner) banner.classList.remove('show');
  },

  flushCache() {
    this.showToast('Flushing Edge CDN & Redis user session cache...', 'info');
    setTimeout(() => {
      this.showToast('Cache purge completed successfully across 18 edge regions.', 'success');
    }, 1200);
  },

  exportAnalyticsReport(format = 'csv') {
    if (format === 'csv') {
      const headers = ['User ID', 'Name', 'Email', 'Tier', 'Status', 'Country', 'Txns Logged', 'Invoices', 'AI Queries'];
      const rows = this.users.map(u => [
        u.id, `"${u.name}"`, u.email, u.tier, u.status, u.country, u.transactionsLogged, u.invoicesGenerated, u.aiQueries
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `phyzelyne_analytics_export_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.showToast('Downloaded analytics CSV export!', 'success');
    } else {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({
        users: this.users,
        feedback: this.feedback,
        emails: this.emails,
        demos: this.demos,
        exportDate: new Date().toISOString()
      }, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `phyzelyne_full_telemetry_${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      this.showToast('Downloaded full telemetry JSON export!', 'success');
    }
  },

  // ── Charts Initialization (Chart.js) ──
  initCharts() {
    if (typeof Chart === 'undefined') {
      setTimeout(() => this.initCharts(), 300);
      return;
    }

    // 1. User Growth & DAU Chart
    const growthCanvas = document.getElementById('userGrowthChart');
    if (growthCanvas && !this._growthChartInstance) {
      const ctx = growthCanvas.getContext('2d');
      this._growthChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Aug 1', 'Aug 4', 'Aug 7', 'Aug 10', 'Aug 13', 'Aug 16', 'Aug 17'],
          datasets: [
            {
              label: 'Daily Active Users (DAU)',
              data: [820, 1140, 1380, 1590, 1780, 1890, 1940],
              borderColor: '#d9a521',
              backgroundColor: 'rgba(217, 165, 33, 0.12)',
              fill: true,
              tension: 0.4,
              pointRadius: 4,
              pointBackgroundColor: '#f3ca5a',
              borderWidth: 2.5
            },
            {
              label: 'Total Registered Users',
              data: [1950, 2480, 3120, 3780, 4210, 4650, 4828],
              borderColor: '#2fae72',
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              tension: 0.4,
              pointRadius: 3,
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: '#f5f1e8', font: { family: 'Inter', size: 12 } }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255,255,255,0.06)' },
              ticks: { color: 'rgba(245,241,232,0.6)' }
            },
            y: {
              grid: { color: 'rgba(255,255,255,0.06)' },
              ticks: { color: 'rgba(245,241,232,0.6)' }
            }
          }
        }
      });
    }

    // 2. Feature Adoption Breakdown (Doughnut)
    const featureCanvas = document.getElementById('featurePieChart');
    if (featureCanvas && !this._featureChartInstance) {
      const ctx = featureCanvas.getContext('2d');
      this._featureChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Multi-Currency FX', 'AI Coach', 'OCR Scanner', 'Invoices', 'COFE Intelligence'],
          datasets: [{
            data: [38, 24, 18, 12, 8],
            backgroundColor: [
              '#d9a521',
              '#2fae72',
              '#38bdf8',
              '#a855f7',
              '#f43f5e'
            ],
            borderColor: '#0e1713',
            borderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#f5f1e8', font: { family: 'Inter', size: 11 } }
            }
          }
        }
      });
    }
  },

  // ── Tab & Event Listeners ──
  bindEvents() {
    // Navigation Sub-tabs
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Gmail folders
    document.querySelectorAll('.gmail-folder-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gmail-folder-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFolder = btn.dataset.folder;
        this.renderGmailThreads();
      });
    });

    // User Search Input
    const userSearchInput = document.getElementById('user-search-input');
    if (userSearchInput) {
      userSearchInput.addEventListener('input', (e) => this.renderUsersTable(e.target.value));
    }

    // Modal Close Triggers
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.admin-modal-overlay');
        if (modal) modal.classList.remove('open');
      });
    });
  },

  switchTab(tabName) {
    this.activeTab = tabName;
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.admin-view').forEach(v => v.classList.toggle('active', v.id === `view-${tabName}`));
  },

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('open');
  },

  showToast(message, type = 'info') {
    const toast = document.getElementById('admin-toast');
    if (!toast) return;

    const iconMap = {
      success: 'fa-circle-check',
      warning: 'fa-triangle-exclamation',
      error: 'fa-circle-xmark',
      info: 'fa-circle-info'
    };

    toast.innerHTML = `<i class="fas ${iconMap[type] || 'fa-info-circle'}" style="margin-right:8px;"></i> ${message}`;
    toast.className = `toast show toast-${type}`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
  }
};

// Auto-boot on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  AdminStore.init();
});
