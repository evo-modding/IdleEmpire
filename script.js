/*
  Cosmic Empire - Idle Game
  VERSION 1.1 (Audio Update)

  - Added sound effects for all major actions.
  - Implemented the sound toggle button logic.
*/

// ---------- Config / Shop data ----------
// ... (Your SHOP_ITEMS, GEM_SHOP_ITEMS, etc. are all here, no changes needed) ...
const SHOP_ITEMS = [
  { id:'droid1', name:'🛰️ Mining Droid', cost:100, gps:1, desc:'+1 gps', max:999 },
  { id:'droid5', name:'🚀 Scout Ship', cost:500, gps:5, desc:'+5 gps', max:999 },
  { id:'harvester', name:'🛸 Asteroid Harvester', cost:1000, gps:15, desc:'+15 gps', max:999 },
  { id:'freighter', name:'🚛 Space Freighter', cost:5000, gps:50, desc:'+50 gps', max:999 },
  { id:'extractor', name:'🌌 Nebula Extractor', cost:15000, gps:150, desc:'+150 gps', max:999 },
  { id:'station', name:'👑 Orbital Station', cost:50000, gps:500, desc:'+500 gps', max:999 },
  { id:'colony', name:'🪐 Planet Colony', cost:200000, gps:2000, desc:'+2,000 gps', max:999 },
  { id:'dyson', name:'💫 Dyson Swarm', cost:1000000, gps:10000, desc:'+10,000 gps', max:999 }
];
const GEM_SHOP_ITEMS = [
  { id:'gem_boost_2x', name:'🔥 2x Gold Boost', cost:10, duration:300, multiplier:2, desc:'2x gold for 5min', type:'boost_gps', currency:'gems' },
  { id:'gem_boost_5x', name:'💥 5x Gold Boost', cost:25, duration:600, multiplier:5, desc:'5x gold for 10min', type:'boost_gps', currency:'gems' },
  { id:'click_frenzy', name:'👆 Click Frenzy', cost:30, duration:60, multiplier:100, desc:'100x click power for 1min', type:'boost_click', currency:'gems' },
  { id:'small_gold_haul', name:'💰 Small Gold Haul', cost:5, goldAmount:10000, desc:'+10,000 gold instantly', type:'instant', currency:'gems' },
  { id:'large_gold_haul', name:'🏦 Large Gold Haul', cost:20, goldAmount:50000, desc:'+50,000 gold instantly', type:'instant', currency:'gems' }
];
const PRESTIGE_SHOP_ITEMS = [
    { id: 'prestige_click_1', name: '✨ Shard-Powered Clicks', cost: 1, max: 10, desc: '+100% Click Power (Permanent)' },
    { id: 'prestige_gps_1', name: '✨ Shard-Infused Droids', cost: 2, max: 10, desc: '+10% GPS Power (Permanent)' },
    { id: 'prestige_start', name: '✨ Quick Start', cost: 5, max: 1, desc: 'Start with 1,000 Gold after Ascending' }
];
const GEMS_PACKS = [
  { id: 'g50', gems:50, price:0.99 },
  { id: 'g300', gems:300, price:4.99 },
  { id: 'g1000', gems:1000, price:14.99, badge:'Best Value!' }
];
const AUTOSAVE_INTERVAL_MS = 30000;
const TICK_MS = 100;
const PRESTIGE_REQ_GOLD = 1e12; // 1 Trillion

// ---------- State ----------
const defaultState = {
  gold: 0,
  gems: 0,
  gps: 0,
  items: {},
  gemItems: {},
  prestigeItems: {},
  activeBoosts: [],
  totalClicks: 0,
  nebulaShards: 0,
  updatedAt: Date.now()
};
let state = { ...defaultState };
let user = null;

// ---------- NEW: Audio ----------
let soundEnabled = true;
const sounds = {
    click: new Audio('click.mp3'),
    buy: new Audio('buy.mp3'),
    boost: new Audio('boost.mp3'),
    ascend: new Audio('ascend.mp3')
};
// Set volumes (optional)
sounds.click.volume = 0.5;
sounds.buy.volume = 0.3;
sounds.boost.volume = 0.4;
sounds.ascend.volume = 0.6;

