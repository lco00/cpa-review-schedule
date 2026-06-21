let dailyChart = null;
let curveChart = null;
let currentGraphTab = 'daily';
let curveFilterTopicId = null;

const CURVE_FADED_ALPHA = 0.3;
const TODAY_LINE_COLOR = '#E50012';

function withAlpha(color, alpha) {
  if (!color || alpha >= 1) return color;
  if (color.startsWith('#')) {
    const hex = color.length === 4
      ? color.slice(1).split('').map((c) => c + c).join('')
      : color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith('rgba(')) return color;
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  return color;
}

const todayLinePlugin = {
  id: 'todayLine',
  afterDraw(chart, _args, opts) {
    const lines = opts.lines || [];
    const { ctx, chartArea, scales } = chart;
    lines.forEach(({ day, color }) => {
      if (day == null || day < 0 || day > scales.x.max) return;
      const x = scales.x.getPixelForValue(day);
      if (x < chartArea.left || x > chartArea.right) return;
      ctx.save();
      ctx.strokeStyle = color || TODAY_LINE_COLOR;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    });
    if (lines.length > 0) {
      const main = lines[0];
      const x = scales.x.getPixelForValue(main.day);
      if (x >= chartArea.left && x <= chartArea.right) {
        ctx.save();
        ctx.fillStyle = TODAY_LINE_COLOR;
        ctx.font = 'bold 12px -apple-system, sans-serif';
        ctx.fillText('今日', x + 5, chartArea.top + 14);
        ctx.restore();
      }
    }
  },
};

function destroyCharts() {
  if (dailyChart) {
    dailyChart.destroy();
    dailyChart = null;
  }
  if (curveChart) {
    curveChart.destroy();
    curveChart = null;
  }
}

function renderDailyChart() {
  const canvas = document.getElementById('daily-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const { labels, datasets, today, stacked } = getDailyReviewData();
  const todayLabel = today;

  if (dailyChart) dailyChart.destroy();

  dailyChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: stacked, position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} 件`,
          },
        },
      },
      scales: {
        x: {
          stacked,
          grid: { display: false },
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            font: { size: 10 },
            autoSkip: true,
            maxTicksLimit: 15,
            color: (ctx) => (labels[ctx.index] === todayLabel ? '#E50012' : undefined),
            fontWeight: (ctx) => (labels[ctx.index] === todayLabel ? '700' : 'normal'),
          },
        },
        y: {
          stacked,
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            font: { size: 11 },
          },
          title: {
            display: true,
            text: '件数',
            font: { size: 11 },
          },
        },
      },
    },
  });
}

function getReviewResultColor(result, alpha = 1) {
  let color = null;
  if (result === 'good') color = '#34C759';
  else if (result === 'ok') color = '#FF9500';
  else if (result === 'bad') color = '#FF3B30';
  return color ? withAlpha(color, alpha) : null;
}

function getReviewResultLabel(result) {
  if (result === 'good') return '○';
  if (result === 'ok') return '△';
  if (result === 'bad') return '✕';
  return '';
}

function formatCurveTooltipDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`;
}

function getLectureSequenceLabel(lectureId) {
  const lecture = getLectureById(lectureId);
  if (!lecture) return '';
  const sameTopicLectures = loadData()
    .lectures.filter((l) => l.subject === lecture.subject && l.topic === lecture.topic)
    .sort((a, b) => a.attendedDate.localeCompare(b.attendedDate) || a.id.localeCompare(b.id));
  const index = sameTopicLectures.findIndex((l) => l.id === lectureId);
  return index >= 0 ? `第${index + 1}回講義` : '';
}

function findScheduledTooltipItem(items) {
  if (!items?.length) return null;
  return (
    items.find((item) => {
      const store = item.chart?.$curveTopicMeta?.[item.datasetIndex];
      return store?.isScatter && item.raw && item.raw.completed !== true;
    }) || null
  );
}

function findLineTooltipItem(items) {
  if (!items?.length) return null;
  return (
    items.find((item) => {
      const store = item.chart?.$curveTopicMeta?.[item.datasetIndex];
      return store && !store.isScatter;
    }) || null
  );
}

