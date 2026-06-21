const STORAGE_KEY = 'cpa-review-schedule';
const INTERVALS = [1, 7, 14, 30];
const LEGACY_INTERVAL_INDEX_MAP = { 0: 0, 2: 1, 3: 2, 4: 3 };

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getToday() {
  return formatDate(new Date());
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function addMonths(dateStr, months) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setMonth(date.getMonth() + months);
  return formatDate(date);
}

function buildAllFixedReviewDates(attendedDate, throughDate) {
  const dates = [
    addDays(attendedDate, INTERVALS[0]),
    addDays(attendedDate, INTERVALS[1]),
    addDays(attendedDate, INTERVALS[2]),
    addMonths(attendedDate, 1),
  ];
  const today = getToday();
  const target = throughDate > today ? throughDate : today;
  while (dates[dates.length - 1] <= target) {
    dates.push(addMonths(dates[dates.length - 1], 1));
  }
  return dates;
}

function getReviewScheduleHorizon(data) {
  const today = getToday();
  let horizon = addMonths(today, 12);
  (data?.lectures || []).forEach((lecture) => {
    const candidate = addMonths(lecture.attendedDate, 24);
    if (candidate > horizon) horizon = candidate;
  });
  return horizon;
}

function getDefaultSubjects() {
  const auditTopics = [
    '監査基準', '職業倫理', '独立性', 'リスク評価手続',
    '監査手続', '監査報告書', 'KAM', '不正リスク対応基準',
  ];
  const subjectNames = [
    '財務会計論', '管理会計論', '監査論', '企業法', '租税法', '経営学',
  ];

  return subjectNames.map((name, i) => ({
    id: generateId(),
    name,
    order: i,
    topics: name === '監査論'
      ? auditTopics.map((t, j) => ({ id: generateId(), name: t, order: j }))
      : [],
  }));
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { lectures: [], reviews: [], subjects: getDefaultSubjects(), exams: [], selectedExamIndex: 0 };
    }
    const data = JSON.parse(raw);
    if (!data.lectures) data.lectures = [];
    if (!data.reviews) data.reviews = [];
    if (!data.exams) {
      data.exams = [];
      migrated = true;
    }
    if (data.selectedExamIndex == null) {
      data.selectedExamIndex = 0;
      migrated = true;
    }
    if (!data.subjects) {
      data.subjects = getDefaultSubjects();
      saveData(data);
    }
    let migrated = false;
    data.subjects.forEach((s, i) => {
      if (!s.topics) s.topics = [];
      if (!s.id) {
        s.id = generateId();
        migrated = true;
      }
      if (s.order == null) {
        s.order = i;
        migrated = true;
      }
      s.topics.forEach((t, j) => {
        if (!t.id) {
          t.id = generateId();
          migrated = true;
        }
        if (t.order == null) {
          t.order = j;
          migrated = true;
        }
      });
    });
    let resultMigrated = false;
    data.reviews.forEach((r) => {
      if ((r.result === 'forgot' || r.result === 'normal') && r.status !== 'completed') {
        r.status = 'completed';
        if (!r.completedAt) r.completedAt = new Date().toISOString();
        resultMigrated = true;
      }
      const mapped = normalizeReviewResult(r.result);
      if (r.result && mapped !== r.result) {
        r.result = mapped;
        resultMigrated = true;
      }
    });
    data.lectures.forEach((lecture) => {
      if (!lecture.reviewHistory) {
        lecture.reviewHistory = [];
        resultMigrated = true;
      }
      const completedReviews = data.reviews.filter(
        (r) => r.lectureId === lecture.id && r.status === 'completed' && r.result
      );
      completedReviews.forEach((r) => {
        const reviewDate = r.completedAt ? formatDate(new Date(r.completedAt)) : r.scheduledDate;
        const exists = lecture.reviewHistory.some((h) => h.reviewDate === reviewDate);
        if (!exists) {
          lecture.reviewHistory.push({
            id: generateId(),
            reviewDate,
            result: normalizeReviewResult(r.result),
          });
          resultMigrated = true;
        }
      });
      lecture.reviewHistory.sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
    });
    if (migrated || resultMigrated) saveData(data);
    if (migrateReviewIntervals(data)) saveData(data);
    if (data.exams.length > 0) {
      data.selectedExamIndex = Math.min(
        Math.max(0, data.selectedExamIndex),
        data.exams.length - 1
      );
    } else {
      data.selectedExamIndex = 0;
    }
    return data;
  } catch {
    return { lectures: [], reviews: [], subjects: getDefaultSubjects(), exams: [], selectedExamIndex: 0 };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function syncLectureReviewsFromSchedule(data, lecture, throughDate) {
  const dates = buildAllFixedReviewDates(lecture.attendedDate, throughDate);
  const existing = data.reviews.filter((r) => r.lectureId === lecture.id);
  const usedIds = new Set();
  const synced = [];
  let migrated = false;

  dates.forEach((scheduledDate, index) => {
    const match =
      existing.find((r) => r.intervalIndex === index && !usedIds.has(r.id)) ||
      (index < INTERVALS.length
        ? existing.find(
            (r) =>
              LEGACY_INTERVAL_INDEX_MAP[r.intervalIndex] === index && !usedIds.has(r.id)
          )
        : null);

    if (match) {
      usedIds.add(match.id);
      if (match.intervalIndex !== index || match.scheduledDate !== scheduledDate) {
        migrated = true;
      }
      synced.push({
        ...match,
        intervalIndex: index,
        scheduledDate,
      });
    } else {
      migrated = true;
      synced.push({
        id: generateId(),
        lectureId: lecture.id,
        scheduledDate,
        intervalIndex: index,
        status: 'pending',
        result: null,
        completedAt: null,
      });
    }
  });

  if (existing.length !== synced.length) migrated = true;

  data.reviews = [...data.reviews.filter((r) => r.lectureId !== lecture.id), ...synced];
  return migrated;
}

function migrateReviewIntervals(data) {
  const lectureIds = new Set(data.lectures.map((l) => l.id));
  const beforeLength = data.reviews.length;
  data.reviews = data.reviews.filter((r) => lectureIds.has(r.lectureId));
  let migrated = data.reviews.length !== beforeLength;

  const throughDate = getReviewScheduleHorizon(data);
  data.lectures.forEach((lecture) => {
    if (syncLectureReviewsFromSchedule(data, lecture, throughDate)) migrated = true;
  });
  return migrated;
}

const BACKUP_VERSION = 1;

function createBackupPayload() {
  const data = loadData();
  return {
    version: BACKUP_VERSION,
    app: STORAGE_KEY,
    exportedAt: new Date().toISOString(),
    data: {
      subjects: data.subjects,
      lectures: data.lectures,
      reviews: data.reviews,
      exams: data.exams || [],
      selectedExamIndex: data.selectedExamIndex ?? 0,
      curveDisplayPeriod: data.curveDisplayPeriod ?? 90,
    },
  };
}

function validateBackupPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  if (!Array.isArray(data.subjects)) return null;
  return {
    subjects: data.subjects,
    lectures: Array.isArray(data.lectures) ? data.lectures : [],
    reviews: Array.isArray(data.reviews) ? data.reviews : [],
    exams: Array.isArray(data.exams) ? data.exams : [],
    selectedExamIndex: Number.isInteger(data.selectedExamIndex) ? data.selectedExamIndex : 0,
    curveDisplayPeriod: data.curveDisplayPeriod ?? 90,
  };
}

