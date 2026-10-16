module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id, name, nameChinese, text, title } = req.body || {};

  if (!name || !text || !title) {
    return res.status(400).json({ error: 'Missing name, title, or text parameter in JSON body' });
  }

  const gwaeName = nameChinese || name;
  const canonicalName = id ? `第${id}卦 ${gwaeName}` : gwaeName;

  // 1. 사전 구축된 정본 데이터베이스(AKS 및 ctext) 우선 조회
  try {
    const fs = require('fs');
    const path = require('path');
    let db = null;
    const dbPath = path.join(__dirname, '..', 'iching_commentary_db.json');
    if (fs.existsSync(dbPath)) {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } else {
      try {
        db = require('../iching_commentaries_data.js');
      } catch (_) {}
    }

    if (db) {
      const hexKey = String(id);
      if (db[hexKey]) {
        let lineKey = null;
        if (title.includes('괘사') || title.includes('卦辭')) lineKey = '-1';
        else if (title.includes('초') || title.includes('初')) lineKey = '0';
        else if (title.includes('이') || title.includes('二')) lineKey = '1';
        else if (title.includes('삼') || title.includes('三')) lineKey = '2';
        else if (title.includes('사') || title.includes('四')) lineKey = '3';
        else if (title.includes('오') || title.includes('五')) lineKey = '4';
        else if (title.includes('상') || title.includes('上')) lineKey = '5';

        if (lineKey !== null && db[hexKey][lineKey]) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          return res.status(200).json(db[hexKey][lineKey]);
        }
      }
    }
  } catch (dbErr) {
    console.warn('Iching DB lookup fallback:', dbErr);
  }

  // 2. DB에 없는 경우 OpenAI API Fallback
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set in environment variables and data not found in DB' });
  }

  const systemMessage = `당신은 주역(易經) 판본학 및 한문 고전 주석학에 정통한 최고 권위의 동양고전학자입니다.
조선 정조대 『주역전의대전(周易傳義大全)』 및 송·당·위진 역대 정본 주석서에 기초하여 아래 원칙을 엄격히 준수하십시오:

[핵심 필수 규칙]
1. 한자 표기: 반드시 전통 번체자/정체자(繁體字/正字, Traditional Chinese)만 사용하십시오.
   - 중국 대륙 간체자(简体字)는 절대로 단 한 글자도 사용하지 마십시오.
   - 예: 觀, 傳, 說, 從, 處, 國, 無, 陽, 陰 등 정자(正字)로만 표기하십시오.

2. 학자별 주석 체계의 엄밀한 구분 (절대 규칙):
   ★ [필수 3대 정본 주석가]: 왕필(王弼), 정이(程頤), 주희(朱熹)
     - 이 3인은 주역 64괘 384효 전체에 걸쳐 한 구절도 빠짐없이 100% 주석을 남겼습니다.
     - 왕필의 『주역주(周易注)』, 정이의 『이천역전(伊川易傳)』, 주희의 『주역본의(周易本義)』는 어떤 효사나 괘사에서도 절대로 '원문 없음'이나 빈 문자열("")이 되어서는 안 됩니다.
     - 반드시 각 저작에 실제로 수록된 정본 한문 원문(번체자)과 품격 있는 한국어 번역을 충실히 작성하십시오.
   ★ [공영달(孔穎達)]: 『주역정의(周易正義)』
     - 왕필 주에 대한 정본 소(疏)의 핵심 내용을 번체자로 인용하고 번역하십시오.
   ★ [선택적 보론 주석가]: 소식(蘇軾), 쌍호호씨(胡炳文), 운봉호씨(胡一桂)
     - 소식의 『동파역전』, 쌍호호씨의 『주역본의통석』, 운봉호씨의 『주역본의부록찬주』는 해당 구절에 대해 실제로 남긴 독립적 원문 주석이 확실히 존재하는 경우에만 인용하십시오.
     - 해당 구절에 대해 독립 주석을 남기지 않은 효사의 경우에는 억지로 가짜 한문이나 설명을 지어내지 말고 original과 translation을 모두 빈 문자열("")로 비워두십시오.

3. 번역 문체:
   - 한국고전번역원 표준 영인본 번역 스타일의 격조 높은 정통 번역을 수행하십시오.
   - 문장 종결어미는 반드시 품격 있는 평어체(해라체: '~이다', '~한다', '~다')를 사용하십시오. (~습니다 금지)`;

  const prompt = `주역 『${canonicalName}』의 『${title}』 구절입니다:

[경문 원문]
${text}

위 구절에 대한 역대 7대 주석가의 정본 주석을 아래 JSON 형식으로 반환하십시오.
한문 원문(original)은 반드시 100% 번체 정자(繁體 正字)로 표기하십시오.

[필수 지침]
- 왕필, 정이, 주희 3인은 64괘 384효 전체에 주석이 100% 완비되어 있으므로, 절대로 빈 문자열("")로 두지 말고 실제 정본 원문과 번역을 반드시 작성하십시오.
- 소식, 쌍호호씨, 운봉호씨는 해당 구절에 실제 독립된 원문 주석이 존재하는 경우에만 작성하고, 독립 주석이 없는 효사는 original과 translation을 모두 빈 문자열("")로 비워두십시오.

{
  "title": "${title}",
  "wangbi":     { "book": "周易注", "original": "번체자 한문 원문", "translation": "한국어 번역" },
  "kongyingda": { "book": "周易正義", "original": "번체자 한문 원문", "translation": "한국어 번역" },
  "sushi":      { "book": "東坡易傳", "original": "번체자 한문 원문 (독립 원문 없으면 \"\")", "translation": "한국어 번역 (독립 원문 없으면 \"\")" },
  "chengyi":    { "book": "伊川易傳", "original": "번체자 한문 원문", "translation": "한국어 번역" },
  "zhuxi":      { "book": "周易本義", "original": "번체자 한문 원문", "translation": "한국어 번역" },
  "shuanghu":   { "book": "周易本義通釋", "original": "번체자 한문 원문 (독립 원문 없으면 \"\")", "translation": "한국어 번역 (독립 원문 없으면 \"\")" },
  "yunfeng":    { "book": "周易本義附錄纂注", "original": "번체자 한문 원문 (독립 원문 없으면 \"\")", "translation": "한국어 번역 (독립 원문 없으면 \"\")" }
}
오직 유효한 JSON 문자열만 반환하십시오.`;

  try {
    const openaiUrl = 'https://api.openai.com/v1/chat/completions';

    let response;
    let data;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(openaiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt }
          ],
          temperature: 0.25,
          response_format: { type: 'json_object' }
        })
      });

      if (response.ok) {
        data = await response.json();
        break;
      }

      if (attempt === 2) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }

    const responseText = data.choices?.[0]?.message?.content?.trim() || '{}';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(responseText);
  } catch (error) {
    console.error('Iching API Error:', error);
    res.status(500).json({ error: error.message });
  }
};
