'use strict';

/* ── State ───────────────────────────────────────────── */
let currentUser = null, profile = null;
let currentFilter = 'all', editingTaskId = null;
let tasksCache = null, schedulerInterval = null;
const DEFAULT_PREFS = { sms:true, email:false, push:false, morning:true, afternoon:true, evening:true };

/* ── Icons ───────────────────────────────────────────── */
const ICON = {
  edit:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  check: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  inbox: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
};

/* ── Helpers ─────────────────────────────────────────── */
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
function daysUntil(iso) {
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((new Date(iso + 'T00:00:00') - now) / 86400000);
}
function dueLabelHtml(iso) {
  const d = daysUntil(iso);
  if (d < 0)  return `<span class="due-label overdue">${Math.abs(d)}d overdue</span>`;
  if (d === 0) return `<span class="due-label due-today">Due today</span>`;
  if (d === 1) return `<span class="due-label due-today">Due tomorrow</span>`;
  return `<span class="due-label">Due in ${d}d</span>`;
}
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function setLoading(id, on) {
  const btn = document.getElementById(id); if (!btn) return;
  btn.querySelector('.btn-text').classList.toggle('hidden', on);
  btn.querySelector('.btn-spinner').classList.toggle('hidden', !on);
  btn.disabled = on;
}
function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg; el.classList.remove('hidden');
}
function hideErr(id) { document.getElementById(id)?.classList.add('hidden'); }

/* ── Auth ────────────────────────────────────────────── */
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById(tab + '-form').classList.add('active');
}

async function handleSignup(e) {
  e.preventDefault(); hideErr('signup-error');
  const name     = document.getElementById('signup-name').value.trim();
  const phone    = document.getElementById('signup-phone').value.trim();
  const email    = document.getElementById('signup-email').value.trim().toLowerCase();
  const password = document.getElementById('signup-password').value;
  setLoading('signup-btn', true);
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    await db.ref('profiles/' + userCredential.user.uid).set({ name, phone, prefs: DEFAULT_PREFS });
    setLoading('signup-btn', false);
    toast('Account created successfully!');
  } catch (error) {
    showErr('signup-error', error.message);
    setLoading('signup-btn', false);
  }
}

async function handleLogin(e) {
  e.preventDefault(); hideErr('login-error');
  const email    = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  setLoading('login-btn', true);
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    showErr('login-error', error.message);
  }
  setLoading('login-btn', false);
}

async function handleLogout() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  await auth.signOut();
}

/* ── Profile ─────────────────────────────────────────── */
async function loadProfile() {
  const snapshot = await db.ref('profiles/' + currentUser.uid).once('value');
  profile = snapshot.val() || { name: currentUser.email, prefs: DEFAULT_PREFS };
}

function populateSettings() {
  if (!profile) return;
  document.getElementById('settings-name').value  = profile.name  || '';
  document.getElementById('settings-email').value = currentUser.email;
  document.getElementById('settings-phone').value = profile.phone || '';
  const p = profile.prefs || DEFAULT_PREFS;
  ['sms','email','push','morning','afternoon','evening'].forEach(k => {
    const el = document.getElementById('pref-' + k); if (el) el.checked = !!p[k];
  });
}

async function saveSettings() {
  const name  = document.getElementById('settings-name').value.trim();
  const phone = document.getElementById('settings-phone').value.trim();
  const prefs = {};
  ['sms','email','push','morning','afternoon','evening'].forEach(k => {
    prefs[k] = document.getElementById('pref-' + k)?.checked || false;
  });
  try {
    await db.ref('profiles/' + currentUser.uid).update({ name, phone, prefs });
    profile = { ...profile, name, phone, prefs };
    updateSidebarUser(); toast('Settings saved.');
  } catch (error) {
    toast('Failed to save settings.', 'error');
  }
}

async function confirmDeleteAccount() {
  if (!confirm('This will permanently delete your account and all data. Continue?')) return;
  await db.ref('tasks/' + currentUser.uid).remove();
  await db.ref('notifications/' + currentUser.uid).remove();
  await db.ref('streaks/' + currentUser.uid).remove();
  await db.ref('profiles/' + currentUser.uid).remove();
  await currentUser.delete();
  await auth.signOut();
}