function getNextReviewTooltipLine(meta, day, originDate) {
  const pending = (meta.reviewPoints || [])
    .filter((p) => !p.completed && p.x > day - 0.5)
    .sort((a, b) => a.x - b.x);
  if (pending.length === 0) return '次の復習：—';
  return `次の復習：${formatCurveTooltipDate(addDays(originDate, Math.round(pending[0].x)))}`;
}

function buildCurveTopicMeta(topic) {
  return {
    subject: topic.subject,
    topic: topic.topic,
    lectureLabel: getLectureSequenceLabel(topic.id),
    attendedDate: topic.attendedDate,
    reviewPoints: topic.reviewPoints,
  };
}

const CURVE_PERIOD_OPTIONS = [
  { value: 10, label: '10日' },
  { value: 20, label: '20日' },
  { value: 30, label: '30日' },
  { value: 60, label: '60日' },
  { value: 90, label: '90日' },
  { value: 180, label: '180日' },
  { value: 365, label: '365日' },
  { value: 'all', label: '全期間' },
];

let curvePeriodMenuOpen = false;

function closeCurvePeriodMenu() {
  const menu = document.getElementById('curve-period-menu');
  const trigger = document.getElementById('curve-period-trigger');
  if (!menu || !trigger) return;
  menu.hidden = true;
  menu.classList.remove('is-open');
  menu.style.display = '';
  menu.style.visibility = '';
  trigger.setAttribute('aria-expanded', 'false');
  curvePeriodMenuOpen = false;
}

function positionCurvePeriodMenu() {
  const menu = document.getElementById('curve-period-menu');
  const trigger = document.getElementById('curve-period-trigger');
  if (!menu || !trigger) return;

  menu.style.visibility = 'hidden';
  menu.style.display = 'block';

  const rect = trigger.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 168;
  const menuHeight = menu.offsetHeight || 320;
  const left = Math.max(8, rect.right - menuWidth);
  const top = Math.max(8, rect.top - menuHeight - 8);

  menu.style.position = 'fixed';
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.right = 'auto';
  menu.style.bottom = 'auto';
  menu.style.zIndex = '3000';
  menu.style.visibility = 'visible';
}

function openCurvePeriodMenu() {
  const menu = document.getElementById('curve-period-menu');
  const trigger = document.getElementById('curve-period-trigger');
  if (!menu || !trigger) return;

  updateCurvePeriodMenuSelection();
  menu.hidden = false;
  menu.classList.add('is-open');
  positionCurvePeriodMenu();
  trigger.setAttribute('aria-expanded', 'true');
  curvePeriodMenuOpen = true;
}

function toggleCurvePeriodMenu() {
  if (curvePeriodMenuOpen) closeCurvePeriodMenu();
  else openCurvePeriodMenu();
}

function buildCurvePeriodMenuHtml() {
  return CURVE_PERIOD_OPTIONS.map(
    (opt) => `
    <li>
      <button
        type="button"
        class="curve-period-option"
        role="option"
        data-period="${opt.value}"
      >
        <span class="curve-period-option__label">${opt.label}</span>
        <span class="curve-period-option__check"></span>
      </button>
    </li>
  `
  ).join('');
}

function updateCurvePeriodMenuSelection() {
  const menu = document.getElementById('curve-period-menu');
  if (!menu) return;
  const current = getCurveDisplayPeriod();
  menu.querySelectorAll('.curve-period-option').forEach((btn) => {
    const period = btn.dataset.period === 'all' ? 'all' : Number(btn.dataset.period);
    const selected = period === current;
    btn.classList.toggle('is-selected', selected);
    btn.setAttribute('aria-selected', String(selected));
    btn.querySelector('.curve-period-option__check').textContent = selected ? '✓' : '';
  });
}

function renderCurvePeriodMenu() {
  const menu = document.getElementById('curve-period-menu');
  if (!menu) return;
  if (!menu.dataset.built) {
    menu.innerHTML = buildCurvePeriodMenuHtml();
    menu.dataset.built = '1';
    menu.querySelectorAll('.curve-period-option').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const period = btn.dataset.period === 'all' ? 'all' : Number(btn.dataset.period);
        setCurveDisplayPeriod(period);
        closeCurvePeriodMenu();
        updateCurvePeriodTriggerLabel();
        renderCurveChart();
      });
    });
  }
  updateCurvePeriodMenuSelection();
}

function updateCurvePeriodTriggerLabel() {
  const labelEl = document.getElementById('curve-period-current');
  if (labelEl) labelEl.textContent = getCurvePeriodLabel();
}

