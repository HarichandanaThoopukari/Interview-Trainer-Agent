// ============================================================
// Interview Trainer Agent - Frontend App Logic
// Same-origin API by default. If you deploy the frontend
// separately (e.g. on Vercel) and the backend on Render,
// set API_BASE to your Render URL, e.g:
// const API_BASE = 'https://interview-trainer-agent.onrender.com';
// ============================================================
const API_BASE = '';

let state = {
  token: localStorage.getItem('ita_token') || null,
  user: null,
  currentChatSession: null,
  currentMock: null,
};

// Guards against race conditions where an old, slow request (e.g. boot()
// checking a stale localStorage token) resolves AFTER a newer login/signup/
// logout has already happened, and would otherwise overwrite the screen with
// stale data. Every auth action bumps this counter; a response only gets
// applied if the counter hasn't moved on since that action started.
let sessionEpoch = 0;

// ---------------- API HELPER ----------------
async function api(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  if (!isForm && body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------------- INIT ----------------
document.addEventListener('DOMContentLoaded', () => {
  wireAuthForms();
  wireAppShell();
  checkWatsonxHealth();

  if (state.token) {
    boot();
  }
});

async function boot() {
  const epoch = ++sessionEpoch;
  try {
    const { user } = await api('/auth/me');
    if (epoch !== sessionEpoch) return; // a newer login/signup/logout happened meanwhile — ignore this stale result
    state.user = user;
    showApp();
    loadDashboard();
  } catch (err) {
    if (epoch !== sessionEpoch) return;
    localStorage.removeItem('ita_token');
    state.token = null;
    showAuth();
  }
}

async function checkWatsonxHealth() {
  const pill = document.getElementById('watsonx-status');
  try {
    const health = await api('/health');
    if (health.watsonxConfigured) {
      pill.textContent = `● watsonx connected (${health.model})`;
      pill.className = 'status-pill ok';
    } else {
      pill.textContent = '● watsonx not configured — check .env';
      pill.className = 'status-pill bad';
    }
  } catch (e) {
    pill.textContent = '● backend unreachable';
    pill.className = 'status-pill bad';
  }
}

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}
function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('user-chip').textContent = (state.user.fullName || 'U').charAt(0).toUpperCase();
}

// ============================================================
// AUTH FORMS
// ============================================================
function wireAuthForms() {
  const show = (id) => {
    ['login-form', 'signup-form', 'forgot-form'].forEach((f) => document.getElementById(f).classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  };
  document.getElementById('show-signup').onclick = (e) => { e.preventDefault(); show('signup-form'); };
  document.getElementById('show-login').onclick = (e) => { e.preventDefault(); show('login-form'); };
  document.getElementById('show-login-2').onclick = (e) => { e.preventDefault(); show('login-form'); };
  document.getElementById('show-forgot').onclick = (e) => { e.preventDefault(); show('forgot-form'); };

  document.getElementById('login-btn').onclick = async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    const epoch = ++sessionEpoch;
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (epoch !== sessionEpoch) return;
      state.token = token; state.user = user;
      localStorage.setItem('ita_token', token);
      showApp(); loadDashboard();
    } catch (err) { if (epoch === sessionEpoch) errEl.textContent = err.message; }
  };

  document.getElementById('signup-btn').onclick = async () => {
    const errEl = document.getElementById('signup-error');
    errEl.textContent = '';
    const body = {
      fullName: document.getElementById('signup-name').value.trim(),
      email: document.getElementById('signup-email').value.trim(),
      password: document.getElementById('signup-password').value,
      experienceLevel: document.getElementById('signup-experience').value,
      targetRole: document.getElementById('signup-role').value.trim(),
      industry: document.getElementById('signup-industry').value.trim(),
      skills: document.getElementById('signup-skills').value.trim(),
    };
    if (!body.fullName || !body.email || !body.password || body.password.length < 6) {
      errEl.textContent = 'Please fill all required fields (password min 6 characters).';
      return;
    }
    const epoch = ++sessionEpoch;
    try {
      const { token, user } = await api('/auth/signup', { method: 'POST', body });
      if (epoch !== sessionEpoch) return;
      state.token = token; state.user = user;
      localStorage.setItem('ita_token', token);
      showApp(); loadDashboard();
    } catch (err) { if (epoch === sessionEpoch) errEl.textContent = err.message; }
  };

  document.getElementById('forgot-btn').onclick = async () => {
    const email = document.getElementById('forgot-email').value.trim();
    const resultEl = document.getElementById('forgot-result');
    try {
      const data = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      resultEl.textContent = `${data.message} Temp password: ${data.tempPassword}`;
    } catch (err) { resultEl.style.color = 'var(--coral)'; resultEl.textContent = err.message; }
  };
}

