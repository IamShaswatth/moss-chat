(function () {
    'use strict';

    const DEFAULTS = {
        serverUrl: 'http://localhost:3000',
        tenantId: '',
        position: 'right',
        primaryColor: '#4ade80',
        title: 'Chat Support',
        subtitle: 'Ask us anything',
        placeholder: 'Type your message...',
        fallbackMessage: "I'm sorry, I couldn't find relevant information. Please contact support."
    };

    class MossChatWidget {
        constructor(config = {}) {
            this.config = { ...DEFAULTS, ...config };
            this.sessionId = this.getSessionId();
            this.visitorId = this.getVisitorId();
            this.messages = [];
            this.isOpen = false;
            this.isTyping = false;
            this.init();
        }

        getSessionId() {
            let id = sessionStorage.getItem('moss_session_id');
            if (!id) {
                id = 'sess_' + Math.random().toString(36).substr(2, 12);
                sessionStorage.setItem('moss_session_id', id);
            }
            return id;
        }

        getVisitorId() {
            let id = localStorage.getItem('moss_visitor_id');
            if (!id) {
                id = 'vis_' + Math.random().toString(36).substr(2, 12);
                localStorage.setItem('moss_visitor_id', id);
            }
            return id;
        }

        init() {
            this.injectStyles();
            this.createWidget();
            this.bindEvents();
        }

        injectStyles() {
            const style = document.createElement('style');
            style.textContent = `
        .moss-widget-bubble {
          position: fixed;
          bottom: 24px;
          ${this.config.position}: 24px;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: ${this.config.primaryColor};
          color: #000;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          z-index: 99999;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .moss-widget-bubble:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 28px rgba(0,0,0,0.4);
        }
        .moss-widget-panel {
          position: fixed;
          bottom: 100px;
          ${this.config.position}: 24px;
          width: 380px;
          max-width: calc(100vw - 48px);
          height: 520px;
          max-height: calc(100vh - 140px);
          background: #1a1d27;
          border-radius: 16px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.5);
          display: none;
          flex-direction: column;
          z-index: 99998;
          overflow: hidden;
          border: 1px solid #2d3148;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        .moss-widget-panel.open { display: flex; }
        .moss-widget-header {
          background: #222636;
          padding: 18px 20px;
          border-bottom: 1px solid #2d3148;
        }
        .moss-widget-header-title {
          font-size: 1rem;
          font-weight: 600;
          color: #e4e6f0;
          margin: 0;
        }
        .moss-widget-header-sub {
          font-size: 0.8rem;
          color: #8b8fa3;
          margin: 4px 0 0;
        }
        .moss-widget-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .moss-widget-messages::-webkit-scrollbar { width: 4px; }
        .moss-widget-messages::-webkit-scrollbar-track { background: transparent; }
        .moss-widget-messages::-webkit-scrollbar-thumb { background: #2d3148; border-radius: 2px; }
        .moss-msg {
          max-width: 85%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 0.88rem;
          line-height: 1.5;
          animation: mossFadeIn 0.2s ease;
          word-wrap: break-word;
        }
        @keyframes mossFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .moss-msg.user {
          background: ${this.config.primaryColor};
          color: #000;
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }
        .moss-msg.assistant {
          background: #222636;
          color: #e4e6f0;
          align-self: flex-start;
          border: 1px solid #2d3148;
          border-bottom-left-radius: 4px;
        }
        .moss-msg-meta {
          font-size: 0.72rem;
          color: #5c6078;
          margin-top: 6px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .moss-msg-citation {
          display: inline-block;
          background: rgba(74, 222, 128, 0.1);
          color: ${this.config.primaryColor};
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 0.7rem;
          margin-top: 4px;
          margin-right: 4px;
        }
        .moss-confidence {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 6px;
          font-size: 0.72rem;
          color: #8b8fa3;
        }
        .moss-confidence-bar {
          width: 60px;
          height: 3px;
          background: #2d3148;
          border-radius: 2px;
          overflow: hidden;
        }
        .moss-confidence-fill {
          height: 100%;
          background: ${this.config.primaryColor};
          border-radius: 2px;
          transition: width 0.3s;
        }
        .moss-typing {
          align-self: flex-start;
          padding: 10px 14px;
          background: #222636;
          border: 1px solid #2d3148;
          border-radius: 12px;
          border-bottom-left-radius: 4px;
          display: none;
        }
        .moss-typing.active { display: block; }
        .moss-typing-dots {
          display: flex;
          gap: 4px;
        }
        .moss-typing-dot {
          width: 6px;
          height: 6px;
          background: #5c6078;
          border-radius: 50%;
          animation: mossTyping 1.2s infinite;
        }
        .moss-typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .moss-typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes mossTyping {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
        .moss-widget-input {
          display: flex;
          padding: 12px 16px;
          border-top: 1px solid #2d3148;
          background: #222636;
          gap: 8px;
        }
        .moss-widget-input input {
          flex: 1;
          background: #0f1117;
          border: 1px solid #2d3148;
          border-radius: 8px;
          padding: 10px 14px;
          color: #e4e6f0;
          font-size: 0.88rem;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s;
        }
        .moss-widget-input input:focus {
          border-color: ${this.config.primaryColor};
        }
        .moss-widget-input button {
          background: ${this.config.primaryColor};
          color: #000;
          border: none;
          border-radius: 8px;
          padding: 10px 16px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.88rem;
          transition: background 0.2s;
        }
        .moss-widget-input button:hover { background: #22c55e; }
        .moss-widget-input button:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 480px) {
          .moss-widget-panel {
            bottom: 0;
            ${this.config.position}: 0;
            width: 100%;
            max-width: 100%;
            height: 100%;
            max-height: 100%;
            border-radius: 0;
          }
          .moss-widget-bubble {
            bottom: 16px;
            ${this.config.position}: 16px;
          }
        }
      `;
            document.head.appendChild(style);
        }

        createWidget() {
            // Bubble
            this.bubble = document.createElement('button');
            this.bubble.className = 'moss-widget-bubble';
            this.bubble.innerHTML = '💬';
            this.bubble.setAttribute('aria-label', 'Open chat');

            // Panel
            this.panel = document.createElement('div');
            this.panel.className = 'moss-widget-panel';
            this.panel.innerHTML = `
        <div class="moss-widget-header">
          <div class="moss-widget-header-title">${this.config.title}</div>
          <div class="moss-widget-header-sub">${this.config.subtitle}</div>
        </div>
        <div class="moss-widget-messages" id="moss-messages"></div>
        <div class="moss-typing" id="moss-typing">
          <div class="moss-typing-dots">
            <div class="moss-typing-dot"></div>
            <div class="moss-typing-dot"></div>
            <div class="moss-typing-dot"></div>
          </div>
        </div>
        <div class="moss-widget-input">
          <input type="text" id="moss-input" placeholder="${this.config.placeholder}" />
          <button id="moss-send">Send</button>
        </div>
      `;

            document.body.appendChild(this.bubble);
            document.body.appendChild(this.panel);

            this.messagesEl = this.panel.querySelector('#moss-messages');
            this.inputEl = this.panel.querySelector('#moss-input');
            this.sendBtn = this.panel.querySelector('#moss-send');
            this.typingEl = this.panel.querySelector('#moss-typing');
        }

        bindEvents() {
            this.bubble.addEventListener('click', () => this.toggle());
            this.sendBtn.addEventListener('click', () => this.sendMessage());
            this.inputEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }

        toggle() {
            this.isOpen = !this.isOpen;
            this.panel.classList.toggle('open', this.isOpen);
            this.bubble.innerHTML = this.isOpen ? '✕' : '💬';
            if (this.isOpen) {
                this.inputEl.focus();
            }
        }

        addMessage(role, content, meta = {}) {
            const msg = document.createElement('div');
            msg.className = `moss-msg ${role}`;

            let html = `<div>${this.escapeHtml(content)}</div>`;

            if (meta.citations && meta.citations.length > 0) {
                html += '<div>';
                meta.citations.forEach(c => {
                    html += `<span class="moss-msg-citation">[Source ${c.index}] ${Math.round(c.score * 100)}%</span>`;
                });
                html += '</div>';
            }

            if (meta.confidence) {
                const pct = Math.round(meta.confidence * 100);
                html += `<div class="moss-confidence">
          <span>Confidence: ${pct}%</span>
          <div class="moss-confidence-bar">
            <div class="moss-confidence-fill" style="width: ${pct}%"></div>
          </div>
        </div>`;
            }

            msg.innerHTML = html;
            this.messagesEl.appendChild(msg);
            this.scrollToBottom();
            return msg;
        }

        scrollToBottom() {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        async sendMessage() {
            const text = this.inputEl.value.trim();
            if (!text) return;

            this.inputEl.value = '';
            this.addMessage('user', text);

            // Show typing
            this.typingEl.classList.add('active');
            this.sendBtn.disabled = true;
            this.scrollToBottom();

            try {
                const response = await fetch(`${this.config.serverUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        tenantId: this.config.tenantId,
                        sessionId: this.sessionId,
                        visitorId: this.visitorId
                    })
                });

                if (!response.ok) throw new Error('Chat request failed');

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let assistantText = '';
                let assistantEl = null;
                let metadata = {};

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;

                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'chunk') {
                                this.typingEl.classList.remove('active');

                                if (!assistantEl) {
                                    assistantEl = this.addMessage('assistant', data.content);
                                    assistantText = data.content;
                                } else {
                                    assistantText += data.content;
                                    assistantEl.querySelector('div').textContent = assistantText;
                                }
                                this.scrollToBottom();
                            } else if (data.type === 'done') {
                                metadata = data;
                                // Update with citations and confidence
                                if (assistantEl && (data.citations?.length > 0 || data.confidence)) {
                                    let extraHtml = '';
                                    if (data.citations?.length > 0) {
                                        extraHtml += '<div>';
                                        data.citations.forEach(c => {
                                            extraHtml += `<span class="moss-msg-citation">[Source ${c.index}] ${Math.round(c.score * 100)}%</span>`;
                                        });
                                        extraHtml += '</div>';
                                    }
                                    if (data.confidence) {
                                        const pct = Math.round(data.confidence * 100);
                                        extraHtml += `<div class="moss-confidence">
                      <span>Confidence: ${pct}%</span>
                      <div class="moss-confidence-bar">
                        <div class="moss-confidence-fill" style="width: ${pct}%"></div>
                      </div>
                    </div>`;
                                    }
                                    assistantEl.innerHTML += extraHtml;
                                }
                            } else if (data.type === 'error') {
                                this.typingEl.classList.remove('active');
                                this.addMessage('assistant', 'Sorry, an error occurred. Please try again.');
                            }
                        } catch (e) {
                            // Skip malformed lines
                        }
                    }
                }
            } catch (err) {
                this.typingEl.classList.remove('active');
                this.addMessage('assistant', this.config.fallbackMessage);
            } finally {
                this.sendBtn.disabled = false;
                this.typingEl.classList.remove('active');
            }
        }
    }

    // Expose globally
    window.MossChatWidget = MossChatWidget;

    // Auto-init from script attributes
    const script = document.currentScript;
    if (script && script.dataset.tenantId) {
        new MossChatWidget({
            tenantId: script.dataset.tenantId,
            serverUrl: script.dataset.serverUrl || DEFAULTS.serverUrl
        });
    }
})();