/* ── Tasks ───────────────────────────────────────────── */
async function getMyTasks(refresh = false) {
  if (tasksCache && !refresh) return tasksCache;
  const snapshot = await db.ref('tasks/' + currentUser.uid).orderByChild('due').once('value');
  const tasks = [];
  snapshot.forEach(child => {
    tasks.push({ id: child.key, ...child.val() });
  });
  tasksCache = tasks;
  return tasksCache;
}

async function handleAddReminder(e) {
  e.preventDefault();
  const task = {
    user_id:            currentUser.uid,
    name:               document.getElementById('task-name').value.trim(),
    type:               document.getElementById('task-type').value,
    subject:            document.getElementById('task-subject').value.trim(),
    due:                document.getElementById('task-due').value,
    priority:           document.getElementById('task-priority').value,
    notes:              document.getElementById('task-notes').value.trim(),
    color:              document.getElementById('task-color').value,
    reminder_morning:   document.getElementById('reminder-morning').checked,
    reminder_afternoon: document.getElementById('reminder-afternoon').checked,
    reminder_evening:   document.getElementById('reminder-evening').checked,
    completed:          false,
  };
  try {
    const newTaskRef = db.ref('tasks/' + currentUser.uid).push();
    await newTaskRef.set(task);
    tasksCache = null;
    await addNotification(`Reminder added: "${task.name}" — due ${fmtDate(task.due)}`);
    toast('Reminder saved.');
    document.getElementById('add-reminder-form').reset();
    document.getElementById('task-color').value = '#6366f1';
    showView('reminders');
  } catch (error) {
    toast('Failed to save reminder.', 'error');
  }
}

async function toggleComplete(id) {
  const tasks = await getMyTasks();
  const t = tasks.find(t => t.id === id); if (!t) return;
  await db.ref('tasks/' + currentUser.uid + '/' + id).update({ completed: !t.completed });
  tasksCache = null;
  if (!t.completed) updateStreak();
  renderOverview(); renderAllTasks();
}

function openEditModal(id) {
  const t = (tasksCache || []).find(t => t.id === id); if (!t) return;
  editingTaskId = id;
  document.getElementById('edit-task-name').value    = t.name;
  document.getElementById('edit-task-type').value    = t.type;
  document.getElementById('edit-task-subject').value = t.subject;
  document.getElementById('edit-task-due').value     = t.due;
  document.getElementById('edit-task-priority').value = t.priority;
  document.getElementById('edit-task-notes').value   = t.notes || '';
  document.getElementById('edit-modal').classList.remove('hidden');
  document.getElementById('edit-modal-overlay').classList.remove('hidden');
}
function closeEditModal() {
  editingTaskId = null;
  document.getElementById('edit-modal').classList.add('hidden');
  document.getElementById('edit-modal-overlay').classList.add('hidden');
}
async function handleEditSave(e) {
  e.preventDefault();
  const updates = {
    name:     document.getElementById('edit-task-name').value.trim(),
    type:     document.getElementById('edit-task-type').value,
    subject:  document.getElementById('edit-task-subject').value.trim(),
    due:      document.getElementById('edit-task-due').value,
    priority: document.getElementById('edit-task-priority').value,
    notes:    document.getElementById('edit-task-notes').value.trim(),
  };
  await db.ref('tasks/' + currentUser.uid + '/' + editingTaskId).update(updates);
  tasksCache = null; closeEditModal(); toast('Changes saved.');
  renderAllTasks(); renderOverview();
}
async function confirmDeleteTask(id) {
  if (!confirm('Delete this reminder?')) return;
  await db.ref('tasks/' + currentUser.uid + '/' + id).remove();
  tasksCache = null; toast('Reminder deleted.', 'error');
  renderAllTasks(); renderOverview();
}

