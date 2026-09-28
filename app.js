const configured = !!(
  window.SUPABASE_URL &&
  window.SUPABASE_ANON_KEY &&
  !window.SUPABASE_URL.includes('YOUR-PROJECT') &&
  !window.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE')
);

const db = configured ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;
const groupId = window.FOOTBALL_GROUP_ID || 'vriendengroep';

const $ = (selector) => document.querySelector(selector);

let players = [];
let attendance = new Set();
let currentAssignment = null;
let nextMatchDate = null;
let currentGroupSettings = null;

const bannerText = $('#banner-text');
const bannerPerson = $('#banner-person');
const selectedName = $('#selected-name');
const selectedRatio = $('#selected-ratio');
const selectedCount = $('#selected-count');
const rankingList = $('#ranking-list');
const matchPlayers = $('#match-players');
const matchDayScreen = $('#match-day-screen');
const nextMatchDateInput = $('#next-match-date');
const attendanceCount = $('#attendance-count');
const totalPlayers = $('#total-players');
const attendanceMeta = $('#attendance-meta');
const attendanceStatus = $('#attendance-status');
const datePanel = $('#date-panel');
const addPlayerRow = $('#add-player-row');
const matchDateLine = $('#match-date-line');
const timeLabel = $('#time-label');

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  timeLabel.textContent = `${hours}:${mins}`;
}

setInterval(updateClock, 30000);
updateClock();

if (!db) {
  bannerText.textContent = 'Supabase niet gekoppeld';
  bannerPerson.textContent = 'Setup';
  selectedName.textContent = 'Configuratie nodig';
  selectedRatio.textContent = 'Vul config.js in';
} else {
  start();
}

start();

async function start() {
  await loadSettings();
  await loadData();
  bindEvents();
  subscribeToRealtime();
  setInterval(loadData, 15000);
}

