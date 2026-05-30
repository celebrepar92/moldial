// =========================================================================
// MOLdial 2026 - app.js MEJORADO
// =========================================================================

// --- ESTADO DEL JUEGO ---
let money = 3000;
const PACK_COST = 3000;
const BULK_COUNT = 5;
const BULK_DISCOUNT = 0.9; // 10% descuento

let db = [];
let albumPages = [];
let currentPageIndex = 0;
let pendingCards = [];
let currentRevealQueue = [];
let currentRevealedCard = null;
let buyStreak = 0;         // Racha de sobres comprados
let totalPacks = 0;        // Total de sobres comprados
let totalStickered = 0;    // Total de figuritas pegadas
let totalSold = 0;         // Total vendido en $
let isBulkMode = false;    // Si estamos abriendo en modo "x5"
let bulkQueue = [];        // Cola de sobres en modo bulk
let firstTime = true;
let tutStep = 0;
let initialQueueSize = 0;

const sellValues   = { 1: 500, 2: 1000, 3: 1500, 4: 1800, 5: 3000 };
const rarityNames  = { 1: "Común", 2: "Poco Común", 3: "Rara", 4: "Épica", 5: "Legendaria" };
const rarityEmoji  = { 1: "⚪", 2: "🟢", 3: "🔵", 4: "🟣", 5: "⭐" };

// --- LOGROS ---
const ACHIEVEMENTS = [
    { id: 'first_pack',     icon: '🎴', name: 'Primera Compra',    desc: 'Compraste tu primer sobre.',                  check: () => totalPacks >= 1 },
    { id: 'first_paste',    icon: '📌', name: 'Primer Pegado',     desc: 'Pegaste tu primera figurita.',                check: () => totalStickered >= 1 },
    { id: 'first_legend',   icon: '⭐', name: 'Leyenda Viva',      desc: 'Sacaste una figurita Legendaria.',            check: () => unlockedLegendary },
    { id: 'streak3',        icon: '🔥', name: 'En Racha',          desc: 'Compraste 3 sobres seguidos.',                check: () => buyStreak >= 3 },
    { id: 'streak5',        icon: '🔥🔥','name': 'Adicto',         desc: 'Compraste 5 sobres seguidos.',                check: () => buyStreak >= 5 },
    { id: 'broke',          icon: '💸', name: 'Al Filo',           desc: 'Sobreviviste con menos de $500.',             check: () => nearBroke },
    { id: 'sold5k',         icon: '💰', name: 'Marchante',         desc: 'Vendiste $5.000 o más en total.',             check: () => totalSold >= 5000 },
    { id: 'half_album',     icon: '📖', name: 'Medio Álbum',       desc: 'Completaste el 50% del álbum.',              check: () => (totalStickered / Math.max(db.length,1)) >= 0.5 },
    { id: 'full_album',     icon: '🏆', name: 'Álbum Completo',    desc: '¡Completaste todo el álbum!',                check: () => totalStickered >= db.length },
    { id: 'bulk_buyer',     icon: '📦', name: 'Mayorista',         desc: 'Compraste un pack de 5 sobres.',             check: () => boughtBulk },
];

let unlockedAchievements = new Set();
let unlockedLegendary = false;
let nearBroke = false;
let boughtBulk = false;

