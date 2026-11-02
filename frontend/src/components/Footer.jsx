import { Link } from 'react-router-dom';

export default function Footer() {
  return <footer className="site-footer">
    <div className="container">
      <div className="footer-top">
        <div><Link to="/" className="footer-brand">Haoguan Electrons</Link><p>Electronic components, modules and tools.<br />Find a part. Tell us what you need.</p></div>
        <nav className="footer-links" aria-label="Footer navigation"><Link to="/products">Products</Link><Link to="/about">About Us</Link><Link to="/contact">Contact Us</Link></nav>
      </div>
      <div className="footer-bottom">&copy; {new Date().getFullYear()} Haoguan Electrons. All rights reserved.</div>
    </div>
  </footer>;
}
