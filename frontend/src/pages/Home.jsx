import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Zap, Globe, ShieldCheck } from 'lucide-react';

const Home = () => {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <div className="relative min-h-[600px] flex items-center justify-center overflow-hidden">
        {/* Animated Abstract Shapes */}
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-fluent-blue/20 rounded-full blur-[100px] animate-pulse z-0"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[100px] animate-pulse delay-1000 z-0"></div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center animate-fluent-enter">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 text-white drop-shadow-lg">
            Haoguan Electrons
          </h1>
          <p className="text-xl md:text-2xl text-fluent-text-secondary mb-10 font-light max-w-2xl mx-auto leading-relaxed drop-shadow-md">
            Your Trusted Global Partner for Electronic Components
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/products"
              className="fluent-btn px-8 py-3 text-lg h-auto shadow-fluent-flyout transition-all transform"
            >
              Explore Our Products
              <ArrowRight className="ml-2 h-5 w-5 inline-block" />
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
                <h2 className="text-3xl font-semibold text-white">Why Choose Us</h2>
                <p className="mt-4 text-lg text-fluent-text-secondary">Excellence in every component we deliver.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="acrylic-card p-8 flex flex-col items-center text-center group">
                    <div className="bg-fluent-blue/20 p-4 mb-6 group-hover:scale-110 transition-transform duration-300">
                        <Zap className="h-8 w-8 text-fluent-blue" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3 text-white">High Performance</h3>
                    <p className="text-fluent-text-secondary leading-relaxed">Top-tier components sourced directly from industry leaders to ensure maximum reliability.</p>
                </div>
                <div className="acrylic-card p-8 flex flex-col items-center text-center group">
                    <div className="bg-fluent-blue/20 p-4 mb-6 group-hover:scale-110 transition-transform duration-300">
                        <Globe className="h-8 w-8 text-fluent-blue" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3 text-white">Global Reach</h3>
                    <p className="text-fluent-text-secondary leading-relaxed">Seamless logistics network delivering to over 50 countries with real-time tracking.</p>
                </div>
                <div className="acrylic-card p-8 flex flex-col items-center text-center group">
                    <div className="bg-fluent-blue/20 p-4 mb-6 group-hover:scale-110 transition-transform duration-300">
                        <ShieldCheck className="h-8 w-8 text-fluent-blue" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3 text-white">Quality Assured</h3>
                    <p className="text-fluent-text-secondary leading-relaxed">Every batch undergoes rigorous ISO-standard testing before leaving our warehouse.</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
