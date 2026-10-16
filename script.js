// SDU Homepage Main Script (02-1 Edition)

let chartInstances = {};
let offsets = { philosophy: 0, iching: 0 };

window.searchGemini = function(form) {
    if (!form || !form.q) return;
    const query = form.q.value.trim();
    if (query) {
        navigator.clipboard.writeText(query).then(() => {
            alert('질문이 복사되었습니다. Gemini 창에서 Ctrl+V로 붙여넣어 주세요.');
            window.open('https://gemini.google.com/app', '_blank');
        }).catch(() => {
            window.open('https://gemini.google.com/app', '_blank');
        });
    } else {
        window.open('https://gemini.google.com/app', '_blank');
    }
};

window.searchNaverAI = function(form) {
    if (!form || !form.query) return;
    const query = form.query.value.trim();
    if (query) {
        window.open(`https://search.naver.com/search.naver?query=${encodeURIComponent(query)}&ssc=tab.ait.all`, '_blank');
    } else {
        window.open('https://search.naver.com/search.naver?ssc=tab.ait.all', '_blank');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initWeather();
    initPhilosophy();
    initIChing();
    initShortcuts();
});


// --- 1. Weather (Open-Meteo API) ---
const LOCATIONS = {
    paju: { lat: 37.7599, lon: 126.7779 },
    seoul: { lat: 37.5665, lon: 126.9780 },
    jeju: { lat: 33.4996, lon: 126.5312 }
};

const WMO_CODES = {
    0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림',
    45: '안개', 48: '안개', 51: '가벼운 비', 53: '비', 55: '강한 비',
    61: '가벼운 비', 63: '비', 65: '강한 비', 71: '가벼운 눈', 73: '눈', 75: '강한 눈',
    80: '소나기', 95: '뇌우', 96: '뇌우/우박', 99: '뇌우/우박'
};

async function updateWeatherWidget() {
    try {
        // Fallback: Goyang-si Deogi-dong coords (approx)
        let lat = 37.6970;
        let lon = 126.7380;
        let locName = "고양시 덕이동";
        
        // Attempt to get user's current location
        if (navigator.geolocation) {
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000, maximumAge: 60000 });
                });
                lat = pos.coords.latitude;
                lon = pos.coords.longitude;
                
                try {
                    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&accept-language=ko`);
                    const geoData = await geoRes.json();
                    if (geoData && geoData.address) {
                        const addr = geoData.address;
                        const city = addr.city || addr.province || addr.county || '';
                        const neighborhood = addr.suburb || addr.borough || addr.village || addr.town || '';
                        locName = `${city} ${neighborhood}`.trim();
                    }
                } catch(e) {
                    console.log("Reverse geocoding failed", e);
                }
            } catch (e) {
                console.log("위치 정보를 가져올 수 없어 기본 지역을 사용합니다.", e);
            }
        }
        
        const locEl = document.getElementById('weather-location');
        if (locEl) locEl.textContent = locName || "현재 위치";
        
        // Fetch current, daily min/max, and hourly temp/weathercode
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,weathercode&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul`;
        const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;
        
        const [weatherRes, aqiRes] = await Promise.all([fetch(weatherUrl), fetch(aqiUrl)]);
        const weatherData = await weatherRes.json();
        const aqiData = await aqiRes.json();
        
        const current = weatherData.current_weather;
        const temp = current.temperature;
        const code = current.weathercode;
        const desc = WMO_CODES[code] || '알 수 없음';
        
        const maxTemp = Math.round(weatherData.daily.temperature_2m_max[0]);
        const minTemp = Math.round(weatherData.daily.temperature_2m_min[0]);
        
        const pm10 = aqiData.current.pm10;
        const pm25 = aqiData.current.pm2_5;
        
        const getAqiDesc = (val, isPm25) => {
            let status = '';
            let color = '';
            if (isPm25) {
                if (val <= 15) { status = '좋음'; color = '#4fc3f7'; }
                else if (val <= 35) { status = '보통'; color = '#81c784'; }
                else if (val <= 75) { status = '나쁨'; color = '#ffb74d'; }
                else { status = '매우나쁨'; color = '#e57373'; }
            } else {
                if (val <= 30) { status = '좋음'; color = '#4fc3f7'; }
                else if (val <= 80) { status = '보통'; color = '#81c784'; }
                else if (val <= 150) { status = '나쁨'; color = '#ffb74d'; }
                else { status = '매우나쁨'; color = '#e57373'; }
            }
            return `<span style="color:${color}; font-weight:500;">${status}</span>`;
        };
        
        // Update DOM
        const tempEl = document.querySelector('.weather-temp');
        if (tempEl) {
            tempEl.textContent = `${temp}°`;
            document.querySelector('.weather-desc').textContent = desc;
            document.querySelector('.weather-highlow').innerHTML = `<span class="w-low">${minTemp}°</span> / <span class="w-high">${maxTemp}°</span>`;
            document.querySelector('.weather-dust').innerHTML = `미세 ${getAqiDesc(pm10, false)} · 초미세 ${getAqiDesc(pm25, true)}`;
        }
        
        // Chart: get next 5 points (every 2 hours)
        const hourIdx = weatherData.hourly.time.findIndex(t => new Date(t) > new Date());
        let startIdx = hourIdx > 0 ? hourIdx - 1 : 0;
        
        let chartData = [];
        let chartLabels = [];
        let chartIcons = [];
        for (let i = 0; i < 5; i++) {
            let idx = startIdx + (i * 2); // every 2 hours
            if (idx >= weatherData.hourly.time.length) break;
            
            const t = new Date(weatherData.hourly.time[idx]);
            const hour = t.getHours();
            chartLabels.push(hour + '시');
            chartData.push(weatherData.hourly.temperature_2m[idx]);
            
            const cCode = weatherData.hourly.weathercode[idx];
            const isNight = hour < 6 || hour >= 19;
            if (isNight && [0,1,2].includes(cCode)) {
                chartIcons.push(`<div class="fc-icon-moon"><svg viewBox="0 0 24 24" width="20" height="20" fill="#7baaf7"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg></div>`);
            } else if ([0,1,2].includes(cCode)) {
                chartIcons.push(`<div class="fc-icon-sun"></div>`);
            } else if ([3].includes(cCode)) {
                chartIcons.push(`<span style="font-size:16px;">☁️</span>`);
            } else {
                chartIcons.push(`<span style="font-size:16px;">🌧️</span>`);
            }
        }
        
        // Render forecast items
        const fcRow = document.querySelector('.weather-forecast-row');
        if (fcRow) {
            fcRow.innerHTML = chartData.map((d, i) => `
                <div class="fc-item">
                    ${chartIcons[i]}
                    <div class="fc-time">${i === 0 ? chartLabels[i] : chartLabels[i].replace('시', '')}</div>
                </div>
            `).join('');
        }
        
        // Render Chart
        const ctx = document.getElementById('weatherMiniChart');
        if (ctx) {
            if (chartInstances['weatherMiniChart']) {
                chartInstances['weatherMiniChart'].destroy();
            }
            chartInstances['weatherMiniChart'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        data: chartData,
                        borderColor: 'rgba(255, 255, 255, 0.25)',
                        borderWidth: 1.5,
                        tension: 0.4,
                        pointRadius: 0,
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    layout: { padding: { top: 12, bottom: 2, left: 8, right: 8 } },
                    scales: {
                        x: { display: false },
                        y: { display: false, min: Math.min(...chartData) - 3, max: Math.max(...chartData) + 6 }
                    },
                    animation: false
                },
                plugins: [{
                    id: 'topLabels',
                    afterDatasetsDraw(chart) {
                        const { ctx, data } = chart;
                        ctx.save();
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                        ctx.font = '10px "Inter", sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        
                        const meta = chart.getDatasetMeta(0);
                        meta.data.forEach((point, i) => {
                            const value = Math.round(data.datasets[0].data[i]);
                            ctx.fillText(value + '°', point.x, point.y - 4);
                        });
                        ctx.restore();
                    }
                }]
            });
        }
        
    } catch (error) {
        console.error('Weather error:', error);
    }
}

