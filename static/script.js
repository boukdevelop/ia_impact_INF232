/* ============================================================
   script.js — Frontend IA-Cam
   Toutes les données passent par l'API Python/Flask
   ============================================================ */

'use strict';

// ── BASE URL DE L'API ──────────────────────────────────────────
const API = '/api';   // Même domaine que Flask → pas de CORS nécessaire

// ── ÉTAT LOCAL ────────────────────────────────────────────────
let currentStep  = 1;
let impactSelected = null;
let charts = {};

// ── HELPERS API ───────────────────────────────────────────────

async function apiGet(endpoint) {
    const res = await fetch(API + endpoint);
    if (!res.ok) throw new Error(`GET ${endpoint} → ${res.status}`);
    return res.json();
}

async function apiPost(endpoint, body) {
    const res = await fetch(API + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.errors?.join(', ') || 'Erreur API');
    return data;
}

async function apiDelete(endpoint) {
    const res = await fetch(API + endpoint, { method: 'DELETE' });
    if (!res.ok) throw new Error(`DELETE ${endpoint} → ${res.status}`);
    return res.json();
}

// ── CANVAS BACKGROUND ANIMÉ ────────────────────────────────────

(function initCanvas() {
    const canvas = document.getElementById('bg-canvas');
    const ctx = canvas.getContext('2d');
    let W, H, particles;

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    function createParticles() {
        particles = Array.from({ length: 55 }, () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            r: Math.random() * 1.5 + 0.5,
            alpha: Math.random() * 0.4 + 0.05,
            color: Math.random() > 0.5 ? '0,229,160' : '77,159,255'
        }));
    }

    function drawConnections() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 140) {
                    const alpha = (1 - dist / 140) * 0.12;
                    ctx.strokeStyle = `rgba(0,229,160,${alpha})`;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
    }

    function loop() {
        ctx.clearRect(0, 0, W, H);
        drawConnections();
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > W) p.vx *= -1;
            if (p.y < 0 || p.y > H) p.vy *= -1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
            ctx.fill();
        });
        requestAnimationFrame(loop);
    }

    resize();
    createParticles();
    loop();
    window.addEventListener('resize', () => { resize(); createParticles(); });
})();

// ── COMPTEUR HÉRO ──────────────────────────────────────────────

async function updateStatCount() {
    try {
        const json = await apiGet('/responses');
        const count = json.count || 0;
        const el = document.getElementById('stat-count');
        let start = parseInt(el.textContent) || 0;
        const step = Math.max(1, Math.ceil((count - start) / 20));
        const timer = setInterval(() => {
            start = Math.min(start + step, count);
            el.textContent = start;
            if (start >= count) clearInterval(timer);
        }, 40);
    } catch (err) {
        console.warn('Impossible de récupérer le compteur :', err.message);
    }
}

updateStatCount();

// ── HEADER ─────────────────────────────────────────────────────

document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('menu').classList.toggle('open');
});

document.getElementById('nav-result').addEventListener('click', e => { e.preventDefault(); showResults(); });
document.getElementById('nav-data').addEventListener('click', e => { e.preventDefault(); openModal(); });

// ── MODAL ──────────────────────────────────────────────────────

function openModal() {
    document.getElementById('modal-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    resetForm();
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
}

document.getElementById('btn-launch').addEventListener('click', openModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── FORMULAIRE MULTI-ÉTAPES ────────────────────────────────────

const stepSubtitles = {
    1: 'Informations générales',
    2: "Votre usage de l'IA",
    3: 'Impact & dépendance'
};

function goToStep(step) {
    document.getElementById(`step-${currentStep}`).classList.remove('active');
    document.querySelectorAll('.step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.remove('active', 'done');
        if (s < step) el.classList.add('done');
        if (s === step) el.classList.add('active');
    });
    currentStep = step;
    document.getElementById(`step-${currentStep}`).classList.add('active');
    document.getElementById('step-subtitle').textContent = stepSubtitles[step];
    document.getElementById('modal').scrollTop = 0;
}

document.querySelectorAll('.btn-next').forEach(btn => {
    btn.addEventListener('click', () => {
        if (validateStep(currentStep)) goToStep(parseInt(btn.dataset.next));
    });
});

document.querySelectorAll('.btn-prev').forEach(btn => {
    btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.prev)));
});

