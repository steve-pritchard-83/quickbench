document.addEventListener('DOMContentLoaded', () => {
    // Keep a reference to the DOM elements that are frequently updated
    const fieldPlayersEl = document.getElementById('field-players');
    const benchPlayersEl = document.getElementById('bench-players');
    const timerScoreEl = document.getElementById('timer-score');
    const statsPanelEl = document.getElementById('stats-panel');
    const logPanelEl = document.getElementById('log-panel');

    // Default initial state
    const initialPlayers = Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        name: 'Player No.',
        number: null,
        totalTimeOnField: 0,
        goals: 0,
        onField: false,
        fatigue: 0,
        lastBenchTime: Date.now()
    }));

    let players, activityLog, quarterTimer, quarter;
    let timerInterval = null;
    let history = [];

    // --- DATA PERSISTENCE ---
    function saveDataToLocal() {
        const appState = { players, activityLog, quarterTimer, quarter };
        localStorage.setItem('quickBenchState', JSON.stringify(appState));
    }

    function loadDataFromLocal() {
        const savedState = localStorage.getItem('quickBenchState');
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            players = parsedState.players;
            activityLog = parsedState.activityLog;
            quarterTimer = parsedState.quarterTimer;
            quarter = parsedState.quarter;
        } else {
            // No saved data, use initial state
            players = JSON.parse(JSON.stringify(initialPlayers));
            activityLog = [];
            quarterTimer = 600;
            quarter = 1;
        }
    }

    // --- UNDO HISTORY ---
    function saveStateToHistory() {
        history.push({
            players: JSON.parse(JSON.stringify(players)),
            activityLog: JSON.parse(JSON.stringify(activityLog)),
            quarterTimer,
            quarter,
        });
        if (history.length > 10) history.shift();
    }

    function undoLastAction() {
        if (history.length > 0) {
            const lastState = history.pop();
            players = lastState.players;
            activityLog = lastState.activityLog;
            quarterTimer = lastState.quarterTimer;
            quarter = lastState.quarter;
            
            if (timerInterval) pauseTimer(false); // Pause without saving state
            
            logActivity('Last action undone.');
            render();
            saveDataToLocal();
        } else {
            showModal('No more actions to undo.');
        }
    }

    function render() {
        renderBench();
        renderField();
        renderTimerAndScore();
        renderStats();
        renderLog();

        // Add event listeners after rendering player cards
        document.querySelectorAll('.player-card').forEach(card => {
            card.addEventListener('click', () => togglePlayerFieldStatus(parseInt(card.dataset.id)));
        });

        document.querySelectorAll('.score-button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                scoreGoal(parseInt(button.dataset.id));
            });
        });

        // Always call this after rendering to process new icons
        lucide.createIcons();
    }

    function createPlayerCard(player) {
        const isFatigued = player.onField && player.fatigue >= 30;
        const displayName = player.number ? `Player No. ${player.number}` : 'Player No. #';

        return `
            <div class="player-card ${player.onField ? 'on-field' : ''} ${isFatigued ? 'fatigued' : ''}" data-id="${player.id}">
                <div class="player-card-content">
                    <div class="player-name">${displayName}</div>
                    <div class="player-stats">
                        <div class="stat-line" data-stat="time"><i data-lucide="clock"></i> <span>Time: ${Math.floor(player.totalTimeOnField / 60)}m ${player.totalTimeOnField % 60}s</span></div>
                        <div class="stat-line" data-stat="goals"><i data-lucide="shield-check"></i> <span>Goals: ${player.goals}</span></div>
                    </div>
                    <button class="score-button" data-id="${player.id}" ${!timerInterval || !player.onField ? 'disabled' : ''}><i data-lucide="plus-circle"></i> <span>Score</span></button>
                </div>
            </div>
        `;
    }

    // New helper function to smoothly interpolate between green and red
    function getFatigueColor(fatigue) {
        const percentage = Math.min(fatigue / 30, 1);
        const r = Math.floor(46 + (220 - 46) * percentage);
        const g = Math.floor(204 - (204 - 53) * percentage);
        const b = Math.floor(113 - (113 - 69) * percentage);
        return `rgb(${r}, ${g}, ${b})`;
    }

    function updatePlayerCards() {
        players.forEach(player => {
            if (player.onField) {
                const card = document.querySelector(`.player-card[data-id="${player.id}"]`);
                if (card) {
                    // Update Time
                    const timeStatEl = card.querySelector('[data-stat="time"] span');
                    if (timeStatEl) {
                        timeStatEl.innerText = `Time: ${Math.floor(player.totalTimeOnField / 60)}m ${player.totalTimeOnField % 60}s`;
                    }
                    // Update Color
                    card.style.backgroundColor = getFatigueColor(player.fatigue);
                    // Update fatigue class
                    card.classList.toggle('fatigued', player.fatigue >= 30);
                }
            }
        });
    }

    function renderBench() {
        const benchPlayers = players.filter(p => !p.onField);
        benchPlayersEl.innerHTML = benchPlayers.map(createPlayerCard).join('');
    }

    function renderField() {
        const fieldPlayers = players.filter(p => p.onField);
        fieldPlayersEl.innerHTML = fieldPlayers.map(createPlayerCard).join('');
    }

    function renderTimerAndScore() {
        const totalGoals = players.reduce((sum, p) => sum + p.goals, 0);
        const minutes = Math.floor(quarterTimer / 60);
        const seconds = quarterTimer % 60;

        timerScoreEl.innerHTML = `
            <h3>Quarter: ${quarter}</h3>
            <div class="timer">${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</div>
            <h3>Total Goals: ${totalGoals}</h3>
            <div class="timer-controls">
                <button id="start-timer"><i data-lucide="play-circle"></i><span>Start</span></button>
                <button id="pause-timer"><i data-lucide="pause-circle"></i><span>Pause</span></button>
                <button id="reset-timer"><i data-lucide="rotate-cw"></i><span>Reset Qtr</span></button>
                <button id="undo-button"><i data-lucide="undo-2"></i><span>Undo</span></button>
            </div>
        `;

        document.getElementById('start-timer').addEventListener('click', startTimer);
        document.getElementById('pause-timer').addEventListener('click', pauseTimer);
        document.getElementById('reset-timer').addEventListener('click', resetTimer);
        document.getElementById('undo-button').addEventListener('click', undoLastAction);
    }

    function renderStats() {
        const longestOnField = players.length > 0 ? [...players].sort((a, b) => b.totalTimeOnField - a.totalTimeOnField)[0] : { name: 'N/A', totalTimeOnField: 0 };
        const mostGoals = players.length > 0 ? [...players].sort((a, b) => b.goals - a.goals)[0] : { name: 'N/A', goals: 0 };

        statsPanelEl.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <strong><i data-lucide="timer"></i> Longest on Field:</strong>
                    <p>${longestOnField.name} (${Math.floor(longestOnField.totalTimeOnField / 60)}m ${longestOnField.totalTimeOnField % 60}s)</p>
                </div>
                <div class="stat-item">
                    <strong><i data-lucide="star"></i> Most Goals:</strong>
                    <p>${mostGoals.name} (${mostGoals.goals} goals)</p>
                </div>
            </div>
        `;
    }

    function renderLog() {
        logPanelEl.innerHTML = `
            <ul class="activity-log">
                ${activityLog.map(log => `<li>${log.message}</li>`).join('')}
            </ul>
        `;
    }

    function setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;

                // Remove active class from all buttons and content
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // Add active class to the clicked button and corresponding content
                button.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });
    }

    function togglePlayerFieldStatus(playerId) {
        const player = players.find(p => p.id === playerId);
        const fieldPlayers = players.filter(p => p.onField);

        if (player.onField) {
            saveStateToHistory();
            player.onField = false;
            player.fatigue = 0;
            player.lastBenchTime = Date.now();
            logActivity(`Player #${player.number} moved to the bench.`);
            const playerToSub = findLongestBenchedPlayer();
            if (playerToSub) {
                const subMsg = playerToSub.number ? `Player #${playerToSub.number}` : 'unassigned player';
                setTimeout(() => showModal(`Suggestion: Bring in ${subMsg}. They have been on the bench the longest.`, 'alert'), 100);
            }
            render();
            saveDataToLocal();
        } else {
            // Player is moving TO the field
            if (fieldPlayers.length >= 4) {
                showModal("The field already has 4 players. Bench a player first.", 'alert');
                return;
            }

            // If player number is not set, prompt for it
            if (player.number === null) {
                showModal('Assign a number to this player:', 'prompt', (confirmed, number) => {
                    if (confirmed) {
                        const newNumber = parseInt(number, 10);
                        const isNumberInUse = players.some(p => p.number === newNumber);

                        if (!newNumber || isNaN(newNumber)) {
                            showModal('Invalid number. Please enter a valid player number.', 'alert');
                            return;
                        }
                        if (isNumberInUse) {
                            showModal(`Player number ${newNumber} is already in use.`, 'alert');
                            return;
                        }

                        // Number is valid and unique, proceed
                        saveStateToHistory();
                        player.number = newNumber;
                        movePlayerToField(player);
                    }
                    // If cancelled, do nothing
                });
            } else {
                // Player already has a number, just move them
                saveStateToHistory();
                movePlayerToField(player);
            }
        }
    }

    function movePlayerToField(player) {
        player.onField = true;
        logActivity(`Player #${player.number} moved to the field.`);
        
        const newFieldCount = players.filter(p => p.onField).length;
        if (newFieldCount === 4 && timerInterval === null && quarterTimer === 600) {
            setTimeout(() => {
                showModal('The field is full. Ready to start the quarter?', 'confirm', (confirmed) => {
                    if (confirmed) startTimer();
                });
            }, 200);
        }
        render();
        saveDataToLocal();
    }

    function findLongestBenchedPlayer() {
        const benchedPlayers = players.filter(p => !p.onField);
        if (benchedPlayers.length === 0) return null;
        return benchedPlayers.sort((a, b) => a.lastBenchTime - b.lastBenchTime)[0];
    }

    function scoreGoal(playerId) {
        const player = players.find(p => p.id === playerId);
        if (!timerInterval || !player.onField) {
            return;
        }

        saveStateToHistory();
        
        player.goals++;
        logActivity(`${player.name} scored a goal!`);
        
        // --- Trigger Visual Effects ---
        const card = document.querySelector(`.player-card[data-id="${playerId}"]`);
        if (card) {
            // 1. Explosion
            card.classList.add('exploding');
            card.addEventListener('animationend', () => {
                card.classList.remove('exploding');
            }, { once: true });

            // 2. Fireworks
            requestAnimationFrame(() => {
                const rect = card.getBoundingClientRect();
                const x = (rect.left + rect.width / 2) / window.innerWidth * 100;
                const y = (rect.top + rect.height / 2) / window.innerHeight * 100;
                triggerFireworks(x, y);
            });
        }
        
        // Manually update the DOM to avoid re-rendering and killing the animation
        const goalStatEl = card.querySelector('.player-stats div:last-child');
        if (goalStatEl) {
            goalStatEl.innerText = `Goals: ${player.goals}`;
        }
        renderTimerAndScore(); // Updates total goals
        renderStats(); // Updates most goals leader

        saveDataToLocal();
    }

    function triggerFireworks(x, y) {
        if (typeof Fireworks === 'undefined') {
            console.error('Fireworks.js library not loaded.');
            return;
        }
        const container = document.getElementById('fireworks-container');
        const fireworks = new Fireworks.default(container, {
            rocketsPoint: { x: x, y: y },
            hue: { min: 0, max: 360 },
            delay: { min: 15, max: 30 },
            speed: 2,
            acceleration: 1.05,
            friction: 0.95,
            gravity: 1.5,
            particles: 50,
            trace: 3,
            explosion: 5,
            autoresize: true,
            brightness: { min: 50, max: 80, decay: { min: 0.015, max: 0.03 } }
        });
        fireworks.start();
        setTimeout(() => fireworks.stop(), 3000);
    }

    function logActivity(message) {
        activityLog.unshift({ time: new Date(), message });
        if (activityLog.length > 20) {
            activityLog.pop();
        }
        renderLog();
    }

    function gameTick() {
        if (quarterTimer > 0) {
            quarterTimer--;
            players.forEach(p => {
                if (p.onField) {
                    p.totalTimeOnField++;
                    if (p.fatigue < 30) {
                        p.fatigue++;
                    }
                }
            });
            // Instead of a full re-render, just update dynamic elements
            renderTimerAndScore();
            updatePlayerCards();
        } else {
            pauseTimer();
            logActivity(`End of Quarter ${quarter}.`);
            quarter++;
        }
    }

    function startTimer() {
        if (timerInterval) return;
        saveStateToHistory();
        timerInterval = setInterval(gameTick, 1000);
        logActivity('Timer started.');
        render();
        saveDataToLocal();
    }

    function pauseTimer(saveHistory = true) {
        if(saveHistory) saveStateToHistory();
        clearInterval(timerInterval);
        timerInterval = null;
        logActivity('Timer paused.');
        render();
        saveDataToLocal();
    }

    function resetTimer() {
        saveStateToHistory();
        if (timerInterval) pauseTimer(false);
        players = JSON.parse(JSON.stringify(initialPlayers));
        activityLog = [];
        quarterTimer = 600;
        quarter = 1;
        logActivity('Timer reset.');
        render();
        saveDataToLocal();
    }

    // --- CUSTOM MODAL ---
    function showModal(text, type = 'alert', callback = null) {
        const existingModal = document.getElementById('modal-backdrop');
        if (existingModal) existingModal.remove();

        const modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'modal-backdrop';
        modalBackdrop.className = 'modal-backdrop';

        let buttonsHtml = '';
        let inputHtml = '';

        if (type === 'prompt') {
            inputHtml = `<input type="number" id="modal-input" class="modal-input" placeholder="#">`;
        }

        if (type === 'alert') {
            buttonsHtml = `<button class="modal-button primary" id="modal-ok">OK</button>`;
        } else if (type === 'confirm' || type === 'prompt') {
            buttonsHtml = `
                <button class="modal-button" id="modal-cancel">Cancel</button>
                <button class="modal-button primary" id="modal-ok">Confirm</button>
            `;
        }

        modalBackdrop.innerHTML = `
            <div class="modal panel">
                <p class="modal-text">${text}</p>
                ${inputHtml}
                <div class="modal-actions">
                    ${buttonsHtml}
                </div>
            </div>
        `;

        document.body.appendChild(modalBackdrop);
        
        requestAnimationFrame(() => modalBackdrop.classList.add('visible'));

        const inputEl = modalBackdrop.querySelector('#modal-input');
        if (inputEl) inputEl.focus();

        const closeModal = (result, value = null) => {
            modalBackdrop.classList.remove('visible');
            modalBackdrop.addEventListener('transitionend', () => {
                modalBackdrop.remove();
                if (callback) callback(result, value);
            }, { once: true });
        };

        modalBackdrop.querySelector('#modal-ok').addEventListener('click', () => {
            const value = type === 'prompt' ? inputEl.value : null;
            closeModal(true, value);
        });

        if (type === 'confirm' || type === 'prompt') {
            modalBackdrop.querySelector('#modal-cancel').addEventListener('click', () => closeModal(false));
        }
    }

    // Initial setup
    loadDataFromLocal();
    setupTabs();
    render();
}); 