// ============================================================
// APP SHELL: NAV + LOGOUT
// ============================================================
function wireAppShell() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.goto));
  });
  document.getElementById('logout-btn').onclick = () => {
    sessionEpoch++; // invalidates any boot()/login/signup call still in flight
    localStorage.removeItem('ita_token');
    state = { token: null, user: null, currentChatSession: null, currentMock: null };
    showAuth();
  };

  wireChat();
  wireResume();
  wireQuestions();
  wireMock();
  wireStudyPlan();
  wireProfile();
}

const VIEW_TITLES = {
  dashboard: 'Dashboard', chat: 'Mentor Chat', resume: 'Resume Analysis',
  questions: 'Question Bank', mock: 'Mock Interview', studyplan: 'Study Plan',
  bookmarks: 'Bookmarks', profile: 'Profile',
};

function switchView(view) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.getElementById('view-title').textContent = VIEW_TITLES[view] || view;

  if (view === 'dashboard') loadDashboard();
  if (view === 'bookmarks') loadBookmarks();
  if (view === 'profile') loadProfile();
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  const epoch = sessionEpoch;
  try {
    const d = await api('/dashboard/overview');
    if (epoch !== sessionEpoch) return; // a newer login/logout happened while this was in flight — discard
    document.getElementById('welcome-name').textContent = `Welcome back, ${d.fullName?.split(' ')[0] || 'there'} 👋`;
    document.getElementById('readiness-goal').textContent = d.targetRole ? `Preparing for ${d.targetRole}` : 'Set your target role in Profile';

    const score = d.readinessScore || 0;
    document.getElementById('readiness-score').textContent = score;
    const ring = document.getElementById('readiness-ring-fg');
    const circumference = 327;
    const offset = circumference - (score / 100) * circumference;
    ring.style.strokeDashoffset = offset;
    ring.style.stroke = score >= 70 ? 'var(--teal)' : score >= 40 ? 'var(--amber)' : 'var(--coral)';

    document.getElementById('stat-questions').textContent = d.stats.questionsPracticed || 0;
    document.getElementById('stat-mocks').textContent = d.stats.mockInterviews || 0;
    document.getElementById('stat-coding').textContent = d.stats.codingTests || 0;
    document.getElementById('stat-confidence').textContent = d.stats.confidenceScore || 0;

    const strengthsEl = document.getElementById('strengths-list');
    const weaknessesEl = document.getElementById('weaknesses-list');
    strengthsEl.innerHTML = (d.strengths.length ? d.strengths : ['Complete a mock interview to see this']).map((s) => `<span class="tag found">${escapeHtml(s)}</span>`).join('');
    weaknessesEl.innerHTML = (d.weaknesses.length ? d.weaknesses : ['Complete a mock interview to see this']).map((s) => `<span class="tag missing">${escapeHtml(s)}</span>`).join('');

    const chatsEl = document.getElementById('recent-chats-list');
    chatsEl.innerHTML = d.recentChats.length
      ? d.recentChats.map((c) => `<div class="recent-item" data-session="${c.id}">${escapeHtml(c.title)}</div>`).join('')
      : `<div class="muted small">No conversations yet — say hi in Mentor Chat!</div>`;
    chatsEl.querySelectorAll('.recent-item').forEach((el) => {
      el.addEventListener('click', () => { switchView('chat'); loadChatSession(el.dataset.session); });
    });
  } catch (err) {
    console.error(err);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ============================================================
// CHAT
// ============================================================
function wireChat() {
  const sendBtn = document.getElementById('chat-send');
  const input = document.getElementById('chat-input');
  sendBtn.addEventListener('click', sendChatMessage);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });
}