function validateStep(step) {
    if (step === 1) {
        const age = document.getElementById('age').value;
        if (!age || age < 16 || age > 40) return alert('Veuillez entrer un âge valide (16–40).'), false;
        if (!document.getElementById('universite').value) return alert('Veuillez sélectionner votre université.'), false;
        if (!document.getElementById('filiere').value)   return alert('Veuillez sélectionner votre filière.'), false;
        if (!document.getElementById('niveau').value)    return alert('Veuillez sélectionner votre niveau.'), false;
    }
    if (step === 2) {
        const outils = document.querySelectorAll('input[name="outils"]:checked');
        if (outils.length === 0) return alert('Veuillez cocher au moins un outil IA.'), false;
    }
    if (step === 3) {
        if (!document.getElementById('contexte').value) return alert("Veuillez sélectionner le contexte d'utilisation."), false;
        if (impactSelected === null) return alert('Veuillez sélectionner l\'impact perçu sur vos notes.'), false;
    }
    return true;
}

// Sliders
[
    ['score_academique', 'val-score'],
    ['connaissance_ia',  'val-connaissance'],
    ['frequence_usage',  'val-frequence'],
    ['autonomie',        'val-autonomie']
].forEach(([inputId, displayId]) => {
    const input = document.getElementById(inputId);
    input.addEventListener('input', () => {
        document.getElementById(displayId).textContent = input.value;
    });
});

// Boutons impact
document.querySelectorAll('.impact-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.impact-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        impactSelected = parseInt(btn.dataset.value);
        document.getElementById('impact_notes').value = impactSelected;
    });
});

// ── SOUMISSION → API Python ─────────────────────────────────────

document.getElementById('survey-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateStep(3)) return;

    const submitBtn = document.querySelector('.btn-submit');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Envoi en cours...</span>';

    const outils = [...document.querySelectorAll('input[name="outils"]:checked')].map(cb => cb.value);
    const autresOutils = document.getElementById('autres_outils').value.trim();
    if (autresOutils) outils.push(autresOutils);

    const payload = {
        pseudo:            document.getElementById('pseudo').value.trim() || 'Anonyme',
        age:               parseInt(document.getElementById('age').value),
        universite:        document.getElementById('universite').value,
        filiere:           document.getElementById('filiere').value,
        niveau_etudes:     document.getElementById('niveau').value,
        score_academique:  parseInt(document.getElementById('score_academique').value),
        connaissance_ia:   parseInt(document.getElementById('connaissance_ia').value),
        frequence_usage:   parseInt(document.getElementById('frequence_usage').value),
        outils,
        contexte_usage:    document.getElementById('contexte').value,
        autonomie_sans_ia: parseInt(document.getElementById('autonomie').value),
        impact_notes:      impactSelected,
        remarque:          document.getElementById('remarque').value.trim()
    };

    try {
        // ← Envoi vers Flask /api/responses
        await apiPost('/responses', payload);
        await updateStatCount();
        showSuccessScreen();
    } catch (err) {
        alert('Erreur lors de l\'enregistrement : ' + err.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Valider ma réponse</span><span class="submit-icon">✓</span>';
    }
});

function showSuccessScreen() {
    document.getElementById('survey-form').classList.add('hidden');
    document.getElementById('success-screen').classList.remove('hidden');
    document.querySelector('.modal-header').classList.add('hidden');
}

document.getElementById('btn-see-results').addEventListener('click', () => { closeModal(); showResults(); });
document.getElementById('btn-new-response').addEventListener('click', () => {
    document.getElementById('survey-form').classList.remove('hidden');
    document.getElementById('success-screen').classList.add('hidden');
    document.querySelector('.modal-header').classList.remove('hidden');
    resetForm();
});

function resetForm() {
    document.getElementById('survey-form').reset();
    impactSelected = null;
    document.querySelectorAll('.impact-btn').forEach(b => b.classList.remove('selected'));
    ['val-score','val-connaissance','val-frequence','val-autonomie'].forEach(id => {
        document.getElementById(id).textContent = '3';
    });
    const submitBtn = document.querySelector('.btn-submit');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Valider ma réponse</span><span class="submit-icon">✓</span>';
    goToStep(1);
    document.getElementById('survey-form').classList.remove('hidden');
    document.getElementById('success-screen').classList.add('hidden');
    document.querySelector('.modal-header').classList.remove('hidden');
}

// ── NAVIGATION SECTIONS ────────────────────────────────────────

function showResults() {
    document.getElementById('home-section').classList.add('hidden');
    document.getElementById('results-section').classList.remove('hidden');
    renderDashboard();
}

