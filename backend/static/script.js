document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatWindow = document.getElementById('chatWindow');
    const taxForm = document.getElementById('taxForm');
    const taxResultCard = document.getElementById('taxResultCard');
    const taxResultContent = document.getElementById('taxResultContent');
    const voiceBtn = document.getElementById('voiceBtn');

    // Utility to format currency
    const formatVND = (amount) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    // Add message to chat window
    const appendMessage = (text, isUser = false) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
        
        const avatarIcon = isUser ? 'fa-user' : 'fa-robot';
        
        // Simple markdown to HTML parser for basic formatting
        let formattedText = text;
        if (!isUser) {
            formattedText = text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
        }

        messageDiv.innerHTML = `
            <div class="message-avatar"><i class="fa-solid ${avatarIcon}"></i></div>
            <div class="message-bubble">
                <p>${formattedText}</p>
            </div>
        `;
        
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    };

    // Handle Chat Submit
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = chatInput.value.trim();
        if (!message) return;

        appendMessage(message, true);
        chatInput.value = '';

        // Typing indicator
        const typingId = 'typing-' + Date.now();
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai-message';
        typingDiv.id = typingId;
        typingDiv.innerHTML = `
            <div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
            <div class="message-bubble"><p><i class="fa-solid fa-ellipsis fa-fade"></i> Đang suy nghĩ...</p></div>
        `;
        chatWindow.appendChild(typingDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });

            const data = await response.json();
            document.getElementById(typingId).remove();

            if (data.error) {
                appendMessage(`Lỗi: ${data.error}`);
            } else {
                appendMessage(data.text);
                
                // If the response includes tax data, show it in the side panel
                if (data.tax_table) {
                    displayTaxResult(data.tax_table);
                }
            }
        } catch (error) {
            document.getElementById(typingId).remove();
            appendMessage('Xin lỗi, đã có lỗi kết nối đến máy chủ.');
        }
    });

    // Handle Tax Calc Submit
    taxForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const revenue = document.getElementById('revenueInput').value;
        const category = document.getElementById('categoryInput').value;

        // Automatically trigger a chat message to let AI explain
        const catText = document.getElementById('categoryInput').options[document.getElementById('categoryInput').selectedIndex].text;
        const msg = `Tính thuế cho tôi. Doanh thu: ${formatVND(revenue)}, Ngành nghề: ${catText}`;
        
        chatInput.value = msg;
        chatForm.dispatchEvent(new Event('submit'));
        
        // Also send these parameters hidden to API
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: "Hãy giải thích chi tiết bảng tính thuế này.", 
                    revenue: revenue, 
                    category: category 
                })
            });
            const data = await response.json();
            if (data.tax_table) {
                displayTaxResult(data.tax_table);
            }
        } catch(e) {
            console.error(e);
        }
    });

    const displayTaxResult = (taxData) => {
        taxResultCard.style.display = 'block';
        if (!taxData.is_taxable) {
            taxResultContent.innerHTML = `
                <div class="tax-item">
                    <span>Trạng thái:</span>
                    <strong>Được miễn thuế</strong>
                </div>
                <div class="tax-item">
                    <span>Lý do:</span>
                    <span>${taxData.reason}</span>
                </div>
            `;
            return;
        }

        taxResultContent.innerHTML = `
            <div class="tax-item">
                <span>Doanh thu:</span>
                <strong>${formatVND(taxData.revenue)}</strong>
            </div>
            <div class="tax-item">
                <span>Thuế GTGT:</span>
                <span>${formatVND(taxData.tax_gtgt)}</span>
            </div>
            <div class="tax-item">
                <span>Thuế TNCN:</span>
                <span>${formatVND(taxData.tax_tncn)}</span>
            </div>
            <div class="tax-item tax-total">
                <span>Tổng thuế phải nộp:</span>
                <span>${formatVND(taxData.total_tax)}</span>
            </div>
            <div style="margin-top:10px; font-size: 0.85rem; color: #166534;">
                ${taxData.explanation}
            </div>
        `;
    };

    // Voice Input Setup (Web Speech API)
    if ('webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.lang = 'vi-VN';
        recognition.continuous = false;
        recognition.interimResults = false;

        let isRecording = false;

        voiceBtn.addEventListener('click', () => {
            if (isRecording) {
                recognition.stop();
            } else {
                recognition.start();
                voiceBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
                voiceBtn.style.color = 'red';
                chatInput.placeholder = "Đang nghe...";
            }
            isRecording = !isRecording;
        });

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            chatInput.value = transcript;
            chatForm.dispatchEvent(new Event('submit'));
        };

        recognition.onend = () => {
            isRecording = false;
            voiceBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
            voiceBtn.style.color = '';
            chatInput.placeholder = "Hỏi đáp tiếng Việt (VD: Doanh thu 150tr/năm thì nộp thuế bao nhiêu?)...";
        };
    } else {
        voiceBtn.style.display = 'none';
    }
});
