// ========================================
// HISTORY PAGE - Firebase Data
// Tema: Histori Harian + Cycle Time
// ========================================

let historyCycleChart = null;
let historyOriginalData = [];
let historyFilteredData = [];
let historyPollInterval = null;
let activeFilter = null;
let currentHistoryDateKey = null;
let latestSnapshot = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  updateNavUser();
  setupHistoryRole();
  initHistoryCycleChart();
  startHistoryListener();
});

function setupHistoryRole() {
  const reportSection = document.getElementById('reportSection');
  const operatorReport = document.getElementById('operatorReport');

  if (canViewReportFull()) {
    if (reportSection) reportSection.style.display = 'block';
    if (operatorReport) operatorReport.style.display = 'none';
  } else {
    if (reportSection) reportSection.style.display = 'none';
    if (operatorReport) operatorReport.style.display = 'block';
  }
}

function getTodayKey() {
  return new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g, '-');
}

function sanitizeFirebaseKey(key) {
  return String(key || getTodayKey()).replace(/[.#$\[\]/]/g, '-');
}

function getRowDate(row) {
  if (!row) return '';
  if (row.tanggal_produksi) return String(row.tanggal_produksi).replace(/\//g, '-');
  const ts = row.timestamp || row.last_update || '';
  const match = String(ts).match(/(\d{2}[-/]\d{2}[-/]\d{4})/);
  return match ? match[1].replace(/\//g, '-') : '';
}

function getRowTime(row) {
  if (!row) return '';
  if (row.jam_produksi) return String(row.jam_produksi).slice(0, 5);
  const ts = row.timestamp || '';
  const match = String(ts).match(/(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr || timeStr === '-' || timeStr === '00:00:00') return 0;
  const parts = String(timeStr).split(':').map(v => parseInt(v, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function parseCycleTimeSeconds(value, runtime, total) {
  if (value !== undefined && value !== null) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    const match = String(value).replace(',', '.').match(/[\d.]+/);
    if (match) return parseFloat(match[0]) || 0;
  }
  const runtimeSec = parseTimeToSeconds(runtime);
  const totalCount = parseInt(total, 10) || 0;
  if (runtimeSec > 0 && totalCount > 0) return runtimeSec / totalCount;
  return 0;
}

function initHistoryCycleChart() {
  const canvas = document.getElementById('speedChartHistory');
  if (!canvas) return;

  historyCycleChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Cycle Time (sec/unit)',
        data: [],
        borderColor: '#1479ff',
        backgroundColor: 'rgba(20, 121, 255, 0.12)',
        tension: 0.3,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#1479ff',
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#4d6383', font: { family: 'Inter', size: 12 } } },
        tooltip: { callbacks: { label: ctx => `Cycle Time: ${Number(ctx.parsed.y || 0).toFixed(1)} sec/unit` } }
      },
      scales: {
        x: {
          ticks: { color: '#7890ad', maxTicksLimit: 12, font: { size: 10 } },
          grid: { color: 'rgba(183, 212, 248, 0.45)' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#7890ad', font: { size: 10 } },
          title: { display: true, text: 'sec/unit', color: '#4d6383' },
          grid: { color: 'rgba(183, 212, 248, 0.45)' }
        }
      }
    }
  });
}

function startHistoryListener() {
  const connBar = document.getElementById('connectionBar');
  const connText = document.getElementById('connectionText');

  fetchHistoryData().then(() => {
    if (connBar) { connBar.classList.remove('error'); connBar.classList.add('connected'); }
    if (connText) connText.textContent = 'Terhubung ke Firebase — Data real-time aktif';
  }).catch(() => {
    if (connBar) connBar.classList.add('error');
    if (connText) connText.textContent = 'Gagal menghubungkan ke Firebase';
  });

  historyPollInterval = setInterval(fetchHistoryData, 3000);
}

function flattenHistoryData(historyData) {
  if (!historyData) return [];
  const out = [];
  Object.values(historyData).forEach(value => {
    if (!value || typeof value !== 'object') return;
    if ('result' in value || 'total_count' in value || 'total_produksi' in value) out.push(value);
    else Object.values(value).forEach(child => {
      if (child && typeof child === 'object') out.push(child);
    });
  });
  return out;
}

async function getDailyHistory(dateKey) {
  const safeKey = sanitizeFirebaseKey(dateKey);
  let entries = [];

  const dailyData = await FirebaseDB.get('stamping_box/history/' + safeKey).catch(() => null);
  entries = flattenHistoryData(dailyData);

  // Fallback untuk data lama yang masih berada di /stamping_box/history datar.
  if (entries.length === 0) {
    const allHistory = await FirebaseDB.get('stamping_box/history').catch(() => null);
    entries = flattenHistoryData(allHistory).filter(row => getRowDate(row) === safeKey);
  }

  entries.sort((a, b) => String(b.timestamp || b.jam_produksi || '').localeCompare(String(a.timestamp || a.jam_produksi || '')));
  return entries;
}

async function fetchHistoryData() {
  try {
    const latest = await FirebaseDB.get('stamping_box/latest');
    latestSnapshot = latest || null;

    const todayKey = getTodayKey();
    const latestDate = latest?.tanggal_produksi ? String(latest.tanggal_produksi).replace(/\//g, '-') : todayKey;
    currentHistoryDateKey = latestDate === todayKey ? latestDate : todayKey;

    const entries = await getDailyHistory(currentHistoryDateKey);
    historyOriginalData = entries;
    historyFilteredData = activeFilter ? filterEntries(entries, activeFilter.start, activeFilter.end) : entries;

    updateHistorySummary(latest, historyFilteredData, currentHistoryDateKey);
    renderHistoryTable(historyFilteredData);
    generateSmartReport(historyFilteredData);
    updateHistoryCycleChart(historyFilteredData, latest);
  } catch (error) {
    const connBar = document.getElementById('connectionBar');
    const connText = document.getElementById('connectionText');
    if (connBar) { connBar.classList.remove('connected'); connBar.classList.add('error'); }
    if (connText) connText.textContent = 'Koneksi terputus...';
  }
}

function updateHistorySummary(data, entries, dateKey) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val !== undefined && val !== null ? val : '-';
  };

  const isTodayLatest = data && String(data.tanggal_produksi || '').replace(/\//g, '-') === dateKey;
  const latestEntry = entries && entries.length ? entries[0] : null;
  const source = isTodayLatest ? data : (latestEntry || {});

  const total = source.total_count ?? source.total_produksi ?? 0;
  const good = source.good_count ?? source.jumlah_good ?? 0;
  const ng = source.ng_count ?? source.jumlah_not_good ?? 0;
  const pctGood = total > 0 ? ((good * 100) / total).toFixed(1) : (source.percent_good ?? source.persentase_good ?? '0.0');
  const pctNG = total > 0 ? ((ng * 100) / total).toFixed(1) : (source.percent_ng ?? source.persentase_ng ?? '0.0');

  setText('dateVal', dateKey || getTodayKey());
  setText('machineOpVal', source.jumlah_mesin_beroperasi ?? 0);
  setText('totalGoodVal', good);
  setText('totalNGVal', ng);
  setText('totalProdVal', total);
  setText('pctGoodVal', pctGood);
  setText('pctNGVal', pctNG);
  setText('runtimeHVal', source.runtime ?? '00:00:00');
  setText('downtimeHVal', source.downtime ?? '00:00:00');

  const w = data?.warning_threshold ?? data?.threshold_warning ?? source.warning_threshold ?? source.threshold_warning ?? 10;
  const c = data?.critical_threshold ?? data?.threshold_critical ?? source.critical_threshold ?? source.threshold_critical ?? 20;
  const m = data?.minimum_sample ?? source.minimum_sample ?? 20;
  setText('thresholdInfoVal', `W:${w}% C:${c}%\nMin:${m}`);
}

function renderHistoryTable(data) {
  const table = document.getElementById('historyTableBody');
  if (!table) return;
  table.innerHTML = '';

  if (!data || data.length === 0) {
    table.innerHTML = "<tr><td colspan='9'>Belum ada data histori harian.</td></tr>";
    return;
  }

  data.forEach((row, i) => {
    const status = row.status_system || 'NORMAL';
    let rowClass = '';
    if (status === 'WARNING') rowClass = 'warning-row';
    if (status === 'CRITICAL') rowClass = 'critical-row';

    const total = row.total_count ?? row.total_produksi ?? '-';
    const cycle = row.cycle_time ?? (parseCycleTimeSeconds(row.cycle_time_seconds, row.runtime, total).toFixed(1) + ' sec/unit');

    const tr = document.createElement('tr');
    tr.className = rowClass;
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${row.timestamp || row.jam_produksi || '-'}</td>
      <td>${row.result || '-'}</td>
      <td>${status}</td>
      <td>${row.good_count ?? row.jumlah_good ?? '-'}</td>
      <td>${row.ng_count ?? row.jumlah_not_good ?? '-'}</td>
      <td>${total}</td>
      <td>${row.percent_ng ?? row.persentase_ng ?? '-'}</td>
      <td>${cycle}</td>
    `;
    table.appendChild(tr);
  });
}

function generateSmartReport(data) {
  const el = document.getElementById('autoReport');
  if (!el) return;

  const wEl = document.getElementById('warningCountVal');
  const cEl = document.getElementById('criticalCountVal');

  if (!data || data.length === 0) {
    if (wEl) wEl.innerText = 0;
    if (cEl) cEl.innerText = 0;
    el.innerText = 'Belum ada data histori harian untuk dianalisis.';
    return;
  }

  const latest = data[0];
  const total = latest.total_count ?? latest.total_produksi ?? 0;
  const good = latest.good_count ?? latest.jumlah_good ?? 0;
  const ng = latest.ng_count ?? latest.jumlah_not_good ?? 0;
  const cycle = latest.cycle_time ?? (parseCycleTimeSeconds(latest.cycle_time_seconds, latest.runtime, total).toFixed(1) + ' sec/unit');

  const warningCount = data.filter(d => (d.status_system || '') === 'WARNING').length;
  const criticalCount = data.filter(d => (d.status_system || '') === 'CRITICAL').length;

  if (wEl) wEl.innerText = warningCount;
  if (cEl) cEl.innerText = criticalCount;

  let dominant = 'NORMAL';
  if (criticalCount >= warningCount && criticalCount > 0) dominant = 'CRITICAL';
  else if (warningCount > 0) dominant = 'WARNING';

  const criticals = data.filter(d => (d.status_system || '') === 'CRITICAL');
  let period = '-';
  if (criticals.length > 0) period = (criticals[criticals.length - 1].timestamp || criticals[criticals.length - 1].jam_produksi || '') + ' - ' + (criticals[0].timestamp || criticals[0].jam_produksi || '');

  let report = `Produksi hari ini sebanyak ${total} unit, terdiri dari ${good} GOOD dan ${ng} NG. `;
  report += `Cycle time terakhir adalah ${cycle}, artinya rata-rata waktu proses untuk 1 produk sebesar ${cycle}. `;
  report += `Sistem didominasi kondisi ${dominant}. `;

  if (warningCount > 0) report += `Kondisi WARNING terjadi sebanyak ${warningCount} kali. `;

  if (criticalCount > 0) {
    report += `Kondisi CRITICAL terjadi sebanyak ${criticalCount} kali`;
    if (period !== '-') report += ` pada periode ${period}. `;
    else report += '. ';
    report += 'Hal ini mengindikasikan adanya potensi ketidakstabilan proses produksi.';
  } else {
    report += 'Tidak ditemukan periode kritis selama pengamatan.';
  }

  el.innerText = report;
}

function updateHistoryCycleChart(entries, latest) {
  let rows = entries && entries.length ? [...entries] : [];

  if (rows.length === 0 && latest) rows = [latest];

  rows = rows.slice().reverse().slice(-30);
  const labels = rows.map(row => getRowTime(row) || String(row.timestamp || row.jam_produksi || '-').slice(-8));
  const values = rows.map(row => {
    const total = row.total_count ?? row.total_produksi ?? 0;
    return Number(parseCycleTimeSeconds(row.cycle_time_seconds ?? row.cycle_time, row.runtime, total).toFixed(1));
  });

  if (historyCycleChart) {
    historyCycleChart.data.labels = labels;
    historyCycleChart.data.datasets[0].data = values;
    historyCycleChart.update('none');
  }
}

function filterEntries(entries, start, end) {
  if (!start || !end) return entries;
  return entries.filter(row => {
    const t = getRowTime(row);
    if (!t) return false;
    return t >= start && t <= end;
  });
}

function applyFilter() {
  const start = document.getElementById('startTime').value;
  const end = document.getElementById('endTime').value;

  if (!start || !end) {
    alert('Isi jam mulai dan jam akhir terlebih dahulu.');
    return;
  }

  if (start > end) {
    alert('Jam mulai tidak boleh lebih besar dari jam akhir.');
    return;
  }

  activeFilter = { start, end };
  historyFilteredData = filterEntries(historyOriginalData, start, end);
  renderHistoryTable(historyFilteredData);
  generateSmartReport(historyFilteredData);
  updateHistoryCycleChart(historyFilteredData, latestSnapshot);
}

function resetFilter() {
  activeFilter = null;
  const start = document.getElementById('startTime');
  const end = document.getElementById('endTime');
  if (start) start.value = '';
  if (end) end.value = '';

  historyFilteredData = historyOriginalData;
  renderHistoryTable(historyOriginalData);
  generateSmartReport(historyOriginalData);
  updateHistoryCycleChart(historyOriginalData, latestSnapshot);
}

window.addEventListener('beforeunload', () => {
  if (historyPollInterval) clearInterval(historyPollInterval);
});