/* ── Render ──────────────────────────────────────────── */
function taskCardHtml(t) {
  return `<div class="task-card${t.completed ? ' completed' : ''}" style="--accent-color:${t.color||'var(--accent)'}">
    <div class="task-check${t.completed?' done':''}" onclick="toggleComplete('${t.id}')">${t.completed?ICON.check:''}</div>
    <div class="task-body">
      <div class="task-name">${t.name}</div>
      <div class="task-meta">
        <span class="task-badge badge-${t.type}">${t.type}</span>
        <span>${t.subject}</span>${dueLabelHtml(t.due)}
      </div>
    </div>
    <div class="priority-dot ${t.priority}"></div>
    <div class="task-actions">
      <button class="task-action-btn" onclick="openEditModal('${t.id}')" title="Edit">${ICON.edit}</button>
      <button class="task-action-btn" onclick="confirmDeleteTask('${t.id}')" title="Delete">${ICON.trash}</button>
    </div>
  </div>`;
}

async function renderOverview() {
  const tasks = await getMyTasks();
  document.getElementById('stat-total').textContent     = tasks.length;
  document.getElementById('stat-completed').textContent = tasks.filter(t => t.completed).length;
  document.getElementById('stat-overdue').textContent   = tasks.filter(t => !t.completed && daysUntil(t.due) < 0).length;
  document.getElementById('stat-due-today').textContent = tasks.filter(t => !t.completed && daysUntil(t.due) === 0).length;
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name  = profile?.name?.split(' ')[0] || 'there';
  document.getElementById('greeting-block').innerHTML =
    `<h1>${greet}, ${name}.</h1>
     <p>${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</p>`;
  const upcoming = tasks.filter(t => !t.completed).slice(0, 6);
  document.getElementById('upcoming-list').innerHTML = upcoming.length
    ? upcoming.map(taskCardHtml).join('')
    : `<div class="empty-state">${ICON.inbox}<p>No upcoming tasks.</p></div>`;
}

async function renderAllTasks() {
  let tasks = await getMyTasks();
  const q = (document.getElementById('search-input')?.value || '').toLowerCase();
  if (q) tasks = tasks.filter(t => t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
  if (currentFilter !== 'all') tasks = tasks.filter(t => t.type === currentFilter);
  document.getElementById('all-tasks-list').innerHTML = tasks.length
    ? tasks.map(taskCardHtml).join('')
    : `<div class="empty-state">${ICON.inbox}<p>No reminders found.</p></div>`;
}

function filterTasks() { renderAllTasks(); }
function setFilter(type, el) {
  currentFilter = type;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active'); renderAllTasks();
}

/* ── Notifications ───────────────────────────────────── */
async function addNotification(msg) {
  await db.ref('notifications/' + currentUser.uid).push({ message: msg, created_at: new Date().toISOString() });
  updateNotifBadge();
}
async function updateNotifBadge() {
  const snap = await db.ref('notifications/' + currentUser.uid).once('value');
  const count = snap.numChildren();
  const badge = document.getElementById('notif-badge'); if (!badge) return;
  badge.textContent = count || 0;
  badge.classList.toggle('hidden', !count);
}
async function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const overlay = document.getElementById('notif-overlay');
  const open = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !open);
  overlay.classList.toggle('hidden', !open);
  if (open) renderNotifications();
}
async function renderNotifications() {
  const snap = await db.ref('notifications/' + currentUser.uid).orderByChild('created_at').limitToLast(30).once('value');
  const data = [];
  snap.forEach(child => { data.unshift(child.val()); });
  document.getElementById('notif-list').innerHTML = data.length
    ? data.map(n => `<div class="notif-item"><div>${n.message}</div>
        <div class="notif-time">${new Date(n.created_at).toLocaleString()}</div></div>`).join('')
    : `<div style="padding:1rem;color:var(--muted);font-size:.85rem;text-align:center">No notifications</div>`;
}
async function clearNotifications() {
  await db.ref('notifications/' + currentUser.uid).remove();
  updateNotifBadge(); renderNotifications();
}

