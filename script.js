document.addEventListener('DOMContentLoaded', () => {
    // Keep a reference to the DOM elements that are frequently updated
    const fieldPlayersEl = document.getElementById('field-players');
    const benchPlayersEl = document.getElementById('bench-players');
    const timerScoreEl = document.getElementById('timer-score');
    const statsPanelEl = document.getElementById('stats-panel');
    const logPanelEl = document.getElementById('log-panel');

    const initialPlayers = [
        { id: 1, name: 'Player 1', number: 1, totalTimeOnField: 0, goals: 0, onField: false, fatigue: 0, lastBenchTime: Date.now() },
        { id: 2, name: 'Player 2', number: 2, totalTimeOnField: 0, goals: 0, onField: false, fatigue: 0, lastBenchTime: Date.now() },
        { id: 3, name: 'Player 3', number: 3, totalTimeOnField: 0, goals: 0, onField: false, fatigue: 0, lastBenchTime: Date.now() },
        { id: 4, name: 'Player 4', number: 4, totalTimeOnField: 0, goals: 0, onField: false, fatigue: 0, lastBenchTime: Date.now() },
        { id: 5, name: 'Player 5', number: 5, totalTimeOnField: 0, goals: 0, onField: false, fatigue: 0, lastBenchTime: Date.now() },
        { id: 6, name: 'Player 6', number: 6, totalTimeOnField: 0, goals: 0, onField: false, fatigue: 0, lastBenchTime: Date.now() },
        { id: 7, name: 'Player 7', number: 7, totalTimeOnField: 0, goals: 0, onField: false, fatigue: 0, lastBenchTime: Date.now() },
        { id: 8, name: 'Player 8', number: 8, totalTimeOnField: 0, goals: 0, onField: false, fatigue: 0, lastBenchTime: Date.now() },
    ];

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
            showModal('No more actions to undo.', 'alert');
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
    }

    function createPlayerCard(player) {
        const isFatigued = player.fatigue >= 30;
        return `
            <div class="player-card ${player.onField ? 'on-field' : ''} ${isFatigued ? 'fatigued' : ''}" data-id="${player.id}">
                ${player.onField ? `<div class="fatigue-bar" style="width: ${player.fatigue * 100 / 30}%"></div>` : ''}
                <div class="player-card-content">
                    <div class="player-name">${player.name}</div>
                    <div class="player-number">#${player.number}</div>
                    <div class="player-stats">
                        <div>Time: ${Math.floor(player.totalTimeOnField / 60)}m ${player.totalTimeOnField % 60}s</div>
                        <div>Goals: ${player.goals}</div>
                    </div>
                    <button class="score-button" data-id="${player.id}" ${!timerInterval || !player.onField ? 'disabled' : ''}>Score</button>
                </div>
            </div>
        `;
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
                <button id="start-timer">Start</button>
                <button id="pause-timer">Pause</button>
                <button id="reset-timer">Reset Qtr</button>
                <button id="undo-button">Undo</button>
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
                    <strong>Longest on Field:</strong>
                    <p>${longestOnField.name} (${Math.floor(longestOnField.totalTimeOnField / 60)}m ${longestOnField.totalTimeOnField % 60}s)</p>
                </div>
                <div class="stat-item">
                    <strong>Most Goals:</strong>
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
        saveStateToHistory();
        const player = players.find(p => p.id === playerId);
        const fieldPlayers = players.filter(p => p.onField);

        if (player.onField) {
            player.onField = false;
            player.fatigue = 0;
            player.lastBenchTime = Date.now();
            logActivity(`${player.name} moved to the bench.`);
            const playerToSub = findLongestBenchedPlayer();
            if (playerToSub) {
                setTimeout(() => showModal(`Suggestion: Bring in ${playerToSub.name}. They have been on the bench the longest.`, 'alert'), 100);
            }
        } else {
            if (fieldPlayers.length < 4) {
                player.onField = true;
                logActivity(`${player.name} moved to the field.`);
                const newFieldCount = players.filter(p => p.onField).length;
                if (newFieldCount === 4 && timerInterval === null && quarterTimer === 600) {
                    setTimeout(() => {
                        showModal('The field is full. Ready to start the quarter?', 'confirm', (confirmed) => {
                            if (confirmed) startTimer();
                        });
                    }, 200);
                }
            } else {
                showModal("The field already has 4 players. Bench a player first.", 'alert');
            }
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
            render();
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
        // Remove any existing modal first
        const existingModal = document.getElementById('modal-backdrop');
        if (existingModal) existingModal.remove();

        const modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'modal-backdrop';
        modalBackdrop.className = 'modal-backdrop';

        let buttonsHtml = '';
        if (type === 'alert') {
            buttonsHtml = `<button class="modal-button primary" id="modal-ok">OK</button>`;
        } else if (type === 'confirm') {
            buttonsHtml = `
                <button class="modal-button" id="modal-cancel">Cancel</button>
                <button class="modal-button primary" id="modal-ok">Confirm</button>
            `;
        }

        modalBackdrop.innerHTML = `
            <div class="modal panel">
                <p class="modal-text">${text}</p>
                <div class="modal-actions">
                    ${buttonsHtml}
                </div>
            </div>
        `;

        document.body.appendChild(modalBackdrop);
        
        // Trigger the fade-in animation
        requestAnimationFrame(() => modalBackdrop.classList.add('visible'));

        const closeModal = (result) => {
            modalBackdrop.classList.remove('visible');
            modalBackdrop.addEventListener('transitionend', () => {
                modalBackdrop.remove();
                if (callback) callback(result);
            }, { once: true });
        };

        modalBackdrop.querySelector('#modal-ok').addEventListener('click', () => closeModal(true));
        if (type === 'confirm') {
            modalBackdrop.querySelector('#modal-cancel').addEventListener('click', () => closeModal(false));
        }
    }

    // Initial setup
    loadDataFromLocal();
    setupTabs();
    render();
}); 