function initWeather() {
    updateWeatherWidget();
}


// --- 3. Daily I Ching ---
function initIChing(offset = 0) {
    const container = document.getElementById('iching-content');
    if (typeof ichingData === 'undefined' || ichingData.length === 0) {
        container.innerHTML = '<p>주역 데이터가 없습니다.</p>';
        return;
    }
    
    const now = new Date();
    now.setDate(now.getDate() + offset);
    
    // Populate select if empty
    const selectEl = document.getElementById('iching-select');
    if (selectEl && selectEl.options.length === 0) {
        ichingData.forEach((item, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${item.id}. ${String.fromCodePoint(0x4DC0 + item.id - 1)} ${item.name_korean}`;
            selectEl.appendChild(opt);
        });
    }

    // 2026년 9월 18일을 시작점(1번, index 0)으로 설정하여 매일 1씩 증가
    const nowZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const baseZero = new Date(2026, 8, 18); // 9월은 8
    const diffDays = Math.round((nowZero - baseZero) / (1000 * 60 * 60 * 24));
    let index = diffDays % ichingData.length;
    if (index < 0) index += ichingData.length;

    // Update UI label
    const dateEl = document.getElementById('iching-date');
    if (dateEl) {
        dateEl.textContent = offset === 0 ? '오늘' : `${index + 1}`;
    }
    
    if (selectEl) selectEl.value = index;
    
    const hexagram = ichingData[index];
    
    let html = `
        <div class="iching-header">
            <span class="iching-hexagram-icon">
                ${String.fromCodePoint(0x4DC0 + hexagram.id - 1)}
            </span>
            <span class="iching-hexagram-name">${hexagram.name_korean}(${hexagram.name_chinese})</span>
        </div>
        <div class="iching-text" id="iching-original-text">
            ${hexagram.description ? `<p class="text-body"><span class="label-badge" >설명</span> ${hexagram.description.replace(/\n/g, '<br>')}</p>` : ''}
            <div class="iching-box" id="iching-base-gwaesa">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <p class="iching-box-title" style="margin: 0;"><strong>卦辭 (괘사)</strong></p>
                    <div style="display: flex; gap: 5px; align-items: center;" class="tts-ignore">
                        <button onclick="fetchIchingSectionAI(${index}, -1, this)" class="nav-btn" style="background: var(--primary); padding: 4px 10px; border-radius: 4px; font-size: 0.8em; margin-right: 10px;">✨ 정본 해설 열기</button>
                        <button class="tts-speed-btn" onclick="toggleTTSSpeed()" title="속도 조절 (현재 1.0x)" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">1.0x</button>
                        <button class="tts-btn" onclick="toggleTTS('iching-base-gwaesa')" id="tts-btn-iching-base-gwaesa" title="읽기/정지" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">🔊</button>
                    </div>
                </div>
                <p class="iching-box-text">${hexagram.gwaesa_chinese}</p>
                <p class="text-body">${hexagram.gwaesa_korean}</p>
                <div id="ai-result-gwaesa-${index}" style="display:none; margin-top:15px;" class="tts-ignore"></div>
            </div>
            <div class="iching-box">
                <p class="iching-box-title"><strong>爻辭</strong></p>
                ${hexagram.lines ? hexagram.lines.map((l, idx) => {
                    const ttsId = `iching-base-yaosa-${idx}`;
                    return `<div class="iching-line-item" id="${ttsId}">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span class="iching-line-name" style="font-weight: bold; color: var(--primary);">[${l.name}]</span>
                            <div style="display: flex; gap: 5px; align-items: center;" class="tts-ignore">
                                <button onclick="fetchIchingSectionAI(${index}, ${idx}, this)" class="nav-btn" style="background: var(--primary); padding: 4px 10px; border-radius: 4px; font-size: 0.8em; margin-right: 10px;">✨ 정본 해설 열기</button>
                                <button class="tts-speed-btn" onclick="toggleTTSSpeed()" title="속도 조절 (현재 1.0x)" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">1.0x</button>
                                <button class="tts-btn" onclick="toggleTTS('${ttsId}')" id="tts-btn-${ttsId}" title="읽기/정지" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">🔊</button>
                            </div>
                        </div>
                        <div class="iching-line-text">${l.text_chinese}</div>
                        <div class="text-body">${l.text_korean}</div>
                        <div id="ai-result-yaosa-${index}-${idx}" style="display:none; margin-top:15px;" class="tts-ignore"></div>
                    </div>`;
                }).join('') : ''}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

window.fetchIchingSectionAI = async function(index, lineIndex, btnEl) {
    if (!btnEl) return;
    
    const hexagram = ichingData[index];
    let title, text, resultContainerId;
    
    if (lineIndex === -1) {
        title = "괘사";
        text = hexagram.gwaesa_chinese;
        resultContainerId = `ai-result-gwaesa-${index}`;
    } else {
        const line = hexagram.lines[lineIndex];
        title = line.name;
        text = line.text_chinese;
        resultContainerId = `ai-result-yaosa-${index}-${lineIndex}`;
    }
    
    const resultContainer = document.getElementById(resultContainerId);
    if (!resultContainer) return;
    
    if (resultContainer.dataset.loaded === "true") {
        const isHidden = resultContainer.style.display === 'none';
        resultContainer.style.display = isHidden ? 'block' : 'none';
        btnEl.textContent = isHidden ? '✨ 정본 해설 닫기' : '✨ 정본 해설 열기';
        return;
    }

    const renderScholar = (key, label, data) => {
        const hasData = data && typeof data === 'object';
        const original = (hasData && data.original) ? data.original.trim() : (typeof data === 'string' ? data.trim() : '');
        const translation = (hasData && data.translation) ? data.translation.trim() : '';
        const bookBadge = (hasData && data.book) ? `<span style="font-size:0.8em; color:var(--primary); font-weight:600; padding:2px 7px; background:rgba(56,189,248,0.12); border-radius:4px; border:1px solid rgba(56,189,248,0.25);">『${data.book}』</span>` : '';

        const scholarId = `scholar-${index}-${lineIndex}-${key}`;

        // 원문이 없거나 '원문 미상' 등인 경우: 임의 해설을 일절 표시하지 않고 깔끔하게 비워둠
        const isOriginalEmpty = !original || original === '""' || original.includes('원문 미상') || original.includes('미상');

        if (isOriginalEmpty) {
            return `
                <div class="saju-box" style="margin-bottom: 12px; opacity: 0.55;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <p class="saju-box-title" style="margin:0; font-weight:700;">${label}</p>
                        ${bookBadge}
                    </div>
                    <p style="color:var(--text-muted); font-size:0.85em; margin: 4px 0 0;">(원문 없음)</p>
                </div>`;
        }

        return `
            <div class="saju-box" id="${scholarId}" style="margin-bottom: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <p class="saju-box-title" style="margin:0; font-weight:700;">${label}</p>
                    <div style="display:flex; align-items:center; gap:6px;">
                        ${bookBadge}
                        <button class="tts-btn" onclick="toggleTTS('${scholarId}')" id="tts-btn-${scholarId}" title="${label} 주석 읽기/정지">🔊</button>
                    </div>
                </div>
                <div style="background: rgba(0,0,0,0.18); padding: 10px 12px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid var(--primary);">
                    <div class="tts-ignore" style="font-size: 0.72em; color: var(--text-muted); margin-bottom: 4px; font-weight: 600;">[한문 정본 原文]</div>
                    <p style="font-family: 'Noto Serif KR', 'Batang', serif; color: var(--text-primary); font-size: 0.95em; line-height: 1.65; letter-spacing: 0.03em; margin: 0;">${original}</p>
                </div>
                ${translation ? `
                <div style="padding-top: 4px;">
                    <div class="tts-ignore" style="font-size: 0.72em; color: var(--text-muted); margin-bottom: 3px; font-weight: 600;">[정통 번역]</div>
                    <p style="line-height: 1.65; color: var(--text-secondary); margin: 0; font-size: 0.92em;">${translation}</p>
                </div>` : ''}
            </div>`;
    };

    const renderKoreanScholars = (scholars) => {
        if (!scholars || !scholars.length) return '';
        const allKoreanId = `korean-all-${index}-${lineIndex}`;
        const listHtml = scholars.map((s, idx) => {
            const kScholarId = `korean-scholar-${index}-${lineIndex}-${idx}`;
            return `
                <div id="${kScholarId}" style="margin-bottom: 10px; padding: 10px 12px; background: rgba(0,0,0,0.16); border-radius: 6px; border-left: 3px solid #c084fc;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px; gap: 8px;">
                        <div style="font-size: 0.85em; font-weight: 700; color: #d8b4fe; flex: 1; min-width: 0;">${s.scholar}</div>
                        <button class="tts-btn" onclick="toggleTTS('${kScholarId}')" id="tts-btn-${kScholarId}" title="${s.scholar} 주석 읽기/정지" style="color:#d8b4fe; border-color:rgba(168,85,247,0.35);">🔊</button>
                    </div>
                    <div style="font-family: 'Noto Serif KR', 'Batang', serif; color: var(--text-primary); font-size: 0.92em; line-height: 1.6; margin-bottom: 4px;">${s.original}</div>
                    <div style="color: var(--text-secondary); font-size: 0.88em; line-height: 1.55;">${s.translation}</div>
                </div>
            `;
        }).join('');

        return `
            <details style="margin-top: 14px; background: rgba(168,85,247,0.06); border: 1px solid rgba(168,85,247,0.25); border-radius: 6px; padding: 10px 12px;">
                <summary style="cursor: pointer; font-weight: 600; color: #c084fc; font-size: 0.88em; user-select: none; padding: 3px 0;">
                    <span>🇰🇷 한국 대표 역학자(조선 성리학자) 정본 주석 보기 (${scholars.length}인 수록)</span>
                </summary>
                <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(168,85,247,0.25);">
                    <div class="korean-scholars-toolbar">
                        <span style="font-size: 0.78rem; color: #d8b4fe; font-weight: 500;">조선 성리학 8대 학자 주석</span>
                        <button class="tts-full-btn purple" onclick="toggleTTS('${allKoreanId}')" id="tts-btn-${allKoreanId}" title="한국 학자 주석 전체 낭독">
                            <span>🔊 한국학자 주석 낭독</span>
                        </button>
                    </div>
                    <div id="${allKoreanId}">
                        ${listHtml}
                    </div>
                </div>
            </details>
        `;
    };

    const renderScholars = (item) => {
        if (!item) return '';
        const allScholarsId = `all-scholars-${index}-${lineIndex}`;
        return `
            <div style="background: var(--bg-2); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
                <div class="commentary-header">
                    <div class="commentary-title-row">
                        <div class="commentary-title-group">
                            <h5 class="commentary-title">[${item.title}] 7대 학자 정본 주석</h5>
                            <p class="commentary-subtitle">한국학중앙연구원 『한국주역대전』 DB 및 ctext.org 정본 판본 기준</p>
                        </div>
                        <span class="db-badge">✓ 공인 정본 DB</span>
                    </div>
                    <div class="commentary-toolbar">
                        <div class="commentary-toolbar-info">
                            <span class="scholar-count-badge">📚 송·명·청 7대 역학자 전권 수록</span>
                        </div>
                        <div class="commentary-toolbar-actions">
                            <button class="tts-btn tts-speed-btn" onclick="changeTTSSpeed()" title="낭독 속도 조절">${window.ttsRate ? window.ttsRate.toFixed(2) : '1.00'}x</button>
                            <button class="tts-full-btn" onclick="toggleTTS('${allScholarsId}')" id="tts-btn-${allScholarsId}" title="7대 학자 주석 전체 연속 낭독">
                                <span>🔊 전체 주석 낭독</span>
                            </button>
                            <button class="tts-btn" onclick="pauseTTS()" id="tts-pause-${allScholarsId}" title="일시정지/재개" style="display: none;">⏸️</button>
                        </div>
                    </div>
                </div>
                <div id="${allScholarsId}">
                    ${renderScholar('wangbi', '왕필 (王弼)', item.wangbi)}
                    ${renderScholar('kongyingda', '공영달 (孔穎達)', item.kongyingda)}
                    ${renderScholar('sushi', '소식 (蘇軾)', item.sushi)}
                    ${renderScholar('chengyi', '정이 (程頤)', item.chengyi)}
                    ${renderScholar('zhuxi', '주희 (朱熹)', item.zhuxi)}
                    ${renderScholar('shuanghu', '쌍호호씨 (胡炳文)', item.shuanghu)}
                    ${renderScholar('yunfeng', '운봉호씨 (胡一桂)', item.yunfeng)}
                    ${renderKoreanScholars(item.korean_scholars)}
                </div>
            </div>
        `;
    };

    // 1순위: 사전 추출된 64괘 7대 정본 주석 DB에서 즉시 로드 (0ms 즉시 표시, 100% 정본)
    const cachedItem = window.ichingCommentariesData?.[String(hexagram.id)]?.[String(lineIndex)];
    if (cachedItem) {
        resultContainer.innerHTML = renderScholars(cachedItem);
        resultContainer.style.display = 'block';
        resultContainer.dataset.loaded = "true";
        btnEl.textContent = '✨ 정본 해설 닫기';
        btnEl.disabled = false;
        return;
    }
    
    // 2순위: 캐시가 없는 경우 백엔드 API 호출 (Fallback)
    btnEl.disabled = true;
    btnEl.textContent = '불러오는 중... (약 1~2초)';
    
    try {
        const response = await fetch('/api/iching', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: hexagram.id,
                name: hexagram.name_korean + '(' + hexagram.name_chinese + ')',
                nameChinese: hexagram.name_chinese,
                title: lineIndex === -1 ? '卦辭(괘사)' : line.name,
                text: text
            })
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'API 요청 실패');
        }
        const jsonResponse = await response.json();
        const item = Array.isArray(jsonResponse) ? jsonResponse[0] : jsonResponse;
        
        resultContainer.innerHTML = renderScholars(item);
        resultContainer.style.display = 'block';
        resultContainer.dataset.loaded = "true";
        btnEl.textContent = '✨ 정본 해설 닫기';
        btnEl.disabled = false;
        
    } catch (e) {
        console.error(e);
        btnEl.disabled = false;
        btnEl.textContent = '해설 실패 (재시도)';
        let errMsg = e.message || '정본 해설을 불러오는 중 오류가 발생했습니다.';
        if (errMsg.includes('high demand') || errMsg.includes('503')) {
            errMsg = '⚠️ 서버가 혼잡합니다. 잠시 후 재시도해주세요.';
        } else if (errMsg.includes('not found') || errMsg.includes('404')) {
            errMsg = '⚠️ 해설 데이터를 찾을 수 없습니다. 잠시 후 재시도해주세요.';
        }
        resultContainer.innerHTML = `<div style="color: var(--text-secondary); font-size: 0.85em; padding: 10px; text-align:center;">${errMsg}</div>`;
        resultContainer.style.display = 'block';
    }
};


// --- 6. Today's Philosophy ---

function toggleDeleuzeOverview() {
    const content = document.getElementById('deleuze-overview-content');
    const btn = document.getElementById('deleuze-toggle-btn');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        btn.innerHTML = '이 100개를 이해하는 가장 중요한 10단계 접기 ▲';
    } else {
        content.style.display = 'none';
        btn.innerHTML = '이 100개를 이해하는 가장 중요한 10단계 펼치기 ▼';
    }
}

