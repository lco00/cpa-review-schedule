let expandedSubjectId = null;
let editingSubjectId = null;
let editingTopicKey = null;
let editingLectureId = null;
let editingReviewHistory = [];
let priorityShowAll = false;
let modalCallback = null;
let isComposing = false;

const headerDate = document.getElementById('header-date');
const headerExtra = document.getElementById('header-extra');
const editOverlay = document.getElementById('edit-overlay');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalInput = document.getElementById('modal-input');
const toast = document.getElementById('toast');
const subjectSelect = document.getElementById('subject-select');
const topicSelect = document.getElementById('topic-select');
const lecturesOverlay = document.getElementById('lectures-overlay');
const lecturesListView = document.getElementById('lectures-list-view');
const lecturesEditView = document.getElementById('lectures-edit-view');
const lecturesSheetTitle = document.getElementById('lectures-sheet-title');
const lectureEditSubject = document.getElementById('lecture-edit-subject');
const lectureEditTopic = document.getElementById('lecture-edit-topic');
const lectureEditDate = document.getElementById('lecture-edit-date');

function refreshAllViews() {
  renderExamCountdown();
  renderToday();
  renderPriorityRanking();
  if (lecturesOverlay?.classList.contains('is-open')) {
    renderRegisteredLectures();
  }
  if (typeof switchGraphTab === 'function' && document.getElementById('graph-overlay')?.classList.contains('is-open')) {
    switchGraphTab(currentGraphTab);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1200);
}

function openModal(title, value, callback) {
  modalTitle.textContent = title;
  modalInput.value = value || '';
  modalCallback = callback;
  isComposing = false;
  modalOverlay.hidden = false;
  setTimeout(() => modalInput.focus(), 100);
}

function closeModal() {
  modalOverlay.hidden = true;
  modalCallback = null;
  isComposing = false;
}

function saveModal() {
  if (isComposing) return;
  const val = modalInput.value.trim();
  if (!val || !modalCallback) return;
  modalCallback(val);
  closeModal();
}

function getReviewRoundLabel(intervalIndex) {
  return `${intervalIndex + 1}回目`;
}

function colorWithAlpha(hex, alpha) {
  if (!hex || !hex.startsWith('#')) return hex;
  const raw = hex.length === 4
    ? hex.slice(1).split('').map((c) => c + c).join('')
    : hex.slice(1);
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatTodayDate() {
  return new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

/* ── 試験日カウントダウン ── */

function renderExamCountdown() {
  const card = document.getElementById('exam-countdown-card');
  const nameEl = document.getElementById('exam-countdown-name');
  const daysEl = document.getElementById('exam-countdown-days');
  const dateEl = document.getElementById('exam-countdown-date');
  const pastEl = document.getElementById('exam-countdown-past');
  if (!card || !nameEl || !daysEl || !dateEl || !pastEl) return;

  const exam = getSelectedExam();
  if (!exam) {
    card.hidden = true;
    return;
  }

  const info = getExamCountdownInfo(exam);
  card.hidden = false;
  card.classList.toggle('exam-countdown-card--past', info.status === 'past');
  card.classList.toggle('exam-countdown-card--today', info.status === 'today');

  nameEl.textContent = info.status === 'past' ? exam.name : `${exam.name}まで`;
  daysEl.textContent = info.mainLabel;
  dateEl.textContent = info.dateLabel;

  if (info.status === 'past') {
    pastEl.hidden = false;
    pastEl.textContent = info.suffix;
  } else {
    pastEl.hidden = true;
    pastEl.textContent = '';
  }
}

function renderExamSettings() {
  const list = document.getElementById('exam-settings-list');
  if (!list) return;

  const exams = getExams();
  if (exams.length === 0) {
    list.innerHTML = '<p class="exam-settings-empty">試験日が登録されていません</p>';
    return;
  }

  list.innerHTML = exams
    .map(
      (exam) => `
    <div class="exam-setting-item" data-exam-id="${exam.id}">
      <div class="exam-setting-fields">
        <label class="exam-setting-field">
          <span class="exam-setting-label">試験名</span>
          <input type="text" class="exam-setting-name ios-cell__control" value="${escapeHtml(exam.name)}" data-exam-id="${exam.id}">
        </label>
        <label class="exam-setting-field">
          <span class="exam-setting-label">試験日</span>
          <input type="date" class="exam-setting-date ios-cell__control ios-cell__control--date" value="${exam.examDate}" data-exam-id="${exam.id}">
        </label>
      </div>
      <button type="button" class="exam-setting-delete" data-exam-id="${exam.id}">削除</button>
    </div>
  `
    )
    .join('');

  list.querySelectorAll('.exam-setting-name').forEach((input) => {
    input.addEventListener('change', () => {
      if (!updateExam(input.dataset.examId, { name: input.value })) {
        showToast('試験名を入力してください');
        renderExamSettings();
        return;
      }
      refreshAllViews();
    });
  });

  list.querySelectorAll('.exam-setting-date').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.value || !updateExam(input.dataset.examId, { examDate: input.value })) return;
      refreshAllViews();
    });
  });

  list.querySelectorAll('.exam-setting-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const exam = getExams().find((e) => e.id === btn.dataset.examId);
      if (!exam) return;
      if (!confirm(`「${exam.name}」を削除しますか？`)) return;
      deleteExam(exam.id);
      showToast('試験日を削除しました');
      refreshAllViews();
      renderExamSettings();
    });
  });
}