function restoreBackupData(data) {
  saveData(data);
  loadData();
  return true;
}

/* ── 試験日 ── */

function getExams() {
  return [...(loadData().exams || [])];
}

function getSelectedExamIndex() {
  const data = loadData();
  if (!data.exams?.length) return 0;
  return Math.min(Math.max(0, data.selectedExamIndex ?? 0), data.exams.length - 1);
}

function getSelectedExam() {
  const exams = getExams();
  if (!exams.length) return null;
  return exams[getSelectedExamIndex()] || null;
}

function setSelectedExamIndex(index) {
  const data = loadData();
  if (!data.exams?.length) return;
  data.selectedExamIndex = Math.min(Math.max(0, index), data.exams.length - 1);
  saveData(data);
}

function cycleSelectedExam() {
  const data = loadData();
  if (!data.exams?.length) return null;
  const next = (getSelectedExamIndex() + 1) % data.exams.length;
  data.selectedExamIndex = next;
  saveData(data);
  return data.exams[next];
}

function formatExamDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function getExamCountdownInfo(exam) {
  const today = getToday();
  const diff = daysBetween(today, exam.examDate);

  if (diff > 0) {
    return {
      status: 'upcoming',
      mainLabel: `あと ${diff} 日`,
      dateLabel: formatExamDateDisplay(exam.examDate),
      suffix: 'まで',
    };
  }
  if (diff === 0) {
    return {
      status: 'today',
      mainLabel: 'あと 0 日',
      dateLabel: formatExamDateDisplay(exam.examDate),
      suffix: 'まで',
    };
  }
  const passed = Math.abs(diff);
  return {
    status: 'past',
    mainLabel: '終了',
    dateLabel: formatExamDateDisplay(exam.examDate),
    suffix: `${passed}日前に終了`,
  };
}

