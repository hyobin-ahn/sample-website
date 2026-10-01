// SDU Homepage Main Script

let chartInstances = {};
let offsets = { philosophy: 0, iching: 0 };

document.addEventListener('DOMContentLoaded', () => {
    initWeather();
    
    // Timeframe buttons
    
    initIChing();
    initPhilosophy();
    initShortcuts();
});

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

// --- 2. Calendar (Custom ICS Parser) ---
// ical.js 대신 직접 파싱하여 텍스트 깨짐이나 형식이 다른 파일을 더 유연하게 처리합니다.
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
        <div id="iching-ai-container" style="text-align: center; margin: 15px 0;">
            <button id="iching-ai-btn" class="nav-btn" onclick="fetchIchingAI(${index})" style="background: var(--primary); padding: 8px 15px; border-radius: 8px; width: 100%;">✨ AI 학자별 심층 해설 불러오기</button>
        </div>
        <div id="iching-ai-result" style="display: none;"></div>
        <div class="iching-text" id="iching-original-text">
            ${hexagram.description ? `<p class="text-body"><span class="label-badge" >설명</span> ${hexagram.description.replace(/\n/g, '<br>')}</p>` : ''}
            <div class="iching-box" id="iching-base-gwaesa">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <p class="iching-box-title" style="margin: 0;"><strong>卦辭</strong></p>
                    <div style="display: flex; gap: 5px; align-items: center;" class="tts-ignore">
                        <button class="tts-speed-btn" onclick="toggleTTSSpeed()" title="속도 조절 (현재 1.0x)" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">1.0x</button>
                        <button class="tts-btn" onclick="toggleTTS('iching-base-gwaesa')" id="tts-btn-iching-base-gwaesa" title="읽기/정지" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">🔊</button>
                    </div>
                </div>
                <p class="iching-box-text">${hexagram.gwaesa_chinese}</p>
                <p class="text-body">${hexagram.gwaesa_korean}</p>
            </div>
            <div class="iching-box">
                <p class="iching-box-title"><strong>爻辭</strong></p>
                ${hexagram.lines ? hexagram.lines.map((l, idx) => {
                    const ttsId = `iching-base-yaosa-${idx}`;
                    return `<div class="iching-line-item" id="${ttsId}">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span class="iching-line-name" style="font-weight: bold; color: var(--primary);">[${l.name}]</span>
                            <div style="display: flex; gap: 5px; align-items: center;" class="tts-ignore">
                                <button class="tts-speed-btn" onclick="toggleTTSSpeed()" title="속도 조절 (현재 1.0x)" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">1.0x</button>
                                <button class="tts-btn" onclick="toggleTTS('${ttsId}')" id="tts-btn-${ttsId}" title="읽기/정지" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">🔊</button>
                            </div>
                        </div>
                        <div class="iching-line-text">${l.text_chinese}</div>
                        <div class="text-body">${l.text_korean}</div>
                    </div>`;
                }).join('') : ''}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