function appendBubble(role, content) {
  const window_ = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = `chat-msg ${role === 'user' ? 'user' : 'mentor'}`;
  div.innerHTML = `<div class="bubble"></div>`;
  div.querySelector('.bubble').textContent = content;
  window_.appendChild(div);
  window_.scrollTop = window_.scrollHeight;
  return div;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  appendBubble('user', message);
  const typing = appendBubble('mentor', 'Thinking…');

  try {
    const data = await api('/chat/message', { method: 'POST', body: { message, sessionId: state.currentChatSession } });
    state.currentChatSession = data.sessionId;
    typing.querySelector('.bubble').textContent = data.reply;
  } catch (err) {
    typing.querySelector('.bubble').textContent = `⚠️ ${err.message}`;
  }
}

async function loadChatSession(id) {
  try {
    const { session } = await api(`/chat/sessions/${id}`);
    state.currentChatSession = id;
    const win = document.getElementById('chat-window');
    win.innerHTML = '';
    session.messages.forEach((m) => appendBubble(m.role, m.content));
  } catch (err) { console.error(err); }
}

// ============================================================
// RESUME
// ============================================================
function wireResume() {
  document.getElementById('resume-upload-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('resume-file');
    const status = document.getElementById('resume-status');
    if (!fileInput.files[0]) { status.textContent = 'Please choose a file first.'; return; }

    const formData = new FormData();
    formData.append('resume', fileInput.files[0]);
    status.textContent = 'Analyzing your resume with watsonx.ai…';

    try {
      const { resume } = await api('/resume/upload', { method: 'POST', body: formData, isForm: true });
      status.textContent = `Analyzed "${resume.fileName}" successfully.`;
      renderResumeResults(resume);
    } catch (err) {
      status.textContent = `⚠️ ${err.message}`;
    }
  });
}

function renderResumeResults(resume) {
  document.getElementById('resume-results').classList.remove('hidden');
  document.getElementById('ats-score').textContent = resume.ats.score;
  document.getElementById('ats-found').innerHTML = resume.ats.foundKeywords.map((k) => `<span class="tag found">${escapeHtml(k)}</span>`).join('') || '<span class="muted small">None detected</span>';
  document.getElementById('ats-missing').innerHTML = resume.ats.missingKeywords.map((k) => `<span class="tag missing">${escapeHtml(k)}</span>`).join('') || '<span class="muted small">None</span>';

  const listify = (id, arr) => {
    document.getElementById(id).innerHTML = (arr.length ? arr : ['No data']).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
  };
  listify('review-strengths', resume.review.strengths);
  listify('review-weaknesses', resume.review.weaknesses);
  listify('review-suggestions', resume.review.suggestions);
}

// ============================================================
// QUESTION BANK
// ============================================================
function wireQuestions() {
  document.getElementById('q-generate-btn').addEventListener('click', async () => {
    const category = document.getElementById('q-category').value;
    const difficulty = document.getElementById('q-difficulty').value;
    const listEl = document.getElementById('questions-list');
    const btn = document.getElementById('q-generate-btn');
    btn.disabled = true;
    listEl.innerHTML = `<p class="muted">Generating questions with Granite…</p>`;
    try {
      const { questions } = await api('/interview/questions', { method: 'POST', body: { category, difficulty, count: 5 } });
      listEl.innerHTML = '';
      questions.forEach((q) => {
        const card = document.createElement('div');
        card.className = 'card question-card';
        card.innerHTML = `
          <div class="q-text">${escapeHtml(q)}</div>
          <div class="q-actions">
            <button class="btn btn-ghost btn-sm answer-btn">Show Model Answer</button>
            <button class="btn btn-ghost btn-sm bookmark-q-btn">🔖 Bookmark</button>
          </div>
          <div class="model-answer hidden"></div>
        `;
        card.querySelector('.answer-btn').addEventListener('click', async (e) => {
          const target = card.querySelector('.model-answer');
          if (!target.classList.contains('hidden')) { target.classList.add('hidden'); return; }
          target.classList.remove('hidden');
          target.textContent = 'Loading model answer…';
          try {
            const { answer } = await api('/interview/model-answer', { method: 'POST', body: { question: q, category } });
            target.textContent = answer;
          } catch (err) { target.textContent = `⚠️ ${err.message}`; }
        });
        card.querySelector('.bookmark-q-btn').addEventListener('click', () => saveBookmark('question', q.slice(0, 60), q));
        listEl.appendChild(card);
      });
    } catch (err) {
      listEl.innerHTML = `<p class="muted">⚠️ ${err.message}</p>`;
    }
    btn.disabled = false;
  });
}