function bindEvents() {
  $('#save-date-button').addEventListener('click', async () => {
    if (!nextMatchDateInput.value) return;
    await saveMatchDate(nextMatchDateInput.value);
  });

  $('#add-player-button').addEventListener('click', () => {
    addPlayerRow.classList.toggle('hide');
  });

  $('#submit-player-button').addEventListener('click', async () => {
    const name = $('#new-player-name').value.trim();
    if (!name) return;

    const { error } = await db.from('players').insert({ group_id: groupId, name });
    if (error) {
      alert(error.message);
      return;
    }

    $('#new-player-name').value = '';
    addPlayerRow.classList.add('hide');
    await loadData();
  });

  $('#next-match-button').addEventListener('click', () => {
    matchDayScreen.classList.toggle('hide');
    datePanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('#show-ranking-button').addEventListener('click', () => {
    matchDayScreen.classList.add('hide');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function loadSettings() {
  const { data, error } = await db.from('match_settings').select('*').eq('group_id', groupId).maybeSingle();
  if (error) {
    console.error(error);
    return;
  }

  currentGroupSettings = data || null;
  nextMatchDate = data?.next_match_date || new Date().toISOString().slice(0, 10);
  nextMatchDateInput.value = nextMatchDate;
  matchDateLine.textContent = formatDisplayDate(nextMatchDate);
}

async function saveMatchDate(matchDate) {
  const payload = {
    group_id: groupId,
    next_match_date: matchDate,
    current_status: 'open',
    current_drink_person_id: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from('match_settings').upsert(payload, { onConflict: 'group_id' });
  if (error) {
    alert(error.message);
    return;
  }

  nextMatchDate = matchDate;
  matchDateLine.textContent = formatDisplayDate(matchDate);
  await loadData();
}

async function loadData() {
  if (!db) return;

  const matchDate = nextMatchDate || new Date().toISOString().slice(0, 10);

  const [playersResult, attendanceResult, settingsResult] = await Promise.all([
    db.from('players').select('*').eq('group_id', groupId).order('name', { ascending: true }),
    db.from('attendance').select('*').eq('group_id', groupId).eq('round_date', matchDate),
    db.from('match_settings').select('*').eq('group_id', groupId).maybeSingle(),
  ]);

  if (playersResult.error) console.error(playersResult.error);
  if (attendanceResult.error) console.error(attendanceResult.error);
  if (settingsResult.error) console.error(settingsResult.error);

  players = playersResult.data || [];
  nextMatchDate = settingsResult?.data?.next_match_date || matchDate;
  nextMatchDateInput.value = nextMatchDate;

  attendance = new Set((attendanceResult.data || []).map((row) => row.player_id));
  currentAssignment = (attendanceResult.data || []).find((row) => row.assigned_player_id)?.assigned_player_id || null;

  renderOverview();
  renderRanking();
  renderMatchPlayers();
  renderSelectedAssignment();
}

function renderOverview() {
  const activeCount = players.length;
  const attendingCount = attendance.size;
  const guestCount = Math.max(0, attendingCount - 10);

  $('#active-players').textContent = String(activeCount);
  $('#average-ratio').textContent = calculateAverageRatio();
  $('#total-players').textContent = String(activeCount);
  attendanceCount.textContent = String(attendingCount);
  attendanceMeta.textContent = `${attendingCount} vast + ${guestCount} gast`;
  attendanceStatus.textContent = attendingCount >= 10 ? 'Complete (≥10)' : 'Te weinig (<10)';

  if (attendingCount >= 10) {
    attendanceStatus.style.background = 'rgba(110,231,183,0.18)';
    attendanceStatus.style.color = '#dffef2';
  } else {
    attendanceStatus.style.background = 'rgba(248,113,113,0.13)';
    attendanceStatus.style.color = '#ffd0d0';
  }
}

function renderRanking() {
  if (!players.length) {
    rankingList.innerHTML = '<div class=\"ranking-item\"><span class=\"muted\">Nog geen spelers toegevoegd.</span></div>';
    return;
  }

  const ranked = [...players].map((player) => {
    const ratio = getRatio(player);
    return {
      ...player,
      ratio,
      display: Number.isFinite(ratio) ? ratio : 0,
    };
  }).sort((a, b) => a.display - b.display || a.name.localeCompare(b.name));

  rankingList.innerHTML = ranked.map((player, index) => {
    const ratioText = `${Number(player.display).toFixed(2)}%`;
    return `
      <div class="ranking-item">
        <div class="rank-no">${index + 1}</div>
        <div class="player-badge" style="background:${colorForName(player.name)}">${initials(player.name)}</div>
        <div class="player-main">
          <strong>${escapeHtml(player.name)}</strong>
          <small>${player.drinks}x gehaald • ${player.matches}duels gespeeld</small>
        </div>
        <div class="player-score">${ratioText}</div>
      </div>
    `;
  }).join('');
}

function renderMatchPlayers() {
  if (!players.length) {
    matchPlayers.innerHTML = '<div class=\"muted\">Nog geen spelers.</div>';
    return;
  }

  matchPlayers.innerHTML = players.map((player) => {
    const active = attendance.has(player.id);
    const ratio = getRatio(player);
    const ratioLabel = `${ratio.toFixed(2)}%`;
    return `
      <div class="match-player-row">
        <div class="player-line">
          <div class="toggle ${active ? 'active' : ''}" data-toggle-id="${player.id}"></div>
          <div class="player-meta">
            <div class="player-name">${escapeHtml(player.name)}</div>
            <div class="player-stats">${player.drinks}x gehaald • ratio ${ratioLabel}</div>
          </div>
        </div>
        <div class="counter-controls">
          <button class="counter-btn" data-change-id="${player.id}" data-change="-1" type="button">−</button>
          <div class="counter-value">${player.drinks}</div>
          <button class="counter-btn" data-change-id="${player.id}" data-change="1" type="button">+</button>
        </div>
      </div>
    `;
  }).join('');

  matchPlayers.querySelectorAll('.toggle').forEach((toggle) => {
    toggle.addEventListener('click', async () => {
      const id = toggle.dataset.toggleId;
      const nextValue = !attendance.has(id);
      await toggleAttendance(id, nextValue);
    });
  });

  matchPlayers.querySelectorAll('.counter-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const playerId = button.dataset.changeId;
      const change = Number(button.dataset.change);
      await adjustDrinkCount(playerId, change);
    });
  });
}

function renderSelectedAssignment() {
  const person = players.find((p) => p.id === currentAssignment) || players[0] || null;

  if (!person) {
    selectedName.textContent = 'Niemand aangemeld';
    selectedRatio.textContent = 'Zet de spelers aan';
    selectedCount.textContent = '0x gehaald';
    bannerText.textContent = 'Drankbeurt deze week';
    bannerPerson.textContent = '-';
    return;
  }

  const ratio = getRatio(person);
  const count = Number(person.drinks || 0);

  selectedName.textContent = person.name;
  selectedRatio.textContent = `${ratio.toFixed(2)}% beurt-ratio`;
  selectedCount.textContent = `${count}x gehaald`;
  bannerText.textContent = 'Drankbeurt deze week';
  bannerPerson.textContent = person.name;
}

async function toggleAttendance(playerId, checked) {
  const matchDate = nextMatchDate || new Date().toISOString().slice(0, 10);

  if (checked) {
    const { error } = await db.from('attendance').upsert({
      group_id: groupId,
      round_date: matchDate,
      player_id: playerId,
      assigned_player_id: null,
    }, { onConflict: 'group_id,round_date,player_id' });
    if (error) return alert(error.message);
  } else {
    const { error } = await db.from('attendance').delete().match({
      group_id: groupId,
      round_date: matchDate,
      player_id: playerId,
    });
    if (error) return alert(error.message);
  }

  await loadData();
}

async function adjustDrinkCount(playerId, change) {
  const target = players.find((p) => p.id === playerId);
  if (!target) return;

  const nextDrinks = Math.max(0, Number(target.drinks || 0) + change);
  const nextMatches = Number(target.matches || 0) + (change > 0 ? 1 : 0);

  const { error } = await db.from('players').update({
    drinks: nextDrinks,
    last_drink: change > 0 ? new Date().toISOString() : target.last_drink,
    matches: nextMatches,
  }).eq('id', playerId).eq('group_id', groupId);

  if (error) {
    alert(error.message);
    return;
  }

  await loadData();
}

function calculateAverageRatio() {
  if (!players.length) return '0%';
  let total = 0;
  players.forEach((player) => {
    total += getRatio(player);
  });
  return `${(total / players.length).toFixed(0)}%`;
}

function getRatio(player) {
  if (!player.matches || Number(player.matches) === 0) return 0;
  return (Number(player.drinks || 0) / Number(player.matches)) * 100;
}

function formatDisplayDate(dateValue) {
  if (!dateValue) return '-';
  const parsed = new Date(dateValue + 'T00:00:00');
  return parsed.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function colorForName(name) {
  const palette = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#f97316', '#8b5cf6', '#22c55e'];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function subscribeToRealtime() {
  db.channel('football-group')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `group_id=eq.${groupId}` }, () => loadData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `group_id=eq.${groupId}` }, () => loadData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_settings', filter: `group_id=eq.${groupId}` }, () => loadSettings().then(loadData))
    .subscribe();
}
