// ========================================
// DASHBOARD - Real-time Firebase Data
// Tema: Cycle Time + Histori Harian
// ========================================

let cycleChart = null;
let cycleData = [];
let cycleLabels = [];
let pollInterval = null;
let eventLogLoadedDate = null;

// Local runtime/downtime tracker (website hitung sendiri)
let localRuntimeSec = 0;
let localDowntimeSec = 0;
let localMachineStatus = 'STOP';
let localTimerInterval = null;
let runtimeInitialized = false;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  updateNavUser();
  setupRolePermissions();
  initCycleChart();
  startRealtimeListener();
  startLocalTimer();
});

function startLocalTimer() {
  localTimerInterval = setInterval(() => {
    if (localMachineStatus === 'RUN') localRuntimeSec++;
    else localDowntimeSec++;

    const runtimeEl = document.getElementById('runtimeVal');
    const downtimeEl = document.getElementById('downtimeVal');
    if (runtimeEl) runtimeEl.innerText = formatSeconds(localRuntimeSec);
    if (downtimeEl) downtimeEl.innerText = formatSeconds(localDowntimeSec);
  }, 1000);
}

function formatSeconds(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr || timeStr === '-' || timeStr === '00:00:00') return 0;
  const parts = String(timeStr).split(':').map(v => parseInt(v, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
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

function setupRolePermissions() {
  const user = getCurrentUser();

  if (!canChangeThreshold()) {
    const form = document.getElementById('thresholdForm');
    const readonly = document.getElementById('thresholdReadonly');
    if (form) form.style.display = 'none';
    if (readonly) {
      readonly.style.display = 'block';
      const roleText = document.getElementById('thresholdRoleText');
      if (roleText) roleText.textContent = user.role;
    }
  }

  if (!canControlMachine()) {
    const buttons = document.getElementById('controlButtons');
    const readonly = document.getElementById('controlReadonly');
    if (buttons) buttons.style.display = 'none';
    if (readonly) readonly.style.display = 'block';
  }
}

function initCycleChart() {
  const canvas = document.getElementById('speedChartDashboard');
  if (!canvas) return;

  cycleChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: cycleLabels,
      datasets: [{
        label: 'Cycle Time (sec/unit)',
        data: cycleData,
        borderColor: '#1479ff',
        backgroundColor: 'rgba(20, 121, 255, 0.12)',
        tension: 0.3,
        fill: true,
        pointRadius: 2,
        pointBackgroundColor: '#1479ff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#4d6383', font: { family: 'Inter', size: 11 } } },
        tooltip: { callbacks: { label: ctx => `Cycle Time: ${Number(ctx.parsed.y || 0).toFixed(1)} sec/unit` } }
      },
      scales: {
        x: {
          ticks: { color: '#7890ad', maxTicksLimit: 8, font: { size: 10 } },
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

function startRealtimeListener() {
  fetchLatestData().then(() => updateConnectionStatus(true)).catch(() => updateConnectionStatus(false));
  pollInterval = setInterval(() => fetchLatestData().catch(() => {}), 2000);
}

async function fetchLatestData() {
  const response = await fetch(FirebaseDB.baseURL + '/stamping_box/latest.json');
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  if (data) {
    updateDashboardUI(data);
    updateConnectionStatus(true);
    fetchDailyProductionLog(data.tanggal_produksi || getTodayKey()).catch(() => {});
  }
}

function updateConnectionStatus(connected) {
  const connBar = document.getElementById('connectionBar');
  const connText = document.getElementById('connectionText');
  if (connected) {
    if (connBar) { connBar.classList.remove('error'); connBar.classList.add('connected'); }
    if (connText) connText.textContent = 'Terhubung ke Firebase — Data real-time aktif';
  } else {
    if (connBar) { connBar.classList.remove('connected'); connBar.classList.add('error'); }
    if (connText) connText.textContent = 'Koneksi terputus — Mencoba menghubungkan kembali...';
  }
}

function updateDashboardUI(data) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val !== undefined && val !== null ? val : '-';
  };

  setText('goodVal', data.good_count ?? data.jumlah_good ?? 0);
  setText('ngVal', data.ng_count ?? data.jumlah_not_good ?? 0);
  setText('totalVal', data.total_count ?? data.total_produksi ?? 0);
  setText('percentGoodVal', data.percent_good ?? data.persentase_good ?? '0.0');
  setText('percentNGVal', data.percent_ng ?? data.persentase_ng ?? '0.0');
  setText('lastUpdateVal', data.last_update ?? '-');
  setText('warningThresholdVal', data.warning_threshold ?? data.threshold_warning ?? '10.0');
  setText('criticalThresholdVal', data.critical_threshold ?? data.threshold_critical ?? '20.0');
  setText('minimumSampleVal', data.minimum_sample ?? '20');

  const fbRuntime = parseTimeToSeconds(data.runtime);
  const fbDowntime = parseTimeToSeconds(data.downtime);
  if (!runtimeInitialized || fbRuntime > localRuntimeSec || fbDowntime > localDowntimeSec) {
    if (fbRuntime > 0 || fbDowntime > 0) {
      localRuntimeSec = fbRuntime;
      localDowntimeSec = fbDowntime;
      runtimeInitialized = true;
    }
  }

  localMachineStatus = data.status_machine ?? 'STOP';

  const machineEl = document.getElementById('machineVal');
  if (machineEl) {
    const status = data.status_machine ?? 'STOP';
    machineEl.innerText = status;
    machineEl.style.color = status === 'RUN' ? '#08a66c' : '#ff3b4f';
  }

  const sysEl = document.getElementById('systemVal');
  if (sysEl) {
    const status = data.status_system ?? 'NORMAL';
    sysEl.innerText = status;
    sysEl.classList.remove('normal', 'warning', 'critical');
    if (status === 'WARNING') sysEl.classList.add('warning');
    else if (status === 'CRITICAL') sysEl.classList.add('critical');
    else sysEl.classList.add('normal');
  }

  const cardSystem = document.getElementById('cardSystem');
  if (cardSystem) {
    const status = data.status_system ?? 'NORMAL';
    if (status === 'WARNING') {
      cardSystem.style.boxShadow = '0 8px 24px rgba(18,60,113,0.10), 0 0 0 3px rgba(245,164,0,0.20)';
      cardSystem.style.borderColor = 'rgba(245,164,0,0.45)';
    } else if (status === 'CRITICAL') {
      cardSystem.style.boxShadow = '0 8px 24px rgba(18,60,113,0.10), 0 0 0 3px rgba(255,59,79,0.20)';
      cardSystem.style.borderColor = 'rgba(255,59,79,0.45)';
    } else {
      cardSystem.style.boxShadow = '';
      cardSystem.style.borderColor = '';
    }
  }

  const banner = document.getElementById('warningBanner');
  if (banner) {
    const status = data.status_system ?? 'NORMAL';
    banner.style.display = 'none';
    banner.className = 'banner';
    if (status === 'WARNING') {
      banner.classList.add('banner-warning');
      banner.style.display = 'block';
      banner.innerText = '⚠ WARNING: JUMLAH NOT GOOD MELEBIHI AMBANG BATAS.';
    } else if (status === 'CRITICAL') {
      banner.classList.add('banner-critical');
      banner.style.display = 'block';
      banner.innerText = '🚨 CRITICAL: PERSENTASE NOT GOOD SANGAT TINGGI. SEGERA CEK SISTEM.';
    }
  }

  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    if ((data.status_system ?? 'NORMAL') === 'CRITICAL') {
      startBtn.classList.add('disabled');
      startBtn.disabled = true;
    } else {
      startBtn.classList.remove('disabled');
      startBtn.disabled = false;
    }
  }

  const wInput = document.getElementById('thresholdWarning');
  const cInput = document.getElementById('thresholdCritical');
  const mInput = document.getElementById('thresholdMinSample');
  if (wInput && !wInput.matches(':focus')) wInput.value = data.warning_threshold ?? data.threshold_warning ?? 10;
  if (cInput && !cInput.matches(':focus')) cInput.value = data.critical_threshold ?? data.threshold_critical ?? 20;
  if (mInput && !mInput.matches(':focus')) mInput.value = data.minimum_sample ?? 20;

  const total = data.total_count ?? data.total_produksi ?? 0;
  const cycle = parseCycleTimeSeconds(data.cycle_time_seconds ?? data.cycle_time, data.runtime, total);
  updateCycleChart(cycle);
}

function updateCycleChart(cycle) {
  const value = Number(cycle || 0);
  cycleData.push(Number(value.toFixed(1)));
  cycleLabels.push(new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }));

  if (cycleData.length > 20) {
    cycleData.shift();
    cycleLabels.shift();
  }

  if (cycleChart) {
    cycleChart.data.labels = cycleLabels;
    cycleChart.data.datasets[0].data = cycleData;
    cycleChart.update('none');
  }
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