function initExamUI() {
  document.getElementById('exam-countdown-card')?.addEventListener('click', () => {
    if (!getExams().length) return;
    cycleSelectedExam();
    renderExamCountdown();
  });

  document.getElementById('exam-add-btn')?.addEventListener('click', () => {
    openModal('試験名を入力', '', (name) => {
      const defaultDate = addDays(getToday(), 180);
      const exam = addExam(name, defaultDate);
      if (!exam) return;
      showToast('試験日を追加しました');
      renderExamSettings();
      refreshAllViews();
    });
  });
}

/* ── 今日やること ── */

function renderToday() {
  const list = document.getElementById('today-list');
  const reviews = getTodayReviews();

  if (reviews.length === 0) {
    headerExtra.hidden = true;
    list.innerHTML = `
      <div class="home-done">
        <div class="home-done__icon">✓</div>
        <p class="home-done__title">すべて完了</p>
        <p class="home-done__sub">今日の復習はありません</p>
      </div>
    `;
    return;
  }

  headerExtra.hidden = false;
  headerExtra.textContent = `残り ${reviews.length} 件`;

  list.innerHTML = reviews
    .map(
      (r, index) => {
        const topicColor = getLectureTopicColor(r.lecture, index);
        return `
    <article class="today-card" data-id="${r.id}" data-lecture-id="${r.lecture.id}" style="--topic-color: ${topicColor}">
      <div class="today-card__body">
        <span class="today-card__subject" style="color: ${topicColor}; background: ${colorWithAlpha(topicColor, 0.12)}">${escapeHtml(r.lecture.subject)}</span>
        <h2 class="today-card__title">${escapeHtml(r.lecture.topic)}</h2>
        <p class="today-card__round">${getReviewRoundLabel(r.intervalIndex)}</p>
      </div>
      <button class="lecture-edit-btn" type="button" data-lecture-id="${r.lecture.id}">編集</button>
      <div class="today-review-btns" role="group" aria-label="復習結果">
        <button class="today-review-btn today-review-btn--good" type="button" data-result="good" aria-label="○ ほぼ完璧に解けた">○</button>
        <button class="today-review-btn today-review-btn--ok" type="button" data-result="ok" aria-label="△ なんとなく解けた">△</button>
        <button class="today-review-btn today-review-btn--bad" type="button" data-result="bad" aria-label="✕ 解けなかった">✕</button>
      </div>
    </article>
  `;
      }
    )
    .join('');

  list.querySelectorAll('.today-review-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const card = e.currentTarget.closest('.today-card');
      const result = e.currentTarget.dataset.result;
      if (!submitReview(card.dataset.id, result)) return;

      const messages = {
        good: '○ 記憶をしっかり定着させました',
        ok: '△ もう一度確認しましょう',
        bad: '✕ 次回復習を前倒しします',
      };
      showToast(messages[result] || '記録しました');

      card.classList.add('today-card--done');
      setTimeout(refreshAllViews, 400);
    });
  });

  list.querySelectorAll('.lecture-edit-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openLecturesPanel(btn.dataset.lectureId);
    });
  });
}

function getPriorityWarningMessage(retention) {
  return `この論点は記憶定着率が${retention}%まで低下しています。これ以上放置すると、再学習に近い状態になる可能性があります。今日中に復習することをおすすめします。`;
}