// --- AUDIO (Web Audio API) ---
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playSound(type) {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'buy') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'flip') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'paste') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'sell') {
            // "cash register" effect
            [0, 0.05, 0.1].forEach((t, i) => {
                const o2 = ctx.createOscillator();
                const g2 = ctx.createGain();
                o2.connect(g2); g2.connect(ctx.destination);
                o2.type = 'sine';
                o2.frequency.value = [523, 659, 784][i];
                g2.gain.setValueAtTime(0.1, now + t);
                g2.gain.exponentialRampToValueAtTime(0.001, now + t + 0.15);
                o2.start(now + t); o2.stop(now + t + 0.15);
            });
        } else if (type === 'legendary') {
            // Fanfare!
            const notes = [523, 659, 784, 1047];
            notes.forEach((freq, i) => {
                const o2 = ctx.createOscillator();
                const g2 = ctx.createGain();
                o2.connect(g2); g2.connect(ctx.destination);
                o2.type = 'triangle';
                o2.frequency.value = freq;
                g2.gain.setValueAtTime(0, now + i * 0.12);
                g2.gain.linearRampToValueAtTime(0.15, now + i * 0.12 + 0.05);
                g2.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
                o2.start(now + i * 0.12);
                o2.stop(now + i * 0.12 + 0.3);
            });
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.start(now); osc.stop(now + 0.25);
        } else if (type === 'streak') {
            [0, 0.08, 0.16].forEach((t, i) => {
                const o2 = ctx.createOscillator();
                const g2 = ctx.createGain();
                o2.connect(g2); g2.connect(ctx.destination);
                o2.type = 'sine';
                o2.frequency.value = [440, 550, 660][i];
                g2.gain.setValueAtTime(0.12, now + t);
                g2.gain.exponentialRampToValueAtTime(0.001, now + t + 0.2);
                o2.start(now + t); o2.stop(now + t + 0.2);
            });
        }
    } catch(e) { /* audio no crítico */ }
}

// --- DOM ---
const budgetEl           = document.getElementById('budget');
const albumContainer     = document.getElementById('album-container');
const btnBuy             = document.getElementById('btn-buy');
const btnBuy5            = document.getElementById('btn-buy-5');
const btnInventory       = document.getElementById('btn-inventory');
const btnLogros          = document.getElementById('btn-logros');
const overlay            = document.getElementById('pack-overlay');
const closeModal         = document.getElementById('close-modal');
const packPresentation   = document.getElementById('pack-presentation');
const packVisual         = document.querySelector('.pack-visual');
const btnOpenPack        = document.getElementById('btn-open-pack');
const cardsContainer     = document.getElementById('cards-container');
const inventoryContainer = document.getElementById('inventory-container');
const inventoryGrid      = document.getElementById('inventory-grid');
const logrosContainer    = document.getElementById('logros-container');
const logrosGrid         = document.getElementById('logros-grid');
const card3D             = document.getElementById('current-card');
const cardFrontContent   = document.getElementById('card-front-content');
const clickToFlipText    = document.getElementById('click-to-flip-text');
const cardActions        = document.getElementById('card-actions');
const cardsCounter       = document.getElementById('cards-counter');
const cardsDots          = document.getElementById('cards-dots');
const btnActionPaste     = document.getElementById('action-paste');
const btnActionSell      = document.getElementById('action-sell');
const btnActionKeep      = document.getElementById('action-keep');
const inventoryBadge     = document.getElementById('inventory-badge');
const logrosBadge        = document.getElementById('logros-badge');

// --- INIT ---
async function init() {
    try {
        const response = await fetch('figuritas.json');
        db = await response.json();
        setupAlbum();
        updateUI();

        if (firstTime) {
            document.getElementById('tutorial-overlay').classList.remove('hidden');
        }
    } catch (error) {
        console.error("Error cargando JSON", error);
        showToast("⚠️ Error cargando datos", 'error');
    }
}

// --- TUTORIAL ---
window.nextTutStep = function() {
    tutStep++;
    document.querySelectorAll('.tutorial-step').forEach((el, i) => {
        el.classList.toggle('hidden', i !== tutStep);
    });
};
window.closeTutorial = function() {
    document.getElementById('tutorial-overlay').classList.add('hidden');
    firstTime = false;
};