function formatPhilContent(text) {
    if (!text) return '';
    return text
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="tts-ignore" style="color:var(--primary); text-decoration:underline;">$1 ↗</a>')
        .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary); font-weight:700;">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function initPhilosophy(forceIndex = null) {
    const container = document.getElementById('philosophy-content');
    const gridContainer = document.getElementById('philosophy-chapter-grid');
    const selectEl = document.getElementById('philosophy-select');
    
    if (typeof philosophyData === 'undefined' || philosophyData.length === 0) {
        if (container) container.innerHTML = '<div style="color:var(--text-secondary);">철학 데이터를 불러올 수 없습니다.</div>';
        return;
    }

    // 전처리: 각 항목의 chapter 추출 (제목의 대괄호 부분)
    if (!philosophyData[0]._processed) {
        philosophyData.forEach(item => {
            const match = item.title.match(/^\[(.*?)\]/);
            if (match) {
                item.chapter = match[1];
            }
            item._processed = true;
        });
    }
    
    // 1. Calculate today's default index
    const nowZero = new Date();
    nowZero.setHours(0,0,0,0);
    const baseZero = new Date(2026, 8, 18); // 9월은 8
    const diffDays = Math.round((nowZero - baseZero) / (1000 * 60 * 60 * 24));
    let todayIndex = diffDays % philosophyData.length;
    if (todayIndex < 0) todayIndex += philosophyData.length;
    
    // 2. Initialize offsets.philosophy ONCE as absolute index
    if (typeof window._philInitIndex === 'undefined') {
        window._philInitIndex = true;
        offsets.philosophy = todayIndex;
    }
    
    let index = offsets.philosophy;

    // Populate select ONCE
    if (selectEl && selectEl.options.length === 0) {
        philosophyData.forEach((item, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            // 옵션 텍스트는 "[챕터] 1. 제목" 형식에서 챕터와 숫자 제외하고 간략히
            opt.textContent = `${idx + 1}. ${item.title.replace(/^(?:\[.*?\]\s*)?(?:\d+\.\s*)?/, '').substring(0, 25)}...`;
            selectEl.appendChild(opt);
        });
        selectEl.style.display = 'inline-block';
    }
    if (selectEl) selectEl.value = index;

    // Generate chapter buttons ONCE
    if (gridContainer && gridContainer.children.length === 0) {
        const chapters = [];
        const chapterIndices = {};
        philosophyData.forEach((item, idx) => {
            if (item.chapter && !chapterIndices.hasOwnProperty(item.chapter)) {
                chapters.push(item.chapter);
                chapterIndices[item.chapter] = idx;
            }
        });

        chapters.forEach(chap => {
            const btn = document.createElement('button');
            btn.className = 'phil-chapter-btn';
            let shortChap = chap.replace(/^[0-9A-ZIVX]+\.\s*/, '').replace(/^[①-⑳]\s*/, '').trim();
            if (shortChap.startsWith("들뢰즈 철학의 ")) shortChap = shortChap.replace("들뢰즈 철학의 ", "");
            btn.textContent = shortChap;
            btn.onclick = () => {
                offsets.philosophy = chapterIndices[chap];
                initPhilosophy();
            };
            gridContainer.appendChild(btn);
        });
    }

    // Update UI label
    const dateEl = document.getElementById('philosophy-date');
    if (dateEl) {
        dateEl.textContent = index === todayIndex ? '오늘' : `${index + 1}/${philosophyData.length}`;
    }

    const item = philosophyData[index];

    const chapterBadge = item.chapter
        ? `<div class="phil-chapter-badge tts-ignore">${item.chapter}</div>`
        : '';
    const sourceBadge = item.source
        ? `<div class="phil-source tts-ignore">📖 ${item.source}</div>`
        : '';

    const displayTitle = item.title.replace(/^\[.*?\]\s*/, '');

    if (container) {
        container.innerHTML = `
            ${chapterBadge}
            <div class="text-lg text-bold text-accent" style="margin: 10px 0 14px;">${displayTitle}</div>
            <div class="philosophy-desc text-body">${formatPhilContent(item.content)}</div>
            ${sourceBadge}
        `;
    }

    // Highlight active button
    if (gridContainer) {
        gridContainer.querySelectorAll('.phil-chapter-btn').forEach(btn => {
            let shortChap = item.chapter ? item.chapter.replace(/^[0-9A-ZIVX]+\.\s*/, '').replace(/^[①-⑳]\s*/, '').trim() : '';
            if (shortChap.startsWith("들뢰즈 철학의 ")) shortChap = shortChap.replace("들뢰즈 철학의 ", "");
            
            if (item.chapter && btn.textContent === shortChap) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // 고정 섹션 (최초 1회만 렌더링)
    renderPhilosophyFixed();
}

function renderPhilosophyFixed() {
    if (document.getElementById('philosophy-fixed-section')) return; // 이미 있으면 skip
    if (typeof philosophyFixed === 'undefined') return;

    const section = document.querySelector('.philosophy-section');
    if (!section) return;

    const stepsHTML = philosophyFixed.steps.map(s =>
        `<li><span class="phil-step-change">${s.change}</span><span class="phil-step-desc"> — ${s.desc}</span></li>`
    ).join('');

    const bibHTML = philosophyFixed.bibliography.map(b =>
        `<li>${b}</li>`
    ).join('');

    const chaptersHTML = philosophyFixed.chapters.map(c => {
        const match = c.items.match(/^(\d+)/);
        const index = match ? parseInt(match[1], 10) - 1 : 0;
        return `<button class="phil-chapter-tag" onclick="showPhilChapterPreview(${index}, this)">${c.label} <em>${c.title}</em> <small>(${c.items})</small></button>`;
    }).join('');

    const fixedEl = document.createElement('div');
    fixedEl.id = 'philosophy-fixed-section';
    fixedEl.className = 'phil-fixed-wrap';
    fixedEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <button class="phil-fixed-toggle" onclick="togglePhilFixed()" id="phil-fixed-btn" style="flex: 1; margin: 0; text-align: left;">
                📚 들뢰즈 철학 전체 흐름 &amp; 문헌
                <span id="phil-fixed-chevron" style="float:right; margin-right: 8px;">▸</span>
            </button>
            <div style="display: flex; gap: 4px; margin-left: 8px;">
                <button class="tts-btn tts-speed-btn" onclick="changeTTSSpeed()" title="속도 조절" style="width: auto; padding: 0 6px; font-size: 0.7rem; border-radius: var(--r-sm);">${window.ttsRate ? window.ttsRate.toFixed(2) : '1.00'}x</button>
                <button class="tts-btn" onclick="toggleTTS('phil-fixed-body')" id="tts-btn-phil-fixed-body" title="읽기/정지">🔊</button>
                <button class="tts-btn" onclick="pauseTTS()" id="tts-pause-phil-fixed-body" title="일시정지/재개" style="display: none;">⏸️</button>
            </div>
        </div>
        <div id="phil-fixed-body" style="display:none;">
            <div class="phil-summary-box">
                <p>"${philosophyFixed.summary}"</p>
                <div class="phil-flow">${philosophyFixed.flow}</div>
            </div>
            <div class="phil-chapters-row">${chaptersHTML}</div>
            <div id="phil-chapter-preview" style="display:none; margin-bottom:16px; padding:15px; background:var(--bg-2); border-left:3px solid var(--accent); border-radius:4px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);"></div>
            <div class="phil-fixed-cols">
                <div class="phil-fixed-col">
                    <h4>이 100개를 이해하는 10단계</h4>
                    <ol class="phil-steps-list">${stepsHTML}</ol>
                </div>
                <div class="phil-fixed-col">
                    <h4>핵심 1차 문헌</h4>
                    <ul class="phil-bib-list">${bibHTML}</ul>
                </div>
            </div>
        </div>
    `;
    section.appendChild(fixedEl);
}

function togglePhilFixed() {
    const body = document.getElementById('phil-fixed-body');
    const chevron = document.getElementById('phil-fixed-chevron');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.textContent = isOpen ? '▸' : '▾';
}

window.showPhilChapterPreview = function(index, btnEl = null) {
    const previewEl = document.getElementById('phil-chapter-preview');
    if (!previewEl) return;
    
    if (btnEl) {
        if (btnEl.classList.contains('active')) {
            btnEl.classList.remove('active');
            previewEl.style.display = 'none';
            return;
        }
        document.querySelectorAll('.phil-chapter-tag').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }
    
    // Bounds check with wrap-around
    if (index < 0) index = philosophyData.length - 1;
    if (index >= philosophyData.length) index = 0;
    
    const item = philosophyData[index];
    if (item) {
        const prevIdx = (index - 1 + philosophyData.length) % philosophyData.length;
        const nextIdx = (index + 1) % philosophyData.length;
        
        previewEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                <button onclick="showPhilChapterPreview(${prevIdx})" style="background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text-primary); cursor:pointer; font-size:0.9rem; padding:4px 10px; border-radius:4px; transition:background 0.2s;">◀</button>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">[${index + 1}번 항목 내용 미리보기]</div>
                <button onclick="showPhilChapterPreview(${nextIdx})" style="background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text-primary); cursor:pointer; font-size:0.9rem; padding:4px 10px; border-radius:4px; transition:background 0.2s;">▶</button>
            </div>
            <h4 style="margin: 0 0 8px 0; color: var(--accent-light); font-size: 1.05rem;">${item.title}</h4>
            <div class="text-body" style="font-size: 0.95rem; line-height: 1.6;">${formatPhilContent(item.content)}</div>
        `;
        previewEl.style.display = 'block';
    }
};


// --- Navigation ---
function changeOffset(type, direction) {
    if (type === 'philosophy') {
        const len = (typeof philosophyData !== 'undefined' && philosophyData.length) ? philosophyData.length : 100;
        offsets.philosophy = (offsets.philosophy + direction) % len;
        if (offsets.philosophy < 0) offsets.philosophy += len;
        initPhilosophy(offsets.philosophy);
    } else if (type === 'iching') {
        const len = (typeof ichingData !== 'undefined' && ichingData.length) ? ichingData.length : 64;
        offsets.iching = (offsets.iching + direction) % len;
        if (offsets.iching < 0) offsets.iching += len;
        initIChing(offsets.iching);
    }
}

function jumpToPhilosophy(index) {
    offsets.philosophy = parseInt(index);
    initPhilosophy(offsets.philosophy);
}

function jumpToIChing(index) {
    offsets.iching = parseInt(index);
    initIChing(offsets.iching);
}


// --- TTS 기능 ---
window.ttsRate = 1.0;

window.changeTTSSpeed = function() {
    const rates = [0.75, 1.0, 1.25, 1.5, 2.0];
    let idx = rates.indexOf(window.ttsRate);
    window.ttsRate = rates[(idx + 1) % rates.length];
    
    const speedBtns = document.querySelectorAll('.tts-speed-btn');
    speedBtns.forEach(btn => {
        btn.textContent = window.ttsRate.toFixed(2) + 'x';
    });
};

let currentUtterance = null;
let currentPlayingSection = null;

window.toggleTTS = function(section) {
    if (!('speechSynthesis' in window)) {
        alert('이 브라우저는 TTS(텍스트 읽어주기) 기능을 지원하지 않습니다.');
        return;
    }

    const synth = window.speechSynthesis;
    const btn = document.getElementById(`tts-btn-${section}`);
    const pauseBtn = document.getElementById(`tts-pause-${section}`);

    function resetBtnText(b) {
        if (!b) return;
        b.classList.remove('playing');
        if (b.dataset.origText) {
            b.innerHTML = b.dataset.origText;
        } else if (b.classList.contains('purple')) {
            b.innerHTML = '<span>🔊 한국학자 주석 낭독</span>';
        } else if (b.classList.contains('tts-full-btn')) {
            b.innerHTML = '<span>🔊 전체 주석 낭독</span>';
        } else {
            b.textContent = '🔊';
        }
    }

    function setBtnPlayingText(b) {
        if (!b) return;
        if (!b.dataset.origText) {
            b.dataset.origText = b.innerHTML;
        }
        b.classList.add('playing');
        if (b.classList.contains('tts-full-btn') || (b.dataset.origText && (b.dataset.origText.includes('주석 낭독') || b.dataset.origText.includes('전체 낭독') || b.dataset.origText.includes('전체 주석')))) {
            b.innerHTML = '<span>⏹️ 낭독 중지</span>';
        } else {
            b.textContent = '⏹️';
        }
    }
    
    // 이미 현재 섹션을 읽고 있다면 중지
    if (synth.speaking && currentPlayingSection === section) {
        synth.cancel();
        resetBtnText(btn);
        if (pauseBtn) pauseBtn.style.display = 'none';
        currentPlayingSection = null;
        return;
    }
    
    // 다른 섹션을 읽고 있다면 중지하고 초기화
    if (synth.speaking) {
        synth.cancel();
        if (currentPlayingSection) {
            const oldBtn = document.getElementById(`tts-btn-${currentPlayingSection}`);
            const oldPauseBtn = document.getElementById(`tts-pause-${currentPlayingSection}`);
            resetBtnText(oldBtn);
            if (oldPauseBtn) oldPauseBtn.style.display = 'none';
        }
    }
    
    // 섹션별 텍스트 가져오기
    let textToRead = '';
    let contentEl = document.getElementById(section.startsWith('saju') ? 'saju-content' : `${section}-content`);
    if (!contentEl) contentEl = document.getElementById(section);
    
    if (contentEl) {
        const clone = contentEl.cloneNode(true);
        // 배지나 불필요한 라벨, 버튼, 네비게이션 날짜 제거
        const ignores = clone.querySelectorAll('.label-badge, .tts-ignore, button, select, input, .nav-date, .tts-speed-btn, details summary, .korean-scholars-toolbar');
        ignores.forEach(b => b.remove());
        
        // 블록 요소(문단, 제목 등)가 끝날 때 마침표와 공백을 추가하여 TTS가 자연스럽게 띄어 읽도록 유도
        let htmlStr = clone.innerHTML;
        htmlStr = htmlStr.replace(/<\/p>/gi, '. </p>');
        htmlStr = htmlStr.replace(/<\/h[1-6]>/gi, '. </h5>');
        htmlStr = htmlStr.replace(/<br\s*\/?>/gi, '. ');
        htmlStr = htmlStr.replace(/<\/div>/gi, '.\n</div>');
        clone.innerHTML = htmlStr;
        
        textToRead = clone.textContent || '';
        
        if (section === 'saju_analysis') {
            const part1Start = textToRead.indexOf("오행 정밀 분석");
            const part1End = textToRead.indexOf("오늘의 일진 오행");
            
            if (part1Start !== -1 && part1End !== -1) {
                textToRead = textToRead.substring(part1Start, part1End);
            }
        } else if (section === 'saju_fortune') {
            const part2Start = textToRead.indexOf("사주와 오늘의 기운 교류");
            
            if (part2Start !== -1) {
                textToRead = textToRead.substring(part2Start);
            }
        }
        
        // 1. URL 제거 (TTS가 영어 URL 주소를 알파벳 하나씩 읽는 것 방지)
        textToRead = textToRead.replace(/https?:\/\/[^\s\)]+/g, '');
        // 2. 마크다운 링크 [제목](URL) -> 제목
        textToRead = textToRead.replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1');
        // 3. 마크다운 볼드/이탤릭 기호 제거 (**강조**, *기울임*, __강조__)
        textToRead = textToRead.replace(/\*\*(.*?)\*\*/g, '$1');
        textToRead = textToRead.replace(/\*(.*?)\*/g, '$1');
        textToRead = textToRead.replace(/__([^_]+)__/g, '$1');
        textToRead = textToRead.replace(/_([^_]+)_/g, '$1');
        textToRead = textToRead.replace(/[`#~*]/g, '');
        // 4. 대괄호 및 특수괄호 [ ], 【 】, 《 》 기호 읽기 완화 (기호 호명 방지)
        textToRead = textToRead.replace(/[\[\]【】《》]/g, ' ');
        // 5. 한자 병기 중복 호명 완화: 예) 왕필 (王弼) -> 왕필, 주희 (朱熹) -> 주희
        textToRead = textToRead.replace(/([가-힣]{2,4})\s*\([一-龥]+\)/g, '$1');
        
        // 이모지 및 특수 기호 완벽 제거
        textToRead = textToRead.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '');
        
        // 한문 원문에서 마침표/쉼표를 무시하고 연달아 읽는 현상 방지 (강제 줄바꿈 삽입)
        textToRead = textToRead.replace(/([一-龥]),\s*/g, '$1\n');
        textToRead = textToRead.replace(/([一-龥])\.\s*/g, '$1\n\n');
    }
    
    if (!textToRead.trim()) return;
    
    currentUtterance = new SpeechSynthesisUtterance(textToRead);
    currentUtterance.lang = 'ko-KR';
    currentUtterance.rate = window.ttsRate || 1.0;
    
    currentUtterance.onend = () => {
        resetBtnText(btn);
        if (pauseBtn) pauseBtn.style.display = 'none';
        currentPlayingSection = null;
    };
    
    currentUtterance.onerror = (e) => {
        console.error('TTS Error:', e);
        resetBtnText(btn);
        if (pauseBtn) pauseBtn.style.display = 'none';
        currentPlayingSection = null;
    };
    
    setBtnPlayingText(btn);
    if (pauseBtn) {
        pauseBtn.style.display = 'inline-flex';
        pauseBtn.textContent = '⏸️';
    }
    currentPlayingSection = section;
    synth.speak(currentUtterance);
};

window.pauseTTS = function() {
    const synth = window.speechSynthesis;
    if (synth.paused) {
        synth.resume();
        if (currentPlayingSection) {
            const pauseBtn = document.getElementById(`tts-pause-${currentPlayingSection}`);
            if (pauseBtn) pauseBtn.textContent = '⏸️';
        }
    } else if (synth.speaking) {
        synth.pause();
        if (currentPlayingSection) {
            const pauseBtn = document.getElementById(`tts-pause-${currentPlayingSection}`);
            if (pauseBtn) pauseBtn.textContent = '▶️';
        }
    }
};


// --- Shortcuts Management ---
const DEFAULT_SHORTCUTS = [
    { name: "채팅", url: "https://chat.openai.com", icon: "https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg" },
    { name: "Microsoft 365", url: "https://www.office.com", icon: "https://upload.wikimedia.org/wikipedia/commons/5/5f/Microsoft_Office_logo_%282019%E2%80%93present%29.svg" },
    { name: "YouTube", url: "https://www.youtube.com", icon: "https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg" }
];

window.shortcutEditIndex = -1;

function initShortcuts() {
    renderShortcuts();
    
    // Setup modal event listeners
    const modal = document.getElementById('shortcut-modal');
    const title = document.getElementById('shortcut-modal-title');
    const cancelBtn = document.getElementById('shortcut-cancel-btn');
    const saveBtn = document.getElementById('shortcut-save-btn');
    const deleteBtn = document.getElementById('shortcut-delete-btn');
    const nameInput = document.getElementById('shortcut-name-input');
    const urlInput = document.getElementById('shortcut-url-input');

    if (!modal) return;

    window.closeShortcutModal = function() {
        modal.style.display = 'none';
        nameInput.value = '';
        urlInput.value = '';
        window.shortcutEditIndex = -1;
    }

    cancelBtn.onclick = window.closeShortcutModal;

    modal.addEventListener('click', (e) => {
        if (e.target === modal) window.closeShortcutModal();
    });

    deleteBtn.onclick = () => {
        if (window.shortcutEditIndex >= 0) {
            if(confirm('이 바로가기를 삭제하시겠습니까?')) {
                let shortcuts = JSON.parse(localStorage.getItem('my_shortcuts')) || DEFAULT_SHORTCUTS;
                shortcuts.splice(window.shortcutEditIndex, 1);
                localStorage.setItem('my_shortcuts', JSON.stringify(shortcuts));
                renderShortcuts();
                window.closeShortcutModal();
            }
        }
    };

    saveBtn.onclick = () => {
        const name = nameInput.value.trim();
        let url = urlInput.value.trim();
        
        if (!name || !url) {
            alert('이름과 URL을 모두 입력해주세요.');
            return;
        }
        
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        
        try {
            const domain = new URL(url).hostname;
            const icon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
            
            let shortcuts = JSON.parse(localStorage.getItem('my_shortcuts')) || DEFAULT_SHORTCUTS;
            
            if (window.shortcutEditIndex >= 0) {
                // Edit
                shortcuts[window.shortcutEditIndex] = { name, url, icon };
            } else {
                // Add
                shortcuts.push({ name, url, icon });
            }
            
            localStorage.setItem('my_shortcuts', JSON.stringify(shortcuts));
            
            renderShortcuts();
            window.closeShortcutModal();
        } catch (e) {
            alert('올바른 URL 형식이 아닙니다.');
        }
    };
}

function renderShortcuts() {
    const container = document.getElementById('shortcuts-container');
    if (!container) return;
    
    let shortcuts = JSON.parse(localStorage.getItem('my_shortcuts'));
    if (!shortcuts) {
        shortcuts = DEFAULT_SHORTCUTS;
        localStorage.setItem('my_shortcuts', JSON.stringify(shortcuts));
    }
    
    container.innerHTML = '';
    
    shortcuts.forEach((sc, index) => {
        const a = document.createElement('a');
        a.href = sc.url;
        a.className = 'shortcut-item';
        a.target = '_blank';
        a.title = sc.name + ' (우클릭하여 편집)';
        
        // Right click to edit
        a.oncontextmenu = (e) => {
            e.preventDefault();
            window.shortcutEditIndex = index;
            const modal = document.getElementById('shortcut-modal');
            if (modal) {
                document.getElementById('shortcut-modal-title').textContent = '바로가기 편집';
                document.getElementById('shortcut-name-input').value = sc.name;
                document.getElementById('shortcut-url-input').value = sc.url;
                document.getElementById('shortcut-delete-btn').style.display = 'block';
                modal.style.display = 'flex';
                document.getElementById('shortcut-name-input').focus();
            }
        };
        
        a.innerHTML = `
            <div class="shortcut-icon">
                <img src="${sc.icon}" class="shortcut-favicon" alt="${sc.name}" onerror="this.outerHTML='<div class=\\'fallback-icon\\'>${sc.name.charAt(0)}</div>'">
            </div>
            <span class="shortcut-label">${sc.name}</span>
        `;
        container.appendChild(a);
    });
    
    const addBtn = document.createElement('div');
    addBtn.className = 'shortcut-item add-shortcut';
    addBtn.title = '새 바로가기 추가';
    addBtn.onclick = () => {
        window.shortcutEditIndex = -1;
        const modal = document.getElementById('shortcut-modal');
        if (modal) {
            document.getElementById('shortcut-modal-title').textContent = '바로가기 추가';
            document.getElementById('shortcut-delete-btn').style.display = 'none';
            modal.style.display = 'flex';
            document.getElementById('shortcut-name-input').focus();
        }
    };
    addBtn.innerHTML = `
        <div class="shortcut-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </div>
        <span class="shortcut-label">추가</span>
    `;
    container.appendChild(addBtn);
}
