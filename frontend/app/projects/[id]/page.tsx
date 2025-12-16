import ProjectDetailClient from './ProjectDetailClient';

// This function is required for static export with dynamic routes
export async function generateStaticParams() {
  // Return empty array - all routes will be handled client-side
  // Azure SWA will handle the routing
  return [];
}

export default function ProjectDetailPage() {
  return <ProjectDetailClient />;
}