function addExam(name, examDate) {
  const data = loadData();
  const trimmed = name.trim();
  if (!trimmed || !examDate) return null;
  const exam = { id: generateId(), name: trimmed, examDate };
  data.exams.push(exam);
  saveData(data);
  return exam;
}

function updateExam(examId, { name, examDate }) {
  const data = loadData();
  const exam = data.exams.find((e) => e.id === examId);
  if (!exam) return false;
  if (name != null) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    exam.name = trimmed;
  }
  if (examDate) exam.examDate = examDate;
  saveData(data);
  return true;
}

function deleteExam(examId) {
  const data = loadData();
  const idx = data.exams.findIndex((e) => e.id === examId);
  if (idx === -1) return false;
  data.exams.splice(idx, 1);
  if (data.selectedExamIndex >= data.exams.length) {
    data.selectedExamIndex = 0;
  }
  saveData(data);
  return true;
}

const CURVE_DISPLAY_PERIODS = [10, 20, 30, 60, 90, 180, 365, 'all'];

function getCurveDisplayPeriod() {
  const period = loadData().curveDisplayPeriod;
  return CURVE_DISPLAY_PERIODS.includes(period) ? period : 90;
}

function setCurveDisplayPeriod(period) {
  if (!CURVE_DISPLAY_PERIODS.includes(period)) return false;
  const data = loadData();
  data.curveDisplayPeriod = period;
  saveData(data);
  return true;
}

function getCurveDisplayMaxDay(fullMaxDay) {
  const period = getCurveDisplayPeriod();
  return period === 'all' ? fullMaxDay : period;
}

function getCurvePeriodLabel(period) {
  const p = period ?? getCurveDisplayPeriod();
  return p === 'all' ? '全期間' : `${p}日`;
}

/* ── 科目・論点 ── */

function getSubjects() {
  const data = loadData();
  return [...data.subjects].sort((a, b) => a.order - b.order);
}

function getSubjectById(subjectId) {
  return getSubjects().find((s) => s.id === subjectId) || null;
}

function addSubject(name) {
  const data = loadData();
  const trimmed = name.trim();
  if (!trimmed) return null;
  const maxOrder = data.subjects.reduce((m, s) => Math.max(m, s.order), -1);
  const subject = { id: generateId(), name: trimmed, order: maxOrder + 1, topics: [] };
  data.subjects.push(subject);
  saveData(data);
  return subject;
}

function updateSubject(subjectId, name) {
  const data = loadData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (!subject) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  subject.name = trimmed;
  saveData(data);
  return true;
}

function deleteSubject(subjectId) {
  const data = loadData();
  const idx = data.subjects.findIndex((s) => s.id === subjectId);
  if (idx === -1) return false;
  data.subjects.splice(idx, 1);
  saveData(data);
  return true;
}

function addTopic(subjectId, name) {
  const data = loadData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (!subject) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const maxOrder = subject.topics.reduce((m, t) => Math.max(m, t.order), -1);
  const topic = { id: generateId(), name: trimmed, order: maxOrder + 1 };
  subject.topics.push(topic);
  saveData(data);
  return topic;
}