// ---------- Utilities ----------
const $ = sel => document.querySelector(sel);
const logEl = txt => {
  const e = $('#log');
  if (e) {
    e.innerHTML = `<div class="log-entry"><span class="log-time">[${new Date().toLocaleTimeString()}]</span> ${txt}</div>` + e.innerHTML;
  }
};
const setStatus = txt => { 
    const e = $('#statusBar');
    if (e) e.textContent = 'Status: ' + txt; 
}
function formatNumber(num) {
    if (num < 1e6) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
    const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
    const i = Math.floor(Math.log10(num) / 3);
    const val = (num / Math.pow(10, i * 3));
    return val.toFixed(2) + suffixes[i];
}

// ---------- NEW: Sound Player ----------
function playSound(sound) {
    if (soundEnabled && sound) {
        sound.currentTime = 0; // Rewind to start
        sound.play().catch(e => console.warn("Audio play failed:", e));
    }
}

// ---------- Boost & Prestige Logic ----------
// ... (All functions from getActiveGpsBoost to getPrestigeGain are identical) ...
function getActiveGpsBoost() {
  const now = Date.now();
  let maxMultiplier = 1;
  state.activeBoosts = (state.activeBoosts || []).filter(b => b.endsAt > now);
  state.activeBoosts.forEach(b => {
    if ((b.type === 'gps' || !b.type) && b.multiplier > maxMultiplier) {
      maxMultiplier = b.multiplier;
    }
  });
  return maxMultiplier;
}
function getActiveClickBoost() {
  const now = Date.now();
  let maxMultiplier = 1;
  state.activeBoosts = (state.activeBoosts || []).filter(b => b.endsAt > now);
  state.activeBoosts.forEach(b => {
    if (b.type === 'click' && b.multiplier > maxMultiplier) {
      maxMultiplier = b.multiplier;
    }
  });
  return maxMultiplier;
}
function getNebulaShardBonus() {
    return 1 + (state.nebulaShards * 0.05);
}
function getPermanentGpsMultiplier() {
  const count = (state.prestigeItems && state.prestigeItems['prestige_gps_1']) || 0;
  return 1 + (count * 0.1);
}
function getPermanentClickMultiplier() {
  const count = (state.prestigeItems && state.prestigeItems['prestige_click_1']) || 0;
  return 1 + count; // 1 + (1 * 100%)
}
function getPrestigeGain() {
    if (state.gold < PRESTIGE_REQ_GOLD) return 0;
    return Math.floor(Math.sqrt(state.gold / PRESTIGE_REQ_GOLD));
}