window.fetchIchingAI = async function(index) {
    const btn = document.getElementById('iching-ai-btn');
    if (!btn) return;
    
    btn.disabled = true;
    btn.textContent = '학자들의 견해를 종합하는 중... (약 10초 소요)';
    
    const hexagram = ichingData[index];
    let hexagram_text = `[괘사]\n${hexagram.gwaesa_chinese}\n\n[효사]\n`;
    if (hexagram.lines) {
        hexagram_text += hexagram.lines.map(l => `(${l.name}) ${l.text_chinese}`).join('\n');
    }
    
    try {
        const response = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: hexagram.name_korean + '(' + hexagram.name_chinese + ')',
                text: hexagram_text
            })
        });
        
        if (!response.ok) throw new Error('API 요청 실패');
        const data = await response.json();
        
        const origEl = document.getElementById('iching-original-text');
        if (origEl) origEl.style.display = 'none';

        let html = `
            <div class="iching-text" style="background: var(--bg-1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 style="margin: 0; color: var(--primary); font-size: 1.2em;">✨ ${hexagram.name_korean} AI 심층 해설</h4>
                    <div>
                        <button class="tts-speed-btn" onclick="changeTTSSpeed()" title="읽기 속도 조절" style="font-size: 0.9em; padding: 5px 10px; border-radius: 5px; background: transparent; color: var(--text-primary); border: 1px solid var(--border); margin-right: 5px;">1.00x</button>
                        <button class="tts-btn" onclick="toggleTTS('iching-ai-text')" id="tts-btn-iching-ai-text" title="전체 읽기/정지" style="font-size: 0.9em; padding: 5px 10px; border-radius: 5px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">🔊</button>
                        <button class="tts-btn" onclick="pauseTTS()" id="tts-pause-iching-ai-text" title="일시정지/재개" style="display: none; font-size: 0.9em; padding: 5px 10px; border-radius: 5px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">⏸️</button>
                    </div>
                </div>
                <div id="iching-ai-text-content">
        `;
        
        if (hexagram.description) {
            html += `<p class="text-body">${hexagram.description.replace(/\n/g, '<br>')}</p>`;
        }

        const renderScholars = (item) => {
            if (!item) return '';
            return `
                <div style="margin-top: 15px; background: var(--bg-2); padding: 10px; border-radius: 8px;">
                    <div style="border-bottom: 2px solid var(--primary); padding-bottom: 5px; margin-bottom: 10px;">
                        <h5 style="margin: 0; color: var(--text-primary);">[${item.title}] 주석</h5>
                    </div>
                    <div class="saju-box"><p class="saju-box-title">왕필</p><p>${item.wangbi || ''}</p></div>
                    <div class="saju-box"><p class="saju-box-title">공영달</p><p>${item.kongyingda || ''}</p></div>
                    <div class="saju-box"><p class="saju-box-title">소식</p><p>${item.sushi || ''}</p></div>
                    <div class="saju-box"><p class="saju-box-title">정이</p><p>${item.chengyi || ''}</p></div>
                    <div class="saju-box"><p class="saju-box-title">주희</p><p>${item.zhuxi || ''}</p></div>
                    <div class="saju-box"><p class="saju-box-title">쌍호호씨</p><p>${item.shuanghu || ''}</p></div>
                    <div class="saju-box"><p class="saju-box-title">운봉호씨</p><p>${item.yunfeng || ''}</p></div>
                </div>
            `;
        };

        const gwaesaAi = Array.isArray(data) ? data[0] : null;
        
        html += `
            <div class="iching-box" id="iching-ai-gwaesa">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <p class="iching-box-title" style="margin: 0;"><strong>卦辭</strong></p>
                    <div>
                        <button class="tts-speed-btn" onclick="changeTTSSpeed()" title="읽기 속도 조절" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border); margin-right: 3px;">1.00x</button>
                        <button class="tts-btn" onclick="toggleTTS('iching-ai-gwaesa')" id="tts-btn-iching-ai-gwaesa" title="읽기/정지" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">🔊</button>
                        <button class="tts-btn" onclick="pauseTTS()" id="tts-pause-iching-ai-gwaesa" title="일시정지/재개" style="display: none; font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">⏸️</button>
                    </div>
                </div>
                <p class="iching-box-text" style="font-size: 1.3em; font-weight: bold; line-height: 1.5;">${hexagram.gwaesa_chinese}</p>
                <p class="text-body">${hexagram.gwaesa_korean}</p>
                ${renderScholars(gwaesaAi)}
            </div>
            <div class="iching-box">
                <p class="iching-box-title"><strong>爻辭</strong></p>
        `;

        if (hexagram.lines) {
            hexagram.lines.forEach((l, idx) => {
                const yaosaAi = Array.isArray(data) && data.length > idx + 1 ? data[idx + 1] : null;
                const ttsId = `iching-ai-yaosa-${idx}`;
                html += `
                    <div class="iching-line-item" style="margin-bottom: 20px;" id="${ttsId}">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <span class="iching-line-name" style="margin: 0;">[${l.name}]</span>
                            <div>
                                <button class="tts-speed-btn" onclick="changeTTSSpeed()" title="읽기 속도 조절" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border); margin-right: 3px;">1.00x</button>
                                <button class="tts-btn" onclick="toggleTTS('${ttsId}')" id="tts-btn-${ttsId}" title="읽기/정지" style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">🔊</button>
                                <button class="tts-btn" onclick="pauseTTS()" id="tts-pause-${ttsId}" title="일시정지/재개" style="display: none; font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: transparent; color: var(--text-primary); border: 1px solid var(--border);">⏸️</button>
                            </div>
                        </div>
                        <div class="iching-line-text" style="font-size: 1.3em; font-weight: bold; line-height: 1.5;">${l.text_chinese}</div>
                        <div class="text-body">${l.text_korean}</div>
                        ${renderScholars(yaosaAi)}
                    </div>
                `;
            });
        }
        
        html += `
                </div>
                </div>
            </div>
        `;
        
        const resultContainer = document.getElementById('iching-ai-result');
        resultContainer.innerHTML = html;
        resultContainer.style.display = 'block';
        
        btn.style.display = 'none';
    } catch (e) {
        console.error(e);
        btn.disabled = false;
        btn.textContent = '✨ AI 학자별 심층 해설 불러오기 (실패, 재시도)';
        alert('AI 해설을 불러오는 중 오류가 발생했습니다.');
    }
}