// --- SETUP ÁLBUM ---
function setupAlbum() {
    const areas = [...new Set(db.map(f => f.Area))];
    albumPages = areas.sort();

    albumContainer.innerHTML = '';
    albumPages.forEach((area, index) => {
        const pageEl = document.createElement('div');
        pageEl.classList.add('page');
        pageEl.style.zIndex = albumPages.length - index;

        // --- CREAMOS LAS DOS CARAS DE LA PÁGINA ---
        const pageFront = document.createElement('div');
        pageFront.classList.add('page-side', 'page-front');

        const pageBack = document.createElement('div');
        pageBack.classList.add('page-side', 'page-back');
        // Opcional: Podés poner un diseño de "dorso" o dejarlo en blanco texturado
        pageBack.innerHTML = `<div class="page-back-content">MOLdial 2026</div>`; 

        // --- METEMOS EL CONTENIDO EN EL FRENTE ---
        const title = document.createElement('h2');
        title.classList.add('page-title');
        title.innerText = area;
        pageFront.appendChild(title);

        const figuritasArea = db.filter(f => f.Area === area);
        figuritasArea.forEach((fig, fi) => {
            const stickerEl = document.createElement('div');
            stickerEl.classList.add('album-sticker');
            stickerEl.id = `album-slot-${slugify(fig.Nombre)}`;

            const numEl = document.createElement('span');
            numEl.classList.add('sticker-number');
            numEl.innerText = `#${(fi + 1).toString().padStart(2,'0')}`;
            stickerEl.appendChild(numEl);

            pageFront.appendChild(stickerEl);
        });

        // Añadimos ambas caras a la página
        pageEl.appendChild(pageFront);
        pageEl.appendChild(pageBack);

        albumContainer.appendChild(pageEl);
    });
    updateAlbumTurn();
}

function slugify(text) { return String(text).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''); }

// --- NAVEGACIÓN ---
document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPageIndex > 0) { currentPageIndex--; updateAlbumTurn(); playSound('flip'); }
});
document.getElementById('next-page').addEventListener('click', () => {
    if (currentPageIndex < albumPages.length - 1) { currentPageIndex++; updateAlbumTurn(); playSound('flip'); }
});

function updateAlbumTurn() {
    const pages = document.querySelectorAll('.page');
    pages.forEach((page, index) => {
        page.classList.toggle('flipped', index < currentPageIndex);
    });
    // Update page counter label in title
    const currentArea = albumPages[currentPageIndex];
    if (currentArea) {
        document.querySelectorAll('.page')[currentPageIndex];
    }
}

// --- COMPRA DE SOBRES ---
function buildQueue(count) {
    // Racha: si lleva 3+ sobres, sube chances de rareza
    const hasStreakBonus = buyStreak >= 3;
    const queue = [];
    for (let i = 0; i < count * 5; i++) {
        queue.push(pullRandomCard(hasStreakBonus));
    }
    return queue;
}

btnBuy.addEventListener('click', () => {
    if (money < PACK_COST) { playSound('error'); shakeButton(btnBuy); return; }

    money -= PACK_COST;
    totalPacks++;
    buyStreak++;
    isBulkMode = false;

    if (money < 500) nearBroke = true;

    currentRevealQueue = buildQueue(1);
    initialQueueSize = currentRevealQueue.length;
    playSound('buy');

    if (buyStreak >= 3) {
        showStreakLabel(`🔥 RACHA x${buyStreak}`);
        playSound('streak');
    }

    checkAchievements();
    updateUI();
    showModalMode('pack');
});

btnBuy5.addEventListener('click', () => {
    const totalCost = Math.floor(PACK_COST * BULK_COUNT * BULK_DISCOUNT);
    if (money < totalCost) { playSound('error'); shakeButton(btnBuy5); return; }

    money -= totalCost;
    totalPacks += BULK_COUNT;
    buyStreak += BULK_COUNT;
    boughtBulk = true;
    isBulkMode = true;

    if (money < 500) nearBroke = true;

    // En modo bulk, preparamos UNA cola grande de 25 cartas
    currentRevealQueue = buildQueue(BULK_COUNT);
    initialQueueSize = currentRevealQueue.length;
    playSound('buy');

    if (buyStreak >= 3) {
        showStreakLabel(`🔥 RACHA x${buyStreak}`);
        playSound('streak');
    }

    checkAchievements();
    updateUI();
    showModalMode('pack');
});