function updateTopic(subjectId, topicId, name) {
  const data = loadData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (!subject) return false;
  const topic = subject.topics.find((t) => t.id === topicId);
  if (!topic) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  topic.name = trimmed;
  saveData(data);
  return true;
}

function deleteTopic(subjectId, topicId) {
  const data = loadData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (!subject) return false;
  const idx = subject.topics.findIndex((t) => t.id === topicId);
  if (idx === -1) return false;
  subject.topics.splice(idx, 1);
  saveData(data);
  return true;
}

function moveTopic(subjectId, topicId, direction) {
  const data = loadData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (!subject) return false;
  const sorted = [...subject.topics].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((t) => t.id === topicId);
  if (idx === -1) return false;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return false;
  const tmp = sorted[idx].order;
  sorted[idx].order = sorted[swapIdx].order;
  sorted[swapIdx].order = tmp;
  saveData(data);
  return true;
}

function getTopicsBySubjectId(subjectId) {
  const subject = getSubjectById(subjectId);
  if (!subject) return [];
  return [...subject.topics].sort((a, b) => a.order - b.order);
}

function getTopicGlobalIndex(topicId) {
  let index = 0;
  for (const subject of getSubjects()) {
    for (const topic of getTopicsBySubjectId(subject.id)) {
      if (topic.id === topicId) return index;
      index += 1;
    }
  }
  return 0;
}

function getTopicDisplayColor(topic, fallbackIndex) {
  if (topic?.color) return topic.color;
  return getTopicColor(fallbackIndex);
}

function findTopicForLecture(lecture) {
  if (!lecture) return null;
  const data = loadData();
  const subject = data.subjects.find((s) => s.name === lecture.subject);
  if (!subject) return null;
  const topic = subject.topics?.find((t) => t.name === lecture.topic);
  if (!topic) return null;
  return { subject, topic };
}

function getLectureTopicColor(lecture, fallbackIndex = 0) {
  const match = findTopicForLecture(lecture);
  if (!match) return getTopicColor(fallbackIndex);
  return getTopicDisplayColor(match.topic, getTopicGlobalIndex(match.topic.id));
}

function updateTopicColor(subjectId, topicId, color) {
  const data = loadData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  const topic = subject?.topics?.find((t) => t.id === topicId);
  if (!subject || !topic || !color) return false;
  topic.color = color;
  saveData(data);
  return true;
}

/* ── 講義・復習 ── */

function registerLecture({ subject, topic, lectureName, attendedDate }) {
  const data = loadData();
  const lectureId = generateId();
  const subjectName = subject.trim();
  const topicName = topic.trim();
  const name = (lectureName || `${subjectName} ${topicName}`).trim();

  data.lectures.push({
    id: lectureId,
    subject: subjectName,
    topic: topicName,
    lectureName: name,
    attendedDate,
    reviewHistory: [],
  });

  syncLectureReviewsFromSchedule(
    data,
    data.lectures[data.lectures.length - 1],
    getReviewScheduleHorizon(data)
  );

  saveData(data);
  return lectureId;
}

function getLectureById(lectureId) {
  return loadData().lectures.find((l) => l.id === lectureId) || null;
}

function getAllLectures() {
  const data = loadData();
  return [...data.lectures].sort((a, b) => b.attendedDate.localeCompare(a.attendedDate));
}

function getLectureEditInfo(lectureId) {
  const lecture = getLectureById(lectureId);
  if (!lecture) return null;
  const subject = getSubjects().find((s) => s.name === lecture.subject);
  if (!subject) return null;
  const topic = getTopicsBySubjectId(subject.id).find((t) => t.name === lecture.topic);
  return {
    lecture,
    subjectId: subject.id,
    topicId: topic ? topic.id : null,
  };
}

function getLectureReviewHistory(lectureId) {
  const lecture = getLectureById(lectureId);
  if (!lecture || !lecture.reviewHistory) return [];
  return [...lecture.reviewHistory].sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
}

