import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { MessageCircle, X } from 'lucide-react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Products from './pages/Products';
import About from './pages/About';
import Contact from './pages/Contact';

const pageMeta = {
  '/': ['Electronic Components & Modules | Haoguan Electrons', 'Browse electronic components, modules and tools. Find a part and contact Haoguan Electrons with your requirements.'],
  '/products': ['Product Catalog | Haoguan Electrons', 'Search our electronic component catalog by part number or product name. Browse categories and send a product inquiry.'],
  '/about': ['About Us | Haoguan Electrons', 'Learn about Haoguan Electrons and explore our electronic components, modules and tools.'],
  '/contact': ['Contact Us | Haoguan Electrons', 'Contact Haoguan Electrons with your product, quantity and sourcing requirements.']
};

function RouteEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const [title, description] = pageMeta[pathname] || ['Page not found | Haoguan Electrons', 'Explore the Haoguan Electrons electronic component catalog.'];
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  }, [pathname]);
  return null;
}

function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [Panel, setPanel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const launcher = useRef(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const openChat = async () => {
    if (loading) return;
    setFailed(false);
    if (!Panel) {
      setLoading(true);
      try {
        const module = await import('./components/AiChat');
        if (!mounted.current) return;
        setPanel(() => module.default);
      } catch {
        if (mounted.current) setFailed(true);
        return;
      } finally {
        if (mounted.current) setLoading(false);
      }
    }
    setOpen(true);
  };
  const close = () => { setOpen(false); requestAnimationFrame(() => launcher.current?.focus()); };
  return <>
    {!open && <button ref={launcher} className="chat-launcher" onClick={openChat} disabled={loading} aria-label="Open AI assistant" aria-busy={loading}><MessageCircle size={19} aria-hidden="true" />{loading ? 'Opening assistant...' : 'Ask our AI assistant'}</button>}
    {Panel && <Panel isOpen={open} onClose={close} />}
    {failed && <div className="chat-load-error" role="alert"><p>The assistant could not load. You can try again or contact our team.</p><button className="button-link" onClick={openChat}>Try again</button><Link to="/contact" className="button-link" onClick={() => setFailed(false)}>Contact Us</Link><button aria-label="Dismiss assistant error" className="button-secondary" onClick={() => setFailed(false)}><X size={16} /></button></div>}
  </>;
}

export default function App() {
  return <BrowserRouter>
    <RouteEffects />
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Navbar />
      <main id="main-content" className="site-main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<div className="page-loading"><h1>Page not found</h1><p>The page may have moved. Explore our catalog to find a component.</p><Link className="button" to="/products">Browse products</Link></div>} />
        </Routes>
      </main>
      <Footer />
      <ChatLauncher />
    </div>
  </BrowserRouter>;
}