btnInventory.addEventListener('click', () => {
    if (pendingCards.length > 0) showModalMode('inventory');
    else showToast('📦 Inventario vacío', 'info');
});

btnLogros.addEventListener('click', () => {
    showModalMode('logros');
});

// Historial reciente para anti-repetición
const recentCards = [];
const RECENT_WINDOW = 10;

function pullRandomCard(streakBonus = false) {
    const r = Math.random();
    let targetRarity;

    if (streakBonus) {
        targetRarity = r < 0.015 ? 5 : r < 0.08 ? 4 : r < 0.25 ? 3 : r < 0.55 ? 2 : 1;
    } else {
        targetRarity = r < 0.01 ? 5 : r < 0.06 ? 4 : r < 0.20 ? 3 : r < 0.50 ? 2 : 1;
    }

    let pool = db.filter(f => f["Nivel de rareza"] === targetRarity);
    if (pool.length === 0) pool = db;

    // Preferir cartas que no salieron recientemente
    const freshPool = pool.filter(f => !recentCards.includes(f.Nombre));
    const finalPool = freshPool.length > 0 ? freshPool : pool;

    const card = finalPool[Math.floor(Math.random() * finalPool.length)];

    recentCards.push(card.Nombre);
    if (recentCards.length > RECENT_WINDOW) recentCards.shift();

    return card;
}

// --- MODAL ---
function showModalMode(mode) {
    overlay.classList.remove('hidden');
    packPresentation.classList.add('hidden');
    cardsContainer.classList.add('hidden');
    inventoryContainer.classList.add('hidden');
    logrosContainer.classList.add('hidden');

    if (mode === 'pack') {
        packPresentation.classList.remove('hidden');
        packVisual.classList.remove('shaking');
        btnOpenPack.disabled = false;

        // Actualizar label del sobre si es bulk
        const totalCards = currentRevealQueue.length;
        document.querySelector('.pack-count').innerText = `${totalCards} Figuritas`;
    } else if (mode === 'inventory') {
        inventoryContainer.classList.remove('hidden');
        renderInventory();
    } else if (mode === 'logros') {
        logrosContainer.classList.remove('hidden');
        renderLogros();
    }
}

closeModal.addEventListener('click', () => {
    overlay.classList.add('hidden');
    if (currentRevealQueue.length > 0) {
        pendingCards.push(...currentRevealQueue);
        currentRevealQueue = [];
        updateUI();
    }
    buyStreak = 0; // reset racha al cerrar
    updateUI();
});

btnOpenPack.addEventListener('click', () => {
    packVisual.classList.add('shaking');
    btnOpenPack.disabled = true;

    setTimeout(() => {
        packPresentation.classList.add('hidden');
        cardsContainer.classList.remove('hidden');
        buildDots();
        showNextCardInQueue();
    }, 1500);
});

function buildDots() {
    cardsDots.innerHTML = '';
    const total = currentRevealQueue.length;
    for (let i = 0; i < total; i++) {
        const dot = document.createElement('div');
        dot.className = 'card-dot';
        dot.id = `dot-${i}`;
        cardsDots.appendChild(dot);
    }
}

function updateDots(currentIndex) {
    const total = currentIndex; // cuántas ya pasaron
    document.querySelectorAll('.card-dot').forEach((dot, i) => {
        if (i < total) dot.classList.add('done');
        else if (i === total) dot.classList.add('active');
        else { dot.classList.remove('done', 'active'); }
    });
}

