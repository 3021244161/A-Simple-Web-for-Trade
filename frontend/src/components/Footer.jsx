import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-crown-dark text-slate-400 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <h3 className="text-white text-lg font-semibold">Haoguan Electrons</h3>
            <p className="text-sm mt-1">Your Trusted Global Partner for Electronic Components</p>
          </div>
          <div className="flex space-x-6 text-sm">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="/contact" className="hover:text-white transition-colors">Contact Us</a>
          </div>
        </div>
        <div className="mt-8 text-center text-xs border-t border-slate-700 pt-4">
          &copy; {new Date().getFullYear()} Crown Electronics. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