async function fetchDailyProductionLog(dateKey) {
  const todayKey = sanitizeFirebaseKey(dateKey || getTodayKey());
  let entries = [];

  const dailyResp = await fetch(FirebaseDB.baseURL + '/stamping_box/history/' + todayKey + '.json');
  if (dailyResp.ok) {
    const dailyData = await dailyResp.json();
    entries = flattenHistoryData(dailyData);
  }

  // Fallback untuk data lama yang masih tersimpan di path /history datar.
  if (entries.length === 0) {
    const flatResp = await fetch(FirebaseDB.baseURL + '/stamping_box/history.json');
    if (flatResp.ok) {
      const flatData = await flatResp.json();
      entries = flattenHistoryData(flatData).filter(row => getRowDate(row) === todayKey);
    }
  }

  entries.sort((a, b) => String(b.timestamp || b.jam_produksi || '').localeCompare(String(a.timestamp || a.jam_produksi || '')));
  renderEventLog(entries.slice(0, 8));
  eventLogLoadedDate = todayKey;
}

function renderEventLog(entries) {
  const box = document.getElementById('eventLog');
  if (!box) return;

  if (!entries || entries.length === 0) {
    box.innerHTML = '<div class="event-item event-empty">Belum ada log produksi terbaru untuk hari ini.</div>';
    return;
  }

  box.innerHTML = entries.map(row => {
    const result = row.result || '-';
    const resultClass = result === 'GOOD' ? 'value-good' : (result === 'NOT GOOD' ? 'value-bad' : '');
    const good = row.good_count ?? row.jumlah_good ?? 0;
    const ng = row.ng_count ?? row.jumlah_not_good ?? 0;
    const total = row.total_count ?? row.total_produksi ?? 0;
    const pct = row.percent_ng ?? row.persentase_ng ?? 0;
    const status = row.status_system || 'NORMAL';
    const time = row.timestamp || row.jam_produksi || '-';
    const cycle = row.cycle_time || '-';
    return `<div class="event-item">
      <strong>${time}</strong> &nbsp; <span class="${resultClass}"><strong>${result}</strong></span>
      &nbsp; Good: ${good} | NG: ${ng} | Total: ${total} | NG%: ${pct} | Cycle: ${cycle}
      <span style="float:right" class="${status === 'CRITICAL' ? 'value-bad' : status === 'WARNING' ? 'value-warn' : 'value-good'}">${status}</span>
    </div>`;
  }).join('');
}