function initCurvePeriodUI() {
  const trigger = document.getElementById('curve-period-trigger');
  if (!trigger || trigger.dataset.bound) return;
  trigger.dataset.bound = '1';

  renderCurvePeriodMenu();
  updateCurvePeriodTriggerLabel();

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCurvePeriodMenu();
  });

  document.addEventListener('click', (e) => {
    if (!curvePeriodMenuOpen) return;
    const menu = document.getElementById('curve-period-menu');
    if (trigger.contains(e.target) || menu?.contains(e.target)) return;
    closeCurvePeriodMenu();
  });
}

function renderCurveLegend(topics) {
  const legendEl = document.getElementById('curve-legend');
  if (!legendEl) return;

  if (topics.length === 0) {
    legendEl.innerHTML = '<p class="graph-empty">登録された論点がありません</p>';
    return;
  }

  const showAllActive = !curveFilterTopicId;
  legendEl.innerHTML = `
    <button type="button" class="curve-legend__all${showAllActive ? ' is-active' : ''}">すべて表示</button>
    ${topics
      .map(
        (t) => `
      <button
        type="button"
        class="curve-legend__item${curveFilterTopicId === t.id ? ' is-selected' : ''}${curveFilterTopicId && curveFilterTopicId !== t.id ? ' is-dimmed' : ''}"
        data-topic-id="${t.id}"
        aria-pressed="${curveFilterTopicId === t.id}"
      >
        <span class="curve-legend__dot" style="background:${t.color}"></span>
        ${escapeHtml(t.label)}
      </button>
    `
      )
      .join('')}
  `;

  legendEl.querySelector('.curve-legend__all')?.addEventListener('click', () => {
    curveFilterTopicId = null;
    renderCurveChart();
  });

  legendEl.querySelectorAll('.curve-legend__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const topicId = btn.dataset.topicId;
      curveFilterTopicId = curveFilterTopicId === topicId ? null : topicId;
      renderCurveChart();
    });
  });
}

