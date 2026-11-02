import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
const links = [['Home', '/'], ['Products', '/products'], ['About Us', '/about'], ['Contact Us', '/contact']];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  const closeOnEscape = event => {
    if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
  };
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  return (
    <header className="site-header">
      <nav aria-label="Main navigation">
        <div className="container nav-inner">
          <Link to="/" className="site-brand">Haoguan Electrons</Link>
          <div className="desktop-nav">
            {links.map(([label, to]) => <NavLink key={to} end={to === '/'} to={to} className={'nav-link' + (to === '/contact' ? ' nav-contact' : '')}>{label}</NavLink>)}
          </div>
          <button ref={toggle} className="mobile-menu-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(value => !value)} onKeyDown={closeOnEscape}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {open && <div id="mobile-navigation" className="mobile-nav" onKeyDown={closeOnEscape}>
          {links.map(([label, to]) => <NavLink key={to} end={to === '/'} to={to} className="nav-link" onClick={() => setOpen(false)}>{label}</NavLink>)}
        </div>}
      </nav>
    </header>
  );
}