function showHome() {
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('home-section').classList.remove('hidden');
}

document.getElementById('btn-consult').addEventListener('click', showResults);
document.getElementById('btn-back').addEventListener('click', showHome);

const btnLaunch2 = document.getElementById('btn-launch-2');
if (btnLaunch2) btnLaunch2.addEventListener('click', () => { showHome(); openModal(); });

// ── DASHBOARD ─────────────────────────────────────────────────

const C = {
    text:      'rgba(238,242,247,0.85)',
    grid:      'rgba(255,255,255,0.06)',
    accent:    '#00e5a0',
    accent2:   '#4d9fff',
    danger:    '#ff4d6d',
    muted:     '#6b7a94'
};

function destroyCharts() {
    Object.values(charts).forEach(c => c && c.destroy());
    charts = {};
}

async function renderDashboard() {
    destroyCharts();

    let statsJson, responsesJson;
    try {
        // ← Récupère tout depuis l'API Flask
        [statsJson, responsesJson] = await Promise.all([
            apiGet('/stats'),
            apiGet('/responses')
        ]);
    } catch (err) {
        document.getElementById('no-data').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('no-data').querySelector('p').textContent =
            '⚠️ Impossible de joindre le serveur Flask.\nVérifiez que app.py est bien démarré.';
        return;
    }

    const stats = statsJson.data;
    const data  = responsesJson.data;

    document.getElementById('total-responses').textContent = stats.total;

    if (stats.total === 0) {
        document.getElementById('no-data').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('hidden');
        return;
    }

    document.getElementById('no-data').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');

    // KPIs — déjà calculés par Python
    document.getElementById('kpi-usage').textContent    = stats.avg_usage?.toFixed(1) ?? '—';
    document.getElementById('kpi-autonomy').textContent = stats.avg_autonomy?.toFixed(1) ?? '—';
    document.getElementById('kpi-tool').textContent     = stats.top_tool ?? '—';
    document.getElementById('kpi-dependent').textContent = (stats.pct_dependants ?? 0) + '%';

    // Insight automatique
    const insights = [];
    if (stats.avg_usage > 3.5)      insights.push('⚡ L\'IA est massivement adoptée par les étudiants.');
    else if (stats.avg_usage < 2.5) insights.push('📚 L\'usage de l\'IA reste limité dans cet échantillon.');
    if (stats.avg_autonomy < 2.5)   insights.push('⚠️ Une grande partie des étudiants se sent dépendante de l\'IA.');
    if (stats.pct_dependants > 30)  insights.push(`🔗 ${stats.pct_dependants}% des répondants sont classés "IA-dépendants".`);
    if (insights.length === 0)      insights.push('📊 Continuez à collecter des données pour des analyses plus précises.');
    document.getElementById('insight-text').textContent = insights.join(' — ');

    // Graphiques
    buildChartUniversite(stats.by_universite);
    buildChartOutils(stats.tools_distribution);
    buildChartScatter(stats.scatter);
    buildChartProfils(stats.profils);
    buildChartImpact(stats.impact_by_niveau);
}

// Graphique 1 : Barres — usage par université
function buildChartUniversite(byUniv) {
    const short  = byUniv.map(u => u.universite.replace('Université de ', 'U. ').replace('Ecole Nationale Supérieure Polytechnique', 'ENSP'));
    const values = byUniv.map(u => u.avg_usage);
    charts.univ = new Chart(document.getElementById('chart-universite'), {
        type: 'bar',
        data: {
            labels: short,
            datasets: [{ label: 'Fréquence moy.', data: values,
                backgroundColor: values.map(v => v > 3.5 ? C.accent : C.accent2),
                borderRadius: 6, borderSkipped: false }]
        },
        options: chartOpts({ max: 5 })
    });
}

// Graphique 2 : Doughnut — outils
function buildChartOutils(toolsDistrib) {
    const sorted  = Object.entries(toolsDistrib).slice(0, 5);
    const palette = [C.accent, C.accent2, '#ff9d4d', '#c77dff', C.danger];
    charts.outils = new Chart(document.getElementById('chart-outils'), {
        type: 'doughnut',
        data: {
            labels: sorted.map(e => e[0]),
            datasets: [{ data: sorted.map(e => e[1]), backgroundColor: palette,
                borderColor: '#0b1220', borderWidth: 3 }]
        },
        options: { responsive: true, cutout: '62%',
            plugins: { legend: legendStyle('bottom'), tooltip: tooltipStyle() } }
    });
}