// ============================================================
// MOCK INTERVIEW
// ============================================================
let recognition = null;
let isRecording = false;
let baseAnswerText = ''; // text already in the box before this recording session started

function initSpeechRecognition() {
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionAPI) return null;

  const rec = new SpeechRecognitionAPI();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';

  rec.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript + ' ';
      else interimTranscript += transcript;
    }
    if (finalTranscript) baseAnswerText = (baseAnswerText + ' ' + finalTranscript).trim();
    document.getElementById('mock-answer').value = (baseAnswerText + ' ' + interimTranscript).trim();
  };

  rec.onerror = (event) => {
    document.getElementById('voice-status').textContent = `⚠️ Mic error: ${event.error}. You can switch to Type mode instead.`;
    stopRecording();
  };

  rec.onend = () => {
    if (isRecording) {
      // Some browsers auto-stop after a pause; restart seamlessly while user is still "recording"
      try { rec.start(); } catch (e) { /* already started/stopped race - ignore */ }
    }
  };

  return rec;
}

function startRecording() {
  if (!recognition) return;
  baseAnswerText = document.getElementById('mock-answer').value.trim();
  isRecording = true;
  try { recognition.start(); } catch (e) { /* ignore double-start */ }
  document.getElementById('mic-btn').classList.add('recording');
  document.getElementById('mic-label').textContent = 'Stop Recording';
  document.getElementById('voice-status').textContent = '🔴 Listening… speak your answer, then click Stop.';
}

function stopRecording() {
  if (!recognition) return;
  isRecording = false;
  try { recognition.stop(); } catch (e) { /* ignore */ }
  document.getElementById('mic-btn').classList.remove('recording');
  document.getElementById('mic-label').textContent = 'Start Recording';
  document.getElementById('voice-status').textContent = 'Recording stopped — review/edit your answer below, or click Start Recording to add more.';
}

function setupVoiceInput() {
  recognition = initSpeechRecognition();
  const voiceControls = document.getElementById('voice-controls');
  const micBtn = document.getElementById('mic-btn');
  const voiceStatus = document.getElementById('voice-status');
  const typeBtn = document.getElementById('mode-type-btn');
  const voiceBtn = document.getElementById('mode-voice-btn');

  if (!recognition) {
    voiceStatus.textContent = '⚠️ Voice input isn\'t supported in this browser. Try Chrome or Edge, or continue typing your answer.';
    voiceStatus.className = 'voice-unsupported';
    micBtn.disabled = true;
  }

  typeBtn.addEventListener('click', () => {
    typeBtn.classList.add('active');
    voiceBtn.classList.remove('active');
    voiceControls.classList.add('hidden');
    if (isRecording) stopRecording();
  });

  voiceBtn.addEventListener('click', () => {
    voiceBtn.classList.add('active');
    typeBtn.classList.remove('active');
    voiceControls.classList.remove('hidden');
  });

  micBtn.addEventListener('click', () => {
    if (isRecording) stopRecording();
    else startRecording();
  });
}

function resetVoiceStateForNewQuestion() {
  if (isRecording) stopRecording();
  baseAnswerText = '';
  const voiceStatus = document.getElementById('voice-status');
  if (recognition) voiceStatus.textContent = 'Click to speak your answer — you can edit the text before submitting.';
}

