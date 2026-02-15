// frontend/app/page.tsx
// Merged: Portal page content integrated into main landing page
// All sign-in/sign-up actions now open popup modal instead of navigating away

"use client"

import React, { useState } from 'react';
import { 
  Home, 
  Ruler, 
  Zap, 
  Shield, 
  DollarSign, 
  CheckCircle, 
  Menu, 
  X, 
  ArrowRight,
  Star,
  Users,
  Clock,
  FileText,
  LayoutDashboard,
  FolderOpen,
  Download,
  Bell,
  CreditCard
} from 'lucide-react';
import AuthModal from '@/components/AuthModal';

const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const openAuth = (mode: 'signin' | 'signup') => {
    setMobileMenuOpen(false);
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleWaitlist = () => {
    if (email) {
      alert(`Thanks! We'll contact you at ${email} when we launch.`);
      setEmail('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="fixed top-0 w-full bg-slate-900/80 backdrop-blur-md border-b border-white/10 z-50">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Home className="w-8 h-8 text-blue-400" />
              <span className="text-2xl font-bold text-white">Layout<span className="text-blue-400">AI</span></span>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-300 hover:text-white transition">Features</a>
              <a href="#how-it-works" className="text-gray-300 hover:text-white transition">How It Works</a>
              <a href="#pricing" className="text-gray-300 hover:text-white transition">Pricing</a>
              <a href="#reviews" className="text-gray-300 hover:text-white transition">Reviews</a>
              <button 
                onClick={() => openAuth('signin')}
                className="text-gray-300 hover:text-white transition font-medium"
              >
                Sign In
              </button>
              <button 
                onClick={() => openAuth('signup')}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Get Started
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 space-y-3 border-t border-white/10">
              <a href="#features" className="block py-2 text-gray-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Features</a>
              <a href="#how-it-works" className="block py-2 text-gray-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>How It Works</a>
              <a href="#pricing" className="block py-2 text-gray-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
              <a href="#reviews" className="block py-2 text-gray-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Reviews</a>
              <button 
                onClick={() => openAuth('signin')}
                className="block w-full text-left py-2 text-gray-300 hover:text-white"
              >
                Sign In
              </button>
              <button 
                onClick={() => openAuth('signup')}
                className="block w-full bg-blue-600 text-white px-6 py-2 rounded-lg text-center mt-4"
              >
                Get Started
              </button>
            </div>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
        
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-blue-500/20 border border-blue-400/30 rounded-full">
              <span className="text-2xl">🇦🇺</span>
              <span className="text-blue-300 font-medium">Australian Building Code Compliant</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              Generate Professional Floor Plans in <span className="text-blue-400">Minutes</span>
            </h1>
            
            <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
              AI-powered floor plan generation for Australian builders. From land survey to compliant designs, 
              all automated and ready for council approval.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <button 
                onClick={() => openAuth('signup')}
                className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 transition font-semibold text-lg cursor-pointer"
              >
                Create Account
                <ArrowRight className="w-5 h-5" />
              </button>
              <button 
                onClick={() => openAuth('signin')}
                className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-xl hover:bg-gray-100 transition font-semibold text-lg shadow-lg shadow-white/20 cursor-pointer"
              >
                Sign In
              </button>
            </div>

            {/* Email Signup */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto mb-8">
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email for updates" 
                className="flex-1 px-6 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button 
                onClick={handleWaitlist}
                className="bg-white/10 text-white px-8 py-4 rounded-xl hover:bg-white/20 transition font-semibold whitespace-nowrap border border-white/20"
              >
                Join Waitlist
              </button>
            </div>
            
            <p className="text-gray-400 text-sm mb-12">🚀 Launching February 2026 • 200+ builders already registered</p>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center justify-center gap-8 text-gray-400">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-400" />
                <span>NCC Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                <span>3-Minute Generation</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                <span>500+ Builders Trust Us</span>
              </div>
            </div>
          </div>

          {/* Hero Image/Preview */}
          <div className="mt-20 relative">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 border border-white/10 shadow-2xl">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-4 text-gray-400 text-sm">Layout AI Dashboard</span>
              </div>
              <div className="aspect-video bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl flex items-center justify-center border border-white/5">
                <div className="text-center">
                  <Home className="w-20 h-20 text-blue-400/50 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">Interactive Demo Coming Soon</p>
                  <p className="text-gray-500 text-sm mt-2">See floor plans generated in real-time</p>
                </div>
              </div>
            </div>
            
            {/* Floating elements */}
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-blue-500/30 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-purple-500/30 rounded-full blur-2xl"></div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 bg-black/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Everything You Need</h2>
            <p className="text-xl text-gray-400">Purpose-built for Australian builders and developers</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition group">
              <div className="w-14 h-14 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/30 transition">
                <Zap className="w-7 h-7 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Lightning Fast</h3>
              <p className="text-gray-400">Generate compliant floor plans in under 3 minutes. No more waiting days for drafts.</p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-green-500/50 transition group">
              <div className="w-14 h-14 bg-green-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-500/30 transition">
                <Shield className="w-7 h-7 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Code Compliant</h3>
              <p className="text-gray-400">Automatically validates against NCC, state regulations, and local council requirements.</p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-purple-500/50 transition group">
              <div className="w-14 h-14 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-500/30 transition">
                <Ruler className="w-7 h-7 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Fully Customizable</h3>
              <p className="text-gray-400">Adjust room sizes, layouts, and facades. Export to DXF for further editing in AutoCAD.</p>
            </div>

            {/* Feature 4 */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-orange-500/50 transition group">
              <div className="w-14 h-14 bg-orange-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-orange-500/30 transition">
                <Home className="w-7 h-7 text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Multiple Designs</h3>
              <p className="text-gray-400">Get 3-5 unique layout options for every block. Show clients real choices instantly.</p>
            </div>

            {/* Feature 5 */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-pink-500/50 transition group">
              <div className="w-14 h-14 bg-pink-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-pink-500/30 transition">
                <FileText className="w-7 h-7 text-pink-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Professional Quality</h3>
              <p className="text-gray-400">Export to PDF, DXF, and 3D models. Ready for council submission or client presentation.</p>
            </div>

            {/* Feature 6 */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-yellow-500/50 transition group">
              <div className="w-14 h-14 bg-yellow-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-yellow-500/30 transition">
                <DollarSign className="w-7 h-7 text-yellow-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Cost Effective</h3>
              <p className="text-gray-400">From $99 per plan vs $500-2000 for traditional drafting. Save thousands per project.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-xl text-gray-400">From land survey to completed floor plan in 4 simple steps</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { num: "1", title: "Upload Land Details", desc: "Upload your contour plan or enter block dimensions manually", color: "blue" },
              { num: "2", title: "Answer Questions", desc: "Tell us about bedrooms, bathrooms, living areas, and style preferences", color: "purple" },
              { num: "3", title: "AI Generation", desc: "Our AI creates 3-5 compliant floor plan options tailored to your block", color: "green" },
              { num: "4", title: "Download & Use", desc: "Get PDF, DXF, and 3D files ready for council or client presentation", color: "orange" }
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 h-full">
                  <div className={`w-14 h-14 bg-${step.color}-500/20 rounded-full flex items-center justify-center text-2xl font-bold text-${step.color}-400 mb-4`}>
                    {step.num}
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-gray-400 text-sm">{step.desc}</p>
                </div>
                {idx < 3 && (
                  <ArrowRight className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2 text-blue-400/50 w-8 h-8" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard Preview Section (from Portal) */}
      <section id="dashboard" className="py-24 px-4 sm:px-6 lg:px-8 bg-black/20">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-blue-500/20 border border-blue-400/30 rounded-full">
                <LayoutDashboard className="w-5 h-5 text-blue-400" />
                <span className="text-blue-300 font-medium">Your Command Center</span>
              </div>

              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                A Dashboard Built for <span className="text-blue-400">Productivity</span>
              </h2>
              <p className="text-gray-300 mb-8 text-lg">
                Every feature is designed to save you time and help you win more projects. 
                From quick project creation to instant plan generation.
              </p>
              
              <ul className="space-y-4">
                {[
                  "Create a new project in under 30 seconds",
                  "Generate AI floor plans with a simple questionnaire",
                  "Compare 3-5 design options side by side",
                  "Download council-ready documentation instantly",
                  "Track all your projects and orders in real-time",
                  "Access from any device - desktop, tablet, or mobile"
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-300">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={() => openAuth('signup')}
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold cursor-pointer"
                >
                  Create Account
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => openAuth('signin')}
                  className="inline-flex items-center justify-center gap-2 bg-white/10 text-white px-6 py-3 rounded-lg hover:bg-white/20 transition font-semibold border border-white/20 cursor-pointer"
                >
                  Sign In to Dashboard
                </button>
              </div>
            </div>

            {/* Dashboard Preview Mockup */}
            <div className="relative">
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 border border-white/10 shadow-2xl">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <Home className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-white font-semibold">Welcome back, Builder!</p>
                        <p className="text-gray-400 text-sm">3 active projects</p>
                      </div>
                    </div>
                    <Bell className="w-5 h-5 text-gray-400" />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Projects", value: "12" },
                      { label: "Completed", value: "8" },
                      { label: "Plans", value: "24" },
                    ].map((stat, idx) => (
                      <div key={idx} className="bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-white">{stat.value}</p>
                        <p className="text-xs text-gray-400">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Recent Projects */}
                  <div className="space-y-2">
                    <p className="text-gray-400 text-sm font-medium">Recent Projects</p>
                    {[
                      { name: "Smith Residence", status: "Completed", color: "bg-green-500" },
                      { name: "Oakwood Duplex", status: "In Progress", color: "bg-blue-500" },
                      { name: "Riverside Villa", status: "Draft", color: "bg-yellow-500" },
                    ].map((project, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                        <span className="text-white text-sm">{project.name}</span>
                        <span className={`${project.color} text-white text-xs px-2 py-1 rounded`}>
                          {project.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Decorative */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-blue-500/20 rounded-full blur-2xl"></div>
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Portal Features Grid (from Portal) */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Powerful Tools in One Place</h2>
            <p className="text-xl text-gray-400">Streamline your entire floor plan workflow</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition group">
              <div className="w-14 h-14 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/30 transition">
                <LayoutDashboard className="w-7 h-7 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Interactive Dashboard</h3>
              <p className="text-gray-400 text-sm">
                Get a bird&apos;s eye view of all your projects, statistics, and recent activity. 
                Track project status from draft to completion at a glance.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-green-500/50 transition group">
              <div className="w-14 h-14 bg-green-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-500/30 transition">
                <FolderOpen className="w-7 h-7 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Project Management</h3>
              <p className="text-gray-400 text-sm">
                Create unlimited projects, organize them by client or location, 
                and manage every detail of your floor plan requirements.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-purple-500/50 transition group">
              <div className="w-14 h-14 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-500/30 transition">
                <Zap className="w-7 h-7 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">AI Floor Plan Generation</h3>
              <p className="text-gray-400 text-sm">
                Answer a quick questionnaire and let our AI generate 3-5 unique, 
                NCC-compliant floor plan options tailored to your block.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-orange-500/50 transition group">
              <div className="w-14 h-14 bg-orange-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-orange-500/30 transition">
                <Download className="w-7 h-7 text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Multi-Format Downloads</h3>
              <p className="text-gray-400 text-sm">
                Download your floor plans in PDF for presentations, DXF for AutoCAD editing, 
                or 3D renders for client visualizations.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-emerald-500/50 transition group">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-500/30 transition">
                <FileText className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Compliance Reports</h3>
              <p className="text-gray-400 text-sm">
                Generate detailed compliance reports showing NCC adherence, 
                setbacks, and council requirements - ready for submission.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-pink-500/50 transition group">
              <div className="w-14 h-14 bg-pink-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-pink-500/30 transition">
                <CreditCard className="w-7 h-7 text-pink-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Easy Billing & Invoices</h3>
              <p className="text-gray-400 text-sm">
                Secure payments with instant receipts. View payment history, 
                download invoices, and manage your subscription all in one place.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 bg-black/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-gray-400">Pay per plan or choose a subscription for high-volume builders</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Basic Plan */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:border-blue-500/50 transition">
              <h3 className="text-2xl font-bold text-white mb-2">Basic</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold text-white">$99</span>
                <span className="text-gray-400">/plan</span>
              </div>
              <ul className="space-y-4 mb-8">
                {["1 floor plan design", "2 revision rounds", "PDF export", "Basic compliance check"].map((item, idx) => (
                  <li key={idx} className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-300">{item}</span>
                  </li>
                ))}
              </ul>
              <button 
                onClick={() => openAuth('signup')}
                className="block w-full bg-white/10 text-white py-3 rounded-xl hover:bg-white/20 transition text-center font-semibold border border-white/20 cursor-pointer"
              >
                Get Started
              </button>
            </div>

            {/* Standard Plan - Popular */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-8 border border-blue-500 relative transform md:scale-105 shadow-2xl shadow-blue-500/20">
              <div className="absolute top-0 right-6 bg-yellow-400 text-gray-900 px-4 py-1 rounded-b-lg text-sm font-bold">
                Popular
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Standard</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold text-white">$199</span>
                <span className="text-blue-200">/plan</span>
              </div>
              <ul className="space-y-4 mb-8">
                {["3 floor plan options", "5 revision rounds", "PDF + DXF export", "Facade design included", "Full compliance report"].map((item, idx) => (
                  <li key={idx} className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-blue-200 mr-3 mt-0.5 flex-shrink-0" />
                    <span className="text-white">{item}</span>
                  </li>
                ))}
              </ul>
              <button 
                onClick={() => openAuth('signup')}
                className="block w-full bg-white text-blue-600 py-3 rounded-xl hover:bg-gray-100 transition text-center font-semibold cursor-pointer"
              >
                Get Started
              </button>
            </div>

            {/* Enterprise Plan */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:border-blue-500/50 transition">
              <h3 className="text-2xl font-bold text-white mb-2">Enterprise</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold text-white">$299</span>
                <span className="text-gray-400">/month</span>
              </div>
              <ul className="space-y-4 mb-8">
                {["5 plans included", "$49 per additional plan", "3D renders included", "Priority support", "API access"].map((item, idx) => (
                  <li key={idx} className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-300">{item}</span>
                  </li>
                ))}
              </ul>
              <button 
                onClick={() => alert('Please contact sales@layout-ai.com.au for enterprise pricing')}
                className="w-full bg-white/10 text-white py-3 rounded-xl hover:bg-white/20 transition font-semibold border border-white/20"
              >
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      <section id="reviews" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Trusted by Australian Builders</h2>
            <p className="text-xl text-gray-400">See what our customers are saying</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote: "The dashboard is incredibly intuitive. I created my first project and had floor plans in under 10 minutes.",
                name: "Michael Thompson",
                role: "Builder, Sydney",
                rating: 5
              },
              {
                quote: "Being able to download DXF files directly saves me hours. The compliance reports are a game-changer for council submissions.",
                name: "Sarah Mitchell",
                role: "Project Manager, Melbourne",
                rating: 5
              },
              {
                quote: "My clients love seeing multiple options instantly. It's helped me win 3 projects in the last month alone.",
                name: "David Chen",
                role: "Developer, Brisbane",
                rating: 5
              }
            ].map((testimonial, idx) => (
              <div key={idx} className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:border-blue-500/30 transition">
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-300 mb-6 text-lg">&quot;{testimonial.quote}&quot;</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <span className="text-blue-400 font-semibold text-lg">{testimonial.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">{testimonial.name}</p>
                    <p className="text-gray-500 text-sm">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Ready to Transform Your Design Process?</h2>
          <p className="text-xl mb-10 text-blue-100">
            Join hundreds of Australian builders already using AI to win more projects
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => openAuth('signup')}
              className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-xl hover:bg-gray-100 transition font-semibold text-lg cursor-pointer"
            >
              Create Account
              <ArrowRight className="w-5 h-5" />
            </button>
            <button 
              onClick={() => openAuth('signin')}
              className="inline-flex items-center justify-center gap-2 bg-transparent text-white px-8 py-4 rounded-xl hover:bg-white/10 transition font-semibold text-lg border-2 border-white cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-white/10 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Home className="w-6 h-6 text-blue-400" />
                <span className="text-xl font-bold text-white">LayoutAI</span>
              </div>
              <p className="text-gray-400 text-sm">AI-powered floor plans for Australian builders</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#features" className="hover:text-white transition">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Pricing</a></li>
                <li>
                  <button onClick={() => openAuth('signin')} className="hover:text-white transition">
                    Dashboard
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition">About</a></li>
                <li><a href="#" className="hover:text-white transition">Blog</a></li>
                <li><a href="#" className="hover:text-white transition">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition">Terms</a></li>
                <li><a href="#" className="hover:text-white transition">Disclaimer</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 text-sm text-center text-gray-500">
            <p>© 2026 LayoutAI. All rights reserved. Designs require professional certification.</p>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        mode={authMode}
        onSwitchMode={(mode) => setAuthMode(mode)}
      />
    </div>
  );
};

export default LandingPage;
