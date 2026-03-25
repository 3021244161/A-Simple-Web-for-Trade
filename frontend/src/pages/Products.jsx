import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronRight, X, MessageCircle, Search, Filter, ArrowUp } from 'lucide-react';

const Products = () => {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showWeChatModal, setShowWeChatModal] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile sidebar state
  const [siteConfig, setSiteConfig] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    fetchCategories();
    (async () => {
      try {
        const res = await axios.get('/api/site-config');
        setSiteConfig(res.data);
      } catch {
        setSiteConfig(null);
      }
    })();

    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setPage(1);
    setProducts([]);
    fetchProducts(1, true);
  }, [selectedCategory, keyword]); // Refetch when category or keyword changes

  const fetchCategories = async () => {
    try {
      const response = await axios.get('/api/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchProducts = async (pageNum = 1, isReset = false) => {
    if (isReset) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = { page: pageNum, limit: 50 };
      // Global search: if keyword exists, ignore category
      if (keyword) {
        params.keyword = keyword;
      } else if (selectedCategory) {
        params.category = selectedCategory.category;
      }

      const response = await axios.get('/api/products', { params });
      let items = response.data.items || [];
      const total = response.data.totalItems || 0;
      
      // Client-side sorting for keyword search
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase();
        items.sort((a, b) => {
          const titleA = a.name || '';
          const titleB = b.name || '';
          
          // Helper function to calculate score
          const getScore = (title) => {
            if (title === keyword) return 3; // Exact case-sensitive match
            if (title.toLowerCase() === lowerKeyword) return 2; // Exact case-insensitive match
            if (title.includes(keyword)) return 1; // Partial case-sensitive match
            if (title.toLowerCase().includes(lowerKeyword)) return 0.5; // Partial case-insensitive match
            return 0; // No match
          };

          const scoreA = getScore(titleA);
          const scoreB = getScore(titleB);

          return scoreB - scoreA; // Descending order
        });
      }
      
      if (isReset) {
        setProducts(items);
      } else {
        setProducts(prev => [...prev, ...items]);
      }
      setTotalCount(total);
      setHasMore(items.length === 50);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      setPage(prev => prev + 1);
      fetchProducts(page + 1, false);
    }
  };

  const handleKeywordChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
  };

  const fetchProductDetail = async (id) => {
    try {
        const response = await axios.get(`/api/product/${id}`);
        setSelectedProduct(response.data);
        setActiveImageIndex(0);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error("Error fetching detail", error);
    }
  };

  const handleCategoryClick = (category) => {
    setSelectedCategory(category);
    setSelectedProduct(null);
    setActiveImageIndex(0);
    setKeyword(''); // Clear search when picking a category
    // setSearchInput(''); // Removed to keep the search input text
    setIsSidebarOpen(false); // Close sidebar on mobile selection
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top
  };

  const handleSearch = (e) => {
      e.preventDefault();
      setKeyword(searchInput);
      setSelectedCategory(null);
      setSelectedProduct(null);
      setActiveImageIndex(0);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderCategoryList = () => (
    <div className="flex-1 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
        <button
            onClick={() => handleCategoryClick(null)}
            className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-all duration-200 group border-l-4 ${
                !selectedCategory && !keyword
                ? 'bg-fluent-blue/20 text-white border-fluent-blue font-bold shadow-fluent-card'
                : 'text-gray-300 border-transparent hover:text-white hover:bg-white/10'
            }`}
        >
            <span className="font-medium tracking-wide">All Products</span>
            {(!selectedCategory && !keyword) && <ChevronRight size={16} className="text-fluent-blue" />}
        </button>
        
        {categories.map((cat) => (
            <button
                key={cat.category}
                onClick={() => handleCategoryClick(cat)}
                className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-all duration-200 group border-l-4 ${
                    selectedCategory?.category === cat.category
                    ? 'bg-fluent-blue/20 text-white border-fluent-blue font-bold shadow-fluent-card'
                    : 'text-gray-300 border-transparent hover:text-white hover:bg-white/10'
                }`}
            >
                <span className="font-medium tracking-wide truncate">{cat.category}</span>
                {selectedCategory?.category === cat.category && <ChevronRight size={16} className="text-fluent-blue" />}
            </button>
        ))}
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen relative">
      {/* Sticky Search Header */}
      <div className="sticky top-0 z-40 bg-fluent-bg/90 backdrop-blur-2xl border-b border-white/10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex gap-3 items-center">
            <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="md:hidden p-2.5 bg-fluent-surface/40 border border-white/10 text-white hover:bg-white/10 transition-colors"
            >
                <Filter size={20} />
            </button>
            <form onSubmit={handleSearch} className="flex-1 relative max-w-2xl">
                <input
                    type="text"
                    placeholder="Search premium components..."
                    value={searchInput}
                    onChange={handleKeywordChange}
                    className="w-full px-5 py-3 bg-fluent-surface/40 backdrop-blur-md border border-white/10 text-white text-sm transition-all focus:border-fluent-blue/50 focus:ring-2 focus:ring-fluent-blue/20 outline-none placeholder:text-fluent-text-tertiary focus:bg-fluent-surface/60 shadow-inner pr-20"
                />
                {searchInput && (
                    <button 
                        type="button" 
                        onClick={() => { setSearchInput(''); setKeyword(''); }} 
                        className="absolute right-12 top-3.5"
                    >
                        <X className="h-5 w-5 text-fluent-text-tertiary hover:text-white transition-colors" />
                    </button>
                )}
                <button type="submit" className="absolute right-4 top-3.5">
                    <Search className="h-5 w-5 text-fluent-text-tertiary hover:text-white transition-colors" />
                </button>
            </form>
        </div>

        {/* Mobile Sidebar (Categories) attached to bottom of sticky header */}
        <div className="md:hidden">
            {isSidebarOpen && (
                <div
                    className="absolute top-full inset-x-0 h-screen bg-black/60 backdrop-blur-sm z-40"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}
            <div className={`absolute top-full left-0 w-72 h-[calc(100vh-76px)] bg-fluent-surface/90 backdrop-blur-xl border-r border-white/10 shadow-fluent-flyout transform transition-transform duration-300 ease-in-out z-50 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-4 h-full flex flex-col pb-20">
                    {renderCategoryList()}
                </div>
            </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full flex flex-1 relative px-4 sm:px-6 lg:px-8 py-6">
      {/* Desktop Sidebar (Categories) */}
      <aside className="hidden md:block w-72 h-[calc(100vh-160px)] sticky top-28 bg-fluent-surface/20">
        <div className="p-6 h-full flex flex-col">
            <div className="mb-8">
                 <h2 className="text-2xl font-semibold text-white px-2 drop-shadow-md tracking-wide">Catalog</h2>
            </div>
            {renderCategoryList()}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full md:pl-8">
        {selectedProduct ? (
            // Product Detail View
            <div className="max-w-4xl mx-auto animate-fluent-enter">
                <button 
                    onClick={() => setSelectedProduct(null)}
                    className="mb-6 flex items-center text-fluent-blue hover:underline font-medium"
                >
                    <ChevronDown className="rotate-90 mr-1" size={20} />
                    Back to List
                </button>
                
                <div className="acrylic-card overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                        {/* Image Gallery */}
                        <div className="bg-fluent-surface/30 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/10">
                             {selectedProduct.images && selectedProduct.images.length > 0 ? (
                                <img 
                                    src={selectedProduct.images[activeImageIndex] || selectedProduct.images[0]} 
                                    alt={selectedProduct.name} 
                                    className="max-h-[300px] object-contain drop-shadow-2xl transition-transform duration-500 hover:scale-105"
                                />
                             ) : (
                                <div className="h-64 w-full bg-black/20 rounded-lg flex items-center justify-center text-fluent-text-tertiary">
                                    No Image
                                </div>
                             )}
                             <div className="mt-4 flex gap-2 overflow-x-auto w-full px-2 py-2">
                                 {selectedProduct.images?.map((img, idx) => (
                                     <img 
                                        key={idx} 
                                        src={img} 
                                        onClick={() => setActiveImageIndex(idx)}
                                        className={`w-16 h-16 object-cover rounded-md border cursor-pointer transition-all ${
                                            activeImageIndex === idx 
                                            ? 'border-fluent-blue ring-2 ring-fluent-blue shadow-fluent-hover' 
                                            : 'border-white/20 hover:ring-2 hover:ring-fluent-blue/50'
                                        }`} 
                                        alt=""
                                     />
                                 ))}
                             </div>
                        </div>

                        {/* Info */}
                        <div className="p-8 flex flex-col">
                            <div className="mb-auto">
                                <span className="inline-block px-3 py-1 rounded-full bg-fluent-blue/20 text-fluent-blue text-xs font-semibold mb-4 border border-fluent-blue/30">
                                    {selectedProduct.category}
                                </span>
                                <h1 className="text-3xl font-bold text-white mb-4">{selectedProduct.name}</h1>
                                <p className="text-fluent-text-secondary leading-relaxed mb-8">
                                    {selectedProduct.description || 'No description available for this product.'}
                                </p>
                            </div>
                            
                            <div className="space-y-4 mt-8 pt-8 border-t border-white/10">
                                <button 
                                    onClick={() => setShowWeChatModal(true)}
                                    className="w-full fluent-btn py-3 flex items-center justify-center gap-2 shadow-fluent-flyout hover:shadow-fluent-hover"
                                >
                                    <MessageCircle size={20} />
                                    {siteConfig?.wechatTitle || 'WeChat Inquiry'}
                                </button>
                                {selectedProduct.url && (
                                    <a 
                                        href={selectedProduct.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="block w-full text-center py-3 border border-white/20 rounded-md text-white font-medium hover:bg-white/10 transition-colors"
                                    >
                                        View Datasheet / Original Link
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        ) : (
            // Product List View
            <div className="max-w-6xl mx-auto animate-fluent-enter">
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-2xl font-semibold text-white">
                        {keyword ? `Search: "${keyword}"` : (selectedCategory?.category || 'All Products')}
                    </h2>
                    <span className="text-fluent-text-tertiary text-sm bg-fluent-surface/50 px-3 py-1 rounded-full border border-white/10 backdrop-blur-md">
                        {totalCount} Items
                    </span>
                </div>

                {loading ? (
                    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                        {[1,2,3,4,5,6,7,8].map(n => (
                            <div key={n} className="bg-fluent-surface/40 rounded-xl h-[280px] md:h-[320px] animate-pulse"></div>
                        ))}
                    </div>
                ) : products.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                        {products.map((product) => (
                          <div 
                            key={product.id}
                            onClick={() => fetchProductDetail(product.id)}
                            className="acrylic-card group cursor-pointer flex flex-col h-full hover:shadow-fluent-flyout border-transparent hover:border-white/60"
                          >
                            <div className="aspect-square p-4 md:p-6 bg-black/20 flex items-center justify-center border-b border-white/5 group-hover:bg-black/30 transition-colors">
                              {product.images && product.images.length > 0 ? (
                                <img 
                                  src={product.images[0]} 
                                  alt={product.name} 
                                  className="w-full h-full object-contain drop-shadow-2xl group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <div className="text-fluent-text-tertiary text-sm">No Image</div>
                              )}
                            </div>
                            <div className="p-4 md:p-5 flex flex-col flex-1">
                              <span className="text-[10px] md:text-xs text-fluent-text-tertiary mb-1 md:mb-2 uppercase tracking-wide font-semibold truncate">
                                {product.category}
                              </span>
                              <h3 className="text-sm md:text-base font-semibold text-fluent-text-primary mb-2 line-clamp-2 group-hover:text-fluent-blue transition-colors">
                                {product.name}
                              </h3>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Load More Button */}
                      {hasMore && (
                        <div className="mt-10 flex justify-center">
                            <button
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="fluent-btn px-8 py-3 text-sm flex items-center justify-center min-w-[200px]"
                            >
                                {loadingMore ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Loading...
                                    </div>
                                ) : (
                                    'Load More Products'
                                )}
                            </button>
                        </div>
                      )}
                    </>
                ) : (
                    <div className="text-center py-20 bg-fluent-surface/30 backdrop-blur-md rounded-xl border border-white/10 border-dashed">
                        <p className="text-fluent-text-tertiary text-lg">No products found.</p>
                        <button 
                            onClick={() => {setKeyword(''); setSearchInput(''); setSelectedCategory(null);}}
                            className="mt-4 text-fluent-blue hover:underline"
                        >
                            Clear filters
                        </button>
                    </div>
                )}
            </div>
        )}
      </main>
      </div>

      {/* WeChat Modal */}
      {showWeChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fluent-enter">
            <div className="bg-fluent-surface/90 backdrop-blur-2xl shadow-fluent-flyout max-w-sm w-full p-8 text-center relative border border-white/10">
                <button 
                    onClick={() => setShowWeChatModal(false)}
                    className="absolute top-4 right-4 text-fluent-text-tertiary hover:text-white hover:bg-white/10 p-1 transition-colors"
                >
                    <X size={20} />
                </button>
                
                <h3 className="text-xl font-bold mb-4 text-white">{siteConfig?.wechatTitle || 'Scan to Chat'}</h3>
                
                <div className="bg-white p-4 shadow-inner mb-6 mx-auto w-48 h-48 flex items-center justify-center border border-white/10">
                    {siteConfig?.wechatQrUrl ? (
                         <img src={siteConfig.wechatQrUrl} alt="WeChat QR" className="w-full h-full object-contain" />
                    ) : (
                         <div className="text-fluent-text-tertiary text-sm">QR Code Placeholder</div>
                    )}
                </div>
                
                <p className="text-fluent-text-secondary text-sm">
                    {siteConfig?.wechatHint || 'Scan the QR code with WeChat to contact our sales team directly.'}
                </p>
            </div>
        </div>
      )}

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-8 right-8 z-40 p-3 bg-fluent-blue/80 hover:bg-fluent-blue text-white rounded-full shadow-fluent-flyout backdrop-blur-md transition-all duration-300 animate-fluent-enter group"
          aria-label="Scroll to top"
        >
          <ArrowUp size={24} className="group-hover:-translate-y-1 transition-transform" />
        </button>
      )}
    </div>
  );
};

export default Products;