// ========================================
// SEND COMMAND
// ========================================
async function sendCommand(cmd) {
  console.log('Sending command:', cmd);

  try {
    const response = await fetch(FirebaseDB.baseURL + '/stamping_box/control.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    });

    if (!response.ok) throw new Error('HTTP ' + response.status);
    console.log('Command sent OK:', cmd);

    if (cmd === 'START') {
      if (localMachineStatus === 'STOP') incrementLatestField('jumlah_mesin_beroperasi');
      localMachineStatus = 'RUN';
      const machineEl = document.getElementById('machineVal');
      if (machineEl) { machineEl.innerText = 'RUN'; machineEl.style.color = '#08a66c'; }
      updateLatestField('status_machine', 'RUN');
    } else if (cmd === 'STOP') {
      localMachineStatus = 'STOP';
      const machineEl = document.getElementById('machineVal');
      if (machineEl) { machineEl.innerText = 'STOP'; machineEl.style.color = '#ff3b4f'; }
      updateLatestField('status_machine', 'STOP');
    } else if (cmd === 'RESET') {
      localRuntimeSec = 0;
      localDowntimeSec = 0;
      runtimeInitialized = true;
      resetLatestCounters();
    }

    const user = getCurrentUser();
    const now = new Date();
    const dateText = now.toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g, '-');
    const timeText = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
    const actionLabel = cmd === 'MASTER_ON' ? 'MASTER ON' : cmd;

    fetch(FirebaseDB.baseURL + '/stamping_box/logs/command_dashboard.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: dateText + ' ' + timeText,
        tanggal_produksi: dateText,
        jam_produksi: timeText,
        username: user.username,
        role: user.role,
        action: cmd,
        detail: 'Command ' + actionLabel + ' dari web online',
        nama_mesin: MACHINE_NAME
      })
    }).catch(() => {});

  } catch (error) {
    console.error('Command error:', error);
    alert('Gagal mengirim perintah: ' + error.message);
  }
}