/* ── Streak ──────────────────────────────────────────── */
function calcStreak(days) {
  if (!days.length) return 0;
  const sorted = [...new Set(days)].sort();
  let streak = 1, max = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]) - new Date(sorted[i-1])) / 86400000;
    if (diff === 1) { streak++; max = Math.max(max, streak); } else streak = 1;
  }
  return max;
}
async function updateStreak() {
  const today = new Date().toISOString().slice(0, 10);
  const snap = await db.ref('streaks/' + currentUser.uid).once('value');
  const data = snap.val();
  const days = data?.days || [];
  if (days.includes(today)) return;
  days.push(today);
  await db.ref('streaks/' + currentUser.uid).set({ days, count: calcStreak(days) });
}
async function renderStreak() {
  const snap = await db.ref('streaks/' + currentUser.uid).once('value');
  const data = snap.val();
  const days = data?.days || [];
  document.getElementById('streak-count').textContent = data?.count || 0;
  const grid = []; const today = new Date();
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    grid.push(d.toISOString().slice(0, 10));
  }
  document.getElementById('streak-grid').innerHTML =
    grid.map(d => `<div class="streak-day${days.includes(d)?' active':''}" title="${d}"></div>`).join('');
  const tasks = await getMyTasks();
  renderAiSuggestion(tasks.filter(t => !t.completed));
}
function renderAiSuggestion(pending) {
  const urgent = pending.filter(t => daysUntil(t.due) <= 2).length;
  let tip = 'You are on track. Keep completing tasks daily to build your streak.';
  if (urgent > 0)      tip = `You have ${urgent} task${urgent > 1 ? 's' : ''} due within 2 days. Prioritize those first.`;
  else if (pending.length > 5) tip = 'You have many upcoming tasks. Break your study sessions into shorter focused blocks.';
  document.getElementById('ai-suggestion').innerHTML = `<h4>Suggestion</h4><p>${tip}</p>`;
}

/* ── Scheduler ───────────────────────────────────────── */
const SLOTS = { morning: 8, afternoon: 14, evening: 20 };
function startScheduler() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  checkReminders(); schedulerInterval = setInterval(checkReminders, 60000);
}
async function checkReminders() {
  if (!currentUser || !profile) return;
  const h = new Date().getHours(), todayKey = new Date().toISOString().slice(0, 10);
  let slot = null;
  if (h === SLOTS.morning   && profile.prefs?.morning)   slot = 'morning';
  if (h === SLOTS.afternoon && profile.prefs?.afternoon) slot = 'afternoon';
  if (h === SLOTS.evening   && profile.prefs?.evening)   slot = 'evening';
  if (!slot) return;
  const key = `sp_sent_${currentUser.uid}_${todayKey}_${slot}`;
  if (localStorage.getItem(key)) return;
  const tasks = await getMyTasks();
  const due = tasks.filter(t => !t.completed && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 3);
  if (due.length) {
    for (const t of due) await addNotification(`Reminder [${slot}]: "${t.name}" — due ${fmtDate(t.due)}`);
    localStorage.setItem(key, '1');
    toast(`${due.length} reminder${due.length > 1 ? 's' : ''} sent.`);
  }
}

/* ── UI ──────────────────────────────────────────────── */
function showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('nav-' + view).classList.add('active');
  const titles = { overview:'Overview', reminders:'My Reminders', add:'Add Reminder', streak:'Study Streak', settings:'Settings' };
  document.getElementById('topbar-title').textContent = titles[view] || '';
  if (view === 'overview')  renderOverview();
  if (view === 'reminders') renderAllTasks();
  if (view === 'streak')    renderStreak();
  if (view === 'settings')  populateSettings();
  closeSidebar();
}
function showDashboard() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('dashboard-screen').classList.add('active');
  updateSidebarUser();
  showView('overview');
  updateNotifBadge();
  startScheduler();
}
function showAuthScreen() {
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('dashboard-screen').classList.remove('active');
  document.getElementById('login-form').reset();
  document.getElementById('signup-form').reset();
}
function updateSidebarUser() {
  const el = document.getElementById('sidebar-user-pill');
  if (el && profile) el.textContent = profile.name || currentUser?.email || '';
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function closeSidebar()  { document.getElementById('sidebar').classList.remove('open'); }

/* ── Session Listener ────────────────────────────────── */
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    tasksCache  = null;
    await loadProfile();
    showDashboard();
  } else {
    currentUser = null; profile = null; tasksCache = null;
    showAuthScreen();
  }
});

/* ── Init ────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().slice(0, 10);
  const due   = document.getElementById('task-due');
  if (due) due.min = today;
});
