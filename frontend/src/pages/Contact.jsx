import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Mail, Phone, MapPin, Send } from 'lucide-react';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [siteConfig, setSiteConfig] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/api/site-config');
        setSiteConfig(res.data);
      } catch {
        setSiteConfig(null);
      }
    })();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: '', message: '' });

    try {
      const response = await axios.post('/api/contact', formData);
      setStatus({ type: 'success', message: response.data.message });
      setFormData({ name: '', email: '', message: '' });
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Something went wrong. Please try again.';
      setStatus({ type: 'error', message: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-12 animate-fluent-enter">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-semibold text-center text-white mb-12 drop-shadow-md">Contact Us</h1>
        
        <div className="acrylic-card overflow-hidden flex flex-col md:flex-row shadow-fluent-flyout border-white/10">
          {/* Left Side (Contact Info) */}
          <div className="bg-fluent-blue/10 backdrop-blur-md p-10 md:w-1/3 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/10 border-l-2 border-l-fluent-blue shadow-[-15px_0_30px_-15px_rgba(59,130,246,0.3)]">
            <div>
              <h2 className="text-2xl font-semibold text-white mb-6">Get in Touch</h2>
              <p className="text-fluent-text-secondary mb-8 leading-relaxed">
                Have questions about our products or services? Reach out to us and we'll get back to you as soon as possible.
              </p>
              
              <div className="space-y-8">
                <div className="flex items-start space-x-4 group">
                  <div className="p-3 bg-fluent-surface/50 rounded-lg shadow-fluent-card border border-white/10 group-hover:scale-110 transition-transform">
                    <Phone className="w-5 h-5 text-fluent-blue" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white mb-1">Phone</h3>
                    <p className="text-fluent-text-secondary text-sm">{siteConfig?.phone || ''}</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4 group">
                  <div className="p-3 bg-fluent-surface/50 rounded-lg shadow-fluent-card border border-white/10 group-hover:scale-110 transition-transform">
                    <Mail className="w-5 h-5 text-fluent-blue" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white mb-1">Email</h3>
                    <p className="text-fluent-text-secondary text-sm">{siteConfig?.email || ''}</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4 group">
                    <div className="p-3 bg-fluent-surface/50 rounded-lg shadow-fluent-card border border-white/10 group-hover:scale-110 transition-transform">
                        <MapPin className="w-5 h-5 text-fluent-blue" />
                    </div>
                    <div>
                        <h3 className="font-medium text-white mb-1">Address</h3>
                        <p className="text-fluent-text-secondary text-sm whitespace-pre-line">{siteConfig?.address || ''}</p>
                    </div>
                </div>
              </div>
            </div>

            <div className="mt-12">
                <h3 className="font-medium mb-4 text-white">{siteConfig?.wechatTitle || 'Connect with WeChat'}</h3>
                <div className="bg-fluent-surface/50 p-3 w-32 h-32 rounded-xl shadow-fluent-card border border-white/10">
                    {siteConfig?.wechatQrUrl ? (
                      <img src={siteConfig.wechatQrUrl} alt="WeChat QR" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full bg-black/20 flex items-center justify-center text-fluent-text-tertiary text-xs text-center rounded-lg">
                          QR Code
                      </div>
                    )}
                </div>
            </div>
          </div>

          {/* Right Side (Form) */}
          <div className="p-10 md:w-2/3 bg-fluent-surface/30">
            <h2 className="text-2xl font-semibold text-white mb-6">Send us a Message</h2>
            
            {status.message && (
                <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 text-sm ${
                    status.type === 'success' 
                    ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}>
                    <div className={`w-2 h-2 rounded-full ${status.type === 'success' ? 'bg-green-400' : 'bg-red-400'}`} />
                    {status.message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-fluent-text-secondary mb-2">Name</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="fluent-input"
                    placeholder="Your Name"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-fluent-text-secondary mb-2">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="fluent-input"
                    placeholder="your@email.com"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-fluent-text-secondary mb-2">Message</label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows="5"
                  className="fluent-input resize-none"
                  placeholder="How can we help you?"
                  required
                ></textarea>
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="fluent-btn w-full md:w-auto px-8 py-3 shadow-fluent-flyout hover:shadow-fluent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? 'Sending...' : (
                    <>
                        Send Message
                        <Send size={18} />
                    </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