function showNextCardInQueue() {
    if (currentRevealQueue.length === 0) {
        closeModal.click();
        return;
    }

    currentRevealedCard = currentRevealQueue[0];

    const totalCards = initialQueueSize; 
    const currentIdx = totalCards - currentRevealQueue.length + 1; 
    
    cardsCounter.innerText = `Figurita ${currentIdx} de ${totalCards}`;

    updateDots(currentIdx - 1);

    // Reset carta
    card3D.classList.remove('is-flipped');
    card3D.className = 'card-3d';
    cardActions.classList.add('hidden');
    clickToFlipText.classList.remove('hidden');

    const rarity = currentRevealedCard["Nivel de rareza"];
    card3D.classList.add(`rarity-${rarity}`);

    if (rarity === 5) {
        unlockedLegendary = true;
        checkAchievements();
    }

    // Emoji de fallback si no hay imagen
    const fallbackEmoji = ['😐','😊','😎','🦸','👑'][rarity - 1];
    const imgTag = currentRevealedCard.Imagen
        ? `<img src="${currentRevealedCard.Imagen}" class="card-img" alt="foto">`
        : `<div class="card-img" style="font-size:2.8rem;background:rgba(255,255,255,0.05)">${fallbackEmoji}</div>`;

    const sellPrice = sellValues[rarity];
    const streakBadge = buyStreak >= 3 ? `<div class="streak-bonus-badge">🔥 RACHA</div>` : '';

    cardFrontContent.innerHTML = `
        ${streakBadge}
        <div class="card-holographic"></div>
        ${imgTag}
        <div class="card-name">${currentRevealedCard.Nombre}</div>
        <div class="card-area">${currentRevealedCard.Area}</div>
        <div class="card-rarity-badge">${rarityEmoji[rarity]} ${rarityNames[rarity]}</div>
    `;

    btnActionSell.innerText = '';
    btnActionSell.innerHTML = `<span class="action-icon">💰</span> Vender ($${sellPrice.toLocaleString('es-AR')})`;
}

// --- VOLTEAR CARTA ---
document.querySelector('.scene').addEventListener('click', () => {
    if (!card3D.classList.contains('is-flipped')) {
        card3D.classList.add('is-flipped');
        clickToFlipText.classList.add('hidden');
        playSound('flip');

        const rarity = currentRevealedCard?.["Nivel de rareza"] || 1;
        if (rarity >= 4) {
            setTimeout(() => spawnParticles(rarity), 400);
        }
        if (rarity === 5) {
            setTimeout(() => playSound('legendary'), 300);
            showToast(`⭐ ¡LEGENDARIA! ${currentRevealedCard.Nombre}`, 'legendary');
        } else if (rarity === 4) {
            showToast(`🟣 ¡Épica! ${currentRevealedCard.Nombre}`, 'rare');
        } else if (rarity === 3) {
            showToast(`🔵 Rara: ${currentRevealedCard.Nombre}`, 'rare');
        }

        // Efecto holográfico en épica/legendaria
        if (rarity >= 4) {
            const holo = cardFrontContent.querySelector('.card-holographic');
            if (holo) holo.style.opacity = '1';
        }

        setTimeout(() => cardActions.classList.remove('hidden'), 450);
    }
});

