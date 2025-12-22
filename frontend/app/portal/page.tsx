// frontend/app/portal/page.tsx
// Updated: Removed free trial button and testimonials (moved to main page)

"use client"

import React from 'react';
import { 
  Home, 
  LayoutDashboard, 
  FolderOpen, 
  FileText, 
  Download, 
  Bell,
  CreditCard,
  Zap,
  Shield,
  Users,
  ArrowRight,
  CheckCircle
} from 'lucide-react';

const CustomerPortalPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/10">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <a href="/" className="flex items-center space-x-2">
              <Home className="w-8 h-8 text-blue-400" />
              <span className="text-2xl font-bold text-white">Layout<span className="text-blue-400">AI</span></span>
            </a>
            
            <a href="/" className="text-gray-300 hover:text-white transition text-sm">
              ← Back to Home
            </a>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-blue-500/20 border border-blue-400/30 rounded-full">
              <LayoutDashboard className="w-5 h-5 text-blue-400" />
              <span className="text-blue-300 font-medium">Customer Portal</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
              Your Floor Plan <span className="text-blue-400">Command Center</span>
            </h1>
            
            <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
              Manage all your projects, generate AI floor plans, download files, and track your orders - 
              all in one powerful dashboard designed for Australian builders.
            </p>

            {/* CTA Buttons - Sign In and Sign Up */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <a 
                href="/auth/signin"
                className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-xl hover:bg-gray-100 transition font-semibold text-lg shadow-lg shadow-white/20"
              >
                Sign In
                <ArrowRight className="w-5 h-5" />
              </a>
              <a 
                href="/auth/signup"
                className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 transition font-semibold text-lg border border-blue-500"
              >
                Create Account
              </a>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-gray-400 text-sm">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-400" />
                <span>Secure & Encrypted</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span>Instant Access</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span>500+ Builders Trust Us</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Portal Features Grid */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Everything You Need in One Place</h2>
            <p className="text-gray-400">Powerful tools to streamline your floor plan workflow</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature Card 1 - Dashboard */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition group">
              <div className="w-14 h-14 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/30 transition">
                <LayoutDashboard className="w-7 h-7 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Interactive Dashboard</h3>
              <p className="text-gray-400 text-sm">
                Get a bird's eye view of all your projects, statistics, and recent activity. 
                Track project status from draft to completion at a glance.
              </p>
            </div>

            {/* Feature Card 2 - Project Management */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition group">
              <div className="w-14 h-14 bg-green-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-500/30 transition">
                <FolderOpen className="w-7 h-7 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Project Management</h3>
              <p className="text-gray-400 text-sm">
                Create unlimited projects, organize them by client or location, 
                and manage every detail of your floor plan requirements.
              </p>
            </div>

            {/* Feature Card 3 - AI Generation */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition group">
              <div className="w-14 h-14 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-500/30 transition">
                <Zap className="w-7 h-7 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">AI Floor Plan Generation</h3>
              <p className="text-gray-400 text-sm">
                Answer a quick questionnaire and let our AI generate 3-5 unique, 
                NCC-compliant floor plan options tailored to your block.
              </p>
            </div>

            {/* Feature Card 4 - Downloads */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition group">
              <div className="w-14 h-14 bg-orange-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-orange-500/30 transition">
                <Download className="w-7 h-7 text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Multi-Format Downloads</h3>
              <p className="text-gray-400 text-sm">
                Download your floor plans in PDF for presentations, DXF for AutoCAD editing, 
                or 3D renders for client visualizations.
              </p>
            </div>

            {/* Feature Card 5 - Compliance */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition group">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-500/30 transition">
                <FileText className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Compliance Reports</h3>
              <p className="text-gray-400 text-sm">
                Generate detailed compliance reports showing NCC adherence, 
                setbacks, and council requirements - ready for submission.
              </p>
            </div>

            {/* Feature Card 6 - Billing */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition group">
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

      {/* Dashboard Preview Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
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
                <a 
                  href="/auth/signup"
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
                >
                  Create Account
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a 
                  href="/auth/signin"
                  className="inline-flex items-center justify-center gap-2 bg-white/10 text-white px-6 py-3 rounded-lg hover:bg-white/20 transition font-semibold border border-white/20"
                >
                  Sign In to Dashboard
                </a>
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

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-gray-300 mb-10">
            Join 500+ Australian builders who are saving time and winning more projects with Layout AI.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="/auth/signup"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 transition font-semibold text-lg"
            >
              Create Account
              <ArrowRight className="w-5 h-5" />
            </a>
            <a 
              href="/auth/signin"
              className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-xl hover:bg-gray-100 transition font-semibold text-lg"
            >
              Sign In
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Home className="w-6 h-6 text-blue-400" />
            <span className="text-white font-semibold">LayoutAI</span>
          </div>
          <p className="text-gray-500 text-sm">
            © 2026 LayoutAI. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="#" className="hover:text-white transition">Privacy</a>
            <a href="#" className="hover:text-white transition">Terms</a>
            <a href="#" className="hover:text-white transition">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default CustomerPortalPage;