async function updateLatestField(field, value) {
  try {
    const url = FirebaseDB.baseURL + '/stamping_box/latest/' + field + '.json';
    await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  } catch (e) { console.error('Update field error:', e); }
}

async function incrementLatestField(field) {
  try {
    const url = FirebaseDB.baseURL + '/stamping_box/latest/' + field + '.json';
    const resp = await fetch(url);
    let current = 0;
    if (resp.ok) current = parseInt(await resp.json(), 10) || 0;
    await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(current + 1) });
  } catch (e) { console.error('Increment field error:', e); }
}

async function resetLatestCounters() {
  try {
    const updates = {
      good_count: 0, ng_count: 0, total_count: 0,
      jumlah_good: 0, jumlah_not_good: 0, total_produksi: 0,
      percent_good: 0, percent_ng: 0, persentase_ng: 0,
      runtime: '00:00:00', downtime: '00:00:00', cycle_time: '0.0 sec/unit', cycle_time_seconds: 0,
      status_system: 'NORMAL', jumlah_mesin_beroperasi: 0,
      last_update: new Date().toLocaleString('id-ID')
    };
    for (const [key, val] of Object.entries(updates)) await updateLatestField(key, val);
  } catch (e) { console.error('Reset error:', e); }
}

setInterval(async () => {
  try {
    await updateLatestField('runtime', formatSeconds(localRuntimeSec));
    await updateLatestField('downtime', formatSeconds(localDowntimeSec));
    const totalEl = document.getElementById('totalVal');
    const total = totalEl ? (parseInt(totalEl.innerText, 10) || 0) : 0;
    const cycle = total > 0 ? localRuntimeSec / total : 0;
    await updateLatestField('cycle_time', cycle.toFixed(1) + ' sec/unit');
    await updateLatestField('cycle_time_seconds', Number(cycle.toFixed(1)));
  } catch (e) {}
}, 5000);

// ========================================
// SET THRESHOLD
// ========================================
async function setThresholdAjax(event) {
  event.preventDefault();

  const warning = parseFloat(document.getElementById('thresholdWarning').value) || 10;
  const critical = parseFloat(document.getElementById('thresholdCritical').value) || 20;
  const minSample = parseInt(document.getElementById('thresholdMinSample').value) || 20;

  if (critical < warning) {
    alert('Threshold Critical harus lebih besar dari Warning!');
    return false;
  }

  try {
    await updateLatestField('warning_threshold', warning);
    await updateLatestField('critical_threshold', critical);
    await updateLatestField('threshold_warning', warning);
    await updateLatestField('threshold_critical', critical);
    await updateLatestField('minimum_sample', minSample);
    console.log('Threshold updated');
    alert('Threshold berhasil diubah!');
  } catch (error) {
    console.error('Threshold error:', error);
    alert('Gagal mengubah threshold: ' + error.message);
  }

  return false;
}

window.addEventListener('beforeunload', () => {
  if (pollInterval) clearInterval(pollInterval);
  if (localTimerInterval) clearInterval(localTimerInterval);
});