function normalizeReviewHistoryEntries(entries) {
  return entries
    .filter((e) => e.reviewDate && REVIEW_RESULTS.includes(normalizeReviewResult(e.result)))
    .map((e) => ({
      id: e.id && !String(e.id).startsWith('new-') ? e.id : generateId(),
      reviewDate: e.reviewDate,
      result: normalizeReviewResult(e.result),
    }))
    .sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
}

function upsertReviewHistoryEntry(lecture, reviewDate, result) {
  if (!lecture.reviewHistory) lecture.reviewHistory = [];
  const normalized = normalizeReviewResult(result);
  const existing = lecture.reviewHistory.find((h) => h.reviewDate === reviewDate);
  if (existing) {
    existing.result = normalized;
  } else {
    lecture.reviewHistory.push({
      id: generateId(),
      reviewDate,
      result: normalized,
    });
  }
  lecture.reviewHistory.sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
}

function updateLecture(lectureId, { subjectId, topicId, attendedDate, reviewHistory }) {
  const data = loadData();
  const lecture = data.lectures.find((l) => l.id === lectureId);
  if (!lecture) return false;

  const subject = data.subjects.find((s) => s.id === subjectId);
  const topic = subject?.topics?.find((t) => t.id === topicId);
  if (!subject || !topic || !attendedDate) return false;

  lecture.subject = subject.name;
  lecture.topic = topic.name;
  lecture.lectureName = `${subject.name} ${topic.name}`;
  lecture.attendedDate = attendedDate;

  if (reviewHistory !== undefined) {
    lecture.reviewHistory = normalizeReviewHistoryEntries(reviewHistory);
  }

  syncLectureReviewsFromSchedule(data, lecture, getReviewScheduleHorizon(data));

  saveData(data);
  return true;
}

function deleteLecture(lectureId) {
  const data = loadData();
  const idx = data.lectures.findIndex((l) => l.id === lectureId);
  if (idx === -1) return false;
  data.lectures.splice(idx, 1);
  data.reviews = data.reviews.filter((r) => r.lectureId !== lectureId);
  saveData(data);
  return true;
}

function getTodayReviews() {
  const data = loadData();
  const today = getToday();
  const lectureMap = {};
  data.lectures.forEach((l) => {
    lectureMap[l.id] = l;
  });

  return data.reviews
    .filter((r) => r.scheduledDate === today && r.status === 'pending')
    .map((r) => ({
      ...r,
      lecture: lectureMap[r.lectureId],
    }))
    .filter((r) => r.lecture)
    .sort((a, b) => a.lecture.subject.localeCompare(b.lecture.subject, 'ja'));
}

function getTodayDashboard() {
  const data = loadData();
  const today = getToday();
  const lectureMap = {};
  data.lectures.forEach((l) => {
    lectureMap[l.id] = l;
  });

  const todayReviews = data.reviews.filter((r) => r.scheduledDate === today);
  const completed = todayReviews.filter((r) => r.status === 'completed');
  const pending = todayReviews.filter((r) => r.status === 'pending');

  const subjectCounts = {};
  todayReviews.forEach((r) => {
    const lecture = lectureMap[r.lectureId];
    if (!lecture) return;
    subjectCounts[lecture.subject] = (subjectCounts[lecture.subject] || 0) + 1;
  });

  return {
    total: todayReviews.length,
    completed: completed.length,
    pending: pending.length,
    subjectCounts,
  };
}

const REVIEW_RESULTS = ['good', 'ok', 'bad'];
const BASE_HALF_LIFE = 7;
const RESULT_SCORES = { good: 1, ok: 0, bad: -1 };

function normalizeReviewResult(result) {
  if (result === 'perfect') return 'good';
  if (result === 'normal') return 'ok';
  if (result === 'forgot') return 'bad';
  return result;
}

function getRecoveryRetention(result) {
  const r = normalizeReviewResult(result);
  if (r === 'good') return 95;
  if (r === 'ok') return 72;
  if (r === 'bad') return 48;
  return 100;
}

