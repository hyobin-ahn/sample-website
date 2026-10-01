async function askIching() {
    const inputEl = document.getElementById('iching-input');
    const text = inputEl.value.trim();
    if (!text) return;

    const chatBox = document.getElementById('iching-chat');
    
    // 사용자의 질문 추가
    const userMsg = document.createElement('div');
    userMsg.className = 'message user-message';
    userMsg.textContent = text;
    chatBox.appendChild(userMsg);
    
    inputEl.value = '';
    
    // 로딩 메시지 추가
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'message ai-message loading-message';
    loadingMsg.innerHTML = '주역 괘를 뽑고 해석하는 중... <span class="spinner">⏳</span>';
    chatBox.appendChild(loadingMsg);
    
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const response = await fetch('/api/iching', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: 'User', text: text })
        });

        const data = await response.json();
        
        // 로딩 메시지 제거
        chatBox.removeChild(loadingMsg);

        if (response.ok) {
            const aiMsg = document.createElement('div');
            aiMsg.className = 'message ai-message';
            aiMsg.innerHTML = marked.parse(data.reply);
            chatBox.appendChild(aiMsg);
        } else {
            const errorMsg = document.createElement('div');
            errorMsg.className = 'message ai-message';
            errorMsg.style.color = '#ff6b6b';
            errorMsg.textContent = `에러 발생: ${data.error || '알 수 없는 오류'}`;
            chatBox.appendChild(errorMsg);
        }
    } catch (error) {
        chatBox.removeChild(loadingMsg);
        const errorMsg = document.createElement('div');
        errorMsg.className = 'message ai-message';
        errorMsg.style.color = '#ff6b6b';
        errorMsg.textContent = '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        chatBox.appendChild(errorMsg);
    }
    
    chatBox.scrollTop = chatBox.scrollHeight;
}