function renderCurveChart() {
  const canvas = document.getElementById('curve-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const { topics, maxDay: fullMaxDay, todayDay, originDate } = getForgettingCurveData();
  const displayMaxDay = getCurveDisplayMaxDay(fullMaxDay);

  if (curveChart) curveChart.destroy();

  renderCurveLegend(topics);

  if (topics.length === 0) return;

  const visibleTopics = curveFilterTopicId
    ? topics.filter((t) => t.id === curveFilterTopicId)
    : topics;

  if (visibleTopics.length === 0) {
    curveFilterTopicId = null;
    return renderCurveChart();
  }

  const isAllView = !curveFilterTopicId;
  const curveAlpha = isAllView ? CURVE_FADED_ALPHA : 1;

  const todayLines = [{ day: todayDay, color: TODAY_LINE_COLOR }];

  const datasets = [];
  const topicMetaByDatasetIndex = [];

  visibleTopics.forEach((topic) => {
    const lineColor = withAlpha(topic.color, curveAlpha);
    const topicMeta = buildCurveTopicMeta(topic);

    topicMetaByDatasetIndex.push({ ...topicMeta, isScatter: false });
    datasets.push({
      type: 'line',
      label: topic.label,
      data: topic.curvePoints,
      borderColor: lineColor,
      backgroundColor: lineColor,
      borderWidth: isAllView ? 1.5 : 2,
      pointRadius: 0,
      pointHitRadius: 10,
      tension: 0,
      parsing: false,
      interaction: {
        mode: 'nearest',
        intersect: false,
        axis: 'x',
      },
    });

    topicMetaByDatasetIndex.push({ ...topicMeta, isScatter: true });
    datasets.push({
      type: 'scatter',
      label: `${topic.label} 復習`,
      data: topic.reviewPoints,
      backgroundColor: topic.reviewPoints.map((p) =>
        p.completed
          ? (getReviewResultColor(p.result, curveAlpha) || lineColor)
          : `rgba(255, 255, 255, ${isAllView ? 0.85 : 1})`
      ),
      borderColor: topic.reviewPoints.map((p) =>
        p.completed
          ? (getReviewResultColor(p.result, curveAlpha) || lineColor)
          : lineColor
      ),
      borderWidth: isAllView ? 1.5 : 2,
      pointRadius: isAllView ? 5 : 6,
      pointHoverRadius: 8,
      hitRadius: 16,
      parsing: false,
      showLine: false,
      interaction: {
        mode: 'point',
        intersect: true,
      },
      order: 1,
    });
  });

  curveChart = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          displayColors: false,
          itemSort(a, b) {
            const aScheduled =
              a.chart.$curveTopicMeta[a.datasetIndex]?.isScatter && a.raw?.completed !== true;
            const bScheduled =
              b.chart.$curveTopicMeta[b.datasetIndex]?.isScatter && b.raw?.completed !== true;
            if (aScheduled && !bScheduled) return -1;
            if (!aScheduled && bScheduled) return 1;
            return 0;
          },
          filter(item, _index, items) {
            const scheduled = findScheduledTooltipItem(items);
            if (scheduled) return item === scheduled;
            const line = findLineTooltipItem(items);
            if (line) return item === line;
            return true;
          },
          callbacks: {
            title(items) {
              const scheduled = findScheduledTooltipItem(items);
              if (!scheduled) return '';
              const day = Math.round(scheduled.parsed.x);
              return formatCurveTooltipDate(addDays(originDate, day));
            },
            beforeBody(items) {
              const scheduled = findScheduledTooltipItem(items);
              if (!scheduled) return [];
              const meta = scheduled.chart.$curveTopicMeta[scheduled.datasetIndex];
              if (!meta) return [];
              return ['', meta.lectureLabel, meta.topic, `科目：${meta.subject}`, ''];
            },
            label: () => null,
            afterBody(items) {
              const scheduled = findScheduledTooltipItem(items);
              if (scheduled) {
                const round = scheduled.raw?.round;
                return round ? [`${round}回目復習（予定）`] : [];
              }
              const line = findLineTooltipItem(items);
              if (!line) return [];
              const meta = line.chart.$curveTopicMeta[line.datasetIndex];
              if (!meta) return [];
              const day = Math.round(line.parsed.x);
              return [
                `保持率：${line.parsed.y.toFixed(0)}%`,
                getNextReviewTooltipLine(meta, day, originDate),
              ];
            },
          },
        },
        todayLine: { lines: todayLines },
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: displayMaxDay,
          title: {
            display: true,
            text: '経過日数（最初の受講日を0とする）',
            font: { size: 11 },
          },
          ticks: {
            font: { size: 10 },
            callback: (value) => {
              const day = Number(value);
              if (!Number.isFinite(day) || !Number.isInteger(day)) return '';
              return formatShortDate(addDays(originDate, day));
            },
          },
        },
        y: {
          min: 0,
          max: 100,
          title: {
            display: true,
            text: '記憶保持率 (%)',
            font: { size: 11 },
          },
          ticks: {
            callback: (v) => `${v}%`,
            font: { size: 10 },
          },
        },
      },
    },
    plugins: [todayLinePlugin],
  });

  curveChart.$curveTopicMeta = topicMetaByDatasetIndex;
  updateCurvePeriodTriggerLabel();
}

function switchGraphTab(tab) {
  currentGraphTab = tab;
  document.querySelectorAll('.graph-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.graphTab === tab);
  });
  document.querySelectorAll('.graph-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.graphPanel === tab);
  });

  if (tab === 'daily') {
    requestAnimationFrame(() => renderDailyChart());
  } else {
    requestAnimationFrame(() => renderCurveChart());
  }
}

function openGraphPanel() {
  const overlay = document.getElementById('graph-overlay');
  if (!overlay) return;
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  switchGraphTab(currentGraphTab);
}

function closeGraphPanel() {
  const overlay = document.getElementById('graph-overlay');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  curveFilterTopicId = null;
  closeCurvePeriodMenu();
  destroyCharts();
}

function initGraphUI() {
  const openBtn = document.getElementById('open-graph-btn');
  const closeBtn = document.getElementById('close-graph-btn');
  const overlay = document.getElementById('graph-overlay');
  const sheet = document.getElementById('graph-sheet');

  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openGraphPanel();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeGraphPanel();
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => closeGraphPanel());
  }

  if (sheet) {
    sheet.addEventListener('click', (e) => e.stopPropagation());
  }

  document.querySelectorAll('.graph-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchGraphTab(btn.dataset.graphTab));
  });

  initCurvePeriodUI();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
