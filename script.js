document.addEventListener('DOMContentLoaded', () => {
    // Keep a reference to the DOM elements that are frequently updated
    const fieldPlayersEl = document.getElementById('field-players');
    const benchPlayersEl = document.getElementById('bench-players');
    const timerScoreEl = document.getElementById('timer-score');
    const statsPanelEl = document.getElementById('stats-panel');
    const logPanelEl = document.getElementById('log-panel');
    const teamNameEl = document.getElementById('team-name');

    // Default initial state
    const initialPlayers = Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        name: 'Player No.',
        number: null,
        totalTimeOnField: 0,
        goals: 0,
        onField: false,
        fatigue: 0,
        lastBenchTime: Date.now(),
        onFire: false,
        recentGoals: []
    }));

    let players, activityLog, quarterTimer, quarter;
    let timerInterval = null;
    let history = [];

    // --- DATA PERSISTENCE ---
    function saveDataToLocal() {
        const teamName = teamNameEl.textContent;
        const appState = { players, activityLog, quarterTimer, quarter, teamName };
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
            teamNameEl.textContent = parsedState.teamName || 'My Team';

            // Check if the timer was running when the app was closed.
            // A simple proxy for this is if the timer is not at its default start time and not 0.
            if (quarterTimer > 0 && quarterTimer < 600) {
                 // We don't want to auto-start, but we need to reflect a paused state.
                 // The render() call will correctly set the disabled states on the buttons.
                 timerInterval = null; // Ensure it's treated as paused.
            }

        } else {
            // No saved data, use initial state
            players = JSON.parse(JSON.stringify(initialPlayers));
            activityLog = [];
            quarterTimer = 600;
            quarter = 1;
            teamNameEl.textContent = 'My Team';
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

    // --- AUDIO & HAPTICS ---
    function playSound(id) {
        const sound = document.getElementById(id);
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.error(`Could not play sound: ${id}`, e));
        }
    }

    function triggerHapticFeedback(pattern = 50) {
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
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

        // Save team name on edit
        teamNameEl.addEventListener('blur', saveDataToLocal);

        // Always call this after rendering to process new icons
        lucide.createIcons();

        // Attach PDF export button listener
        document.getElementById('export-pdf-button').addEventListener('click', exportStatsToPDF);
    }

    function createPlayerCard(player) {
        const isFatigued = player.onField && player.fatigue >= 30;
        const displayName = player.number ? `Player No. ${player.number}` : 'Player No. #';

        return `
            <div class="player-card ${player.onField ? 'on-field' : ''} ${isFatigued ? 'fatigued' : ''} ${player.onFire ? 'on-fire' : ''}" data-id="${player.id}" draggable="true">
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
                    // Update on-fire class
                    card.classList.toggle('on-fire', player.onFire);
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
        const fieldPlayersCount = players.filter(p => p.onField).length;
        const isTimerRunning = timerInterval !== null;

        timerScoreEl.innerHTML = `
            <h3>Quarter: ${quarter}</h3>
            <div class="timer">${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</div>
            <h3>Total Goals: ${totalGoals}</h3>
            <div class="timer-controls">
                <button id="start-timer" ${fieldPlayersCount < 4 || isTimerRunning ? 'disabled' : ''}><i data-lucide="play-circle"></i><span>Start</span></button>
                <button id="pause-timer" ${!isTimerRunning ? 'disabled' : ''}><i data-lucide="pause-circle"></i><span>Pause</span></button>
                <button id="new-game-button"><i data-lucide="power-off"></i><span>New Game</span></button>
                <button id="undo-button"><i data-lucide="undo-2"></i><span>Undo</span></button>
            </div>
        `;

        document.getElementById('start-timer').addEventListener('click', startTimer);
        document.getElementById('pause-timer').addEventListener('click', pauseTimer);
        document.getElementById('new-game-button').addEventListener('click', resetGame);
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
        logPanelEl.scrollTop = logPanelEl.scrollHeight;
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

    function setupDragAndDrop() {
        let draggedPlayerId = null;

        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('player-card')) {
                draggedPlayerId = parseInt(e.target.dataset.id);
                setTimeout(() => {
                    e.target.classList.add('dragging');
                }, 0);
            }
        });

        document.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('player-card')) {
                e.target.classList.remove('dragging');
                draggedPlayerId = null;
            }
        });

        const dropZones = [fieldPlayersEl, benchPlayersEl];
        dropZones.forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('drag-over');
            });

            zone.addEventListener('dragleave', () => {
                zone.classList.remove('drag-over');
            });

            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                if (draggedPlayerId === null) return;
                
                const targetZoneId = zone.parentElement.id; // 'field' or 'bench'
                const player = players.find(p => p.id === draggedPlayerId);

                if (targetZoneId === 'field' && !player.onField) {
                    movePlayerToFieldWithChecks(player);
                } else if (targetZoneId === 'bench' && player.onField) {
                    movePlayerToBench(player);
                }
                draggedPlayerId = null;
            });
        });
    }

    function togglePlayerFieldStatus(playerId) {
        const player = players.find(p => p.id === playerId);
        if (player.onField) {
            movePlayerToBench(player);
        } else {
            movePlayerToFieldWithChecks(player);
        }
    }

    function movePlayerToFieldWithChecks(player) {
        const fieldPlayers = players.filter(p => p.onField);
        if (fieldPlayers.length >= 4) {
            showModal("The field already has 4 players. Bench a player first.", 'alert');
            return;
        }
        if (player.number === null) {
            showModal('Assign a number to this player:', 'prompt', (confirmed, number) => {
                if (confirmed && number) {
                    const isUnique = !players.some(p => p.number === number);
                    if (isUnique) {
                        player.number = number;
                        movePlayerToField(player);
                    } else {
                        showModal('This jersey number is already taken. Please choose another.', 'alert');
                    }
                }
            });
        } else {
            movePlayerToField(player);
        }
    }
    
    function movePlayerToBench(player) {
        saveStateToHistory();
        player.onField = false;
        player.fatigue = 0;
        player.lastBenchTime = Date.now();
        logActivity(`Player #${player.number || '?'} moved to the bench.`);
        playSound('sound-swoosh');
        triggerHapticFeedback(50);
        render();
        saveDataToLocal();
        
        const playerToSub = findLongestBenchedPlayer();
        if (playerToSub) {
            const subMsg = playerToSub.number ? `Player #${playerToSub.number}` : 'unassigned player';
            setTimeout(() => showModal(`Suggestion: Bring in ${subMsg}. They have been on the bench the longest.`, 'alert'), 100);
        }
    }

    function movePlayerToField(player) {
        saveStateToHistory();
        player.onField = true;
        player.fatigue = 0;
        logActivity(`Player #${player.number} moved to the field.`);
        playSound('sound-swoosh');
        triggerHapticFeedback(50);
        render();
        saveDataToLocal();
    }

    function findLongestBenchedPlayer() {
        const benchedPlayers = players.filter(p => !p.onField);
        return benchedPlayers.length > 0 ? benchedPlayers.sort((a, b) => a.lastBenchTime - b.lastBenchTime)[0] : null;
    }

    function scoreGoal(playerId) {
        saveStateToHistory();
        const player = players.find(p => p.id === playerId);
        if (player && player.onField) {
            player.goals += 1;
            player.recentGoals.push(quarterTimer);
            checkOnFireState(player);
            logActivity(`Goal scored by Player #${player.number}! ${player.onFire ? 'They are on fire!' : ''}`);
            playSound('sound-cheer');
            triggerHapticFeedback([100, 50, 100]);

            const card = document.querySelector(`.player-card[data-id="${playerId}"]`);
            if (card) {
                const rect = card.getBoundingClientRect();
                const x = (rect.left + rect.right) / 2 / window.innerWidth;
                const y = (rect.top + rect.bottom) / 2 / window.innerHeight;
                
                card.classList.add('exploding');
                setTimeout(() => card.classList.remove('exploding'), 500);

                requestAnimationFrame(() => {
                    setTimeout(() => triggerFireworks(x, y), 50);
                });

                // Manually update stats instead of full re-render to preserve animations
                const goalStatEl = card.querySelector('[data-stat="goals"] span');
                if (goalStatEl) {
                    goalStatEl.innerText = `Goals: ${player.goals}`;
                }
            }
            
            renderTimerAndScore(); // Update total goals
            renderStats(); // Update leaderboard
            lucide.createIcons(); // Re-process icons in updated stats panels
            saveDataToLocal();
        }
    }

    function checkOnFireState(player) {
        const twoMinutesInSeconds = 120; // 2 minutes
        const now = quarterTimer;
    
        // Filter out goals scored more than 2 minutes ago
        player.recentGoals = player.recentGoals.filter(goalTime => (goalTime - now) < twoMinutesInSeconds);
    
        // Check if player has scored 3 or more goals recently
        if (player.recentGoals.length >= 3) {
            if (!player.onFire) {
                player.onFire = true;
                // The on-fire state will be rendered in the next updatePlayerCards call
            }
            // Reset cooldown since they just scored
            player.onFireCooldown = 30; 
        }
    }

    function triggerFireworks(x, y) {
        const container = document.getElementById('fireworks-container');
        if (!container) return;
        const fireworks = new Fireworks.default(container, {
            maxRockets: 3,
            rocketSpawnInterval: 150,
            numParticles: 100,
            explosionMinHeight: 0.2,
            explosionMaxHeight: 0.9,
            explosionChance: 0.08,
            x: x * 100,
            y: y * 100,
        });
        fireworks.start();
        setTimeout(() => fireworks.stop(), 2000);
    }

    function logActivity(message) {
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        activityLog.unshift({ time: timestamp, message: message });
        if (activityLog.length > 50) activityLog.pop();
        renderLog();
        logPanelEl.scrollTop = 0;
    }

    function gameTick() {
        let hasChanges = false;
        if (quarterTimer > 0) {
            quarterTimer--;
            players.forEach(p => {
                if (p.onField) {
                    p.totalTimeOnField++;
                    p.fatigue++;
                }
                 // Handle "On-Fire" cooldown
                if (p.onFire) {
                    p.onFireCooldown = (p.onFireCooldown || 30) - 1;
                    if (p.onFireCooldown <= 0) {
                        p.onFire = false;
                        p.recentGoals = []; // Reset recent goals
                        logActivity(`Player #${p.number} has cooled down.`);
                    }
                }
            });
            hasChanges = true;
        } else {
            if (timerInterval) {
                pauseTimer(false);
                logActivity(`End of Quarter ${quarter}.`);
                showModal(`Quarter ${quarter} has ended.`, 'alert', () => {
                    quarter++;
                    quarterTimer = 600;
                    render();
                    saveDataToLocal();
                });
            }
        }
        if(hasChanges) {
             renderTimerAndScore();
             updatePlayerCards();
        }
    }

    function startTimer() {
        if (!timerInterval) {
            saveStateToHistory();
            timerInterval = setInterval(gameTick, 1000);
            logActivity('Quarter started.');
            playSound('sound-whistle');
            render();
            saveDataToLocal();
        }
    }

    function pauseTimer(saveHistory = true) {
        if(timerInterval) {
            if(saveHistory) saveStateToHistory();
            clearInterval(timerInterval);
            timerInterval = null;
            logActivity('Timer paused.');
            render();
            saveDataToLocal();
        }
    }

    function resetGame() {
        showModal('Are you sure you want to start a new game? All progress will be lost.', 'confirm', (confirmed) => {
            if (confirmed) {
                if (timerInterval) pauseTimer(false);
                
                // Reset to initial state
                players = JSON.parse(JSON.stringify(initialPlayers));
                activityLog = [];
                quarterTimer = 600;
                quarter = 1;
                history = [];

                logActivity('New game started.');
                render();
                saveDataToLocal();
            }
        });
    }

    function showModal(text, type = 'alert', callback = null) {
        // Remove any existing modals first
        const existingModal = document.querySelector('.modal-backdrop');
        if (existingModal) existingModal.remove();

        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        const modal = document.createElement('div');
        modal.className = 'modal';

        const modalText = document.createElement('div');
        modalText.className = 'modal-text';
        modalText.innerText = text;
        modal.appendChild(modalText);

        let inputEl = null;
        if (type === 'prompt') {
            inputEl = document.createElement('input');
            inputEl.className = 'modal-input';
            inputEl.type = 'text';
            modal.appendChild(inputEl);
        }

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const confirmButton = document.createElement('button');
        confirmButton.className = 'modal-button primary';
        confirmButton.innerText = (type === 'confirm' || type === 'prompt') ? 'Confirm' : 'OK';
        actions.appendChild(confirmButton);

        let cancelButton = null;
        if (type === 'confirm' || type === 'prompt') {
            cancelButton = document.createElement('button');
            cancelButton.className = 'modal-button';
            cancelButton.innerText = 'Cancel';
            actions.appendChild(cancelButton);
        }
        
        modal.appendChild(actions);
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        // Animate in
        setTimeout(() => backdrop.classList.add('visible'), 10);

        const closeModal = (result, value = null) => {
            backdrop.classList.remove('visible');
            backdrop.addEventListener('transitionend', () => {
                backdrop.remove();
                if (callback) {
                    callback(result, value);
                }
            }, { once: true });
        };

        confirmButton.addEventListener('click', () => {
            closeModal(true, inputEl ? inputEl.value : null);
        });

        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                closeModal(false);
            });
        }

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeModal(false);
            }
        });
        
        if (inputEl) {
            inputEl.focus();
            inputEl.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    closeModal(true, inputEl.value);
                }
                if (e.key === 'Escape') {
                    closeModal(false);
                }
            });
        }
    }

    // --- PDF EXPORT ---
    function exportStatsToPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const teamName = teamNameEl.textContent || 'My Team';
        const date = new Date().toLocaleDateString();
        const time = new Date().toLocaleTimeString();

        // Header
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text(teamName, doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Stats Exported: ${date} at ${time}`, doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });

        // Table Header
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text("Player Stats", 14, 50);
        
        doc.autoTable({
            startY: 55,
            head: [['Player #', 'Time on Field', 'Goals']],
            body: players.filter(p => p.number !== null).map(p => {
                const timeOnField = `${Math.floor(p.totalTimeOnField / 60)}m ${p.totalTimeOnField % 60}s`;
                return [p.number, timeOnField, p.goals];
            }),
            theme: 'striped',
            headStyles: { fillColor: [46, 204, 113] },
        });

        // Summary Stats
        const finalY = doc.autoTable.previous.finalY + 20;
        const longestOnField = players.length > 0 ? [...players].sort((a, b) => b.totalTimeOnField - a.totalTimeOnField)[0] : null;
        const mostGoals = players.length > 0 ? [...players].sort((a, b) => b.goals - a.goals)[0] : null;

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text("Summary", 14, finalY);

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        if (longestOnField) {
            const timeStr = `(${Math.floor(longestOnField.totalTimeOnField / 60)}m ${longestOnField.totalTimeOnField % 60}s)`;
            doc.text(`Longest on Field: Player #${longestOnField.number || 'N/A'} ${timeStr}`, 14, finalY + 10);
        }
        if (mostGoals) {
            doc.text(`Most Goals: Player #${mostGoals.number || 'N/A'} (${mostGoals.goals} goals)`, 14, finalY + 20);
        }

        doc.save(`${teamName.replace(/\s/g, '_')}-Stats.pdf`);
    }

    // --- INITIALIZATION ---
    loadDataFromLocal();
    render();
    setupTabs();
    setupDragAndDrop();
}); 