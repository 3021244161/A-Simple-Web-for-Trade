import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Copy, ExternalLink, Package, Search, SlidersHorizontal, X } from 'lucide-react';
import './Products.css';

const PAGE_SIZE = 24;
const SNAPSHOT_TTL = 60000;
const SNAPSHOT_LIMIT = 240;
let catalogSnapshot = null;

function readSnapshot(filterKey) {
  if (catalogSnapshot && Date.now() >= catalogSnapshot.expiresAt) catalogSnapshot = null;
  return catalogSnapshot?.filterKey === filterKey ? catalogSnapshot : null;
}

function saveSnapshot(filterKey, products, page, totalCount) {
  const previous = readSnapshot(filterKey);
  const snapshot = previous || {};
  Object.assign(snapshot, {
    filterKey,
    products: products.length <= SNAPSHOT_LIMIT ? products : products.slice(0, SNAPSHOT_LIMIT),
    page: Math.min(page, SNAPSHOT_LIMIT / PAGE_SIZE),
    totalCount,
    scroll: previous?.scroll || 0,
    openedProduct: previous?.openedProduct || '',
    expiresAt: Date.now() + SNAPSHOT_TTL,
  });
  catalogSnapshot = snapshot;
}

function rememberPosition(filterKey, scroll, openedProduct) {
  const snapshot = readSnapshot(filterKey);
  if (!snapshot) return;
  snapshot.scroll = scroll;
  snapshot.openedProduct = openedProduct;
}

function safeWebUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const keyword = (searchParams.get('q') || '').trim().slice(0, 200);
  // Keyword searches are global, matching the API's category precedence.
  const category = keyword ? '' : (searchParams.get('category') || '').trim();
  const productId = searchParams.get('product') || '';
  const filterKey = JSON.stringify([keyword, category]);
  const initialSnapshot = useRef(readSnapshot(filterKey));
  const [searchInput, setSearchInput] = useState(keyword);
  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categoryRetry, setCategoryRetry] = useState(0);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [products, setProducts] = useState(() => initialSnapshot.current?.products || []);
  const [page, setPage] = useState(() => initialSnapshot.current?.page || 0);
  const [totalCount, setTotalCount] = useState(() => initialSnapshot.current?.totalCount ?? null);
  const [loading, setLoading] = useState(() => !initialSnapshot.current);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailRetry, setDetailRetry] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [brokenImages, setBrokenImages] = useState(new Set());
  const [copyStatus, setCopyStatus] = useState('');
  const listRequest = useRef({ id: 0, controller: null, pending: false });
  const productsRef = useRef(products);
  const previousProduct = useRef('');
  const openedFromList = useRef('');
  const listPosition = useRef(initialSnapshot.current?.scroll || 0);
  const initialListRestore = useRef(!productId ? initialSnapshot.current : null);
  const listHeading = useRef(null);
  const detailHeading = useRef(null);
  const categoryToggle = useRef(null);

  useEffect(() => setSearchInput(keyword), [keyword]);
  useEffect(() => {
    const controller = new AbortController();
    setCategoryLoading(true);
    setCategoryError(false);
    axios.get('/api/categories', { signal: controller.signal, timeout: 15000 })
      .then(({ data }) => { if (!controller.signal.aborted) setCategories(Array.isArray(data) ? data.filter(item => typeof item.category === 'string') : []); })
      .catch(error => { if (!controller.signal.aborted && !axios.isCancel(error)) setCategoryError(true); })
      .finally(() => { if (!controller.signal.aborted) setCategoryLoading(false); });
    return () => controller.abort();
  }, [categoryRetry]);

  const fetchProducts = useCallback(async (nextPage = 1) => {
    const isReset = nextPage === 1;
    if (!isReset && listRequest.current.pending) return;
    listRequest.current.controller?.abort();
    const controller = new AbortController();
    const id = listRequest.current.id + 1;
    listRequest.current = { id, controller, pending: true };
    setListError('');
    if (isReset) {
      productsRef.current = [];
      setLoading(true); setLoadingMore(false); setProducts([]); setTotalCount(null); setPage(0);
    } else setLoadingMore(true);
    try {
      const params = { page: nextPage, limit: PAGE_SIZE };
      if (keyword) params.keyword = keyword;
      else if (category) params.category = category;
      const { data } = await axios.get('/api/products', { params, signal: controller.signal, timeout: 20000 });
      if (listRequest.current.id !== id) return;
      const items = Array.isArray(data.items) ? data.items : [];
      const previous = productsRef.current;
      const nextProducts = isReset ? items : [...previous, ...items.filter(item => !previous.some(existing => existing.id === item.id))];
      const total = Number(data.totalItems) || 0;
      productsRef.current = nextProducts;
      saveSnapshot(filterKey, nextProducts, nextPage, total);
      setProducts(nextProducts);
      setTotalCount(total);
      setPage(nextPage);
    } catch (error) {
      if (!axios.isCancel(error) && listRequest.current.id === id) setListError(isReset ? 'We could not load the catalog. Please try again.' : 'The next products could not be loaded. Your current results are still here.');
    } finally {
      if (listRequest.current.id === id) {
        listRequest.current.pending = false; setLoading(false); setLoadingMore(false);
      }
    }
  }, [category, keyword, filterKey]);
  useEffect(() => {
    const cached = readSnapshot(filterKey);
    if (cached) {
      productsRef.current = cached.products;
      listPosition.current = cached.scroll;
      listRequest.current.pending = false;
      setProducts(cached.products); setPage(cached.page); setTotalCount(cached.totalCount);
      setLoading(false); setLoadingMore(false); setListError('');
    } else {
      fetchProducts(1);
      listPosition.current = 0;
    }
    return () => { listRequest.current.controller?.abort(); listRequest.current.id += 1; };
  }, [fetchProducts, filterKey]);

  useEffect(() => {
    if (productId && !previousProduct.current) window.scrollTo({ top: 0, behavior: 'instant' });
    let frame;
    if (!productId && (previousProduct.current || initialListRestore.current)) {
      const previousId = previousProduct.current || initialListRestore.current?.openedProduct;
      frame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: listPosition.current, behavior: 'instant' });
        (document.getElementById(`catalog-product-${previousId}`) || listHeading.current)?.focus({ preventScroll: true });
        initialListRestore.current = null;
      });
    }
    previousProduct.current = productId;
    return () => { if (frame) window.cancelAnimationFrame(frame); };
  }, [productId]);

  useEffect(() => {
    setSelectedProduct(null); setDetailError(''); setCopyStatus(''); setActiveImageIndex(0);
    if (!productId) { setDetailLoading(false); return; }
    const controller = new AbortController();
    setDetailLoading(true);
    axios.get(`/api/product/${encodeURIComponent(productId)}`, { signal: controller.signal, timeout: 20000 })
      .then(({ data }) => { if (!controller.signal.aborted) setSelectedProduct(data); })
      .catch(error => {
        if (!controller.signal.aborted && !axios.isCancel(error)) setDetailError(error.response?.status === 404
          ? 'This product is currently unavailable. Browse the catalog or contact us with the part number.'
          : 'We could not load this product. Please try again.');
      })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [productId, detailRetry]);
  useEffect(() => { if (selectedProduct) detailHeading.current?.focus({ preventScroll: true }); }, [selectedProduct]);
  useEffect(() => {
    const title = productId && selectedProduct?.id === productId && selectedProduct.name
      ? `${selectedProduct.name} | Haoguan Electrons`
      : 'Product Catalog | Haoguan Electrons';
    document.title = title;
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
  }, [productId, selectedProduct]);

  const chooseCategory = nextCategory => {
    const next = new URLSearchParams();
    if (nextCategory) next.set('category', nextCategory);
    setSearchParams(next); setSearchInput(''); setCategoriesOpen(false); openedFromList.current = '';
    if (window.matchMedia('(max-width: 767px)').matches) categoryToggle.current?.focus();
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const searchCatalog = event => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (searchInput.trim()) next.set('q', searchInput.trim());
    setSearchParams(next); setCategoriesOpen(false); openedFromList.current = '';
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const productLink = id => {
    const next = new URLSearchParams(searchParams); next.set('product', id);
    return `/products?${next.toString()}`;
  };
  const backToList = () => {
    if (openedFromList.current === productId) { openedFromList.current = ''; navigate(-1); }
    else { const next = new URLSearchParams(searchParams); next.delete('product'); setSearchParams(next, { replace: true }); }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(productLink(productId), window.location.origin).href);
      setCopyStatus('Link copied');
    } catch { setCopyStatus('Copy the address from your browser to share this product.'); }
  };
  const openProduct = (event, id) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    listPosition.current = window.scrollY;
    openedFromList.current = id;
    rememberPosition(filterKey, window.scrollY, id);
  };
  const imageMarkup = (src, name, eager = false) => {
    const safeSrc = safeWebUrl(src);
    return safeSrc && !brokenImages.has(safeSrc)
      ? <img src={safeSrc} alt={name || 'Product'} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setBrokenImages(previous => new Set(previous).add(safeSrc))} />
      : <span className="catalog-image-empty"><Package size={28} aria-hidden="true" /><span>Image unavailable</span></span>;
  };
  const categoryList = () => (
    <div className="catalog-category-list">
      <button type="button" className={!category && !keyword ? 'is-active' : ''} aria-current={!category && !keyword ? 'true' : undefined} onClick={() => chooseCategory('')}>All products<ArrowRight size={15} aria-hidden="true" /></button>
      {categoryLoading && <p className="catalog-category-note" role="status">Loading categories…</p>}
      {categoryError && <div className="catalog-category-note" role="alert"><p>Categories are unavailable.</p><button type="button" className="catalog-inline-button" onClick={() => setCategoryRetry(value => value + 1)}>Try again</button></div>}
      {categories.map(item => <button type="button" key={item.category} className={category === item.category ? 'is-active' : ''} aria-current={category === item.category ? 'true' : undefined} onClick={() => chooseCategory(item.category)}><span>{item.category}</span>{category === item.category && <ArrowRight size={15} aria-hidden="true" />}</button>)}
    </div>
  );
  const images = Array.isArray(selectedProduct?.images) ? selectedProduct.images : [];
  const externalUrl = safeWebUrl(selectedProduct?.url);
  const hasMore = totalCount !== null && page * PAGE_SIZE < totalCount;

  return (
    <div className="catalog-page">
      <section className="catalog-intro"><div className="container">
        <nav className="catalog-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span>Products</span></nav>
        <h1>Find your next component.</h1>
        <p>Search by part number or browse our electronic component categories.</p>
        <form className="catalog-search" onSubmit={searchCatalog} role="search">
          <label className="catalog-sr-only" htmlFor="catalog-search-input">Search all products by part number or keyword</label><Search size={21} aria-hidden="true" />
          <input id="catalog-search-input" type="search" maxLength={200} placeholder="Part number or keyword" value={searchInput} onChange={event => setSearchInput(event.target.value)} />
          <button className="button" type="submit">Search<span className="catalog-search-extra"> products</span><ArrowRight size={17} aria-hidden="true" /></button>
        </form>
      </div></section>
      <div className="container catalog-layout">
        <aside className="catalog-sidebar" aria-label="Product categories">
          <div className="catalog-desktop-categories"><h2>Browse categories</h2>{categoryList()}</div>
          <div className="catalog-mobile-categories"><button ref={categoryToggle} className="catalog-category-toggle" type="button" aria-expanded={categoriesOpen} aria-controls="catalog-mobile-category-list" onClick={() => setCategoriesOpen(value => !value)}><SlidersHorizontal size={18} aria-hidden="true" /><span>{category || 'Browse categories'}</span><ChevronDown size={18} aria-hidden="true" className={categoriesOpen ? 'is-open' : ''} /></button>{categoriesOpen && <div id="catalog-mobile-category-list">{categoryList()}</div>}</div>
          <div className="catalog-help"><h3>Looking for a specific part?</h3><p>Send us the part number and quantity. Our team can help with your inquiry.</p><Link to="/contact" className="button-link">Contact our team<ArrowRight size={16} aria-hidden="true" /></Link></div>
        </aside>
        <section className="catalog-results" aria-label={productId ? 'Product details' : 'Product results'}>
          {productId ? <>
            <button type="button" className="catalog-back" onClick={backToList}><ArrowLeft size={17} aria-hidden="true" />Back to products</button>
            {detailLoading && <div className="catalog-detail-skeleton" role="status" aria-label="Loading product"><div /><div><span /><span /><span /></div><span className="catalog-sr-only">Loading product…</span></div>}
            {detailError && <div className="catalog-state" role="alert"><Package size={32} aria-hidden="true" /><h2>Product unavailable</h2><p>{detailError}</p><button type="button" className="button-secondary" onClick={() => setDetailRetry(value => value + 1)}>Try again</button></div>}
            {selectedProduct && <article className="catalog-detail">
              <div className="catalog-gallery"><div className="catalog-detail-image">{imageMarkup(images[activeImageIndex] || images[0], selectedProduct.name, true)}</div>{images.length > 1 && <div className="catalog-thumbnails" aria-label="Product images">{images.map((src, index) => <button type="button" key={`${src}-${index}`} aria-label={`Show image ${index + 1}`} aria-pressed={activeImageIndex === index} className={activeImageIndex === index ? 'is-active' : ''} onClick={() => setActiveImageIndex(index)}>{imageMarkup(src, '')}</button>)}</div>}</div>
              <div className="catalog-detail-info">{selectedProduct.category && <p className="catalog-detail-category">{selectedProduct.category}</p>}<h2 ref={detailHeading} tabIndex={-1}>{selectedProduct.name}</h2><div className="catalog-description">{selectedProduct.description || 'Contact our team for product details, availability and pricing.'}</div>
                <div className="catalog-detail-actions"><Link className="button" to={`/contact?${new URLSearchParams({ product: selectedProduct.id, name: selectedProduct.name || '' }).toString()}`}>Request a quote<ArrowRight size={17} aria-hidden="true" /></Link><p>Include your quantity and requirements for a more helpful reply.</p>{externalUrl && <a className="button-link" href={externalUrl} target="_blank" rel="noopener noreferrer">Original product reference<ExternalLink size={15} aria-hidden="true" /></a>}<button type="button" className="catalog-copy" onClick={copyLink}>{copyStatus === 'Link copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}Copy product link</button><span className="catalog-copy-status" role="status">{copyStatus}</span></div>
              </div>
            </article>}
          </> : <>
            <div className="catalog-results-heading"><div><h2 ref={listHeading} tabIndex={-1}>{keyword ? `Results for “${keyword}”` : category || 'All products'}</h2>{keyword && <p>Searching across all categories</p>}</div><span className="catalog-result-count" aria-live="polite">{totalCount !== null ? `${totalCount.toLocaleString()} products` : 'Loading…'}</span></div>
            {(keyword || category) && <button type="button" className="catalog-clear" onClick={() => chooseCategory('')}><X size={14} aria-hidden="true" />Clear {keyword ? 'search' : 'category'}</button>}
            {loading ? <div className="catalog-grid" role="status" aria-label="Loading products">{Array.from({ length: 6 }, (_, index) => <div className="catalog-card-skeleton" key={index}><div /><span /><span /></div>)}<span className="catalog-sr-only">Loading products…</span></div> : <>
              {products.length > 0 && <div className="catalog-grid">{products.map(product => <Link id={`catalog-product-${product.id}`} to={productLink(product.id)} className="catalog-card" key={product.id} onClick={event => openProduct(event, product.id)}><div className="catalog-card-image">{imageMarkup(product.images?.[0], product.name)}</div><div className="catalog-card-content"><p>{product.category || 'Electronic component'}</p><h3 title={product.name}>{product.name}</h3><span className="catalog-card-link">View product<ArrowRight size={15} aria-hidden="true" /></span></div></Link>)}</div>}
              {!products.length && !listError && <div className="catalog-state"><Search size={32} aria-hidden="true" /><h3>No matching products</h3><p>Try a shorter part number, a different keyword or another category.</p><button type="button" className="button-secondary" onClick={() => chooseCategory('')}>Browse all products</button></div>}
              {listError && <div className="catalog-state catalog-error" role="alert"><p>{listError}</p><button type="button" className="button-secondary" onClick={() => fetchProducts(products.length ? page + 1 : 1)}>Try again</button></div>}
              {products.length > 0 && <div className="catalog-pagination"><p>Showing {products.length.toLocaleString()} of {totalCount.toLocaleString()} products</p>{hasMore && !listError && <button type="button" className="button-secondary" disabled={loadingMore} onClick={() => fetchProducts(page + 1)}>{loadingMore ? 'Loading products…' : 'Load more products'}{!loadingMore && <ArrowRight size={17} aria-hidden="true" />}</button>}</div>}
            </>}
          </>}
        </section>
      </div>
    </div>
  );
}