function computeDecayHalfLife(completedResults) {
  if (completedResults.length === 0) return BASE_HALF_LIFE;

  let weightedSum = 0;
  let weight = 0;
  completedResults.forEach((result, i) => {
    const recency = Math.pow(0.82, completedResults.length - 1 - i);
    weightedSum += RESULT_SCORES[normalizeReviewResult(result)] * recency;
    weight += recency;
  });

  const avgScore = weightedSum / weight;
  const multiplier = Math.pow(1.55, avgScore);
  return Math.max(3, Math.min(28, BASE_HALF_LIFE * multiplier));
}

function submitReview(reviewId, result) {
  const normalized = normalizeReviewResult(result);
  if (!REVIEW_RESULTS.includes(normalized)) return false;

  const data = loadData();
  const review = data.reviews.find((r) => r.id === reviewId);
  if (!review || review.status === 'completed') return false;

  review.status = 'completed';
  review.result = normalized;
  review.completedAt = new Date().toISOString();

  const lecture = data.lectures.find((l) => l.id === review.lectureId);
  if (lecture) {
    upsertReviewHistoryEntry(lecture, getToday(), normalized);
    syncLectureReviewsFromSchedule(data, lecture, getReviewScheduleHorizon(data));
  }

  saveData(data);
  return true;
}

function submitLectureReview(lectureId, result) {
  const data = loadData();
  const today = getToday();
  const todayPending = data.reviews.find(
    (r) => r.lectureId === lectureId && r.scheduledDate === today && r.status === 'pending'
  );
  if (todayPending) return submitReview(todayPending.id, result);

  const normalized = normalizeReviewResult(result);
  if (!REVIEW_RESULTS.includes(normalized)) return false;

  const lecture = data.lectures.find((l) => l.id === lectureId);
  if (!lecture) return false;

  upsertReviewHistoryEntry(lecture, today, normalized);

  const pending = data.reviews
    .filter((r) => r.lectureId === lectureId && r.status === 'pending')
    .sort((a, b) => a.intervalIndex - b.intervalIndex);

  const overdue = pending.find((r) => r.scheduledDate <= today);
  if (overdue) {
    overdue.status = 'completed';
    overdue.result = normalized;
    overdue.completedAt = new Date().toISOString();
  }

  syncLectureReviewsFromSchedule(data, lecture, getReviewScheduleHorizon(data));

  saveData(data);
  return true;
}

/* ── グラフ用データ ── */

function getForgettingTimelineOrigin() {
  const data = loadData();
  const today = getToday();
  if (data.lectures.length === 0) {
    return { originDate: today, todayDay: 0 };
  }
  const minDate = data.lectures.reduce(
    (min, l) => (l.attendedDate < min ? l.attendedDate : min),
    data.lectures[0].attendedDate
  );
  return { originDate: minDate, todayDay: daysBetween(minDate, today) };
}

function getCurrentRetentionForLecture(lecture) {
  const { originDate, todayDay } = getForgettingTimelineOrigin();
  const reviewHistory = lecture.reviewHistory || [];
  return simulateRetentionAtDay(lecture.attendedDate, todayDay, reviewHistory, originDate);
}

function getRetentionDangerLevel(retention) {
  const value = Math.round(retention);
  if (value >= 80) return { level: 'safe', label: '安全' };
  if (value >= 50) return { level: 'caution', label: '注意' };
  if (value >= 30) return { level: 'medium', label: '中' };
  return { level: 'critical', label: '高' };
}

function getLastReviewLabel(lecture) {
  const history = [...(lecture.reviewHistory || [])].sort(
    (a, b) => a.reviewDate.localeCompare(b.reviewDate)
  );
  const today = getToday();
  if (history.length === 0) {
    const days = daysBetween(lecture.attendedDate, today);
    return days === 0 ? '受講当日' : `受講から${days}日`;
  }
  const last = history[history.length - 1];
  const days = daysBetween(last.reviewDate, today);
  if (days === 0) return '今日';
  return `${days}日前`;
}

