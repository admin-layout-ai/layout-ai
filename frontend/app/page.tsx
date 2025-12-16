"use client"

import React, { useState } from 'react';
import { Home, Ruler, Zap, Shield, DollarSign, CheckCircle, Menu, X, ArrowRight } from 'lucide-react';

const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [email, setEmail] = useState('');

  const handleWaitlist = () => {
    if (email) {
      alert(`Thanks! We'll contact you at ${email} when we launch.`);
      setEmail('');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 w-full bg-white/95 backdrop-blur-sm border-b border-gray-200 z-50">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Home className="w-8 h-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">Layout<span className="text-blue-600">AI</span></span>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-700 hover:text-blue-600 transition">Features</a>
              <a href="#how-it-works" className="text-gray-700 hover:text-blue-600 transition">How It Works</a>
              <a href="#pricing" className="text-gray-700 hover:text-blue-600 transition">Pricing</a>
              <a 
                href="/dashboard"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Get Started
              </a>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 space-y-3">
              <a href="#features" className="block py-2 text-gray-700">Features</a>
              <a href="#how-it-works" className="block py-2 text-gray-700">How It Works</a>
              <a href="#pricing" className="block py-2 text-gray-700">Pricing</a>
              <a 
                href="/dashboard"
                className="block w-full bg-blue-600 text-white px-6 py-2 rounded-lg text-center"
              >
                Get Started
              </a>
            </div>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-block mb-4 px-4 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
              🇦🇺 Australian Building Code Compliant
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Generate Professional Floor Plans in Minutes
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              AI-powered floor plan generation for Australian builders. From land survey to compliant designs, 
              all automated and ready for council approval.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-6">
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email" 
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button 
                onClick={handleWaitlist}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition font-medium whitespace-nowrap"
              >
                Join Waitlist
              </button>
            </div>
            <p className="text-sm text-gray-500">🚀 Launching February 2026 • 200+ builders already registered</p>
          </div>

          {/* Hero Image Placeholder */}
          <div className="mt-16 relative">
            <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl shadow-2xl p-8 h-96 flex items-center justify-center border border-gray-300">
              <div className="text-center">
                <Home className="w-24 h-24 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">Interactive Demo Coming Soon</p>
                <p className="text-gray-500 text-sm mt-2">See floor plans generated in real-time</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Everything You Need</h2>
            <p className="text-xl text-gray-600">Purpose-built for Australian builders and developers</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 bg-white rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Lightning Fast</h3>
              <p className="text-gray-600">Generate compliant floor plans in under 3 minutes. No more waiting days for drafts.</p>
            </div>

            <div className="p-6 bg-white rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Code Compliant</h3>
              <p className="text-gray-600">Automatically validates against NCC, state regulations, and local council requirements.</p>
            </div>

            <div className="p-6 bg-white rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Ruler className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Fully Customizable</h3>
              <p className="text-gray-600">Adjust room sizes, layouts, and facades. Export to DXF for further editing in AutoCAD.</p>
            </div>

            <div className="p-6 bg-white rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                <Home className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Multiple Designs</h3>
              <p className="text-gray-600">Get 3-5 unique layout options for every block. Show clients real choices instantly.</p>
            </div>

            <div className="p-6 bg-white rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-pink-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Professional Quality</h3>
              <p className="text-gray-600">Export to PDF, DXF, and 3D models. Ready for council submission or client presentation.</p>
            </div>

            <div className="p-6 bg-white rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                <DollarSign className="w-6 h-6 text-yellow-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Cost Effective</h3>
              <p className="text-gray-600">From $99 per plan vs $500-2000 for traditional drafting. Save thousands per project.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-xl text-gray-600">From land survey to completed floor plan in 4 simple steps</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { num: "1", title: "Upload Land Details", desc: "Upload your contour plan or enter block dimensions manually" },
              { num: "2", title: "Answer Questions", desc: "Tell us about bedrooms, bathrooms, living areas, and style preferences" },
              { num: "3", title: "AI Generation", desc: "Our AI creates 3-5 compliant floor plan options tailored to your block" },
              { num: "4", title: "Download & Use", desc: "Get PDF, DXF, and 3D files ready for council or client presentation" }
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mb-4">
                    {step.num}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-sm">{step.desc}</p>
                </div>
                {idx < 3 && (
                  <ArrowRight className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 text-blue-600 w-8 h-8" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-gray-600">Pay per plan or choose a subscription for high-volume builders</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-xl p-8 border-2 border-gray-200 hover:border-blue-500 transition">
              <h3 className="text-2xl font-bold mb-2">Basic</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">$99</span>
                <span className="text-gray-600">/plan</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">1 floor plan design</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">2 revision rounds</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">PDF export</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Basic compliance check</span>
                </li>
              </ul>
              <a 
                href="/dashboard"
                className="block w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition text-center"
              >
                Get Started
              </a>
            </div>

            <div className="bg-blue-600 text-white rounded-xl p-8 border-2 border-blue-600 relative transform md:scale-105 shadow-xl">
              <div className="absolute top-0 right-6 bg-yellow-400 text-gray-900 px-4 py-1 rounded-b-lg text-sm font-bold">
                Popular
              </div>
              <h3 className="text-2xl font-bold mb-2">Standard</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">$199</span>
                <span className="text-blue-100">/plan</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-blue-200 mr-2 mt-0.5 flex-shrink-0" />
                  <span>3 floor plan options</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-blue-200 mr-2 mt-0.5 flex-shrink-0" />
                  <span>5 revision rounds</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-blue-200 mr-2 mt-0.5 flex-shrink-0" />
                  <span>PDF + DXF export</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-blue-200 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Facade design included</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-blue-200 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Full compliance report</span>
                </li>
              </ul>
              <a 
                href="/dashboard"
                className="block w-full bg-white text-blue-600 py-3 rounded-lg hover:bg-gray-100 transition font-semibold text-center"
              >
                Get Started
              </a>
            </div>

            <div className="bg-white rounded-xl p-8 border-2 border-gray-200 hover:border-blue-500 transition">
              <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">$299</span>
                <span className="text-gray-600">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">5 plans included</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">$49 per additional plan</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">3D renders included</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Priority support</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">API access</span>
                </li>
              </ul>
              <button 
                onClick={() => alert('Please contact sales@layoutai.com for enterprise pricing')}
                className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition"
              >
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-blue-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to Transform Your Design Process?</h2>
          <p className="text-xl mb-8 text-blue-100">
            Join hundreds of Australian builders already using AI to win more projects
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="/dashboard"
              className="bg-white text-blue-600 px-8 py-3 rounded-lg hover:bg-gray-100 transition font-semibold"
            >
              Start Free Trial
            </a>
            <button 
              onClick={() => alert('Book a demo at demo@layoutai.com')}
              className="border-2 border-white text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
            >
              Book a Demo
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Home className="w-6 h-6 text-blue-500" />
                <span className="text-xl font-bold text-white">LayoutAI</span>
              </div>
              <p className="text-sm">AI-powered floor plans for Australian builders</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Pricing</a></li>
                <li><a href="/dashboard" className="hover:text-white transition">Dashboard</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">About</a></li>
                <li><a href="#" className="hover:text-white transition">Blog</a></li>
                <li><a href="#" className="hover:text-white transition">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition">Terms</a></li>
                <li><a href="#" className="hover:text-white transition">Disclaimer</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-sm text-center">
            <p>© 2026 LayoutAI. All rights reserved. Designs require professional certification.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
