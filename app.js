/**
 * CoachTrack ET - Soccer Session Timesheet & Billing Engine
 * Telegram Mini App (TMA) & PWA
 */

(function () {
  'use strict';

  // --- 1. Telegram WebApp Initialization ---
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    // Enable closing confirmation if practice is running
    tg.enableClosingConfirmation?.();
  }

  function triggerHaptic(style = 'medium') {
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(style);
    }
  }

  function triggerNotificationHaptic(type = 'success') {
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred(type);
    }
  }

  // --- 2. Initial Screenshot Dataset (June 2026) ---
  const INITIAL_SESSIONS = [
    { id: '1', number: 1, date: '2026-06-19', day: 'Friday', startTime: '15:00', endTime: '17:00', duration: 2.00, status: 'YES', kids: 4, notes: '' },
    { id: '2', number: 2, date: '2026-06-20', day: 'Saturday', startTime: '', endTime: '', duration: 0.00, status: 'NO PRACTICE', kids: 0, notes: 'Rain' },
    { id: '4', number: 4, date: '2026-06-22', day: 'Monday', startTime: '14:00', endTime: '16:30', duration: 2.50, status: 'YES', kids: 4, notes: '' },
    { id: '5', number: 5, date: '2026-06-23', day: 'Tuesday', startTime: '15:00', endTime: '17:00', duration: 2.00, status: 'YES', kids: 4, notes: '' },
    { id: '6', number: 6, date: '2026-06-24', day: 'Wednesday', startTime: '14:00', endTime: '16:30', duration: 2.50, status: 'YES', kids: 4, notes: '' },
    { id: '7', number: 7, date: '2026-06-25', day: 'Thursday', startTime: '14:20', endTime: '17:50', duration: 3.50, status: 'YES', kids: 4, notes: '' },
    { id: '8', number: 8, date: '2026-06-26', day: 'Friday', startTime: '15:20', endTime: '18:00', duration: 2.67, status: 'YES', kids: 4, notes: '' }
  ];

  const DEFAULT_SETTINGS = {
    coachName: 'Coach Dawit',
    ratePerKid: 1000,
    defaultKids: 4,
    telebirr: '0911 234 567',
    cbe: '1000 1234 5678 9',
    sheetsWebhook: ''
  };

  // --- 3. App State & Storage ---
  let sessions = [];
  let settings = { ...DEFAULT_SETTINGS };
  let currentKidsCount = 4;
  let activeFilter = 'all';

  // Stopwatch state
  let timerInterval = null;
  let timerStartTime = null;
  let timerAccumulatedMs = 0;
  let isTimerRunning = false;
  let isTimerPaused = false;

  function loadState() {
    try {
      const storedSessions = localStorage.getItem('coachtrack_sessions');
      sessions = storedSessions ? JSON.parse(storedSessions) : [...INITIAL_SESSIONS];

      const storedSettings = localStorage.getItem('coachtrack_settings');
      if (storedSettings) {
        settings = { ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) };
      } else if (tg?.initDataUnsafe?.user?.first_name) {
        settings.coachName = `Coach ${tg.initDataUnsafe.user.first_name}`;
      }

      currentKidsCount = settings.defaultKids || 4;

      // Restore active timer if page was reloaded or restored from background
      const storedTimer = localStorage.getItem('coachtrack_active_timer');
      if (storedTimer) {
        const tData = JSON.parse(storedTimer);
        if (tData.running) {
          timerStartTime = tData.startTime;
          timerAccumulatedMs = tData.accumulatedMs || 0;
          isTimerRunning = true;
          isTimerPaused = tData.paused || false;
          currentKidsCount = tData.kids || settings.defaultKids;
          resumeStopwatchUI();
        }
      }
    } catch (err) {
      console.warn('Failed to load state from localStorage:', err);
      sessions = [...INITIAL_SESSIONS];
      settings = { ...DEFAULT_SETTINGS };
    }
  }

  function saveSessions() {
    localStorage.setItem('coachtrack_sessions', JSON.stringify(sessions));
    renderTimesheet();
    updateSummariesAndBilling();
  }

  function saveSettings() {
    localStorage.setItem('coachtrack_settings', JSON.stringify(settings));
    updateSettingsUI();
    updateSummariesAndBilling();
  }

  function saveActiveTimer() {
    if (isTimerRunning) {
      localStorage.setItem('coachtrack_active_timer', JSON.stringify({
        running: true,
        paused: isTimerPaused,
        startTime: timerStartTime,
        accumulatedMs: timerAccumulatedMs,
        kids: currentKidsCount
      }));
    } else {
      localStorage.removeItem('coachtrack_active_timer');
    }
  }

  // --- 4. Utilities ---
  function getDayName(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    return dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  }

  function formatDateDisplay(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateString;
  }

  function calculateDecimalDuration(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;

    if (endMinutes < startMinutes) {
      // Crossed midnight
      endMinutes += 24 * 60;
    }

    const diffMinutes = endMinutes - startMinutes;
    return Math.round((diffMinutes / 60) * 100) / 100;
  }

  function formatTimeFromDate(d) {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function getTodayString() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatNumberETB(num) {
    return Number(num || 0).toLocaleString('en-US');
  }

  function showToast(message, icon = '⚽') {
    const toast = document.getElementById('toast');
    const iconEl = document.getElementById('toast-icon');
    const msgEl = document.getElementById('toast-message');

    if (toast && msgEl) {
      iconEl.textContent = icon;
      msgEl.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2600);
    }
  }

  // --- 5. Stopwatch / Live Practice Timer ---
  function startPracticeTimer() {
    triggerHaptic('heavy');
    isTimerRunning = true;
    isTimerPaused = false;
    timerStartTime = Date.now();
    timerAccumulatedMs = 0;

    document.getElementById('btn-start-timer').style.display = 'none';
    document.getElementById('active-timer-controls').style.display = 'flex';
    document.getElementById('pause-btn-label').textContent = 'Pause';
    document.getElementById('timer-status-text').textContent = 'Practice in session...';
    document.getElementById('timer-ring').classList.add('running');
    document.getElementById('decimal-hours-badge').style.display = 'inline-block';

    timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
    saveActiveTimer();
    showToast('Practice started! Timer is ticking.', '⏱️');
  }

  function pausePracticeTimer() {
    triggerHaptic('light');
    if (!isTimerPaused) {
      // Pause
      isTimerPaused = true;
      timerAccumulatedMs += Date.now() - timerStartTime;
      clearInterval(timerInterval);
      document.getElementById('pause-btn-label').textContent = 'Resume';
      document.getElementById('timer-status-text').textContent = 'Practice paused (water break)';
      document.getElementById('timer-ring').classList.remove('running');
    } else {
      // Resume
      isTimerPaused = false;
      timerStartTime = Date.now();
      timerInterval = setInterval(updateTimerDisplay, 1000);
      document.getElementById('pause-btn-label').textContent = 'Pause';
      document.getElementById('timer-status-text').textContent = 'Practice in session...';
      document.getElementById('timer-ring').classList.add('running');
    }
    saveActiveTimer();
  }

  function finishPracticeTimer() {
    triggerHaptic('heavy');
    triggerNotificationHaptic('success');

    let totalMs = timerAccumulatedMs;
    if (!isTimerPaused) {
      totalMs += Date.now() - timerStartTime;
    }

    clearInterval(timerInterval);
    const totalMinutes = Math.max(1, Math.round(totalMs / (1000 * 60)));
    const decimalHours = Math.round((totalMinutes / 60) * 100) / 100;

    // Determine start & end time
    const startDate = new Date(Date.now() - totalMs);
    const endDate = new Date();

    const startTimeStr = formatTimeFromDate(startDate);
    const endTimeStr = formatTimeFromDate(endDate);

    // Reset Stopwatch UI
    resetStopwatchUI();

    // Open Modal pre-filled
    openSessionModal({
      date: getTodayString(),
      startTime: startTimeStr,
      endTime: endTimeStr,
      duration: decimalHours,
      kids: currentKidsCount,
      status: 'YES',
      notes: ''
    });
  }

  function resumeStopwatchUI() {
    document.getElementById('btn-start-timer').style.display = 'none';
    document.getElementById('active-timer-controls').style.display = 'flex';
    document.getElementById('decimal-hours-badge').style.display = 'inline-block';

    if (isTimerPaused) {
      document.getElementById('pause-btn-label').textContent = 'Resume';
      document.getElementById('timer-status-text').textContent = 'Practice paused';
      document.getElementById('timer-ring').classList.remove('running');
    } else {
      document.getElementById('pause-btn-label').textContent = 'Pause';
      document.getElementById('timer-status-text').textContent = 'Practice in session...';
      document.getElementById('timer-ring').classList.add('running');
      timerInterval = setInterval(updateTimerDisplay, 1000);
    }
    updateTimerDisplay();
  }

  function resetStopwatchUI() {
    isTimerRunning = false;
    isTimerPaused = false;
    timerStartTime = null;
    timerAccumulatedMs = 0;
    clearInterval(timerInterval);
    saveActiveTimer();

    document.getElementById('btn-start-timer').style.display = 'inline-flex';
    document.getElementById('active-timer-controls').style.display = 'none';
    document.getElementById('timer-display').textContent = '00:00:00';
    document.getElementById('timer-status-text').textContent = 'Ready to kick off';
    document.getElementById('decimal-hours-badge').style.display = 'none';
    document.getElementById('timer-ring').classList.remove('running');
  }

  function updateTimerDisplay() {
    let totalMs = timerAccumulatedMs;
    if (isTimerRunning && !isTimerPaused && timerStartTime) {
      totalMs += Date.now() - timerStartTime;
    }

    const totalSecs = Math.floor(totalMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const formatted = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    document.getElementById('timer-display').textContent = formatted;

    const decimalHrs = (totalSecs / 3600).toFixed(2);
    document.getElementById('decimal-hours-badge').textContent = `${decimalHrs} hrs`;
  }

  // --- 6. Timesheet List Rendering ---
  function renderTimesheet() {
    const container = document.getElementById('timesheet-list');
    if (!container) return;

    // Update Counts on Filter Chips
    const countAll = sessions.length;
    const countCompleted = sessions.filter(s => s.status === 'YES').length;
    const countCancelled = sessions.filter(s => s.status !== 'YES').length;

    document.getElementById('count-filter-all').textContent = countAll;
    document.getElementById('count-filter-completed').textContent = countCompleted;
    document.getElementById('count-filter-cancelled').textContent = countCancelled;

    // Filter sessions
    let filtered = sessions;
    if (activeFilter === 'completed') {
      filtered = sessions.filter(s => s.status === 'YES');
    } else if (activeFilter === 'cancelled') {
      filtered = sessions.filter(s => s.status !== 'YES');
    }

    // Sort descending by date/number
    const sorted = [...filtered].sort((a, b) => b.number - a.number);

    if (sorted.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; color: var(--text-muted); background: var(--bg-card); border: 1px dashed var(--border-subtle); border-radius: var(--radius-lg);">
          <div style="font-size: 3rem; margin-bottom: 12px;">⚽</div>
          <h3 style="color: #fff; font-size: 1.15rem; font-weight: 700; margin-bottom: 6px;">No Practice Sessions Yet</h3>
          <p style="font-size: 0.82rem; max-width: 260px; margin: 0 auto 18px; line-height: 1.4;">Hit "Start Practice" at kickoff to log Session #1, or add a past entry.</p>
          <button type="button" class="btn btn-primary btn-small" id="btn-empty-start" style="margin: 0 auto;">
            Go to Stopwatch ⏱️
          </button>
        </div>
      `;
      container.querySelector('#btn-empty-start')?.addEventListener('click', () => {
        document.querySelector('.nav-item[data-tab="tab-timer"]')?.click();
      });
      return;
    }

    container.innerHTML = sorted.map(s => {
      const isYes = s.status === 'YES';
      const statusBadge = isYes
        ? `<span class="badge-status yes">YES</span>`
        : `<span class="badge-status no">NO PRACTICE</span>`;

      const timeRangeText = isYes
        ? `${s.startTime || '--'} – ${s.endTime || '--'}`
        : `Cancelled (${s.notes || 'No Practice'})`;

      const sessionRateETB = isYes
        ? (s.kids || settings.defaultKids) * settings.ratePerKid
        : 0;

      return `
        <div class="session-row-card ${isYes ? 'completed' : 'cancelled'}" data-id="${s.id}">
          <div class="card-top">
            <div class="session-date-info">
              <span class="session-idx">#${s.number}</span>
              <span>${formatDateDisplay(s.date)}</span>
              <span class="session-day-badge">${s.day || getDayName(s.date)}</span>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div class="card-middle">
            <div class="time-range">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>${timeRangeText}</span>
            </div>
            ${isYes ? `<div class="duration-pill">${Number(s.duration || 0).toFixed(2)} hrs</div>` : ''}
          </div>

          <div class="card-bottom">
            <div class="attendance-note">
              ${isYes ? `👥 ${s.kids || 4} kids${s.notes ? ` • <i>${escapeHtml(s.notes)}</i>` : ''}` : `🌧️ Reason: ${escapeHtml(s.notes || 'None')}`}
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              ${isYes ? `<div class="card-rate-due">${formatNumberETB(sessionRateETB)} ETB</div>` : ''}
              <div class="row-actions">
                <button class="btn-icon-action btn-edit-entry" data-id="${s.id}" title="Edit">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners
    container.querySelectorAll('.btn-edit-entry').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const entry = sessions.find(s => String(s.id) === String(id));
        if (entry) openSessionModal(entry);
      });
    });

    container.querySelectorAll('.session-row-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        const entry = sessions.find(s => String(s.id) === String(id));
        if (entry) openSessionModal(entry);
      });
    });
  }

  // --- 7. Summary & Earnings Calculations ---
  // Single source of truth for billing, shared by the earnings view, the invoice
  // card and the statement sent to parents. Each completed session is billed for
  // the kids who actually attended it.
  function computeBilling() {
    const completed = sessions.filter(s => s.status === 'YES');
    const kidsFor = s => Number(s.kids || settings.defaultKids || 4);
    const totalKidSessions = completed.reduce((acc, s) => acc + kidsFor(s), 0);
    const avgKids = completed.length > 0
      ? Math.round((totalKidSessions / completed.length) * 10) / 10
      : (settings.defaultKids || 4);
    const totalEarningsETB = totalKidSessions * settings.ratePerKid;

    const months = sessions
      .map(s => s.date)
      .filter(Boolean)
      .map(d => new Date(`${d}T00:00:00`))
      .filter(d => !isNaN(d))
      .sort((a, b) => a - b);
    const fmt = d => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    let periodLabel = fmt(new Date());
    if (months.length) {
      const first = fmt(months[0]);
      const last = fmt(months[months.length - 1]);
      periodLabel = first === last ? first : `${first} – ${last}`;
    }

    return { completed, totalKidSessions, avgKids, totalEarningsETB, periodLabel };
  }

  function updateSummariesAndBilling() {
    const completedSessions = sessions.filter(s => s.status === 'YES');
    const cancelledSessions = sessions.filter(s => s.status !== 'YES');

    const totalSessionsCompleted = completedSessions.length;
    const noPracticeDays = cancelledSessions.length;

    // Total Hours
    const totalHours = completedSessions.reduce((acc, curr) => acc + Number(curr.duration || 0), 0);
    const formattedHours = Math.round(totalHours * 100) / 100;

    // Total Birr: sum over completed sessions of (kids attended × rate per kid).
    // Sample data: 6 sessions × 4 kids × 1000 ETB = 24,000 ETB.
    const { totalKidSessions, avgKids, totalEarningsETB } = computeBilling();

    // Update Mini Strip on Tab 1
    const stripBirr = document.getElementById('strip-total-birr');
    if (stripBirr) stripBirr.textContent = `${formatNumberETB(totalEarningsETB)} ETB`;
    const stripSessions = document.getElementById('strip-completed-sessions');
    if (stripSessions) stripSessions.textContent = `${totalSessionsCompleted} sessions`;
    const stripHours = document.getElementById('strip-total-hours');
    if (stripHours) stripHours.textContent = `${formattedHours} hrs`;

    // Next Session Counter Badge on Tab 1
    const maxNum = sessions.reduce((max, s) => Math.max(max, Number(s.number || 0)), 0);
    const nextBadge = document.getElementById('session-counter-badge');
    if (nextBadge) nextBadge.textContent = `Next Session: #${maxNum + 1}`;

    // Update Metrics on Tab 3
    const metricRate = document.getElementById('metric-total-rate');
    if (metricRate) metricRate.innerHTML = `${formatNumberETB(totalEarningsETB)} <span class="unit">ETB</span>`;

    const metricFormula = document.getElementById('metric-rate-formula');
    if (metricFormula) {
      metricFormula.textContent = `${totalKidSessions} kid-sessions (${totalSessionsCompleted} sessions) × ${formatNumberETB(settings.ratePerKid)} ETB`;
    }

    const metricCompleted = document.getElementById('metric-completed-count');
    if (metricCompleted) metricCompleted.textContent = totalSessionsCompleted;

    const metricNoPractice = document.getElementById('metric-nopractice-count');
    if (metricNoPractice) metricNoPractice.textContent = noPracticeDays;

    const metricHours = document.getElementById('metric-total-hours');
    if (metricHours) metricHours.textContent = formattedHours.toFixed(2);

    const metricKids = document.getElementById('metric-kids-session');
    if (metricKids) metricKids.textContent = avgKids;

    // Update Invoice Preview Card
    const invCoach = document.getElementById('inv-coach-name');
    if (invCoach) invCoach.textContent = settings.coachName;

    const invRateBreakdown = document.getElementById('inv-rate-breakdown');
    if (invRateBreakdown) invRateBreakdown.textContent = `${formatNumberETB(settings.ratePerKid)} ETB / Kid / Session`;

    const invCompleted = document.getElementById('inv-completed-val');
    if (invCompleted) invCompleted.textContent = `${totalSessionsCompleted} Sessions`;

    const invAttendance = document.getElementById('inv-attendance-val');
    if (invAttendance) invAttendance.textContent = `${avgKids} Kids / Session`;

    const invHours = document.getElementById('inv-hours-val');
    if (invHours) invHours.textContent = `${formattedHours.toFixed(2)} hrs`;

    const invTotalDue = document.getElementById('inv-total-due');
    if (invTotalDue) invTotalDue.textContent = `${formatNumberETB(totalEarningsETB)} ETB`;

    const invTelebirr = document.getElementById('inv-telebirr-num');
    if (invTelebirr) invTelebirr.textContent = settings.telebirr;

    const invCbe = document.getElementById('inv-cbe-num');
    if (invCbe) invCbe.textContent = settings.cbe;
  }

  // --- 8. Modals Management ---
  function openSessionModal(entry = null) {
    triggerHaptic('light');
    const modal = document.getElementById('modal-session');
    const form = document.getElementById('form-session');
    const titleEl = document.getElementById('modal-session-title');
    const deleteBtn = document.getElementById('btn-delete-entry');

    form.reset();

    if (entry && entry.id) {
      titleEl.textContent = `Edit Session #${entry.number}`;
      document.getElementById('entry-id').value = entry.id;
      document.getElementById('entry-date').value = entry.date;
      document.getElementById('entry-session-status').value = entry.status || 'YES';
      document.getElementById('entry-start-time').value = entry.startTime || '15:00';
      document.getElementById('entry-end-time').value = entry.endTime || '17:00';
      document.getElementById('entry-kids-count').value = entry.kids || settings.defaultKids || 4;
      document.getElementById('entry-notes').value = entry.notes || '';
      deleteBtn.style.display = 'inline-block';
    } else {
      titleEl.textContent = 'Log Practice Session';
      document.getElementById('entry-id').value = '';
      document.getElementById('entry-date').value = entry?.date || getTodayString();
      document.getElementById('entry-session-status').value = entry?.status || 'YES';
      document.getElementById('entry-start-time').value = entry?.startTime || '15:00';
      document.getElementById('entry-end-time').value = entry?.endTime || '17:00';
      document.getElementById('entry-kids-count').value = entry?.kids || currentKidsCount || 4;
      document.getElementById('entry-notes').value = entry?.notes || '';
      deleteBtn.style.display = 'none';
    }

    toggleTimeFields(document.getElementById('entry-session-status').value);
    updateModalDurationPreview();
    modal.classList.add('open');
  }

  function closeSessionModal() {
    document.getElementById('modal-session').classList.remove('open');
  }

  function toggleTimeFields(status) {
    const timeBox = document.getElementById('practice-time-fields');
    if (status === 'NO PRACTICE') {
      timeBox.style.display = 'none';
    } else {
      timeBox.style.display = 'block';
    }
  }

  function updateModalDurationPreview() {
    const startTime = document.getElementById('entry-start-time').value;
    const endTime = document.getElementById('entry-end-time').value;
    const dur = calculateDecimalDuration(startTime, endTime);
    document.getElementById('modal-duration-preview').textContent = `${dur.toFixed(2)} hrs`;
  }

  function openRainModal() {
    triggerHaptic('medium');
    const modal = document.getElementById('modal-rain');
    document.getElementById('rain-date').value = getTodayString();
    document.getElementById('rain-custom-note').value = '';
    modal.classList.add('open');
  }

  function closeRainModal() {
    document.getElementById('modal-rain').classList.remove('open');
  }

  // --- 9. Save Session Entry ---
  function handleSessionFormSubmit(e) {
    e.preventDefault();
    triggerHaptic('medium');
    triggerNotificationHaptic('success');

    const id = document.getElementById('entry-id').value;
    const date = document.getElementById('entry-date').value;
    const status = document.getElementById('entry-session-status').value;
    const isYes = status === 'YES';

    const startTime = isYes ? document.getElementById('entry-start-time').value : '';
    const endTime = isYes ? document.getElementById('entry-end-time').value : '';
    const duration = isYes ? calculateDecimalDuration(startTime, endTime) : 0;
    const kids = isYes ? Number(document.getElementById('entry-kids-count').value || settings.defaultKids || 4) : 0;
    const notes = document.getElementById('entry-notes').value.trim();
    const day = getDayName(date);

    if (id) {
      // Update existing
      const index = sessions.findIndex(s => String(s.id) === String(id));
      if (index !== -1) {
        sessions[index] = {
          ...sessions[index],
          date,
          day,
          startTime,
          endTime,
          duration,
          status,
          kids,
          notes
        };
        showToast(`Session #${sessions[index].number} updated!`);
      }
    } else {
      // Create new
      const maxNum = sessions.reduce((max, s) => Math.max(max, Number(s.number || 0)), 0);
      const newNumber = maxNum + 1;
      const newSession = {
        id: String(Date.now()),
        number: newNumber,
        date,
        day,
        startTime,
        endTime,
        duration,
        status,
        kids,
        notes
      };
      sessions.push(newSession);
      showToast(`Session #${newNumber} logged successfully!`);
      sendToGoogleSheetsWebhook(newSession);
    }

    saveSessions();
    closeSessionModal();
  }

  function handleRainFormSubmit(e) {
    e.preventDefault();
    triggerHaptic('medium');

    const date = document.getElementById('rain-date').value;
    const day = getDayName(date);
    const reasonInput = document.querySelector('input[name="rain-reason"]:checked');
    const customNote = document.getElementById('rain-custom-note').value.trim();
    const notes = customNote ? `${reasonInput?.value || 'Rain'} - ${customNote}` : (reasonInput?.value || 'Rain');

    const maxNum = sessions.reduce((max, s) => Math.max(max, Number(s.number || 0)), 0);
    const newNumber = maxNum + 1;

    const noPracticeEntry = {
      id: String(Date.now()),
      number: newNumber,
      date,
      day,
      startTime: '',
      endTime: '',
      duration: 0.00,
      status: 'NO PRACTICE',
      kids: 0,
      notes: notes
    };

    sessions.push(noPracticeEntry);
    saveSessions();
    closeRainModal();
    showToast(`Logged No-Practice (#${newNumber}): ${notes}`, '🌧️');
    sendToGoogleSheetsWebhook(noPracticeEntry);
  }

  function deleteSessionEntry() {
    const id = document.getElementById('entry-id').value;
    if (!id) return;

    if (confirm('Are you sure you want to delete this session from your timesheet?')) {
      triggerHaptic('heavy');
      sessions = sessions.filter(s => String(s.id) !== String(id));
      saveSessions();
      closeSessionModal();
      showToast('Session deleted.', '🗑️');
    }
  }

  // --- 10. Google Sheets Webhook Sync ---
  async function sendToGoogleSheetsWebhook(entry) {
    if (!settings.sheetsWebhook) return;

    const syncStatusEl = document.getElementById('sync-status');
    if (syncStatusEl) {
      syncStatusEl.innerHTML = `<span class="dot" style="background: var(--amber-warn);"></span> Syncing...`;
    }

    try {
      const payload = {
        number: entry.number,
        date: formatDateDisplay(entry.date),
        day: entry.day,
        startTime: entry.startTime,
        endTime: entry.endTime,
        duration: entry.duration,
        status: entry.status,
        notes: entry.notes,
        kids: entry.kids,
        ratePerKid: settings.ratePerKid,
        totalRate: entry.status === 'YES' ? (entry.kids * settings.ratePerKid) : 0
      };

      await fetch(settings.sheetsWebhook, {
        method: 'POST',
        mode: 'no-cors', // standard for Google Apps Script Web App endpoints
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (syncStatusEl) {
        syncStatusEl.innerHTML = `<span class="dot"></span> Synced`;
      }
    } catch (err) {
      console.warn('Google Sheets sync failed:', err);
      if (syncStatusEl) {
        syncStatusEl.innerHTML = `<span class="dot" style="background: var(--rose-danger);"></span> Offline`;
      }
    }
  }

  // --- 11. Sharing & Exporting ---
  function generateSummaryText() {
    const { completed: completedSessions, totalKidSessions, avgKids, totalEarningsETB: totalEarnings, periodLabel } = computeBilling();
    const noPracticeDays = sessions.filter(s => s.status !== 'YES').length;
    const totalHours = completedSessions.reduce((acc, curr) => acc + Number(curr.duration || 0), 0).toFixed(2);

    return `⚽ *${settings.coachName.toUpperCase()} - SOCCER TIMESHEET STATEMENT*
━━━━━━━━━━━━━━━━━━━━
📅 *Period:* ${periodLabel} Timesheet
✅ *Sessions Completed:* ${completedSessions.length}
🌧️ *Cancelled / Rain Days:* ${noPracticeDays}
⏱️ *Total Pitch Hours:* ${totalHours} hrs
👥 *Attendance:* ${totalKidSessions} kid-sessions (avg ${avgKids} / session)
💵 *Session Rate:* ${formatNumberETB(settings.ratePerKid)} ETB / kid / session

💰 *TOTAL AMOUNT DUE: ${formatNumberETB(totalEarnings)} ETB*
━━━━━━━━━━━━━━━━━━━━
🇪🇹 *Payment Methods (Ethiopia):*
• *Telebirr:* ${settings.telebirr}
• *CBE Account:* ${settings.cbe} (${settings.coachName})

_Logged via CoachTrack ET_`;
  }

  function shareToTelegram() {
    triggerHaptic('medium');
    const text = generateSummaryText();
    const encoded = encodeURIComponent(text);

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?text=${encoded}`);
    } else {
      window.open(`https://t.me/share/url?text=${encoded}`, '_blank');
    }
  }

  function copySummaryText() {
    triggerHaptic('light');
    const text = generateSummaryText();
    navigator.clipboard.writeText(text).then(() => {
      showToast('Summary copied to clipboard!', '📋');
    }).catch(() => {
      showToast('Copied summary!');
    });
  }

  function exportCSV() {
    triggerHaptic('medium');
    // Header identical to screenshot: #, Date, Day, Start Time, End Time, Duration (hrs), Session?, Notes
    let csvContent = '#,Date,Day,Start Time,End Time,Duration (hrs),Session?,Notes\n';

    const sorted = [...sessions].sort((a, b) => a.number - b.number);
    sorted.forEach(s => {
      const row = [
        s.number,
        formatDateDisplay(s.date),
        `"${s.day || getDayName(s.date)}"`,
        `"${s.startTime || ''}"`,
        `"${s.endTime || ''}"`,
        s.duration !== undefined ? Number(s.duration).toFixed(2) : '0.00',
        `"${s.status}"`,
        `"${(s.notes || '').replace(/"/g, '""')}"`
      ];
      csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Coach_Timesheet_${getTodayString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('CSV Timesheet downloaded!', '📊');
  }

  // --- 12. Settings & UI Bindings ---
  function updateSettingsUI() {
    document.getElementById('coach-display-name').textContent = `⚽ ${settings.coachName}`;
    document.getElementById('setting-coach-name').value = settings.coachName;
    document.getElementById('setting-rate-per-kid').value = settings.ratePerKid;
    document.getElementById('setting-default-kids').value = settings.defaultKids;
    document.getElementById('setting-telebirr').value = settings.telebirr;
    document.getElementById('setting-cbe').value = settings.cbe;
    document.getElementById('setting-sheets-webhook').value = settings.sheetsWebhook || '';
    document.getElementById('rate-preview-text').textContent = `@ ${formatNumberETB(settings.ratePerKid)} ETB / kid`;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- 13. Guided Onboarding Wizard ---
  let currentWizardStep = 1;

  function showOnboardingWizard(startStep = 1) {
    currentWizardStep = startStep;
    const modal = document.getElementById('onboarding-modal');
    if (!modal) return;

    // Prefill form values from current settings
    const nameInput = document.getElementById('wizard-coach-name');
    if (nameInput) nameInput.value = settings.coachName || 'Coach Dawit';

    const rateInput = document.getElementById('wizard-rate');
    if (rateInput) rateInput.value = settings.ratePerKid || 1000;

    const kidsInput = document.getElementById('wizard-kids');
    if (kidsInput) kidsInput.value = settings.defaultKids || 4;

    const telebirrInput = document.getElementById('wizard-telebirr');
    if (telebirrInput) telebirrInput.value = settings.telebirr || '';

    const cbeInput = document.getElementById('wizard-cbe');
    if (cbeInput) cbeInput.value = settings.cbe || '';

    updateWizardUI();
    modal.classList.add('open');
  }

  function closeOnboardingWizard() {
    const modal = document.getElementById('onboarding-modal');
    if (modal) modal.classList.remove('open');
  }

  function updateWizardUI() {
    // Update step visibility
    document.querySelectorAll('.wizard-step').forEach(stepEl => {
      const stepNum = Number(stepEl.getAttribute('data-step'));
      stepEl.classList.toggle('active', stepNum === currentWizardStep);
    });

    // Update progress dots
    document.querySelectorAll('.wizard-dots .dot').forEach(dot => {
      const dotNum = Number(dot.getAttribute('data-step'));
      dot.classList.toggle('active', dotNum === currentWizardStep);
    });

    // Update buttons
    const prevBtn = document.getElementById('btn-wizard-prev');
    const nextBtn = document.getElementById('btn-wizard-next');

    if (prevBtn) {
      prevBtn.style.display = currentWizardStep > 1 ? 'inline-flex' : 'none';
    }

    if (nextBtn) {
      if (currentWizardStep === 4) {
        nextBtn.innerHTML = `<span>⚽ Take Me to the Pitch!</span>`;
        // Update summary preview in step 4
        const rate = Number(document.getElementById('wizard-rate')?.value) || settings.ratePerKid || 1000;
        const kids = Number(document.getElementById('wizard-kids')?.value) || settings.defaultKids || 4;
        const prevRateEl = document.getElementById('wizard-prev-rate');
        if (prevRateEl) prevRateEl.textContent = `${formatNumberETB(rate)} ETB`;
        const prevTotalEl = document.getElementById('wizard-prev-total');
        if (prevTotalEl) prevTotalEl.textContent = `${formatNumberETB(6 * kids * rate)} ETB`;
      } else {
        nextBtn.innerHTML = `<span>Continue</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
      }
    }
  }

  function saveCurrentWizardStep(step) {
    if (step === 1) {
      const name = document.getElementById('wizard-coach-name')?.value.trim();
      const rate = Number(document.getElementById('wizard-rate')?.value);
      const kids = Number(document.getElementById('wizard-kids')?.value);

      if (name) settings.coachName = name;
      if (rate && !isNaN(rate)) settings.ratePerKid = rate;
      if (kids && !isNaN(kids)) {
        settings.defaultKids = kids;
        currentKidsCount = kids;
        const kidDisplay = document.getElementById('kid-count-display');
        if (kidDisplay) kidDisplay.textContent = kids;
      }
      saveSettings();
    } else if (step === 3) {
      const telebirr = document.getElementById('wizard-telebirr')?.value.trim();
      const cbe = document.getElementById('wizard-cbe')?.value.trim();
      if (telebirr) settings.telebirr = telebirr;
      if (cbe) settings.cbe = cbe;
      saveSettings();
    }
  }

  function nextWizardStep() {
    triggerHaptic('light');
    saveCurrentWizardStep(currentWizardStep);

    if (currentWizardStep < 4) {
      currentWizardStep++;
      updateWizardUI();
    } else {
      finishOnboarding();
    }
  }

  function prevWizardStep() {
    triggerHaptic('light');
    if (currentWizardStep > 1) {
      currentWizardStep--;
      updateWizardUI();
    }
  }

  function finishOnboarding() {
    triggerHaptic('heavy');
    triggerNotificationHaptic('success');
    localStorage.setItem('coachtrack_onboarding_completed', 'true');

    // Check chosen start mode (fresh vs demo)
    const mode = document.querySelector('input[name="wizard-start-mode"]:checked')?.value || 'fresh';
    if (mode === 'fresh') {
      sessions = [];
      saveSessions();
      showToast('Fresh timesheet ready! Session #1 kicks off today.', '✨');
    } else {
      sessions = JSON.parse(JSON.stringify(INITIAL_SESSIONS));
      saveSessions();
      showToast('June 2026 sample timesheet loaded!', '📋');
    }

    closeOnboardingWizard();
  }

  // --- 14. DOM Event Listeners ---
  document.addEventListener('DOMContentLoaded', () => {
    loadState();
    updateSettingsUI();
    renderTimesheet();
    updateSummariesAndBilling();

    // Check if first-time user: show onboarding wizard
    if (!localStorage.getItem('coachtrack_onboarding_completed')) {
      showOnboardingWizard(1);
    }

    // Display formatted today's date in header
    const now = new Date();
    const dateOptions = { weekday: 'short', day: 'numeric', month: 'short' };
    document.getElementById('current-live-date').textContent = `Today, ${now.toLocaleDateString('en-US', dateOptions)}`;

    // Tab Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        triggerHaptic('light');
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        document.getElementById(targetId)?.classList.add('active');
      });
    });

    // Kids Count Controls
    const kidDisplay = document.getElementById('kid-count-display');
    kidDisplay.textContent = currentKidsCount;

    document.getElementById('btn-kid-minus').addEventListener('click', () => {
      triggerHaptic('light');
      if (currentKidsCount > 1) {
        currentKidsCount--;
        kidDisplay.textContent = currentKidsCount;
        updateActiveChip();
        saveActiveTimer();
      }
    });

    document.getElementById('btn-kid-plus').addEventListener('click', () => {
      triggerHaptic('light');
      currentKidsCount++;
      kidDisplay.textContent = currentKidsCount;
      updateActiveChip();
      saveActiveTimer();
    });

    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        triggerHaptic('light');
        const k = Number(chip.getAttribute('data-kids'));
        currentKidsCount = k;
        kidDisplay.textContent = currentKidsCount;
        updateActiveChip();
        saveActiveTimer();
      });
    });

    function updateActiveChip() {
      document.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', Number(c.getAttribute('data-kids')) === currentKidsCount);
      });
    }

    // Stopwatch Buttons
    document.getElementById('btn-start-timer').addEventListener('click', startPracticeTimer);
    document.getElementById('btn-pause-timer').addEventListener('click', pausePracticeTimer);
    document.getElementById('btn-stop-timer').addEventListener('click', finishPracticeTimer);

    // Quick Action Buttons
    document.getElementById('btn-quick-rain').addEventListener('click', openRainModal);
    document.getElementById('btn-manual-entry').addEventListener('click', () => openSessionModal());

    // Filter Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        triggerHaptic('light');
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeFilter = chip.getAttribute('data-filter');
        renderTimesheet();
      });
    });

    // Modals
    document.getElementById('btn-close-session-modal').addEventListener('click', closeSessionModal);
    document.getElementById('btn-close-rain-modal').addEventListener('click', closeRainModal);
    document.getElementById('btn-cancel-rain').addEventListener('click', closeRainModal);
    document.getElementById('form-session').addEventListener('submit', handleSessionFormSubmit);
    document.getElementById('form-rain').addEventListener('submit', handleRainFormSubmit);
    document.getElementById('btn-delete-entry').addEventListener('click', deleteSessionEntry);

    // Duration preview updates in modal
    document.getElementById('entry-start-time').addEventListener('input', updateModalDurationPreview);
    document.getElementById('entry-end-time').addEventListener('input', updateModalDurationPreview);
    document.getElementById('entry-session-status').addEventListener('change', (e) => {
      toggleTimeFields(e.target.value);
    });

    // Sharing & Export
    document.getElementById('btn-share-telegram').addEventListener('click', shareToTelegram);
    document.getElementById('btn-share-invoice-tg').addEventListener('click', shareToTelegram);
    document.getElementById('btn-copy-summary-text').addEventListener('click', copySummaryText);
    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);

    // Copy buttons in invoice
    document.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        triggerHaptic('light');
        // Copy the number currently shown (the coach's saved details), without spaces.
        const shown = btn.parentElement?.querySelector('.pay-num')?.textContent || '';
        const text = shown.replace(/\s+/g, '');
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          showToast(`Copied ${text}`, '📋');
        });
      });
    });

    // Settings Form Submit
    document.getElementById('settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      triggerHaptic('medium');

      settings.coachName = document.getElementById('setting-coach-name').value.trim() || 'Coach Dawit';
      settings.ratePerKid = Number(document.getElementById('setting-rate-per-kid').value) || 1000;
      settings.defaultKids = Number(document.getElementById('setting-default-kids').value) || 4;
      settings.telebirr = document.getElementById('setting-telebirr').value.trim();
      settings.cbe = document.getElementById('setting-cbe').value.trim();
      settings.sheetsWebhook = document.getElementById('setting-sheets-webhook').value.trim();

      saveSettings();
      showToast('Settings saved successfully!');
    });

    // Clear All / Start New Month
    document.getElementById('btn-clear-all')?.addEventListener('click', () => {
      if (confirm('Clear your timesheet to start a new month? (This resets all sessions to 0)')) {
        triggerHaptic('heavy');
        sessions = [];
        saveSessions();
        showToast('Timesheet cleared! Ready for new month.', '✨');
      }
    });

    // Load June 2026 Sample Data
    document.getElementById('btn-reset-demo')?.addEventListener('click', () => {
      if (confirm('Load the June 2026 spreadsheet sample data?')) {
        triggerHaptic('heavy');
        sessions = JSON.parse(JSON.stringify(INITIAL_SESSIONS));
        saveSessions();
        showToast('June 2026 sample data loaded!', '📋');
      }
    });

    // Open Onboarding Guide from Settings
    document.getElementById('btn-open-guide')?.addEventListener('click', () => {
      showOnboardingWizard(1);
    });

    // Onboarding Wizard Choice Cards
    document.querySelectorAll('.wizard-choice-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.wizard-choice-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
    });

    // Onboarding Wizard Event Listeners
    document.getElementById('btn-wizard-next')?.addEventListener('click', nextWizardStep);
    document.getElementById('btn-wizard-prev')?.addEventListener('click', prevWizardStep);
    document.getElementById('btn-wizard-skip')?.addEventListener('click', () => {
      triggerHaptic('light');
      finishOnboarding();
    });

    document.querySelectorAll('.wizard-dots .dot').forEach(dot => {
      dot.addEventListener('click', () => {
        const targetStep = Number(dot.getAttribute('data-step'));
        if (targetStep) {
          saveCurrentWizardStep(currentWizardStep);
          currentWizardStep = targetStep;
          updateWizardUI();
        }
      });
    });

    // Test Sheet Sync Button
    document.getElementById('btn-test-sheet-sync').addEventListener('click', async () => {
      const url = document.getElementById('setting-sheets-webhook').value.trim();
      if (!url) {
        alert('Please paste a Google Apps Script Web App URL first.');
        return;
      }
      showToast('Testing webhook...', '🔄');
      try {
        await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: true, timestamp: new Date().toISOString() })
        });
        showToast('Webhook ping sent!', '✅');
      } catch (err) {
        showToast('Failed to ping webhook', '❌');
      }
    });
  });

})();