// Efecto holográfico al mover el mouse
document.querySelector('.scene').addEventListener('mousemove', (e) => {
    if (!card3D.classList.contains('is-flipped')) return;
    const rarity = currentRevealedCard?.["Nivel de rareza"] || 1;
    if (rarity < 4) return;

    const holo = cardFrontContent.querySelector('.card-holographic');
    if (!holo) return;

    const rect = card3D.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    holo.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.25) 0%, transparent 60%)`;
});

// --- ACCIONES DE CARTA ---
btnActionPaste.addEventListener('click', () => {
    cardActions.classList.add('hidden');
    executePasteAnimation(currentRevealedCard, () => {
        currentRevealQueue.shift();
        updateUI();
        checkAchievements();
        showNextCardInQueue();
    });
});

btnActionSell.addEventListener('click', () => {
    const val = sellValues[currentRevealedCard["Nivel de rareza"]];
    money += val;
    totalSold += val;
    playSound('sell');
    showToast(`💰 +$${val.toLocaleString('es-AR')} vendido`, 'money');
    animateBudget();
    currentRevealQueue.shift();
    checkAchievements();
    showNextCardInQueue();
    updateUI();
});

btnActionKeep.addEventListener('click', () => {
    pendingCards.push(currentRevealedCard);
    currentRevealQueue.shift();
    showToast(`🎒 Guardado en inventario`, 'info');
    showNextCardInQueue();
    updateUI();
});

// --- INVENTARIO DESDE MODAL ---
window.invPaste = function(index) {
    const card = pendingCards[index];
    pendingCards.splice(index, 1);
    executePasteAnimation(card, () => {
        renderInventory();
        checkAchievements();
        updateUI();
    });
};
window.invSell = function(index) {
    const val = sellValues[pendingCards[index]["Nivel de rareza"]];
    money += val;
    totalSold += val;
    playSound('sell');
    showToast(`💰 +$${val.toLocaleString('es-AR')} vendido`, 'money');
    animateBudget();
    pendingCards.splice(index, 1);
    checkAchievements();
    renderInventory();
    updateUI();
};

// --- PEGADO AL ÁLBUM ---
function pasteToAlbum(card) {
    const slotId = `album-slot-${slugify(card.Nombre)}`;
    const slot = document.getElementById(slotId);
    if (!slot) return;

    const rarity = card["Nivel de rareza"];
    const rarityColors = {
        1: 'var(--r1)', 2: 'var(--r2)', 3: 'var(--r3)',
        4: 'var(--r4)', 5: 'var(--r5)'
    };

    slot.classList.add('owned');
    slot.style.borderColor = rarityColors[rarity];
    slot.style.boxShadow = `0 0 ${rarity * 5}px ${rarityColors[rarity]}`;

    if (card.Imagen) {
        slot.style.backgroundImage = `url(${card.Imagen})`;
        slot.innerHTML = `<span class="sticker-number">#${String(db.indexOf(card)+1).padStart(2,'0')}</span>`;
    } else {
        const fallbackEmoji = ['😐','😊','😎','🦸','👑'][rarity - 1];
        slot.innerHTML = `
            <div style="font-size:2.2rem">${fallbackEmoji}</div>
            <div style="font-family:var(--font-ui);font-weight:700;color:#222;font-size:0.65rem;text-align:center;padding:4px;line-height:1.2">${card.Nombre}</div>
        `;
        slot.style.background = `linear-gradient(135deg, ${rarityColors[rarity]}55, ${rarityColors[rarity]}22)`;
    }

    playSound('paste');
    totalStickered++;
}

// --- ANIMACIÓN DE PEGADO ---
async function executePasteAnimation(card, onComplete) {
    const modalContent = document.querySelector('.modal-content');

    modalContent.style.transition = 'opacity 0.3s';
    modalContent.style.opacity = '0';
    overlay.style.transition = 'background 0.3s';
    overlay.style.background = 'rgba(0,0,0,0.15)';
    overlay.style.backdropFilter = 'none';

    const areaIndex = albumPages.indexOf(card.Area);
    if (areaIndex !== -1 && currentPageIndex !== areaIndex) {
        currentPageIndex = areaIndex;
        updateAlbumTurn();
    }

    await new Promise(r => setTimeout(r, 800));
    pasteToAlbum(card);
    await new Promise(r => setTimeout(r, 800));

    modalContent.style.opacity = '1';
    overlay.style.background = 'rgba(5,5,12,0.95)';
    overlay.style.backdropFilter = 'blur(8px)';
    await new Promise(r => setTimeout(r, 300));

    onComplete();
}