function renderPriorityCard(item, rank) {
  const showWarning = item.retention < 50;
  const ctaLabel = item.retention < 30 ? '今すぐ復習' : '復習する';

  return `
    <article class="priority-card priority-card--${item.danger.level}" data-lecture-id="${item.lectureId}" style="--topic-color: ${item.color}">
      <div class="priority-card__head">
        <span class="priority-card__rank">${rank}位</span>
        <span class="priority-card__danger priority-card__danger--${item.danger.level}">${escapeHtml(item.danger.label)}</span>
      </div>
      <p class="priority-card__subject">${escapeHtml(item.subject)}</p>
      <h3 class="priority-card__title">${escapeHtml(item.topic)}</h3>
      <dl class="priority-card__stats">
        <div class="priority-card__stat">
          <dt>記憶定着率</dt>
          <dd class="priority-card__retention">${item.retention}%</dd>
        </div>
        <div class="priority-card__stat">
          <dt>最後の復習</dt>
          <dd>${escapeHtml(item.lastReviewLabel)}</dd>
        </div>
      </dl>
      ${showWarning ? `<p class="priority-card__alert">${escapeHtml(getPriorityWarningMessage(item.retention))}</p>` : ''}
      <div class="priority-card__action">
        <button type="button" class="priority-card__cta">${ctaLabel}</button>
        <div class="priority-review-btns" role="group" aria-label="復習結果" hidden>
          <button type="button" class="priority-review-btn priority-review-btn--good" data-result="good">○ 覚えた</button>
          <button type="button" class="priority-review-btn priority-review-btn--ok" data-result="ok">△ あやふや</button>
          <button type="button" class="priority-review-btn priority-review-btn--bad" data-result="bad">✕ 覚えてない</button>
        </div>
      </div>
    </article>
  `;
}

function bindPriorityCardEvents(container) {
  container.querySelectorAll('.priority-card__cta').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.closest('.priority-card__action');
      const reviewBtns = action?.querySelector('.priority-review-btns');
      if (!action || !reviewBtns) return;
      btn.hidden = true;
      reviewBtns.hidden = false;
    });
  });

  container.querySelectorAll('.priority-review-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.priority-card');
      const lectureId = card?.dataset.lectureId;
      const result = btn.dataset.result;
      if (!lectureId || !submitLectureReview(lectureId, result)) return;

      const messages = {
        good: '○ 記憶をしっかり定着させました',
        ok: '△ もう一度確認しましょう',
        bad: '✕ 次回復習を前倒しします',
      };
      showToast(messages[result] || '記録しました');
      card.classList.add('priority-card--done');
      setTimeout(refreshAllViews, 400);
    });
  });
}