// Graphique 3 : Scatter — score académique vs fréquence
function buildChartScatter(scatterData) {
    charts.scatter = new Chart(document.getElementById('chart-scatter'), {
        type: 'scatter',
        data: { datasets: [{ label: 'Score vs Usage', data: scatterData,
            backgroundColor: C.accent + 'cc', pointRadius: 6, pointHoverRadius: 8 }] },
        options: { responsive: true,
            scales: {
                x: { ...axisStyle(), title: { display: true, text: 'Score académique', color: C.muted }, min: 0.5, max: 5.5 },
                y: { ...axisStyle(), title: { display: true, text: 'Fréquence d\'usage', color: C.muted }, min: 0.5, max: 5.5 }
            },
            plugins: { legend: { display: false }, tooltip: tooltipStyle() }
        }
    });
}

// Graphique 4 : Doughnut — profils
function buildChartProfils(profils) {
    charts.profils = new Chart(document.getElementById('chart-profils'), {
        type: 'doughnut',
        data: {
            labels: ['IA-Dépendants', 'Augmentés', 'Indépendants', 'Mixtes'],
            datasets: [{ data: [profils.ia_dependants, profils.augmented, profils.independent, profils.mixed],
                backgroundColor: [C.danger, C.accent, C.accent2, C.muted],
                borderColor: '#0b1220', borderWidth: 3 }]
        },
        options: { responsive: true, cutout: '55%',
            plugins: { legend: legendStyle('bottom'), tooltip: tooltipStyle() } }
    });
}

// Graphique 5 : Barres empilées — impact par niveau
function buildChartImpact(impactData) {
    const niveaux = ['L1','L2','L3','L4','L5','M1','M2','Doctorat'];
    const impactMap = { '-2': 'Très négatif', '-1': 'Négatif', '0': 'Neutre', '1': 'Positif', '2': 'Très positif' };
    const colors = [C.danger, '#ff9d4d', C.muted, C.accent2, C.accent];

    const datasets = [-2,-1,0,1,2].map((val, i) => ({
        label: impactMap[val],
        data: niveaux.map(n => {
            const found = impactData.find(r => r.niveau === n && r.impact === val);
            return found ? found.count : 0;
        }),
        backgroundColor: colors[i], borderRadius: 4, borderSkipped: false
    }));

    charts.impact = new Chart(document.getElementById('chart-impact'), {
        type: 'bar',
        data: { labels: niveaux, datasets },
        options: { responsive: true,
            scales: {
                x: { ...axisStyle(), stacked: true },
                y: { ...axisStyle(), stacked: true,
                    title: { display: true, text: 'Nombre de répondants', color: C.muted } }
            },
            plugins: { legend: legendStyle('bottom'), tooltip: tooltipStyle() }
        }
    });
}

// ── HELPERS CHART.JS ──────────────────────────────────────────

function axisStyle() {
    return {
        ticks: { color: C.muted, font: { family: 'Outfit', size: 11 } },
        grid:  { color: C.grid },
        border: { color: C.grid }
    };
}
function legendStyle(pos = 'bottom') {
    return { labels: { color: C.text, font: { family: 'Outfit' }, padding: 14 }, position: pos };
}
function tooltipStyle() {
    return { backgroundColor: 'rgba(11,18,32,0.97)', borderColor: C.accent, borderWidth: 1,
        titleColor: C.accent, bodyColor: C.text,
        titleFont: { family: 'Space Mono', size: 11 }, bodyFont: { family: 'Outfit', size: 12 },
        padding: 12, cornerRadius: 8 };
}
function chartOpts({ max = 5 } = {}) {
    return { responsive: true,
        scales: { x: axisStyle(), y: { ...axisStyle(), min: 0, max } },
        plugins: { legend: { display: false }, tooltip: tooltipStyle() }
    };
}

// ── EXPORT JSON ────────────────────────────────────────────────

document.getElementById('btn-export').addEventListener('click', async () => {
    try {
        const json = await apiGet('/responses');
        const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `iacam_data_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Erreur export : ' + err.message);
    }
});

// ── EFFACER DONNÉES → API ──────────────────────────────────────

document.getElementById('btn-clear').addEventListener('click', async () => {
    if (!confirm('⚠️ Effacer toutes les données ? Cette action est irréversible.')) return;
    try {
        await apiDelete('/responses');
        await updateStatCount();
        renderDashboard();
    } catch (err) {
        alert('Erreur suppression : ' + err.message);
    }
});