function wireMock() {
  setupVoiceInput();

  document.getElementById('mock-start-btn').addEventListener('click', startNewMock);
  document.getElementById('mock-restart-btn').addEventListener('click', () => {
    // Reset UI back to the setup screen for a fresh attempt
    document.getElementById('mock-report').classList.add('hidden');
    document.getElementById('mock-review-list').classList.add('hidden');
    document.getElementById('mock-review-list').innerHTML = '';
    document.getElementById('mock-role').value = '';
    document.getElementById('mock-setup').classList.remove('hidden');
  });
  document.getElementById('mock-review-btn').addEventListener('click', showMockReview);

  document.getElementById('mock-submit-btn').addEventListener('click', async () => {
    const answer = document.getElementById('mock-answer').value.trim();
    if (!answer) return;
    if (isRecording) stopRecording();
    const btn = document.getElementById('mock-submit-btn');
    btn.disabled = true; btn.textContent = 'Evaluating…';
    try {
      const data = await api(`/interview/mock/${state.currentMock.id}/answer`, { method: 'POST', body: { answer } });
      renderMockFeedback(data.entry);
      if (data.isComplete) {
        showMockReport(state.currentMock.id);
      } else {
        state.currentMock.index = data.nextIndex;
        document.getElementById('mock-answer').value = '';
        resetVoiceStateForNewQuestion();
        renderMockQuestion();
      }
    } catch (err) { alert(err.message); }
    btn.disabled = false; btn.textContent = 'Submit Answer';
  });
}

async function startNewMock() {
  const role = document.getElementById('mock-role').value.trim();
  const btn = document.getElementById('mock-start-btn');
  btn.disabled = true;
  btn.textContent = 'Starting…';
  try {
    const data = await api('/interview/mock/start', { method: 'POST', body: { role, numQuestions: 5 } });
    state.currentMock = { id: data.mockId, questions: data.questions, index: 0 };
    document.getElementById('mock-setup').classList.add('hidden');
    document.getElementById('mock-session').classList.remove('hidden');
    document.getElementById('mock-report').classList.add('hidden');
    document.getElementById('mock-review-list').classList.add('hidden');
    document.getElementById('mock-review-list').innerHTML = '';
    document.getElementById('mock-answer').value = '';
    resetVoiceStateForNewQuestion();
    renderMockQuestion();
  } catch (err) { alert(err.message); }
  btn.disabled = false;
  btn.textContent = 'Start Mock Interview';
}

async function showMockReview() {
  const listEl = document.getElementById('mock-review-list');
  const btn = document.getElementById('mock-review-btn');
  if (!listEl.classList.contains('hidden')) { listEl.classList.add('hidden'); return; }
  listEl.classList.remove('hidden');
  listEl.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const { mock } = await api(`/interview/mock/${state.currentMock.id}`);
    listEl.innerHTML = mock.answers.map((a, i) => `
      <div class="card mock-review-item">
        <div class="q-text">Q${i + 1}. ${escapeHtml(a.question)}</div>
        <div class="a-text">${escapeHtml(a.answer)}</div>
        <div class="mock-scores">${Object.entries(a.scores).map(([k, v]) => `<span class="score-chip">${k}: <b>${v}/10</b></span>`).join('')}</div>
        <p class="muted small">${escapeHtml(a.feedback)}</p>
      </div>
    `).join('');
  } catch (err) { listEl.innerHTML = `<p class="muted">⚠️ ${err.message}</p>`; }
}

function renderMockQuestion() {
  const { questions, index } = state.currentMock;
  document.getElementById('mock-progress-label').textContent = `Question ${index + 1} of ${questions.length}`;
  document.getElementById('mock-current-question').textContent = questions[index];
  document.getElementById('mock-feedback-card').classList.add('hidden');
}

function renderMockFeedback(entry) {
  const card = document.getElementById('mock-feedback-card');
  card.classList.remove('hidden');
  const scoresEl = document.getElementById('mock-scores');
  scoresEl.innerHTML = Object.entries(entry.scores).map(([k, v]) => `<span class="score-chip">${k}: <b>${v}/10</b></span>`).join('');
  document.getElementById('mock-feedback-text').textContent = entry.feedback;
}

