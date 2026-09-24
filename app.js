const configured = window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !window.SUPABASE_URL.includes('YOUR-PROJECT') && !window.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
const db = configured ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;
const groupId = window.FOOTBALL_GROUP_ID || 'vriendengroep';
let players = [];
let attendance = new Set();
let currentAssignment = null;

const $ = (selector) => document.querySelector(selector);
const status = $('#connection-status');

if (!db) {
  $('#setup-warning').textContent = 'Supabase is nog niet ingesteld. Vul config.js in met de URL en anon key van jullie Supabase-project.';
  $('#setup-warning').classList.remove('hidden');
  $('#connection-status').textContent = 'Niet verbonden met Supabase';
  $('#player-form button').disabled = true;
  $('#choose-button').disabled = true;
} else {
  start();
}

async function start() {
  $('#round-date').textContent = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'full' }).format(new Date());
  await load();
  db.channel('football-drinks')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `group_id=eq.${groupId}` }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `group_id=eq.${groupId}` }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `group_id=eq.${groupId}` }, load)
    .subscribe();
  setInterval(load, 10000);
}

async function load() {
  const [playerResult, attendanceResult, roundResult] = await Promise.all([
    db.from('players').select('*').eq('group_id', groupId).order('name'),
    db.from('attendance').select('player_id').eq('group_id', groupId).eq('round_date', today()),
    db.from('rounds').select('*').eq('group_id', groupId).order('played_at', { ascending: false }).limit(20),
  ]);
  const error = playerResult.error || attendanceResult.error || roundResult.error;
  if (error) { status.textContent = `Fout: ${error.message}`; return; }
  players = playerResult.data || [];
  attendance = new Set((attendanceResult.data || []).map((row) => row.player_id));
  currentAssignment = attendanceResult.data?.find((row) => row.assigned_player_id)?.assigned_player_id || null;
  render(roundResult.data || []);
  status.textContent = 'Verbonden — wijzigingen worden gedeeld';
}

function render(rounds) {
  $('#attendee-count').textContent = `${attendance.size} deelnemer${attendance.size === 1 ? '' : 's'}`;
  $('#empty-players').classList.toggle('hidden', players.length > 0);
  $('#players').innerHTML = players.map((player) => {
    const checked = attendance.has(player.id);
    const ratio = player.matches ? `${Math.round((player.drinks / player.matches) * 100)}%` : 'nog geen beurt';
    return `<label class="player ${checked ? 'active' : ''}">
      <span class="player-info"><strong>${escapeHtml(player.name)}</strong><small>${player.drinks}x drinken · ${ratio}</small></span>
      <input type="checkbox" data-player="${player.id}" ${checked ? 'checked' : ''} />
      <span class="slider"></span>
    </label>`;
  }).join('');
  $('#players').querySelectorAll('input').forEach((input) => input.addEventListener('change', () => toggleAttendance(input.dataset.player, input.checked)));
  $('#assignment').classList.toggle('hidden', !currentAssignment);
  if (currentAssignment) {
    const person = players.find((p) => p.id === currentAssignment);
    $('#assignment').innerHTML = `<span class="eyebrow">Deze avond neemt mee</span><strong>${escapeHtml(person?.name || 'Onbekend')}</strong><p>Na bevestiging wordt deze beurt opgeslagen in de historie.</p><button id="confirm-button" class="button success">Bevestig en sluit avond</button>`;
    $('#confirm-button').addEventListener('click', () => confirmRound(person));
  }
  $('#history').innerHTML = rounds.length ? rounds.map((round) => `<article><strong>${escapeHtml(round.player_name)}</strong><span>${new Date(round.played_at).toLocaleDateString('nl-NL')} · ${round.attendee_count} deelnemers</span></article>`).join('') : '<p class="muted">Nog geen afgeronde voetbalavonden.</p>';
}

async function toggleAttendance(playerId, checked) {
  const query = checked ? db.from('attendance').upsert({ group_id: groupId, round_date: today(), player_id: playerId }, { onConflict: 'group_id,round_date,player_id' }) : db.from('attendance').delete().match({ group_id: groupId, round_date: today(), player_id: playerId });
  const { error } = await query;
  if (error) alert(error.message); else await load();
}

$('#choose-button').addEventListener('click', async () => {
  if (!attendance.size) return alert('Zet eerst de spelers aan die meedoen.');
  const eligible = players.filter((p) => attendance.has(p.id)).sort((a, b) => a.drinks - b.drinks || new Date(a.last_drink || 0) - new Date(b.last_drink || 0) || a.name.localeCompare(b.name));
  const chosen = eligible[0];
  const { error } = await db.from('attendance').update({ assigned_player_id: chosen.id }).eq('group_id', groupId).eq('round_date', today());
  if (error) alert(error.message); else await load();
});

$('#player-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('#player-name').value.trim();
  if (!name) return;
  const { error } = await db.from('players').insert({ group_id: groupId, name });
  if (error) alert(error.message); else { $('#player-name').value = ''; await load(); }
});

async function confirmRound(person) {
  if (!person || !currentAssignment) return;
  const { error } = await db.rpc('complete_round', { p_group_id: groupId, p_round_date: today(), p_player_id: person.id });
  if (error) alert(`Kon avond niet afronden: ${error.message}`); else { currentAssignment = null; await load(); }
}
function today() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