function getPriorityRanking() {
  const data = loadData();
  return data.lectures
    .map((lecture, index) => {
      const retention = getCurrentRetentionForLecture(lecture);
      const rounded = Math.round(retention);
      return {
        lectureId: lecture.id,
        subject: lecture.subject,
        topic: lecture.topic,
        retention: rounded,
        danger: getRetentionDangerLevel(rounded),
        lastReviewLabel: getLastReviewLabel(lecture),
        color: getLectureTopicColor(lecture, index),
      };
    })
    .sort((a, b) => a.retention - b.retention);
}

function daysBetween(fromDateStr, toDateStr) {
  const from = new Date(fromDateStr + 'T00:00:00');
  const to = new Date(toDateStr + 'T00:00:00');
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getRetentionRate(days, halfLife = BASE_HALF_LIFE) {
  return 100 * Math.exp(-days / halfLife);
}

function simulateRetentionAtDay(attendedDate, chartDayOffset, reviewHistory, originDate) {
  const attendedOffset = daysBetween(originDate, attendedDate);
  if (chartDayOffset < attendedOffset) return null;

  const events = [...reviewHistory]
    .sort((a, b) => a.reviewDate.localeCompare(b.reviewDate))
    .map((h) => ({
      day: daysBetween(originDate, h.reviewDate),
      result: normalizeReviewResult(h.result),
    }))
    .filter((e) => e.day >= attendedOffset && e.day <= chartDayOffset);

  let day = attendedOffset;
  let retention = 100;
  let halfLife = BASE_HALF_LIFE;
  const history = [];

  for (const event of events) {
    if (event.day > day) {
      retention = getRetentionRate(event.day - day, halfLife) * (retention / 100);
      day = event.day;
    }
    history.push(event.result);
    retention = getRecoveryRetention(event.result);
    halfLife = computeDecayHalfLife(history);
  }

  if (chartDayOffset > day) {
    retention = getRetentionRate(chartDayOffset - day, halfLife) * (retention / 100);
  }

  return Math.max(2, Math.min(100, retention));
}

function simulateRetentionBeforeDay(attendedDate, chartDayOffset, reviewHistory, originDate) {
  const priorHistory = reviewHistory.filter(
    (h) => daysBetween(originDate, h.reviewDate) < chartDayOffset
  );
  return simulateRetentionAtDay(attendedDate, chartDayOffset, priorHistory, originDate);
}

const SUBJECT_COLORS = [
  '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF3B30', '#5AC8FA',
  '#FF2D55', '#5856D6', '#00C7BE', '#A2845E',
];

function getSubjectColor(subject, colorMap) {
  if (!colorMap[subject]) {
    const idx = Object.keys(colorMap).length % SUBJECT_COLORS.length;
    colorMap[subject] = SUBJECT_COLORS[idx];
  }
  return colorMap[subject];
}

function applyColorAlpha(hex, alpha) {
  if (!hex || !hex.startsWith('#')) return hex;
  const raw = hex.length === 4
    ? hex.slice(1).split('').map((c) => c + c).join('')
    : hex.slice(1);
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getDailyReviewData() {
  const data = loadData();
  const today = getToday();
  const labels = [];
  const dates = [];
  const lectureMap = {};
  data.lectures.forEach((l) => {
    lectureMap[l.id] = l;
  });

  for (let i = 0; i < 30; i++) {
    const date = addDays(today, i);
    dates.push(date);
    labels.push(formatShortDate(date));
  }

  const topicSeries = new Map();

  dates.forEach((date, dayIdx) => {
    const reviews = data.reviews.filter(
      (r) => r.scheduledDate === date && r.status === 'pending'
    );
    reviews.forEach((r) => {
      const lecture = lectureMap[r.lectureId];
      if (!lecture) return;
      const match = findTopicForLecture(lecture);
      const seriesKey = match ? match.topic.id : `${lecture.subject}:${lecture.topic}`;
      const seriesLabel = match ? match.topic.name : lecture.topic;
      const color = getLectureTopicColor(lecture, topicSeries.size);

      if (!topicSeries.has(seriesKey)) {
        topicSeries.set(seriesKey, {
          label: seriesLabel,
          color,
          data: Array(30).fill(0),
        });
      }
      topicSeries.get(seriesKey).data[dayIdx] += 1;
    });
  });

  if (topicSeries.size === 0) {
    return {
      labels,
      datasets: [{
        label: '復習件数',
        data: Array(30).fill(0),
        backgroundColor: 'rgba(0, 122, 255, 0.45)',
        borderRadius: 6,
        borderSkipped: false,
      }],
      today: formatShortDate(today),
      stacked: false,
    };
  }

  const datasets = [...topicSeries.values()].map((series) => ({
    label: series.label,
    data: series.data,
    backgroundColor: applyColorAlpha(series.color, 0.78),
    borderRadius: 6,
    borderSkipped: false,
  }));

  return { labels, datasets, today: formatShortDate(today), stacked: true };
}

function getTopicColor(index) {
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

function getTopicLegendLabel(lecture) {
  return `${lecture.topic}（${formatShortDate(lecture.attendedDate)}受講）`;
}

function buildRetentionCurve(attendedOffset, attendedDate, reviewHistory, scheduledReviews, maxDay, originDate) {
  const curvePoints = [];
  for (let chartDay = attendedOffset; chartDay <= maxDay; chartDay++) {
    curvePoints.push({
      x: chartDay,
      y: simulateRetentionAtDay(attendedDate, chartDay, reviewHistory, originDate),
    });
  }

  const historyPoints = [...reviewHistory]
    .sort((a, b) => a.reviewDate.localeCompare(b.reviewDate))
    .map((h) => {
      const chartDay = daysBetween(originDate, h.reviewDate);
      return {
        x: chartDay,
        y: simulateRetentionAtDay(attendedDate, chartDay, reviewHistory, originDate),
        completed: true,
        result: normalizeReviewResult(h.result),
        round: null,
      };
    });

  const scheduledPoints = [...scheduledReviews]
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.intervalIndex - b.intervalIndex)
    .map((r) => {
      const chartDay = daysBetween(originDate, r.scheduledDate);
      return {
        x: chartDay,
        y: simulateRetentionBeforeDay(attendedDate, chartDay, reviewHistory, originDate),
        completed: false,
        result: null,
        round: r.intervalIndex + 1,
      };
    });

  return { curvePoints, reviewPoints: [...historyPoints, ...scheduledPoints] };
}

function getForgettingCurveData() {
  const data = loadData();
  const today = getToday();
  const horizonDays = 90;

  if (data.lectures.length === 0) {
    return { topics: [], maxDay: horizonDays, todayDay: 0, originDate: today };
  }

  const { originDate: minDate, todayDay } = getForgettingTimelineOrigin();

  let maxChartEnd = horizonDays;
  data.lectures.forEach((lecture) => {
    const attendedOffset = daysBetween(minDate, lecture.attendedDate);
    const reviews = data.reviews.filter((r) => r.lectureId === lecture.id);
    const reviewHistory = lecture.reviewHistory || [];
    reviews.forEach((r) => {
      maxChartEnd = Math.max(maxChartEnd, daysBetween(minDate, r.scheduledDate) + 14);
    });
    reviewHistory.forEach((h) => {
      maxChartEnd = Math.max(maxChartEnd, daysBetween(minDate, h.reviewDate) + 14);
    });
    maxChartEnd = Math.max(maxChartEnd, attendedOffset + horizonDays);
  });
  const maxDay = Math.max(maxChartEnd, todayDay + 7);

  const topics = data.lectures.map((lecture, index) => {
    const attendedOffset = daysBetween(minDate, lecture.attendedDate);
    const color = getLectureTopicColor(lecture, index);
    const reviews = data.reviews.filter((r) => r.lectureId === lecture.id);
    const reviewHistory = lecture.reviewHistory || [];
    const { curvePoints, reviewPoints } = buildRetentionCurve(
      attendedOffset,
      lecture.attendedDate,
      reviewHistory,
      reviews,
      maxDay,
      minDate
    );

    return {
      id: lecture.id,
      label: getTopicLegendLabel(lecture),
      subject: lecture.subject,
      topic: lecture.topic,
      attendedDate: lecture.attendedDate,
      color,
      attendedOffset,
      curvePoints,
      reviewPoints,
    };
  });

  return { topics, maxDay, todayDay, originDate: minDate };
}
