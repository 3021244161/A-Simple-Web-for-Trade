import React from 'react';

const About = () => {
  return (
    <div className="min-h-screen py-12 animate-fluent-enter">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
            <h1 className="text-4xl font-semibold text-white mb-6 drop-shadow-md">About Haoguan Electrons</h1>
            <div className="w-24 h-1 bg-fluent-blue mx-auto rounded-full shadow-fluent-card"></div>
        </div>
        
        <div className="acrylic-card p-10 md:p-14 border-l-2 border-r-2 border-t-0 border-b-0 border-fluent-blue shadow-[0_0_15px_rgba(59,130,246,0.3)]">
            <div className="prose prose-lg text-white max-w-none font-light">
                <p className="mb-8 leading-relaxed">
                    <span className="font-semibold text-white tracking-wide">Haoguan Electrons</span> is a leading distributor of electronic components, dedicated to serving the global electronics industry. 
                    With years of experience, we have established a strong reputation for reliability, quality, and customer service.
                </p>
                <p className="mb-8 leading-relaxed">
                    Our mission is to provide engineers, designers, and manufacturers with easy access to the components they need to innovate and build the future. 
                    We stock a wide range of products, from semiconductors and passive components to electromechanical parts and development boards.
                </p>
                <p className="leading-relaxed">
                    We pride ourselves on our technical expertise and our ability to support our customers throughout their product development lifecycle. 
                    Whether you are a hobbyist working on a personal project or a large corporation developing a mass-market product, Haoguan Electrons is here to help you succeed.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default About;
