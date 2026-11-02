import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowUpRight, CheckCircle2, Mail, MapPin, Package, Phone, Send } from 'lucide-react';
import { getSiteConfig } from '../api/siteConfig';
import './Contact.css';

const MAX_MESSAGE_LENGTH = 5000;
const DRAFT_KEY = 'hg-contact-draft';
const readDraft = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}');
    return {
      name: typeof saved.name === 'string' ? saved.name.slice(0, 200) : '',
      email: typeof saved.email === 'string' ? saved.email.slice(0, 254) : '',
      message: typeof saved.message === 'string' ? saved.message.slice(0, MAX_MESSAGE_LENGTH) : '',
      productId: typeof saved.productId === 'string' ? saved.productId : '',
      quantity: typeof saved.quantity === 'string' && /^[1-9]\d{0,8}$/.test(saved.quantity) ? saved.quantity : '',
    };
  } catch { return { name: '', email: '', message: '', productId: '', quantity: '' }; }
};

const Contact = () => {
  const [searchParams] = useSearchParams();
  const requestedId = searchParams.get('product') || '';
  const productId = /^[a-zA-Z0-9]{15}$/.test(requestedId) ? requestedId : '';
  const productName = (searchParams.get('name') || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 200);
  const productPath = productId ? `/products?product=${encodeURIComponent(productId)}` : '';
  const [initialDraft] = useState(readDraft);
  const [formData, setFormData] = useState({ name: initialDraft.name, email: initialDraft.email, message: initialDraft.message });
  const [quantity, setQuantity] = useState(initialDraft.productId === productId ? initialDraft.quantity : '');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [siteConfig, setSiteConfig] = useState(null);
  const [configState, setConfigState] = useState('loading');
  const [configAttempt, setConfigAttempt] = useState(0);
  const submitRef = useRef(false);
  const requestRef = useRef(null);
  const statusRef = useRef(null);
  const lastSentRef = useRef('');

  useEffect(() => {
    let active = true;
    setConfigState('loading');
    getSiteConfig().then(config => {
      if (active) { setSiteConfig(config); setConfigState('ready'); }
    }).catch(() => { if (active) setConfigState('error'); });
    return () => { active = false; };
  }, [configAttempt]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => { if (status.message) statusRef.current?.focus(); }, [status]);
  useEffect(() => {
    setQuantity(initialDraft.productId === productId ? initialDraft.quantity : '');
  }, [initialDraft, productId]);
  useEffect(() => {
    // A tab-scoped draft survives a visit back to the catalog; blocked storage is harmless.
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...formData, productId, quantity })); } catch { /* Storage may be disabled. */ }
  }, [formData, productId, quantity]);

  const productContext = productId
    ? `\n\nProduct: ${productName || productId}\nProduct link: ${window.location.origin}${productPath}${quantity ? `\nQuantity: ${quantity}` : ''}` : '';
  const availableCharacters = MAX_MESSAGE_LENGTH - productContext.length;
  const messageTooLong = formData.message.length > availableCharacters;
  const handleChange = event => {
    setFormData(current => ({ ...current, [event.target.name]: event.target.value }));
    if (status.type === 'success') setStatus({ type: '', message: '' });
  };
  const handleSubmit = async event => {
    event.preventDefault();
    if (submitRef.current) return;
    if (productId && quantity && !/^[1-9]\d{0,8}$/.test(quantity)) {
      setStatus({ type: 'error', message: 'Enter a whole-number quantity from 1 to 999,999,999, or leave it blank.' }); return;
    }
    const payload = { name: formData.name.trim(), email: formData.email.trim(), message: `${formData.message.trim()}${productContext}` };
    if (!payload.name || !payload.email || !formData.message.trim()) {
      setStatus({ type: 'error', message: 'Please enter your name, email address and message.' }); return;
    }
    if (payload.message.length > MAX_MESSAGE_LENGTH) {
      setStatus({ type: 'error', message: 'Please shorten your message so the product details fit within 5,000 characters.' }); return;
    }
    const signature = JSON.stringify(payload);
    if (signature === lastSentRef.current) {
      setStatus({ type: 'success', message: 'This message has already been sent. You can edit it to send a new inquiry.' }); return;
    }
    submitRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setStatus({ type: '', message: '' });
    try {
      await axios.post('/api/contact', payload, { signal: controller.signal, timeout: 30000 });
      lastSentRef.current = signature;
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Storage may be disabled. */ }
      setStatus({ type: 'success', message: 'Your message has been sent. Our team can reply using the email address you provided.' });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error.response?.status === 429
        ? 'You have sent several messages recently. Please wait a little before trying again.'
        : 'We could not confirm your message was sent. Your details are still here. Please try again or use the contact details on this page.';
      setStatus({ type: 'error', message });
    } finally {
      submitRef.current = false;
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const email = typeof siteConfig?.email === 'string' ? siteConfig.email.trim() : '';
  const phone = typeof siteConfig?.phone === 'string' ? siteConfig.phone.trim() : '';
  const emailHref = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${encodeURIComponent(email)}` : '';
  const phoneHref = /\d/.test(phone) ? `tel:${phone.replace(/[^\d+]/g, '')}` : '';
  const qrUrl = typeof siteConfig?.wechatQrUrl === 'string' && /^(https:\/\/|\/(?!\/))/.test(siteConfig.wechatQrUrl) ? siteConfig.wechatQrUrl : '';

  return (
    <div className="contact-page"><div className="container">
      <header className="contact-heading"><p className="contact-eyebrow">LET'S TALK COMPONENTS</p><h1>Contact Us</h1><p>Share your part numbers, quantities and requirements. We'll help you take the next step.</p></header>
      <div className="contact-layout">
        <aside className="contact-details" aria-labelledby="contact-details-title">
          <h2 id="contact-details-title">A direct connection.</h2><p>For product inquiries, sourcing questions or an order discussion, get in touch with our team.</p>
          {configState === 'loading' && <p className="contact-config-status" role="status">Loading contact details...</p>}
          {configState === 'error' && <div className="contact-config-status" role="status"><p>Contact details could not be loaded. You can still send an inquiry.</p><button type="button" className="button-link" onClick={() => setConfigAttempt(value => value + 1)}>Try again</button></div>}
          <dl className="contact-methods">
            {phone && <div><Phone size={20} aria-hidden="true" /><div><dt>Phone</dt><dd>{phoneHref ? <a href={phoneHref}>{phone}</a> : phone}</dd></div></div>}
            {email && <div><Mail size={20} aria-hidden="true" /><div><dt>Email</dt><dd>{emailHref ? <a href={emailHref}>{email}</a> : email}</dd></div></div>}
            {siteConfig?.address && <div><MapPin size={20} aria-hidden="true" /><div><dt>Address</dt><dd>{siteConfig.address}</dd></div></div>}
          </dl>
          {qrUrl && <div className="contact-wechat"><img src={qrUrl} alt="Scan to connect with HG Electrons on WeChat" width="112" height="112" loading="lazy" decoding="async" /><div><h3>{siteConfig.wechatTitle || 'Connect on WeChat'}</h3><p>Scan the QR code to start a conversation.</p></div></div>}
        </aside>
        <section className="contact-form-section" aria-labelledby="inquiry-title">
          <h2 id="inquiry-title">Tell us what you need.</h2><p className="contact-form-intro">All fields are required unless marked optional.</p>
          {productId && <div className="contact-product-context"><Package size={21} aria-hidden="true" /><div><span>Product inquiry</span><strong>{productName || productId}</strong><Link to={productPath}>View product <ArrowUpRight size={14} aria-hidden="true" /></Link></div></div>}
          <form onSubmit={handleSubmit} className="contact-form" aria-busy={loading}>
            <div className="contact-field-row">
              <div className="contact-field"><label htmlFor="name">Name</label><input type="text" id="name" name="name" value={formData.name} onChange={handleChange} autoComplete="name" maxLength={200} placeholder="Your name" readOnly={loading} required /></div>
              <div className="contact-field"><label htmlFor="email">Email</label><input type="email" id="email" name="email" value={formData.email} onChange={handleChange} autoComplete="email" maxLength={254} placeholder="you@company.com" readOnly={loading} required /></div>
            </div>
            <div className="contact-field"><label htmlFor="message">Message</label><textarea id="message" name="message" value={formData.message} onChange={handleChange} rows={6} maxLength={MAX_MESSAGE_LENGTH} placeholder="Part numbers, specifications, quantities or anything else we should know." readOnly={loading} required aria-describedby="contact-message-length" aria-invalid={messageTooLong || undefined} /><span id="contact-message-length" className={`contact-field-hint${messageTooLong ? ' is-error' : ''}`}>{formData.message.length.toLocaleString()} / {availableCharacters.toLocaleString()} characters{productId ? ' available for your message' : ''}</span></div>
            {productId && <div className="contact-field contact-quantity"><label htmlFor="inquiry-quantity">Quantity <span>(optional)</span></label><input id="inquiry-quantity" type="number" inputMode="numeric" min="1" max="999999999" step="1" value={quantity} readOnly={loading} onChange={event => { setQuantity(event.target.value); if (status.type === 'success') setStatus({ type: '', message: '' }); }} placeholder="e.g. 500" /><span className="contact-field-hint">The product link and quantity will be included automatically.</span></div>}
            {status.message && <div ref={statusRef} tabIndex={-1} role={status.type === 'error' ? 'alert' : 'status'} className={`contact-status contact-status-${status.type}`}>{status.type === 'success' && <CheckCircle2 size={20} aria-hidden="true" />}<span>{status.message}</span></div>}
            <div className="contact-form-actions"><button type="submit" disabled={loading || messageTooLong} className="button">{loading ? 'Sending...' : 'Send inquiry'}<Send size={17} aria-hidden="true" /></button><p>Your details are used to respond to this inquiry.</p></div>
          </form>
        </section>
      </div>
    </div></div>
  );
};
export default Contact;