function renderPriorityRanking() {
  const section = document.getElementById('priority-section');
  const list = document.getElementById('priority-list');
  const showMoreBtn = document.getElementById('priority-show-more');
  if (!section || !list) return;

  const ranking = getPriorityRanking();
  if (ranking.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  const limit = priorityShowAll ? ranking.length : Math.min(5, ranking.length);
  const visible = ranking.slice(0, limit);

  list.innerHTML = visible
    .map((item, index) => renderPriorityCard(item, index + 1))
    .join('');

  bindPriorityCardEvents(list);

  if (showMoreBtn) {
    const hasMore = ranking.length > 5;
    showMoreBtn.hidden = !hasMore || priorityShowAll;
    showMoreBtn.textContent = `もっと見る（全${ranking.length}件）`;
  }
}

/* ── 講義登録 ── */

function renderRegisterForm() {
  const subjects = getSubjects();
  const hint = document.getElementById('no-topics-hint');
  const submitBtn = document.getElementById('register-submit');

  subjectSelect.innerHTML = subjects.length === 0
    ? '<option value="">科目がありません</option>'
    : subjects.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  subjectSelect.disabled = subjects.length === 0;
  submitBtn.disabled = subjects.length === 0;

  if (subjects.length > 0) {
    updateTopicSelect(subjects[0].id);
  } else {
    topicSelect.innerHTML = '<option value="">—</option>';
    topicSelect.disabled = true;
    hint.style.display = 'none';
  }

  const dateInput = document.getElementById('attended-date');
  if (!dateInput.value) {
    dateInput.value = getToday();
    dateInput.max = getToday();
  }
}

function updateTopicSelect(subjectId) {
  const topics = getTopicsBySubjectId(subjectId);
  const hint = document.getElementById('no-topics-hint');
  const submitBtn = document.getElementById('register-submit');
  const hasTopics = topics.length > 0;

  topicSelect.innerHTML = hasTopics
    ? topics.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')
    : '<option value="">論点がありません</option>';

  topicSelect.disabled = !hasTopics;
  hint.style.display = hasTopics ? 'none' : 'block';
  submitBtn.disabled = !hasTopics;
}

function handleRegister(e) {
  e.preventDefault();

  const subject = getSubjectById(subjectSelect.value);
  const topics = getTopicsBySubjectId(subjectSelect.value);
  const topic = topics.find((t) => t.id === topicSelect.value);
  if (!subject || !topic) return;

  const attendedDate = document.getElementById('attended-date').value;

  registerLecture({
    subject: subject.name,
    topic: topic.name,
    lectureName: `${subject.name} ${topic.name}`,
    attendedDate,
  });

  showToast('登録しました');
  refreshAllViews();
}

/* ── 登録済み講義 ── */

function formatAttendedDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

function renderRegisteredLectures() {
  const list = document.getElementById('registered-list');
  if (!list) return;

  const lectures = getAllLectures();

  if (lectures.length === 0) {
    list.innerHTML = '<p class="no-topics">登録済みの講義がありません</p>';
    return;
  }

  list.innerHTML = lectures
    .map(
      (l) => `
    <div class="registered-item">
      <div class="registered-item__body">
        <p class="registered-item__title">${escapeHtml(l.subject)} / ${escapeHtml(l.topic)}</p>
        <p class="registered-item__date">受講日: ${formatAttendedDate(l.attendedDate)}</p>
      </div>
      <button class="registered-item__edit" type="button" data-lecture-id="${l.id}">編集</button>
    </div>
  `
    )
    .join('');

  list.querySelectorAll('.registered-item__edit').forEach((btn) => {
    btn.addEventListener('click', () => showLectureEditView(btn.dataset.lectureId));
  });
}

function isLecturesOpen() {
  return lecturesOverlay && lecturesOverlay.classList.contains('is-open');
}

function getReviewResultSymbol(result) {
  if (result === 'good') return '○';
  if (result === 'ok') return '△';
  if (result === 'bad') return '✕';
  return '';
}


function renderLectureReviewHistory() {
  const container = document.getElementById('lecture-review-history');
  if (!container) return;

  if (editingReviewHistory.length === 0) {
    container.innerHTML = '<p class="lecture-history-empty">復習履歴はまだありません</p>';
    return;
  }

  container.innerHTML = editingReviewHistory
    .map(
      (entry) => `
    <div class="lecture-history-item" data-entry-id="${entry.id}">
      <input
        type="date"
        class="lecture-history-date ios-cell__control ios-cell__control--date"
        value="${entry.reviewDate || ''}"
        max="${getToday()}"
        aria-label="復習日"
      >
      <div class="lecture-history-results" role="group" aria-label="復習結果">
        <button type="button" class="lecture-history-result lecture-history-result--good${entry.result === 'good' ? ' is-selected' : ''}" data-result="good" aria-label="○">○</button>
        <button type="button" class="lecture-history-result lecture-history-result--ok${entry.result === 'ok' ? ' is-selected' : ''}" data-result="ok" aria-label="△">△</button>
        <button type="button" class="lecture-history-result lecture-history-result--bad${entry.result === 'bad' ? ' is-selected' : ''}" data-result="bad" aria-label="✕">✕</button>
      </div>
      <button type="button" class="lecture-history-delete" aria-label="削除">削除</button>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.lecture-history-item').forEach((item) => {
    const entryId = item.dataset.entryId;

    item.querySelector('.lecture-history-date')?.addEventListener('change', (e) => {
      const entry = editingReviewHistory.find((h) => h.id === entryId);
      if (entry) entry.reviewDate = e.target.value;
    });

    item.querySelectorAll('.lecture-history-result').forEach((btn) => {
      btn.addEventListener('click', () => {
        const entry = editingReviewHistory.find((h) => h.id === entryId);
        if (!entry) return;
        entry.result = btn.dataset.result;
        renderLectureReviewHistory();
      });
    });

    item.querySelector('.lecture-history-delete')?.addEventListener('click', () => {
      editingReviewHistory = editingReviewHistory.filter((h) => h.id !== entryId);
      renderLectureReviewHistory();
    });
  });
}

function addReviewHistoryRow() {
  editingReviewHistory.push({
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    reviewDate: '',
    result: null,
  });
  renderLectureReviewHistory();
}

function validateEditingReviewHistory(attendedDate) {
  const today = getToday();
  const incomplete = editingReviewHistory.filter((e) => !e.reviewDate || !e.result);
  if (incomplete.length > 0) {
    showToast('復習履歴の日付と結果を入力してください');
    return false;
  }

  const dates = new Set();
  for (const entry of editingReviewHistory) {
    if (entry.reviewDate <= attendedDate) {
      showToast('復習日は受講日より後にしてください');
      return false;
    }
    if (entry.reviewDate > today) {
      showToast('復習日は今日以前にしてください');
      return false;
    }
    if (dates.has(entry.reviewDate)) {
      showToast('同じ復習日が重複しています');
      return false;
    }
    dates.add(entry.reviewDate);
  }

  return true;
}

function showLecturesListView() {
  editingLectureId = null;
  editingReviewHistory = [];
  if (lecturesListView) lecturesListView.hidden = false;
  if (lecturesEditView) lecturesEditView.hidden = true;
  if (lecturesSheetTitle) lecturesSheetTitle.textContent = '登録済み講義編集';
  renderRegisteredLectures();
}

function showLectureEditView(lectureId) {
  const info = getLectureEditInfo(lectureId);
  if (!info) return;

  editingLectureId = lectureId;
  populateLectureEditSubjectSelect(info.subjectId);
  populateLectureEditTopicSelect(info.subjectId, info.topicId);
  lectureEditDate.value = info.lecture.attendedDate;
  lectureEditDate.max = getToday();
  editingReviewHistory = getLectureReviewHistory(lectureId).map((h) => ({ ...h }));
  renderLectureReviewHistory();

  if (lecturesListView) lecturesListView.hidden = true;
  if (lecturesEditView) lecturesEditView.hidden = false;
  if (lecturesSheetTitle) lecturesSheetTitle.textContent = '講義を編集';
}

function openLecturesPanel(lectureId) {
  if (!lecturesOverlay || isLecturesOpen()) {
    if (lectureId) showLectureEditView(lectureId);
    return;
  }
  lecturesOverlay.classList.add('is-open');
  lecturesOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  if (lectureId) {
    showLectureEditView(lectureId);
  } else {
    showLecturesListView();
  }
}

function closeLecturesPanel() {
  if (!lecturesOverlay) return;
  lecturesOverlay.classList.remove('is-open');
  lecturesOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  editingLectureId = null;
  editingReviewHistory = [];
  if (lecturesListView) lecturesListView.hidden = false;
  if (lecturesEditView) lecturesEditView.hidden = true;
}

function populateLectureEditTopicSelect(subjectId, selectedTopicId) {
  const topics = getTopicsBySubjectId(subjectId);
  lectureEditTopic.innerHTML = topics.length === 0
    ? '<option value="">論点がありません</option>'
    : topics.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  lectureEditTopic.disabled = topics.length === 0;
  if (selectedTopicId && topics.some((t) => t.id === selectedTopicId)) {
    lectureEditTopic.value = selectedTopicId;
  }
}

function populateLectureEditSubjectSelect(selectedSubjectId) {
  const subjects = getSubjects();
  lectureEditSubject.innerHTML = subjects.length === 0
    ? '<option value="">科目がありません</option>'
    : subjects.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  lectureEditSubject.disabled = subjects.length === 0;
  if (selectedSubjectId) lectureEditSubject.value = selectedSubjectId;
}

function openLectureEditModal(lectureId) {
  openLecturesPanel(lectureId);
}

function closeLectureEditModal() {
  if (isLecturesOpen() && !lecturesEditView?.hidden) {
    showLecturesListView();
  } else {
    closeLecturesPanel();
  }
}

function saveLectureEdit() {
  if (!editingLectureId) return;

  const subjectId = lectureEditSubject.value;
  const topicId = lectureEditTopic.value;
  const attendedDate = lectureEditDate.value;
  if (!subjectId || !topicId || !attendedDate) return;
  if (!validateEditingReviewHistory(attendedDate)) return;

  const ok = updateLecture(editingLectureId, {
    subjectId,
    topicId,
    attendedDate,
    reviewHistory: editingReviewHistory,
  });
  if (!ok) return;

  showToast('講義を更新しました');
  refreshAllViews();
  showLecturesListView();
}

function deleteLectureEdit() {
  if (!editingLectureId) return;
  const lecture = getLectureById(editingLectureId);
  if (!lecture) return;
  if (!confirm(`「${lecture.subject} / ${lecture.topic}」を削除しますか？`)) return;

  deleteLecture(editingLectureId);
  showToast('講義を削除しました');
  refreshAllViews();
  showLecturesListView();
}

/* ── バックアップ ── */

function exportBackupToFile() {
  const payload = createBackupPayload();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup-${getToday()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importBackupFromFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = validateBackupPayload(parsed);
      if (!data) {
        showToast('バックアップファイルの形式が正しくありません');
        return;
      }
      if (!confirm('現在のデータを上書きしますか？')) return;

      restoreBackupData(data);
      expandedSubjectId = null;
      editingSubjectId = null;
      editingTopicKey = null;
      showToast('データを復元しました');
      refreshAllViews();
      renderSettings();
    } catch {
      showToast('バックアップファイルを読み込めませんでした');
    }
  };
  reader.onerror = () => showToast('バックアップファイルを読み込めませんでした');
  reader.readAsText(file);
}

function initBackupUI() {
  document.getElementById('backup-export-btn')?.addEventListener('click', () => {
    exportBackupToFile();
    showToast('バックアップをダウンロードしました');
  });

  const importInput = document.getElementById('backup-import-input');
  importInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importBackupFromFile(file);
    e.target.value = '';
  });
}

/* ── 科目・論点 編集 ── */

function isEditOpen() {
  return editOverlay && editOverlay.classList.contains('is-open');
}

function openEditPanel() {
  if (!editOverlay || isEditOpen()) return;
  editOverlay.classList.add('is-open');
  editOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  renderSettings();
}

function closeEditPanel() {
  if (!editOverlay) return;
  editOverlay.classList.remove('is-open');
  editOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  editingSubjectId = null;
  editingTopicKey = null;
  renderRegisterForm();
}

function startSubjectEdit(subjectId) {
  editingSubjectId = subjectId;
  editingTopicKey = null;
  expandedSubjectId = subjectId;
  renderSettings();
}

function cancelSubjectEdit() {
  editingSubjectId = null;
  renderSettings();
}

function saveSubjectEdit(subjectId) {
  const input = document.querySelector(`[data-edit-subject-input="${subjectId}"]`);
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  updateSubject(subjectId, name);
  editingSubjectId = null;
  showToast('科目を更新しました');
  renderSettings();
  renderRegisterForm();
}

function startTopicEdit(subjectId, topicId) {
  editingTopicKey = `${subjectId}:${topicId}`;
  editingSubjectId = null;
  expandedSubjectId = subjectId;
  renderSettings();
}

function cancelTopicEdit() {
  editingTopicKey = null;
  renderSettings();
}

function saveTopicEdit(subjectId, topicId) {
  const input = document.querySelector(`[data-edit-topic-input="${subjectId}-${topicId}"]`);
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  updateTopic(subjectId, topicId, name);
  editingTopicKey = null;
  showToast('論点を更新しました');
  renderSettings();
  renderRegisterForm();
}

function renderSubjectHeader(subject, isEditingThis) {
  if (isEditingThis) {
    return `
      <div class="inline-edit" data-action="stop-propagation">
        <input
          type="text"
          class="inline-edit__input"
          data-edit-subject-input="${subject.id}"
          value="${escapeHtml(subject.name)}"
          autocomplete="off"
        >
        <div class="inline-edit__actions">
          <button type="button" class="inline-edit__btn inline-edit__btn--save" data-action="save-subject" data-subject-id="${subject.id}">保存</button>
          <button type="button" class="inline-edit__btn inline-edit__btn--cancel" data-action="cancel-subject-edit">キャンセル</button>
        </div>
      </div>
    `;
  }
  return `<span class="settings-subject-name">${escapeHtml(subject.name)}</span>`;
}

function renderTopicRow(subject, topic) {
  const topicKey = `${subject.id}:${topic.id}`;
  const topicColor = getTopicDisplayColor(topic, getTopicGlobalIndex(topic.id));
  if (editingTopicKey === topicKey) {
    return `
      <div class="topic-row topic-row--editing" data-subject-id="${subject.id}" data-topic-id="${topic.id}">
        <div class="inline-edit inline-edit--topic" data-action="stop-propagation">
          <input
            type="text"
            class="inline-edit__input"
            data-edit-topic-input="${subject.id}-${topic.id}"
            value="${escapeHtml(topic.name)}"
            autocomplete="off"
          >
          <div class="inline-edit__actions">
            <button type="button" class="inline-edit__btn inline-edit__btn--save" data-action="save-topic" data-subject-id="${subject.id}" data-topic-id="${topic.id}">保存</button>
            <button type="button" class="inline-edit__btn inline-edit__btn--cancel" data-action="cancel-topic-edit">キャンセル</button>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="topic-row" data-subject-id="${subject.id}" data-topic-id="${topic.id}">
      <label class="topic-color-picker" title="色を選択">
        <input
          type="color"
          class="topic-color-input"
          value="${topicColor}"
          data-subject-id="${subject.id}"
          data-topic-id="${topic.id}"
          aria-label="${escapeHtml(topic.name)}の色を選択"
        >
        <span class="topic-color-swatch" style="background:${topicColor}"></span>
      </label>
      <span class="topic-name">${escapeHtml(topic.name)}</span>
      <div class="topic-actions">
        <button class="icon-btn" data-action="edit-topic" type="button" title="名前を編集" onclick="startTopicEdit('${subject.id}','${topic.id}')">✏️</button>
        <button class="icon-btn" data-action="delete-topic" type="button" title="削除">🗑️</button>
      </div>
    </div>
  `;
}

function bindTopicColorInputs() {
  document.querySelectorAll('.topic-color-input').forEach((input) => {
    if (input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('input', (e) => {
      e.stopPropagation();
      const { subjectId, topicId } = input.dataset;
      if (!subjectId || !topicId) return;
      updateTopicColor(subjectId, topicId, input.value);
      const swatch = input.parentElement?.querySelector('.topic-color-swatch');
      if (swatch) swatch.style.background = input.value;
      refreshAllViews();
    });
    input.addEventListener('click', (e) => e.stopPropagation());
  });
}

function bindInlineEditInputs() {
  document.querySelectorAll('.inline-edit__input').forEach((input) => {
    if (input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('compositionstart', () => { isComposing = true; });
    input.addEventListener('compositionend', () => { isComposing = false; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });
    input.addEventListener('click', (e) => e.stopPropagation());
    setTimeout(() => input.focus(), 50);
  });
}

function getActionElement(e) {
  const node = e.target;
  if (node instanceof Element) return node.closest('[data-action]');
  if (node && node.parentElement) return node.parentElement.closest('[data-action]');
  return null;
}

function handleSettingsClick(e) {
  const actionEl = getActionElement(e);
  if (!actionEl) return;

  const action = actionEl.getAttribute('data-action');
  if (action === 'stop-propagation') {
    e.stopPropagation();
    return;
  }

  const card = actionEl.closest('.settings-card');
  const subjectId = actionEl.dataset.subjectId || card?.dataset?.subjectId;
  const topicRow = actionEl.closest('.topic-row');
  const topicId = actionEl.dataset.topicId || topicRow?.dataset?.topicId;

  switch (action) {
    case 'edit-subject':
      e.preventDefault();
      e.stopPropagation();
      if (subjectId) startSubjectEdit(subjectId);
      break;
    case 'save-subject':
      e.preventDefault();
      e.stopPropagation();
      if (actionEl.dataset.subjectId) saveSubjectEdit(actionEl.dataset.subjectId);
      break;
    case 'cancel-subject-edit':
      e.preventDefault();
      e.stopPropagation();
      cancelSubjectEdit();
      break;
    case 'delete-subject':
      e.preventDefault();
      e.stopPropagation();
      if (!subjectId) break;
      {
        const subject = getSubjectById(subjectId);
        if (subject && confirm(`「${subject.name}」とすべての論点を削除しますか？`)) {
          deleteSubject(subjectId);
          if (expandedSubjectId === subjectId) expandedSubjectId = null;
          editingSubjectId = null;
          showToast('科目を削除しました');
          renderSettings();
          renderRegisterForm();
        }
      }
      break;
    case 'toggle':
      if (editingSubjectId || editingTopicKey) return;
      e.stopPropagation();
      if (!subjectId) break;
      expandedSubjectId = expandedSubjectId === subjectId ? null : subjectId;
      renderSettings();
      break;
    case 'edit-topic':
      e.preventDefault();
      e.stopPropagation();
      if (subjectId && topicId) startTopicEdit(subjectId, topicId);
      break;
    case 'save-topic':
      e.preventDefault();
      e.stopPropagation();
      if (actionEl.dataset.subjectId && actionEl.dataset.topicId) {
        saveTopicEdit(actionEl.dataset.subjectId, actionEl.dataset.topicId);
      }
      break;
    case 'cancel-topic-edit':
      e.preventDefault();
      e.stopPropagation();
      cancelTopicEdit();
      break;
    case 'delete-topic':
      e.preventDefault();
      e.stopPropagation();
      if (!subjectId || !topicId) break;
      {
        const topic = getTopicsBySubjectId(subjectId).find((t) => t.id === topicId);
        if (topic && confirm(`「${topic.name}」を削除しますか？`)) {
          deleteTopic(subjectId, topicId);
          showToast('論点を削除しました');
          renderSettings();
          renderRegisterForm();
        }
      }
      break;
    case 'add-topic':
      e.preventDefault();
      e.stopPropagation();
      if (!subjectId) break;
      openModal('論点を追加', '', (name) => {
        addTopic(subjectId, name);
        expandedSubjectId = subjectId;
        showToast('論点を追加しました');
        renderSettings();
        renderRegisterForm();
      });
      break;
    default:
      break;
  }
}

function bindEditSubjectButtons() {
  document.querySelectorAll('#settings-list [data-action="edit-subject"]').forEach((btn) => {
    const id = btn.getAttribute('data-subject-id')
      || btn.closest('.settings-card')?.getAttribute('data-subject-id');
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (id) startSubjectEdit(id);
    };
  });
}

function initSettingsEvents() {
  const list = document.getElementById('settings-list');
  const sheet = document.getElementById('edit-sheet');
  if (!list || list.dataset.eventsBound) return;
  list.dataset.eventsBound = '1';
  list.addEventListener('click', handleSettingsClick);
  if (sheet) {
    sheet.addEventListener('click', (e) => e.stopPropagation());
  }
}

function renderSettings() {
  const container = document.getElementById('settings-list');
  if (!container) return;
  const subjects = getSubjects();

  if (subjects.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:32px 16px">
        <h2>科目がありません</h2>
        <p>下のボタンから科目を追加してください</p>
      </div>
    `;
    return;
  }

  container.innerHTML = subjects
    .map((subject) => {
      const topics = getTopicsBySubjectId(subject.id);
      const isOpen = expandedSubjectId === subject.id;
      const isEditingThis = editingSubjectId === subject.id;
      const topicsHtml = topics.map((topic) => renderTopicRow(subject, topic)).join('');

      return `
        <div class="settings-card" data-subject-id="${subject.id}">
          <div class="settings-card-header"${isEditingThis ? '' : ' data-action="toggle"'}>
            ${renderSubjectHeader(subject, isEditingThis)}
            ${isEditingThis ? '' : `<span class="settings-topic-count">${topics.length}論点</span><span class="chevron ${isOpen ? 'open' : ''}">›</span>`}
          </div>
          <div class="settings-card-actions"${isEditingThis ? ' hidden' : ''}>
            <button class="text-btn" data-action="edit-subject" data-subject-id="${subject.id}" type="button" onclick="startSubjectEdit('${subject.id}')">名前を編集</button>
            <button class="text-btn danger" data-action="delete-subject" type="button">削除</button>
          </div>
          <div class="settings-card-body ${isOpen ? 'open' : ''}">
            ${topics.length > 0 ? `<div class="topic-list">${topicsHtml}</div>` : '<p class="no-topics">論点がありません</p>'}
            <button class="add-topic-btn" data-action="add-topic" type="button">＋ 論点を追加</button>
          </div>
        </div>
      `;
    })
    .join('');

  bindInlineEditInputs();
  bindEditSubjectButtons();
  bindTopicColorInputs();
  renderExamSettings();
}

/* ── 初期化 ── */

function init() {
  if (headerDate) headerDate.textContent = formatTodayDate();

  const registerForm = document.getElementById('register-form');
  if (registerForm) registerForm.addEventListener('submit', handleRegister);
  if (subjectSelect) {
    subjectSelect.addEventListener('change', () => updateTopicSelect(subjectSelect.value));
  }

  const openEditBtn = document.getElementById('open-edit-btn');
  const openLecturesBtn = document.getElementById('open-lectures-btn');
  const closeEditBtn = document.getElementById('close-edit-btn');
  const closeLecturesBtn = document.getElementById('close-lectures-btn');
  const lecturesSheet = document.getElementById('lectures-sheet');

  if (!editOverlay) {
    console.error('edit-overlay element not found');
  } else {
    editOverlay.addEventListener('click', (e) => {
      if (e.target !== editOverlay) return;
      closeEditPanel();
    });
  }

  initSettingsEvents();

  window.addEventListener('error', (ev) => {
    console.error('[app] uncaught error:', ev.message, ev.filename, ev.lineno);
  });

  if (openEditBtn) {
    openEditBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openEditPanel();
    });
  } else {
    console.error('open-edit-btn element not found');
  }

  if (closeEditBtn) {
    closeEditBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeEditPanel();
    });
  }

  if (openLecturesBtn) {
    openLecturesBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openLecturesPanel();
    });
  }

  if (lecturesOverlay) {
    lecturesOverlay.addEventListener('click', (e) => {
      if (e.target !== lecturesOverlay) return;
      closeLecturesPanel();
    });
  }

  if (lecturesSheet) {
    lecturesSheet.addEventListener('click', (e) => e.stopPropagation());
  }

  if (closeLecturesBtn) {
    closeLecturesBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeLecturesPanel();
    });
  }

  const addSubjectBtn = document.getElementById('add-subject-btn');
  if (addSubjectBtn) {
    addSubjectBtn.addEventListener('click', () => {
      openModal('科目を追加', '', (name) => {
        const subject = addSubject(name);
        expandedSubjectId = subject.id;
        showToast('科目を追加しました');
        renderSettings();
        renderRegisterForm();
      });
    });
  }

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', saveModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  modalInput.addEventListener('compositionstart', () => { isComposing = true; });
  modalInput.addEventListener('compositionend', () => { isComposing = false; });

  if (lectureEditSubject) {
    lectureEditSubject.addEventListener('change', () => {
      populateLectureEditTopicSelect(lectureEditSubject.value, null);
    });
  }
  document.getElementById('lecture-edit-cancel')?.addEventListener('click', closeLectureEditModal);
  document.getElementById('lecture-edit-save')?.addEventListener('click', saveLectureEdit);
  document.getElementById('lecture-edit-delete')?.addEventListener('click', deleteLectureEdit);
  document.getElementById('lecture-history-add')?.addEventListener('click', addReviewHistoryRow);

  document.getElementById('priority-show-more')?.addEventListener('click', () => {
    priorityShowAll = true;
    renderPriorityRanking();
  });

  try {
    renderToday();
    renderPriorityRanking();
    renderExamCountdown();
    renderRegisterForm();
    initGraphUI();
    initBackupUI();
    initExamUI();
  } catch (err) {
    console.error('init render failed:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