// --- INVENTARIO RENDER ---
function renderInventory() {
    inventoryGrid.innerHTML = '';
    if (pendingCards.length === 0) {
        inventoryGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim);font-family:var(--font-ui)">📦 Inventario vacío</div>`;
        return;
    }

    pendingCards.forEach((card, index) => {
        const div = document.createElement('div');
        const rarity = card["Nivel de rareza"];
        div.className = `mini-card rarity-${rarity}`;

        const fallback = ['😐','😊','😎','🦸','👑'][rarity - 1];
        const img = card.Imagen
            ? `<img src="${card.Imagen}" style="width:50px;height:50px;border-radius:50%;object-fit:cover">`
            : `<div style="font-size:2rem">${fallback}</div>`;

        div.innerHTML = `
            ${img}
            <div class="card-name">${card.Nombre}</div>
            <div class="card-area-sm">${card.Area}</div>
            <div class="mini-value">$${sellValues[rarity].toLocaleString('es-AR')}</div>
            <div class="mini-rarity">${rarityEmoji[rarity]} ${rarityNames[rarity]}</div>
            <div class="mini-actions">
                <button class="mini-btn-paste" onclick="invPaste(${index})">📌 Pegar</button>
                <button class="mini-btn-sell" onclick="invSell(${index})">💰 Vender</button>
            </div>
        `;
        inventoryGrid.appendChild(div);
    });
}

// --- LOGROS RENDER ---
function renderLogros() {
    logrosGrid.innerHTML = '';
    ACHIEVEMENTS.forEach(ach => {
        const div = document.createElement('div');
        const isUnlocked = unlockedAchievements.has(ach.id);
        div.className = `logro-item ${isUnlocked ? 'unlocked' : 'locked'}`;
        div.innerHTML = `
            <div class="logro-icon">${ach.icon}</div>
            <div class="logro-text">
                <div class="logro-name">${ach.name}</div>
                <div class="logro-desc">${isUnlocked ? ach.desc : '???'}</div>
            </div>
        `;
        logrosGrid.appendChild(div);
    });
}

// --- CHEQUEO DE LOGROS ---
function checkAchievements() {
    ACHIEVEMENTS.forEach(ach => {
        if (!unlockedAchievements.has(ach.id) && ach.check()) {
            unlockedAchievements.add(ach.id);
            showAchievement(ach);
        }
    });
    // Badge de logros
    logrosBadge.classList.toggle('hidden', unlockedAchievements.size === 0);
}

function showAchievement(ach) {
    const popup = document.getElementById('achievement-popup');
    document.getElementById('ach-name').innerText = ach.name;
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('show'), 50);
    setTimeout(() => {
        popup.classList.remove('show');
        setTimeout(() => popup.classList.add('hidden'), 400);
    }, 3500);
    playSound('legendary');
}

// --- GAME OVER ---
function checkGameOver() {
    if (money < PACK_COST && pendingCards.length === 0 && currentRevealQueue.length === 0) {
        setTimeout(() => {
            // Stats
            const pct = db.length > 0 ? Math.round((totalStickered / db.length) * 100) : 0;
            document.getElementById('game-over-stats').innerHTML = `
                <div class="stat-chip"><span class="stat-chip-val">${totalPacks}</span><span class="stat-chip-label">SOBRES</span></div>
                <div class="stat-chip"><span class="stat-chip-val">${totalStickered}/${db.length}</span><span class="stat-chip-label">ÁLBUM</span></div>
                <div class="stat-chip"><span class="stat-chip-val">$${totalSold.toLocaleString('es-AR')}</span><span class="stat-chip-label">VENDIDO</span></div>
                <div class="stat-chip"><span class="stat-chip-val">${pct}%</span><span class="stat-chip-label">COMPLETADO</span></div>
            `;
            document.getElementById('game-over-overlay').classList.remove('hidden');
        }, 600);
    }
}

