import { Link } from 'react-router-dom';
import { ArrowRight, Search, MessageSquare, Package } from 'lucide-react';
import './About.css';

export default function About() {
  return <div className="about-page">
    <section className="about-intro container">
      <p className="about-eyebrow">About Haoguan Electrons</p>
      <h1>A direct connection<br />to the parts you need.</h1>
      <p className="about-lead">We bring electronic components, modules and tools together in one catalog, helping you explore parts and discuss your requirements.</p>
    </section>
    <section className="about-content container">
      <div><h2>Start with the component.<br />Build the conversation.</h2><p>Every project has different requirements. Our catalog covers products from integrated circuits and passive components to sensors, power supplies and development modules.</p><p>Browse the range, view product images and descriptions, then contact our team with the part and quantity you need. We can discuss specifications, availability and next steps with you.</p><Link to="/products" className="button">Browse products <ArrowRight size={17} /></Link></div>
      <div className="about-process">
        <div><Search size={25} strokeWidth={1.5} /><h3>Find a part</h3><p>Search by product name or part number, or explore the catalog by category.</p></div>
        <div><Package size={25} strokeWidth={1.5} /><h3>Check the details</h3><p>View product images and descriptions to help identify the component you need.</p></div>
        <div><MessageSquare size={25} strokeWidth={1.5} /><h3>Ask our team</h3><p>Send a product inquiry or reach us through the contact details on our website.</p></div>
      </div>
    </section>
    <section className="about-contact"><div className="container"><h2>Tell us what you’re working on.</h2><p>A part number and quantity are a useful place to start.</p><Link to="/contact" className="button-secondary">Contact Us <ArrowRight size={17} /></Link></div></section>
  </div>;
}