// ---------- Rendering ----------
// ... (All rendering functions are identical) ...
function updateHUD(){
  const shardBonus = getNebulaShardBonus();
  const permGpsBonus = getPermanentGpsMultiplier();
  const boostMultiplier = getActiveGpsBoost();
  const effectiveGps = state.gps * shardBonus * permGpsBonus * boostMultiplier;

  $('#gold').textContent = formatNumber(Math.floor(state.gold));
  $('#gems').textContent = formatNumber(state.gems);
  $('#gps').textContent = formatNumber(Math.floor(effectiveGps));
  $('#totalClicks').textContent = formatNumber(state.totalClicks);
  $('#nebulaShards').textContent = formatNumber(state.nebulaShards);

  const permClickMulti = getPermanentClickMultiplier();
  const clickBoost = getActiveClickBoost();
  const baseClick = 1;
  const clickValue = (baseClick * permClickMulti * clickBoost);
  $('#clickValue').textContent = formatNumber(clickValue);

  const prestigeGain = getPrestigeGain();
  $('#prestigeGain').textContent = formatNumber(prestigeGain);
  const btnAscend = $('#btnAscend');
  if (prestigeGain > 0) {
    btnAscend.disabled = false;
    btnAscend.textContent = `ASCEND FOR +${formatNumber(prestigeGain)} SHARDS`;
  } else {
    btnAscend.disabled = true;
    btnAscend.textContent = 'ASCEND';
  }
}
function renderSlowUI() {
  $('#username').textContent = user ? `${user.username}` : '—';
  renderShop();
  renderGemShop();
  renderPrestigeShop();
  renderActiveBoosts();
}
function renderStats(){
  updateHUD();
  renderSlowUI();
}
function renderShop(){
  const wrap = $('#shopList');
  wrap.innerHTML = '';
  SHOP_ITEMS.forEach(it=>{
    const count = state.items[it.id] || 0;
    const node = document.createElement('div');
    node.className = 'shop-item';
    node.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${it.name}</div>
        <div class="shop-item-desc">${it.desc}</div>
        <div class="shop-item-owned">Owned: ${count}</div>
      </div>
      <div class="shop-item-actions">
        <div class="shop-item-cost">${formatNumber(it.cost)} Gold</div>
        <button class="btn btn-small btn-primary buyBtn" data-id="${it.id}">Buy</button>
      </div>`;
    wrap.appendChild(node);
  });
}
function renderGemShop(){
  const wrap = $('#gemShopList');
  wrap.innerHTML = '';
  GEM_SHOP_ITEMS.forEach(it=>{
    const count = (state.gemItems && state.gemItems[it.id]) || 0;
    const node = document.createElement('div');
    node.className = 'shop-item';
    let statusText = `Owned: ${count}`;
    if(it.max) statusText = `Owned: ${count}/${it.max}`;
    if(it.type.includes('boost')) {
         const active = (state.activeBoosts || []).find(b => b.id === it.id && b.endsAt > Date.now());
         if(active) {
            const remaining = Math.ceil((active.endsAt - Date.now()) / 1000);
            statusText = `<span style="color:var(--accent-green)">Active: ${remaining}s</span>`;
         } else {
            statusText = '';
         }
    }
    node.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${it.name}</div>
        <div class="shop-item-desc">${it.desc}</div>
        <div class="shop-item-owned">${statusText}</div>
      </div>
      <div class="shop-item-actions">
        <div class="shop-item-cost">${it.cost} Gems</div>
        <button class="btn btn-small btn-secondary buyGemBtn" data-id="${it.id}">Buy</button>
      </div>`;
    wrap.appendChild(node);
  });
}
function renderPrestigeShop() {
  const wrap = $('#prestigeShopList');
  wrap.innerHTML = '';
  PRESTIGE_SHOP_ITEMS.forEach(it=>{
    const count = (state.prestigeItems && state.prestigeItems[it.id]) || 0;
    const node = document.createElement('div');
    node.className = 'shop-item';
    node.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${it.name}</div>
        <div class="shop-item-desc">${it.desc}</div>
        <div class="shop-item-owned">Owned: ${count}/${it.max}</div>
      </div>
      <div class="shop-item-actions">
        <div class="shop-item-cost">${it.cost} Shards</div>
        <button class="btn btn-small btn-secondary buyPrestigeBtn" data-id="${it.id}">Buy</button>
      </div>`;
    wrap.appendChild(node);
  });
}
function renderActiveBoosts() {
  let boostArea = $('#activeBoosts');
  if(!boostArea) return; 
  boostArea.innerHTML = '';
  const now = Date.now();
  let hasBoosts = false;
  (state.activeBoosts || []).forEach(boost => {
    if(boost.endsAt > now) {
      hasBoosts = true;
      const remaining = Math.ceil((boost.endsAt - now) / 1000);
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      const el = document.createElement('div');
      el.className = 'boost-item';
      let text = `🔥 ${boost.multiplier}x Boost`;
      if (boost.type === 'click') {
        text = `🖱️ ${boost.multiplier}x Click`;
      }
      el.innerHTML = `
        <span class="boost-name">${text}</span>
        <span class="boost-timer">${minutes}:${seconds.toString().padStart(2,'0')}</span>
      `;
      boostArea.appendChild(el);
    }
  });
  if (!hasBoosts) {
    boostArea.innerHTML = '<div class="no-boosts">No active boosts</div>';
  }
}

// ---------- Game mechanics ----------
function recalcGps(){
  let gps = 0;
  SHOP_ITEMS.forEach(it=>{
    const cnt = state.items[it.id] || 0;
    gps += cnt * it.gps;
  });
  state.gps = gps;
  updateHUD();
}

$('#btnClick').addEventListener('click', (e)=>{
  // --- SOUND ---
  playSound(sounds.click);
  
  const permClickMulti = getPermanentClickMultiplier();
  const clickBoost = getActiveClickBoost();
  const baseClick = 1;
  const clickValue = (baseClick * permClickMulti * clickBoost);
  
  state.gold += clickValue;
  state.totalClicks += 1;
  state.updatedAt = Date.now();
  updateHUD();
  
  const x = e.clientX;
  const y = e.clientY;
  const floatNum = document.createElement('div');
  floatNum.className = 'floating-number';
  floatNum.style.left = `${x}px`;
  floatNum.style.top = `${y}px`;
  floatNum.style.color = 'var(--accent-gold)';
  floatNum.textContent = `+${formatNumber(clickValue)}`;
  document.body.appendChild(floatNum);
  setTimeout(() => floatNum.remove(), 1000);
});

document.addEventListener('click', async (ev)=>{
  const b = ev.target.closest('button');
  if(!b) return;

  if(b.matches('.buyBtn')){
    const id = b.dataset.id; buyItem(id);
  }
  if(b.matches('.buyGemBtn')){
    const id = b.dataset.id; buyGemItem(id);
  }
  if(b.matches('.buyPrestigeBtn')){
    const id = b.dataset.id; buyPrestigeItem(id);
  }
  if(b.matches('#btnAscend')) {
    doPrestige();
  }
  
  // --- NEW: Sound Toggle Listener ---
  if(b.matches('#soundToggle') || b.closest('#soundToggle')) {
    soundEnabled = !soundEnabled; // Flip the state
    $('#soundIcon').textContent = soundEnabled ? '🔊' : '🔇';
    logEl(`Sounds ${soundEnabled ? 'Enabled' : 'Disabled'}`);
  }
});

function buyItem(id, qty=1){
  const it = SHOP_ITEMS.find(x=>x.id===id);
  if(!it) return;
  
  if(state.gold >= it.cost){
    // --- SOUND ---
    playSound(sounds.buy);
    
    state.gold -= it.cost;
    state.items[id] = (state.items[id]||0) + 1;
    
    recalcGps();
    state.updatedAt = Date.now();
    renderStats();
    doSave(false);
    logEl(`Purchased ${it.name}`);
  } else {
    logEl(`Not enough gold for ${it.name}`);
  }
}

function buyGemItem(id) {
  const it = GEM_SHOP_ITEMS.find(x => x.id === id);
  if(!it) return;
  if(!user){
    logEl('Login required to purchase gem items.');
    return;
  }
  if(state.gems < it.cost) {
    logEl(`Not enough gems! Need ${it.cost} gems`);
    return;
  }
  
  state.gemItems = state.gemItems || {};
  
  if(it.type.includes('boost')) {
    const existing = (state.activeBoosts || []).find(b => b.id === id && b.endsAt > Date.now());
    if(existing) {
      logEl(`${it.name} already active!`);
      return;
    }
    // --- SOUND ---
    playSound(sounds.boost);
    
    state.gems -= it.cost;
    state.activeBoosts = state.activeBoosts || [];
    state.activeBoosts.push({
      id: id,
      multiplier: it.multiplier,
      endsAt: Date.now() + (it.duration * 1000),
      type: it.type === 'boost_click' ? 'click' : 'gps'
    });
    logEl(`🔥 Activated ${it.name}!`);
    
  } else if(it.type === 'instant') {
    // --- SOUND ---
    playSound(sounds.buy);
    
    state.gems -= it.cost;
    state.gold += it.goldAmount;
    logEl(`💰 Instant ${formatNumber(it.goldAmount)} gold added!`);
  }
  
  state.updatedAt = Date.now();
  renderStats();
  doSave(false);
}

function buyPrestigeItem(id) {
    const it = PRESTIGE_SHOP_ITEMS.find(x => x.id === id);
    if (!it) return;
    if (!user) {
        logEl('Login required to purchase prestige items.');
        return;
    }
    if (state.nebulaShards < it.cost) {
        logEl(`Not enough Nebula Shards! Need ${it.cost}`);
        return;
    }

    state.prestigeItems = state.prestigeItems || {};
    const current = state.prestigeItems[id] || 0;
    if (current >= it.max) {
        logEl(`Maximum ${it.name} reached!`);
        return;
    }
    
    // --- SOUND ---
    playSound(sounds.buy);

    state.nebulaShards -= it.cost;
    state.prestigeItems[id] = current + 1;
    logEl(`Purchased ${it.name}!`);

    state.updatedAt = Date.now();
    recalcGps();
    renderStats();
    doSave(false);
}

function doPrestige() {
    const gain = getPrestigeGain();
    if (gain <= 0) {
        logEl('Cannot Ascend yet!');
        return;
    }
    
    // --- SOUND ---
    playSound(sounds.ascend);

    logEl(`🌌 ASCENDED! Gained ${formatNumber(gain)} Nebula Shards.`);

    const newShards = state.nebulaShards + gain;
    const prestigeItems = state.prestigeItems;
    const gems = state.gems;
    const quickStart = (prestigeItems['prestige_start'] || 0) > 0;

    state = { ...defaultState };
    state.gems = gems;
    state.nebulaShards = newShards;
    state.prestigeItems = prestigeItems;
    state.gold = quickStart ? 1000 : 0;

    state.updatedAt = Date.now();
    recalcGps();
    renderStats();
    doSave(false);
}

// ---------- Auto clicker ticks ----------
// ... (Game loops are identical) ...
let lastTickTime = Date.now();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const now = Date.now();
    const timePassed = now - lastTickTime;
    const secondsPassed = timePassed / 1000;
    if(state.gps > 0 && secondsPassed > 1) {
      const shardBonus = getNebulaShardBonus();
      const permGpsBonus = getPermanentGpsMultiplier();
      const offlineGold = (state.gps * shardBonus * permGpsBonus) * secondsPassed;
      state.gold += offlineGold;
      state.updatedAt = now;
      renderStats();
      if(user) doSave(false);
      logEl(`Welcome back! Earned ${formatNumber(offlineGold)} gold while away (${Math.floor(secondsPassed)}s)`);
    }
    lastTickTime = now;
  } else {
    lastTickTime = Date.now();
    if(user) doSave(false);
  }
});
setInterval(()=> {
  if(state.gps > 0){
    const shardBonus = getNebulaShardBonus();
    const permGpsBonus = getPermanentGpsMultiplier();
    const boostMultiplier = getActiveGpsBoost();
    const goldPerTick = (state.gps * shardBonus * permGpsBonus * boostMultiplier) / 10;
    
    state.gold += goldPerTick;
    state.updatedAt = Date.now();
    lastTickTime = Date.now();
    updateHUD();
  }
  checkPrestigeButton();
}, TICK_MS);
setInterval(() => {
  renderActiveBoosts();
}, 1000);
function checkPrestigeButton() {
    const btnAscend = $('#btnAscend');
    if (!btnAscend) return;
    const prestigeGain = getPrestigeGain();
    if (prestigeGain > 0 && btnAscend.disabled) {
        btnAscend.disabled = false;
        btnAscend.textContent = `ASCEND FOR +${formatNumber(prestigeGain)} SHARDS`;
    } else if (prestigeGain <= 0 && !btnAscend.disabled) {
        btnAscend.disabled = true;
        btnAscend.textContent = 'ASCEND';
    }
}


// ---------- Save / Load (SQL-Only) ----------
// ... (Save/Load functions are identical) ...
$('#btnSave').addEventListener('click', ()=> doSave(true));
$('#btnLoad').addEventListener('click', ()=> doLoad(true));
async function doSave(showFeedback=false){
  if(!user){
    if(showFeedback) setStatus('Login required to save to cloud');
    return;
  }
  setStatus('Saving to server...');
  try{
    const res = await fetch('api.php?action=save', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ 
        gold: state.gold,
        gps: state.gps,
        items: state.items,
        gemItems: state.gemItems,
        prestigeItems: state.prestigeItems,
        activeBoosts: state.activeBoosts,
        totalClicks: state.totalClicks,
        nebulaShards: state.nebulaShards,
        updatedAt: Date.now()
      })
    });
    const j = await res.json();
    if(j && j.success){
      setStatus('Saved to server ✔️');
      if(showFeedback) logEl('Saved to server');
    } else {
      setStatus('Server save failed');
      logEl('Server save failed: ' + (j && j.error ? j.error : 'unknown'));
    }
  } catch(e){
    setStatus('Server save error');
    logEl('Server save error: ' + e.message);
  }
}
async function doLoad(showFeedback=false){
  if(!user){
    if(showFeedback) setStatus('Login required to load from cloud');
    return;
  }
  setStatus('Loading from server...');
  try{
    const res = await fetch('api.php?action=load');
    const j = await res.json();
    if(j && j.success && j.data){
      state = { ...defaultState, ...j.data };
      state.items = state.items || {};
      state.gemItems = state.gemItems || {};
      state.prestigeItems = state.prestigeItems || {};
      state.activeBoosts = state.activeBoosts || [];
      state.gems = state.gems || 0; 
      
      recalcGps();
      renderStats();
      setStatus('Loaded from server ✔️');
      logEl('Loaded save from server');
      
      if(j.offline && j.offline.earnings > 0) {
        const hours = Math.floor(j.offline.seconds / 3600);
        const minutes = Math.floor((j.offline.seconds % 3600) / 60);
        let timeStr = '';
        if(hours > 0) timeStr = `${hours}h ${minutes}m`;
        else if(minutes > 0) timeStr = `${minutes}m`;
        else timeStr = `${j.offline.seconds}s`;
        
        logEl(`💰 Welcome back! You earned ${formatNumber(j.offline.earnings)} gold while offline (${timeStr})`);
        setStatus(`Earned ${formatNumber(j.offline.earnings)} gold offline!`);
        showOfflineEarnings(Math.floor(j.offline.earnings), timeStr);
      }
    } else {
      setStatus('No remote save');
      logEl('No remote save found: ' + (j && j.error ? j.error : 'empty response'));
    }
  } catch(e){
    setStatus('Server load error');
    logEl('Server load error: ' + e.message);
  }
}
function showOfflineEarnings(gold, timeStr) {
  // --- SOUND ---
  playSound(sounds.ascend);

  const notif = document.createElement('div');
  notif.className = 'offline-popup'; 
  notif.innerHTML = `
    <div class="offline-popup-content">
      <div class="offline-popup-icon">💰</div>
      <div>Welcome Back!</div>
      <div class="offline-popup-title">+${formatNumber(gold)} Gold</div>
      <div class="offline-popup-time">Earned while offline (${timeStr})</div>
    </div>
  `;
  document.body.appendChild(notif);
  setTimeout(() => {
    notif.style.animation = 'popOut 0.3s ease-in forwards';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// ---------- Authentication ----------
// ... (Authentication functions are identical) ...
$('#modalLogin').addEventListener('click', () => submitAuth('login'));
$('#modalRegister').addEventListener('click', () => submitAuth('register'));
$('#btnLogout').addEventListener('click', async ()=>{
  try {
    await fetch('auth.php?action=logout');
  } catch(e){}
  user = null;
  state = { ...defaultState };
  showLoginModal();
  setStatus('Logged out');
  logEl('Logged out.');
  renderStats(); 
});
async function submitAuth(mode){
  const u = $('#inUser').value.trim();
  const p = $('#inPass').value.trim();
  const msg = $('#modalMsg');
  if(u.length < 3 || p.length < 6){
    msg.textContent = 'Username min 3 chars, password min 6 chars';
    return;
  }
  $('#spinner').style.display = 'inline';
  msg.textContent = '';
  try{
    const form = new URLSearchParams();
    form.append('username', u);
    form.append('password', p);
    const res = await fetch('auth.php?action=' + mode, { method:'POST', body: form });
    const j = await res.json();
    if(j && j.success){
      $('#spinner').style.display = 'none';
      setStatus(`${mode} successful`);
      logEl(`${mode} successful for ${u}`);
      
      if(mode === 'login' && j.id && j.username){
        user = { id: j.id, username: j.username, logged: true, gems: j.gems || 0 };
        state.gems = user.gems;
        hideLoginModal();
        setStatus('Logged in as ' + j.username);
        logEl('Logged in as ' + j.username);
        await doLoad(false); 
        renderStats(); 
      } else {
        msg.textContent = 'Account created! Please log in.';
      }
    } else {
      $('#spinner').style.display = 'none';
      msg.textContent = j && j.error ? j.error : 'Error';
    }
  } catch(e){
    $('#spinner').style.display = 'none';
    msg.textContent = e.message;
  }
}
function showLoginModal(){
  $('#loginModal').classList.remove('hidden');
  $('#app').classList.add('hidden');
  $('#btnLogout').classList.add('hidden');
  $('#inUser').focus();
}
function hideLoginModal() {
    $('#loginModal').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#btnLogout').classList.remove('hidden');
}
async function checkStatus(){
  try{
    const res = await fetch('auth.php?action=status');
    const j = await res.json();
    if(j && j.logged){
      user = j;
      state.gems = user.gems || 0;
      hideLoginModal();
      setStatus('Logged in as ' + j.username);
      logEl('Logged in as ' + j.username);
      await doLoad(false); 
    } else {
      user = null;
      showLoginModal();
      setStatus('Not logged in');
      logEl('Awaiting login...');
    }
    renderStats(); 
  } catch(e){
    user = null;
    showLoginModal();
    setStatus('Status check failed');
    // --- THIS LINE IS NOW FIXED ---
    logEl('Status check failed: ' + e.message);
  }
}

// ---------- Stripe purchase flow ----------
// ... (Stripe functions are identical) ...
async function startStripeCheckout(gems, price, packId){
  if (!user) {
    logEl('Login required to make purchases.');
    return;
  }
  setStatus('Initiating secure checkout...');
  logEl(`Starting purchase: ${gems} gems for $${price}`);
  try {
    const res = await fetch('api.php?action=create_checkout_session', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ packId: packId })
    });
    const j = await res.json();
    if(j && j.success && j.redirectUrl){
      setStatus('Redirecting to Stripe...');
      window.location.href = j.redirectUrl;
    } else {
      setStatus('Checkout failed');
      logEl('Checkout session failed: ' + (j && j.error ? j.error : 'unknown'));
    }
  } catch(e) {
    setStatus('Checkout error');
    logEl('Checkout error: ' + e.message);
  }
}
$('#btnBuyGems').addEventListener('click', ()=> startStripeCheckout(50, 0.99, 'g50'));
$('#btnBuyGemsLarge').addEventListener('click', ()=> startStripeCheckout(300, 4.99, 'g300'));
$('#btnBuyGemsMega').addEventListener('click', ()=> startStripeCheckout(1000, 14.99, 'g1000'));


// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  const loadingScreen = $('#loadingScreen');
  renderStats();
  
  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get('payment');
  
  setStatus('Checking authentication...');
  await checkStatus();
  
  if(user) {
    if(paymentStatus === 'success') {
      logEl('Payment verified! Reloading save data...');
      setStatus('Payment successful, reloading save data...');
      await doLoad(false);
    } else if (paymentStatus === 'cancelled') {
      setStatus('Payment cancelled.');
      logEl('Payment process cancelled by user.');
    }
  }
  
  if(paymentStatus) {
    const newUrl = window.location.href.split('?')[0];
    history.replaceState({}, document.title, newUrl);
  }

  // Hide loading screen
  loadingScreen.style.opacity = '0';
  setTimeout(() => loadingScreen.classList.add('hidden'), 300);
});