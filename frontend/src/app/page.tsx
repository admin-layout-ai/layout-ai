export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="text-center px-4">
        <h1 className="text-7xl font-bold text-gray-900 mb-4">
          Layout<span className="text-blue-600">AI</span>
        </h1>
        <p className="text-2xl text-gray-600 mb-8 max-w-2xl mx-auto">
          AI-powered floor plan generation for Australian builders
        </p>
        <div className="text-lg text-gray-500 mb-12">
          Generate compliant floor plans in minutes, not days
        </div>
        <div className="flex gap-4 justify-center">
          <a 
            href="/dashboard" 
            className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 font-semibold text-lg shadow-lg hover:shadow-xl transition"
          >
            Get Started →
          </a>
          <a 
            href="/dashboard/projects" 
            className="bg-white text-gray-700 px-8 py-4 rounded-lg hover:bg-gray-50 font-semibold text-lg shadow-md border-2 border-gray-200 transition"
          >
            View Projects
          </a>
        </div>
      </div>
    </div>
  );
}