// --- 4. Today's Saju (Fortune) ---
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
            <div class="philosophy-desc text-body">${item.content.replace(/\n/g, '<br>')}</div>
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
            <div class="text-body" style="font-size: 0.95rem; line-height: 1.6;">${item.content.replace(/\n/g, '<br>')}</div>
        `;
        previewEl.style.display = 'block';
    }
};

// --- 5. KOSPI & Stocks ---
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
    
    // 이미 현재 섹션을 읽고 있다면 중지
    if (synth.speaking && currentPlayingSection === section) {
        synth.cancel();
        if (btn) {
            btn.textContent = '🔊';
            btn.classList.remove('playing');
        }
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
            if (oldBtn) {
                oldBtn.textContent = '🔊';
                oldBtn.classList.remove('playing');
            }
            if (oldPauseBtn) oldPauseBtn.style.display = 'none';
        }
    }
    
    // 섹션별 텍스트 가져오기
    let textToRead = '';
    let contentEl = document.getElementById(`${section}-content`);
    if (!contentEl) contentEl = document.getElementById(section);
    
    if (contentEl) {
        const clone = contentEl.cloneNode(true);
        // 배지나 불필요한 라벨, 버튼, 네비게이션 날짜 제거
        const ignores = clone.querySelectorAll('.label-badge, .tts-ignore, button, select, input, .nav-date, .tts-speed-btn');
        ignores.forEach(b => b.remove());
        
        // 블록 요소(문단, 제목 등)가 끝날 때 마침표와 공백을 추가하여 TTS가 자연스럽게 띄어 읽도록 유도
        let htmlStr = clone.innerHTML;
        htmlStr = htmlStr.replace(/<\/p>/gi, '. </p>');
        htmlStr = htmlStr.replace(/<\/h[1-6]>/gi, '. </h5>'); // Replace with a generic closing tag just in case
        htmlStr = htmlStr.replace(/<br\s*\/?>/gi, '. ');
        clone.innerHTML = htmlStr;
        
        textToRead = clone.textContent || '';
        
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
        if (btn) {
            btn.textContent = '🔊';
            btn.classList.remove('playing');
        }
        if (pauseBtn) pauseBtn.style.display = 'none';
        currentPlayingSection = null;
    };
    
    currentUtterance.onerror = (e) => {
        console.error('TTS Error:', e);
        if (btn) {
            btn.textContent = '🔊';
            btn.classList.remove('playing');
        }
        if (pauseBtn) pauseBtn.style.display = 'none';
        currentPlayingSection = null;
    };
    
    if (btn) {
        btn.textContent = '⏹️';
        btn.classList.add('playing');
    }
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