window.restartGame = function() {
    money = 3000;
    pendingCards = [];
    currentRevealQueue = [];
    currentRevealedCard = null;
    currentPageIndex = 0;
    buyStreak = 0;
    totalPacks = 0;
    totalStickered = 0;
    totalSold = 0;
    isBulkMode = false;
    unlockedLegendary = false;
    nearBroke = false;
    boughtBulk = false;
    unlockedAchievements.clear();

    albumContainer.innerHTML = '';
    setupAlbum();
    document.getElementById('game-over-overlay').classList.add('hidden');
    overlay.classList.add('hidden');
    updateUI();
};

// --- UI HELPERS ---
function updateUI() {
    // Presupuesto
    budgetEl.innerText = `$${money.toLocaleString('es-AR')}`;
    budgetEl.style.color = money < PACK_COST ? '#e94560' : '#4ade80';

    // Badge inventario
    if (pendingCards.length > 0) {
        inventoryBadge.classList.remove('hidden');
        inventoryBadge.innerText = pendingCards.length;
    } else {
        inventoryBadge.classList.add('hidden');
    }

    // Botones de compra
    btnBuy.style.opacity = money >= PACK_COST ? '1' : '0.5';
    const bulkCost = Math.floor(PACK_COST * BULK_COUNT * BULK_DISCOUNT);
    btnBuy5.style.opacity = money >= bulkCost ? '1' : '0.5';

    // Racha
    const streakBox = document.getElementById('streak-box');
    if (buyStreak >= 2) {
        streakBox.classList.remove('hidden');
        document.getElementById('streak-count').innerText = buyStreak;
    } else {
        streakBox.classList.add('hidden');
    }

    // Progress bar
    updateProgress();

    checkGameOver();
}

function updateProgress() {
    const owned = document.querySelectorAll('.album-sticker.owned').length;
    const total = db.length;
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    document.getElementById('progress-fill').style.width = `${pct}%`;
    document.getElementById('progress-text').innerText = `${owned} / ${total} figuritas`;
    document.getElementById('progress-pct').innerText = `${pct}%`;
}

function animateBudget() {
    budgetEl.classList.remove('bounce');
    void budgetEl.offsetWidth; // reflow
    budgetEl.classList.add('bounce');
}

function shakeButton(btn) {
    btn.style.animation = 'none';
    btn.style.animation = 'shake 0.4s ease';
    setTimeout(() => btn.style.animation = '', 400);
}

// Agregar keyframe de shake al inicio
const shakeStyle = document.createElement('style');
shakeStyle.innerText = `@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }`;
document.head.appendChild(shakeStyle);

// --- TOASTS ---
function showToast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerText = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => {
        el.classList.add('exit');
        setTimeout(() => el.remove(), 300);
    }, 2500);
}

// --- PARTÍCULAS ---
function spawnParticles(rarity) {
    const colors = {
        4: ['#c084fc','#a855f7','#e879f9','#fff'],
        5: ['#fbbf24','#f59e0b','#fff','#fde68a']
    };
    const cols = colors[rarity] || ['#fff'];
    const scene = document.querySelector('.scene');
    const rect = scene.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const count = rarity === 5 ? 30 : 18;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 8 + 4;
        const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.5);
        const dist = 80 + Math.random() * 120;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist - 60;
        p.style.cssText = `
            width:${size}px; height:${size}px;
            background:${cols[Math.floor(Math.random() * cols.length)]};
            left:${cx - size/2}px; top:${cy - size/2}px;
            --tx:${tx}px; --ty:${ty}px;
            animation-duration:${0.8 + Math.random() * 0.6}s;
        `;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1500);
    }
}

// --- STREAK LABEL ---
function showStreakLabel(text) {
    const el = document.createElement('div');
    el.className = 'streak-bonus-label';
    el.innerText = text;
    el.style.left = (window.innerWidth / 2 - 80) + 'px';
    el.style.top = (window.innerHeight * 0.4) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

// --- ARRANQUE ---
init();