async function showMockReport(id) {
  document.getElementById('mock-session').classList.add('hidden');
  const reportEl = document.getElementById('mock-report');
  reportEl.classList.remove('hidden');
  try {
    const { mock } = await api(`/interview/mock/${id}`);
    document.getElementById('mock-overall-score').textContent = `${mock.overallScore || 0}/100`;
  } catch (err) { console.error(err); }
  loadDashboard();
}

// ============================================================
// STUDY PLAN
// ============================================================
function wireStudyPlan() {
  document.getElementById('plan-generate-btn').addEventListener('click', async () => {
    const durationDays = parseInt(document.getElementById('plan-duration').value, 10);
    const hoursPerDay = parseInt(document.getElementById('plan-hours').value, 10) || 2;
    const targetCompany = document.getElementById('plan-company').value.trim();
    const card = document.getElementById('plan-result-card');
    const resultEl = document.getElementById('plan-result');
    card.style.display = 'block';
    resultEl.textContent = 'Generating your personalized study plan with Granite…';
    try {
      const data = await api('/interview/study-plan', { method: 'POST', body: { durationDays, hoursPerDay, targetCompany } });
      resultEl.textContent = data.plan;
      document.getElementById('plan-bookmark-btn').onclick = () => saveBookmark('study_plan', `${durationDays}-Day Study Plan`, data.plan);
    } catch (err) {
      resultEl.textContent = `⚠️ ${err.message}`;
    }
  });
}

// ============================================================
// BOOKMARKS
// ============================================================
async function saveBookmark(type, title, content) {
  try {
    await api('/bookmarks', { method: 'POST', body: { type, title, content } });
    alert('Bookmarked! Check the Bookmarks tab.');
  } catch (err) { alert(err.message); }
}

async function loadBookmarks() {
  const listEl = document.getElementById('bookmarks-list');
  listEl.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const { bookmarks } = await api('/bookmarks');
    listEl.innerHTML = bookmarks.length ? '' : '<p class="muted">No bookmarks yet. Save questions, answers or study plans as you go.</p>';
    bookmarks.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'card bookmark-card';
      card.innerHTML = `
        <div class="bookmark-type">${escapeHtml(b.type.replace('_', ' '))}</div>
        <h4>${escapeHtml(b.title)}</h4>
        <div class="bookmark-content">${escapeHtml(b.content)}</div>
        <button class="btn btn-ghost bookmark-remove">Remove</button>
      `;
      card.querySelector('.bookmark-remove').addEventListener('click', async () => {
        await api(`/bookmarks/${b.id}`, { method: 'DELETE' });
        loadBookmarks();
      });
      listEl.appendChild(card);
    });
  } catch (err) { listEl.innerHTML = `<p class="muted">⚠️ ${err.message}</p>`; }
}

// ============================================================
// PROFILE
// ============================================================
function wireProfile() {
  document.getElementById('profile-save-btn').addEventListener('click', async () => {
    const body = {
      fullName: document.getElementById('profile-name').value.trim(),
      targetRole: document.getElementById('profile-role').value.trim(),
      experienceLevel: document.getElementById('profile-experience').value,
      industry: document.getElementById('profile-industry').value.trim(),
      skills: document.getElementById('profile-skills').value.trim(),
    };
    const status = document.getElementById('profile-status');
    try {
      const { user } = await api('/auth/me', { method: 'PUT', body });
      state.user = user;
      status.textContent = 'Profile updated!';
      loadDashboard();
    } catch (err) { status.style.color = 'var(--coral)'; status.textContent = err.message; }
  });
}

async function loadProfile() {
  const epoch = sessionEpoch;
  try {
    const { user } = await api('/auth/me');
    if (epoch !== sessionEpoch) return; // a newer login/logout happened while this was in flight — discard
    state.user = user;
    document.getElementById('profile-name').value = user.fullName || '';
    document.getElementById('profile-role').value = user.targetRole || '';
    document.getElementById('profile-experience').value = user.experienceLevel || 'Fresher';
    document.getElementById('profile-industry').value = user.industry || '';
    document.getElementById('profile-skills').value = user.skills || '';
  } catch (err) { console.error(err); }
}