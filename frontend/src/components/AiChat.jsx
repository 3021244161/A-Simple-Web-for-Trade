import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Send, X } from 'lucide-react';
import './AiChat.css';

const PROMPTS = ['How do I request a quotation?', 'Help me find a component.', 'What information should I include in my inquiry?'];

// The launcher keeps the panel mounted after first open to retain the conversation.
// eslint-disable-next-line react/prop-types
const AiChat = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [Markdown, setMarkdown] = useState(null);
  const inputRef = useRef(null);
  const logRef = useRef(null);
  const requestRef = useRef(null);
  const pendingRef = useRef(false);
  const lastMessageTimeRef = useRef(0);
  const messageIdRef = useRef(0);
  const hasAssistantReply = messages.some(message => message.role === 'assistant');

  useEffect(() => {
    if (!hasAssistantReply) return;
    let active = true;
    import('react-markdown').then(module => {
      if (active) setMarkdown(() => module.default);
    }).catch(() => { /* Keep readable plain text when the optional renderer cannot load. */ });
    return () => { active = false; };
  }, [hasAssistantReply]);

  useEffect(() => { if (isOpen) inputRef.current?.focus({ preventScroll: true }); }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);
  useEffect(() => {
    if (isOpen && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, isLoading, isOpen]);
  useEffect(() => () => requestRef.current?.abort(), []);

  const handleSubmit = async event => {
    event.preventDefault();
    if (!input.trim() || pendingRef.current) return;
    if (attemptCount >= 10) { setErrorMsg('You have reached the 10-message session limit. Contact our team to continue your inquiry.'); return; }
    const now = Date.now();
    const cooldownMs = attemptCount < 3 ? 5000 : 60000;
    const nextRequest = Math.max(retryAt, lastMessageTimeRef.current ? lastMessageTimeRef.current + cooldownMs : 0);
    if (now < nextRequest) { setErrorMsg(`Please wait ${Math.ceil((nextRequest - now) / 1000)} seconds before sending another message.`); return; }
    const content = input.trim();
    const userMessage = { id: ++messageIdRef.current, role: 'user', content };
    // Bound context to the existing API limits without dropping the visible conversation.
    const context = [userMessage];
    let length = content.length;
    for (let index = messages.length - 1; index >= 0 && context.length < 20; index -= 1) {
      if (messages[index].failed) continue;
      const previous = { role: messages[index].role, content: messages[index].content.slice(0, 4000) };
      if (length + previous.content.length > 15000) break;
      context.unshift(previous);
      length += previous.content.length;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    pendingRef.current = true;
    setMessages(current => [...current, userMessage]);
    setInput(''); setIsLoading(true); setErrorMsg('');
    setAttemptCount(current => current + 1);
    lastMessageTimeRef.current = now;
    const timeout = window.setTimeout(() => controller.abort('timeout'), 65000);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: context.map(({ role, content: text }) => ({ role, content: text })) }), signal: controller.signal,
      });
      if (!response.ok) {
        const retrySeconds = Number(response.headers.get('Retry-After'));
        if (retrySeconds > 0 && Number.isFinite(retrySeconds)) setRetryAt(Date.now() + retrySeconds * 1000);
        throw new Error(response.status === 429 ? 'The assistant is busy. Please wait before trying again.' : 'The assistant could not reply. Please try again, or contact our team.');
      }
      const data = await response.json();
      if (typeof data.content !== 'string' || !data.content.trim()) throw new Error('The assistant returned an empty reply. Please try again.');
      setMessages(current => [...current, { id: ++messageIdRef.current, role: 'assistant', content: data.content }]);
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
      setMessages(current => current.map(message => message.id === userMessage.id ? { ...message, failed: true } : message));
      setInput(current => current || content);
      setErrorMsg(controller.signal.aborted ? 'The reply took too long. Your message is ready to try again.' : error.message);
    } finally {
      window.clearTimeout(timeout);
      pendingRef.current = false;
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setIsLoading(false);
    }
  };

  if (!isOpen) return null;
  return (
    <section className="ai-chat" role="dialog" aria-modal="false" aria-labelledby="ai-chat-title" aria-describedby="ai-chat-description">
      <header className="ai-chat-header"><div className="ai-chat-heading"><Bot size={23} aria-hidden="true" /><div><h2 id="ai-chat-title">Product assistant</h2><p id="ai-chat-description">Ask about components and sourcing</p></div></div><button type="button" className="ai-chat-close" onClick={onClose} aria-label="Close product assistant"><X size={20} aria-hidden="true" /></button></header>
      <div className="ai-chat-log" ref={logRef} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && <div className="ai-chat-welcome"><h3>What are you looking for?</h3><p>Start with a part number or tell us what you need. For pricing and availability, <Link to="/contact" onClick={onClose}>contact our team</Link>.</p><div className="ai-chat-prompts">{PROMPTS.map(prompt => <button type="button" key={prompt} onClick={() => { setInput(prompt); inputRef.current?.focus(); }}>{prompt}</button>)}</div></div>}
        {messages.map(message => <div key={message.id} className={`ai-chat-message ai-chat-message-${message.role}`}><span className="ai-chat-message-author">{message.role === 'user' ? 'You' : 'Product assistant'}</span><div className="ai-chat-message-content">{message.role === 'assistant' && Markdown ? <Markdown>{message.content}</Markdown> : <p>{message.content}</p>}</div>{message.failed && <span className="ai-chat-message-failed">No reply received</span>}</div>)}
        {isLoading && <p className="ai-chat-loading" role="status">Looking into your question...</p>}
      </div>
      <div className="ai-chat-compose">
        {errorMsg && <p className="ai-chat-error" role="alert">{errorMsg}</p>}
        {attemptCount >= 10 && <Link className="ai-chat-contact-link" to="/contact" onClick={onClose}>Continue with our team</Link>}
        <form onSubmit={handleSubmit}><label className="ai-chat-input-label" htmlFor="ai-chat-input">Your message</label><div className="ai-chat-input-row"><input ref={inputRef} id="ai-chat-input" type="text" value={input} maxLength={2000} onChange={event => setInput(event.target.value)} placeholder="Part number or question" readOnly={isLoading} autoComplete="off" /><button type="submit" aria-label="Send message" disabled={isLoading || !input.trim() || attemptCount >= 10}><Send size={19} aria-hidden="true" /></button></div></form>
        <p className="ai-chat-note">{Math.max(0, 10 - attemptCount)} messages left this session. Confirm product details with our team.</p>
      </div>
    </section>
  );
};
export default AiChat;
