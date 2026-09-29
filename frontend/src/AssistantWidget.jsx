import { useEffect, useRef, useState } from "react";
import { apiPost } from "./api";

const QUICK_PROMPTS = [
  { label: "Balaghat forecast shortfall?", query: "What is the current production target and forecast shortfall for Balaghat?" },
  { label: "सुरक्षा स्थिति (Hindi)", query: "बालाघाट खदान की सुरक्षा और DGMS अनुपालन स्थिति क्या है?" },
  { label: "இயந்திரங்கள் நிலை (Tamil)", query: "சுரங்க இயந்திரங்கள் நிலை மற்றும் மழைப்பொழிவு என்ன?" },
  { label: "Mitigate monsoon risk?", query: "How should we mitigate the heavy monsoon rainfall impact on pit sumps and slope stability?" },
];

export function AssistantWidget({ currentView = "General", currentSite = "Balaghat" }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: "welcome-msg",
      sender: "assistant",
      text: `**Namaste! I am your MOIL AI Mine Assistant.**\n\nI can answer questions regarding Balaghat production targets, shortfall mitigation, fleet redeployments, live CHIRPS rainfall anomalies (+277%), and DGMS safety compliance.\n\n*Feel free to query in English, हिन्दी, or தமிழ்.*`,
      lang: "English",
      model: "moil-grounded-intelligence",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (open) {
      scrollToBottom();
      inputRef.current?.focus();
    }
  }, [open, messages, loading]);

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await apiPost("/api/assistant", {
        message: query,
        site: currentSite,
        view_context: currentView,
      });

      const assistantMsg = {
        id: `asst-${Date.now()}`,
        sender: "assistant",
        text: response.reply || "No response received.",
        lang: response.language_detected || "English",
        model: response.model_used || "MOIL Engine",
        isFallback: response.is_fallback,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = {
        id: `err-${Date.now()}`,
        sender: "assistant",
        text: `**Error:** ${err.message || "Failed to communicate with AI Assistant. Ensure Flask backend is running."}`,
        lang: "English",
        isError: true,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "assistant",
        text: `**Chat cleared.** Ask any operational, production, fleet, or safety question in English, हिन्दी, or தமிழ்.`,
        lang: "English",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  return (
    <div className="assistant-widget-container">
      {/* Floating launcher trigger */}
      {!open && (
        <button
          type="button"
          className="assistant-launcher-btn"
          onClick={() => setOpen(true)}
          aria-label="Open MOIL AI Mine Assistant"
          title="Open AI Mine Assistant (English | हिन्दी | தமிழ்)"
        >
          <span className="assistant-launcher-pulse" aria-hidden="true" />
          <span className="assistant-launcher-icon">🤖</span>
          <span className="assistant-launcher-label">AI Assistant</span>
          <span className="assistant-lang-pill">EN·हि·த</span>
        </button>
      )}

      {/* Floating Chat Drawer Window */}
      {open && (
        <aside className="assistant-chat-window" aria-label="AI Mine Assistant Chat Window">
          {/* Header */}
          <div className="assistant-chat-header">
            <div className="assistant-header-identity">
              <span className="assistant-avatar">🤖</span>
              <div>
                <h4 className="assistant-header-title">MOIL AI Mine Assistant</h4>
                <p className="assistant-header-subtitle">
                  Grounded Mining Intelligence · EN | हिन्दी | தமிழ்
                </p>
              </div>
            </div>
            <div className="assistant-header-controls">
              <button
                type="button"
                className="assistant-btn-icon"
                onClick={handleClearChat}
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                🗑️
              </button>
              <button
                type="button"
                className="assistant-btn-icon"
                onClick={() => setOpen(false)}
                title="Minimize assistant"
                aria-label="Minimize assistant"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages body */}
          <div className="assistant-chat-body">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`assistant-msg-wrap msg-from-${msg.sender} ${msg.isError ? "msg-error" : ""}`}
              >
                <div className="assistant-msg-bubble">
                  {msg.sender === "assistant" && (
                    <div className="assistant-bubble-meta">
                      <span className="assistant-meta-name">MOIL Intelligence</span>
                      {msg.lang && (
                        <span className="assistant-lang-tag">{msg.lang}</span>
                      )}
                      {msg.model && (
                        <span className="assistant-model-tag">
                          {msg.model.includes("claude") ? "Claude 3.5 Sonnet" : "Grounded Engine"}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Render message lines with simple markdown formatting */}
                  <div className="assistant-msg-content">
                    {msg.text.split("\n").map((line, idx) => {
                      if (!line.trim()) return <br key={idx} />;
                      // Bold format
                      const formatted = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
                      return (
                        <p
                          key={idx}
                          className="msg-line"
                          dangerouslySetInnerHTML={{ __html: formatted }}
                        />
                      );
                    })}
                  </div>

                  <span className="assistant-msg-time">{msg.timestamp}</span>
                </div>
              </div>
            ))}

            {loading && (
              <div className="assistant-msg-wrap msg-from-assistant">
                <div className="assistant-msg-bubble typing-bubble">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-text">Analyzing live mine telemetry…</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick prompt suggestions */}
          <div className="assistant-quick-prompts">
            <span className="quick-prompt-label">Ask:</span>
            {QUICK_PROMPTS.map((item, idx) => (
              <button
                key={idx}
                type="button"
                className="quick-prompt-chip"
                onClick={() => handleSendMessage(item.query)}
                disabled={loading}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Input Footer */}
          <form
            className="assistant-chat-footer"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="assistant-input-field"
              placeholder="Ask about forecast, fleet, safety in English, हिन्दी, தமிழ்…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              type="submit"
              className="assistant-send-btn"
              disabled={!input.trim() || loading}
              aria-label="Send message to AI Assistant"
            >
              ➤
            </button>
          </form>

          <div className="assistant-context-footnote">
            <span>🛡️ Grounded in live CHIRPS rainfall (456.2 mm) & MOIL Balaghat telemetry.</span>
          </div>
        </aside>
      )}
    </div>
  );
}
