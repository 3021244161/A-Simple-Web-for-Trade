import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Search, Cpu, CircuitBoard, Cable, Gauge, Wrench, Zap, ChevronRight } from 'lucide-react';
import citySkyline from '../assets/city-skyline.webp';
import citySkylineMobile from '../assets/city-skyline-mobile.webp';
import './Home.css';

let catalogCache;
let catalogExpiry = 0;
let catalogPending;
async function readJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Catalog unavailable');
    return await response.json();
  } finally { clearTimeout(timer); }
}
function loadHomeCatalog() {
  if (catalogCache && Date.now() < catalogExpiry) return Promise.resolve(catalogCache);
  if (!catalogPending) catalogPending = Promise.all([
    readJson('/api/products?page=1&limit=4'),
    readJson('/api/categories')
  ]).then(([products, categories]) => {
    catalogCache = { products: products.items || [], total: products.totalItems || 0, categories };
    catalogExpiry = Date.now() + 60000;
    return catalogCache;
  }).finally(() => { catalogPending = undefined; });
  return catalogPending;
}
const categoryIcons = [Cpu, CircuitBoard, Zap, Gauge, Cable, Wrench];
const preferredCategories = ["Integrated Circuits (IC's)", 'Modules', 'Power Supply', 'Sensors', 'Cables & Connectors', 'Tools'];

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    loadHomeCatalog().then(value => { if (active) setCatalog(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);
  const search = event => {
    event.preventDefault();
    navigate('/products' + (query.trim() ? '?q=' + encodeURIComponent(query.trim()) : ''));
  };
  const knownCategories = catalog?.categories.map(item => item.category) || [];
  const categories = [...preferredCategories.filter(name => knownCategories.includes(name)), ...knownCategories.filter(name => !preferredCategories.includes(name))].slice(0, 6);
  return <div className="home-page">
    <section className="home-hero">
      <picture className="hero-backdrop" aria-hidden="true">
        <source media="(max-width: 767px)" srcSet={citySkylineMobile} />
        <img src={citySkyline} alt="" width="1600" height="900" decoding="async" fetchPriority="high" />
      </picture>
      <div className="container hero-layout">
        <div className="hero-copy">
          <p className="hero-eyebrow">Haoguan Electrons</p>
          <h1>Electronic components.<br /><span>Global connections.</span></h1>
          <p className="hero-intro">Connecting your projects with electronic components, modules and sourcing support. Find your next component here.</p>
          <form className="hero-search" onSubmit={search} role="search">
            <label htmlFor="home-search" className="sr-only">Search by part number or product name</label>
            <Search size={21} aria-hidden="true" />
            <input id="home-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Part number or product name" maxLength={200} type="search" />
            <button className="button" type="submit">Search <ArrowRight size={17} aria-hidden="true" /></button>
          </form>
        </div>
      </div>
    </section>

    <section className="home-categories container" aria-labelledby="categories-heading">
      <div className="section-heading">
        <div><h2 id="categories-heading">Find your category.</h2><p>From individual components to ready-to-use modules.</p></div>
        <Link to="/products" className="button-link">All products <ArrowRight size={17} /></Link>
      </div>
      {categories.length > 0 ? <div className="category-grid">
        {categories.map((category, index) => {
          const Icon = categoryIcons[index];
          return <Link className="category-link" key={category} to={'/products?category=' + encodeURIComponent(category)}><span className="category-icon"><Icon size={25} strokeWidth={1.5} aria-hidden="true" /></span><span className="category-name">{category}</span><ChevronRight size={18} aria-hidden="true" /></Link>;
        })}
      </div> : failed ? <div className="home-inline-error" role="status"><p>Categories could not load. Please try again.</p><button className="button-secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : <div className="category-grid" aria-label="Loading categories">{Array.from({ length: 6 }, (_, i) => <div className="category-placeholder" key={i} />)}</div>}
    </section>

    {catalog?.products.length > 1 && <section className="home-products" aria-labelledby="products-heading">
      <div className="container">
        <div className="section-heading"><div><h2 id="products-heading">A closer look at our catalog.</h2><p>Explore products and ask our team about your requirements.</p></div></div>
        <div className="home-product-grid">
          {catalog.products.slice(0, 4).map(item => <Link className="home-product-card" key={item.id} to={'/products?product=' + encodeURIComponent(item.id)}>
            <div className="home-product-image">{item.images?.[0] ? <img src={item.images[0]} width="280" height="220" alt={item.name} loading="lazy" decoding="async" /> : <span>Image unavailable</span>}</div>
            <div className="home-product-info"><span>{item.category}</span><h3 title={item.name}>{item.name}</h3><span className="product-view">View product <ArrowRight size={16} aria-hidden="true" /></span></div>
          </Link>)}
        </div>
      </div>
    </section>}

    <section className="home-inquiry container">
      <div className="inquiry-heading"><h2>A part in mind?<br />Let’s talk requirements.</h2><p>Send a part number, quantity and any details that matter to your project.</p><Link to="/contact" className="button">Contact Us <ArrowRight size={17} /></Link></div>
      <ol className="inquiry-steps">
        <li><span>1</span><div><h3>Find your component</h3><p>Search by name or browse product categories.</p></div></li>
        <li><span>2</span><div><h3>Share your requirements</h3><p>Open a product and send an inquiry with its details included.</p></div></li>
        <li><span>3</span><div><h3>Connect with our team</h3><p>Discuss specifications, availability and next steps.</p></div></li>
      </ol>
    </section>
  </div>;
}
